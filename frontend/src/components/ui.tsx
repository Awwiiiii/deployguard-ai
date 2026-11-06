import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, ArrowRight, Check, CheckCheck, ChevronDown, Copy, Inbox, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePreferences } from '../lib/preferences'

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'info'
export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="status-dot" />}{children}</span>
}
export function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, Tone> = { open: 'danger', verifying: 'info', verification_failed: 'warning', resolved: 'success', superseded: 'neutral' }
  return <Badge tone={tones[status] ?? 'neutral'} dot>{status.replaceAll('_', ' ')}</Badge>
}
export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}
export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} data-tooltip={label} {...props}>{children}</button>
}
export function Brand({ small = false }: { small?: boolean }) {
  return <Link to="/" className="brand" aria-label="DeployGuard AI overview"><span className="brand-mark"><ShieldCheck size={23} strokeWidth={1.8} /></span>{!small && <span>DeployGuard<span className="brand-ai">AI</span></span>}</Link>
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>
}
export function Panel({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-link">{children}<ArrowRight size={14} /></Link>
}
export function EmptyState({ icon: Icon = Inbox, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={25} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p>{children}</div>
}
export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} aria-hidden="true" /> }
export function LoadingPage() {
  return <div className="page-loading" role="status" aria-label="Loading operational data"><div className="metric-grid">{[0, 1, 2, 3].map(i => <Skeleton className="metric-skeleton" key={i} />)}</div><Skeleton className="hero-skeleton" /><div className="two-column"><Skeleton className="hero-skeleton" /><Skeleton className="hero-skeleton" /></div><span className="sr-only">Loading operational data…</span></div>
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="connection-error" role="alert"><AlertCircle size={21} /><div><strong>Backend connection interrupted</strong><p>{message} Start or restart FastAPI on <code>127.0.0.1:8001</code>. Cached data, if shown, may be stale.</p></div><Button onClick={retry}>Retry connection</Button></div>
}
export function Select({ label, value, onChange, options, id }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; id?: string }) {
  return <div className="select-wrap"><select id={id} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown size={14} /></div>
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
}
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = ref.current
    if (open && !node?.open) node?.showModal()
    else if (!open && node?.open) node.close()
  }, [open])
  return <dialog ref={ref} aria-label={title} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={onClose} onClose={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="dialog-header"><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>{open && <div className="dialog-body">{children}</div>}</dialog>
}
type Toast = { id: number; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const { preferences } = usePreferences()
  const systemReduced = useReducedMotion()
  const reduce = preferences.reducedMotion || systemReduced
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const notify = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-3), { id, message, tone }])
    timers.current.push(setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5500))
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return <ToastContext.Provider value={notify}>{children}<div className="toast-region" aria-live="polite" aria-atomic="false"><AnimatePresence>{toasts.map(t => <motion.div key={t.id} className={`toast toast-${t.tone}`} initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}><CheckCheck size={18} /><span>{t.message}</span><IconButton label="Dismiss notification" onClick={() => setToasts(v => v.filter(x => x.id !== t.id))}><X size={14} /></IconButton></motion.div>)}</AnimatePresence></div></ToastContext.Provider>
}
export const useToast = () => useContext(ToastContext)
export function CopyButton({ text, label = 'Copy', variant = 'secondary' }: { text: string; label?: string; variant?: 'secondary' | 'primary' | 'ghost' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toast = useToast()
  useEffect(() => () => clearTimeout(timer.current), [])
  return <Button variant={variant} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); toast(`${label} copied to clipboard`); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000) }
    catch { toast('Clipboard unavailable. Select and copy the displayed text.', 'danger') }
  }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : label}</Button>
}
export const Spinner = () => <LoaderCircle className="spin" size={15} />
