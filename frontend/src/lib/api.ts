import { useQuery } from '@tanstack/react-query'
import { usePreferences } from './preferences'
import type { AuditEvent, Deployment, Incident, Snapshot } from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
}
export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(8000)
  const response = await fetch(`/api${path}`, { method: 'GET', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(response.status, response.status === 404
    ? 'Resource not found. If /status is missing, restart the updated backend.'
    : `Backend returned HTTP ${response.status}. Check the API on port 8001.`)
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(502, 'Expected API JSON. Check the Vite proxy and backend on port 8001.')
  }
  return response.json() as Promise<T>
}
export function useOperations() {
  const { preferences } = usePreferences()
  const options = { refetchInterval: preferences.refreshInterval * 1000, refetchIntervalInBackground: false,
    staleTime: 10_000, retry: 1, refetchOnWindowFocus: 'always' as const }
  const status = useQuery({ queryKey: ['status'], queryFn: ({ signal }) => get<Snapshot>('/status', signal), ...options })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: ({ signal }) => get<{ incidents: Incident[] }>('/incidents', signal), ...options })
  const deployments = useQuery({ queryKey: ['deployments'], queryFn: ({ signal }) => get<{ active_deployment: Deployment; deployments: Deployment[] }>('/deployments', signal), ...options })
  const audit = useQuery({ queryKey: ['audit'], queryFn: ({ signal }) => get<{ events: AuditEvent[] }>('/audit', signal), ...options })
  const queries = [status, incidents, deployments, audit]
  return {
    snapshot: status.data, incidents: incidents.data?.incidents ?? [],
    deployments: deployments.data?.deployments ?? [], events: audit.data?.events ?? [],
    loading: queries.some(q => q.isPending), error: queries.find(q => q.isError)?.error,
    refreshing: queries.some(q => q.isFetching),
    updatedAt: Math.min(...queries.map(q => q.dataUpdatedAt || Infinity)),
    refresh: () => Promise.all(queries.map(q => q.refetch())),
  }
}
export type Operations = ReturnType<typeof useOperations>
