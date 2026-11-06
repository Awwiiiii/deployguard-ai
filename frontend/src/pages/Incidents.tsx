import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, CircleAlert, FileSearch, Search, ShieldCheck, Terminal } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useData } from '../lib/data'
import { get } from '../lib/api'
import { formatDate, investigationBrief, shortId } from '../lib/format'
import { safeRoomUrl, usePreferences } from '../lib/preferences'
import { isActive } from '../lib/types'
import type { Incident } from '../lib/types'
import { Badge, CopyButton, EmptyState, PageHeading, Panel, Select, Skeleton, StatusBadge } from '../components/ui'
import { IncidentTable } from '../components/IncidentTable'

export default function Incidents() {
  const { incidents } = useData()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = incidents.filter(i => (status === 'all' || (status === 'active' ? isActive(i) : i.status === status)) && `${i.id} ${i.deployment_id} ${i.version} ${i.observed_failure}`.toLowerCase().includes(search.toLowerCase()))
  return <><PageHeading eyebrow="INVESTIGATE WITH CONTEXT" title="Incidents" description="From the first failure to the evidence behind it."><Badge tone={incidents.some(isActive) ? 'danger' : 'success'} dot>{incidents.filter(isActive).length} active incidents</Badge></PageHeading>
    <div className="tabs-toolbar"><div className="tabs" role="group" aria-label="Incident status">{[{ id: 'all', label: 'All incidents' }, { id: 'active', label: 'Active' }, { id: 'resolved', label: 'Resolved' }].map(tab => <button key={tab.id} aria-pressed={status === tab.id} className={status === tab.id ? 'tab active' : 'tab'} onClick={() => setStatus(tab.id)}>{tab.label}<span>{incidents.filter(i => tab.id === 'all' || (tab.id === 'active' ? isActive(i) : i.status === tab.id)).length}</span></button>)}</div><div className="filter-controls"><div className="search-input"><Search size={16} /><input aria-label="Search incidents" placeholder="Search incidents…" value={search} onChange={e => setSearch(e.target.value)} /></div><Select label="Filter by incident status" value={status} onChange={setStatus} options={['all', 'active', 'open', 'verifying', 'verification_failed', 'resolved', 'superseded'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value.replaceAll('_', ' ') }))} /></div></div>
    <Panel>{filtered.length ? <IncidentTable incidents={filtered} /> : <EmptyState icon={FileSearch} title={search || status !== 'all' ? 'No incidents match your filters' : 'No incidents recorded'} description="Only actual incidents detected by the checkout backend appear here." />}</Panel>
    <div className="info-strip"><ShieldCheck size={17} /><p>Evidence first. Investigation reports are shown only when explicitly recorded. Opening an incident does not change its status.</p></div>
  </>
}
export function IncidentDetail() {
  const { incidentId } = useParams()
  const { snapshot, events } = useData()
  const { preferences } = usePreferences()
  const query = useQuery({ queryKey: ['incident', incidentId], queryFn: ({ signal }) => get<{ incident: Incident }>(`/incidents/${encodeURIComponent(incidentId!)}`, signal), enabled: !!incidentId, refetchInterval: preferences.refreshInterval * 1000, retry: 1 })
  const incident = query.data?.incident
  if (query.isPending) return <><Skeleton className="hero-skeleton" /><Skeleton className="hero-skeleton" /></>
  if (!incident) return <EmptyState icon={CircleAlert} title="Incident unavailable" description={query.error?.message ?? 'This incident could not be found.'}><Link to="/incidents" className="button button-secondary">Back to incidents</Link></EmptyState>
  const reports = events.filter(e => e.incident_id === incident.id && e.event === 'investigation_reported')
  const failures = events.filter(e => e.incident_id === incident.id && e.event === 'failure_observed')
  const room = safeRoomUrl(preferences.mattermostUrl)
  const target = snapshot?.active_deployment.id === incident.deployment_id ? snapshot.available_rollback_target : null
  return <>
    <Link to="/incidents" className="back-link"><ArrowLeft size={15} />All incidents</Link>
    <PageHeading eyebrow={`INC-${shortId(incident.id).toUpperCase()}`} title={`${incident.evidence.error_type} in ${incident.evidence.endpoint}`} description="Recorded evidence, full context, and a clear path to recovery."><StatusBadge status={incident.status} /><CopyButton text={investigationBrief(incident, events, target ?? null)} label="Copy investigation brief" variant="primary" /></PageHeading>
    {query.isError && <div className="info-strip" role="alert">Refresh failed. Showing cached incident evidence.</div>}
    <div className="detail-layout"><div className="detail-main"><Panel title="Failure evidence" subtitle="Directly recorded by the application"><div className="evidence-callout"><CircleAlert size={20} /><div><strong>{incident.evidence.error_type}</strong><p>{incident.evidence.message}</p></div><Badge tone="danger">HTTP {incident.evidence.http_status}</Badge></div><dl className="details-list"><div><dt>Observed failure</dt><dd>{incident.observed_failure}</dd></div><div><dt>Endpoint</dt><dd className="mono">{incident.evidence.endpoint}</dd></div><div><dt>Last observed</dt><dd>{formatDate(incident.evidence.observed_at, preferences.timezone, true)}</dd></div><div><dt>Recorded observations</dt><dd>{incident.observation_count}</dd></div></dl><div className="code-heading"><span><Terminal size={15} />Error traceback</span><CopyButton text={incident.evidence.traceback} label="Copy traceback" variant="ghost" /></div><pre className="traceback">{incident.evidence.traceback}</pre></Panel>
      <Panel title="Recorded endpoint failures" subtitle={`${failures.length} failure events in the audit log`}><div className="endpoint-list">{failures.length ? failures.map(f => <div key={f.id}><span className="mono">{String(f.details.endpoint)}</span><Badge tone="danger">HTTP {String(f.details.http_status)}</Badge><time>{formatDate(f.timestamp, preferences.timezone)}</time></div>) : <p className="panel-copy">No separate failure events returned by the audit endpoint. The incident evidence above remains available.</p>}</div></Panel>
      <Panel title="Investigation reports" action={<Badge>{reports.length} recorded</Badge>}>{reports.length ? <div className="report-list">{reports.map(r => <article key={r.id}><Badge tone="warning">Unverified commentary</Badge><time>{formatDate(r.timestamp, preferences.timezone)}</time><p>{String(r.details.summary ?? '')}</p><span className="muted small">Source: {String(r.details.source ?? 'Recorded report')}</span></article>)}</div> : <EmptyState icon={FileSearch} title="Investigation has not been recorded" description="Copy the actual evidence into your Switch incident room. Reports appear here only after being explicitly recorded in the backend." />}</Panel>
    </div><aside className="detail-sidebar"><Panel title="Incident context"><dl className="details-list stacked"><div><dt>Incident ID</dt><dd className="mono break-all">{incident.id}</dd></div><div><dt>Deployment ID</dt><dd className="mono break-all">{incident.deployment_id}</dd></div><div><dt>Release</dt><dd><Badge>{incident.version}</Badge></dd></div><div><dt>Opened</dt><dd>{formatDate(incident.timestamp, preferences.timezone, true)}</dd></div><div><dt>Updated</dt><dd>{formatDate(incident.updated_at, preferences.timezone, true)}</dd></div><div><dt>Timezone</dt><dd>{preferences.timezone}</dd></div></dl></Panel><Panel title="Recovery path"><div className="panel-content"><span className="field-label">AVAILABLE ROLLBACK TARGET</span><h3 className="rollback-target mono">{target ?? 'None on this deployment'}</h3><p className="muted small">{target ? 'An operator must authenticate and issue scoped approval in the terminal.' : 'This incident is not on the active failing deployment.'}</p><Link to={`/recovery?incident=${incident.id}`} className="button button-secondary full-width">Review recovery<ArrowUpRight size={15} /></Link></div></Panel><Panel title="Switch collaboration"><div className="panel-content"><p className="muted small">Share the investigation brief with your incident room for AI-assisted analysis.</p>{room ? <a href={room} target="_blank" rel="noreferrer" className="button button-secondary full-width">Open incident room<ArrowUpRight size={15} /></a> : <Link to="/settings#connections" className="button button-secondary full-width">Configure incident room<ArrowUpRight size={15} /></Link>}</div></Panel></aside></div>
  </>
}
