# Test results and demonstration scope

## Website-first protected recovery — 2026-11-07

| Check | Result |
| --- | --- |
| Expanded backend suite | **98 passed**, including all original 60; one existing warning |
| Frontend state and gateway-link tests | **23 passed** across 5 files |
| TypeScript and production build | Passed |
| Complete browser-led recovery and cross-origin rejection | **2 passed** against real loopback HTTP services |
| Six-page dark/light responsive and read-only regression suite | **10 passed** at 1440px, 768px, and 390px |

The final backend run completed in 13.66 seconds; frontend tests in 4.23 seconds;
the full browser operator suite passed in 13.6 seconds, including mobile form/result
layout and screenshots. The read-only browser suite passed in 33.5 seconds. A final
targeted proxy test also passed after adding the gateway-availability mutation case.

The browser-led test starts with a fresh isolated database and public synthetic
credential. It shows an actual healthy observation, invokes the existing reset tool
as the only in-demo terminal action, and waits for the gateway's single real HTTP
health failure and the dashboard's automatic incident update. It copies the exact
investigation evidence, preserves the selected incident into Recovery Center, opens
the separate operator origin, authenticates through Chromium's native HTTP stack,
checks the review confirmation, issues approval, types ROLLBACK, and executes.
It verifies all five real checks, the consumed approval, resolved incident, recovered
v1.0.0, automatic React refresh on focus, and actual audit events. Another browser
test proves cross-origin dashboard JavaScript cannot call the protected mutations.

Assertions also cover absent credential/password input/scripts in operator HTML,
HttpOnly cookies hidden from page JavaScript, no credential in localStorage or copied
brief, native same-origin form headers, and no native Authorization header leaking
to frontend requests. Operator traces are disabled. The real human credential and
the live demo database were not used for this mutation workflow. The gateway, API,
and frontend test services run on ports 8003, 8004, and 5175 and stop afterward.

The 29 gateway/monitor backend cases cover missing/invalid authentication, throttling,
exact Origin, CSRF (including malformed tokens), missing/expired sessions, cookie-only
requests, approval/session isolation, unknown fields and arbitrary destinations,
remote/forwarded/rebinding requests, explicit confirmation, original approval expiry
and stale scope, API/database mismatch, concurrent single execution, failed
verification and safe retry, and actual observation deduplication across refreshes.
The original approval and rollback implementation was not modified.

For handoff, the existing live API on 8001 and Vite on 5173 were already running.
Read-only checks confirmed live v1.0.0 and a recorded HTTP 200. The protected gateway
was then started on 8003 without a credential environment, with one worker, no access
logs, and no forwarded identity. Its public availability was verified through the
actual frontend proxy. No live human authentication, fault activation, or recovery
was executed by the implementation agent. The gateway remains running for the human demo.

Browser operations are now implemented; the earlier read-only-only recovery decision
below records the previous stage. When the gateway is unavailable, the website
explicitly disables browser recovery and retains the working CLI fallback.
The boundary is demo-only trusted loopback HTTP with browser-native credential
caching, not enterprise identity, TLS, or OS isolation. See
[operator security](operator-security.md) and [website-first demo](dashboard.md).

## Incident Command Center verification — 2026-11-07

| Check | Result |
| --- | --- |
| Original backend suite after adding `/status` | **60 passed**, 1 existing warning, 7.53 seconds |
| Expanded backend suite | **69 passed**, 1 existing warning, 8.53 seconds |
| Frontend critical-state tests | **20 passed** across 4 files |
| TypeScript (`npm run typecheck`) | Passed |
| Production build (`npm run build`) | Passed; route chunks generated; no chunk-size warning |
| Chromium real-API suite | **10 passed**, 34.2 seconds |
| npm dependency audit, including dev dependencies | **0 vulnerabilities** |

The original 60 backend tests remain unchanged. Nine new cases in
`tests/test_dashboard.py` prove repeated status reads leave database bytes unchanged,
unobserved releases stay unobserved, actual failures are not re-recorded, recovery
checks and approval consumption match persisted state, credential material is not
returned, and unauthenticated browser-style mutation routes are absent/rejected.

Frontend tests exercise pending data, API failure without mock substitution,
unexpected HTML responses, missing-endpoint guidance, empty lists, search/status
filters, exact incident evidence, unverified investigation commentary, read-only
CLI recovery, failed-check rendering, persisted appearance/accessibility settings,
damaged preferences, URL validation, timezone formatting, and command navigation.
Synthetic fixtures exist only in test files and are not imported by the app.

Chromium visited all six pages at **1440px, 768px, and 390px** in **dark and light**
themes, checking headings, connectivity, browser exceptions, and root horizontal
overflow. It also checked actual incident tracebacks, CLI runbook dialogs, keyboard
navigation, saved theme preferences, reduced motion, mobile navigation, skeletons,
backend disconnection, and settings access while offline. Mutation attempts through
the frontend proxy return 404/405, and the before/after real snapshot is identical.
Screenshots are local ignored artifacts in `frontend/test-results/`.

