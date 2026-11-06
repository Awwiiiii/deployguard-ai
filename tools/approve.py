"""HUMAN ONLY: initialize approval authorization or issue an expiring approval."""

import os

try:
    from ._common import Database, parser, run
except ImportError:
    from _common import Database, parser, run

from app.models import DomainError, GOOD_RELEASE
from app.state import initialize_human_auth, issue_approval


def main():
    arguments = parser(__doc__)
    mode = arguments.add_mutually_exclusive_group(required=True)
    mode.add_argument("--init", action="store_true", help="Initialize once with a human-only random credential")
    mode.add_argument("--incident-id")
    arguments.add_argument("--target", default=GOOD_RELEASE, choices=[GOOD_RELEASE])
    arguments.add_argument("--ttl-seconds", type=int, default=300)
    args = arguments.parse_args()
    # Never pass this environment into the API, agents, investigation, or recovery.
    secret = os.environ.pop("DEPLOYGUARD_HUMAN_SECRET", "")

    def execute():
        if not secret:
            raise DomainError("human_credential_required", "Set DEPLOYGUARD_HUMAN_SECRET only for this human-operated process", 403)
        db = Database(args.db)
        if args.init:
            db.initialize()
            return initialize_human_auth(db, secret)
        return issue_approval(db, secret, args.incident_id, args.target, args.ttl_seconds)

    return run(execute)


if __name__ == "__main__":
    raise SystemExit(main())
