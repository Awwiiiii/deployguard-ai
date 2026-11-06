# Reproducible demonstration

## Website-first demonstration

Use the [Incident Command Center runbook](dashboard.md) for the current primary
demo. Start the API, frontend, and protected human operator gateway once, then use
the website for evidence, native authentication, scoped approval, explicit rollback,
verification, automatic refresh, and audit history. The only in-demo terminal action
is `tools/reset_demo.py`. The gateway observes the newly activated faulty release
once automatically; no curl is required. Do not run the staged CLI preparation below
at the same time as the website demonstration. The existing CLI flow is retained
as a fallback and historical operator-tested workflow.

The new browser flow is tested with real HTTP services, isolated data, and synthetic
credentials. The operator's actual credential was not accessed during implementation.
The separate gateway remains a trusted-machine localhost demo; read the
[security limitations](operator-security.md) before the demonstration.

## Current live-tested Switch demonstration

The operator successfully demonstrated **AI-assisted analysis with human-executed
recovery**: actual checkout failure evidence, mandatory human approval, rollback to
`v1.0.0`, all five recovery checks passing, and a final Switch Buddy assessment in
Mattermost. Evidence and results were manually supplied to Buddy. This was not
autonomous agent recovery. The registered Investigator and Recovery remain stopped.
These live results are operator-reported, separate from automated test coverage.

To reproduce this workflow, use the local phases below while the specialist agents
stay stopped. After Phase 1, manually send a reviewed incident excerpt to Buddy in
your existing Switch/Mattermost conversation: incident/deployment IDs, version,
timestamps, observed endpoint/status, and relevant exception. Remove personal paths
from tracebacks. Ask for a diagnosis and a proposed recovery plan, making clear that
a human will approve and execute recovery. Do not share databases, credentials,
verifiers, environments, or full private logs.

Complete human approval and human-executed Phase 3 locally. Then manually relay the
measured rollback result, five actual check booleans, and final incident status to
Buddy for a resolution assessment. Buddy's assessment is analysis of supplied evidence;
the backend performs verification. Local testing works without Switch; reproducing
the Buddy portion requires an existing Switch/Mattermost environment and Buddy access.
No connector or configuration is installed by this repository.

Messages directed at specialist agents later in this runbook are **future workflow
examples**, not steps in the demonstrated Buddy workflow. Keep those agents stopped.

## Local staged demo

The human-operated `tools/demo.py` drives the **existing** backend and CLIs. It
does not start services or Switch agents, send messages, create approvals, access
human credentials, or bypass authorization. It changes local simulated deployment
state during preparation. It requires the existing `.venv` dependencies, initialized
database, and API using that database on **127.0.0.1:8001**.

All commands below run in the repository root. No live database commands or approvals
were executed during public-submission preparation. The driver is tested with
temporary databases and the in-process HTTP application; its live-network execution
is not established by that test coverage.

## Operator setup

