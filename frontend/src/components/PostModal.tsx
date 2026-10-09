import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Link } from 'react-router-dom'
import { api, type Comment, type PostDetail } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../format'
import { SITE_NAME } from '../site'
import { Avatar } from './Avatar'
import { CommentSection } from './CommentSection'
import { Icon } from './Icon'
import { ImageSlider } from './ImageSlider'

/** Instagram-style post popup: media on the left, post text and comments on the right. Uses the native <dialog>. */
export function PostModal({ postId, slug, highlight, toComments, onClose, onDeleted, onCountChange, onNavigate, neighbors }: {
  /** Author views load by id (drafts included); readers load a published post by slug. */
  postId?: number
  slug?: string
  highlight?: number
  /** Scroll to the comments once loaded (opened from a card's comment count). */
  toComments?: boolean
  onClose: () => void
  onDeleted?: (comment: Comment) => void
  onCountChange?: (count: number) => void
  /** Enables previous/next post arrows (Instagram-style). */
  onNavigate?: (slug: string) => void
  /** Neighbours in the list the popup was opened from; without it, falls back to the post's newer/older links. */
  neighbors?: { prev: string | null; next: string | null }
}) {
  const { user } = useAuth()
  const ref = useRef<HTMLDialogElement>(null)
  const [post, setPost] = useState<PostDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement as HTMLElement | null
    dialog?.showModal?.()
    return () => {
      dialog?.close?.()
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    setPost(null)
    setError(false)
    ;(slug ? api.post(slug) : api.adminPost(postId!)).then(setPost, () => setError(true))
  }, [postId, slug])

  // While open, the tab shows the post's title.
  useEffect(() => {
    if (!post) return
    const previous = document.title
    document.title = `${post.title} · ${SITE_NAME}`
    return () => { document.title = previous }
  }, [post])

  useEffect(() => {
    if (post && toComments) ref.current?.querySelector('#comments')?.scrollIntoView?.()
  }, [post, toComments])

  const setCommentCount = useCallback((commentCount: number) => {
    setPost((p) => p && { ...p, commentCount })
    onCountChange?.(commentCount)
  }, [onCountChange])

  const prev = onNavigate ? (neighbors ? neighbors.prev : post?.newer?.slug ?? null) : null
  const next = onNavigate ? (neighbors ? neighbors.next : post?.older?.slug ?? null) : null
  const nav = useRef({ prev, next, onNavigate })
  nav.current = { prev, next, onNavigate }

  // ← / → page through the images from anywhere while the popup is open (not while typing), then on to the
  // previous/next post. Listens on the document so it still works if focus has dropped to <body>.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.defaultPrevented || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"], [role="alertdialog"]')) return
      const back = e.key === 'ArrowLeft'
      const button = ref.current?.querySelector<HTMLButtonElement>(`.post-modal-media .slider-nav.${back ? 'prev' : 'next'}`)
      const target = back ? nav.current.prev : nav.current.next
      if (button && !button.disabled) button.click()
      else if (target) nav.current.onNavigate?.(target)
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const published = post?.status === 'Published' && post.slug

  return (
    <dialog
      ref={ref}
      className="post-modal"
      aria-labelledby="post-modal-title"
      // Esc fires "cancel"; let React own the closing so state stays in sync.
      onCancel={(e) => { e.preventDefault(); onClose() }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}

    >
      <button type="button" className="post-modal-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={22} />
      </button>
      {prev && (
        <button type="button" className="post-modal-nav prev" onClick={() => onNavigate!(prev)} aria-label="Previous post">
          <Icon name="chevronLeft" size={22} />
        </button>
      )}
      {next && (
        <button type="button" className="post-modal-nav next" onClick={() => onNavigate!(next)} aria-label="Next post">
          <Icon name="chevronRight" size={22} />
        </button>
      )}

      {!post && !error && (
        <div className="post-modal-loading">
          <span className="spinner" aria-hidden="true" />
          <p role="status" id="post-modal-title">Loading post…</p>
        </div>
      )}
      {error && <p role="alert" className="alert" id="post-modal-title">Could not load this post. It may have been unpublished.</p>}

      {post && (
        <div key={post.id} className={post.images.length ? 'post-modal-body' : 'post-modal-body text-only'}>
          {post.images.length > 0 && (
            <div className="post-modal-media">
              <ImageSlider images={post.images} title={post.title} variant="post" />
            </div>
          )}

          <div className="post-modal-side">
            <header className="post-modal-head">
              <Avatar name={post.author.displayName} size={36} />
              <div className="post-modal-who">
                <strong>{post.author.displayName}</strong>
                <span className="muted">
                  {post.publishedAt ? <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> : 'Not published'}
                </span>
              </div>
              {post.status !== 'Published' && <span className="status draft">{post.status}</span>}
            </header>

            <div className="post-modal-scroll">
              <h2 id="post-modal-title" className="post-modal-title">{post.title}</h2>
              <div className="prose post-modal-prose">
                <Markdown>{post.body}</Markdown>
              </div>

              {published ? (
                <CommentSection
                  slug={post.slug!}
                  count={post.commentCount ?? 0}
                  onCountChange={setCommentCount}
                  highlight={highlight}
                  onDeleted={onDeleted}
                />
              ) : (
                <p className="muted post-modal-note">
                  <Icon name="eyeOff" size={16} /> Comments are hidden while this post is a draft. Publish it again to show them.
                </p>
              )}
            </div>

            <footer className="post-modal-foot">
              {published && (
                <Link to={`/posts/${post.slug}`} className="ghost-link"><Icon name="eye" size={16} /> Open post page</Link>
              )}
              {user && <Link to={`/admin/posts/${post.id}`} className="ghost-link"><Icon name="edit" size={16} /> Edit post</Link>}
            </footer>
          </div>
        </div>
      )}
    </dialog>
  )
}
