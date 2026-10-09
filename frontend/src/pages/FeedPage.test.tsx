import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedItem } from '../api'
import { SearchPanelProvider, SearchToggle } from '../components/SearchToggle'
import { resetFeedCache } from '../hooks/useFeed'
import { expectNoA11yViolations, json } from '../test-utils'
import { FeedPage } from './FeedPage'

const image = (n: number) => ({ publicId: `blog/${n}`, width: 800, height: 1000, altText: null })

// Post 25 has 3 images, post 24 has 1, the rest are text-only.
const post = (id: number): FeedItem => ({
  id,
  slug: `post-${id}`,
  title: `Post ${id}`,
  excerpt: 'Excerpt',
  publishedAt: '2026-10-01T10:00:00Z',
  images: id === 25 ? [image(1), image(2), image(3)] : id === 24 ? [image(4)] : [],
  commentCount: id === 25 ? 2 : 0,
})

let fetchMock: ReturnType<typeof vi.fn>
const feedCalls = () => fetchMock.mock.calls.filter(([url]) => /^\/api\/posts(\?|$)/.test(String(url))).length

// 25 posts served 10 at a time; cursor is the next index.
function serveFeed(total = 25) {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/profile') return json({ displayName: 'Johan', bio: 'Hello there', postCount: total })
    if (url.endsWith('/comments')) return json({ items: [], hasMore: false })
    const detail = url.match(/^\/api\/posts\/post-(\d+)$/)
    if (detail) return json({
      ...post(Number(detail[1])), body: `Body of post ${detail[1]}`, status: 'Published',
      updatedAt: '2026-10-01T10:00:00Z', author: { displayName: 'Johan' },
    })
    const params = new URL(url, 'http://x').searchParams
    if (params.get('q') === 'nothing') return json({ items: [], nextCursor: null })
    const start = Number(params.get('cursor') ?? 0)
    const items = Array.from({ length: Math.min(10, total - start) }, (_, i) => post(total - start - i))
    const next = start + 10 < total ? String(start + 10) : null
    return json({ items, nextCursor: next })
  })
  vi.stubGlobal('fetch', fetchMock)
}

let location = ''
function LocationProbe() {
  location = useLocation().search
  return null
}

function FakePostPage() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>All posts</button>
}

const renderFeed = (url = '/') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SearchPanelProvider>
        <header><SearchToggle /><Link to="/posts/post-20">Elsewhere</Link></header>
        <main>
          <Routes>
            <Route path="/" element={<><FeedPage /><LocationProbe /></>} />
            <Route path="/posts/:slug" element={<FakePostPage />} />
          </Routes>
        </main>
      </SearchPanelProvider>
    </MemoryRouter>,
  )

const openPanel = () => userEvent.click(screen.getByRole('button', { name: /Search & filter/ }))

beforeEach(() => {
  resetFeedCache()
  serveFeed()
})

