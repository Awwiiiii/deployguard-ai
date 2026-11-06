"""Opt-in gateway monitor: one actual HTTP observation per unobserved deployment."""

from app.database import active_deployment
from app.models import APPLICATION, DomainError


def require_matching_api(db, client):
    with db.read() as connection:
        deployment = active_deployment(connection)
    try:
        response = client.get("/version")
        body = response.json()
        matching = (response.status_code == 200 and body.get("application") == APPLICATION
                    and body.get("deployment_id") == deployment["id"]
                    and body.get("version") == deployment["version"])
    except Exception:
        matching = False
    if not matching:
        raise DomainError("operator_api_mismatch", "The fixed local API is unavailable or uses a different database. No operation was authorized.", 503)
    return deployment


def observe_new_deployment(db, client):
    """Never triggered by dashboard requests. Existing observations suppress probes."""
    with db.read() as connection:
        deployment = active_deployment(connection)
        observed = connection.execute("SELECT 1 FROM observations WHERE deployment_id=? LIMIT 1", (deployment["id"],)).fetchone()
        verifying = connection.execute("SELECT 1 FROM recoveries WHERE deployment_id=? AND verification IS NULL LIMIT 1", (deployment["id"],)).fetchone()
    if observed or verifying:
        return False
    require_matching_api(db, client)
    # /health runs actual release code and records actual evidence, including HTTP 503.
    # On the next tick the persisted observation prevents another request.
    client.get("/health")
    return True
