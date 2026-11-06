import json
import os
import subprocess
import sys

import pytest

from app.database import ROOT
from app.models import BAD_RELEASE, DomainError, GOOD_RELEASE
from app.state import (activate_release, initialize_human_auth, investigate,
                       issue_approval, rollback)
from tests.conftest import TEST_SECRET


def reject(code, function, *args, **kwargs):
    with pytest.raises(DomainError) as caught:
        function(*args, **kwargs)
    assert caught.value.code == code


@pytest.mark.parametrize("approval_id", [None, "invented-by-agent"])
def test_recovery_without_persisted_approval(broken, approval_id):
    db, _, incident_id = broken
    reject("approval_required", rollback, db, incident_id, approval_id)
    assert investigate(db)["active_deployment"]["version"] == BAD_RELEASE


def test_approval_requires_human_credential(broken):
    db, _, incident_id = broken
    reject("unauthorized", issue_approval, db, "agent-claims-human-approved", incident_id)
    initialize_human_auth(db, TEST_SECRET)
    for secret in ["", "incorrect"]:
        reject("unauthorized", issue_approval, db, secret, incident_id)
    with db.read() as connection:
        assert connection.execute("SELECT count(*) FROM approvals").fetchone()[0] == 0
        assert connection.execute("SELECT digest FROM human_auth").fetchone()[0] != TEST_SECRET.encode()


def test_authorization_cannot_be_reinitialized(broken):
    db, _, _ = broken
    reject("weak_credential", initialize_human_auth, db, "short")
    initialize_human_auth(db, TEST_SECRET)
    reject("already_initialized", initialize_human_auth, db, "different-credential" * 3)


def test_expired_approval(approved):
    db, _, incident_id, approval_id = approved
    with db.transaction() as connection:
        connection.execute("UPDATE approvals SET expires_at='2000-01-01T00:00:00+00:00' WHERE id=?", (approval_id,))
    reject("approval_expired", rollback, db, incident_id, approval_id)
    assert investigate(db)["active_deployment"]["version"] == BAD_RELEASE


def test_wrong_incident_approval(approved):
    db, _, incident_id, approval_id = approved
    reject("approval_scope_mismatch", rollback, db, "another-incident", approval_id)
    # Rejection did not consume the valid scope.
    assert rollback(db, incident_id, approval_id)["new_version"] == GOOD_RELEASE


@pytest.mark.parametrize("target", [BAD_RELEASE, "v9.9.9", "; arbitrary shell command"])
def test_wrong_target_approval(approved, target):
    db, _, incident_id, approval_id = approved
    reject("approval_scope_mismatch", rollback, db, incident_id, approval_id, target=target)


def test_wrong_action_approval(approved):
    db, _, incident_id, approval_id = approved
    reject("approval_scope_mismatch", rollback, db, incident_id, approval_id, action="restart")


@pytest.mark.parametrize("ttl", [0, -1, 901])
def test_approval_expiration_bounds(approved, ttl):
    db, _, incident_id, _ = approved
    reject("invalid_expiration", issue_approval, db, TEST_SECRET, incident_id, ttl_seconds=ttl)


def test_invalid_target_cannot_be_approved(approved):
    db, _, incident_id, _ = approved
    reject("invalid_action", issue_approval, db, TEST_SECRET, incident_id, target=BAD_RELEASE)


def test_allowlist_even_with_incorrect_persisted_scope(approved):
    db, _, incident_id, approval_id = approved
    with db.transaction() as connection:
        connection.execute("UPDATE approvals SET target_version=? WHERE id=?", (BAD_RELEASE, approval_id))
    reject("invalid_action", rollback, db, incident_id, approval_id, target=BAD_RELEASE)


def test_reset_invalidates_approval_and_preserves_history(approved):
    db, client, incident_id, approval_id = approved
    activate_release(db, BAD_RELEASE)
    reject("approval_expired", rollback, db, incident_id, approval_id)
    assert client.get(f"/incidents/{incident_id}").json()["incident"]["status"] == "superseded"
    next_incident = client.get("/health").json()["incident_id"]
    assert next_incident != incident_id
    assert issue_approval(db, TEST_SECRET, next_incident)["approval_id"]


def test_reset_cannot_bypass_recovery_approval(broken):
    db, _, _ = broken
    reject("approval_required", activate_release, db, GOOD_RELEASE)
    assert investigate(db)["active_deployment"]["version"] == BAD_RELEASE


def test_human_approval_cli_keeps_credential_out_of_output(broken):
    db, _, incident_id = broken
    command = [sys.executable, "tools/approve.py", "--db", str(db.path)]
    agent_environment = {key: value for key, value in os.environ.items() if key != "DEPLOYGUARD_HUMAN_SECRET"}
    human_environment = {**agent_environment, "DEPLOYGUARD_HUMAN_SECRET": TEST_SECRET}
    denied = subprocess.run(command + ["--init"], cwd=ROOT, env=agent_environment,
                            text=True, capture_output=True)
    assert denied.returncode == 1
    assert json.loads(denied.stdout)["error"]["code"] == "human_credential_required"
    initialized = subprocess.run(command + ["--init"], cwd=ROOT, env=human_environment,
                                 text=True, capture_output=True, check=True)
    approved = subprocess.run(command + ["--incident-id", incident_id], cwd=ROOT,
                              env=human_environment, text=True, capture_output=True, check=True)
    assert json.loads(approved.stdout)["incident_id"] == incident_id
    for result in [denied, initialized, approved]:
        assert TEST_SECRET not in result.stdout + result.stderr
