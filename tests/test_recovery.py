import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext

import httpx
import pytest

from app.database import active_deployment
from app.models import BAD_RELEASE, DomainError, GOOD_RELEASE
from app.state import (activate_release, investigate, record_investigation,
                       rollback, verify_recovery)
from tools.rollback import local_api_url
import tools.rollback as rollback_cli


def test_valid_recovery_and_audit_trail(approved):
    db, client, incident_id, approval_id = approved
    record_investigation(db, incident_id, "Observed invalid-price ValueError in failed checkout evidence.")
    with pytest.raises(DomainError):
        rollback(db, incident_id, None)
    execution = rollback(db, incident_id, approval_id)
    assert execution["status"] == "awaiting_verification"
    assert execution["previous_version"] == BAD_RELEASE
    assert execution["new_version"] == GOOD_RELEASE
    assert investigate(db, incident_id)["selected_incident"]["status"] == "verifying"
    result = verify_recovery(db, incident_id, client)
    assert result["status"] == "verified"
    assert all(result["checks"].values())
    assert client.get("/health").json()["status"] == "healthy"
    assert client.post("/checkout", json={"quantity": 1}).status_code == 200
    assert investigate(db, incident_id)["selected_incident"]["status"] == "resolved"
    events = client.get("/audit").json()["events"]
    names = [event["event"] for event in events]
    for expected in ["failure_observed", "investigation_reported", "recovery_rejected",
                     "approval_issued", "rollback_executed", "recovery_verified"]:
        assert expected in names
    recovered = next(event for event in events if event["event"] == "rollback_executed")
    assert recovered["details"]["previous_version"] == BAD_RELEASE
    assert recovered["details"]["new_version"] == GOOD_RELEASE
    with db.read() as connection:
        assert connection.execute("SELECT consumed_at FROM approvals WHERE id=?", (approval_id,)).fetchone()[0]


def test_reused_approval(approved):
    db, _, incident_id, approval_id = approved
    rollback(db, incident_id, approval_id)
    with pytest.raises(DomainError) as caught:
        rollback(db, incident_id, approval_id)
    assert caught.value.code == "approval_consumed"


def test_concurrent_approval_consumption(approved):
    db, _, incident_id, approval_id = approved

    def attempt():
        try:
            return rollback(db, incident_id, approval_id)["status"]
        except DomainError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == ["approval_consumed", "awaiting_verification"]
    with db.read() as connection:
        assert connection.execute("SELECT count(*) FROM recoveries").fetchone()[0] == 1


def test_transaction_rolls_back_consumption_on_storage_failure(approved):
    db, _, incident_id, approval_id = approved
    with db.transaction() as connection:
        connection.execute("CREATE TRIGGER fail_recovery BEFORE INSERT ON recoveries "
                           "BEGIN SELECT RAISE(ABORT, 'test injected failure'); END")
    import sqlite3
    with pytest.raises(sqlite3.IntegrityError):
        rollback(db, incident_id, approval_id)
    with db.read() as connection:
        assert connection.execute("SELECT consumed_at FROM approvals WHERE id=?", (approval_id,)).fetchone()[0] is None
        assert active_deployment(connection)["version"] == BAD_RELEASE
        assert connection.execute("SELECT status FROM incidents WHERE id=?", (incident_id,)).fetchone()[0] == "open"


def test_unreachable_api_does_not_claim_recovery(approved):
    db, client, incident_id, approval_id = approved
    rollback(db, incident_id, approval_id)

    def unavailable(request):
        raise httpx.ConnectError("unavailable", request=request)

    with httpx.Client(transport=httpx.MockTransport(unavailable), base_url="http://test") as offline:
        result = verify_recovery(db, incident_id, offline)
    assert result["status"] == "verification_failed"
    assert investigate(db, incident_id)["selected_incident"]["status"] == "verification_failed"
    assert client.get("/audit").json()["events"][-1]["event"] == "recovery_verification_failed"
    assert verify_recovery(db, incident_id, client)["status"] == "verified"


@pytest.mark.parametrize("failed_check", ["version", "health", "checkout", "audit"])
def test_each_verification_check_is_required(approved, failed_check):
    db, client, incident_id, approval_id = approved
    rollback(db, incident_id, approval_id)

    class FaultyAPI:
        def request(self, method, path, **kwargs):
            if path == "/" + failed_check:
                return httpx.Response(200, json={"version": BAD_RELEASE, "status": "unhealthy", "events": []})
            return client.request(method, path, **kwargs)

    result = verify_recovery(db, incident_id, FaultyAPI())
    assert result["status"] == "verification_failed"
    assert result["checks"][failed_check] is False


def test_reset_during_verification_cannot_resolve_old_incident(approved):
    db, client, incident_id, approval_id = approved
    rollback(db, incident_id, approval_id)

    class ResettingAPI:
        def request(self, method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            if path == "/audit":
                activate_release(db, GOOD_RELEASE)
            return response

    result = verify_recovery(db, incident_id, ResettingAPI())
    assert result["status"] == "verification_failed"
    assert result["checks"]["persisted_deployment"] is False
    assert investigate(db, incident_id)["selected_incident"]["status"] == "superseded"


@pytest.mark.parametrize("url", ["http://127.0.0.1:8000", "http://localhost:9092", "https://example.com:8001",
                                 "http://user:secret@localhost:8001", "http://localhost:8001/other"])
def test_verification_rejects_other_services(url):
    with pytest.raises(DomainError):
        local_api_url(url)


@pytest.mark.parametrize("verify_only", [False, True])
def test_rollback_cli_json_and_exit_status(approved, monkeypatch, capsys, verify_only):
    db, client, incident_id, approval_id = approved
    args = ["rollback.py", "--db", str(db.path), "--incident-id", incident_id]
    if verify_only:
        rollback(db, incident_id, approval_id)
        args.append("--verify-only")
    else:
        args.extend(["--approval-id", approval_id])
    monkeypatch.setattr("sys.argv", args)
    monkeypatch.setattr(rollback_cli.httpx, "Client", lambda **kwargs: nullcontext(client))
    assert rollback_cli.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "verified"
    assert all(result["checks"].values())


def test_rollback_cli_nonzero_when_verification_fails(approved, monkeypatch, capsys):
    db, _, incident_id, approval_id = approved

    class UnavailableAPI:
        def request(self, *args, **kwargs):
            return httpx.Response(503, json={})

    monkeypatch.setattr("sys.argv", ["rollback.py", "--db", str(db.path), "--incident-id",
                                    incident_id, "--approval-id", approval_id])
    monkeypatch.setattr(rollback_cli.httpx, "Client", lambda **kwargs: nullcontext(UnavailableAPI()))
    assert rollback_cli.main() == 1
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "verification_failed"
    assert result["execution"]["status"] == "awaiting_verification"
