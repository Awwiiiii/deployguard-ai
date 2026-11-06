import type { AuditEvent, Incident, Snapshot } from './types'
export const shortId = (id: string) => id.replace(/^(inc|dep|evt|rec|apr)_/, '').slice(0, 8)
export const humanize = (value: string) => value.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase())
export function formatDate(value: string | number, zone = 'Asia/Kolkata', detail = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(detail ? { second: '2-digit', year: 'numeric' } : {}), ...(zone === 'local' ? {} : { timeZone: zone }) }).format(new Date(value))
}
export function relativeTime(value: string | number) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
export function health(snapshot?: Snapshot) {
  const observation = snapshot?.service_status.latest_observation
  if (!observation) return { label: 'Unobserved', tone: 'neutral' as const, description: 'No observation for this release' }
  return observation.http_status >= 500
    ? { label: 'Degraded', tone: 'danger' as const, description: 'Failure recorded on active release' }
    : { label: 'Healthy', tone: 'success' as const, description: 'Latest recorded observation passed' }
}
export function investigationBrief(incident: Incident, events: AuditEvent[], target: string | null) {
  const reports = events.filter(e => e.incident_id === incident.id && e.event === 'investigation_reported')
  return [
    '# DeployGuard AI · Investigation brief', `Incident: ${incident.id}`, `Status: ${incident.status}`,
    `Application: ${incident.application}`, `Deployment: ${incident.deployment_id}`, `Release: ${incident.version}`,
    `Opened: ${incident.timestamp}`, `Last updated: ${incident.updated_at}`, `Recorded observations: ${incident.observation_count}`,
    '', '## Recorded failure', incident.observed_failure,
    `Endpoint: ${incident.evidence.endpoint} · HTTP ${incident.evidence.http_status}`,
    `Observed at: ${incident.evidence.observed_at}`, `Error: ${incident.evidence.error_type}: ${incident.evidence.message}`,
    '', '## Traceback', incident.evidence.traceback,
    `Currently available rollback target: ${target ?? 'None for the active release'}`,
    '', '## Associated reports (unverified commentary)',
    ...(reports.length ? reports.map(e => `${e.timestamp}: ${String(e.details.summary ?? '')}`) : ['No report recorded.']),
    '', 'Please analyze the recorded evidence. Do not assume investigation or recovery has completed.',
    'Rollback requires human authentication through the protected operator console or human-only CLI and a scoped, expiring, single-use approval.',
  ].join('\n')
}
