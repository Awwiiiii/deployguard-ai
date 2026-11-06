import { useState } from 'react'
import { Download, Search, ShieldCheck } from 'lucide-react'
import { useData } from '../lib/data'
import { Button, PageHeading, Panel, Select } from '../components/ui'
import { Timeline } from '../components/Timeline'
import { useToast } from '../components/ui'

export default function Activity() {
  const { events } = useData()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const toast = useToast()
  const patterns: Record<string, RegExp> = { incidents: /incident|failure_observed|investigation/, deployments: /deployment|demo_reset/, approvals: /approval|authorization|operator_authenticated/, recoveries: /rollback|recovery_rejected/, verification: /recovery_verif/ }
  const filtered = [...events].reverse().filter(e => (category === 'all' || patterns[category].test(e.event)) && `${e.event} ${e.incident_id ?? ''} ${JSON.stringify(e.details)}`.toLowerCase().includes(search.toLowerCase()))
  function exportAudit() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'deployguard-audit.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`Exported ${filtered.length} real audit events`)
  }
  return <><PageHeading eyebrow="A COMPLETE CHAIN OF EVIDENCE" title="Activity" description="The operational record. Every signal, decision, and recovery."><Button onClick={exportAudit}><Download size={15} />Export audit log</Button></PageHeading><div className="activity-summary"><div><span className="activity-summary-icon"><ShieldCheck size={21} /></span><div><strong>{events.length} recorded events</strong><p>Sourced directly from GET /audit</p></div></div><span className="muted small">Newest first · persisted history</span></div><div className="tabs-toolbar"><div className="tabs" role="group" aria-label="Activity type">{[{ value: 'all', label: 'All activity' }, { value: 'incidents', label: 'Incidents' }, { value: 'recoveries', label: 'Recovery' }, { value: 'approvals', label: 'Approvals' }].map(tab => <button key={tab.value} className={`tab ${category === tab.value ? 'active' : ''}`} aria-pressed={category === tab.value} onClick={() => setCategory(tab.value)}>{tab.label}</button>)}</div><div className="filter-controls"><div className="search-input"><Search size={16} /><input aria-label="Search audit events" placeholder="Search events or incident ID…" value={search} onChange={e => setSearch(e.target.value)} /></div><Select label="Filter audit event type" value={category} onChange={setCategory} options={['all', 'incidents', 'deployments', 'approvals', 'recoveries', 'verification'].map(value => ({ value, label: value === 'all' ? 'All event types' : value }))} /></div></div><Panel title="Audit timeline" subtitle={`${filtered.length} matching events`}><Timeline events={filtered} expandable /></Panel></>
}
