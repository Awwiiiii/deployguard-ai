"""Human-operated, staged demo of existing tools; never issues approvals or starts services."""

import json
import subprocess
import sys
from pathlib import Path

import httpx

try:
    from ._common import parser, run
except ImportError:
    from _common import parser, run

from app.models import BAD_RELEASE, DomainError, GOOD_RELEASE

ROOT = Path(__file__).resolve().parents[1]
API_URL = "http://127.0.0.1:8001"
CHECKS = {"version", "health", "checkout", "audit", "persisted_deployment"}


def require(condition, message):
    if not condition:
        raise DomainError("demo_precondition_failed", message, 400)


def command(db, tool, *arguments, expected=(0,)):
    """Invoke fixed project tools with argument lists, never a shell."""
    argv = [sys.executable, str(ROOT / "tools" / tool)]
    if db:
        argv.extend(["--db", db])
    result = subprocess.run(argv + list(arguments), cwd=ROOT, capture_output=True,
                            text=True, timeout=60, check=False)
    payload = json.loads(result.stdout)
    if result.returncode not in expected:
        raise DomainError("demo_command_failed", f"{tool} failed; inspect this tool separately")
    return result.returncode, payload


def snapshot(db, incident_id=None):
    arguments = ("--incident-id", incident_id) if incident_id else ()
    return command(db, "incident.py", *arguments)[1]


def probe(client, method, endpoint, expected_status):
    response = client.request(method, endpoint,
                              **({"json": {"quantity": 1}} if method == "POST" else {}))
    require(response.status_code == expected_status,
            f"Unexpected HTTP status from {endpoint}; stop and inspect local state")
    return {"http_status": response.status_code, "body": response.json()}


def matching_api(client, state):
    version = probe(client, "GET", "/version", 200)
    active = state["active_deployment"]
    require(version["body"]["deployment_id"] == active["id"]
            and version["body"]["version"] == active["version"],
            "API and tools must use the same database/deployment on port 8001")


def prepare(db, client):
    state = snapshot(db)
    require(state["active_deployment"]["version"] == GOOD_RELEASE,
            "Prepare requires v1.0.0; complete any previous approved recovery first")
    matching_api(client, state)
    healthy = {"health": probe(client, "GET", "/health", 200),
               "checkout": probe(client, "POST", "/checkout", 200)}
    require(healthy["health"]["body"]["status"] == "healthy"
            and healthy["checkout"]["body"]["status"] == "success"
            and all(item["body"]["version"] == GOOD_RELEASE for item in healthy.values()),
            "Expected measured healthy v1.0.0 before fault activation")
    _, activation = command(db, "reset_demo.py", "--release", BAD_RELEASE)
    matching_api(client, snapshot(db))
    failed = {"checkout": probe(client, "POST", "/checkout", 500),
              "health": probe(client, "GET", "/health", 503)}
    incident_id = failed["checkout"]["body"]["incident_id"]
    require(failed["health"]["body"]["incident_id"] == incident_id,
            "Failed requests must identify the same incident")
    state = snapshot(db, incident_id)
    incident = state["selected_incident"]
    require(incident["deployment_id"] == activation["deployment_id"]
            and incident["status"] == "open" and incident["version"] == BAD_RELEASE
            and incident["evidence"]["error_type"] == "ValueError"
            and "invalid-price" in incident["evidence"]["message"]
            and state["available_rollback_target"] == GOOD_RELEASE,
            "Expected actual invalid-price evidence on the activated broken deployment")
    summary = (f"Incident {incident_id}, deployment {incident['deployment_id']}: "
               f"observed checkout HTTP 500 and health HTTP 503; "
               f"{incident['evidence']['error_type']}: {incident['evidence']['message']}; "
               f"last failure {incident['evidence']['observed_at']}. "
               "Faulty v1.1.0 price configuration; recommend human-approved rollback "
               "to allowlisted v1.0.0. Stored evidence is not a current health probe.")
    _, report = command(db, "report.py", "--incident-id", incident_id, "--summary", summary)
    _, denied = command(db, "rollback.py", "--incident-id", incident_id, expected=(1,))
    require(denied.get("error", {}).get("code") == "approval_required",
            "Rollback without approval must be rejected")
    after = snapshot(db, incident_id)
    require(after["active_deployment"]["id"] == activation["deployment_id"]
            and after["selected_incident"]["status"] == "open",
            "Denied recovery must leave the broken deployment and incident unchanged")
    return {"status": "awaiting_human_approval", "incident_id": incident_id,
            "action": "rollback", "target_version": GOOD_RELEASE,
            "healthy_observations": healthy, "failed_observations": failed,
            "investigation": state, "report": report, "rejected_rollback": denied,
            "next_step": "Human reviews evidence and issues approval separately; "
                         "then run demo.py recover with this incident and human-issued approval ID. "
                         "No Switch messages have been sent."}


def recover(db, client, incident_id, approval_id=None):
    matching_api(client, snapshot(db, incident_id))
    arguments = ["--incident-id", incident_id, "--api-url", API_URL]
    if approval_id is None:
        arguments.append("--verify-only")
    else:
        arguments.extend(["--approval-id", approval_id, "--target", GOOD_RELEASE])
    code, result = command(db, "rollback.py", *arguments, expected=(0, 1))
    if "error" in result:
        raise DomainError(result["error"]["code"], result["error"]["message"])
    if result.get("status") == "verification_failed":
        require(code == 1, "Failed verification must return exit 1")
        return result
    require(code == 0 and result.get("status") == "verified"
            and set(result["checks"]) == CHECKS
            and all(value is True for value in result["checks"].values()),
            "Recovery requires exit 0 and all five verification checks true")
    state = snapshot(db, incident_id)
    require(state["selected_incident"]["status"] == "resolved"
            and state["active_deployment"]["version"] == GOOD_RELEASE
            and state["active_deployment"]["id"] == result["evidence"]["version"]["body"]["deployment_id"],
            "Final incident and deployment must agree with verified recovery")
    events = probe(client, "GET", "/audit", 200)["body"]["events"]
    events = [event for event in events if event["incident_id"] == incident_id]
    require({"failure_observed", "investigation_reported", "recovery_rejected",
             "approval_issued", "rollback_executed", "recovery_verified"}
            <= {event["event"] for event in events},
            "Expected complete prepared-demo audit narrative for this incident")
    result.update(incident=state["selected_incident"], audit_events=events)
    return result


def main():
    arguments = parser(__doc__)
    stages = arguments.add_subparsers(dest="stage", required=True)
    stages.add_parser("prepare", help="Human only: observe healthy, activate fault, report, prove denial")
    recovery = stages.add_parser("recover", help="Execute only with a separately human-issued approval")
    recovery.add_argument("--incident-id", required=True)
    recovery.add_argument("--approval-id", required=True)
    verification = stages.add_parser("verify", help="Retry verification, never repeat rollback")
    verification.add_argument("--incident-id", required=True)
    args = arguments.parse_args()

    def execute():
        try:
            with httpx.Client(base_url=API_URL, timeout=5, trust_env=False,
                              follow_redirects=False) as client:
                if args.stage == "prepare":
                    return prepare(args.db, client)
                return recover(args.db, client, args.incident_id,
                               getattr(args, "approval_id", None))
        except httpx.HTTPError:
            raise DomainError("demo_api_unavailable", "Use the existing local API on port 8001; no service was started") from None
        except subprocess.TimeoutExpired:
            raise DomainError("demo_command_timeout", "Inspect incident state before retrying; never assume rollback did not execute") from None

    return run(execute)


if __name__ == "__main__":
    raise SystemExit(main())
