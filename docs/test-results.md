# Test results and demonstration scope

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
