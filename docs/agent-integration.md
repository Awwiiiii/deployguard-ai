# Switch agent integration runbook

Prepared for the existing `deployguard-investigator`, `deployguard-recovery`, and
Mattermost/Switch room `deployguard-incidents`. This repository supplies instructions,
existing JSON tools, and a staged demo. It does not install/register/start agents,
configure Switch, enforce runtime permissions, or prove live message delivery.
The backend and approval-validation logic are unchanged. Application port stays **8001**.

## Demonstrated workflow versus planned integration

The operator live-tested Switch Buddy in Mattermost using manually supplied incident
evidence, followed by a final incident-resolution assessment. The human issued approval
and executed rollback locally; all five recovery checks passed. This is **AI-assisted
analysis with human-executed recovery**, not autonomous agent recovery. Automatic
evidence ingestion and direct Buddy backend execution were not demonstrated.

The dedicated Investigator and Recovery agents are registered but remain stopped.
The specialist workflow below is a future integration runbook. Its enforced controls,
tool delivery, and agent handoff remain unverified. Live results are operator-reported,
separate from automated test coverage. No Switch configuration changes are part of
public-submission preparation.

## Verified tool interfaces

| Interface | Contract and side effects |
| --- | --- |
| `tools/incident.py` | Structured JSON: `application`, `active_deployment`, `service_status`, `recent_incidents`, `selected_incident`, `error_evidence`, `available_rollback_target`. SQLite `mode=ro`, `query_only=ON`, snapshot transaction. No initialization, HTTP, audit insertion, or credential use. |
| `tools/report.py` | Required incident ID and nonblank summary of at most 2000 characters. Checks incident existence and appends `investigation_reported` with `source: agent_or_operator_report`, `verified_facts: false`. Returns `status: recorded`. Cannot authorize recovery. |
| `tools/rollback.py` | Requires an existing human-issued approval for the exact incident, action `rollback`, and target `v1.0.0`. Validates expiry, single use, active broken deployment instance, and open incident. Consumes approval and switches release atomically. Denials append `recovery_rejected`. |
| `tools/rollback.py --verify-only` | Requires an existing recovery, never executes rollback or issues approval. Performs live HTTP checks and writes verification/observation results. It is a write-capable operation. |

Inspection success exits 0. Report success exits 0. Verified recovery exits 0.
Domain/storage errors exit 1 with `error.code` and `error.message`; failed recovery
verification exits 1 with `status: verification_failed`, check booleans, and evidence.
Argument-parser errors exit 2 and use argparse stderr. Unexpected crashes or invalid
JSON require state review; do not infer that no rollback occurred. The CLI is a JSON
interface, not an installed Switch MCP tool.

The incident list and active-deployment observations are limited to 20 each. An
explicitly selected incident may be historical; its evidence must not be attributed
to the current deployment without checking IDs. Missing observations mean unknown
health, and old observations do not establish current health. `/health` and
`/checkout` mutate evidence; the Investigator must not probe them.

Successful recovery requires all five checks: `version`, `health`, `checkout`,
`audit`, `persisted_deployment`. HTTP verification checks the new deployment instance,
healthy `v1.0.0`, successful checkout, and matching recovery audit event. A final
database check confirms that deployment is still active. Only then is the incident
resolved. A committed rollback followed by failed verification consumes the approval;
retry verification only. HTTPX permits only loopback HTTP port 8001, no proxies or redirects.

## Exact agent commands

All commands run from the repository root. Use `.venv/bin/python`.
The default database is `evidence/deployguard.sqlite3`; API and tools must share it.
An operator must remove conflicting `DEPLOYGUARD_DB` overrides before launch. Do
not expose agent-controlled `--db`, `--api-url`, arbitrary executable paths, Python
`-c`, environment overrides, or shell fragments through a restricted tool wrapper.
Examples show CLI equivalents; a wrapper should use fixed argument lists without a shell.

| Agent | Permitted operation | Exact project-local command |
| --- | --- | --- |
| Investigator | Snapshot | `.venv/bin/python tools/incident.py` |
| Investigator / Recovery | Inspect one incident | `.venv/bin/python tools/incident.py --incident-id INCIDENT_ID` |
| Investigator | Append findings | `.venv/bin/python tools/report.py --incident-id INCIDENT_ID --summary 'FINDINGS'` |
| Recovery | Execute after explicit human approval | `.venv/bin/python tools/rollback.py --incident-id INCIDENT_ID --approval-id APPROVAL_ID --target v1.0.0 --api-url http://127.0.0.1:8001` |
| Recovery | Retry verification of an existing recovery | `.venv/bin/python tools/rollback.py --incident-id INCIDENT_ID --verify-only --api-url http://127.0.0.1:8001` |

`INCIDENT_ID` and `APPROVAL_ID` come from observed evidence and a human-issued
approval response. `FINDINGS` is at most 2000 characters of factual commentary, with
no credentials. In mediated tools pass these as literal arguments; never interpolate
room text into a shell command. Recovery has no report-write requirement: it publishes
results in Switch, and the backend automatically records recovery audit events.

