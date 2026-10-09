import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Markdown from 'react-markdown'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type ImageInput, type PostStatus } from '../api'
import { checkFile, imageUrl, MAX_IMAGES, uploadImage } from '../cloudinary'
import { Icon, type IconName } from '../components/Icon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'
import { readingMinutes, wordCount } from '../format'

type Slot = {
  key: string
  status: 'uploading' | 'done' | 'failed'
  file?: File
  image?: ImageInput
  previewUrl: string
}

let nextKey = 0
const newKey = () => `img-${nextKey++}`

/** Markdown toolbar actions: wrap the selection, or prefix the selected lines. */
const FORMATS: { icon: IconName; label: string; wrap?: [string, string]; prefix?: string; placeholder: string }[] = [
  { icon: 'bold', label: 'Bold', wrap: ['**', '**'], placeholder: 'bold text' },
  { icon: 'italic', label: 'Italic', wrap: ['_', '_'], placeholder: 'italic text' },
  { icon: 'heading', label: 'Heading', prefix: '## ', placeholder: 'Heading' },
  { icon: 'list', label: 'Bulleted list', prefix: '- ', placeholder: 'List item' },
  { icon: 'quote', label: 'Quote', prefix: '> ', placeholder: 'Quote' },
  { icon: 'link', label: 'Link', wrap: ['[', '](https://)'], placeholder: 'link text' },
]

