"""HTTP checkout demo. Run manually on port 8001."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import Database, active_deployment, decode
from app.models import APPLICATION, BAD_RELEASE, GOOD_RELEASE, CheckoutRequest, DomainError
from app.state import investigate, observe


def create_app(db_path=None):
    database = Database(db_path)

    @asynccontextmanager
    async def lifespan(application):
        database.initialize()
        yield

    application = FastAPI(title="DeployGuard AI", version="0.1.0", lifespan=lifespan)
    application.state.database = database

    @application.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return JSONResponse(status_code=error.status_code,
                            content={"error": {"code": error.code, "message": error.message}})

    @application.get("/health")
    def health():
        status, body = observe(database, "/health")
        return JSONResponse(status_code=status, content=body)

    @application.get("/version")
    def version():
        with database.read() as connection:
            deployment = active_deployment(connection)
        return {"application": APPLICATION, "version": deployment["version"],
                "deployment_id": deployment["id"]}

    @application.get("/status")
    def status_snapshot():
        """Read one persisted snapshot. Never probe, write, or read human credentials."""
        with database.read() as connection:
            deployment = active_deployment(connection)
            observations = [decode(row, "result") for row in connection.execute(
                "SELECT * FROM observations WHERE deployment_id=? ORDER BY timestamp DESC LIMIT 60",
                (deployment["id"],))]
            recoveries = [decode(row, "verification") for row in connection.execute(
                "SELECT * FROM recoveries ORDER BY executed_at DESC")]
            # Approval records are authorization metadata, never human_auth credentials.
            approvals = [dict(row) for row in connection.execute(
                "SELECT id, incident_id, action, target_version, created_at, expires_at, consumed_at "
                "FROM approvals ORDER BY created_at DESC")]
        return {"application": APPLICATION, "api_version": application.version,
                "active_deployment": deployment,
                "service_status": {"basis": "persisted observations; no live probe performed",
                                   "latest_observation": observations[0] if observations else None},
                "observations": observations, "recoveries": recoveries, "approvals": approvals,
                "available_rollback_target": GOOD_RELEASE if deployment["version"] == BAD_RELEASE else None}

    @application.post("/checkout")
    def checkout(order: CheckoutRequest):
        status, body = observe(database, "/checkout", order.quantity)
        return JSONResponse(status_code=status, content=body)

    @application.get("/incidents")
    def incidents():
        with database.read() as connection:
            rows = connection.execute("SELECT * FROM incidents ORDER BY timestamp DESC").fetchall()
        return {"incidents": [decode(row, "evidence") for row in rows]}

    @application.get("/incidents/{incident_id}")
    def incident(incident_id: str):
        return {"incident": investigate(database, incident_id)["selected_incident"]}

    @application.get("/deployments")
    def deployments():
        with database.read() as connection:
            active = active_deployment(connection)
            history = [dict(row) for row in connection.execute("SELECT * FROM deployments ORDER BY activated_at DESC")]
        return {"active_deployment": active, "deployments": history}

    @application.get("/audit")
    def audit_history():
        with database.read() as connection:
            events = [decode(row, "details") for row in connection.execute("SELECT * FROM audit ORDER BY timestamp")]
        return {"events": events}

    return application


app = create_app()
