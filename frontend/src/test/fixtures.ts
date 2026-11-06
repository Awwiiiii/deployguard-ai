// Synthetic fixtures are exclusively used in tests. The application has no mock-data mode.
import type { AuditEvent, Incident, Snapshot } from '../lib/types'
export const incident: Incident = {
  id: 'inc_test1234', timestamp: '2026-11-07T12:00:00Z', updated_at: '2026-11-07T12:00:00Z',
  application: 'deployguard-checkout', deployment_id: 'dep_broken123', version: 'v1.1.0',
  observed_failure: '/checkout returned HTTP 500: ValueError: invalid-price', status: 'open', observation_count: 1,
  evidence: { endpoint: '/checkout', http_status: 500, error_type: 'ValueError', message: 'invalid-price',
    traceback: 'Traceback: test fixture only', observed_at: '2026-11-07T12:00:00Z' },
}
export const snapshot: Snapshot = {
  application: 'deployguard-checkout', api_version: '0.1.0',
  active_deployment: { id: 'dep_broken123', version: 'v1.1.0', previous_version: 'v1.0.0', activated_at: '2026-11-07T11:59:00Z', reason: 'human demo reset' },
  service_status: { basis: 'persisted observations; no live probe performed', latest_observation: null },
  observations: [], recoveries: [], approvals: [], available_rollback_target: 'v1.0.0',
}
export const events: AuditEvent[] = [{ id: 'evt_test1234', timestamp: incident.timestamp, event: 'incident_opened', incident_id: incident.id, details: { deployment_id: incident.deployment_id } }]
