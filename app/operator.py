"""Separate loopback-only, script-free human operator gateway. One worker only.

Run: .venv/bin/python -m uvicorn app.operator:app --host 127.0.0.1 --port 8003
No human credential is read from environment variables or files. The human supplies
it through the browser-owned HTTP authentication dialog on this separate origin.
"""

import asyncio
import ipaddress
import re
import sqlite3
from contextlib import asynccontextmanager
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from app.database import Database, audit
from app.models import DomainError, GOOD_RELEASE
from app.operator_auth import COOKIE, Sessions, authenticate_human
from app.operator_monitor import observe_new_deployment, require_matching_api
from app.operator_views import esc, page, render_incident
from app.state import issue_approval, rollback, verify_recovery

ORIGIN = "http://127.0.0.1:8003"
CSP = ("default-src 'none'; script-src 'none'; worker-src 'none'; connect-src 'none'; "
       "style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
INCIDENT = re.compile(r"inc_[a-zA-Z0-9_-]{1,80}\Z")


def create_operator_app(db_path=None, *, api_url="http://127.0.0.1:8001",
                        frontend_url="http://127.0.0.1:5173", monitor=True,
                        client_factory=None, session_ttl=600):
    # Trusted process configuration only. No browser-selected destinations exist.
    if api_url not in {"http://127.0.0.1:8001", "http://127.0.0.1:8004"}:
        raise ValueError("Operator verification must use an allowlisted local API")
    if frontend_url not in {"http://127.0.0.1:5173", "http://127.0.0.1:4173", "http://127.0.0.1:5175"}:
        raise ValueError("Operator return URL must be an allowlisted local dashboard")
    db = Database(db_path)
    sessions = Sessions(session_ttl)
    clients = client_factory or (lambda: httpx.Client(base_url=api_url, timeout=5, trust_env=False, follow_redirects=False))

    async def watch(stop):
        while not stop.is_set():
            def tick():
                with clients() as client:
                    return observe_new_deployment(db, client)
            try:
                await run_in_threadpool(tick)
                application.state.monitor_status = "Watching persisted deployment changes"
            except Exception:
                # Do not retain exception strings, request headers, or operator input.
                application.state.monitor_status = "Waiting for the matching local API and database"
            try:
                await asyncio.wait_for(stop.wait(), timeout=2)
            except asyncio.TimeoutError:
                pass

    @asynccontextmanager
    async def lifespan(application):
        # The checkout API initializes storage. The gateway never initializes human auth.
        stop = asyncio.Event()
        task = asyncio.create_task(watch(stop)) if monitor else None
        yield
        stop.set()
        if task:
            await task

    application = FastAPI(title="DeployGuard human operator gateway", lifespan=lifespan,
                          docs_url=None, redoc_url=None, openapi_url=None)
    application.state.sessions = sessions
    application.state.monitor_status = "Starting" if monitor else "Automatic observation disabled"

    def failure(error):
        headers = {"WWW-Authenticate": 'Basic realm="DeployGuard human operator", charset="UTF-8"'} if error.status_code == 401 else {}
        if error.status_code == 429:
            headers["Retry-After"] = "60"
        content = f'<div class="eyebrow">OPERATOR ACTION NOT COMPLETED</div><h1>Request blocked</h1><section class="panel error"><h2>{esc(error.code)}</h2><p>{esc(error.message)}</p></section><p>No success is implied. If rollback already committed, inspect its recorded verification and use retry verification only.</p>'
        return HTMLResponse(page("Operator request blocked", content, frontend_url), status_code=error.status_code, headers=headers)

    @application.middleware("http")
    async def boundary(request: Request, call_next):
        try:
            peer = request.client.host if request.client else ""
            try:
                local = ipaddress.ip_address(peer).is_loopback
            except ValueError:
                local = False
            if (not local or request.headers.get("host") != urlsplit(ORIGIN).netloc
                    or any(key.lower() == "forwarded" or key.lower().startswith("x-forwarded-") for key in request.headers)):
                raise DomainError("operator_host_rejected", "The operator gateway accepts direct loopback requests on its exact host only.", 403)
            if request.url.query:
                raise DomainError("operator_query_rejected", "Query parameters are not accepted by this gateway.", 400)
            if request.method == "POST":
                if request.headers.get("origin") != ORIGIN or request.headers.get("sec-fetch-site", "same-origin") != "same-origin":
                    raise DomainError("operator_origin_rejected", "State-changing forms require the exact operator-console origin.", 403)
            response = await call_next(request)
        except DomainError as error:
            response = failure(error)
        except (sqlite3.Error, OSError):
            response = failure(DomainError("operator_storage_unavailable", "The local operator store is unavailable. No operation success is claimed.", 503))
        response.headers.update({"Content-Security-Policy": CSP, "Cache-Control": "no-store",
                                 "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff",
                                 "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()"})
        return response

    @application.exception_handler(DomainError)
    async def domain_error(request, error):
        return failure(error)

    def authenticate(request):
        peer = request.client.host
        sessions.check_rate(peer)
        try:
            secret = authenticate_human(db, request.headers.get("authorization"))
        except DomainError:
            sessions.record_auth(peer, False)
            raise
        sessions.record_auth(peer, True)
        return secret

    @application.get("/availability")
    def availability():
        return {"available": True, "authentication": "browser-native-http-basic",
                "console_origin": ORIGIN, "monitor_enabled": monitor,
                "monitor_status": application.state.monitor_status}

    @application.get("/operator/incidents/{incident_id}")
    def incident_console(incident_id: str, request: Request):
        if request.headers.get("sec-fetch-mode", "navigate") != "navigate":
            raise DomainError("operator_navigation_required", "Open this console as a top-level browser page.", 403)
        authenticate(request)
        if not INCIDENT.fullmatch(incident_id):
            raise DomainError("incident_not_found", "Incident not found", 404)
        token = request.cookies.get(COOKIE)
        session = sessions.get(token)
        fresh = session is None
        if fresh:
            token, session = sessions.create()
        with session.lock:
            content = render_incident(db, incident_id, session, frontend_url)
        if fresh:
            with db.transaction() as connection:
                audit(connection, "operator_authenticated", incident_id, source="browser_native_http_auth", identity="human_operator")
        response = HTMLResponse(content)
        if fresh:
            response.set_cookie(COOKIE, token, max_age=session_ttl, httponly=True, samesite="strict", path="/operator", secure=False)
        return response

    @application.post("/operator/incidents/{incident_id}/{action}")
    async def perform(incident_id: str, action: str, request: Request):
        secret = authenticate(request)
        if not INCIDENT.fullmatch(incident_id) or action not in {"approve", "execute", "verify"}:
            raise DomainError("operator_action_rejected", "Unknown operator action", 404)
        session = sessions.get(request.cookies.get(COOKIE))
        if session is None:
            raise DomainError("operator_session_required", "The operator session is missing or expired. Reload the console.", 403)
        if request.headers.get("content-type", "").split(";", 1)[0] != "application/x-www-form-urlencoded":
            raise DomainError("operator_form_required", "Only native same-origin form submissions are accepted.", 415)
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > 4096:
                raise DomainError("operator_form_too_large", "Form is too large", 413)
        try:
            fields = parse_qs(body.decode("utf-8"), strict_parsing=True, max_num_fields=4)
        except (UnicodeError, ValueError):
            raise DomainError("operator_form_invalid", "Invalid operator form", 400) from None
        expected = {"csrf_token", "reviewed"} if action == "approve" else {"csrf_token", "confirmation"} if action == "execute" else {"csrf_token"}
        if set(fields) != expected or any(len(values) != 1 for values in fields.values()):
            raise DomainError("operator_fields_rejected", "Unexpected, duplicate, or missing form fields", 400)

        def execute():
            with session.lock:
                if sessions.get(request.cookies.get(COOKIE)) is not session:
                    raise DomainError("operator_session_required", "The operator session expired. Reload the console.", 403)
                sessions.consume_csrf(session, fields["csrf_token"][0])
                with clients() as client:
                    require_matching_api(db, client)
                    if action == "approve":
                        if fields["reviewed"][0] != "yes":
                            raise DomainError("review_required", "Explicit evidence review is required", 400)
                        # Original credential validation, incident/target binding and TTL checks.
                        approval = issue_approval(db, secret, incident_id, target=GOOD_RELEASE, ttl_seconds=300)
                        session.approvals[incident_id] = approval["approval_id"]
                    elif action == "execute":
                        if fields["confirmation"][0] != "ROLLBACK":
                            raise DomainError("confirmation_required", "Type ROLLBACK to explicitly confirm execution", 400)
                        approval_id = session.approvals.get(incident_id)
                        if not approval_id:
                            raise DomainError("operator_approval_required", "Issue approval in this operator session first.", 403)
                        # Original atomic validator consumes the exact session-bound approval.
                        rollback(db, incident_id, approval_id, target=GOOD_RELEASE)
                        verify_recovery(db, incident_id, client)
                    else:
                        # This original function requires a persisted recovery and never rolls back.
                        verify_recovery(db, incident_id, client)
            return RedirectResponse(f"/operator/incidents/{incident_id}", status_code=303)

        return await run_in_threadpool(execute)

    return application


app = create_operator_app()
