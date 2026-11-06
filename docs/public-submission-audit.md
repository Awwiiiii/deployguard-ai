# Public-submission audit

Audit date: 2026-11-07. Scope: this DeployGuard AI repository only. Public source,
tests, agent instructions, documentation, and project configuration were reviewed;
private runtime/configuration paths were inventoried by name and ignore status.
Private configuration, live SQLite contents, and the human approval credential were
not opened. Application behavior and dependency versions were unchanged.

## Security findings

- No apparent real API keys, credentials, private keys, or human approval secrets were
  found in publication candidates by source review and a redacted pattern scan.
- Scan matches were reviewed: the deliberately public synthetic credential fixture,
  an invalid credential-bearing URL used to test rejection, and README variable
  references. None is an operator credential. Pattern scanning is not proof that
  every possible secret is absent.
- The live evidence database exists locally and is ignored. It can contain approval
  verifiers, authorizations, incident evidence, and personal traceback paths; do not
  publish it. It was not opened during this audit.
- Local `.codex/` configuration was initially eligible for publication. It is now
  ignored without reading its contents. Local agent, cloud, editor, and private
  runtime directories are also excluded.
- Ignore checks cover SQLite databases/sidecars/backups, local environment files,
  virtual environments, caches, private evidence/logs, credential directories, and
  key files. `.env.example` is deliberately publishable for a future sanitized
  sample; none exists. `evidence/.gitkeep` remains publishable.
- Personal absolute home paths in documentation and agent instructions were replaced
  with repository-root instructions. Generated test warnings/logs can still display
  local paths and should be reviewed before sharing.

No commits or tracked files existed at inspection, so there was no committed history
to scan or rewrite. Ignore rules are preventive; forced additions can still publish
private files. Review the eventual staged diff before committing.

## Validation and demonstrated scope

All **60 tests passed in 7.28 seconds**, with one existing Starlette/HTTPX deprecation
warning. Tests ran without the real approval-secret or database-override variables,
using disposable project-local databases and synthetic credentials. No live recovery
was performed during this audit. Application source and tests remain unchanged.
Python compilation passed. Final review covered 32 publication candidates; all 33
local documentation links and 21 Bash code blocks passed link/anchor and syntax
checks respectively. No unexpected binary/database candidates, personal home paths,
or trailing whitespace were found in those files.

The operator-reported Switch demonstration used manual relay to Buddy, AI-assisted
analysis, human-issued approval, human-executed recovery, five passing verification
checks, and a final Buddy assessment. Dedicated agents remain stopped. Specialist
handoff, enforced tool isolation, and agent execution remain planned.

## Publication readiness and remaining items

The reviewed source and documentation are prepared for public submission, subject to
the owner's final staged-file review and the event's submission requirements:

- No initial commit exists, and no public GitHub URL is documented. Commit and push
  remain owner actions; this audit creates neither.
- No license file exists. The owner should choose a license if open-source reuse
  or event rules require one; publication alone does not grant an open-source license.
- No dependency lockfile or CI workflow exists. Bounded requirements install locally,
  but exact future dependency resolution is not guaranteed.
- The test stack emits a deprecation warning; it does not fail the suite.
- Sanitized live screenshots/video/transcripts are not bundled. Add reviewed demo
  artifacts if required by the event; live results are currently operator-reported.
- Switch/Mattermost access is external to the repository. Backend tests do not prove
  Switch connectivity, specialist delivery, or process isolation.

No Docker commands, Switch configuration changes, access to other projects, approval
credential access, Git commits, or pushes were performed.
