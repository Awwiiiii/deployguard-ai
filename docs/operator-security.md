# Human operator gateway: local demonstration boundary

This is a narrowly scoped localhost demo control surface, not production enterprise
authentication or OS isolation. The gateway runs as a separate process and uses the
verified human operator principal. It does not grant the React app or Switch agents
that identity. It runs under the operator's existing OS account; an unrestricted
same-user process can still tamper with code or SQLite, as in the original MVP.

## Credential handling

- The React app links to the fixed different origin http://127.0.0.1:8003.
- The browser's native HTTP authentication challenge collects username `operator`
  and the existing human credential. There is no HTML password input, React state,
  fetch Authorization construction, URL credential, frontend environment secret,
  localStorage secret, or sessionStorage secret.
- The gateway verifies the supplied credential against the original scrypt verifier.
  Approval calls the original `issue_approval` with the request's credential. The
  value exists transiently in the gateway request only; sessions retain no credential.
- Every protected GET and POST authenticates. A cookie alone cannot authorize action.
- The gateway does not load the credential from a file or environment. It never
  initializes/replaces the existing verifier. Agents receive no credential or session.
- Requests to the checkout API use a new HTTP client without operator headers.
  The browser's authentication is scoped to the separate origin, not the frontend.
- No code logs Authorization, passwords, form bodies, or session tokens. The documented
  gateway launch disables access logs and forwarded proxy identity. Operator browser
  traces are disabled in automated tests. Only synthetic credentials are used by tests.

The authentication protocol and browser-owned challenge are described in the
[MDN HTTP authentication guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Authentication).
HTTP Basic is not encryption: this implementation uses HTTP on loopback and must
stay on a trusted local machine. TLS and enterprise identity/session revocation
require a separate production design. The browser can cache native credentials;
close the private window after demonstrating. No fake logout claim is made.

## Mutation protection

Native forms accept only CSRF plus review confirmation, typed `ROLLBACK`, or a
verification-only request. The incident comes from an allowlisted path format.
The browser cannot provide an approval ID, rollback target, database path, API URL,
shell command, or SQL. Unknown and duplicate form fields are rejected.

Every mutation requires all of:

1. Direct loopback client and exact Host; forwarded identity/host headers rejected.
2. Exact `Origin: http://127.0.0.1:8003` and same-origin Fetch Metadata when present.
3. A verified native human credential, subject to failed-authentication throttling.
4. An unexpired, random, HttpOnly, SameSite=Strict operator session cookie.
5. A constant-time, per-session CSRF check, rotated on each submission.
6. A fixed API/database deployment match before approval or execution.
7. For execution, a human approval issued in that operator session for this incident,
   plus an exact typed confirmation. IDs visible in audit cannot be adopted.

Session locking serializes concurrent forms. The existing rollback transaction still
validates incident/action/target binding, expiry, single use, open incident, and the
active failing deployment, then consumes approval and changes state atomically.
These validations were not removed or rewritten. All original tests remain.

Operator responses use no-store, no third-party resources, no JavaScript, no framing,
and CSP `form-action 'self'`. There is no gateway CORS allowance. The referrer policy
is `same-origin`, preserving the Origin on native same-origin forms while withholding
cross-origin referrers. Some referrer policies produce `Origin: null` for native
forms; the gateway rejects null rather than accepting it. See
[MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin)
and [CSP form-action](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action).

Cookies are not Secure on this HTTP loopback demonstration. Origin, authentication,
CSRF, and session checks are all required; SameSite alone is not the boundary.
The ten-minute in-memory session does not revoke the browser's cached native HTTP
credentials. Approval itself expires after five minutes and is consumed once.
Restarting the gateway discards its sessions/grants; an operator must review and issue
a fresh approval in the new session. CLI approval records remain governed by their
original expiration and consumption checks.

## Actual observation and verification

The startup monitor reads deployment state every two seconds. A new release with
no stored observation triggers one actual HTTP health request to the fixed API.
Existing observations suppress repeat probes, including after gateway restart.
Dashboard refreshes never trigger probes. Run one gateway worker. Other explicit
CLI/manual probes and recovery verification can still record their own real requests.

The gateway executes no subprocesses. Approved recovery calls the existing rollback
function and then actual HTTP verification against the fixed API. Failure remains
visible and never becomes an expected-success claim. Verification-only retry cannot
execute another rollback. The reset tool remains terminal-only.

## Test scope

Backend tests use isolated databases and public synthetic credentials to cover
unauthenticated/invalid authentication, throttling, missing/foreign Origin, CSRF,
session expiry, replay, cookie-only requests, session isolation, unknown parameters,
host/forwarding rejection, remote clients, explicit confirmation, approval expiry,
stale incidents, API mismatch, concurrent single execution, real verification, failed
verification/retry, and one actual observation per release.

The browser suite uses real loopback HTTP services and a fresh isolated database.
The existing reset_demo.py is its only fault-activation operation. Authentication
is supplied to Chromium's native HTTP stack outside page JavaScript. It checks actual
evidence copying, approval, rollback, all five checks, automatic React refresh,
audit history, absent credential in HTML/storage, HttpOnly cookies, and blocked
cross-origin script mutation. This is automated end-to-end testing, not a claim
that the operator's real credential or live recovery was rerun during implementation.

Switch credentials/configuration and stopped agents remain untouched. The new local
agent-instruction restrictions do not constitute OS isolation. Do not give agents
an unrestricted shell, operator browser profile, gateway credential, or session.
