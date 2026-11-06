"""Factories for real-HTTP browser tests; never use a live demonstration database."""

import os
from pathlib import Path

from app.database import Database, ROOT
from app.main import create_app
from app.operator import create_operator_app
from app.state import initialize_human_auth
from tests.conftest import TEST_SECRET


def test_database():
    path = Path(os.environ["DEPLOYGUARD_BROWSER_TEST_DB"]).resolve()
    if not path.is_relative_to(ROOT / ".pytest_tmp") or not path.name.startswith("browser-operator-"):
        raise ValueError("Browser test storage must be a fresh isolated test database")
    return path


def create_test_api():
    db = Database(test_database())
    db.initialize()
    initialize_human_auth(db, TEST_SECRET)
    return create_app(db.path)


def create_test_operator():
    return create_operator_app(test_database(), api_url="http://127.0.0.1:8004", frontend_url="http://127.0.0.1:5175")
