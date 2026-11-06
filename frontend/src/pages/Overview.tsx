import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Box, Check, CircleAlert, Clock3, GitBranch, Layers, Radio, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../lib/data'
import { formatDate, health, relativeTime, shortId } from '../lib/format'
import { usePreferences } from '../lib/preferences'
import { isActive } from '../lib/types'
import { Badge, EmptyState, PageHeading, Panel, TextLink } from '../components/ui'
import type { Tone } from '../components/ui'
import { IncidentTable } from '../components/IncidentTable'
import { Timeline } from '../components/Timeline'

function Metric({ label, value, footnote, icon: Icon, tone = 'neutral', secondary }: { label: string; value: string | number; footnote: string; icon: LucideIcon; tone?: Tone; secondary?: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><Icon size={17} strokeWidth={1.6} /></div><div className={`metric-value tone-${tone}`}>{value}{secondary && <span className="metric-secondary">{secondary}</span>}</div><div className="metric-footnote"><span className={`tiny-dot tone-${tone}`} />{footnote}</div></div>
}
export default function Overview() {
  const { snapshot, incidents, deployments, events } = useData()
  const { preferences } = usePreferences()
  const service = health(snapshot)
  const active = incidents.filter(isActive)
  const latestRecovery = snapshot?.recoveries[0]
  const checks = latestRecovery?.verification?.checks
  const passed = Object.values(checks ?? {}).filter(Boolean).length
  const total = Object.keys(checks ?? {}).length
  const observation = snapshot?.service_status.latest_observation
  const recoveryVerified = latestRecovery?.verification?.status === 'verified'
  const displayObservations = [...(snapshot?.observations ?? [])].reverse()
  return <>
    <PageHeading eyebrow="YOUR OPERATIONS, AT A GLANCE" title="Command center" description="Every release. Every incident. Always in control.">
      <Badge tone="neutral"><span className="tiny-dot tone-success" />Local workspace</Badge>
      <Link className="button button-primary" to="/recovery"><RotateCcw size={15} />Recovery center<ArrowUpRight size={15} /></Link>
    </PageHeading>
    <div className="metric-grid">
      <Metric label="Service health" value={service.label} footnote={observation ? 'Based on recorded evidence' : 'Awaiting a recorded observation'} icon={Activity} tone={service.tone} />
      <Metric label="Active release" value={snapshot?.active_deployment.version ?? '—'} footnote={snapshot ? snapshot.active_deployment.reason : 'Awaiting backend data'} icon={GitBranch} />
      <Metric label="Active incidents" value={active.length} secondary={`/ ${incidents.length} total`} footnote={active.length ? 'Incidents need your attention' : 'No active incidents recorded'} icon={CircleAlert} tone={active.length ? 'danger' : 'neutral'} />
      <Metric label="Latest recovery" value={latestRecovery ? (recoveryVerified ? 'Verified' : latestRecovery.verification ? 'Failed checks' : 'Awaiting checks') : 'No recovery'} footnote={latestRecovery ? `${passed} of ${total || 5} verification checks passed` : 'Recovery results appear here'} icon={ShieldCheck} tone={latestRecovery ? (recoveryVerified ? 'success' : 'warning') : 'neutral'} />
    </div>
    <div className="overview-primary">
      <Panel className={`service-panel service-${service.tone}`} title="Service pulse" subtitle="A clear view of your active deployment" action={<Badge tone={service.tone} dot>{service.label}</Badge>}>
        <div className="service-meta"><div className="service-app-icon"><Layers size={21} /></div><div><h3>Checkout service</h3><span className="mono muted">{snapshot?.application ?? 'Waiting for API'}</span></div><Badge>LOCAL</Badge></div>
        <div className="service-flow" aria-label="Persisted service state">
          <svg className="flow-lines" viewBox="0 0 600 94" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="flow"><stop stopColor="var(--border-strong)"/><stop offset=".5" stopColor="var(--accent)" stopOpacity=".7"/><stop offset="1" stopColor="var(--border-strong)"/></linearGradient></defs><path d="M80 44 H520" stroke="url(#flow)" strokeWidth="1.5" strokeDasharray="4 5" fill="none"/><circle className="flow-particle" r="3" fill="var(--accent)"><animateMotion dur="7s" repeatCount="indefinite" path="M80 44 H520"/></circle></svg>
          <div className="flow-node"><span className="flow-icon"><Box size={22} strokeWidth={1.5} /></span><strong>{snapshot?.active_deployment.version ?? '—'}</strong><span>Active deployment</span></div>
          <div className={`flow-node flow-main tone-${service.tone}`}><span className="flow-icon"><Activity size={27} strokeWidth={1.5} /></span><strong>{service.label}</strong><span>Recorded service health</span></div>
          <div className="flow-node"><span className="flow-icon"><ShieldCheck size={22} strokeWidth={1.5} /></span><strong>Human controlled</strong><span>Approval-gated recovery</span></div>
        </div>
        <div className="observation-header"><span><span className="tiny-dot tone-success" />Observation history</span><span>{displayObservations.length} recorded <span className="hide-small">· active release</span></span></div>
        <div className="observation-bars" aria-label={`${displayObservations.length} actual observations`}>{displayObservations.length ? displayObservations.map(item => <span key={item.id} className={item.http_status >= 500 ? 'observation-fail' : 'observation-pass'} title={`${item.endpoint} · HTTP ${item.http_status} · ${formatDate(item.timestamp, preferences.timezone, true)}`} tabIndex={0}><span className="bar-tooltip">{item.endpoint} · {item.http_status}</span></span>) : <div className="no-observations">No observations recorded for this release. Dashboard polling does not probe the service.</div>}</div>
        <div className="service-bottom"><span><Clock3 size={13} />{observation ? `Last observed ${formatDate(observation.timestamp, preferences.timezone)}` : 'Waiting for persisted evidence'}</span><span className="recorded-label">PERSISTED DATA <span /></span></div>
      </Panel>
      <Panel className="recovery-summary" title="Recovery assurance" subtitle="Latest recorded recovery" action={<ShieldCheck size={18} className="muted" />}>
        <div className="verification-visual"><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="57" fill="none" stroke="var(--border)" strokeWidth="5"/><circle cx="70" cy="70" r="57" fill="none" stroke={recoveryVerified ? 'var(--green)' : 'var(--text-faint)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${total ? passed / total * 358 : 0} 358`} transform="rotate(-90 70 70)"/></svg><div><ShieldCheck size={29} strokeWidth={1.4} /><strong>{total ? `${passed}/${total}` : '—'}</strong></div><span className="orbit-dot" /></div>
        <h3>{latestRecovery ? (recoveryVerified ? 'Recovered. And verified.' : 'Verification needs review') : 'Ready when you need it'}</h3><p>{latestRecovery ? 'Real checks. Recorded results. Human authorization.' : 'Scoped approvals keep you in command of every rollback.'}</p>
        <div className="assurance-tags"><span><Check size={12} />Scoped approval</span><span><Check size={12} />Audit trail</span></div>
        <Link to="/recovery" className="button button-secondary full-width">{latestRecovery ? 'Review recovery' : 'Explore recovery workflow'}<ArrowRight size={15} /></Link>
      </Panel>
    </div>
    <Panel className="incidents-panel" title="Recent incidents" subtitle="From first signal to final resolution" action={<TextLink to="/incidents">View all incidents</TextLink>}>
      <IncidentTable incidents={incidents.slice(0, 4)} compact />
    </Panel>
    <div className="overview-bottom">
      <Panel title="Deployment history" subtitle="The story of your releases" action={<Badge>{deployments.length} releases</Badge>}>
        <div className="deployment-list">{deployments.length ? deployments.slice(0, 4).map((d, index) => <div className="deployment-item" key={d.id}><span className={`deployment-icon ${d.reason === 'approved rollback' ? 'rollback-icon' : ''}`}>{d.reason === 'approved rollback' ? <ArrowDownLeft size={17} /> : <GitBranch size={17} />}</span><div className="deployment-info"><div><strong className="mono">{d.version}</strong>{d.id === snapshot?.active_deployment.id && <Badge tone="success">Active</Badge>}</div><p>{d.reason}</p></div><div className="deployment-time"><time title={formatDate(d.activated_at, preferences.timezone, true)}>{relativeTime(d.activated_at)}</time><span className="mono">{shortId(d.id)}</span></div>{index === 0 && <span className="sr-only">Most recent deployment</span>}</div>) : <EmptyState title="No deployments" description="Deployment history will appear when the API is available." />}</div>
      </Panel>
      <Panel title="Activity feed" subtitle="Every action, accounted for" action={<TextLink to="/activity">Full audit log</TextLink>}><Timeline events={[...events].reverse().slice(0, 4)} /></Panel>
    </div>
    <div className="overview-footer"><span><Radio size={13} />Read-only local operations</span><span><Sparkles size={13} />AI assisted. Human controlled.</span></div>
  </>
}
