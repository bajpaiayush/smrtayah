import { useState } from 'react'

const TYPE_CLASS = { note:'note', article:'article', pdf:'pdf', youtube:'youtube', podcast:'podcast' }

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}

// ── Icons ─────────────────────────────────────────────────────
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10 3.5l-.6 7a.5.5 0 01-.5.5H4.1a.5.5 0 01-.5-.5l-.6-7"/>
  </svg>
)

const IconExpand = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d={open ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"}/>
  </svg>
)

const IconLink = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 6.5l2-2M6 2h3v3M9 2L5.5 5.5M2 5v4h4"/>
  </svg>
)

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 6.5A4.5 4.5 0 002.5 4M2 2v2.5H4.5M2 6.5A4.5 4.5 0 0010.5 9M11 11V8.5H8.5"/>
  </svg>
)

// ── Memory card ───────────────────────────────────────────────
function MemCard({ mem, onDelete, onLoadFull }) {
  const [open, setOpen]       = useState(false)
  const [deleting, setDel]    = useState(false)
  const [loadingText, setLoadText] = useState(false)

  const del = async () => {
    if (!confirm(`Remove "${mem.title}"?`)) return
    setDel(true)
    await onDelete(mem.id)
  }

  const handleExpand = async () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen && !mem.raw_text && onLoadFull) {
      setLoadText(true)
      await onLoadFull(mem.id)
      setLoadText(false)
    }
  }

  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Top row */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--white)', marginBottom:5, lineHeight:1.3 }}>
            {mem.title}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span className={`type-label ${TYPE_CLASS[mem.content_type] || 'note'}`}>
              {mem.content_type}
            </span>
            <span style={{ fontSize:11, color:'var(--gray-3)', fontFamily:'var(--font-mono)' }}>
              {mem.chunk_count}v
            </span>
            <span style={{ fontSize:11, color:'var(--gray-3)', fontFamily:'var(--font-mono)' }}>
              {fmt(mem.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {mem.tags?.length > 0 && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {mem.tags.map((t, i) => (
            <span key={i} style={{
              fontSize:10, fontFamily:'var(--font-mono)', letterSpacing:'0.5px',
              background:'var(--surface-3)', border:'1px solid var(--border)',
              color:'var(--gray-2)', padding:'2px 8px', borderRadius:3,
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Source URL */}
      {mem.source_url && (
        <a
          href={mem.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:'flex', alignItems:'center', gap:5,
            fontSize:11, color:'var(--gray-2)', fontFamily:'var(--font-mono)',
            textDecoration:'none', transition:'color 0.12s',
          }}
          onMouseEnter={e=>e.currentTarget.style.color='var(--yellow)'}
          onMouseLeave={e=>e.currentTarget.style.color='var(--gray-2)'}
        >
          <IconLink />
          {mem.source_url.length > 55 ? mem.source_url.slice(0,55)+'…' : mem.source_url}
        </a>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:6, paddingTop:4, borderTop:'1px solid var(--border)' }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize:11, padding:'5px 10px' }}
          onClick={handleExpand}
        >
          <IconExpand open={open} />
          {open ? 'Collapse' : 'Preview'}
        </button>
        <button
          className="btn btn-danger"
          style={{ fontSize:11, padding:'5px 10px', marginLeft:'auto' }}
          onClick={del}
          disabled={deleting}
        >
          <IconTrash />
          {deleting ? 'Removing…' : 'Remove'}
        </button>
      </div>

      {/* Text preview */}
      {open && (
        <div style={{
          fontSize:12, fontFamily:'var(--font-mono)', color:'var(--gray-1)',
          lineHeight:1.8, background:'var(--surface-2)',
          border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
          padding:'12px', maxHeight:180, overflowY:'auto',
        }}>
          {loadingText ? 'Loading text...' : mem.raw_text ? `${mem.raw_text.slice(0,600)}${mem.raw_text.length > 600 ? '…' : ''}` : 'No text available.'}
        </div>
      )}

    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function Archive({ api, token, memories, onDeleted, onRefresh }) {
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fullData,   setFullData]   = useState({})

  const del = async id => {
    try {
      const res = await fetch(`${api}/memories/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) onDeleted?.()
    } catch {}
  }

  // Load raw_text lazily when card expands
  const loadFull = async id => {
    if (fullData[id]) return
    try {
      const res = await fetch(`${api}/memories/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const d = await res.json()
        setFullData(p => ({ ...p, [id]: d }))
      }
    } catch {}
  }

  const filtered = memories.filter(m =>
    (!search     || m.title.toLowerCase().includes(search.toLowerCase())) &&
    (!typeFilter || m.content_type === typeFilter)
  )

  return (
    <div style={{ padding:'36px', width:'100%' }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 className="section-title">Archive</h1>
        <p className="section-sub">
          {memories.length} memories indexed · semantic memory layer
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
        <input
          id="archive-search"
          className="field-input"
          placeholder="Search by title…"
          style={{ flex:1, minWidth:180 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          id="archive-filter"
          className="field-select"
          style={{ width:'auto' }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="note">Note</option>
          <option value="article">Article</option>
          <option value="pdf">PDF</option>
          <option value="youtube">Video</option>
          <option value="podcast">Podcast</option>
        </select>
        <button
          id="refresh-btn"
          className="btn btn-ghost"
          style={{ padding:'9px 14px', fontSize:12 }}
          onClick={onRefresh}
        >
          <IconRefresh />
          Refresh
        </button>
      </div>

      {/* Grid */}
      {memories.length === 0 ? (
        <div style={{ paddingTop:60 }}>
          <div style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--gray-3)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:12 }}>
            Empty archive
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--gray-2)', letterSpacing:'-0.3px' }}>
            Nothing indexed yet.
          </div>
          <div style={{ fontSize:13, color:'var(--gray-3)', marginTop:6 }}>
            Capture your first memory to get started.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ paddingTop:40, fontSize:13, color:'var(--gray-3)', fontFamily:'var(--font-mono)' }}>
          No results for "{search}"
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:12 }}>
          {filtered.map(m => (
            <MemCard
              key={m.id}
              mem={fullData[m.id] || m}
              onDelete={del}
              onLoadFull={loadFull}
            />
          ))}
        </div>
      )}

    </div>
  )
}
