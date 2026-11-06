"""Gateway-only native HTTP authentication and ephemeral, non-credential sessions."""

import base64
import binascii
import hmac
import secrets
import threading
import time
from dataclasses import dataclass, field

from app.models import DomainError
from app.state import _digest

COOKIE = "dg_operator_session"


def authenticate_human(db, authorization):
    """Verify native credentials; never serialize or retain them beyond the request."""
    try:
        scheme, encoded = (authorization or "").split(" ", 1)
        if scheme.lower() != "basic" or len(encoded) > 8192:
            raise ValueError
        username, secret = base64.b64decode(encoded, validate=True).decode("utf-8").split(":", 1)
        if username != "operator" or not secret:
            raise ValueError
    except (ValueError, UnicodeError, binascii.Error):
        raise DomainError("operator_auth_required", "Use the browser's native sign-in dialog: username operator and your existing human credential.", 401) from None
    with db.read() as connection:
        auth = connection.execute("SELECT * FROM human_auth").fetchone()
    if not auth or not hmac.compare_digest(_digest(secret, auth["salt"]), auth["digest"]):
        raise DomainError("operator_auth_required", "Operator authentication failed.", 401)
    # Returned only to the server-side approval call for the duration of this request.
    return secret


@dataclass
class Session:
    expires: float
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    approvals: dict = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)


class Sessions:
    def __init__(self, ttl=600):
        self.ttl = ttl
        self.records = {}
        self.failures = {}
        self.lock = threading.Lock()

    def check_rate(self, peer):
        with self.lock:
            attempts, until = self.failures.get(peer, (0, 0))
            if attempts >= 5 and until > time.monotonic():
                raise DomainError("operator_rate_limited", "Too many failed sign-ins. Wait one minute before trying again.", 429)

    def record_auth(self, peer, success):
        with self.lock:
            if success:
                self.failures.pop(peer, None)
            else:
                attempts, until = self.failures.get(peer, (0, 0))
                if until <= time.monotonic():
                    attempts, until = 0, time.monotonic() + 60
                self.failures[peer] = (attempts + 1, until)

    def get(self, token):
        with self.lock:
            now = time.monotonic()
            self.records = {key: value for key, value in self.records.items() if value.expires > now}
            return self.records.get(token)

    def create(self):
        with self.lock:
            if len(self.records) >= 128:
                self.records.pop(next(iter(self.records)))
            token = secrets.token_urlsafe(32)
            session = Session(time.monotonic() + self.ttl)
            self.records[token] = session
            return token, session

    @staticmethod
    def consume_csrf(session, submitted):
        if not submitted or not submitted.isascii() or not secrets.compare_digest(session.csrf, submitted):
            raise DomainError("csrf_rejected", "The form expired or was already submitted. Reload the operator console.", 403)
        session.csrf = secrets.token_urlsafe(32)
