import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPostSummary, BlockedWriter, Me, PostStatus } from '../api'
import { AuthProvider } from '../auth'
import { timeAgo } from '../format'
import { expectNoA11yViolations, json } from '../test-utils'
import { AdminListPage } from './AdminListPage'

const summary = (id: number, title: string, status: PostStatus, imageCount = 0, authorName = 'Johan'): AdminPostSummary => ({
  id, title, status, imageCount, authorId: `u-${authorName}`, authorName, reviewNote: null, submittedAt: null,
  slug: status === 'Published' ? title.toLowerCase().replace(/ /g, '-') : null,
  updatedAt: new Date(Date.now() - id * 86400000).toISOString(),
  publishedAt: null,
  coverPublicId: imageCount ? `blog/${id}` : null,
})

const owner: Me = { email: 'johan@example.com', displayName: 'Johan', isOwner: true }
let me: Me
let posts: AdminPostSummary[]
let blocked: BlockedWriter[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  me = owner
  blocked = []
  posts = [
    summary(1, 'Beach day', 'Published', 3),
    summary(2, 'Mountain hike', 'Published', 2),
    summary(3, 'Trip ideas', 'Draft'),
  ]
  fetchMock = vi.fn(async (url: string) => url === '/api/auth/me' ? json(me)
    : url.startsWith('/api/admin/comments') ? json({ items: [3, 2, 1].map((id) => ({ id })), hasMore: false, total: 3, lastWeek: 3 })
    : url === '/api/admin/writers/blocked' ? json(blocked)
    : /\/(approve|reject|block|unblock)$/.test(url) ? json({})
    : json(posts))
  vi.stubGlobal('fetch', fetchMock)
})

const renderList = () => render(<MemoryRouter><AuthProvider><AdminListPage /></AuthProvider></MemoryRouter>)
const rows = () => within(screen.getByRole('list', { name: 'Your posts' })).getAllByRole('listitem')

describe('timeAgo', () => {
  it('formats relative times', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    expect(timeAgo('2026-10-09T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-07T12:00:00Z', now)).toBe('2 days ago')
  })
})

describe('AdminListPage', () => {
  it('badges comments that are new since the last visit', async () => {
    localStorage.setItem('blog.lastSeenComment', '1')
    renderList()
    expect(await screen.findByRole('link', { name: 'Comments 2 new' })).toHaveAttribute('href', '/admin/comments')
  })

  it('shows stats', async () => {
    renderList()
    expect(await screen.findByText('Published', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Images', { selector: 'dt' }).nextSibling).toHaveTextContent('5')
    expect(screen.getByText('Drafts', { selector: 'dt' }).nextSibling).toHaveTextContent('1')
  })

  it('filters by tab and title search', async () => {
    renderList()
    await screen.findByText('Beach day')
    expect(rows()).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: /Drafts/ }))
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('Trip ideas')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /All/ }))
    await userEvent.type(screen.getByLabelText('Search your posts'), 'mount')
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('Mountain hike')).toBeInTheDocument()
  })

  it('offers a View link only for published posts', async () => {
    renderList()
    await screen.findByText('Beach day')
    expect(screen.getByRole('link', { name: 'View Beach day' })).toHaveAttribute('href', '/posts/beach-day')
    expect(screen.queryByRole('link', { name: 'View Trip ideas' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderList()
    await screen.findByText('Beach day')
    await expectNoA11yViolations(container)
  })
})

describe('AdminListPage approvals (owner)', () => {
  beforeEach(() => { posts = [...posts, summary(4, 'Guest story', 'Pending', 0, 'Writer')] })

  it('lists posts waiting for approval with their writer', async () => {
    renderList()
    const queue = within(await screen.findByRole('list', { name: 'Posts waiting for approval' }))
    expect(queue.getByRole('link', { name: 'Guest story' })).toHaveAttribute('href', '/admin/posts/4')
    expect(queue.getByText('by Writer')).toBeInTheDocument()
  })

  it('approves a post', async () => {
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: 'Approve Guest story' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/posts/4/approve', expect.objectContaining({ method: 'POST' }))
  })

  it('rejects a post with a note', async () => {
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject Guest story' }))
    await userEvent.type(screen.getByLabelText('Note for the writer (optional)'), 'Needs photos')
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/posts/4/reject',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ note: 'Needs photos' }) }))
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringMatching(/\/block$/), expect.anything())
  })

  it('can reject and block the writer in one go', async () => {
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: 'Reject Guest story' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Also block Writer/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject and block' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/writers/u-Writer/block', expect.objectContaining({ method: 'POST' })))
  })

  it('lists blocked writers with an Unblock button', async () => {
    blocked = [{ id: 'u-9', displayName: 'Spammer', email: 'spam@example.com' }]
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: 'Unblock Spammer' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/writers/u-9/unblock', expect.objectContaining({ method: 'POST' }))
  })
})

describe('AdminListPage (contributor)', () => {
  beforeEach(() => {
    me = { email: 'writer@example.com', displayName: 'Writer', isOwner: false }
    posts = [summary(1, 'My story', 'Pending', 0, 'Writer'), { ...summary(2, 'Old story', 'Rejected', 0, 'Writer'), reviewNote: 'Add photos' }]
  })

  it('shows slot usage, statuses and review notes, and no Comments link', async () => {
    renderList()
    expect(await screen.findByText((_, el) => el?.tagName === 'DD' && el.textContent === '1/2 posts waiting for approval')).toBeInTheDocument()
    expect(screen.getByText('Waiting for approval', { selector: '.status' })).toBeInTheDocument()
    expect(screen.getByText('Add photos', { exact: false, selector: '.review-note' })).toHaveTextContent("Owner's note: Add photos")
    expect(screen.getByRole('link', { name: 'New post' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Comments/ })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/comments/), expect.anything())
  })

  it('hides New post and explains why at 2/2', async () => {
    posts = [summary(1, 'One', 'Pending', 0, 'Writer'), summary(2, 'Two', 'Pending', 0, 'Writer')]
    renderList()
    expect(await screen.findByText((_, el) => el?.tagName === 'DD' && el.textContent === '2/2 posts waiting for approval')).toBeInTheDocument()
    expect(screen.getByText(/once one of these is reviewed/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New post' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderList()
    await screen.findByText((_, el) => el?.tagName === 'DD' && el.textContent === '1/2 posts waiting for approval')
    await expectNoA11yViolations(container)
  })
})
