import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type PostDetail } from '../api'
import { Avatar } from '../components/Avatar'
import { CommentSection } from '../components/CommentSection'
import { Icon } from '../components/Icon'
import { ImageSlider } from '../components/ImageSlider'
import { Toast } from '../components/Toast'
import { formatDate, readingMinutes } from '../format'

export function PostPage() {
  const { slug = '' } = useParams()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const location = useLocation()
  const feedSearch = (location.state as { feedSearch?: string } | null)?.feedSearch
  const navigate = useNavigate()

  // Open each post at the top (the feed's scroll position is restored separately on the way back).
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [slug])

  useEffect(() => {
    setState('loading')
    api.post(slug).then(
      (p) => { setPost(p); setState('ok'); document.title = `${p.title} · Personal Blog` },
      (err) => setState(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error'),
    )
    return () => { document.title = 'Personal Blog' }
  }, [slug])

  // Feed card comment links open the post at its comments.
  useEffect(() => {
    if (state === 'ok' && location.hash === '#comments') document.getElementById('comments')?.scrollIntoView?.()
  }, [state, location.hash])

  const setCommentCount = useCallback((commentCount: number) => setPost((p) => p && { ...p, commentCount }), [])

  async function share() {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: post?.title, url }) } catch { /* cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Could not copy the link')
    }
  }

  // Came from the feed: step back in history so the feed restores its list and scroll position.
  const back = (
    <Link
      to={`/${feedSearch ?? ''}`}
      className="back-link"
      onClick={(e) => { if (feedSearch !== undefined) { e.preventDefault(); navigate(-1) } }}
    >
      <Icon name="chevronLeft" size={18} /> All posts
    </Link>
  )

  if (state === 'loading') return (
    <div aria-hidden="true">
      <div className="skeleton skeleton-line" style={{ width: 90, marginBottom: 16 }} />
      <div className="post-card">
        <div className="card-head">
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          <div className="skeleton" style={{ width: 160, height: 12 }} />
        </div>
        <div className="skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
        <div className="post-content">
          <div className="skeleton skeleton-line" style={{ width: '60%', height: 28 }} />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" style={{ width: '80%' }} />
        </div>
      </div>
      <p role="status" className="visually-hidden">Loading…</p>
    </div>
  )
  if (state === 'notfound') return (
    <div className="empty">
      <Icon name="grid" size={40} />
      <h1>Post not found</h1>
      <p>It may have been unpublished or the link is wrong.</p>
      {back}
    </div>
  )
  if (state === 'error' || !post) return <p role="alert" className="alert">Could not load this post. Please try again.</p>

  // Show "Updated" only for real edits, not the save that published the post.
  const edited = post.publishedAt && new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 60 * 60 * 1000
  const minutes = readingMinutes(post.body)

  return (
    <>
      <div className="post-toolbar">
        {back}
        <button type="button" className="ghost" onClick={share}>
          <Icon name="share" size={18} /> Share
        </button>
      </div>

      <article className="post-card">
        <header className="card-head">
          <Avatar name={post.author.displayName} size={40} />
          <div>
            <strong>{post.author.displayName}</strong>
            <p className="muted post-meta">
              {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
              <span aria-hidden="true"> · </span>
              {minutes} min read
            </p>
          </div>
        </header>

        {post.images.length > 0 && <ImageSlider images={post.images} title={post.title} variant="post" />}

        <div className="post-content">
          <h1 className="post-title">{post.title}</h1>
          <div className="prose">
            <Markdown>{post.body}</Markdown>
          </div>
          {edited && (
            <p className="muted post-updated">
              Updated <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
            </p>
          )}
        </div>
      </article>

      <CommentSection slug={slug} count={post.commentCount ?? 0} onCountChange={setCommentCount} />

      {(post.newer || post.older) && (
        <nav className="post-nav" aria-label="More posts">
          {post.newer ? (
            <Link to={`/posts/${post.newer.slug}`} state={{ feedSearch }} replace className="post-nav-link">
              <span className="muted"><Icon name="chevronLeft" size={16} /> Newer</span>
              <strong>{post.newer.title}</strong>
            </Link>
          ) : <span />}
          {post.older && (
            <Link to={`/posts/${post.older.slug}`} state={{ feedSearch }} replace className="post-nav-link older">
              <span className="muted">Older <Icon name="chevronRight" size={16} /></span>
              <strong>{post.older.title}</strong>
            </Link>
          )}
        </nav>
      )}

      <Toast message={toast} onDone={clearToast} />
    </>
  )
}
