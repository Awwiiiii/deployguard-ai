"""Simulation, observed evidence, approval enforcement, and recovery transactions."""

import hashlib
import hmac
import json
import logging
import secrets
import traceback
from datetime import datetime, timedelta, timezone

from app.database import active_deployment, audit, decode, identifier, timestamp
from app.models import (ACTIVE_STATUSES, APPLICATION, BAD_RELEASE, DomainError,
                        GOOD_RELEASE, ROLLBACK_ACTION)

logger = logging.getLogger("deployguard")


def observe(db, endpoint: str, quantity: int = 1):
    """Execute release code and store only evidence actually observed here."""
    with db.transaction() as connection:
        deployment = active_deployment(connection)
        incident_id = None
        try:
            # v1.1.0 deliberately ships invalid checkout configuration.
            configured_price = "invalid-price" if deployment["version"] == BAD_RELEASE else "2500"
            unit_price = int(configured_price)
            body = {"application": APPLICATION, "version": deployment["version"]}
            if endpoint == "/health":
                body["status"] = "healthy"
            else:
                body.update(status="success", order_id=identifier("order"),
                            quantity=quantity, total_cents=unit_price * quantity)
            status = 200
        except ValueError as error:
            status = 503 if endpoint == "/health" else 500
            evidence = {"endpoint": endpoint, "http_status": status,
                        "error_type": type(error).__name__, "message": str(error),
                        "traceback": traceback.format_exc(), "observed_at": timestamp()}
            logger.error("Observed release failure: %s", json.dumps(evidence))
            existing = connection.execute(
                "SELECT id FROM incidents WHERE deployment_id=? AND status IN (?, ?, ?)",
                (deployment["id"], *ACTIVE_STATUSES),
            ).fetchone()
            now = timestamp()
            failure = f"{endpoint} returned HTTP {status}: {type(error).__name__}: {error}"
            if existing:
                incident_id = existing["id"]
                connection.execute(
                    "UPDATE incidents SET updated_at=?, observed_failure=?, evidence=?, "
                    "observation_count=observation_count+1 WHERE id=?",
                    (now, failure, json.dumps(evidence), incident_id),
                )
            else:
                incident_id = identifier("inc")
                connection.execute(
                    "INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1)",
                    (incident_id, now, now, APPLICATION, deployment["id"], deployment["version"],
                     failure, json.dumps(evidence)),
                )
                audit(connection, "incident_opened", incident_id, deployment_id=deployment["id"])
            audit(connection, "failure_observed", incident_id, **evidence)
            body = {"application": APPLICATION, "version": deployment["version"],
                    "status": "unhealthy" if endpoint == "/health" else "failed",
                    "error": {"code": "invalid_price_configuration", "message": str(error)},
                    "incident_id": incident_id}
        connection.execute("INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?)",
                           (identifier("obs"), timestamp(), deployment["id"], endpoint,
                            status, json.dumps(body)))
        return status, body


def investigate(db, incident_id=None):
    """No probes, writes, initialization, or audit insertions in this interface."""
    with db.read() as connection:
        deployment = active_deployment(connection)
        incidents = [decode(row, "evidence") for row in connection.execute(
            "SELECT * FROM incidents ORDER BY timestamp DESC LIMIT 20")]
        selected = None
        if incident_id:
            row = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
            if not row:
                raise DomainError("incident_not_found", "Incident not found", 404)
            selected = decode(row, "evidence")
        observations = [decode(row, "result") for row in connection.execute(
            "SELECT * FROM observations WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 20",
            (deployment["id"],))]
        return {"application": APPLICATION, "active_deployment": deployment,
                "service_status": {"basis": "persisted observations; no live probe performed",
                                   "latest_observation": observations[0] if observations else None},
                "recent_incidents": incidents, "selected_incident": selected,
                "error_evidence": [item for item in observations if item["http_status"] >= 500],
                "available_rollback_target": GOOD_RELEASE if deployment["version"] == BAD_RELEASE else None}


def record_investigation(db, incident_id, summary):
    """Explicit reporting command, separate from the read-only inspection interface."""
    if not summary.strip() or len(summary) > 2000:
        raise DomainError("invalid_summary", "Summary must contain 1 to 2000 characters", 400)
    with db.transaction() as connection:
        if not connection.execute("SELECT id FROM incidents WHERE id=?", (incident_id,)).fetchone():
            raise DomainError("incident_not_found", "Incident not found", 404)
        audit(connection, "investigation_reported", incident_id, summary=summary,
              source="agent_or_operator_report", verified_facts=False)
    return {"status": "recorded", "incident_id": incident_id}


