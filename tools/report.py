"""Explicitly append an untrusted investigation summary; inspection stays read-only."""

try:
    from ._common import Database, parser, run
except ImportError:
    from _common import Database, parser, run

from app.state import record_investigation


def main():
    arguments = parser(__doc__)
    arguments.add_argument("--incident-id", required=True)
    arguments.add_argument("--summary", required=True, help="Do not include credentials or secrets")
    args = arguments.parse_args()
    return run(lambda: record_investigation(Database(args.db), args.incident_id, args.summary))


if __name__ == "__main__":
    raise SystemExit(main())
