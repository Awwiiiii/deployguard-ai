"""Protected browser recovery contracts. Only isolated databases and public test credentials."""

import base64
import re
import time
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

from app.models import BAD_RELEASE
from app.operator import CSP, ORIGIN, create_operator_app
from app.operator_auth import COOKIE
from app.operator_monitor import observe_new_deployment
from app.state import activate_release, initialize_human_auth
from tests.conftest import TEST_SECRET

AUTH = "Basic " + base64.b64encode(f"operator:{TEST_SECRET}".encode()).decode()
HEADERS = {"Origin": ORIGIN, "Sec-Fetch-Site": "same-origin"}


@pytest.fixture
def operator(broken):
    db, api, incident_id = broken
    initialize_human_auth(db, TEST_SECRET)

    @contextmanager
    def clients():
        yield api

    app = create_operator_app(db.path, monitor=False, client_factory=clients)
    with TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 40000)) as gateway:
        yield db, api, gateway, incident_id, app


def path(incident_id):
    return f"/operator/incidents/{incident_id}"


def sign_in(gateway, incident_id):
    gateway.headers["Authorization"] = AUTH
    response = gateway.get(path(incident_id))
    assert response.status_code == 200
    return csrf(response)


def csrf(response):
    return re.search(r'name="csrf_token" value="([^"]+)"', response.text).group(1)


def submit(gateway, incident_id, action, token, **fields):
    return gateway.post(f"{path(incident_id)}/{action}", data={"csrf_token": token, **fields}, headers=HEADERS, follow_redirects=False)


@pytest.mark.parametrize("action", ["approve", "execute", "verify"])
def test_missing_auth_cannot_mutate(operator, action):
    db, _, gateway, incident_id, _ = operator
    before = db.path.read_bytes()
    response = submit(gateway, incident_id, action, "fake", reviewed="yes")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert db.path.read_bytes() == before


def test_invalid_auth_and_throttling_do_not_mutate(operator):
    db, _, gateway, incident_id, _ = operator
    gateway.headers["Authorization"] = "Basic " + base64.b64encode(b"operator:wrong").decode()
    before = db.path.read_bytes()
    for _ in range(5):
        assert gateway.get(path(incident_id)).status_code == 401
    assert gateway.get(path(incident_id)).status_code == 429
    assert db.path.read_bytes() == before


def test_native_auth_has_no_credential_in_html_session_or_scripts(operator):
    _, _, gateway, incident_id, app = operator
    sign_in(gateway, incident_id)
    response = gateway.get(path(incident_id))
    assert response.headers["Content-Security-Policy"] == CSP
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Frame-Options"] == "DENY"
    gateway.cookies.clear()
    fresh = gateway.get(path(incident_id))
    assert "HttpOnly" in fresh.headers["set-cookie"]
    assert TEST_SECRET not in response.text
    assert AUTH not in response.text
    assert "<script" not in response.text
    assert 'type="password"' not in response.text
    assert "localStorage" not in response.text
    assert "SameSite=strict" in fresh.headers["set-cookie"]
    assert TEST_SECRET not in repr(app.state.sessions.records)


