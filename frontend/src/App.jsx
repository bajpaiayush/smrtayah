import { useState, useEffect } from 'react'
import Recall from './components/ChatInterface'
import Capture from './components/SaveMemory'
import Archive from './components/MemoryBrowser'
import './index.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── SVG Icons ──────────────────────────────────────────────
const IconRecall = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z"/>
    <path d="M8 4.5v4l2.5 1.5"/>
  </svg>
)

const IconCapture = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1v14M1 8h14"/>
  </svg>
)

const IconArchive = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="13" height="3" rx="0.75"/>
    <path d="M2.5 4.5v9a.5.5 0 00.5.5h10a.5.5 0 00.5-.5v-9"/>
    <path d="M6 8h4"/>
  </svg>
)

const views = [
  { id: 'recall',  label: 'Recall',  Icon: IconRecall },
  { id: 'capture', label: 'Capture', Icon: IconCapture },
  { id: 'archive', label: 'Archive', Icon: IconArchive },
]

// ── Toast system ───────────────────────────────────────────
let _toastId = 0
function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = (message, type = 'ok') => {
    const id = ++_toastId
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3800)
  }
  return { toasts, push }
}

export default function App() {
  const [view, setView] = useState('recall')
  const [memories, setMemories] = useState([])
  const { toasts, push } = useToasts()

  const loadMemories = async () => {
    try {
      const r = await fetch(`${API}/memories`)
      const d = await r.json()
      setMemories(d.memories || [])
    } catch { /* backend offline */ }
  }

  useEffect(() => { loadMemories() }, [])

  return (
    <div className="shell">

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-wordmark">
          <span className="wordmark-primary">Smrtayah</span>
          <span className="wordmark-secondary">स्मृतयः</span>
        </div>
        <div className="topbar-spacer" />
        <span className="topbar-tag">RAG · Gemini · ChromaDB</span>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-label">Navigation</div>

        {views.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`nav-${id}`}
            className={`nav-item ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            <span className="nav-icon"><Icon /></span>
            {label}
            {id === 'archive' && memories.length > 0 && (
              <span className="nav-badge">{memories.length}</span>
            )}
          </button>
        ))}

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="sidebar-footer-text">
            v0.1.0 — Phase I<br />
            RAG pipeline active
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="main">
        {view === 'recall'  && <Recall  api={API} memories={memories} />}
        {view === 'capture' && <Capture api={API} onSaved={() => { loadMemories(); push('Memory indexed successfully', 'ok') }} />}
        {view === 'archive' && <Archive api={API} memories={memories} onDeleted={() => { loadMemories(); push('Memory removed', 'ok') }} onRefresh={loadMemories} />}
      </main>

      {/* Toasts */}
      <div className="toast-tray">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: t.type === 'ok' ? '#F5C400' : '#E05252' }}>
              {t.type === 'ok'
                ? <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              }
            </svg>
            <span style={{ color: '#F8F8F8' }}>{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  )
}
