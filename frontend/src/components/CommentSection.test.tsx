import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment } from '../api'
import { AuthProvider } from '../auth'
import { expectNoA11yViolations, json } from '../test-utils'
import { CommentSection } from './CommentSection'

const comment = (id: number, over: Partial<Comment> = {}): Comment => ({
  id, name: `Reader ${id}`, body: `Comment ${id}`, isAuthor: false, createdAt: new Date().toISOString(), ...over,
})

let loggedIn: boolean
let pages: Record<string, { items: Comment[]; hasMore: boolean }>
let postResponse: (body: { name: string; body: string; website: string }) => Response
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  loggedIn = false
  pages = { '': { items: [], hasMore: false } }
  postResponse = (b) => json(comment(99, { name: b.name, body: b.body }), 201)
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return loggedIn ? json({ email: 'a@b.c', displayName: 'Johan' }) : json({}, 401)
    if (init?.method === 'POST') return postResponse(JSON.parse(String(init.body)))
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return json(pages[new URL(url, 'http://x').searchParams.get('after') ?? ''])
  })
  vi.stubGlobal('fetch', fetchMock)
})

function renderSection(count = 0) {
  const onCountChange = vi.fn()
  const view = render(
    <AuthProvider>
      <MemoryRouter>
        <CommentSection slug="trip" count={count} onCountChange={onCountChange} />
      </MemoryRouter>
    </AuthProvider>,
  )
  return { ...view, onCountChange }
}

const list = () => screen.getByRole('list', { name: 'Comments' })

async function write(text: string, name?: string) {
  if (name !== undefined) await userEvent.type(screen.getByLabelText('Name'), name)
  await userEvent.type(screen.getByLabelText('Comment'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))
}

describe('CommentSection', () => {
  it('invites the first comment when there are none', async () => {
    renderSection()
    expect(screen.getByRole('heading', { name: 'No comments yet' })).toBeInTheDocument()
    expect(await screen.findByText(/Be the first/)).toBeInTheDocument()
  })

  it('lists comments with name, time and author badge', async () => {
    pages[''] = { items: [comment(1), comment(2, { name: 'Johan', isAuthor: true, body: 'Line one\nLine two' })], hasMore: false }
    renderSection(2)
    expect(screen.getByRole('heading', { name: '2 comments' })).toBeInTheDocument()
    const items = within(await screen.findByRole('list', { name: 'Comments' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Reader 1')).toBeInTheDocument()
    expect(within(items[0]).getByText('just now')).toBeInTheDocument()
    expect(within(items[1]).getByText('Author')).toBeInTheDocument()
    expect(within(items[1]).getByText(/Line one/)).toHaveTextContent('Line one Line two')
  })

  it('posts a comment, clears the text and remembers the name', async () => {
    const { onCountChange } = renderSection()
    await write('Hello there', 'Sam')

    expect(await within(list()).findByText('Hello there')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Comment posted')
    expect(screen.getByLabelText('Comment')).toHaveValue('')
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    expect(localStorage.getItem('blog.commentName')).toBe('Sam')
    expect(onCountChange).toHaveBeenCalledWith(1)
    const sent = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body))
    expect(sent).toEqual({ name: 'Sam', body: 'Hello there', website: '' })
  })

  it('remembers the name and lets the reader change it', async () => {
    localStorage.setItem('blog.commentName', 'Sam')
    renderSection()
    expect(screen.getByText(/Commenting as/)).toHaveTextContent('Commenting as Sam')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Change name' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Sam')
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus())
  })

  it('posts with Ctrl+Enter', async () => {
    renderSection()
    await userEvent.type(screen.getByLabelText('Name'), 'Sam')
    await userEvent.type(screen.getByLabelText('Comment'), 'Quick one{Control>}{Enter}{/Control}')
    expect(await within(list()).findByText('Quick one')).toBeInTheDocument()
  })

  it('clamps long comments behind a "more" button', async () => {
    pages[''] = { items: [comment(1, { body: 'word '.repeat(100).trim() })], hasMore: false }
    renderSection(1)
    const more = await screen.findByRole('button', { name: 'more of this comment' })
    expect(screen.getByText(/…$/)).toBeInTheDocument()
    await userEvent.click(more)
    expect(screen.getByText('word '.repeat(100).trim())).toBeInTheDocument()
  })

  it('shows field errors and keeps the text', async () => {
    postResponse = () => json({ errors: { Name: ['Name is required.'] } }, 400)
    renderSection()
    await write('Keep me', ' ')
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required.')
    expect(screen.getByLabelText('Comment')).toHaveValue('Keep me')
  })

  it('asks to slow down when rate limited and keeps the text', async () => {
    postResponse = () => json({}, 429)
    renderSection()
    await write('Again', 'Sam')
    expect(await screen.findByRole('alert')).toHaveTextContent("You're commenting too fast. Try again in a few minutes.")
    expect(screen.getByLabelText('Comment')).toHaveValue('Again')
  })

  it('counts down remaining characters near the limit', async () => {
    renderSection()
    const box = screen.getByLabelText('Comment')
    expect(screen.queryByText(/characters left/)).not.toBeInTheDocument()
    await userEvent.click(box)
    await userEvent.paste('a'.repeat(1900))
    expect(screen.getByText('100 characters left')).toBeInTheDocument()
  })

  it('loads more comments on demand', async () => {
    pages[''] = { items: [comment(1), comment(2)], hasMore: true }
    pages['2'] = { items: [comment(3)], hasMore: false }
    renderSection(3)
    await userEvent.click(await screen.findByRole('button', { name: 'Load more comments' }))
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument()
  })

  it('keeps the honeypot out of reach', () => {
    const { container } = renderSection()
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(trap).toHaveAttribute('tabindex', '-1')
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('hides delete from readers', async () => {
    pages[''] = { items: [comment(1)], hasMore: false }
    renderSection(1)
    await screen.findByText('Comment 1')
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })

  it('lets the author comment without a name and delete after confirming', async () => {
    loggedIn = true
    pages[''] = { items: [comment(1), comment(2)], hasMore: false }
    const { onCountChange } = renderSection(2)
    await screen.findByText('Comment 1')
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Delete comment by Reader 1' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Comment 1')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/comments/1', expect.objectContaining({ method: 'DELETE' }))
    expect(onCountChange).toHaveBeenCalledWith(1)
  })

  it('has no accessibility violations', async () => {
    pages[''] = { items: [comment(1, { isAuthor: true })], hasMore: true }
    const { container } = renderSection(5)
    await screen.findByText('Comment 1')
    await expectNoA11yViolations(container)
  })
})