@pytest.mark.parametrize("headers", [{}, {"Origin": "http://127.0.0.1:5173"}, {"Origin": "https://attacker.invalid"}, {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"}])
def test_foreign_or_missing_origin_cannot_mutate(operator, headers):
    db, _, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    before = db.path.read_bytes()
    response = gateway.post(f"{path(incident_id)}/approve", data={"csrf_token": token, "reviewed": "yes"}, headers=headers)
    assert response.status_code == 403
    assert db.path.read_bytes() == before


def test_invalid_csrf_missing_session_and_expired_session(operator):
    db, _, gateway, incident_id, app = operator
    token = sign_in(gateway, incident_id)
    before = db.path.read_bytes()
    assert submit(gateway, incident_id, "approve", "wrong", reviewed="yes").status_code == 403
    assert submit(gateway, incident_id, "approve", "é", reviewed="yes").status_code == 403
    session = app.state.sessions.get(gateway.cookies.get(COOKIE))
    session.expires = time.monotonic() - 1
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 403
    gateway.cookies.clear()
    assert submit(gateway, incident_id, "execute", token, confirmation="ROLLBACK").status_code == 403
    assert db.path.read_bytes() == before


@pytest.mark.parametrize("extra", [{"target": "v9.9.9"}, {"db": "/etc/arbitrary"}, {"api_url": "https://attacker.invalid"}, {"command": "arbitrary shell"}, {"approval_id": "invented"}])
def test_arbitrary_browser_parameters_are_rejected(operator, extra):
    db, _, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    before = db.path.read_bytes()
    assert submit(gateway, incident_id, "approve", token, reviewed="yes", **extra).status_code == 400
    assert db.path.read_bytes() == before


def test_explicit_confirmation_and_this_sessions_approval_are_required(operator):
    db, _, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "execute", token, confirmation="ROLLBACK").status_code == 403
    token = csrf(gateway.get(path(incident_id)))
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    token = csrf(gateway.get(path(incident_id)))
    assert submit(gateway, incident_id, "execute", token, confirmation="not confirmed").status_code == 400
    with db.read() as connection:
        assert connection.execute("SELECT COUNT(*) FROM recoveries").fetchone()[0] == 0


def test_full_gateway_recovery_and_csrf_replay_denial(operator):
    db, api, gateway, incident_id, app = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 403
    response = gateway.get(path(incident_id))
    assert "Execute approved rollback" in response.text
    assert submit(gateway, incident_id, "execute", csrf(response), confirmation="ROLLBACK").status_code == 303
    result = gateway.get(path(incident_id))
    assert "Verified" in result.text
    assert result.text.count('>Passed<') == 5
    assert api.get("/incidents").json()["incidents"][0]["status"] == "resolved"
    snapshot = api.get("/status").json()
    assert snapshot["active_deployment"]["version"] == "v1.0.0"
    assert snapshot["approvals"][0]["consumed_at"]
    assert len(snapshot["recoveries"]) == 1
    current_csrf = app.state.sessions.get(gateway.cookies.get(COOKIE)).csrf
    assert submit(gateway, incident_id, "execute", current_csrf, confirmation="ROLLBACK").status_code == 403
    assert len(api.get("/status").json()["recoveries"]) == 1
    assert TEST_SECRET not in repr(app.state.sessions.records)
    assert TEST_SECRET not in str(api.get("/audit").json())


def test_expired_approval_is_rejected_by_original_validator(operator):
    db, api, gateway, incident_id, app = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    approval_id = app.state.sessions.get(gateway.cookies.get(COOKIE)).approvals[incident_id]
    with db.transaction() as connection:
        connection.execute("UPDATE approvals SET expires_at='2000-01-01T00:00:00+00:00' WHERE id=?", (approval_id,))
    assert submit(gateway, incident_id, "execute", csrf(gateway.get(path(incident_id))), confirmation="ROLLBACK").status_code == 403
    assert api.get("/version").json()["version"] == BAD_RELEASE


def test_stale_incident_is_rejected_by_original_validator(operator):
    db, api, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    stale_form_csrf = csrf(gateway.get(path(incident_id)))
    activate_release(db, BAD_RELEASE)
    response = submit(gateway, incident_id, "execute", stale_form_csrf, confirmation="ROLLBACK")
    assert response.status_code in (403, 409)
    assert not api.get("/status").json()["recoveries"]


def test_failed_verification_is_visible_and_retry_does_not_repeat_rollback(operator, monkeypatch):
    _, api, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    original = api.request

    def unavailable_health(method, url, **kwargs):
        if str(url) == "/health":
            return httpx.Response(503, json={"version": "v1.0.0", "status": "unhealthy"})
        return original(method, url, **kwargs)

    monkeypatch.setattr(api, "request", unavailable_health)
    assert submit(gateway, incident_id, "execute", csrf(gateway.get(path(incident_id))), confirmation="ROLLBACK").status_code == 303
    result = gateway.get(path(incident_id))
    assert "Verification failed" in result.text
    assert ">Failed<" in result.text
    assert "Retry verification" in result.text
    monkeypatch.setattr(api, "request", original)
    assert submit(gateway, incident_id, "verify", csrf(result)).status_code == 303
    assert ">Verified<" in gateway.get(path(incident_id)).text
    assert len(api.get("/status").json()["recoveries"]) == 1


def test_gateway_does_not_authorize_when_fixed_api_and_database_disagree(operator, monkeypatch):
    db, api, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    before = db.path.read_bytes()
    monkeypatch.setattr(api, "get", lambda *a, **k: httpx.Response(200, json={"application": "deployguard-checkout", "version": BAD_RELEASE, "deployment_id": "dep_wrong"}))
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 503
    assert db.path.read_bytes() == before


@pytest.mark.parametrize("headers", [{"Host": "attacker.invalid:8003"}, {"X-Forwarded-Host": "127.0.0.1:8003"}, {"Forwarded": "for=127.0.0.1"}])
def test_gateway_rejects_rebinding_and_forwarding(operator, headers):
    _, _, gateway, _, _ = operator
    assert gateway.get("/availability", headers=headers).status_code == 403


def test_monitor_observes_actual_new_release_once_not_once_per_dashboard_refresh(service):
    db, api = service
    assert observe_new_deployment(db, api) is True
    assert observe_new_deployment(db, api) is False
    activate_release(db, BAD_RELEASE)
    assert observe_new_deployment(db, api) is True
    for _ in range(8):
        assert observe_new_deployment(db, api) is False
        api.get("/status")
    incidents = api.get("/incidents").json()["incidents"]
    assert len(incidents) == 1
    assert incidents[0]["observation_count"] == 1
    assert incidents[0]["evidence"]["http_status"] == 503


def test_cookie_alone_cannot_authorize_recovery(operator):
    db, _, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    gateway.headers.pop("Authorization")
    before = db.path.read_bytes()
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 401
    assert db.path.read_bytes() == before


def test_other_session_cannot_execute_an_approval_from_public_metadata(operator):
    _, api, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    gateway.cookies.clear()
    other_session_token = csrf(gateway.get(path(incident_id)))
    assert submit(gateway, incident_id, "execute", other_session_token, confirmation="ROLLBACK").status_code == 403
    assert api.get("/version").json()["version"] == BAD_RELEASE
    assert not api.get("/status").json()["recoveries"]


def test_remote_clients_cannot_reach_gateway(operator):
    _, _, _, _, app = operator
    with TestClient(app, base_url=ORIGIN, client=("198.51.100.2", 40000)) as remote:
        assert remote.get("/availability").status_code == 403


def test_gateway_concurrent_form_submission_executes_only_once(operator):
    from concurrent.futures import ThreadPoolExecutor

    _, api, gateway, incident_id, _ = operator
    token = sign_in(gateway, incident_id)
    assert submit(gateway, incident_id, "approve", token, reviewed="yes").status_code == 303
    token = csrf(gateway.get(path(incident_id)))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: submit(gateway, incident_id, "execute", token, confirmation="ROLLBACK").status_code, range(2)))
    assert sorted(results) == [303, 403]
    assert len(api.get("/status").json()["recoveries"]) == 1
