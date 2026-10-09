import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type AdminPostSummary } from '../api'
import { useAuth } from '../auth'
import { imageUrl } from '../cloudinary'
import { lastSeenComment } from '../commentsSeen'
import { Icon } from '../components/Icon'
import { formatDate, timeAgo } from '../format'

type Tab = 'all' | 'Published' | 'Draft'

export function AdminListPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<AdminPostSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [newComments, setNewComments] = useState('')

  useEffect(() => {
    api.adminPosts().then(setPosts, () => setError(true))
    // Badge on the Comments button: comments newer than the last visit to the comments page.
    api.adminComments().then((page) => {
      const seen = lastSeenComment()
      const n = page.items.filter((c) => c.id > seen).length
      setNewComments(n ? `${n}${page.hasMore && n === page.items.length ? '+' : ''}` : '')
    }, () => {})
  }, [])

  async function logout() {
    await api.logout().catch(() => {})
    setUser(null)
    navigate('/')
  }

  const counts = useMemo(() => {
    const published = posts?.filter((p) => p.status === 'Published').length ?? 0
    return {
      all: posts?.length ?? 0,
      Published: published,
      Draft: (posts?.length ?? 0) - published,
      images: posts?.reduce((n, p) => n + p.imageCount, 0) ?? 0,
    }
  }, [posts])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (posts ?? []).filter((p) => (tab === 'all' || p.status === tab) && (!q || p.title.toLowerCase().includes(q)))
  }, [posts, tab, query])

  const tabs: [Tab, string][] = [['all', 'All'], ['Published', 'Published'], ['Draft', 'Drafts']]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          {user && <p className="muted" style={{ margin: 0 }}>Signed in as {user.email}</p>}
        </div>
        <span className="spacer" />
        <Link to="/admin/comments" className="button-link secondary"><Icon name="comment" size={18} /> Comments
          {newComments && <span className="pill-count">{newComments}<span className="visually-hidden"> new</span></span>}
        </Link>
        <Link to="/admin/posts/new" className="button-link"><Icon name="plus" size={18} /> New post</Link>
        <button type="button" onClick={logout}><Icon name="logout" size={18} /> Log out</button>
      </div>

      {posts && (
        <dl className="stats-row">
          <div><dt>Published</dt><dd>{counts.Published}</dd></div>
          <div><dt>Drafts</dt><dd>{counts.Draft}</dd></div>
          <div><dt>Images</dt><dd>{counts.images}</dd></div>
        </dl>
      )}

      {error && <p role="alert" className="alert">Could not load posts.</p>}
      {!posts && !error && <p role="status">Loading…</p>}

      {posts?.length === 0 && (
        <div className="empty">
          <Icon name="grid" size={40} />
          <p>No posts yet.</p>
          <Link to="/admin/posts/new" className="button-link"><Icon name="plus" size={18} /> Write your first post</Link>
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
                  <Link to={`/admin/posts/${p.id}`} className="post-thumb" tabIndex={-1} aria-hidden="true">
                    {p.coverPublicId ? <img src={imageUrl(p.coverPublicId, 160)} alt="" loading="lazy" /> : <Icon name="edit" size={20} />}
                  </Link>
                  <div className="post-info">
                    <Link to={`/admin/posts/${p.id}`} className="title">{p.title}</Link>
                    <div className="meta muted">
                      <span className={`status ${p.status.toLowerCase()}`}>{p.status}</span>
                      <span title={formatDate(p.updatedAt)}>Edited <time dateTime={p.updatedAt}>{timeAgo(p.updatedAt)}</time></span>
                      <span>· {p.imageCount} {p.imageCount === 1 ? 'image' : 'images'}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link to={`/admin/posts/${p.id}`} className="icon-link" title="Edit">
                      <Icon name="edit" size={18} /><span className="visually-hidden">Edit {p.title}</span>
                    </Link>
                    {p.status === 'Published' && p.slug && (
                      <Link to={`/posts/${p.slug}`} className="icon-link" title="View">
                        <Icon name="eye" size={18} /><span className="visually-hidden">View {p.title}</span>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
