"""Dashboard snapshots must remain pure reads and never expose authentication material."""

import json

import pytest

from app.models import BAD_RELEASE
from app.state import activate_release, rollback, verify_recovery


def test_unobserved_dashboard_does_not_probe_or_create_incident(service):
    db, client = service
    activate_release(db, BAD_RELEASE)
    before = db.path.read_bytes()
    for _ in range(5):
        response = client.get("/status")
        assert response.status_code == 200
        body = response.json()
        assert body["service_status"]["latest_observation"] is None
        assert body["observations"] == []
        assert body["available_rollback_target"] == "v1.0.0"
    assert db.path.read_bytes() == before
    assert client.get("/incidents").json() == {"incidents": []}


def test_dashboard_uses_actual_failure_and_does_not_repeat_it(broken):
    db, client, incident_id = broken
    before = db.path.read_bytes()
    snapshot = client.get("/status").json()
    observation = snapshot["service_status"]["latest_observation"]
    assert observation["http_status"] == 500
    assert observation["result"]["incident_id"] == incident_id
    assert len(snapshot["observations"]) == 1
    for _ in range(5):
        client.get("/status")
    assert db.path.read_bytes() == before
    assert client.get(f"/incidents/{incident_id}").json()["incident"]["observation_count"] == 1


def test_dashboard_exposes_metadata_and_actual_verification_only(approved):
    db, client, incident_id, approval_id = approved
    snapshot = client.get("/status").json()
    assert snapshot["approvals"][0]["id"] == approval_id
    assert snapshot["approvals"][0]["consumed_at"] is None
    assert snapshot["recoveries"] == []
    serialized = json.dumps(snapshot)
    for forbidden in ("human_auth", "salt", "digest", "test-only-credential"):
        assert forbidden not in serialized
    rollback(db, incident_id, approval_id)
    verify_recovery(db, incident_id, client)
    before = db.path.read_bytes()
    snapshot = client.get("/status").json()
    assert snapshot["approvals"][0]["consumed_at"] is not None
    assert snapshot["recoveries"][0]["verification"]["status"] == "verified"
    assert len(snapshot["recoveries"][0]["verification"]["checks"]) == 5
    assert all(snapshot["recoveries"][0]["verification"]["checks"].values())
    assert snapshot["available_rollback_target"] is None
    assert db.path.read_bytes() == before


@pytest.mark.parametrize("path", ["/status", "/approve", "/rollback", "/recovery", "/operator/approve", "/operator/rollback"])
def test_dashboard_adds_no_unauthenticated_mutation_endpoint(broken, path):
    db, client, _ = broken
    before = db.path.read_bytes()
    assert client.post(path, json={"target": "v1.0.0"}).status_code in (404, 405)
    assert db.path.read_bytes() == before