Review [the pre-start requirements](agent-integration.md#before-either-agent-starts).
This local command demonstration can run while both Switch agents remain stopped.
The human confirms that the approval verifier was already initialized; neither
agent nor the driver checks secrets or initializes authorization. If setup is
missing, the human follows the existing [human-only workflow](../README.md#f-human-approval)
separately. Do not share the credential in chat or an agent session.

Use the default project database for the API and commands. Remove any conflicting
`DEPLOYGUARD_DB` override in the human terminal. If the API is already running on
port 8001, reuse it. Otherwise the human, in terminal A, starts it manually:

```bash
cd /path/to/deployguard-ai
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Do not start a second process on the port. API startup initializes a missing healthy
database but preserves existing state. Preparation requires active healthy `v1.0.0`.
If a previous run left it broken, complete that incident's human-approved recovery
first; do not reset it to healthy or edit SQLite to bypass approval. Do not run
concurrent reset/demo workflows; preparation intentionally supersedes prior demo
incidents and expires unused approvals through the existing reset tool.

## Phase 1: actual failure, findings, and rejection

In human terminal B:

```bash
cd /path/to/deployguard-ai
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python tools/demo.py prepare
```

The script first checks the API deployment ID agrees with the tool snapshot, before
writing fault state. It measures healthy health/checkout, activates `v1.1.0` using
`reset_demo.py`, makes actual checkout and health requests (500 and 503), and checks
they refer to the same open incident on the faulty deployment. It reads structured
evidence with `incident.py`, records observed findings through `report.py`, and proves
rollback without approval exits 1 with `approval_required`, leaving the deployment
and incident unchanged. That denial intentionally writes a rejection audit event.

Expected overall exit: 0; JSON `status: awaiting_human_approval`. Copy the actual
`incident_id` from the output. It includes measured evidence, report result, denial,
and proposed scope. Do not fabricate IDs. The script stops here deliberately.

For a future specialist-agent demonstration, after separately authorized startup, use
the following instead of treating the driver's summary as an agent finding:

```text
@deployguard-investigator Investigate INCIDENT_ID using persisted DeployGuard evidence, record your findings, publish them here, and hand off to deployguard-recovery. Human approval is required before rollback.
```

Replace the ID with the observed value and post manually in `deployguard-incidents`.
Investigator should publish and hand off; Recovery should review and request approval.
Do not post this message during preparation while agents must remain stopped.

## Phase 2: human approval pause

The authorized human reviews the actual evidence and requested incident/deployment,
action `rollback`, and target `v1.0.0`. In a separate human-only terminal, follow
the existing [README approval workflow](../README.md#f-human-approval) to issue a
persisted, scoped, single-use approval. Default TTL is 300 seconds (allowed 1–900).
Use the same database; initialize nothing if authorization already exists.

Only the human-issued approval reference, incident, target, and expiry may be
relayed to Recovery. Natural-language consent or a Switch tool-permission click
does not create the approval. Neither the script nor either agent can issue it.

For that future specialist demonstration, the human posts this in the incident thread:

```text
@deployguard-recovery I issued approval APPROVAL_ID for incident INCIDENT_ID, action rollback, target v1.0.0, expires EXPIRES_AT. Execute that approved local rollback and publish the actual verification results.
```

Use real values from the human-only approval response. A missing, invented, expired,
wrong-scope, or consumed approval remains rejected by the unchanged backend.

## Phase 3: execute and verify

For the local command demonstration, in terminal B (no secret), enter the two real
references when prompted:

```bash
read -rp 'Incident ID from prepare: ' INCIDENT_ID
read -rp 'Human-issued approval ID: ' APPROVAL_ID
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python tools/demo.py recover --incident-id "$INCIDENT_ID" --approval-id "$APPROVAL_ID"
```

Expected: exit 0, `status: verified`, all five check names true, new `v1.0.0`
deployment, resolved incident, recovery ID, HTTP evidence, and this incident's audit
events: observed failures, investigation report, rejection, human approval, rollback,
and verification. The driver uses `rollback.py` for all approval validation and
recovery; it adds no alternative recovery path. Read stdout and the process exit
code together. Capturing output in a project-local file is optional; generated
evidence is ignored by Git and should not be posted wholesale to chat.

For that future specialist demonstration, Recovery executes its restricted `rollback.py` command
instead. **Choose one executor:** do not run the driver and the agent against the
same approval. A consumed approval cannot execute twice. Messages must include actual
check results and recovery/incident IDs; a successful local demo does not prove
Switch delivery. Confirm that findings, approval request, and actual results are
visible in the same Mattermost thread.

If rollback commits but verification fails, output remains `verification_failed`
with exit 1. Do not request or reuse approval for a second rollback. The human
resolves service availability/state issues, then terminal B retries verification:

```bash
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python tools/demo.py verify --incident-id "$INCIDENT_ID"
```

For a crash, timeout, or uncertain result, inspect `incident.py` and the recovery
audit before choosing the next step. The driver never starts a service to fix a
failed probe. Rerun `prepare` only after a completed healthy recovery; each run
creates new deployment/incident references and preserves history.

## Isolated automated validation

```bash
env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q app tools tests
```

Tests use `.pytest_tmp` databases, synthetic public test credentials, and in-process
HTTP clients; they never access the real human secret or operate the live database,
start Switch agents, or contact Docker. They validate the staged driver's tool
orchestration and approval pause, not external Switch routing or OS access controls.
Results and the dependency warning are recorded in [test-results.md](test-results.md).
