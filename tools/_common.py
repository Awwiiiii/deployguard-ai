"""Shared JSON CLI handling; never print secrets or arbitrary exception text."""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

# Support both `python tools/incident.py` and `python -m tools.incident`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Database
from app.models import DomainError


def parser(description):
    result = argparse.ArgumentParser(description=description)
    result.add_argument("--db", help="Project-local SQLite path (default: DEPLOYGUARD_DB or evidence/deployguard.sqlite3)")
    return result


def run(operation):
    try:
        result = operation()
        print(json.dumps(result, indent=2))
        return 1 if result.get("status") == "verification_failed" else 0
    except DomainError as error:
        print(json.dumps({"error": {"code": error.code, "message": error.message}}))
        return 1
    except (sqlite3.Error, ValueError, OSError) as error:
        print(json.dumps({"error": {"code": "local_state_error", "type": type(error).__name__,
                                    "message": "Check the project-local database path and initialize demo state first"}}))
        return 1
