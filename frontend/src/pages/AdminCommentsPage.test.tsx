import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminComment } from '../api'
import { AuthProvider } from '../auth'
import { expectNoA11yViolations, json } from '../test-utils'
import { AdminCommentsPage } from './AdminCommentsPage'

const DAY = 86400000
const adminComment = (id: number, draft = false, daysAgo = 0): AdminComment => ({
  id, name: `Reader ${id}`, body: `Comment ${id}`, isAuthor: false, createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  post: draft
    ? { id: 7, slug: null, title: 'Secret draft', status: 'Draft', coverPublicId: null }
    : { id: 3, slug: 'beach-day', title: 'Beach day', status: 'Published', coverPublicId: 'blog/beach' },
})

let pages: Record<string, { items: AdminComment[]; hasMore: boolean; total: number; lastWeek: number }>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  pages = {
    '': { items: [adminComment(3), adminComment(2, true, 1)], hasMore: true, total: 3, lastWeek: 3 },
    '2': { items: [adminComment(1, false, 30)], hasMore: false, total: 3, lastWeek: 3 },
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (url === '/api/auth/me') return json({ email: 'a@b.c', displayName: 'Johan' })
    if (url === '/api/admin/posts/3') return json({
      id: 3, slug: 'beach-day', title: 'Beach day', body: 'Sun and sand', status: 'Published', commentCount: 1,
      publishedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', author: { displayName: 'Johan' }, images: [],
    })
    if (url.startsWith('/api/posts/beach-day/comments')) return json({ items: [{ ...adminComment(3), post: undefined }], hasMore: false })
    return json(pages[new URL(url, 'http://x').searchParams.get('before') ?? ''])
  })
  vi.stubGlobal('fetch', fetchMock)
})

const renderPage = () => render(<AuthProvider><MemoryRouter><AdminCommentsPage /></MemoryRouter></AuthProvider>)
const rows = () => screen.getAllByRole('listitem')

describe('AdminCommentsPage', () => {
  it('lists newest comments with links to their posts and loads more', async () => {
    renderPage()
    expect(await screen.findByText('Comment 3')).toBeInTheDocument()
    expect(within(rows()[0]).getByRole('link', { name: 'Beach day' })).toHaveAttribute('href', '/posts/beach-day#comments')
    expect(within(rows()[1]).getByRole('link', { name: 'Secret draft' })).toHaveAttribute('href', '/admin/posts/7')

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.getByText(/all caught up/)).toBeInTheDocument()
  })

  it('groups by day, shows stats and flags comments that are new since the last visit', async () => {
    localStorage.setItem('blog.lastSeenComment', '2')
    renderPage()
    await screen.findByText('Comment 3')
    expect(screen.getByRole('list', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('3')
    expect(screen.getByText('New for you').nextElementSibling).toHaveTextContent('1')
    expect(within(rows()[0]).getByText('New')).toBeInTheDocument()
    expect(within(rows()[1]).queryByText('New')).not.toBeInTheDocument()
    expect(localStorage.getItem('blog.lastSeenComment')).toBe('3')
  })

  it('opens the post in a popup instead of leaving the page', async () => {
    renderPage()
    await screen.findByText('Comment 3')
    await userEvent.click(within(rows()[0]).getByRole('link', { name: 'Beach day' }))

    const dialog = await screen.findByRole('dialog', { name: 'Beach day' })
    expect(within(dialog).getByText('Sun and sand')).toBeInTheDocument()
    expect(await within(dialog).findByRole('heading', { name: '1 comment' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Edit post/ })).toHaveAttribute('href', '/admin/posts/3')

    // Deleting inside the popup also removes it from the activity list.
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete comment by Reader 3' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Comment 3')).not.toBeInTheDocument())

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deletes a comment after confirming', async () => {
    renderPage()
    await screen.findByText('Comment 3')
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment by Reader 3' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Comment 3')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/comments/3', expect.objectContaining({ method: 'DELETE' }))
  })

  it('shows an empty state', async () => {
    pages[''] = { items: [], hasMore: false, total: 0, lastWeek: 0 }
    renderPage()
    expect(await screen.findByText('No comments yet')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderPage()
    await screen.findByText('Comment 3')
    await expectNoA11yViolations(container)
  })
})
