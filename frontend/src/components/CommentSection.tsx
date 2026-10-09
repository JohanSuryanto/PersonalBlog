import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, ApiError, type Comment } from '../api'
import { useAuth } from '../auth'
import { timeAgo } from '../format'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'

const MAX_NAME = 50
const MAX_BODY = 2000
const NAME_KEY = 'blog.commentName'

function savedName() {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}

export function CommentSection({ slug, count, onCountChange, highlight, onDeleted }: {
  slug: string
  count: number
  onCountChange: (count: number) => void
  /** Comment to scroll to and glow once loaded (e.g. opened from the dashboard). */
  highlight?: number
  onDeleted?: (comment: Comment) => void
}) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [cursor, setCursor] = useState<number | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading')

  const [name, setName] = useState(savedName)
  const [editingName, setEditingName] = useState(() => !savedName())
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState<Comment | null>(null)
  const [fresh, setFresh] = useState<number | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Grow the composer with its text (and shrink back after posting).
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  // Merge by id: a comment the reader just posted may also arrive in a later page.
  const merge = (more: Comment[]) =>
    setComments((list) => [...list, ...more.filter((c) => !list.some((x) => x.id === c.id))].sort((a, b) => a.id - b.id))

  async function load(after?: number) {
    setLoadState('loading')
    try {
      const page = await api.comments(slug, after)
      merge(page.items)
      setHasMore(page.hasMore)
      if (page.items.length) setCursor(page.items[page.items.length - 1].id)
      if (!after && page.items.some((c) => c.id === highlight)) setFresh(highlight!)
      setLoadState('ok')
    } catch {
      setLoadState('error')
    }
  }

  useEffect(() => {
    setComments([])
    setCursor(undefined)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Bring a just-posted comment into view and let it glow briefly.
  useEffect(() => {
    if (fresh === null) return
    document.getElementById(`comment-${fresh}`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    const t = setTimeout(() => setFresh(null), 2500)
    return () => clearTimeout(t)
  }, [fresh])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const website = String(new FormData(e.currentTarget).get('website') ?? '')
    setSending(true)
    setErrors({})
    setFormError(null)
    setNotice('')
    try {
      const created = await api.addComment(slug, { name: name.trim(), body: body.trim(), website })
      merge([created])
      setFresh(created.id)
      setBody('')
      setNotice('Comment posted')
      onCountChange(count + 1)
      if (!user) try { localStorage.setItem(NAME_KEY, name.trim()) } catch { /* private mode */ }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.errors).length) setErrors(err.errors)
      else if (err instanceof ApiError && err.status === 429) setFormError("You're commenting too fast. Try again in a few minutes.")
      else if (err instanceof ApiError && err.status === 404) setFormError('This post is no longer available.')
      else setFormError('Could not post your comment. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  async function confirmDelete() {
    const target = deleting!
    setDeleting(null)
    try {
      await api.deleteComment(target.id)
      setComments((list) => list.filter((c) => c.id !== target.id))
      onCountChange(Math.max(0, count - 1))
      onDeleted?.(target)
      setNotice('Comment deleted')
    } catch {
      setNotice('Could not delete the comment')
    }
  }

  function changeName() {
    setEditingName(true)
    setTimeout(() => nameRef.current?.focus())
  }

  function jumpToForm() {
    bodyRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    bodyRef.current?.focus({ preventScroll: true })
  }

  // Ctrl/Cmd + Enter posts; Enter alone adds a new line.
  function onBodyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim() && !sending) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  const left = MAX_BODY - body.length
  const nameError = errors.Name?.[0]
  const bodyError = errors.Body?.[0]
  const heading = count === 0 ? 'No comments yet' : `${count} ${count === 1 ? 'comment' : 'comments'}`
  const showNameField = !user && (editingName || !name.trim() || Boolean(nameError))
  const writer = user?.displayName ?? name.trim()

  return (
    <section id="comments" className="comments" aria-labelledby="comments-heading">
      <div className="comments-head">
        <h2 id="comments-heading">{heading}</h2>
        {comments.length >= 3 && (
          <button type="button" className="ghost comments-jump" onClick={jumpToForm}>
            <Icon name="edit" size={16} /> Add a comment
          </button>
        )}
      </div>

      {loadState === 'loading' && comments.length === 0 && (
        <div aria-hidden="true">
          {[70, 45, 60].map((w) => (
            <div key={w} className="comment">
              <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flex: 'none' }} />
              <div className="comment-main">
                <div className="skeleton skeleton-line" style={{ width: `${w}%` }} />
                <div className="skeleton skeleton-line" style={{ width: 70, height: 10 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.length > 0 && (
        <ol className="comment-list" aria-label="Comments">
          {comments.map((c) => (
            <li
              key={c.id}
              id={`comment-${c.id}`}
              className={['comment', c.isAuthor && 'is-author', c.id === fresh && 'fresh'].filter(Boolean).join(' ')}
            >
              <Avatar name={c.name} size={32} />
              <div className="comment-main">
                <p className="comment-text">
                  <strong className="comment-name">{c.name}</strong>
                  {c.isAuthor && <span className="badge-author">Author</span>}{' '}
                  <CommentBody text={c.body} />
                </p>
                <p className="comment-meta muted">
                  <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
                  {user && (
                    <button type="button" className="link-button danger-link" onClick={() => setDeleting(c)}>
                      Delete<span className="visually-hidden"> comment by {c.name}</span>
                    </button>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {loadState === 'ok' && comments.length === 0 && (
        <div className="comments-empty">
          <span className="comments-empty-icon" aria-hidden="true"><Icon name="comment" size={26} /></span>
          <p><strong>Start the conversation</strong></p>
          <p className="muted">Be the first to share your thoughts.</p>
        </div>
      )}
      {loadState === 'error' && (
        <p role="alert" className="alert">
          Could not load comments. <button type="button" className="link-button" onClick={() => load(cursor)}>Try again</button>
        </p>
      )}
      {hasMore && (
        <button type="button" className="link-button comments-more" onClick={() => load(cursor)} disabled={loadState === 'loading'}>
          {loadState === 'loading' ? 'Loading…' : 'Load more comments'}
        </button>
      )}

      <form className="comment-form" onSubmit={submit} noValidate>
        {user ? (
          <p className="comment-as muted">Commenting as <strong>{user.displayName}</strong></p>
        ) : showNameField ? (
          <div className="comment-name-field">
            <label htmlFor="comment-name">Name</label>
            <input
              id="comment-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoComplete="nickname"
              placeholder="Shown with your comment"
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'comment-name-error' : undefined}
            />
          </div>
        ) : (
          <p className="comment-as muted">
            Commenting as <strong>{name.trim()}</strong>{' '}
            <button type="button" className="link-button" onClick={changeName}>
              Change<span className="visually-hidden"> name</span>
            </button>
          </p>
        )}
        {showNameField && nameError && <p id="comment-name-error" className="field-error">{nameError}</p>}

        <div className={bodyError ? 'composer invalid' : 'composer'}>
          <Avatar name={writer || '?'} size={32} />
          <label htmlFor="comment-body" className="visually-hidden">Comment</label>
          <textarea
            id="comment-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); setNotice('') }}
            onKeyDown={onBodyKeyDown}
            placeholder="Add a comment…"
            maxLength={MAX_BODY}
            rows={1}
            required
            aria-invalid={bodyError ? true : undefined}
            aria-describedby={[bodyError && 'comment-body-error', left < 200 && 'comment-left'].filter(Boolean).join(' ') || undefined}
          />
          <button type="submit" className="composer-post" disabled={sending || !body.trim()}>
            {sending
              ? <><span className="spinner" aria-hidden="true" /> Posting…</>
              : <>Post<span className="visually-hidden"> comment</span></>}
          </button>
        </div>
        {bodyError && <p id="comment-body-error" className="field-error">{bodyError}</p>}

        {/* Honeypot: hidden from people and assistive tech; bots that fill every field get discarded. */}
        <div className="trap" aria-hidden="true">
          <label>Leave this empty <input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>

        {formError && <p role="alert" className="alert">{formError}</p>}

        <div className="composer-foot">
          <p role="status" className="comment-notice">{notice}</p>
          {left < 200 ? (
            <p id="comment-left" className={left < 20 ? 'field-hint warn' : 'field-hint muted'}>{left} characters left</p>
          ) : body.trim() ? (
            <p className="field-hint muted" aria-hidden="true"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to post</p>
          ) : null}
        </div>
      </form>

      {deleting && (
        <ConfirmDialog
          title="Delete comment?"
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          The comment by {deleting.name} will be removed for everyone. This can't be undone.
        </ConfirmDialog>
      )}
    </section>
  )
}

/** Plain-text body. Long comments start clamped with a "more" toggle, like Instagram. */
function CommentBody({ text }: { text: string }) {
  const lines = text.split('\n')
  const long = text.length > 280 || lines.length > 5
  const [open, setOpen] = useState(false)
  if (!long || open) return <span className="comment-body">{text}</span>
  return (
    <>
      <span className="comment-body">{lines.slice(0, 4).join('\n').slice(0, 220).trimEnd()}…</span>{' '}
      <button type="button" className="link-button muted-link" onClick={() => setOpen(true)}>
        more<span className="visually-hidden"> of this comment</span>
      </button>
    </>
  )
}
