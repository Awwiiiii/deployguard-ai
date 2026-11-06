import { Check, CircleAlert, GitBranch, KeyRound, RotateCcw, ScanLine, Search, Shield, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AuditEvent } from '../lib/types'
import { formatDate, humanize, relativeTime, shortId } from '../lib/format'
import { usePreferences } from '../lib/preferences'
import { EmptyState } from './ui'
import { Link } from 'react-router-dom'

export function eventIcon(event: string): LucideIcon {
  if (event.includes('rejected')) return X
  if (event.includes('verified')) return Check
  if (event.includes('verification_failed')) return CircleAlert
  if (event.includes('approval')) return KeyRound
  if (event.includes('authorization') || event === 'operator_authenticated') return Shield
  if (event.includes('rollback')) return RotateCcw
  if (event.includes('incident') || event.includes('failure')) return CircleAlert
  if (event.includes('investigation')) return Search
  if (event.includes('deployment') || event.includes('reset')) return GitBranch
  return ScanLine
}
export function eventTone(event: string) {
  return event.includes('failed') || event.includes('failure') || event.includes('rejected') || event === 'incident_opened'
    ? 'danger' : event.includes('verified') ? 'success' : event.includes('approval') ? 'info' : 'neutral'
}
export function Timeline({ events, expandable = false }: { events: AuditEvent[]; expandable?: boolean }) {
  const { preferences } = usePreferences()
  if (!events.length) return <EmptyState title="No activity recorded" description="Persisted audit events will appear here as the local demo progresses." />
  return <ol className={`timeline ${expandable ? 'timeline-expanded' : ''}`}>{events.map(event => {
    const Icon = eventIcon(event.event)
    return <li key={event.id}><span className={`timeline-icon tone-${eventTone(event.event)}`}><Icon size={15} /></span><div className="timeline-content"><div className="timeline-title"><strong>{humanize(event.event)}</strong><time dateTime={event.timestamp} title={formatDate(event.timestamp, preferences.timezone, true)}>{expandable ? formatDate(event.timestamp, preferences.timezone) : relativeTime(event.timestamp)}</time></div><div className="timeline-description">{event.incident_id ? <Link to={`/incidents/${event.incident_id}`} className="mono">INC-{shortId(event.incident_id).toUpperCase()}</Link> : <span>deployguard-checkout</span>}{event.details.new_version != null && <span className="mono"> → {String(event.details.new_version)}</span>}{event.details.endpoint != null && <span> · {String(event.details.endpoint)} · HTTP {String(event.details.http_status)}</span>}</div>{expandable && <details className="event-details"><summary>View event details</summary><dl className="details-list"><div><dt>Event ID</dt><dd className="mono break-all">{event.id}</dd></div><div><dt>Timestamp</dt><dd>{formatDate(event.timestamp, preferences.timezone, true)}</dd></div></dl><pre>{JSON.stringify(event.details, null, 2)}</pre></details>}</div></li>
  })}</ol>
}
