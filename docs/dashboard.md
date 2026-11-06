# Incident Command Center — website-first demo

DeployGuard AI now supports the browser-led incident-to-recovery workflow. The React
application reads operational evidence; a separate, script-free human operator
console authenticates, issues scoped approval, executes explicit rollback, and
shows actual HTTP verification. The existing CLI remains available as a fallback.

## Start the application once before the demonstration

Use the existing Python environment and Node 22.12+ or Node 24. Start the following
three services in separate terminals. No credential belongs in any startup command,
frontend environment file, or server environment. If port 8001 is already occupied,
restart that existing API from its original terminal to load the updated `/status`.
The implementation did not stop the original API or alter its live database.

Checkout API:

```bash
cd /home/awnish/projects/deployguard-ai
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Protected operator gateway (one worker; no forwarded client identity):

```bash
cd /home/awnish/projects/deployguard-ai
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python -m uvicorn app.operator:app --host 127.0.0.1 --port 8003 --workers 1 --no-access-log --no-proxy-headers
```

Frontend:

```bash
cd /home/awnish/projects/deployguard-ai/frontend
npm ci
env -u DEPLOYGUARD_HUMAN_SECRET npm run dev
```

Open **http://127.0.0.1:5173** in a private browser window. The existing human
approval verifier must already be initialized, as in the working MVP. A fresh
installation still requires the one-time human-only bootstrap in README section F;
the website cannot initialize or replace the human credential. Never ask an agent
to perform that bootstrap or reveal the credential.

## Demonstration: only fault activation needs a terminal

1. Open Overview. The gateway records a real health observation if the current
   deployment has none. Confirm the recorded healthy state and active v1.0.0.
2. Activate the fault using the existing terminal tool:

   ```bash
   cd /home/awnish/projects/deployguard-ai
   env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python tools/reset_demo.py
   ```

3. Return to the website. The gateway notices the new deployment and makes one
   real GET /health request. The faulty release raises the real ValueError and
   records HTTP 503, traceback, incident, and audit evidence. The dashboard detects
   this on its next read-only refresh, five seconds by default for new preferences.
   Existing saved polling preferences are preserved; choose five seconds in Settings
   for a fast demonstration. No curl, manual checkout, or repeated health polling is
   required. There is no browser fault-injection endpoint.
4. Open the incident and inspect its actual evidence. Click **Copy investigation
   brief**, then paste the reviewed evidence into the configured Switch/Mattermost
   room. The room link is configured in Settings. Sending and AI analysis remain
   manual collaboration; no fake agent messages or invented analysis are displayed.
5. Click **Review recovery**. The selected incident is carried into Recovery Center.
6. When **Gateway connected** is shown, click **Open protected operator console**.
   A separate localhost tab opens on port 8003. The browser's native authentication
   dialog asks for username **operator** and the existing human approval credential.
   Enter it only in that browser-owned dialog, never in React, chat, or a page field.
7. Review the selected incident, deployment, failure, and fixed target v1.0.0. Check
   the evidence-review confirmation and click **Issue scoped approval**. This calls
   the original credential-validated approval function: exact incident, exact target,
   action rollback, five-minute expiration, single use.
8. Type **ROLLBACK** in the explicit confirmation field and click **Execute approved
   rollback**. The gateway uses the approval issued in this operator session; the
   browser supplies no approval ID, target, database path, API URL, or command.
9. Inspect the actual five verification results. A failure remains a failure. If
   execution committed but verification failed, **Retry verification** performs
   checks only; it does not execute rollback again.
10. Return to Recovery Center or the original dashboard tab. Recorded results
    refresh automatically on focus and through polling. Confirm v1.0.0, healthy
    recorded health, consumed approval, verified checks, and resolved incident.
11. Open Activity for the actual authentication, approval, rollback, and verification
    events. Export the audit if useful. Manually relay measured results to Buddy for
    the final assessment. Close the private window after the demonstration to clear
    the browser's cached native authentication.

If the gateway is stopped or unreachable, controls explicitly say **Browser recovery
unavailable**. There is no simulated success or unauthenticated fallback. Use the
existing **Open operator runbook** CLI fallback if necessary.

## How the boundary works

React never collects, sends, stores, or receives the human credential. Approval and
execution are native HTML form posts on a different origin, with no JavaScript or
password input on the operator pages. The browser-owned HTTP authentication dialog
sends the credential directly to the gateway. The checkout API and Switch agents
never receive it. No human credential is loaded from an environment or file by the
gateway, and none is retained in the session store.

Every protected request authenticates against the existing verifier. Every mutation
also requires an unexpired HttpOnly, SameSite=Strict session cookie, exact Origin
and Host, same-origin Fetch Metadata when present, and a constant-time CSRF token
check. A mutation rotates its CSRF token, rejecting replay; per-session locking
serializes concurrent forms. Approvals issued by another session cannot be adopted
from public audit metadata. All original atomic rollback validations remain in place.

The gateway accepts direct loopback traffic only, rejects forwarded identity/host
headers, disables framing and scripts, uses no third-party resources, and returns
no-store responses. Fields are allowlisted; unknown/duplicate fields and arbitrary
targets, commands, API destinations, or database paths are rejected. Both approval
and execution first confirm the fixed HTTP API uses the same deployment/database.
Verification uses a new HTTP client with environment proxies and redirects disabled.

The gateway monitor is an explicit startup service, not a side effect of GET /status.
Every two seconds it reads persisted deployment state; if a release already has an
observation, it does not probe it again. It also leaves a newly committed recovery
to its verification workflow. Its HTTP probe goes only to the fixed checkout API.
Use one gateway worker. Dashboard polling remains read-only and never calls /health.

Full threat model and limitations: [operator security](operator-security.md).

## Application pages and integrations

| Page | Implemented behavior | Real source |
| --- | --- | --- |
| Overview | Recorded health, active release, incident counts, latest recovery, actual observation bars, releases, audit feed | /status, /incidents, /deployments, /audit |
| Incidents | Search/filter, full detail, IDs, endpoint failures, traceback, explicitly recorded reports, investigation brief and room link | /incidents, /incidents/{id}, /audit, /status |
| Recovery Center | Incident selection, approval metadata, protected-console availability/link, actual five checks, history, CLI fallback | Read APIs and GET /api/operator-status |
| Protected operator console | Native authentication, review, scoped approval, explicit execution, results and verification-only retry | Existing approval/rollback/verification functions behind authentication and CSRF |
| Activity | Newest-first timeline, filters including operator authentication, incident search, expandable JSON and export | GET /audit |
| Agents | Documented Buddy workflow, stopped specialist roles, future integration, configurable room link | Repository facts; no invented live-status API |
| Settings | Themes, accent, density, reduced motion, polling, timezone, sidebar, notifications, room URL and limitations | Non-sensitive local preferences |

GET /status remains a pure SQLite read-only snapshot, never selects human_auth,
and adds no schema migration. GET /version is also allowlisted through Vite. The
frontend proxy accepts no mutations, including on /api/operator-status; it never
proxies the protected forms or credential-bearing requests. All protected actions
stay on the separate fixed gateway origin.

Dark/light/system themes, three accents, comfortable/compact density, reduced motion,
sidebar collapse, timezone, polling, in-app notifications, and the HTTP(S) room URL
persist under deployguard.preferences.v1. Polling choices are 5/15/30/60/120 seconds;
background interval polling pauses when hidden. Returning to the tab refetches read
queries immediately. Damaged preferences reset safely. No sample data replaces an
unavailable API; cached evidence is visibly stale after a connection failure.

## Validation commands

Run backend tests before browser tests; pytest recreates its isolated base directory.
Never run these concurrently against the same .pytest_tmp base.

```bash
cd /home/awnish/projects/deployguard-ai
env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB .venv/bin/python -m pytest -q
cd frontend
npm run typecheck
npm test
npm run build
npm audit
npm run test:e2e
npm run test:operator
```

Playwright needs an installed Chromium. Use `npx playwright install chromium` once
if necessary, or set DEPLOYGUARD_TEST_BROWSER to an existing compatible executable.
The operator suite starts a fresh isolated database with a public synthetic test
credential and real HTTP services on API 8004, gateway 8003, and frontend 5175. Its
ports must be free; stop your own demo gateway before this suite. The tests refuse
to reuse an already running operator service and never stop it on your behalf. Its
only fault activation is the existing reset_demo.py tool. It performs real native
browser authentication, approval, rollback, and verification. It never uses the live
demo database or the real human credential. Browser traces are disabled for this
credential-bearing test flow; synthetic credentials never enter page JavaScript.

The original read-only visual suite uses API 8002 and frontend 5174 against existing
recorded demo history; it performs no live approval or recovery. Both suites stop
their own servers. All original authorization and rollback tests remain in place.
Recorded results: [test results](test-results.md).

## File inventory

Frontend: src/App.tsx, main.tsx, styles.css; pages/Overview.tsx, Incidents.tsx,
Recovery.tsx, Activity.tsx, Agents.tsx, Settings.tsx; components/ui.tsx,
IncidentTable.tsx, Timeline.tsx, OperatorControls.tsx; lib/api.ts, data.tsx,
types.ts, format.ts, preferences.tsx; unit tests, e2e/, e2e-operator/;
Vite/Playwright configs, package.json, package-lock.json, tsconfig.json, index.html,
and public/favicon.svg.

Backend additions: app/operator.py, operator_auth.py, operator_monitor.py,
operator_views.py, and the read-only /status route in app/main.py. No original
approval/rollback implementation or database schema was changed. Tests:
tests/test_dashboard.py, test_operator.py, browser_operator_stack.py.

## Before submission

Start/restart the three services, configure the real Mattermost room URL, and
rehearse with the human's existing credential in a private window. Record the demo
using actual evidence and verification. Live Switch specialist orchestration,
production authentication/TLS/OS isolation, and infrastructure recovery remain
outside scope. Both specialist agents remain stopped. No Git commits/pushes,
Docker commands, other-project changes, or Switch configuration changes were made.