After refining the copyable approval command to prompt only inside the trusted
terminal, TypeScript, all 20 frontend tests, and the production build passed again.
The targeted real-API incident/runbook browser check also passed (1 test, 4.0 seconds).

The browser suite started a second updated FastAPI process on **127.0.0.1:8002**
and Vite on **127.0.0.1:5174**, using the existing persisted demo data through real
HTTP GETs. Playwright stopped those QA servers afterward. The original API process
on 8001 was not stopped and needs a restart to load the new route. Browser tests did
not inject faults, issue real approval, perform recovery, or probe `/health` on
the live demo. Only the test browser's explicit loading/offline cases intercept
responses. No live human credential was accessed; backend authorization tests use
isolated databases and synthetic credentials.

The dependency advisory found during initial setup was resolved by upgrading
Vitest. The final npm audit includes development dependencies and reports zero
vulnerabilities. Backend dependency versions were not changed. Browser execution
of recovery remains deferred; tests verify the read-only boundary and retain the
original suite's authorization/atomicity guarantees.

Commands and browser prerequisites: [dashboard runbook](dashboard.md#validation-commands).

## Earlier integration and public-submission checks

Executed on 2026-11-07 from the repository root using the existing
Python 3.12.14 virtual environment. No dependency changes were made.

| Check | Result |
| --- | --- |
| Existing suite before changes | **48 passed**, 1 warning, 4.12 seconds |
| Full suite after integration preparation | **60 passed**, 1 warning, 7.34 seconds |
| Public-submission preparation (2026-11-07) | **60 passed**, 1 warning, 7.28 seconds |
| Python compilation (`app tools tests`) | Passed; exit 0 |
| `tools/demo.py --help` | Passed; lists `prepare`, `recover`, `verify`; no API access |

Commands:

```bash
env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python -m pytest -q
env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python -m compileall -q app tools tests
env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python tools/demo.py --help
```

The existing dependency warning is `StarletteDeprecationWarning`: using HTTPX with
Starlette TestClient is deprecated. It originates in the installed FastAPI/Starlette
test stack. No packages were changed to suppress it.

## Added checks

Twelve additional cases in [test_agent_interfaces.py](../tests/test_agent_interfaces.py)
exercise the agent-facing contract and the new human-operated demo driver:

- Missing-database inspection returns JSON failure without creating storage.
- Unknown-incident inspection returns a JSON domain error without changing database bytes.
- Report CLI appends exactly one untrusted report and creates no approval or recovery.
- Empty, whitespace-only, and oversized summaries each fail without writes (three cases).
- Reports for unknown incidents fail without writes.
- Missing and fabricated approval IDs both fail at the rollback CLI before HTTP verification
  and leave the broken deployment active (two cases).
- Staged demo measures actual healthy/failing application responses, records findings,
  proves denial, and pauses with no authorization/approval/recovery records. A separate
  test-only human step then permits verified recovery and verification-only retry
  without creating another recovery.
- Preparation refuses an already-broken deployment without mutation.
- Preparation rejects an API/database mismatch before fault activation or observation writes.

The original 48 cases continue to verify evidence, read-only snapshots, persisted
approval scope, credential validation, expiry, reuse/concurrency rejection, atomic
rollback, all recovery checks, verification failures/retries, and reset behavior.
No existing approval/recovery validation logic was modified.

## Scope and limits

Tests operate on disposable databases under `.pytest_tmp`, with public synthetic
test credentials only. Real incident/report/reset/denial CLIs run in subprocesses;
the recovery CLI runs in-process against TestClient for the staged demo test, so
verification never contacts the live service on port 8001. Existing recovery CLI
tests use the same in-process approach. No real human credential, live database,
Switch agent, Docker service, or other project is accessed by these checks.

Tests do not exercise live Switch delivery, runtime permissions, or OS isolation.
The public-submission run removed both `DEPLOYGUARD_HUMAN_SECRET` and `DEPLOYGUARD_DB`
from the test environment. The real credential and live database were not inspected
or used. Application behavior and dependencies were unchanged.

Separately, the operator reports successful live `v1.1.0` failure evidence, required
human approval, rollback to `v1.0.0`, and all five recovery checks passing. Switch
Buddy analyzed manually supplied evidence in Mattermost and produced a final
incident-resolution assessment. Recovery was human-executed; this does not demonstrate
autonomous recovery or prove the staged driver's live-network execution. That
credential-bearing workflow was not repeated during this audit. Private evidence
and chat transcripts are not bundled.

Both dedicated agents remain registered and stopped. Their room delivery and enforced
tool/process/filesystem restrictions still require the operator actions in
[the pre-start checklist](agent-integration.md#before-either-agent-starts).