No agent may use `tools/approve.py`, `tools/reset_demo.py`, or `tools/demo.py`.
Reset/demo preparation and service startup belong only to the human operator.
The human approval workflow remains [README section F](../README.md#f-human-approval).
No approval secret is needed by investigation, report, rollback, verification, or
Switch messaging. Do not generate, request, inspect, or forward that secret.

## Room workflow

Load the [Investigator instructions](../agents/investigator.md) and
[Recovery instructions](../agents/recovery.md) into the corresponding existing
agents during a later, authorized setup step. Do not recreate agents or rooms.
These files are not automatically installed by their presence in Git.

The Investigator posts observed incident/deployment IDs, timestamps, error evidence,
diagnosis/uncertainty, report result, and proposed `v1.0.0` target in the originating
thread. It explicitly mentions `@deployguard-recovery` once. Switch documents
`post_message` and `send_targeted_message` for agent handoffs; there is no separate
task protocol. Use the actual session tool schemas and contextual room/thread IDs.
Do not invent an executable Switch CLI command or assume a tool is available.
[Switch operation catalog](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol#the-operation-catalog).

Recovery independently refreshes the incident and asks the authorized human for
the exact rollback approval. The human issues it in a separate terminal and shares
only approval reference/scope/expiry. Recovery refreshes evidence again, executes
once, checks the result and final incident, and publishes actual measurements.
Switch permission cards authorize tool use; they do not create DeployGuard approvals.
[Switch requests and room messaging](https://docs.switchagents.ai/switch-rooms/using/work-in-a-room).

An explicit mention routes the handoff, but the receiving agent must accept that
sender under its existing addressing policy. Verify owner/human identities and the
Investigator-to-Recovery allowance rather than opening access to everyone. Existing
agents may retain older addressing policies. Missing tools or denied delivery must
be reported as unconfirmed, with a draft for manual operator relay.
[Switch addressing policy](https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings#choose-who-can-instruct-the-agent).

## Before either agent starts

These are required operator actions or confirmations, **not controls installed by
this change**. Keep both agents stopped until the controls are enforced and checked.
No Switch server setting changes are part of this task; a missing capability is a
blocker to resolve separately, not permission to change the server or broaden access.

1. Review the updated instructions and load each into the correct existing agent.
   Confirm the existing checkout and `.venv` are accessible to its restricted tools.
   Directory settings are convenience, not enforcement.
2. Enforce OS/process/filesystem permissions outside model instructions. Agent
   processes must not write backend code, tools, `.venv`, authorization state, or
   SQLite directly, read operator credentials, inspect another process's environment,
   or reach other projects. Same-user general shell access to
   writable code/database defeats this demo's approval boundary. Neither agent is
   claimed to be isolated.
3. Expose only mediated, fixed tool operations from the command table. A trusted
   non-agent tool process may read the database for investigation, append validated
   reports, or run approved rollback/verification. Keep the SQLite file and its
   writable directory inaccessible to arbitrary agent operations. `report.py` uses
   a writable connection, so a file permission granting the Investigator general
   database write access is not append-only reporting. Restrict executable/arguments,
   environment, code import paths, and file access at the executor boundary; a shell
   prefix allowlist for Python alone is insufficient. If mediated access is unavailable,
   retain human execution of the commands and manually relay outputs; do not enable
   unrestricted shell as a workaround. No such executor is supplied in this repository.
4. Keep human approval issuance and its credential in a separate human context.
   The human confirms authorization was initialized previously; if needed, only the
   human performs the existing setup before exposing tools. Neither agent nor this
   integration preparation may initialize it or inspect its verifier/secret. Exclude
   the secret from agent/API/tool environments, files, chat, histories, and logs.
   Clean environments must not expose arbitrary Python import or database overrides.
5. Permit the trusted recovery executor local HTTP access only to `127.0.0.1:8001`
   (or the explicitly supported localhost equivalent). Investigator has no probe
   requirement. Keep the API loopback-only and on port 8001. Human starts or confirms
   the existing service with the same database; no agent gets service-management
   access. No Docker socket, Docker commands, unrestricted shell, sudo, cloud,
   production, arbitrary network, or other-project access is needed.
6. Confirm both existing agents are members of `deployguard-incidents`; confirm
   the intended humans can instruct them and the Investigator can hand off to
   Recovery. Link the human's Mattermost identity if required. Do not change server
   settings. Authorize narrowly scoped room context reads and message posting, plus
   a targeted handoff only if needed. No room creation/admin, credential, deployment,
   or cross-project Switch tools are required. Keep bypass/unrestricted permissions
   disabled and review actual tool permissions before launch.
7. Human reviews the runbook and approves a later controlled startup. Validate a
   real room/thread exchange then; repository tests cannot establish Switch delivery,
   runtime permissions, or identity isolation. Recovery still needs a fresh scoped
   human approval for every new rollback.

See [demo execution](demo.md) for the staged operator workflow and manual Switch
messages. The automated test report is in [test-results.md](test-results.md).
