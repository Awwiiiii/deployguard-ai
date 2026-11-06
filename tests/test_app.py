import json
import os
import sqlite3
import subprocess
import sys

import pytest

from app.database import Database, ROOT
from app.models import BAD_RELEASE, GOOD_RELEASE
from app.state import activate_release, investigate


def test_healthy_deployment(service):
    db, client = service
    assert client.get("/version").json()["version"] == GOOD_RELEASE
    assert client.get("/health").json()["status"] == "healthy"
    checkout = client.post("/checkout", json={"quantity": 2})
    assert checkout.status_code == 200
    assert checkout.json()["total_cents"] == 5000
    assert client.get("/incidents").json() == {"incidents": []}
    assert client.get("/deployments").json()["active_deployment"]["version"] == GOOD_RELEASE


def test_broken_deployment_and_incident_deduplication(broken, caplog):
    db, client, incident_id = broken
    for _ in range(3):
        response = client.get("/health")
        assert response.status_code == 503
        assert response.json()["incident_id"] == incident_id
    response = client.post("/checkout", json={"quantity": 1})
    assert response.status_code == 500
    incidents = client.get("/incidents").json()["incidents"]
    assert len(incidents) == 1
    incident = client.get(f"/incidents/{incident_id}").json()["incident"]
    assert incident["version"] == BAD_RELEASE
    assert incident["observation_count"] == 5
    assert incident["status"] == "open"
    assert incident["evidence"]["error_type"] == "ValueError"
    assert "invalid-price" in incident["evidence"]["message"]
    assert "Traceback" in incident["evidence"]["traceback"]
    assert "Observed release failure" in caplog.text
    assert incident["timestamp"] and incident["application"]


def test_reset_does_not_fabricate_observations(service):
    db, client = service
    activate_release(db, BAD_RELEASE)
    snapshot = investigate(db)
    assert snapshot["recent_incidents"] == []
    assert snapshot["service_status"]["latest_observation"] is None
    assert snapshot["available_rollback_target"] == GOOD_RELEASE


def test_investigation_is_read_only(broken):
    db, client, incident_id = broken
    before = db.path.read_bytes()
    audit_before = client.get("/audit").json()
    snapshot = investigate(db, incident_id)
    assert snapshot["selected_incident"]["id"] == incident_id
    assert snapshot["error_evidence"][0]["http_status"] == 500
    assert db.path.read_bytes() == before
    assert client.get("/audit").json() == audit_before
    with db.read() as connection:
        with pytest.raises(sqlite3.OperationalError):
            connection.execute("DELETE FROM incidents")


def test_incident_cli_is_read_only(broken):
    db, _, incident_id = broken
    before = db.path.read_bytes()
    result = subprocess.run(
        [sys.executable, "tools/incident.py", "--db", str(db.path), "--incident-id", incident_id],
        cwd=ROOT, capture_output=True, text=True, check=True,
        env={key: value for key, value in os.environ.items() if key != "DEPLOYGUARD_HUMAN_SECRET"},
    )
    assert json.loads(result.stdout)["selected_incident"]["id"] == incident_id
    assert db.path.read_bytes() == before


def test_unknown_incident(service):
    _, client = service
    response = client.get("/incidents/missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "incident_not_found"


@pytest.mark.parametrize("quantity", [0, -1, 101, "invalid"])
def test_checkout_validation(service, quantity):
    _, client = service
    assert client.post("/checkout", json={"quantity": quantity}).status_code == 422


def test_state_survives_reopening(broken):
    db, _, incident_id = broken
    another = Database(db.path)
    another.initialize()
    snapshot = investigate(another, incident_id)
    assert snapshot["active_deployment"]["version"] == BAD_RELEASE
    assert snapshot["selected_incident"]["id"] == incident_id


def test_database_path_must_stay_in_project():
    with pytest.raises(ValueError):
        Database("/tmp/not-deployguard.sqlite3")
