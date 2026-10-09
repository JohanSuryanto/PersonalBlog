import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { api, type Profile } from '../api'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { PostCard, PostCardSkeleton } from '../components/PostCard'
import { PostModal } from '../components/PostModal'
import { useSearchPanel } from '../components/SearchToggle'
import { formatDay } from '../format'
import { useFeed } from '../hooks/useFeed'

export function FeedPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const filtered = Boolean(q || from || to)
  // Post popup lives in the URL (?post=slug), so Back closes it and the feed underneath never reloads.
  const popup = params.get('post')
  const location = useLocation()
  const navigate = useNavigate()
  const popupState = location.state as { popup?: boolean; toComments?: boolean } | null

  // Browser back/forward (also used by the post page's "All posts" link) restores the feed where the reader left it.
  const restore = useNavigationType() === 'POP'

  const { items, loading, error, done, loadMore, retry, sentinelRef, updateItem } = useFeed({ q, from, to }, restore)
  const [profile, setProfile] = useState<Profile | null>(null)
  const { open: panelOpen, setOpen: setPanelOpen, close: closePanel } = useSearchPanel()
  const [formError, setFormError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.profile().then(setProfile, () => {})
  }, [])

  useEffect(() => {
    if (panelOpen) searchRef.current?.focus()
  }, [panelOpen])

  const author = profile?.displayName || 'Author'

  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = {
      q: String(form.get('q') ?? '').trim(),
      from: String(form.get('from') ?? ''),
      to: String(form.get('to') ?? ''),
    }
    if (next.from && next.to && next.from > next.to) {
      setFormError('"From" date must be on or before "To" date.')
      return
    }
    setFormError(null)
    setPanelOpen(false)
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)))
  }

  function clear() {
    setFormError(null)
    setPanelOpen(false)
    setParams({})
  }

  function removeParam(name: 'q' | 'from' | 'to') {
    const next = new URLSearchParams(params)
    next.delete(name)
    setParams(next)
  }

  function openPost(slug: string, toComments: boolean) {
    const next = new URLSearchParams(params)
    next.set('post', slug)
    setParams(next, { state: { popup: true, toComments } })
  }

  function closePost() {
    // Opened here: step back. Arrived on a shared ?post= link: just drop the parameter.
    if (popupState?.popup) navigate(-1)
    else {
      const next = new URLSearchParams(params)
      next.delete('post')
      setParams(next, { replace: true })
    }
  }

  function onPanelKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closePanel()
  }

  return (
    <>
      <section className="profile" aria-labelledby="profile-name">
        <Avatar name={author} size={80} />
        <div>
          <h1 id="profile-name">{profile ? author : 'Posts'}</h1>
          {profile && (
            <p className="muted stats">
              <strong>{profile.postCount}</strong> {profile.postCount === 1 ? 'post' : 'posts'}
            </p>
          )}
          {profile?.bio && <p>{profile.bio}</p>}
        </div>
      </section>

      <div className="feed-toolbar">
        <span className="feed-tab"><Icon name="grid" size={16} /> Posts</span>
      </div>

      {/* key resets the uncontrolled inputs when the URL changes (e.g. Clear, back button) */}
      <form
        key={params.toString()}
        id="search-panel"
        className="search-panel"
        role="search"
        hidden={!panelOpen}
        onSubmit={apply}
        onKeyDown={onPanelKeyDown}
      >
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="visually-hidden" htmlFor="search-q">Search</label>
          <input ref={searchRef} id="search-q" type="search" name="q" defaultValue={q} placeholder="Search posts" />
        </div>
        <div className="date-row">
          <label>
            From
            <input type="date" name="from" defaultValue={from} aria-describedby={formError ? 'filter-error' : undefined} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={to} aria-describedby={formError ? 'filter-error' : undefined} />
          </label>
        </div>
        {formError && <p id="filter-error" role="alert" className="alert">{formError}</p>}
        <div className="row">
          <button type="submit" className="primary">Apply</button>
          {filtered && <button type="button" onClick={clear}>Clear filters</button>}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={closePanel}>Close</button>
        </div>
      </form>

      {filtered && !panelOpen && (
        <div className="row active-filters">
          {q && <span className="chip">“{q}”<button type="button" onClick={() => removeParam('q')} aria-label={`Remove search ${q}`}><Icon name="close" size={14} /></button></span>}
          {from && <span className="chip">From {formatDay(from)}<button type="button" onClick={() => removeParam('from')} aria-label="Remove from date"><Icon name="close" size={14} /></button></span>}
          {to && <span className="chip">To {formatDay(to)}<button type="button" onClick={() => removeParam('to')} aria-label="Remove to date"><Icon name="close" size={14} /></button></span>}
          <button type="button" className="ghost" onClick={clear}>Clear filters</button>
        </div>
      )}

      {items.map((post) => <PostCard key={post.id} post={post} author={author} onOpen={openPost} />)}

      {loading && items.length === 0 && (<><PostCardSkeleton /><PostCardSkeleton /></>)}

      <div ref={sentinelRef} />

      <div aria-live="polite">
        {loading && <p role="status" className={items.length ? 'feed-end' : 'visually-hidden'}>Loading posts…</p>}
        {error && (
          <p role="alert" className="feed-end">
            Could not load posts. <button type="button" onClick={retry}>Retry</button>
          </p>
        )}
        {done && items.length === 0 && (filtered ? (
          <div className="empty">
            <Icon name="search" size={40} />
            <p>No posts found.</p>
            <button type="button" onClick={clear}>Clear filters</button>
          </div>
        ) : (
          <div className="empty">
            <Icon name="grid" size={40} />
            <p>No posts yet. Check back soon!</p>
          </div>
        ))}
        {done && items.length > 0 && <p className="feed-end">You're all caught up · End of posts</p>}
      </div>

      {!done && !loading && !error && items.length > 0 && (
        <div className="load-more">
          <button type="button" onClick={loadMore}>Load more</button>
        </div>
      )}

      {popup && (
        <PostModal
          key={popup}
          slug={popup}
          toComments={popupState?.toComments}
          onClose={closePost}
          onCountChange={(commentCount) => updateItem(popup, { commentCount })}
        />
      )}
    </>
  )
}
