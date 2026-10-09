import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPostSummary } from '../api'
import { timeAgo } from '../format'
import { expectNoA11yViolations, json } from '../test-utils'
import { AdminListPage } from './AdminListPage'

const summary = (id: number, title: string, status: 'Draft' | 'Published', imageCount = 0): AdminPostSummary => ({
  id, title, status, imageCount,
  slug: status === 'Published' ? title.toLowerCase().replace(/ /g, '-') : null,
  updatedAt: new Date(Date.now() - id * 86400000).toISOString(),
  publishedAt: null,
  coverPublicId: imageCount ? `blog/${id}` : null,
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/admin/comments')
    ? json({ items: [3, 2, 1].map((id) => ({ id })), hasMore: false, total: 3, lastWeek: 3 })
    : json([
    summary(1, 'Beach day', 'Published', 3),
    summary(2, 'Mountain hike', 'Published', 2),
    summary(3, 'Trip ideas', 'Draft'),
  ])))
})

const renderList = () => render(<MemoryRouter><AdminListPage /></MemoryRouter>)
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