def activate_release(db, version):
    if version not in (GOOD_RELEASE, BAD_RELEASE):
        raise DomainError("invalid_release", "Only the two demo releases are allowed", 400)
    with db.transaction() as connection:
        previous = active_deployment(connection)
        if previous["version"] == BAD_RELEASE and version == GOOD_RELEASE:
            raise DomainError("approval_required", "Demo reset cannot bypass approval; use an approved rollback to recover", 403)
        now = timestamp()
        connection.execute("UPDATE incidents SET status='superseded', updated_at=? "
                           "WHERE status IN (?, ?, ?)", (now, *ACTIVE_STATUSES))
        # Invalidate outstanding authorizations without removing historical evidence.
        connection.execute("UPDATE approvals SET expires_at=? WHERE consumed_at IS NULL", (now,))
        deployment_id = identifier("dep")
        connection.execute("INSERT INTO deployments VALUES (?, ?, ?, ?, ?)",
                           (deployment_id, version, previous["version"], now, "human demo reset"))
        connection.execute("UPDATE runtime SET deployment_id=? WHERE singleton=1", (deployment_id,))
        audit(connection, "demo_reset", previous_version=previous["version"],
              new_version=version, deployment_id=deployment_id)
        return {"status": "activated", "version": version, "deployment_id": deployment_id,
                "incident_created": False, "next_step": "Observe GET /health or POST /checkout"}


def _digest(secret, salt):
    return hashlib.scrypt(secret.encode(), salt=salt, n=2**14, r=8, p=1)


def initialize_human_auth(db, secret):
    if len(secret) < 32:
        raise DomainError("weak_credential", "Use a random human credential of at least 32 characters", 400)
    with db.transaction() as connection:
        if connection.execute("SELECT 1 FROM human_auth").fetchone():
            raise DomainError("already_initialized", "Human approval authorization is already initialized")
        salt = secrets.token_bytes(16)
        connection.execute("INSERT INTO human_auth VALUES (1, ?, ?)", (salt, _digest(secret, salt)))
        audit(connection, "human_authorization_initialized")
    return {"status": "initialized", "credential_stored": False}


def issue_approval(db, secret, incident_id, target=GOOD_RELEASE, ttl_seconds=300, action=ROLLBACK_ACTION):
    with db.transaction() as connection:
        auth = connection.execute("SELECT * FROM human_auth").fetchone()
        if not auth or not secret or not hmac.compare_digest(_digest(secret, auth["salt"]), auth["digest"]):
            raise DomainError("unauthorized", "Human approval credential is missing or invalid", 403)
        if action != ROLLBACK_ACTION or target != GOOD_RELEASE:
            raise DomainError("invalid_action", "Only rollback to v1.0.0 is allowed", 400)
        if not 1 <= ttl_seconds <= 900:
            raise DomainError("invalid_expiration", "Approval TTL must be between 1 and 900 seconds", 400)
        incident = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        if not incident:
            raise DomainError("incident_not_found", "Incident not found", 404)
        current = active_deployment(connection)
        if incident["status"] != "open" or incident["deployment_id"] != current["id"] or current["version"] != BAD_RELEASE:
            raise DomainError("stale_incident", "Approval requires an open incident on the active broken deployment")
        now = datetime.now(timezone.utc)
        approval_id = identifier("apr")
        expires = (now + timedelta(seconds=ttl_seconds)).isoformat(timespec="microseconds")
        connection.execute("INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, NULL)",
                           (approval_id, incident_id, action, target, now.isoformat(), expires))
        audit(connection, "approval_issued", incident_id, approval_id=approval_id,
              action=action, target_version=target, expires_at=expires)
        return {"approval_id": approval_id, "incident_id": incident_id, "action": action,
                "target_version": target, "expires_at": expires, "single_use": True}


def rollback(db, incident_id, approval_id, target=GOOD_RELEASE, action=ROLLBACK_ACTION):
    try:
        return _rollback(db, incident_id, approval_id, target, action)
    except DomainError as error:
        # The rejected transaction has already rolled back; keep a separate denial record.
        with db.transaction() as connection:
            audit(connection, "recovery_rejected", incident_id, code=error.code,
                  action=action, target_version=target)
        raise


