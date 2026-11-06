import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, ArrowUpRight, Bell, Bot, ChevronDown, ChevronRight, CircleAlert, ExternalLink, Github, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Radio, RefreshCw, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, Terminal, X } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
import { useOperations } from './lib/api'
import { DataContext } from './lib/data'
import { formatDate, humanize, shortId } from './lib/format'
import { safeRoomUrl, usePreferences } from './lib/preferences'
import { isActive } from './lib/types'
import { Badge, Brand, Button, Dialog, EmptyState, ErrorState, IconButton, LoadingPage, Spinner, useToast } from './components/ui'
import { Timeline } from './components/Timeline'
const Overview = lazy(() => import('./pages/Overview'))
const Incidents = lazy(() => import('./pages/Incidents'))
const IncidentDetail = lazy(() => import('./pages/Incidents').then(module => ({ default: module.IncidentDetail })))
const Recovery = lazy(() => import('./pages/Recovery'))
const ActivityPage = lazy(() => import('./pages/Activity'))
const Agents = lazy(() => import('./pages/Agents'))
const Settings = lazy(() => import('./pages/Settings'))

const navigation = [
  { to: '/', name: 'Overview', icon: LayoutDashboard }, { to: '/incidents', name: 'Incidents', icon: CircleAlert },
  { to: '/recovery', name: 'Recovery center', icon: RotateCcw }, { to: '/activity', name: 'Activity', icon: Activity },
  { to: '/agents', name: 'Agents', icon: Bot },
]
export default function App() {
  const data = useOperations()
  const { preferences, update } = usePreferences()
  const systemReduced = useReducedMotion()
  const reduce = preferences.reducedMotion || !!systemReduced
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 720px)').matches)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [search, setSearch] = useState('')
  const statuses = useRef<Record<string, string> | null>(null)
  const activeCount = data.incidents.filter(isActive).length
  const room = safeRoomUrl(preferences.mattermostUrl)
  const currentPage = location.pathname.startsWith('/settings') ? 'Settings' : navigation.find(n => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to))?.name ?? 'Not found'
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(v => !v) } }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  useEffect(() => { setMobileOpen(false); setWorkspaceOpen(false); document.title = `${currentPage} · DeployGuard AI`; window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname, currentPage])
  useEffect(() => {
    const media = matchMedia('(max-width: 720px)')
    const listener = () => { setMobile(media.matches); if (!media.matches) setMobileOpen(false) }
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.activeElement as HTMLElement | null
    document.querySelector<HTMLButtonElement>('.mobile-close')?.focus()
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', close); document.body.style.overflow = ''; previous?.focus() }
  }, [mobileOpen])
  useEffect(() => {
    if (data.loading || data.error) return
    const next = Object.fromEntries(data.incidents.map(i => [i.id, i.status]))
    if (statuses.current && preferences.notifications && preferences.incidentNotifications) {
      for (const i of data.incidents) {
        if (statuses.current[i.id] !== i.status) toast(`INC-${shortId(i.id).toUpperCase()} ${statuses.current[i.id] ? `is now ${humanize(i.status).toLowerCase()}` : 'detected'}`, isActive(i) ? 'warning' : 'success')
      }
    }
    statuses.current = next
  }, [data.incidents, data.loading, data.error, preferences.notifications, preferences.incidentNotifications, toast])
  const searchPages = [...navigation, { to: '/settings', name: 'Settings', icon: SettingsIcon }].filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
  const searchIncidents = data.incidents.filter(i => `${i.id} ${i.observed_failure}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'}><DataContext.Provider value={data}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <div className={`app-shell ${preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Dismiss navigation overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Main navigation" inert={mobile && !mobileOpen}><div className="sidebar-brand"><Brand small={preferences.sidebarCollapsed} /><IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={19} /></IconButton></div>
        <button className="workspace-selector" aria-label="Local workspace menu" onClick={() => setWorkspaceOpen(v => !v)} aria-expanded={workspaceOpen}><span className="workspace-avatar">D</span><span className="sidebar-label workspace-copy"><strong>DeployGuard workspace</strong><span>Local environment</span></span><ChevronDown size={13} className="sidebar-label" /></button>
        {workspaceOpen && <div className="workspace-popover"><strong>Local workspace</strong><p>One service · checkout demo</p><Badge tone="info">Loopback connection</Badge><Button variant="ghost" onClick={() => { setWorkspaceOpen(false); navigate('/settings#connections') }}>Connection settings<ArrowRight size={13} /></Button></div>}
        <div className="nav-section-label sidebar-label">WORKSPACE</div><nav className="main-nav">{navigation.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} title={preferences.sidebarCollapsed ? n.name : undefined} className={({ isActive: selected }) => `nav-item ${selected ? 'selected' : ''}`}><n.icon size={18} strokeWidth={1.7} /><span className="sidebar-label">{n.name}</span>{n.name === 'Incidents' && activeCount > 0 && <span className="nav-count sidebar-label">{activeCount}</span>}{n.name === 'Agents' && <span className="nav-agent-dot sidebar-label" />}</NavLink>)}</nav>
        <div className="sidebar-lower"><div className="sidebar-room sidebar-label"><span className="room-symbol"><Terminal size={18} /></span><strong>Your incident room,<br />one click away.</strong><p>Bring evidence to the conversation with Switch.</p>{room ? <a href={room} target="_blank" rel="noreferrer">Open Mattermost<ArrowUpRight size={13} /></a> : <Link to="/settings#connections">Connect Mattermost<ArrowUpRight size={13} /></Link>}</div><nav><NavLink to="/settings" className={({ isActive: selected }) => `nav-item ${selected ? 'selected' : ''}`} title="Settings"><SettingsIcon size={18} strokeWidth={1.7} /><span className="sidebar-label">Settings</span></NavLink><a href="https://github.com/Awwiiiii/deployguard-ai" target="_blank" rel="noreferrer" className="nav-item" title="GitHub repository"><Github size={18} strokeWidth={1.7} /><span className="sidebar-label">Documentation</span><ExternalLink size={12} className="sidebar-label nav-external" /></a></nav><div className="sidebar-footer"><span className="sidebar-label"><span className="tiny-dot tone-success" />LOCAL DEMONSTRATION</span><IconButton label={preferences.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => update({ sidebarCollapsed: !preferences.sidebarCollapsed })}>{preferences.sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</IconButton></div></div>
      </aside>
      <div className="main-shell" inert={mobile && mobileOpen}><header className="topbar"><div className="breadcrumb"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton><ShieldCheck size={16} className="breadcrumb-logo" /><span className="breadcrumb-workspace">Workspace</span><ChevronRight size={13} /><span>{currentPage}</span><span className="topbar-env">LOCAL</span></div><div className="topbar-actions"><button className="command-trigger" onClick={() => setSearchOpen(true)} aria-label="Search command center"><Search size={15} /><span>Search anything…</span><kbd>⌘ K</kbd></button><span className="topbar-divider" /><IconButton label="View audit notifications" onClick={() => setNotificationsOpen(true)}><Bell size={18} />{data.events.length > 0 && <span className="notification-dot" />}</IconButton><button className="operator-avatar" aria-label="Open operator settings" title="Local operator preferences" onClick={() => navigate('/settings')}>DG</button></div></header>
        <div className="connection-strip"><span className={`connection-status ${data.error ? 'disconnected' : ''}`}><span className="status-dot" />{data.error ? 'API disconnected' : data.loading ? 'Connecting to backend' : 'Backend connected'}<span className="hide-small connection-address">127.0.0.1:8001</span></span><div><span className="hide-small">{Number.isFinite(data.updatedAt) ? `Synced ${formatDate(data.updatedAt, preferences.timezone)}` : 'Waiting for first sync'}</span><span className="polling-label">Refresh {preferences.refreshInterval}s</span><IconButton label="Refresh operational data" onClick={() => { void data.refresh() }} disabled={data.refreshing}>{data.refreshing ? <Spinner /> : <RefreshCw size={13} />}</IconButton></div></div>
        <main id="main-content" className="main-content" tabIndex={-1}>{data.error && <ErrorState message={data.error.message} retry={() => { void data.refresh() }} />}{data.loading && !data.error ? <LoadingPage /> : data.error && !data.snapshot && !['/settings', '/agents'].includes(location.pathname) ? <div className="offline-panel"><EmptyState icon={Radio} title="Your command center is ready" description="Connect the local backend to see real deployments, incidents, and recovery evidence. No demonstration data is substituted."><Link to="/settings#connections" className="button button-primary">Connection settings<ArrowRight size={15} /></Link></EmptyState></div> : <AnimatePresence mode="wait" initial={false}><motion.div key={location.pathname} className="page-content" initial={reduce ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 1 } : { opacity: 0, y: -4 }} transition={{ duration: 0.18 }}><Suspense fallback={<LoadingPage />}><Routes><Route path="/" element={<Overview />} /><Route path="/incidents" element={<Incidents />} /><Route path="/incidents/:incidentId" element={<IncidentDetail />} /><Route path="/recovery" element={<Recovery />} /><Route path="/activity" element={<ActivityPage />} /><Route path="/agents" element={<Agents />} /><Route path="/settings" element={<Settings />} /><Route path="*" element={<EmptyState title="Page not found" description="This route is not part of the command center."><Link className="button button-primary" to="/">Back to overview</Link></EmptyState>} /></Routes></Suspense></motion.div></AnimatePresence>}</main><footer className="app-footer"><span><ShieldCheck size={13} />DeployGuard AI<span className="footer-divider">/</span>Incident Command Center</span><span>Human controlled, by design.<span className="version-label">v0.2.0</span></span></footer>
      </div>
    </div>
    <Dialog open={searchOpen} onClose={() => { setSearchOpen(false); setSearch('') }} title="Search command center"><div className="command-input"><Search size={19} /><input aria-label="Search pages and incidents" autoFocus placeholder="Where would you like to go?" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="command-results"><span className="field-label">PAGES</span>{searchPages.map(n => <button key={n.to} onClick={() => { navigate(n.to); setSearchOpen(false); setSearch('') }}><n.icon size={17} />{n.name}<ArrowRight size={14} /></button>)}{searchIncidents.length > 0 && <span className="field-label">INCIDENTS</span>}{searchIncidents.map(i => <button key={i.id} onClick={() => { navigate(`/incidents/${i.id}`); setSearchOpen(false); setSearch('') }}><CircleAlert size={17} /><span>INC-{shortId(i.id).toUpperCase()}<small>{i.evidence.error_type} in {i.evidence.endpoint}</small></span><ArrowRight size={14} /></button>)}{!searchPages.length && !searchIncidents.length && <p className="muted">No matching pages or recorded incidents.</p>}</div><p className="command-hint"><kbd>esc</kbd> to close<span>Search pages and real incident evidence</span></p></Dialog>
    <Dialog open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Recent audit activity"><p className="muted small">Actual persisted events. Preferences control in-app status-change toasts.</p><Timeline events={[...data.events].reverse().slice(0, 6)} /><Button className="full-width" onClick={() => { navigate('/activity'); setNotificationsOpen(false) }}>Open full audit log<ArrowRight size={15} /></Button></Dialog>
  </DataContext.Provider></MotionConfig>
}
