import { useState, useRef, useEffect } from 'react'

const PROMPTS = [
  'What do I know about transformer architectures?',
  'Summarise my most recent saves',
  'What have I read about productivity systems?',
  'Find everything related to vector databases',
]

const TYPE_CLASS = { note:'note', article:'article', pdf:'pdf', youtube:'youtube', podcast:'podcast' }

// ── Icons ────────────────────────────────────────────────────
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 7.5H2M7.5 2l5.5 5.5-5.5 5.5"/>
  </svg>
)

const IconExpand = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d={open ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"}/>
  </svg>
)

// ── Source citation card ─────────────────────────────────────
function Source({ s }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
    }}>
      <button
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '9px 12px',
          background: 'var(--surface-2)', border: 'none', cursor: 'pointer',
          color: 'var(--gray-1)', fontSize: 12, fontFamily: 'var(--font-sans)',
          textAlign: 'left',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`type-label ${TYPE_CLASS[s.content_type] || 'note'}`}>{s.content_type}</span>
        <span style={{ flex:1, color:'var(--white)', fontWeight:500 }}>{s.title}</span>
        <IconExpand open={open} />
      </button>
      {open && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--gray-1)',
          lineHeight: 1.7,
          fontFamily: 'var(--font-mono)',
        }}>
          {s.chunk_text}
        </div>
      )}
    </div>
  )
}

// ── Chat bubble ───────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 6,
      marginBottom: 20,
    }}>
      {/* Sender label */}
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
        color: isUser ? 'var(--yellow-dim)' : 'var(--gray-2)',
      }}>
        {isUser ? 'You' : 'Smrtayah'}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '78%',
        padding: '11px 15px',
        borderRadius: isUser ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
        background: isUser ? 'var(--yellow)' : 'var(--surface-2)',
        border: isUser ? 'none' : '1px solid var(--border)',
        color: isUser ? '#080808' : 'var(--white)',
        fontSize: 14,
        lineHeight: 1.7,
        fontWeight: isUser ? 500 : 400,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>

      {/* Sources */}
      {msg.sources?.length > 0 && (
        <div style={{ maxWidth:'78%', width:'100%', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--gray-3)', letterSpacing:'0.8px', textTransform:'uppercase', marginTop:2 }}>
            Retrieved from {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}
          </div>
          {msg.sources.map((s, i) => <Source key={i} s={s} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function Recall({ api, memories }) {
  const [msgs, setMsgs]     = useState([])
  const [input, setInput]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [filter, setFilter] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs])

  const send = async (text) => {
    const q = (text || input).trim()
    if (!q || busy) return

    setInput('')
    setMsgs(p => [...p, { role:'user', content: q }])
    setBusy(true)

    try {
      const res = await fetch(`${api}/query`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ question:q, top_k:5, content_type_filter: filter||null }),
      })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setMsgs(p => [...p, { role:'assistant', content:d.answer, sources:d.sources }])
    } catch {
      setMsgs(p => [...p, {
        role:'assistant',
        content: 'Backend unreachable. Start the FastAPI server on port 8000.',
        sources:[],
      }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const empty = msgs.length === 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Toolbar */}
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        padding:'12px 20px',
        borderBottom:'1px solid var(--border)',
        background:'var(--surface-1)',
      }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--white)', flex:1 }}>Recall</span>

        <select
          id="type-filter"
          className="field-select"
          style={{ width:'auto', fontSize:12, padding:'6px 10px' }}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="note">Note</option>
          <option value="article">Article</option>
          <option value="pdf">PDF</option>
          <option value="youtube">Video</option>
          <option value="podcast">Podcast</option>
        </select>

        {msgs.length > 0 && (
          <button
            id="clear-btn"
            className="btn btn-ghost"
            style={{ fontSize:12, padding:'6px 12px' }}
            onClick={() => setMsgs([])}
          >
            Clear
          </button>
        )}
      </div>

      {/* Message area */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

        {empty ? (
          /* Empty state */
          <div style={{ paddingTop:60, maxWidth:480 }}>
            <div style={{
              fontSize:11, fontFamily:'var(--font-mono)', letterSpacing:'1.5px',
              textTransform:'uppercase', color:'var(--gray-3)', marginBottom:16,
            }}>
              Recall Interface
            </div>
            <h2 style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.5px', marginBottom:8, lineHeight:1.2 }}>
              Query your<br />
              <span style={{ color:'var(--yellow)' }}>indexed knowledge.</span>
            </h2>
            <p style={{ fontSize:13, color:'var(--gray-2)', marginBottom:28, lineHeight:1.7 }}>
              Ask anything across your saved content.
              {memories.length === 0
                ? ' Capture some memories first to get started.'
                : ` ${memories.length} memories are indexed and ready.`}
            </p>

            {/* Prompt suggestions */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {PROMPTS.map((p, i) => (
                <button
                  key={i}
                  className="btn btn-ghost"
                  style={{ justifyContent:'flex-start', fontSize:13, textAlign:'left', padding:'10px 14px' }}
                  onClick={() => send(p)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{flexShrink:0,color:'var(--yellow)'}}>
                    <path d="M2 6h8M6 2l4 4-4 4"/>
                  </svg>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {msgs.map((m, i) => <Bubble key={i} msg={m} />)}

            {busy && (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <div style={{
                  fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase',
                  fontFamily:'var(--font-mono)', color:'var(--gray-2)',
                }}>
                  Smrtayah
                </div>
                <div className="dots" style={{ marginTop:1 }}>
                  <div className="dot"/>
                  <div className="dot"/>
                  <div className="dot"/>
                </div>
                <span style={{ fontSize:11, color:'var(--gray-3)', fontFamily:'var(--font-mono)' }}>
                  searching memory…
                </span>
              </div>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        padding:'14px 20px',
        borderTop:'1px solid var(--border)',
        background:'var(--surface-1)',
      }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            id="query-input"
            ref={inputRef}
            className="field-textarea"
            placeholder="Ask anything across your knowledge base…"
            style={{ minHeight:42, maxHeight:120, resize:'none', flex:1, lineHeight:1.5, padding:'10px 12px' }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
          />
          <button
            id="send-btn"
            className="btn btn-yellow"
            style={{ padding:'10px 14px', flexShrink:0, height:42 }}
            onClick={() => send()}
            disabled={busy || !input.trim()}
          >
            {busy ? <div className="spin" /> : <IconSend />}
          </button>
        </div>
        <div style={{ fontSize:10, color:'var(--gray-3)', fontFamily:'var(--font-mono)', marginTop:6 }}>
          Enter — send · Shift+Enter — new line
        </div>
      </div>

    </div>
  )
}
