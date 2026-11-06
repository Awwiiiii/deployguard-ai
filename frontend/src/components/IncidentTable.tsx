import { ArrowUpRight, CircleAlert, CircleCheck, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Incident } from '../lib/types'
import { shortId, formatDate } from '../lib/format'
import { usePreferences } from '../lib/preferences'
import { Badge, EmptyState, StatusBadge } from './ui'

export function IncidentTable({ incidents, compact = false }: { incidents: Incident[]; compact?: boolean }) {
  const { preferences } = usePreferences()
  if (!incidents.length) return <EmptyState icon={CircleCheck} title="All quiet on the incident front" description="Incidents appear here when the backend records a real service failure." />
  return <div className="table-scroll"><table className={`data-table ${compact ? 'compact-table' : ''}`}><thead><tr><th>Incident</th><th>Status</th><th>Release</th>{!compact && <th>Observations</th>}<th>Opened</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{incidents.map(incident => <tr key={incident.id}><td><Link to={`/incidents/${incident.id}`} className="incident-cell"><span className={`incident-icon ${incident.status === 'resolved' ? 'resolved' : ''}`}>{incident.status === 'resolved' ? <CircleCheck size={17} /> : <CircleAlert size={17} />}</span><span><strong>{incident.evidence.error_type} in {incident.evidence.endpoint}</strong><span className="mono muted incident-subtitle">INC-{shortId(incident.id).toUpperCase()}</span></span></Link></td><td><StatusBadge status={incident.status} /></td><td><Badge>{incident.version}</Badge></td>{!compact && <td className="mono">{incident.observation_count}</td>}<td className="muted nowrap">{formatDate(incident.timestamp, preferences.timezone)}</td><td><Link to={`/incidents/${incident.id}`} className="icon-button" aria-label={`Investigate ${incident.id}`}>{compact ? <ChevronRight size={16} /> : <ArrowUpRight size={16} />}</Link></td></tr>)}</tbody></table></div>
}
