"""Execute one allowlisted approved rollback, then verify over local HTTP."""

from urllib.parse import urlsplit

import httpx

try:
    from ._common import Database, parser, run
except ImportError:
    from _common import Database, parser, run

from app.models import DomainError, GOOD_RELEASE
from app.state import rollback, verify_recovery


def local_api_url(value):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
                 and parsed.port == 8001 and parsed.path in {"", "/"}
                 and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise DomainError("invalid_api_url", "Verification requires http://127.0.0.1:8001 or http://localhost:8001", 400)
    return value.rstrip("/")


def main():
    arguments = parser(__doc__)
    arguments.add_argument("--incident-id", required=True)
    arguments.add_argument("--approval-id")
    arguments.add_argument("--target", choices=[GOOD_RELEASE], default=GOOD_RELEASE)
    arguments.add_argument("--api-url", default="http://127.0.0.1:8001")
    arguments.add_argument("--verify-only", action="store_true", help="Retry verification of an already executed rollback")
    args = arguments.parse_args()

    def execute():
        base_url = local_api_url(args.api_url)
        db = Database(args.db)
        execution = None
        if not args.verify_only:
            execution = rollback(db, args.incident_id, args.approval_id, args.target)
        # Disable proxies and redirects so verification stays on the explicit local API.
        with httpx.Client(base_url=base_url, timeout=5, trust_env=False, follow_redirects=False) as client:
            verification = verify_recovery(db, args.incident_id, client)
        if execution:
            verification["execution"] = execution
        return verification

    return run(execute)


if __name__ == "__main__":
    raise SystemExit(main())
