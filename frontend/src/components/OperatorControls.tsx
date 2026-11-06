import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import { get } from '../lib/api'
import { Badge, Button, Panel } from './ui'

export function OperatorControls({ incidentId }: { incidentId?: string }) {
  const query = useQuery({ queryKey: ['operator-status'], queryFn: ({ signal }) => get<{ available: boolean; authentication: string; console_origin: string; monitor_enabled: boolean; monitor_status: string }>('/operator-status', signal), retry: false, refetchInterval: 5000 })
  // Only the fixed, separate operator origin can receive human authentication.
  const available = query.data?.available === true && query.data.console_origin === 'http://127.0.0.1:8003'
    && query.data.authentication === 'browser-native-http-basic' && !query.isError
  return <Panel title="Protected browser recovery" subtitle="Authenticate, approve, and explicitly execute in the isolated operator console" action={<Badge tone={available ? 'success' : 'warning'}>{available ? 'Gateway connected' : query.isPending ? 'Checking gateway' : 'Browser recovery unavailable'}</Badge>}><div className="panel-content"><p className="small muted">{available ? 'The console opens on localhost port 8003 in a separate tab. Sign in with username operator and your existing human credential using the browser’s native dialog. Never enter the credential into this dashboard, chat, or a page input.' : 'The protected gateway is not connected. Browser approval and rollback are unavailable. The existing human-only CLI runbook remains available.'}</p>{available && incidentId ? <a className="button button-primary" href={`http://127.0.0.1:8003/operator/incidents/${encodeURIComponent(incidentId)}`} target="_blank" rel="noopener noreferrer"><LockKeyhole size={15} />Open protected operator console<ArrowUpRight size={15} /></a> : <Button disabled><LockKeyhole size={15} />{available ? 'Select an incident to authorize recovery' : 'Browser recovery unavailable'}</Button>}{available && <p className="small muted" style={{ marginTop: 12 }}>{query.data?.monitor_enabled ? 'Gateway monitoring records one real observation for each newly activated, unobserved release. ' : ''}The dashboard refreshes recorded results automatically when you return.</p>}</div></Panel>
}
