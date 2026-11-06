"""Project-local SQLite storage; investigation connections cannot write."""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app.models import GOOD_RELEASE

ROOT = Path(__file__).resolve().parents[1]


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def identifier(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def audit(connection, event: str, incident_id=None, **details):
    connection.execute(
        "INSERT INTO audit VALUES (?, ?, ?, ?, ?)",
        (identifier("evt"), timestamp(), event, incident_id, json.dumps(details)),
    )


SCHEMA = """
CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY, version TEXT NOT NULL CHECK(version IN ('v1.0.0','v1.1.0')),
    previous_version TEXT, activated_at TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    deployment_id TEXT NOT NULL REFERENCES deployments(id)
);
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, updated_at TEXT NOT NULL,
    application TEXT NOT NULL, deployment_id TEXT NOT NULL REFERENCES deployments(id),
    version TEXT NOT NULL, observed_failure TEXT NOT NULL, evidence TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN
      ('open','verifying','verification_failed','resolved','superseded')),
    observation_count INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_incident ON incidents(deployment_id)
    WHERE status IN ('open','verifying','verification_failed');
CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL,
    deployment_id TEXT NOT NULL REFERENCES deployments(id),
    endpoint TEXT NOT NULL, http_status INTEGER NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id),
    action TEXT NOT NULL CHECK(action='rollback'), target_version TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS human_auth (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1), salt BLOB NOT NULL, digest BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS recoveries (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id),
    approval_id TEXT NOT NULL UNIQUE REFERENCES approvals(id),
    previous_version TEXT NOT NULL, target_version TEXT NOT NULL,
    deployment_id TEXT NOT NULL REFERENCES deployments(id),
    executed_at TEXT NOT NULL, verified_at TEXT, verification TEXT
);
CREATE TABLE IF NOT EXISTS audit (
    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, event TEXT NOT NULL,
    incident_id TEXT, details TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get(
            "DEPLOYGUARD_DB", str(ROOT / "evidence" / "deployguard.sqlite3")
        )).expanduser().resolve()
        if not self.path.is_relative_to(ROOT):
            raise ValueError("DEPLOYGUARD_DB must be inside the DeployGuard project")

    def _open(self, mode):
        connection = sqlite3.connect(
            f"{self.path.as_uri()}?mode={mode}", uri=True, timeout=10,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        return connection

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = self._open("rwc")
        try:
            connection.executescript(SCHEMA)
        finally:
            connection.close()
        with self.transaction() as connection:
            if not connection.execute("SELECT 1 FROM runtime").fetchone():
                deployment_id = identifier("dep")
                connection.execute("INSERT INTO deployments VALUES (?, ?, NULL, ?, ?)",
                                   (deployment_id, GOOD_RELEASE, timestamp(), "initial healthy deployment"))
                connection.execute("INSERT INTO runtime VALUES (1, ?)", (deployment_id,))
                audit(connection, "deployment_activated", version=GOOD_RELEASE,
                      deployment_id=deployment_id, reason="initialization")

    @contextmanager
    def read(self):
        connection = self._open("ro")
        try:
            connection.execute("PRAGMA query_only=ON")
            connection.execute("BEGIN")
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self):
        connection = self._open("rw")
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()


def active_deployment(connection) -> dict:
    return dict(connection.execute(
        "SELECT d.* FROM deployments d JOIN runtime r ON d.id=r.deployment_id"
    ).fetchone())


def decode(row, *fields):
    result = dict(row)
    for field in fields:
        if result.get(field) is not None:
            result[field] = json.loads(result[field])
    return result
