"""Strictly read-only JSON investigation; does not contact or probe the API."""

try:
    from ._common import Database, parser, run
except ImportError:
    from _common import Database, parser, run

from app.state import investigate


def main():
    arguments = parser(__doc__)
    arguments.add_argument("--incident-id")
    args = arguments.parse_args()
    return run(lambda: investigate(Database(args.db), args.incident_id))


if __name__ == "__main__":
    raise SystemExit(main())
