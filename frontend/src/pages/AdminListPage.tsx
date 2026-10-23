import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, MAX_PENDING, PENDING_CHANGED, STATUS_LABEL, type AdminPostSummary, type BlockedWriter, type PostStatus } from '../api'
import { useAuth } from '../auth'
import { imageUrl } from '../cloudinary'
import { lastSeenComment } from '../commentsSeen'
import { RejectDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { Toast } from '../components/Toast'
import { formatDate, timeAgo } from '../format'

type Tab = 'all' | PostStatus

export function AdminListPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<AdminPostSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [newComments, setNewComments] = useState('')
  const [rejecting, setRejecting] = useState<AdminPostSummary | null>(null)
  const [blocked, setBlocked] = useState<BlockedWriter[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const isOwner = Boolean(user?.isOwner)

  const load = useCallback(() => api.adminPosts().then(setPosts, () => setError(true)), [])
  const loadBlocked = useCallback(() => api.blockedWriters().then(setBlocked, () => {}), [])

  useEffect(() => {
    load()
    if (!isOwner) return
    loadBlocked()
    // Badge on the Comments button: comments newer than the last visit to the comments page.
    api.adminComments().then((page) => {
      const seen = lastSeenComment()
      const n = page.items.filter((c) => c.id > seen).length
      setNewComments(n ? `${n}${page.hasMore && n === page.items.length ? '+' : ''}` : '')
    }, () => {})
  }, [load, loadBlocked, isOwner])

  async function review(post: AdminPostSummary, note?: string, block = false) {
    setRejecting(null)
    try {
      if (note === undefined) await api.approvePost(post.id)
      else await api.rejectPost(post.id, note)
      if (block) await api.blockWriter(post.authorId)
      setToast(note === undefined ? `Published "${post.title}"` : block ? `Rejected and blocked ${post.authorName}` : `Rejected "${post.title}"`)
    } catch {
      setToast('Could not update the post. Please try again.')
    }
    load()
    if (block) loadBlocked()
    window.dispatchEvent(new Event(PENDING_CHANGED))
  }

  async function unblock(writer: BlockedWriter) {
    try {
      await api.unblockWriter(writer.id)
      setToast(`Unblocked ${writer.displayName}`)
    } catch {
      setToast('Could not unblock. Please try again.')
    }
    loadBlocked()
  }

  async function logout() {
    await api.logout().catch(() => {})
    setUser(null)
    navigate('/')
  }

  const counts = useMemo(() => {
    const count = (s: PostStatus) => posts?.filter((p) => p.status === s).length ?? 0
    return {
      all: posts?.length ?? 0,
      Published: count('Published'),
      Draft: count('Draft'),
      Pending: count('Pending'),
      Rejected: count('Rejected'),
      images: posts?.reduce((n, p) => n + p.imageCount, 0) ?? 0,
    }
  }, [posts])
  const atLimit = !isOwner && counts.Pending >= MAX_PENDING
  // Oldest submission first, so nobody waits behind newer posts.
  const waiting = isOwner
    ? (posts ?? []).filter((p) => p.status === 'Pending').sort((a, b) => (a.submittedAt ?? a.updatedAt).localeCompare(b.submittedAt ?? b.updatedAt))
    : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (posts ?? []).filter((p) => (tab === 'all' || p.status === tab) && (!q || p.title.toLowerCase().includes(q)))
  }, [posts, tab, query])

  const tabs = ([['all', 'All'], ['Published', 'Published'], ['Pending', 'Waiting'], ['Draft', 'Drafts'], ['Rejected', 'Rejected']] as [Tab, string][])
    .filter(([value]) => value === 'all' || value === 'Published' || counts[value] > 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          {user && <p className="muted" style={{ margin: 0 }}>Signed in as {user.email}</p>}
        </div>
        <span className="spacer" />
        {isOwner && (
          <Link to="/admin/comments" className="button-link secondary"><Icon name="comment" size={18} /> Comments
            {newComments && <span className="pill-count">{newComments}<span className="visually-hidden"> new</span></span>}
          </Link>
        )}
        {!atLimit && <Link to="/admin/posts/new" className="button-link"><Icon name="plus" size={18} /> New post</Link>}
        <button type="button" onClick={logout}><Icon name="logout" size={18} /> Log out</button>
      </div>

      {posts && !isOwner && (
        <>
          <dl className="stats-row" aria-live="polite">
            <div className={atLimit ? 'highlight' : undefined}>
              <dt>Waiting</dt><dd>{counts.Pending}/{MAX_PENDING}<span className="visually-hidden"> posts waiting for approval</span></dd>
            </div>
            <div><dt>Published</dt><dd>{counts.Published}</dd></div>
            <div><dt>Rejected</dt><dd>{counts.Rejected}</dd></div>
          </dl>
          <p className="muted stats-hint">
            {atLimit
              ? 'You can submit a new post once one of these is reviewed, or if you delete one.'
              : 'New posts are published after the owner approves them.'}
          </p>
        </>
      )}

      {posts && isOwner && (
        <dl className="stats-row">
          <div><dt>Published</dt><dd>{counts.Published}</dd></div>
          <div><dt>Drafts</dt><dd>{counts.Draft}</dd></div>
          {counts.Pending > 0 && <div><dt>Waiting</dt><dd>{counts.Pending}</dd></div>}
          <div><dt>Images</dt><dd>{counts.images}</dd></div>
        </dl>
      )}

      {waiting.length > 0 && (
        <section className="review-queue" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading" className="section-title">Waiting for approval</h2>
          <ul className="post-list" aria-label="Posts waiting for approval">
            {waiting.map((p) => (
              <li key={p.id}>
                <Thumb post={p} />
                <div className="post-info">
                  <Link to={`/admin/posts/${p.id}`} className="title">{p.title}</Link>
                  <div className="meta muted">
                    <span>by {p.authorName}</span>
                    <span title={formatDate(p.submittedAt ?? p.updatedAt)}>
                      Submitted <time dateTime={p.submittedAt ?? p.updatedAt}>{timeAgo(p.submittedAt ?? p.updatedAt)}</time>
                    </span>
                  </div>
                </div>
                <div className="row-actions review-actions">
                  <button type="button" className="primary" onClick={() => review(p)}>Approve<span className="visually-hidden"> {p.title}</span></button>
                  <button type="button" className="danger" onClick={() => setRejecting(p)}>Reject<span className="visually-hidden"> {p.title}</span></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="alert">Could not load posts.</p>}
      {!posts && !error && <p role="status">Loading…</p>}

      {posts?.length === 0 && (
        <div className="empty">
          <Icon name="grid" size={40} />
          <p>No posts yet.</p>
          <Link to="/admin/posts/new" className="button-link"><Icon name="plus" size={18} /> {isOwner ? 'Write your first post' : 'Submit your first post'}</Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <>
          <div className="list-toolbar">
            <div className="tabs" role="group" aria-label="Show posts">
              {tabs.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>
                  {label} <span className="count">{counts[value]}</span>
                </button>
              ))}
            </div>
            <div className="search-field compact">
              <Icon name="search" size={16} />
              <label className="visually-hidden" htmlFor="admin-search">Search your posts</label>
              <input id="admin-search" type="search" placeholder="Search titles" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="empty">No posts match.</p>
          ) : (
            <ul className="post-list" aria-label="Your posts">
              {visible.map((p) => (
                <li key={p.id}>
                  <Thumb post={p} />
                  <div className="post-info">
                    <Link to={`/admin/posts/${p.id}`} className="title">{p.title}</Link>
                    <div className="meta muted">
                      <span className={`status ${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span>
                      {isOwner && p.authorName !== user?.displayName && <span>by {p.authorName}</span>}
                      <span title={formatDate(p.updatedAt)}>Edited <time dateTime={p.updatedAt}>{timeAgo(p.updatedAt)}</time></span>
                      <span>{p.imageCount} {p.imageCount === 1 ? 'image' : 'images'}</span>
                    </div>
                    {p.status === 'Rejected' && p.reviewNote && <p className="review-note"><strong>Owner's note:</strong> {p.reviewNote}</p>}
                  </div>
                  <div className="row-actions">
                    {p.status === 'Published' && p.slug && (
                      <Link to={`/posts/${p.slug}`} className="icon-link" title="View">
                        <Icon name="eye" size={18} /><span className="visually-hidden">View {p.title}</span>
                      </Link>
                    )}
                    <Link to={`/admin/posts/${p.id}`} className="icon-link" title="Edit">
                      <Icon name="edit" size={18} /><span className="visually-hidden">Edit {p.title}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Toast message={toast} onDone={clearToast} />
      {blocked.length > 0 && (
        <section className="blocked-writers" aria-labelledby="blocked-heading">
          <h2 id="blocked-heading" className="section-title">Blocked writers</h2>
          <ul className="post-list" aria-label="Blocked writers">
            {blocked.map((w) => (
              <li key={w.id}>
                <div className="post-info">
                  <span className="title">{w.displayName}</span>
                  <div className="meta muted"><span>{w.email}</span></div>
                </div>
                <div className="row-actions review-actions">
                  <button type="button" onClick={() => unblock(w)}>Unblock<span className="visually-hidden"> {w.displayName}</span></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rejecting && (
        <RejectDialog title={rejecting.title} writerName={rejecting.authorName}
          onReject={(note, block) => review(rejecting, note, block)} onCancel={() => setRejecting(null)} />
      )}
    </>
  )
}

function Thumb({ post }: { post: AdminPostSummary }) {
  return (
    <Link to={`/admin/posts/${post.id}`} className="post-thumb" tabIndex={-1} aria-hidden="true">
      {post.coverPublicId ? <img src={imageUrl(post.coverPublicId, 160)} alt="" loading="lazy" /> : <Icon name="edit" size={20} />}
    </Link>
  )
}
