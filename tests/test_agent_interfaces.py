"""Agent-facing CLI contracts and staged demo; only project-local fixture databases."""

import json
import io
import subprocess
import sys
from contextlib import nullcontext, redirect_stdout

import httpx
import pytest

from app.database import ROOT
from app.models import BAD_RELEASE, DomainError
from app.state import initialize_human_auth, investigate, issue_approval
from tests.conftest import TEST_SECRET
from tools import demo
from tools import rollback as rollback_cli


def cli(db_path, tool, *arguments):
    # The suite is launched without the real human credential. No environment dump
    # or credential lookup is needed to exercise these credential-free interfaces.
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / tool), "--db", str(db_path), *arguments],
        cwd=ROOT, capture_output=True, text=True, check=False, timeout=30,
    )
    return result.returncode, json.loads(result.stdout)


def test_missing_database_inspection_does_not_initialize(tmp_path):
    path = tmp_path / "missing.sqlite3"
    code, payload = cli(path, "incident.py")
    assert code == 1
    assert payload["error"]["code"] == "local_state_error"
    assert not path.exists()


def test_unknown_incident_cli_returns_read_only_json_error(broken):
    db, _, _ = broken
    before = db.path.read_bytes()
    code, payload = cli(db.path, "incident.py", "--incident-id", "missing")
    assert code == 1
    assert payload["error"]["code"] == "incident_not_found"
    assert db.path.read_bytes() == before


def test_report_cli_records_only_untrusted_findings(broken):
    db, client, incident_id = broken
    state_before = investigate(db, incident_id)
    events_before = client.get("/audit").json()["events"]
    summary = "Observed checkout HTTP 500; ValueError parsing invalid-price; propose v1.0.0."
    code, payload = cli(db.path, "report.py", "--incident-id", incident_id, "--summary", summary)
    assert code == 0
    assert payload == {"status": "recorded", "incident_id": incident_id}
    assert investigate(db, incident_id) == state_before
    events = client.get("/audit").json()["events"]
    assert len(events) == len(events_before) + 1
    assert events[-1]["event"] == "investigation_reported"
    assert events[-1]["incident_id"] == incident_id
    assert events[-1]["details"] == {
        "summary": summary, "source": "agent_or_operator_report", "verified_facts": False,
    }
    with db.read() as connection:
        assert connection.execute("SELECT count(*) FROM approvals").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM recoveries").fetchone()[0] == 0


@pytest.mark.parametrize("summary", ["", " \n\t", "x" * 2001])
def test_report_cli_rejects_invalid_summary_without_writes(broken, summary):
    db, _, incident_id = broken
    before = db.path.read_bytes()
    code, payload = cli(db.path, "report.py", "--incident-id", incident_id, "--summary", summary)
    assert code == 1
    assert payload["error"]["code"] == "invalid_summary"
    assert db.path.read_bytes() == before


def test_report_cli_rejects_unknown_incident_without_writes(service):
    db, _ = service
    before = db.path.read_bytes()
    code, payload = cli(db.path, "report.py", "--incident-id", "missing", "--summary", "Finding")
    assert code == 1
    assert payload["error"]["code"] == "incident_not_found"
    assert db.path.read_bytes() == before


@pytest.mark.parametrize("approval_id", [None, "fabricated-approval"])
def test_rollback_cli_requires_persisted_approval_before_http(broken, approval_id):
    db, client, incident_id = broken
    arguments = ["--incident-id", incident_id]
    if approval_id:
        arguments.extend(["--approval-id", approval_id])
    code, payload = cli(db.path, "rollback.py", *arguments)
    assert code == 1
    assert payload["error"]["code"] == "approval_required"
    assert investigate(db)["active_deployment"]["version"] == BAD_RELEASE
    assert client.get("/audit").json()["events"][-1]["event"] == "recovery_rejected"
    with db.read() as connection:
        assert connection.execute("SELECT count(*) FROM recoveries").fetchone()[0] == 0


