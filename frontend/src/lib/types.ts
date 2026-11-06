export type IncidentStatus = 'open' | 'verifying' | 'verification_failed' | 'resolved' | 'superseded'
export interface Evidence {
  endpoint: string; http_status: number; error_type: string; message: string
  traceback: string; observed_at: string
}
export interface Incident {
  id: string; timestamp: string; updated_at: string; application: string
  deployment_id: string; version: string; observed_failure: string
  evidence: Evidence; status: IncidentStatus; observation_count: number
}
export interface Deployment {
  id: string; version: string; previous_version: string | null; activated_at: string; reason: string
}
export interface AuditEvent {
  id: string; timestamp: string; event: string; incident_id: string | null; details: Record<string, unknown>
}
export interface Observation {
  id: string; timestamp: string; deployment_id: string; endpoint: string; http_status: number
  result: { status: string; version: string; [key: string]: unknown }
}
export interface Verification {
  status: string; incident_id: string; recovery_id: string
  checks: Record<string, boolean>; evidence: Record<string, unknown>
}
export interface Recovery {
  id: string; incident_id: string; approval_id: string; previous_version: string; target_version: string
  deployment_id: string; executed_at: string; verified_at: string | null; verification: Verification | null
}
export interface Approval {
  id: string; incident_id: string; action: string; target_version: string
  created_at: string; expires_at: string; consumed_at: string | null
}
export interface Snapshot {
  application: string; api_version: string; active_deployment: Deployment
  service_status: { basis: string; latest_observation: Observation | null }
  observations: Observation[]; recoveries: Recovery[]; approvals: Approval[]
  available_rollback_target: string | null
}
export const isActive = (incident: Incident) => ['open', 'verifying', 'verification_failed'].includes(incident.status)
