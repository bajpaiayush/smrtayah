import { useState, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TYPES = [
  { value: 'note',    label: 'Note' },
  { value: 'article', label: 'Article' },
  { value: 'pdf',     label: 'PDF' },
  { value: 'youtube', label: 'Video' },
  { value: 'podcast', label: 'Podcast' },
]

const TABS = [
  { id: 'manual',  label: 'Manual' },
  { id: 'url',     label: 'From URL' },
  { id: 'pdf',     label: 'From PDF' },
  { id: 'youtube', label: 'YouTube' },
]

// ── Small inline icons ────────────────────────────────────────
const IconSpark = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M2.9 2.9l1.4 1.4M8.7 8.7l1.4 1.4M2.9 10.1l1.4-1.4M8.7 4.3l1.4-1.4"/>
  </svg>
)

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l3 3 6-6"/>
  </svg>
)

const IconPDF = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="14" height="18" rx="2"/>
    <path d="M10 2v7l3-2 3 2V2"/>
    <path d="M4 13h6M4 17h10M4 21h8"/>
    <path d="M18 16l6 6M24 16l-6 6"/>
  </svg>
)

// ── Empty form state ─────────────────────────────────────────
const EMPTY_FORM = {
  title: '', content: '', content_type: 'note', source_url: '', tags: '',
}

// ── URL Ingestion panel ───────────────────────────────────────
function URLPanel({ onExtracted }) {
  const [url, setUrl]     = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const extract = async () => {
    if (!url.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API}/extract/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || 'Extraction failed')
      onExtracted({
        title: d.title,
        content: d.content,
        source_url: url.trim(),
        content_type: 'article',
        meta: d.meta,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mode-divider">Enter a URL to extract</div>
      <div className="extract-row">
        <input
          id="url-input"
          className="field-input"
          placeholder="https://example.com/article…"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && extract()}
          autoComplete="off"
        />
        <button
          id="extract-url-btn"
          className="btn btn-yellow"
          onClick={extract}
          disabled={busy || !url.trim()}
          style={{ flexShrink: 0 }}
        >
          {busy
            ? <><div className="spin" /> Extracting…</>
            : <><IconSpark /> Extract</>
          }
        </button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}
    </div>
  )
}

