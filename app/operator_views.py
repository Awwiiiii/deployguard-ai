"""Escaped, script-free operator pages. Credentials never enter HTML or a DOM input."""

import html
import json
from urllib.parse import quote

from app.database import active_deployment, decode
from app.models import GOOD_RELEASE

CHECKS = {"version": "Active release matches target", "health": "Health endpoint passes",
          "checkout": "Checkout request succeeds", "audit": "Rollback recorded in audit",
          "persisted_deployment": "Deployment persisted correctly"}


def esc(value):
    return html.escape(str(value), quote=True)


def page(title, content, frontend_url):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · DeployGuard Operator</title><style>
    :root{{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0b0e13;color:#e9ecf2}}*{{box-sizing:border-box}}body{{margin:0;padding:32px 20px}}main{{max-width:850px;margin:auto}}header{{display:flex;gap:12px;align-items:center;margin-bottom:30px}}.mark{{color:#8de9c2;border:1px solid #8de9c245;border-radius:9px;padding:10px}}.eyebrow{{font-size:10px;letter-spacing:2px;color:#8de9c2}}h1{{font-size:27px;letter-spacing:-.8px;margin:10px 0}}h2{{font-size:17px;margin:0 0 17px}}h3{{font-size:14px}}p{{font-size:13px;line-height:1.8;color:#a2aaba}}a{{color:#8de9c2}}.panel{{border:1px solid #28313d;border-radius:12px;padding:24px;background:#11151c;margin:20px 0}}.notice{{border-left:3px solid #8de9c2;padding:10px 16px;background:#8de9c20b}}.error{{border-color:#f0939d;color:#f0939d}}.error p{{color:inherit}}.success{{color:#8de9c2}}.muted{{color:#8996a8}}.tag{{font-size:11px;border:1px solid #35404e;border-radius:6px;padding:5px 9px;display:inline-block}}dl{{margin:0}}dl>div{{display:grid;grid-template-columns:155px minmax(0,1fr);gap:16px;padding:13px 0;border-bottom:1px solid #232a35;font-size:12px}}dt{{color:#8996a8}}dd{{margin:0;overflow-wrap:anywhere}}code,pre{{font-family:ui-monospace,Consolas,monospace;font-size:12px}}pre{{background:#0b0e13;border:1px solid #28313d;border-radius:8px;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}}button,.button{{font:inherit;font-size:13px;border:1px solid #8de9c2;background:#8de9c2;color:#10241d;border-radius:7px;padding:11px 16px;cursor:pointer;text-decoration:none;display:inline-block}}.secondary{{background:transparent;color:#8de9c2;border-color:#35404e}}button:disabled{{opacity:.45;cursor:not-allowed}}input[type=text]{{font:inherit;width:100%;background:#0b0e13;border:1px solid #35404e;border-radius:7px;padding:12px;color:#e9ecf2;margin:9px 0 15px}}label{{display:block;font-size:13px;line-height:1.8;margin:12px 0}}input[type=checkbox]{{margin-right:8px}}.check{{display:flex;gap:12px;justify-content:space-between;padding:14px 0;border-bottom:1px solid #232a35;font-size:13px}}.actions{{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}}.small{{font-size:11px}}footer{{margin-top:30px;border-top:1px solid #232a35;padding-top:15px}}:focus-visible{{outline:2px solid #8de9c2;outline-offset:4px}}@media(max-width:550px){{body{{padding:24px 15px}}.panel{{padding:19px}}dl>div{{grid-template-columns:110px minmax(0,1fr);font-size:11px}}h1{{font-size:24px}}}}
    </style></head><body><main><header><span class="mark" aria-hidden="true">◇</span><div><strong>DeployGuard AI</strong><div class="small muted">Protected operator console · separate localhost origin</div></div></header>{content}<footer><p class="small">Credentials are handled by the browser's native HTTP authentication dialog and this gateway. This page has no JavaScript, password input, or third-party resources. Close the private browser window after the demonstration to clear cached native credentials.</p><a href="{esc(frontend_url)}/recovery">Back to Recovery Center</a></footer></main></body></html>'''


def render_incident(db, incident_id, session, frontend_url):
    with db.read() as connection:
        row = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        if not row:
            from app.models import DomainError
            raise DomainError("incident_not_found", "Incident not found", 404)
        incident = decode(row, "evidence")
        active = active_deployment(connection)
        approval = connection.execute("SELECT * FROM approvals WHERE id=? AND incident_id=?", (session.approvals.get(incident_id), incident_id)).fetchone()
        recovery_row = connection.execute("SELECT * FROM recoveries WHERE incident_id=? ORDER BY executed_at DESC LIMIT 1", (incident_id,)).fetchone()
        recovery = decode(recovery_row, "verification") if recovery_row else None
    path = f"/operator/incidents/{quote(incident_id, safe='')}"
    csrf = f'<input type="hidden" name="csrf_token" value="{esc(session.csrf)}">'
    eligible = incident["status"] == "open" and incident["deployment_id"] == active["id"] and active["version"] == "v1.1.0"
    evidence = incident["evidence"]
    content = f'''<div class="eyebrow">AUTHENTICATED HUMAN OPERATOR</div><h1>Review and authorize recovery</h1><p class="notice">You are on the protected gateway. Review the evidence, issue an exact approval, then explicitly confirm rollback. The React dashboard never receives your credential.</p>
    <section class="panel"><h2>Selected incident</h2><dl><div><dt>Incident ID</dt><dd><code>{esc(incident_id)}</code></dd></div><div><dt>Incident status</dt><dd>{esc(incident['status'])}</dd></div><div><dt>Deployment ID</dt><dd><code>{esc(incident['deployment_id'])}</code></dd></div><div><dt>Recorded failure</dt><dd>{esc(incident['observed_failure'])}</dd></div><div><dt>Endpoint</dt><dd>{esc(evidence['endpoint'])} · HTTP {esc(evidence['http_status'])}</dd></div><div><dt>Current release</dt><dd>{esc(active['version'])}</dd></div><div><dt>Allowlisted target</dt><dd>{esc(GOOD_RELEASE)}</dd></div></dl><h3>Actual error traceback</h3><pre>{esc(evidence['traceback'])}</pre></section>'''
    if eligible:
        content += f'''<section class="panel"><h2>1. Issue scoped approval</h2><p>This authorizes only this incident, action rollback, target {esc(GOOD_RELEASE)}, for five minutes, once. Existing backend validation remains authoritative.</p><form method="post" action="{path}/approve">{csrf}<label><input type="checkbox" name="reviewed" value="yes" required>I reviewed the failure, deployment, and proposed rollback.</label><button type="submit">Issue scoped approval</button></form></section>'''
    else:
        content += '<p class="notice">This incident is not eligible for a new rollback. Only an open incident on the active failing deployment can be approved.</p>'
    if approval:
        from datetime import datetime, timezone
        usable = not approval["consumed_at"] and datetime.fromisoformat(approval["expires_at"]) > datetime.now(timezone.utc)
        content += f'''<section class="panel"><h2>2. Explicitly execute approved rollback</h2><dl><div><dt>Approval</dt><dd><code>{esc(approval['id'])}</code></dd></div><div><dt>Expires at (UTC)</dt><dd>{esc(approval['expires_at'])}</dd></div><div><dt>Single use</dt><dd>{'Consumed' if approval['consumed_at'] else 'Available' if usable else 'Expired'}</dd></div></dl>'''
        if usable and eligible:
            content += f'''<form method="post" action="{path}/execute">{csrf}<label for="confirmation">Type ROLLBACK to explicitly confirm {esc(incident_id)} → {esc(GOOD_RELEASE)}.</label><input id="confirmation" name="confirmation" type="text" autocomplete="off" pattern="ROLLBACK" required><button type="submit">Execute approved rollback</button></form>'''
        content += '</section>'
    if recovery:
        verification = recovery["verification"]
        content += f'''<section class="panel"><h2>Recorded recovery result</h2><p><code>{esc(recovery['id'])}</code> · {esc(recovery['previous_version'])} → {esc(recovery['target_version'])}</p>'''
        if verification:
            content += f'<h3 class="{"success" if verification["status"] == "verified" else "error"}">{esc(verification["status"].replace("_", " ").capitalize())}</h3>'
            for key, label in CHECKS.items():
                result = verification["checks"].get(key)
                content += f'<div class="check"><span>{esc(label)}</span><strong class="{"success" if result else "error"}">{"Passed" if result is True else "Failed" if result is False else "Not run"}</strong></div>'
            content += f'<details><summary>Actual verification evidence</summary><pre>{esc(json.dumps(verification["evidence"], indent=2))}</pre></details>'
        else:
            content += '<p>Rollback committed. Verification is not recorded yet.</p>'
        if not verification or verification["status"] != "verified":
            content += f'<form method="post" action="{path}/verify">{csrf}<p>Retry checks only. This never executes a second rollback.</p><button type="submit">Retry verification</button></form>'
        content += '</section>'
    content += f'<div class="actions"><a class="button secondary" href="{esc(frontend_url)}/recovery?incident={quote(incident_id, safe="")}">Return to Recovery Center</a><a class="button secondary" href="{esc(frontend_url)}/activity">View recorded audit history</a></div>'
    return page("Human-authorized recovery", content, frontend_url)