def _rollback(db, incident_id, approval_id, target, action):
    with db.transaction() as connection:
        if not approval_id:
            raise DomainError("approval_required", "A persisted human approval is required", 403)
        approval = connection.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if not approval:
            raise DomainError("approval_required", "Approval record not found", 403)
        if approval["consumed_at"]:
            raise DomainError("approval_consumed", "Approval has already been used", 403)
        if datetime.fromisoformat(approval["expires_at"]) <= datetime.now(timezone.utc):
            raise DomainError("approval_expired", "Approval has expired", 403)
        if (approval["incident_id"] != incident_id or approval["target_version"] != target
                or approval["action"] != action):
            raise DomainError("approval_scope_mismatch", "Approval does not authorize this exact recovery", 403)
        if target != GOOD_RELEASE or action != ROLLBACK_ACTION:
            raise DomainError("invalid_action", "Only rollback to v1.0.0 is allowed", 400)
        incident = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        current = active_deployment(connection)
        if (not incident or incident["status"] != "open" or current["version"] != BAD_RELEASE
                or incident["deployment_id"] != current["id"]):
            raise DomainError("stale_incident", "Recovery requires the active broken deployment's open incident")
        now = timestamp()
        deployment_id, recovery_id = identifier("dep"), identifier("rec")
        connection.execute("UPDATE approvals SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
                           (now, approval_id))
        connection.execute("INSERT INTO deployments VALUES (?, ?, ?, ?, ?)",
                           (deployment_id, target, current["version"], now, "approved rollback"))
        connection.execute("UPDATE runtime SET deployment_id=? WHERE singleton=1", (deployment_id,))
        connection.execute("UPDATE incidents SET status='verifying', updated_at=? WHERE id=?", (now, incident_id))
        connection.execute("INSERT INTO recoveries VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
                           (recovery_id, incident_id, approval_id, current["version"], target, deployment_id, now))
        audit(connection, "rollback_executed", incident_id, recovery_id=recovery_id,
              approval_id=approval_id, previous_version=current["version"], new_version=target,
              deployment_id=deployment_id)
        return {"status": "awaiting_verification", "recovery_id": recovery_id,
                "incident_id": incident_id, "previous_version": current["version"], "new_version": target}


def verify_recovery(db, incident_id, client):
    """Probe the actual HTTP API; failure never turns into a success claim."""
    with db.read() as connection:
        row = connection.execute("SELECT * FROM recoveries WHERE incident_id=? ORDER BY executed_at DESC LIMIT 1",
                                 (incident_id,)).fetchone()
        if not row:
            raise DomainError("recovery_not_found", "No rollback exists for this incident", 404)
        recovery = dict(row)
    checks, evidence = {}, {}
    for name, method, endpoint in (("version", "GET", "/version"), ("health", "GET", "/health"),
                                   ("checkout", "POST", "/checkout"), ("audit", "GET", "/audit")):
        try:
            response = client.request(method, endpoint, **({"json": {"quantity": 1}} if method == "POST" else {}))
            body = response.json()
            evidence[name] = {"http_status": response.status_code, "body": body}
            if name == "audit":
                checks[name] = response.status_code == 200 and any(
                    event["event"] == "rollback_executed" and event["incident_id"] == incident_id
                    and event["details"].get("recovery_id") == recovery["id"] for event in body["events"])
            else:
                checks[name] = (response.status_code == 200 and body["version"] == GOOD_RELEASE
                                and (name == "version" or body["status"] == ("healthy" if name == "health" else "success")))
                if name == "version":
                    checks[name] = checks[name] and body["deployment_id"] == recovery["deployment_id"]
        except Exception as error:
            # Do not retain connection errors that might contain operator-supplied URLs or credentials.
            checks[name] = False
            evidence[name] = {"error_type": type(error).__name__, "message": "HTTP verification did not complete"}
    with db.transaction() as connection:
        checks["persisted_deployment"] = active_deployment(connection)["id"] == recovery["deployment_id"]
        success = all(checks.values())
        result = {"status": "verified" if success else "verification_failed",
                  "incident_id": incident_id, "recovery_id": recovery["id"],
                  "checks": checks, "evidence": evidence}
        now = timestamp()
        connection.execute("UPDATE recoveries SET verified_at=?, verification=? WHERE id=?",
                           (now if success else None, json.dumps(result), recovery["id"]))
        # A reset during verification must not revive a superseded incident.
        connection.execute("UPDATE incidents SET status=?, updated_at=? WHERE id=? AND status IN ('verifying','verification_failed','resolved')",
                           ("resolved" if success else "verification_failed", now, incident_id))
        audit(connection, "recovery_verified" if success else "recovery_verification_failed",
              incident_id, recovery_id=recovery["id"], checks=checks)
    return result
