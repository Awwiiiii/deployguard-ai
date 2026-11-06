# DeployGuard AI — Hackathon Submission

**Evidence-based incident analysis, explicit human approval, and verified recovery.**

DeployGuard AI demonstrates how AI can support incident response while humans retain
control of recovery. A local checkout service moves from healthy `v1.0.0` to a
deliberately faulty `v1.1.0`. Failed requests generate actual exception and HTTP
evidence. The operator supplies that evidence to Switch Buddy in Mattermost,
reviews the analysis, approves a specific rollback, and executes it locally.
The backend verifies the outcome before marking the incident resolved.

## Problem and approach

An incident diagnosis and a successful recovery are different claims. AI commentary
alone should not authorize a deployment change or establish that service has recovered.
DeployGuard makes evidence, approval, execution, and verification explicit. Persisted
approvals are scoped to an incident, action, and target, expire, and can be consumed
only once. Release change and approval consumption commit atomically.

## Implemented features

- FastAPI checkout simulation with healthy and deliberately broken release behaviors.
- SQLite evidence, timestamped observations, incident deduplication, and audit history.
- Read-only JSON investigation and a separate untrusted investigation-report interface.
- Human-only approval issuance and allowlisted rollback from `v1.1.0` to `v1.0.0`.
- Five checks: version, health, checkout, matching audit event, and persisted deployment.
- Verification retry without repeating rollback when post-execution checks fail.
- A reproducible operator demo and **60 passing automated tests**.

## Demonstrated Switch contribution

The operator successfully demonstrated Switch Buddy analyzing manually supplied
incident evidence in Mattermost and producing a final incident-resolution assessment.
The live backend demonstration confirmed actual failure evidence, mandatory human
approval, successful rollback, and all five recovery checks passing.

**The current Switch demonstration is AI-assisted analysis with human-executed
recovery, not autonomous agent recovery.** Evidence was manually relayed. Buddy did
not issue approval or execute rollback. Dedicated Investigator and Recovery agents
are registered but remain stopped. Their instructions and proposed JSON-tool
workflows are prepared; enforced isolation, automatic evidence ingestion, specialist
handoff, and agent-executed recovery remain unverified/planned. Live results are
operator-reported and separate from the isolated automated suite.

## Architecture and technology

Python 3.12, FastAPI/Uvicorn, SQLite, HTTPX, and Pytest form the local backend.
The API and CLI tools share a project-local database, with the API on loopback port
8001. Switch/Mattermost supplies the demonstrated human–AI collaboration surface.
No AI API key or cloud account is required for the backend or tests. See
[architecture](architecture.md) for transaction and approval boundaries.

## How to evaluate

1. Follow [local setup](../README.md#local-setup) and the [staged demo](demo.md).
2. Observe failed checkout and rejection of rollback without persisted approval.
3. Have the human issue fresh scoped approval and execute recovery locally.
4. Confirm all five checks and the resolved incident in measured output.
5. Optionally relay reviewed evidence/results to Buddy in an existing Switch environment.
6. Run `env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python -m pytest -q`.

The submission-preparation run on 2026-11-07 passed **60 tests in 7.28 seconds**
with one existing Starlette/HTTPX deprecation warning. Coverage includes denial cases,
synthetic credential checks, single use/concurrency, transaction rollback, verification
failure/retry, evidence integrity, and demo orchestration. See [test results](test-results.md).

## Limitations and roadmap

This is a local simulated deployment, with no production infrastructure adapter,
autonomous monitoring, automatic Switch evidence delivery, or autonomous recovery.
Same-user write access to code or SQLite can bypass the demo approval mechanism;
agent instructions alone do not establish isolation. The API is unauthenticated and
intended for loopback use. Local audit storage is not tamper-resistant.

Next steps are mediated specialist tools and process isolation, a validated Switch
handoff with human approval retained, automatic evidence delivery, real recovery
adapters, and a separate authenticated approval service with durable audit protection.
Dependency locking and CI would improve reproducibility. Private evidence, credentials,
runtime databases, and local configuration are excluded from this submission.