export function EditorPage() {
  const { id } = useParams()
  const postId = id ? Number(id) : null
  const navigate = useNavigate()
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<PostStatus>('Draft')
  const [slug, setSlug] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(postId !== null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fileMessages, setFileMessages] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [sessionExpired, setSessionExpired] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf('', '', []))
  const clearToast = useCallback(() => setToast(null), [])

  const images = slots.filter((s) => s.status === 'done' && s.image).map((s) => s.image!)
  const dirty = snapshotOf(title, body, images) !== savedSnapshot

  useEffect(() => {
    if (postId === null) return
    api.adminPost(postId).then(
      (p) => {
        setTitle(p.title)
        setBody(p.body)
        setStatus(p.status ?? 'Draft')
        setSlug(p.slug)
        setSlots(p.images.map((img) => ({ key: newKey(), status: 'done', image: img, previewUrl: imageUrl(img.publicId, 300) })))
        setSavedSnapshot(snapshotOf(p.title, p.body, p.images))
        setLoading(false)
      },
      () => { setMessage('Could not load this post.'); setLoading(false) },
    )
  }, [postId])

  // Warn before leaving the editor through an in-app link with unsaved changes.
  // Our own navigations (after save/delete) set leaving.current so they are never blocked.
  const leaving = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)

  // Warn before closing the tab or reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const updateSlot = (key: string, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  async function upload(slot: Slot) {
    updateSlot(slot.key, { status: 'uploading' })
    try {
      const sig = await api.uploadSignature()
      const image = await uploadImage(slot.file!, sig)
      updateSlot(slot.key, { status: 'done', image })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSessionExpired(true)
      updateSlot(slot.key, { status: 'failed' })
    }
  }

  function addFiles(files: File[]) {
    const msgs: string[] = []
    const accepted: Slot[] = []
    let room = MAX_IMAGES - slots.length

    for (const file of files) {
      const problem = checkFile(file)
      if (problem) { msgs.push(problem); continue }
      if (room <= 0) { msgs.push(`${file.name}: skipped — a post can have at most ${MAX_IMAGES} images.`); continue }
      room--
      accepted.push({ key: newKey(), status: 'uploading', file, previewUrl: URL.createObjectURL(file) })
    }
    setFileMessages(msgs)
    setSlots((prev) => [...prev, ...accepted])
    accepted.forEach(upload)
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  function onDropFiles(e: DragEvent) {
    e.preventDefault()
    if (dragFrom === null && slots.length < MAX_IMAGES) addFiles(Array.from(e.dataTransfer.files))
  }

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= slots.length) return
    setSlots((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  // Native drag-and-drop reordering; the arrow buttons are the keyboard alternative.
  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: DragEvent) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i) } },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (dragFrom !== null) moveTo(dragFrom, i)
      setDragFrom(null)
      setDragOver(null)
    },
    onDragEnd: () => { setDragFrom(null); setDragOver(null) },
  })

  const remove = (key: string) => setSlots((prev) => prev.filter((s) => s.key !== key))

  const setAlt = (key: string, altText: string) =>
    setSlots((prev) => prev.map((s) => (s.key === key && s.image ? { ...s, image: { ...s.image, altText } } : s)))

  /** Applies a toolbar format to the textarea selection using the native setRangeText. */
  function format(f: (typeof FORMATS)[number]) {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = el.value.slice(start, end) || f.placeholder
    if (f.wrap) {
      el.setRangeText(f.wrap[0] + selected + f.wrap[1], start, end, 'end')
      el.setSelectionRange(start + f.wrap[0].length, start + f.wrap[0].length + selected.length)
    } else {
      const lineStart = el.value.lastIndexOf('\n', start - 1) + 1
      const lines = el.value.slice(lineStart, end) || f.placeholder
      el.setRangeText(lines.split('\n').map((l) => f.prefix + l).join('\n'), lineStart, end, 'end')
    }
    setBody(el.value)
    el.focus()
  }

  const save = useCallback(async (nextStatus: PostStatus) => {
    setSaving(true)
    setMessage(null)
    setErrors({})
    const input = { title, body, status: nextStatus, images }
    try {
      const saved = postId === null ? await api.createPost(input) : await api.updatePost(postId, input)
      const was = status
      setStatus(saved.status ?? nextStatus)
      setSlug(saved.slug)
      setSavedSnapshot(snapshotOf(title, body, images))
      setToast(
        nextStatus === 'Published'
          ? was === 'Published' ? 'Post updated' : 'Post published'
          : was === 'Published' ? 'Post unpublished' : 'Draft saved',
      )
      if (postId === null) {
        leaving.current = true
        navigate(`/admin/posts/${saved.id}`, { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSessionExpired(true)
      else if (err instanceof ApiError && err.status === 400) {
        setErrors(err.errors)
        setMessage('Please fix the errors below.')
      } else setMessage('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [title, body, images, postId, status, navigate])

  const uploading = slots.some((s) => s.status === 'uploading')

  // Ctrl/⌘+S saves without changing the status.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!saving && !uploading) save(status)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saving, uploading, status])

  async function destroy() {
    if (postId === null || !window.confirm('Delete this post permanently?')) return
    try {
      await api.deletePost(postId)
      leaving.current = true
      navigate('/admin')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSessionExpired(true)
      else setMessage('Could not delete. Please try again.')
    }
  }

  if (loading) return <p role="status">Loading…</p>

  const fieldError = (name: string) => errors[name]?.join(' ') ?? errors[name.toLowerCase()]?.join(' ')
  const titleError = fieldError('Title')
  const bodyError = fieldError('Body')
  const imagesError = fieldError('Images')
  const full = slots.length >= MAX_IMAGES
  const words = wordCount(body)

  return (
    <section>
      <Link to="/admin" className="back-link"><Icon name="chevronLeft" size={18} /> Dashboard</Link>

      {sessionExpired && (
        <p role="alert" className="alert" style={{ marginTop: '1rem' }}>
          Your session has expired. Your changes are still here —{' '}
          <a href="/login" target="_blank" rel="noopener">log in again (opens a new tab)</a>, then save again.
        </p>
      )}
      {message && <p role="alert" className="alert" style={{ marginTop: '1rem' }}>{message}</p>}

      <div className="editor-layout">
        <div className="editor-main">
          <h1 className="visually-hidden">{postId === null ? 'New post' : 'Edit post'}</h1>

          <div className="editor-panel">
            <label className="visually-hidden" htmlFor="post-title">Title</label>
            <input
              id="post-title"
              className="title-input"
              value={title}
              maxLength={200}
              required
              placeholder="Post title"
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? 'title-error' : undefined}
            />
            {titleError && <p id="title-error" className="error">{titleError}</p>}

            <div className="body-toolbar">
              <div className="segmented" role="group" aria-label="Body editor mode">
                <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button>
                <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
              </div>
              {!preview && (
                <div className="format-buttons" role="group" aria-label="Formatting">
                  {FORMATS.map((f) => (
                    <button key={f.label} type="button" className="icon" onClick={() => format(f)} aria-label={f.label} title={f.label}>
                      <Icon name={f.icon} size={18} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {preview ? (
              <div className="preview prose" aria-label="Body preview">
                <Markdown>{body || '*Nothing to preview*'}</Markdown>
              </div>
            ) : (
              <>
                <label className="visually-hidden" htmlFor="post-body">Body (Markdown)</label>
                <textarea
                  id="post-body"
                  ref={bodyRef}
                  className="body-input"
                  value={body}
                  rows={16}
                  required
                  placeholder="Tell your story…"
                  onChange={(e) => setBody(e.target.value)}
                  aria-invalid={Boolean(bodyError)}
                  aria-describedby={bodyError ? 'body-error' : undefined}
                />
              </>
            )}
            {bodyError && <p id="body-error" className="error">{bodyError}</p>}
          </div>

          <fieldset className="editor-panel">
            <legend>Images ({slots.length} / {MAX_IMAGES})</legend>
            <label className="dropzone" onDragOver={(e) => { if (dragFrom === null) e.preventDefault() }} onDrop={onDropFiles}>
              <Icon name="images" size={32} />
              <span><strong>Add images</strong> or drag them here</span>
              <span style={{ fontSize: '0.8rem' }}>JPEG, PNG, WebP or GIF · up to 10 MB each · first image is the cover</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onFiles}
                disabled={full}
                aria-label="Add images"
              />
            </label>
            {full && <p className="muted">Maximum of {MAX_IMAGES} images reached.</p>}
            {fileMessages.length > 0 && (
              <ul role="alert" className="alert" style={{ listStyle: 'none', marginTop: '0.75rem' }}>
                {fileMessages.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
            {imagesError && <p className="error">{imagesError}</p>}

            {slots.length > 0 && (
              <ol className="image-grid">
                {slots.map((slot, i) => (
                  <li
                    key={slot.key}
                    className={[dragFrom === i && 'dragging', dragOver === i && dragFrom !== i && 'drop-target'].filter(Boolean).join(' ')}
                    {...dragProps(i)}
                  >
                    <div className="thumb">
                      <img src={slot.previewUrl} alt="" draggable={false} />
                      <span className="badge">{i === 0 ? `Image ${i + 1} (Cover)` : `Image ${i + 1}`}</span>
                      {slot.status === 'uploading' && <span className="state">Uploading…</span>}
                      {slot.status === 'failed' && <span className="state">Upload failed</span>}
                    </div>
                    <div className="controls">
                      {slot.status === 'done' && (
                        <label>
                          Alt text for image {i + 1}
                          <input
                            value={slot.image?.altText ?? ''}
                            maxLength={300}
                            placeholder="Describe the image"
                            onChange={(e) => setAlt(slot.key, e.target.value)}
                          />
                        </label>
                      )}
                      <div className="row">
                        <button type="button" onClick={() => moveTo(i, i - 1)} disabled={i === 0} aria-label={`Move image ${i + 1} up`} title="Move earlier">
                          <Icon name="chevronLeft" size={16} />
                        </button>
                        <button type="button" onClick={() => moveTo(i, i + 1)} disabled={i === slots.length - 1} aria-label={`Move image ${i + 1} down`} title="Move later">
                          <Icon name="chevronRight" size={16} />
                        </button>
                        {slot.status === 'failed' && <button type="button" onClick={() => upload(slot)}>Retry</button>}
                        <span className="spacer" />
                        <button type="button" className="danger" onClick={() => remove(slot.key)} aria-label={`Remove image ${i + 1}`} title="Remove">
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>
        </div>

        <aside className="publish-box" aria-label="Publishing">
          <div className="publish-status">
            <span className={`status ${status.toLowerCase()}`}>{status}</span>
            <span className={dirty ? 'save-state dirty' : 'save-state'} role="status">
              {saving ? 'Saving…' : dirty ? 'Unsaved changes' : postId === null ? 'Not saved yet' : 'All changes saved'}
            </span>
          </div>
          <p className="muted publish-meta">
            {words} {words === 1 ? 'word' : 'words'} · {readingMinutes(body)} min read · {slots.length} {slots.length === 1 ? 'image' : 'images'}
          </p>
          <div className="publish-actions">
            <button type="button" className="primary" onClick={() => save('Published')} disabled={saving || uploading}>
              {status === 'Published' ? 'Update' : 'Publish'}
            </button>
            <button type="button" onClick={() => save('Draft')} disabled={saving || uploading}>
              {status === 'Published' ? 'Unpublish' : 'Save draft'}
            </button>
          </div>
          {uploading && <p className="muted publish-meta">Waiting for uploads…</p>}
          <p className="muted publish-hint"><kbd>Ctrl</kbd> + <kbd>S</kbd> to save</p>
          {status === 'Published' && slug && (
            <Link to={`/posts/${slug}`} className="publish-link"><Icon name="eye" size={16} /> View public page</Link>
          )}
          {postId !== null && (
            <button type="button" className="ghost danger delete-button" onClick={destroy}>
              <Icon name="trash" size={16} /> Delete post
            </button>
          )}
        </aside>
      </div>

      <Toast message={toast} onDone={clearToast} />

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          confirmLabel="Leave without saving"
          cancelLabel="Keep editing"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        >
          You have unsaved changes to this post. They will be lost if you leave now.
        </ConfirmDialog>
      )}
    </section>
  )
}

function snapshotOf(title: string, body: string, images: ImageInput[]) {
  return JSON.stringify([title, body, images.map((i) => [i.publicId, i.altText ?? ''])])
}
