import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_CHANGED, type Me } from './api'
import App from './App'
import { AuthProvider } from './auth'
import { SearchPanelProvider } from './components/SearchToggle'
import { json } from './test-utils'

let me: Me | null
let pending: number
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  me = { email: 'johan@example.com', displayName: 'Johan', isOwner: true }
  pending = 2
  fetchMock = vi.fn(async (url: string) =>
    url === '/api/auth/me' ? (me ? json(me) : json({}, 401))
    : url === '/api/admin/posts/pending-count' ? json(pending)
    : url === '/api/profile' ? json({ displayName: 'Johan', bio: null, postCount: 0 })
    : json({ items: [], nextCursor: null }))
  vi.stubGlobal('fetch', fetchMock)
})

const renderApp = () => render(
  <MemoryRouter>
    <AuthProvider>
      <SearchPanelProvider><App /></SearchPanelProvider>
    </AuthProvider>
  </MemoryRouter>,
)

describe('header waiting badge', () => {
  it('shows the owner how many posts wait for approval', async () => {
    renderApp()
    expect(await screen.findByRole('link', { name: 'Dashboard 2 posts waiting for approval' })).toHaveAttribute('href', '/admin')
  })

  it('refreshes after a review elsewhere on the page', async () => {
    renderApp()
    await screen.findByRole('link', { name: /2 posts waiting/ })
    pending = 0
    act(() => { window.dispatchEvent(new Event(PENDING_CHANGED)) })
    await waitFor(() => expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument())
  })

  it('is not shown or fetched for writers', async () => {
    me = { email: 'writer@example.com', displayName: 'Writer', isOwner: false }
    renderApp()
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/posts/pending-count', expect.anything())
  })
})
