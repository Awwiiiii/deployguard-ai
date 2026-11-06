import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import BAD_RELEASE
from app.state import activate_release, initialize_human_auth, issue_approval

# This public fixture is deliberately not a real operator credential.
TEST_SECRET = "test-only-credential-" + "x" * 32


@pytest.fixture
def service(tmp_path):
    application = create_app(tmp_path / "test.sqlite3")
    with TestClient(application) as client:
        yield application.state.database, client


@pytest.fixture
def broken(service):
    db, client = service
    activate_release(db, BAD_RELEASE)
    response = client.post("/checkout", json={"quantity": 2})
    assert response.status_code == 500
    return db, client, response.json()["incident_id"]


@pytest.fixture
def approved(broken):
    db, client, incident_id = broken
    initialize_human_auth(db, TEST_SECRET)
    approval = issue_approval(db, TEST_SECRET, incident_id)
    return db, client, incident_id, approval["approval_id"]
