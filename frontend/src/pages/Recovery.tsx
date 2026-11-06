import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, CheckCheck, CircleDashed, ClipboardCheck, FileLock2, Fingerprint, KeyRound, LockKeyhole, RotateCcw, ShieldCheck, Terminal, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../lib/data'
import { formatDate, humanize, shortId } from '../lib/format'
import { usePreferences } from '../lib/preferences'
import { Badge, Button, CopyButton, Dialog, EmptyState, PageHeading, Panel, Select, StatusBadge } from '../components/ui'
import { Timeline } from '../components/Timeline'
import { OperatorControls } from '../components/OperatorControls'

const checkNames: Record<string, string> = { version: 'Active release matches target', health: 'Health endpoint passes', checkout: 'Checkout request succeeds', audit: 'Rollback recorded in audit', persisted_deployment: 'Deployment persisted correctly' }
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
export default function Recovery() {
  const { snapshot, incidents, events } = useData()
  const { preferences } = usePreferences()
  const [params, setParams] = useSearchParams()
  const [runbook, setRunbook] = useState(false)
  const selectedId = params.get('incident') ?? incidents.find(i => i.status === 'open')?.id ?? incidents[0]?.id
  const incident = incidents.find(i => i.id === selectedId)
  const recovery = snapshot?.recoveries.find(r => r.incident_id === selectedId)
  const approval = snapshot?.approvals.find(a => a.incident_id === selectedId)
  const approvalState = !approval ? 'Not issued' : approval.consumed_at ? 'Consumed' : new Date(approval.expires_at).getTime() <= Date.now() ? 'Expired' : 'Issued · validated on use'
  const target = snapshot?.active_deployment.id === incident?.deployment_id ? snapshot?.available_rollback_target : null
  const verification = recovery?.verification
  const checks = verification?.checks
  const history = events.filter(e => e.incident_id === selectedId && /approval|recovery|rollback/.test(e.event)).reverse()
  const approvalCommand = [
    '(',
    '  read -rsp \'Existing human approval credential: \' DG_OPERATOR_SECRET',
    '  printf \'\\n\'',
    `  DEPLOYGUARD_HUMAN_SECRET="$DG_OPERATOR_SECRET" .venv/bin/python tools/approve.py --incident-id ${shellQuote(selectedId ?? 'INCIDENT_ID')} --target v1.0.0 --ttl-seconds 300`,
    ')',
  ].join('\n')
  const rollbackCommand = `env -u DEPLOYGUARD_HUMAN_SECRET .venv/bin/python tools/rollback.py --incident-id ${shellQuote(selectedId ?? 'INCIDENT_ID')} --approval-id "$APPROVAL_ID"`
  const verifyCommand = `.venv/bin/python tools/rollback.py --incident-id ${shellQuote(selectedId ?? 'INCIDENT_ID')} --verify-only`
  const steps = [
    { icon: ClipboardCheck, title: 'Review incident', description: 'Inspect the actual failure and release scope.', complete: !!incident },
    { icon: Fingerprint, title: 'Authenticate operator', description: 'Browser-native sign-in at the protected console.', complete: !!approval },
    { icon: KeyRound, title: 'Issue scoped approval', description: 'Exact incident, target, expiration, single use.', complete: !!approval },
    { icon: RotateCcw, title: 'Confirm & execute', description: 'Explicitly confirm the approved rollback.', complete: !!recovery },
    { icon: CheckCheck, title: 'Verify recovery', description: 'Five recorded checks confirm the outcome.', complete: verification?.status === 'verified' },
  ]
  return <><PageHeading eyebrow="HUMANS IN COMMAND" title="Recovery center" description="A deliberate path from failure to a verified recovery."><Badge><LockKeyhole size={12} />Human-only execution</Badge><Button variant="secondary" onClick={() => setRunbook(true)}><Terminal size={15} />Open operator runbook<ArrowUpRight size={15} /></Button></PageHeading>
    <div className="recovery-boundary"><span className="boundary-icon"><ShieldCheck size={23} /></span><div><strong>Review. Authorize. Explicitly recover.</strong><p>Human authentication and recovery actions use a separate protected console. This dashboard never handles the operator credential.</p></div><Badge tone="success">Human authorization required</Badge></div>
    <OperatorControls incidentId={selectedId} />
    {!incident ? <Panel><EmptyState icon={ShieldCheck} title="No incidents to recover" description="When the backend detects a failure, select the incident here to review the controlled recovery workflow." /></Panel> : <>
      <div className="recovery-selector"><div><span className="field-label">SELECT INCIDENT</span><Select label="Select incident for recovery" value={incident.id} onChange={id => setParams({ incident: id })} options={incidents.map(i => ({ value: i.id, label: `INC-${shortId(i.id).toUpperCase()} · ${i.evidence.endpoint} · ${i.status}` }))} /></div><Link className="text-link" to={`/incidents/${incident.id}`}>Review full evidence<ArrowUpRight size={15} /></Link></div>
      <div className="recovery-steps">{steps.map((step, i) => <div key={step.title} className={`recovery-step ${step.complete ? 'complete' : ''}`}><span className="step-number">{step.complete ? <Check size={17} /> : <step.icon size={17} />}</span><div><span className="step-label">STEP 0{i + 1}</span><h3>{step.title}</h3><p>{step.description}</p></div></div>)}</div>
      <div className="recovery-grid"><Panel title="Recovery scope" subtitle="Bound to the selected incident" action={<StatusBadge status={incident.status} />}><div className="release-transition"><div><span className="field-label">CURRENT RELEASE</span><strong className="mono">{snapshot?.active_deployment.version ?? '—'}</strong><span>Active deployment</span></div><span className="release-arrow"><ArrowRight size={20} /></span><div><span className="field-label">{recovery ? 'EXECUTED TARGET' : 'PROPOSED TARGET'}</span><strong className="mono tone-success">{recovery?.target_version ?? target ?? '—'}</strong><span>{recovery ? 'From recorded recovery' : target ? 'Allowlisted rollback release' : 'No target for this incident'}</span></div></div><dl className="details-list"><div><dt>Incident</dt><dd className="mono break-all">{incident.id}</dd></div><div><dt>Failing release</dt><dd className="mono">{incident.version}</dd></div><div><dt>Failure</dt><dd>{incident.observed_failure}</dd></div><div><dt>Authorization</dt><dd><Badge tone={approval?.consumed_at ? 'success' : 'neutral'}>{approvalState}</Badge></dd></div>{approval && <div><dt>Approval expiration</dt><dd>{formatDate(approval.expires_at, preferences.timezone, true)}</dd></div>}<div><dt>Recovery action</dt><dd>{recovery ? 'Approved rollback recorded' : 'No rollback recorded for this incident'}</dd></div></dl><div className="scope-footer"><FileLock2 size={15} /><span>Approval metadata is informational. The backend validates the full scope atomically at execution.</span></div></Panel>
      <Panel title="Verification checks" subtitle="Actual results from the latest recorded recovery" action={<Badge tone={verification?.status === 'verified' ? 'success' : verification ? 'warning' : 'neutral'}>{verification ? humanize(verification.status) : 'Not executed'}</Badge>}><div className="verification-list">{Object.entries(checkNames).map(([key, label]) => {
        const result = checks?.[key]
        return <div className="verification-row" key={key}><span className={`check-icon ${result === true ? 'passed' : result === false ? 'failed' : ''}`}>{result === true ? <Check size={15} /> : result === false ? <X size={15} /> : <CircleDashed size={16} />}</span><span>{label}</span><span className={`check-state ${result === true ? 'tone-success' : result === false ? 'tone-danger' : ''}`}>{result === true ? 'Passed' : result === false ? 'Failed' : 'Not run'}</span></div>
      })}</div><div className="verification-note"><ShieldCheck size={18} /><p>{recovery?.verified_at ? `Verified ${formatDate(recovery.verified_at, preferences.timezone, true)}` : 'Checks appear after authenticated recovery and actual HTTP verification.'}</p></div>{verification && <details className="verification-evidence"><summary>Inspect raw verification evidence</summary><pre>{JSON.stringify(verification.evidence, null, 2)}</pre></details>}</Panel></div>
      <Panel title="Recovery history" subtitle="Approval, execution, and verification for this incident" action={<Badge>{history.length} events</Badge>}><Timeline events={history} expandable /></Panel>
    </>}
    <Dialog open={runbook} onClose={() => setRunbook(false)} title="Human operator runbook" wide><div className="info-strip"><LockKeyhole size={18} /><p>These commands are copied for a trusted terminal. The browser does not authenticate, issue approval, or execute recovery.</p></div><ol className="runbook-steps"><li><h3>Review and authenticate</h3><p>Review the selected incident. Use the established human-only credential procedure in the repository README. Keep the credential in your trusted terminal, outside the API and agents.</p><code>{selectedId ?? 'Select an incident before issuing approval.'}</code></li><li><h3>Issue an exact, expiring approval</h3><p>The human-only process requires the existing operator credential. Only an open incident on the active failing deployment can be approved.</p><pre>{approvalCommand}</pre><CopyButton text={approvalCommand} label="Copy approval command" /></li><li><h3>Explicitly confirm and execute</h3><p>Review the approval output. In a terminal without the human credential, enter the returned approval ID, then execute the exact rollback command below.</p><pre>{'read -rp \'Approval ID: \' APPROVAL_ID\n' + rollbackCommand}</pre><CopyButton text={'read -rp \'Approval ID: \' APPROVAL_ID\n' + rollbackCommand} label="Copy recovery commands" /></li><li><h3>Review all verification results</h3><p>Return to this page after CLI execution. If the rollback committed but verification failed, retry verification only. Do not issue a second rollback.</p><pre>{verifyCommand}</pre><CopyButton text={verifyCommand} label="Copy verification command" /></li></ol><p className="muted small">Run commands from /home/awnish/projects/deployguard-ai. The backend must be listening at http://127.0.0.1:8001. Full human-only setup: README.md, sections F–G.</p></Dialog>
  </>
}
