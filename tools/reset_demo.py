"""HUMAN demo setup only: activate a local release, preserving audit history."""

try:
    from ._common import Database, parser, run
except ImportError:
    from _common import Database, parser, run

from app.models import BAD_RELEASE, GOOD_RELEASE
from app.state import activate_release


def main():
    arguments = parser(__doc__)
    arguments.add_argument("--release", choices=[GOOD_RELEASE, BAD_RELEASE], default=BAD_RELEASE)
    args = arguments.parse_args()

    def execute():
        db = Database(args.db)
        db.initialize()
        return activate_release(db, args.release)

    return run(execute)


if __name__ == "__main__":
    raise SystemExit(main())
