import type { MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { FeedItem } from '../api'
import { imageUrl, srcSet } from '../cloudinary'
import { formatDate } from '../format'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { ImageSlider } from './ImageSlider'

export function PostCard({ post, author, onOpen }: {
  post: FeedItem
  author: string
  /** Plain clicks open the post in a popup; Ctrl/Cmd/middle-click still open the full post page. */
  onOpen?: (slug: string, toComments: boolean) => void
}) {
  const { search } = useLocation()
  const open = (toComments: boolean) => (e: MouseEvent) => {
    if (!onOpen || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onOpen(post.slug, toComments)
  }
  // Tells the post page where "All posts" should return to, so the feed comes back where it was.
  const link = { to: `/posts/${post.slug}`, state: { feedSearch: search }, onClick: open(false) }
  const [cover] = post.images

  return (
    <article className={cover ? 'card' : 'card text-only'}>
      <div className="card-head">
        <Avatar name={author} />
        <div>
          <strong>{author}</strong>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </div>
        </div>
      </div>

      {post.images.length > 1 && <ImageSlider images={post.images} title={post.title} variant="card" />}
      {post.images.length === 1 && (
        // Image link duplicates the title link, so hide it from the tab order and screen readers.
        <Link {...link} className="card-media" tabIndex={-1} aria-hidden="true">
          <img
            src={imageUrl(cover.publicId, 800)}
            srcSet={srcSet(cover.publicId)}
            sizes="(max-width: 640px) 100vw, 640px"
            width={cover.width}
            height={cover.height}
            alt=""
            loading="lazy"
          />
        </Link>
      )}

      <div className="card-body">
        <h2>
          <Link {...link}>{post.title}</Link>
        </h2>
        <p className="excerpt">{post.excerpt}</p>
        {!!post.commentCount && (
          <Link to={{ pathname: link.to, hash: '#comments' }} state={link.state} onClick={open(true)} className="card-comments">
            <Icon name="comment" size={18} /> {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
          </Link>
        )}
      </div>
    </article>
  )
}

export function PostCardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-head">
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 120, height: 12 }} />
      </div>
      <div className="skeleton" style={{ aspectRatio: '4 / 5', borderRadius: 0 }} />
      <div className="card-body">
        <div className="skeleton skeleton-line" style={{ width: '70%', height: 16 }} />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" style={{ width: '85%' }} />
      </div>
    </div>
  )
}