def run_demo(db, client, monkeypatch, capsys, *arguments):
    original_command = demo.command

    def local_command(db_path, tool, *tool_arguments, expected=(0,)):
        if tool != "rollback.py" or not ({"--approval-id", "--verify-only"} & set(tool_arguments)):
            return original_command(db_path, tool, *tool_arguments, expected=expected)
        # Run the real rollback CLI in-process so its HTTP client is TestClient.
        # Subprocess inspection/report/reset and approval denial remain real CLIs.
        with monkeypatch.context() as patch, redirect_stdout(io.StringIO()) as output:
            patch.setattr(sys, "argv", [tool, "--db", db_path, *tool_arguments])
            code = rollback_cli.main()
        assert code in expected
        return code, json.loads(output.getvalue())

    with monkeypatch.context() as patch:
        patch.setattr(sys, "argv", ["demo.py", "--db", str(db.path), *arguments])
        patch.setattr(demo.httpx, "Client", lambda **kwargs: nullcontext(client))
        patch.setattr(demo, "command", local_command)
        code = demo.main()
    return code, json.loads(capsys.readouterr().out)


def test_demo_stops_for_human_then_recovers_and_retries_verification(service, monkeypatch, capsys):
    db, client = service
    code, prepared = run_demo(db, client, monkeypatch, capsys, "prepare")
    assert code == 0
    assert prepared["status"] == "awaiting_human_approval"
    assert prepared["failed_observations"]["checkout"]["http_status"] == 500
    assert prepared["failed_observations"]["health"]["http_status"] == 503
    assert prepared["report"]["status"] == "recorded"
    assert prepared["rejected_rollback"]["error"]["code"] == "approval_required"
    incident_id = prepared["incident_id"]
    assert investigate(db, incident_id)["selected_incident"]["status"] == "open"
    with db.read() as connection:
        for table in ("approvals", "recoveries", "human_auth"):
            assert connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0

    # Public synthetic fixture credential, only in this disposable test database.
    # This models the separate human step; the demo driver cannot perform it.
    initialize_human_auth(db, TEST_SECRET)
    approval_id = issue_approval(db, TEST_SECRET, incident_id)["approval_id"]
    code, result = run_demo(db, client, monkeypatch, capsys, "recover",
                            "--incident-id", incident_id, "--approval-id", approval_id)
    assert code == 0
    assert result["status"] == "verified"
    assert set(result["checks"]) == demo.CHECKS
    assert all(value is True for value in result["checks"].values())
    assert result["incident"]["status"] == "resolved"
    assert all(event["incident_id"] == incident_id for event in result["audit_events"])
    recovery_id = result["recovery_id"]
    code, retried = run_demo(db, client, monkeypatch, capsys, "verify", "--incident-id", incident_id)
    assert code == 0
    assert retried["recovery_id"] == recovery_id
    assert "execution" not in retried
    with db.read() as connection:
        assert connection.execute("SELECT count(*) FROM recoveries").fetchone()[0] == 1


def test_demo_refuses_broken_start_without_mutation(broken, monkeypatch, capsys):
    db, client, _ = broken
    before = db.path.read_bytes()
    code, payload = run_demo(db, client, monkeypatch, capsys, "prepare")
    assert code == 1
    assert payload["error"]["code"] == "demo_precondition_failed"
    assert db.path.read_bytes() == before


def test_demo_refuses_api_database_mismatch_before_fault_activation(service):
    db, _ = service
    before = db.path.read_bytes()

    def mismatched(request):
        assert request.url.path == "/version"  # No health/checkout writes or reset.
        return httpx.Response(200, json={"version": "v1.0.0", "deployment_id": "another-database"})

    with httpx.Client(base_url=demo.API_URL, transport=httpx.MockTransport(mismatched)) as client:
        with pytest.raises(DomainError, match="same database/deployment"):
            demo.prepare(str(db.path), client)
    assert db.path.read_bytes() == before
