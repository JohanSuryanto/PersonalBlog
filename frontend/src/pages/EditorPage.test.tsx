import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPostSummary, Me } from '../api'
import { AuthProvider } from '../auth'
import { RequireAuth } from '../components/RequireAuth'
import { expectNoA11yViolations, json } from '../test-utils'
import { EditorPage } from './EditorPage'

let uploadCount = 0
let me: Me
let myPosts: Partial<AdminPostSummary>[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  uploadCount = 0
  me = { email: 'johan@example.com', displayName: 'Johan', isOwner: true }
  myPosts = []
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return json(me)
    if (url === '/api/admin/posts' && init?.method === 'POST') return json({ id: 7, ...JSON.parse(String(init.body)), slug: null, images: [] }, 201)
    if (url === '/api/admin/posts') return json(myPosts)
    if (url === '/api/images/signature')
      return json({ cloudName: 'demo', apiKey: 'k', timestamp: 1, folder: 'blog', allowedFormats: 'jpg,png,webp,gif', publicId: `sig-${uploadCount}`, signature: 's' })
    if (url.startsWith('https://api.cloudinary.com'))
      return json({ public_id: `blog/${uploadCount++}`, width: 10, height: 10, format: 'jpg', bytes: 100 })
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

// A data router, as in the app, so useBlocker works; RequireAuth waits for the signed-in user like the app does.
async function renderEditor() {
  const view = render(
    <AuthProvider>
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: '/admin', element: <h1>Dashboard page</h1> },
            { path: '/admin/posts/new', element: <RequireAuth><EditorPage /></RequireAuth> },
            { path: '/admin/posts/:id', element: <RequireAuth><EditorPage /></RequireAuth> },
          ],
          { initialEntries: ['/admin/posts/new'] },
        )}
      />
    </AuthProvider>,
  )
  await screen.findByRole('heading', { name: 'New post' })
  return view
}

const image = (name: string, type = 'image/jpeg', size = 1000) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('EditorPage images', () => {
  it('accepts at most 10 images and reports skipped files', async () => {
    await renderEditor()
    const files = Array.from({ length: 12 }, (_, i) => image(`p${i}.jpg`))
    await userEvent.upload(screen.getByLabelText('Add images'), files)

    expect(await screen.findByText('Images (10 / 10)')).toBeInTheDocument()
    expect(screen.getByText(/p10\.jpg: skipped/)).toBeInTheDocument()
    expect(screen.getByText(/p11\.jpg: skipped/)).toBeInTheDocument()
    expect(screen.getByLabelText('Add images')).toBeDisabled()
  })

  it('rejects non-images and files over 10 MB', async () => {
    await renderEditor()
    const input = screen.getByLabelText('Add images')
    await userEvent.upload(input, [image('doc.pdf', 'application/pdf'), image('big.png', 'image/png', 11 * 1024 * 1024)], {
      applyAccept: false,
    })
    expect(screen.getByText(/doc\.pdf: only JPEG, PNG, WebP or GIF/)).toBeInTheDocument()
    expect(screen.getByText(/big\.png: images must be 10 MB or smaller/)).toBeInTheDocument()
    expect(screen.getByText('Images (0 / 10)')).toBeInTheDocument()
  })

  it('reorders images and labels the first as cover', async () => {
    await renderEditor()
    await userEvent.upload(screen.getByLabelText('Add images'), [image('a.jpg'), image('b.jpg')])
    await screen.findByLabelText('Alt text for image 2')
    await userEvent.type(screen.getByLabelText('Alt text for image 2'), 'second')

    await userEvent.click(screen.getByRole('button', { name: 'Move image 2 up' }))
    expect(screen.getByText('Image 1 (Cover)')).toBeInTheDocument()
    expect(screen.getByLabelText('Alt text for image 1')).toHaveValue('second')
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderEditor()
    await expectNoA11yViolations(container)
  })
})

describe('EditorPage uploads', () => {
  it('sends the signed one-time image name with each upload', async () => {
    await renderEditor()
    await userEvent.upload(screen.getByLabelText('Add images'), [image('a.jpg')])
    await screen.findByText('Image 1 (Cover)')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('https://api.cloudinary.com'))).toBe(true))
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).startsWith('https://api.cloudinary.com'))!
    const form = init.body as FormData
    expect(form.get('public_id')).toBe('sig-0')
    expect(form.get('overwrite')).toBe('false')
  })
})

describe('EditorPage writing', () => {
  it('formats the selection with the toolbar', async () => {
    await renderEditor()
    const body = screen.getByLabelText('Body (Markdown)') as HTMLTextAreaElement
    await userEvent.type(body, 'hello world')
    body.setSelectionRange(6, 11)
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(body).toHaveValue('hello **world**')

    await userEvent.click(screen.getByRole('button', { name: 'Heading' }))
    expect(body.value.startsWith('## hello')).toBe(true)
  })

  it('tracks unsaved changes, word count and saves with Ctrl+S', async () => {
    const posts: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') return json(me)
      if (url === '/api/admin/posts') {
        posts.push(JSON.parse(String(init?.body)))
        return json({ id: 7, slug: null, status: 'Draft', images: [] }, 201)
      }
      return json({}, 404)
    }))
    await renderEditor()
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Title'), 'My trip')
    await userEvent.type(screen.getByLabelText('Body (Markdown)'), 'one two three')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByText(/3 words · 1 min read/)).toBeInTheDocument()

    await userEvent.keyboard('{Control>}s{/Control}')
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ title: 'My trip', body: 'one two three', status: 'Draft' })
  })
})

describe('EditorPage unsaved changes', () => {
  it('leaves freely when nothing changed', async () => {
    await renderEditor()
    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))
    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
  })

  it('asks before leaving through an in-app link with unsaved changes', async () => {
    await renderEditor()
    await userEvent.type(screen.getByLabelText('Title'), 'Half-written')
    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))

    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(dialog).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Half-written')

    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
  })

  it('Escape keeps editing', async () => {
    await renderEditor()
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('x')
  })
})

describe('EditorPage (contributor)', () => {
  beforeEach(() => { me = { email: 'writer@example.com', displayName: 'Writer', isOwner: false } })

  it('only offers Submit for approval, which sends a pending post', async () => {
    await renderEditor()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Title'), 'Guest story')
    await userEvent.type(screen.getByLabelText('Body (Markdown)'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/posts', expect.objectContaining({ method: 'POST' })))
    const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/posts' && init?.method === 'POST')!
    expect(JSON.parse(String(call[1].body)).status).toBe('Pending')
  })

  it('shows the limit instead of the form at 2/2', async () => {
    myPosts = [{ status: 'Pending' }, { status: 'Pending' }]
    await renderEditor()
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 2 of 2 posts waiting for approval')
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })
})
