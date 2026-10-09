import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type AdminComment, type Comment } from '../api'
import { imageUrl } from '../cloudinary'
import { lastSeenComment, markCommentsSeen } from '../commentsSeen'
import { Avatar } from '../components/Avatar'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { PostModal } from '../components/PostModal'
import { Toast } from '../components/Toast'
import { timeAgo } from '../format'

const DAY = 86400000

/** "Today", "Yesterday", or "Monday, October 5" (plus the year when it isn't this year). */
function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / DAY)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

export function AdminCommentsPage() {
  const [items, setItems] = useState<AdminComment[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [stats, setStats] = useState<{ total: number; lastWeek: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState<AdminComment | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ postId: number; commentId: number } | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  // Fixed for this visit, so "new" markers don't vanish while the author is reading.
  const [seenBefore] = useState(lastSeenComment)
  const busy = useRef(false)

  const load = useCallback(async (before?: number) => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError(false)
    try {
      const page = await api.adminComments(before)
      setItems((list) => (before ? [...list, ...page.items] : page.items))
      setHasMore(page.hasMore)
      setStats({ total: page.total, lastWeek: page.lastWeek })
      if (!before && page.items.length) markCommentsSeen(page.items[0].id)
    } catch {
      setError(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadMore = useCallback(() => load(items[items.length - 1]?.id), [load, items])

  // Infinite scroll, same pattern as the feed; the "Load more" button is the fallback.
  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: '400px' })
    observer.current.observe(node)
  }, [loadMore])

  const groups = useMemo(() => {
    const out: { label: string; items: AdminComment[] }[] = []
    for (const c of items) {
      const label = dayLabel(c.createdAt)
      if (out[out.length - 1]?.label === label) out[out.length - 1].items.push(c)
      else out.push({ label, items: [c] })
    }
    return out
  }, [items])

  const newCount = items.filter((c) => c.id > seenBefore).length
  const newLabel = `${newCount}${hasMore && newCount === items.length ? '+' : ''}`

  const removed = useCallback((target: Comment) => {
    setItems((list) => list.filter((c) => c.id !== target.id))
    const recent = Date.now() - new Date(target.createdAt).getTime() < 7 * DAY
    setStats((s) => s && { total: s.total - 1, lastWeek: s.lastWeek - (recent ? 1 : 0) })
  }, [])

  async function confirmDelete() {
    const target = deleting!
    setDeleting(null)
    try {
      await api.deleteComment(target.id)
      removed(target)
      setToast('Comment deleted')
    } catch {
      setToast('Could not delete the comment')
    }
  }

  // Plain clicks open the post in a popup; Ctrl/Cmd/middle-click still open the link normally.
  function openPreview(e: MouseEvent, c: AdminComment) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setPreview({ postId: c.post.id, commentId: c.id })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin" className="back-link"><Icon name="chevronLeft" size={18} /> Dashboard</Link>
          <h1>Comments</h1>
          <p className="muted" style={{ margin: 0 }}>What readers are saying about your posts.</p>
        </div>
      </div>

      {stats && (
        <dl className="stats-row">
          <div><dt>Total</dt><dd>{stats.total}</dd></div>
          <div><dt>Last 7 days</dt><dd>{stats.lastWeek}</dd></div>
          <div className={newCount ? 'highlight' : undefined}><dt>New for you</dt><dd>{newLabel}</dd></div>
        </dl>
      )}

      {error && (
        <p role="alert" className="alert">
          Could not load comments.{' '}
          <button type="button" className="link-button" onClick={() => load(items[items.length - 1]?.id)}>Try again</button>
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="empty">
          <span className="comments-empty-icon" aria-hidden="true"><Icon name="comment" size={26} /></span>
          <h2>No comments yet</h2>
          <p>When readers comment on your posts, they show up here.</p>
        </div>
      )}

      {groups.map((g, i) => (
        <section key={g.label} className="comment-day" aria-labelledby={`day-${i}`}>
          <h2 id={`day-${i}`} className="day-label">{g.label}</h2>
          <ul className="activity-list" aria-labelledby={`day-${i}`}>
            {g.items.map((c) => {
              const unread = c.id > seenBefore
              const postUrl = c.post.slug ? `/posts/${c.post.slug}#comments` : `/admin/posts/${c.post.id}`
              return (
                <li key={c.id} className={unread ? 'activity unread' : 'activity'}>
                  <span className="activity-avatar">
                    <Avatar name={c.name} size={40} />
                    {unread && <span className="unread-dot" title="New"><span className="visually-hidden">New</span></span>}
                  </span>

                  <div className="activity-main">
                    <p className="activity-head">
                      <strong>{c.name}</strong>
                      {c.isAuthor && <span className="badge-author">Author</span>}
                      <span className="muted"> on </span>
                      <Link to={postUrl} className="activity-post" onClick={(e) => openPreview(e, c)} aria-haspopup="dialog">{c.post.title}</Link>
                      {c.post.status !== 'Published' && <span className={`status ${c.post.status.toLowerCase()}`}>{c.post.status}</span>}
                    </p>
                    <p className="activity-bubble comment-body clamp">{c.body}</p>
                    <p className="activity-meta muted">
                      <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
                      <button type="button" className="link-button danger-link" onClick={() => setDeleting(c)}>
                        <Icon name="trash" size={15} /> Delete<span className="visually-hidden"> comment by {c.name}</span>
                      </button>
                    </p>
                  </div>

                  {/* Duplicates the title link, so it's hidden from the tab order and screen readers. */}
                  <Link to={postUrl} className="activity-thumb" tabIndex={-1} aria-hidden="true" onClick={(e) => openPreview(e, c)}>
                    {c.post.coverPublicId
                      ? <img src={imageUrl(c.post.coverPublicId, 120)} alt="" loading="lazy" />
                      : <Icon name="edit" size={18} />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {loading && (
        <div className="activity-list" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="activity">
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none' }} />
              <div className="activity-main">
                <div className="skeleton skeleton-line" style={{ width: '45%' }} />
                <div className="skeleton" style={{ height: 44, borderRadius: 14, marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {loading && <p role="status" className="visually-hidden">Loading…</p>}
      {hasMore && !loading && (
        <>
          <div ref={sentinelRef} />
          <div className="load-more">
            <button type="button" onClick={loadMore}>Load more</button>
          </div>
        </>
      )}
      {!hasMore && !loading && items.length > 0 && <p className="feed-end">You're all caught up ✨</p>}

      {deleting && (
        <ConfirmDialog
          title="Delete comment?"
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          The comment by {deleting.name} on “{deleting.post.title}” will be removed for everyone. This can't be undone.
        </ConfirmDialog>
      )}
      {preview && (
        <PostModal
          postId={preview.postId}
          highlight={preview.commentId}
          onClose={() => setPreview(null)}
          onDeleted={removed}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}