describe('FeedPage feed', () => {
  it('links the comment count to the post comments', async () => {
    renderFeed()
    const [first, second] = await screen.findAllByRole('article')
    expect(within(first).getByRole('link', { name: '2 comments' })).toHaveAttribute('href', '/posts/post-25#comments')
    expect(within(second).queryByRole('link', { name: /comment/ })).not.toBeInTheDocument()
  })

  it('loads batches without duplicates and shows the end indicator', async () => {
    renderFeed()
    expect(await screen.findAllByRole('article')).toHaveLength(10)

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(25))

    expect(screen.getByText(/End of posts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(new Set(titles).size).toBe(25)
    expect(titles[0]).toBe('Post 25')
  })

  it('lets readers slide through multiple images right in the feed', async () => {
    renderFeed()
    const [multi, single] = await screen.findAllByRole('article')

    expect(within(multi).getByText('1 / 3')).toBeInTheDocument()
    await userEvent.click(within(multi).getByRole('button', { name: 'Next image' }))
    expect(within(multi).getByText('2 / 3')).toBeInTheDocument()

    expect(within(single).queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument()
    expect(single.querySelector('img')).not.toBeNull()
  })

  it('restores loaded posts and scroll position when coming back from a post', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    const callsBefore = feedCalls()

    Object.defineProperty(window, 'scrollY', { value: 1234, configurable: true })
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    await userEvent.click(screen.getByRole('button', { name: 'All posts' }))

    expect(screen.getAllByRole('article')).toHaveLength(20) // immediately, no reload
    expect(feedCalls()).toBe(callsBefore)
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1234)
  })

  it('opens a post in a popup over the feed and closes back to it', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    const callsBefore = feedCalls()

    await userEvent.click(screen.getByRole('link', { name: 'Post 12' }))
    const dialog = await screen.findByRole('dialog', { name: 'Post 12' })
    expect(within(dialog).getByText('Body of post 12')).toBeInTheDocument()
    expect(location).toBe('?post=post-12')
    expect(within(dialog).queryByRole('link', { name: /Edit post/ })).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(location).toBe('')
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(feedCalls()).toBe(callsBefore)
  })

  it('pages through popup images with the arrow keys', async () => {
    renderFeed('/?post=post-25')
    const dialog = await screen.findByRole('dialog', { name: 'Post 25' })
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument()

    within(dialog).getByRole('button', { name: 'Close' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next image' }))
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
  })

  it('opens the popup from a shared ?post= link', async () => {
    renderFeed('/?post=post-3')
    expect(await screen.findByRole('dialog', { name: 'Post 3' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(location).toBe('')
  })

  it('shows the author profile with post count', async () => {
    renderFeed()
    expect(await screen.findByRole('heading', { level: 1, name: 'Johan' })).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    serveFeed(0)
    renderFeed()
    expect(await screen.findByText('No posts yet. Check back soon!')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderFeed()
    await screen.findAllByRole('article')
    await openPanel()
    await expectNoA11yViolations(container)
  })
})

describe('FeedPage search & filter', () => {
  it('keeps search and filters hidden until opened', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()

    await openPanel()
    expect(screen.getByRole('search')).toBeVisible()
    expect(screen.getByLabelText('Search')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search & filter/ })).toHaveFocus()
  })

  it('closes the panel when leaving the feed', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    await openPanel()
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    await userEvent.click(screen.getByRole('button', { name: 'All posts' }))

    await screen.findAllByRole('article')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search & filter/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the feed with the search panel from another page', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    await userEvent.click(screen.getByRole('button', { name: /Search & filter/ }))
    expect(await screen.findByRole('search')).toBeVisible()
    expect(screen.getByLabelText('Search')).toHaveFocus()
  })

  it('puts the search into the URL, refetches and closes the panel', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    await openPanel()
    await userEvent.type(screen.getByLabelText('Search'), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(location).toBe('?q=hello'))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/posts?q=hello', expect.anything())
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.getByText('“hello”')).toBeInTheDocument() // active filter chip stays visible
    expect(screen.getByRole('button', { name: /filters active/ })).toBeInTheDocument()
  })

  it('reads filters from the URL on first render', async () => {
    renderFeed('/?q=trip&from=2026-01-01&to=2026-01-31')
    await screen.findAllByRole('article')
    expect(fetchMock).toHaveBeenCalledWith('/api/posts?q=trip&from=2026-01-01&to=2026-01-31', expect.anything())
    await openPanel()
    expect(screen.getByLabelText('Search')).toHaveValue('trip')
    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01')
  })

  it('rejects a From date after the To date without a request', async () => {
    renderFeed()
    await screen.findAllByRole('article')
    const calls = fetchMock.mock.calls.length
    await openPanel()
    await userEvent.type(screen.getByLabelText('From'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('To'), '2026-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByRole('alert')).toHaveTextContent('"From" date must be on or before "To" date.')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('shows "No posts found" and clears filters', async () => {
    renderFeed('/?q=nothing')
    expect(await screen.findByText(/No posts found/)).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    await waitFor(() => expect(location).toBe(''))
    expect(await screen.findAllByRole('article')).toHaveLength(10)
  })
})