// ── PDF Ingestion panel ───────────────────────────────────────
function PDFPanel({ onExtracted }) {
  const [file, setFile]     = useState(null)
  const [dragOver, setDrag] = useState(false)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const inputRef = useRef(null)

  const handleFile = f => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      return
    }
    setFile(f); setError(null)
  }

  const extract = async () => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/extract/pdf`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || 'PDF extraction failed')
      onExtracted({
        title: d.title,
        content: d.content,
        content_type: 'pdf',
        meta: d.meta,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mode-divider">Drop a PDF or click to browse</div>

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        <div className="drop-zone-title" style={{ marginTop: 12 }}>
          {file ? file.name : 'Drop PDF here or click to browse'}
        </div>
        <div className="drop-zone-sub">
          {file
            ? `${(file.size / 1024).toFixed(0)} KB · PDF`
            : 'Supports: PDF up to 20 MB'}
        </div>
      </div>

      {file && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            id="extract-pdf-btn"
            className="btn btn-yellow"
            onClick={extract}
            disabled={busy}
          >
            {busy
              ? <><div className="spin" /> Extracting…</>
              : <><IconSpark /> Extract text</>
            }
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { setFile(null); setError(null) }}
            disabled={busy}
          >
            Clear
          </button>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}

// ── YouTube Ingestion panel ───────────────────────────────────
function YouTubePanel({ onExtracted }) {
  const [url, setUrl]     = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const extract = async () => {
    if (!url.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API}/extract/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || 'Transcript fetch failed')
      onExtracted({
        title: d.title,
        content: d.content,
        source_url: url.trim(),
        content_type: 'youtube',
        meta: d.meta,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mode-divider">Paste a YouTube URL</div>
      <div className="extract-row">
        <input
          id="youtube-url-input"
          className="field-input"
          placeholder="https://youtube.com/watch?v=…"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && extract()}
          autoComplete="off"
        />
        <button
          id="fetch-transcript-btn"
          className="btn btn-yellow"
          onClick={extract}
          disabled={busy || !url.trim()}
          style={{ flexShrink: 0 }}
        >
          {busy
            ? <><div className="spin" /> Fetching…</>
            : <><IconSpark /> Get Transcript</>
          }
        </button>
      </div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--gray-3)', marginTop: -12, marginBottom: 16 }}>
        Requires the video to have captions enabled. Supports youtu.be, youtube.com/watch and /shorts.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  )
}

// ── Extracted content review panel ────────────────────────────
function ReviewPanel({ extracted, form, setForm, loading, error, result, onSubmit, onDiscard }) {
  const charCount = form.content.length
  const chunkEst  = charCount > 0 ? Math.ceil(charCount / 450) : 0

  return (
    <div className="review-section">
      {/* Extraction metadata pills */}
      {extracted.meta && (
        <div className="extract-meta">
          {extracted.meta.page_count != null && (
            <span className="extract-meta-pill">{extracted.meta.page_count} pages</span>
          )}
          {extracted.meta.extracted_pages != null && (
            <span className="extract-meta-pill">{extracted.meta.extracted_pages} readable</span>
          )}
          {extracted.meta.language && (
            <span className="extract-meta-pill">lang: {extracted.meta.language}</span>
          )}
          {extracted.meta.segment_count != null && (
            <span className="extract-meta-pill">{extracted.meta.segment_count} segments</span>
          )}
        </div>
      )}

      {/* Content preview */}
      <div className="mode-divider">Extracted content preview</div>
      <div className="extract-preview-box">
        {form.content.slice(0, 800)}{form.content.length > 800 ? '…' : ''}
      </div>
      <div className="field-hint" style={{ marginBottom: 18 }}>
        {charCount.toLocaleString()} chars · ~{chunkEst} chunk{chunkEst !== 1 ? 's' : ''} · 768-dim vectors
      </div>

      {/* Editable review form */}
      <div className="form-stack">

        {/* Content type */}
        <div style={{ marginBottom: 4 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>Content type</div>
          <div className="type-chips">
            {TYPES.map(t => (
              <button
                key={t.value}
                id={`type-${t.value}`}
                className={`type-chip ${form.content_type === t.value ? 'selected' : ''}`}
                onClick={() => setForm(p => ({ ...p, content_type: t.value }))}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="review-title">Title</label>
          <input
            id="review-title"
            className="field-input"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="review-source">Source URL</label>
            <input
              id="review-source"
              className="field-input"
              placeholder="https://…"
              value={form.source_url}
              onChange={e => setForm(p => ({ ...p, source_url: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="review-tags">Tags</label>
            <input
              id="review-tags"
              className="field-input"
              placeholder="ai, research, systems"
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
            />
          </div>
        </div>

        {result && (
          <div className="alert alert-success">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0, marginTop:1, color:'#F5C400' }}>
              <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <span style={{ fontWeight: 600, color: '#F5C400' }}>Indexed</span>
              <span style={{ color: 'var(--gray-1)' }}> — {result.title} · {result.chunk_count} chunks</span>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0, marginTop:1 }}>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            id="index-btn"
            className="btn btn-yellow"
            onClick={onSubmit}
            disabled={loading || !form.title.trim()}
            style={{ padding: '11px 24px' }}
          >
            {loading
              ? <><div className="spin" /> Indexing…</>
              : <><IconCheck /> Index to memory</>
            }
          </button>
          <button
            className="btn btn-ghost"
            onClick={onDiscard}
            disabled={loading}
          >
            Discard
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Main Capture component ────────────────────────────────────
export default function Capture({ api, token, onSaved }) {
  const [tab, setTab]           = useState('manual')
  const [extracted, setExtracted] = useState(null)  // { title, content, source_url, content_type, meta }
  const [form, setForm]         = useState(EMPTY_FORM)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)

  // Called when a mode panel finishes extraction
  const handleExtracted = data => {
    setExtracted(data)
    setForm({
      title:        data.title || '',
      content:      data.content || '',
      content_type: data.content_type || 'note',
      source_url:   data.source_url || '',
      tags:         '',
    })
    setError(null)
    setResult(null)
  }

  const handleDiscard = () => {
    setExtracted(null)
    setForm(EMPTY_FORM)
    setError(null)
    setResult(null)
  }

  // Manual form field setter
  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(null) }

  // Submit to /save
  const submit = async (e) => {
    e?.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.')
      return
    }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch(`${api}/save`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title:        form.title.trim(),
          content:      form.content.trim(),
          content_type: form.content_type,
          source_url:   form.source_url.trim() || null,
          tags:         form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Save failed')
      }
      const data = await res.json()
      setResult(data)
      setForm(EMPTY_FORM)
      setExtracted(null)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const charCount = form.content.length
  const chunkEst  = charCount > 0 ? Math.ceil(charCount / 450) : 0

  return (
    <div style={{ padding: '36px', maxWidth: 700, width: '100%' }}>

      {/* Header */}
      <div className="section-header" style={{ padding: 0, marginBottom: 28 }}>
        <h1 className="section-title">Capture</h1>
        <p className="section-sub">Index content into your semantic memory layer.</p>
      </div>

      {/* Success toast (after index, before next action) */}
      {result && !extracted && (
        <div className="alert alert-success" style={{ marginBottom: 24 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0, marginTop:1, color:'#F5C400' }}>
            <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <span style={{ fontWeight: 600, color: '#F5C400' }}>Indexed</span>
            <span style={{ color: 'var(--gray-1)' }}> — {result.title} · {result.chunk_count} chunks stored</span>
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="ingest-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            className={`ingest-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setTab(t.id); handleDiscard() }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Manual tab ─────────────────────────────── */}
      {tab === 'manual' && (
        <>
          {/* Content type chips */}
          <div style={{ marginBottom: 20 }}>
            <div className="field-label" style={{ marginBottom: 10 }}>Content type</div>
            <div className="type-chips">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  id={`type-${t.value}`}
                  className={`type-chip ${form.content_type === t.value ? 'selected' : ''}`}
                  onClick={() => set('content_type', t.value)}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="card form-stack">
            <div className="field">
              <label className="field-label" htmlFor="title">Title</label>
              <input
                id="title"
                className="field-input"
                placeholder="Descriptive title for this memory"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="content">Content</label>
              <textarea
                id="content"
                className="field-textarea"
                placeholder="Paste your text — article body, transcript, notes, ideas…"
                style={{ minHeight: 180 }}
                value={form.content}
                onChange={e => set('content', e.target.value)}
              />
              {charCount > 0 && (
                <div className="field-hint">
                  {charCount.toLocaleString()} chars · ~{chunkEst} chunk{chunkEst !== 1 ? 's' : ''} · 768-dim vectors
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="source_url">Source URL</label>
                <input
                  id="source_url"
                  className="field-input"
                  placeholder="https://…"
                  value={form.source_url}
                  onChange={e => set('source_url', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="tags">Tags</label>
                <input
                  id="tags"
                  className="field-input"
                  placeholder="ai, research, systems"
                  value={form.tags}
                  onChange={e => set('tags', e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="alert alert-error">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0, marginTop:1 }}>
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div>
              <button
                id="capture-btn"
                type="submit"
                className="btn btn-yellow"
                disabled={loading}
                style={{ padding: '11px 24px' }}
              >
                {loading
                  ? <><div className="spin" /> Indexing…</>
                  : <><IconCheck /> Index to memory</>
                }
              </button>
            </div>
          </form>
        </>
      )}

      {/* ── URL tab ────────────────────────────────── */}
      {tab === 'url' && (
        <div className="card">
          <URLPanel onExtracted={handleExtracted} />
          {extracted && (
            <ReviewPanel
              extracted={extracted}
              form={form}
              setForm={setForm}
              loading={loading}
              error={error}
              result={result}
              onSubmit={submit}
              onDiscard={handleDiscard}
            />
          )}
        </div>
      )}

      {/* ── PDF tab ────────────────────────────────── */}
      {tab === 'pdf' && (
        <div className="card">
          <PDFPanel onExtracted={handleExtracted} />
          {extracted && (
            <ReviewPanel
              extracted={extracted}
              form={form}
              setForm={setForm}
              loading={loading}
              error={error}
              result={result}
              onSubmit={submit}
              onDiscard={handleDiscard}
            />
          )}
        </div>
      )}

      {/* ── YouTube tab ────────────────────────────── */}
      {tab === 'youtube' && (
        <div className="card">
          <YouTubePanel onExtracted={handleExtracted} />
          {extracted && (
            <ReviewPanel
              extracted={extracted}
              form={form}
              setForm={setForm}
              loading={loading}
              error={error}
              result={result}
              onSubmit={submit}
              onDiscard={handleDiscard}
            />
          )}
        </div>
      )}

    </div>
  )
}
