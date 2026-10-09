import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations, json } from '../test-utils'
import { EditorPage } from './EditorPage'

let uploadCount = 0

beforeEach(() => {
  uploadCount = 0
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/images/signature')
      return json({ cloudName: 'demo', apiKey: 'k', timestamp: 1, folder: 'blog', allowedFormats: 'jpg,png,webp,gif', signature: 's' })
    if (url.startsWith('https://api.cloudinary.com'))
      return json({ public_id: `blog/${uploadCount++}`, width: 10, height: 10, format: 'jpg', bytes: 100 })
    return json({}, 404)
  }))
})

// A data router, as in the app, so useBlocker works.
const renderEditor = () =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin', element: <h1>Dashboard page</h1> },
          { path: '/admin/posts/new', element: <EditorPage /> },
        ],
        { initialEntries: ['/admin/posts/new'] },
      )}
    />,
  )

const image = (name: string, type = 'image/jpeg', size = 1000) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('EditorPage images', () => {
  it('accepts at most 10 images and reports skipped files', async () => {
    renderEditor()
    const files = Array.from({ length: 12 }, (_, i) => image(`p${i}.jpg`))
    await userEvent.upload(screen.getByLabelText('Add images'), files)

    expect(await screen.findByText('Images (10 / 10)')).toBeInTheDocument()
    expect(screen.getByText(/p10\.jpg: skipped/)).toBeInTheDocument()
    expect(screen.getByText(/p11\.jpg: skipped/)).toBeInTheDocument()
    expect(screen.getByLabelText('Add images')).toBeDisabled()
  })

  it('rejects non-images and files over 10 MB', async () => {
    renderEditor()
    const input = screen.getByLabelText('Add images')
    await userEvent.upload(input, [image('doc.pdf', 'application/pdf'), image('big.png', 'image/png', 11 * 1024 * 1024)], {
      applyAccept: false,
    })
    expect(screen.getByText(/doc\.pdf: only JPEG, PNG, WebP or GIF/)).toBeInTheDocument()
    expect(screen.getByText(/big\.png: images must be 10 MB or smaller/)).toBeInTheDocument()
    expect(screen.getByText('Images (0 / 10)')).toBeInTheDocument()
  })

  it('reorders images and labels the first as cover', async () => {
    renderEditor()
    await userEvent.upload(screen.getByLabelText('Add images'), [image('a.jpg'), image('b.jpg')])
    await screen.findByLabelText('Alt text for image 2')
    await userEvent.type(screen.getByLabelText('Alt text for image 2'), 'second')

    await userEvent.click(screen.getByRole('button', { name: 'Move image 2 up' }))
    expect(screen.getByText('Image 1 (Cover)')).toBeInTheDocument()
    expect(screen.getByLabelText('Alt text for image 1')).toHaveValue('second')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderEditor()
    await expectNoA11yViolations(container)
  })
})

describe('EditorPage writing', () => {
  it('formats the selection with the toolbar', async () => {
    renderEditor()
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
      if (url === '/api/admin/posts') {
        posts.push(JSON.parse(String(init?.body)))
        return json({ id: 7, slug: null, status: 'Draft', images: [] }, 201)
      }
      return json({}, 404)
    }))
    renderEditor()
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
    renderEditor()
    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))
    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
  })

  it('asks before leaving through an in-app link with unsaved changes', async () => {
    renderEditor()
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
    renderEditor()
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    await userEvent.click(screen.getByRole('link', { name: /Dashboard/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('x')
  })
})
