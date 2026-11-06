import { describe, expect, it } from 'vitest'
import { formatDate, health, investigationBrief } from './format'
import { incident, snapshot } from '../test/fixtures'

describe('evidence-driven status', () => {
  it('does not infer service health from a release or API connectivity', () => {
    expect(health().label).toBe('Unobserved')
    expect(health(snapshot).label).toBe('Unobserved')
  })
  it('uses actual recorded HTTP results', () => {
    const observed = { id: 'obs_test', timestamp: incident.timestamp, deployment_id: incident.deployment_id, endpoint: '/checkout', http_status: 500, result: { status: 'failed', version: 'v1.1.0' } }
    expect(health({ ...snapshot, service_status: { ...snapshot.service_status, latest_observation: observed } }).label).toBe('Degraded')
    expect(health({ ...snapshot, service_status: { ...snapshot.service_status, latest_observation: { ...observed, http_status: 200 } } }).label).toBe('Healthy')
  })
  it('copies exact incident evidence without inventing an investigation', () => {
    const brief = investigationBrief(incident, [], 'v1.0.0')
    expect(brief).toContain(incident.id)
    expect(brief).toContain(incident.deployment_id)
    expect(brief).toContain(incident.evidence.traceback)
    expect(brief).toContain('No report recorded.')
    expect(brief).toContain('single-use approval')
    expect(incident.status).toBe('open')
  })
  it('labels recorded reports as unverified commentary', () => {
    const brief = investigationBrief(incident, [{ id: 'evt_report', timestamp: incident.timestamp, event: 'investigation_reported', incident_id: incident.id, details: { summary: 'Operator recorded summary' } }], null)
    expect(brief).toContain('unverified commentary')
    expect(brief).toContain('Operator recorded summary')
  })
  it('formats the configured timezone and invalid timestamps safely', () => {
    expect(formatDate('2026-11-07T12:00:00Z', 'Asia/Kolkata')).toContain('17:30')
    expect(formatDate('2026-11-07T12:00:00Z', 'UTC')).toContain('12:00')
    expect(formatDate('invalid')).toBe('Not recorded')
  })
})
