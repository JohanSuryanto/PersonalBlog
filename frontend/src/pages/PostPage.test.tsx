import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostDetail } from '../api'
import { readingMinutes } from '../format'
import { expectNoA11yViolations, json } from '../test-utils'
import { PostPage } from './PostPage'

const detail = (over: Partial<PostDetail> = {}): PostDetail => ({
  id: 2,
  slug: 'middle',
  title: 'Middle post',
  body: 'word '.repeat(450) + '\n\n> A quote',
  publishedAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-01T10:00:00Z',
  author: { displayName: 'Johan' },
  images: [],
  newer: { slug: 'newest', title: 'Newest post' },
  older: { slug: 'oldest', title: 'Oldest post' },
  ...over,
})

let current: PostDetail
beforeEach(() => {
  current = detail()
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    String(url).includes('/comments') ? json({ items: [], hasMore: false }) : json(current)))
})

const renderPost = () =>
  render(
    <MemoryRouter initialEntries={['/', { pathname: '/posts/middle', state: { feedSearch: '' } }]} initialIndex={1}>
      <Routes>
        <Route path="/" element={<h1>Feed</h1>} />
        <Route path="/posts/:slug" element={<PostPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('readingMinutes', () => {
  it('estimates ~200 words per minute with a minimum of 1', () => {
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes('word '.repeat(450))).toBe(2)
  })
})

describe('PostPage', () => {
  it('shows author, date and reading time', async () => {
    renderPost()
    expect(await screen.findByRole('heading', { level: 1, name: 'Middle post' })).toBeInTheDocument()
    expect(screen.getByText('Johan')).toBeInTheDocument()
    expect(screen.getByText(/2 min read/)).toBeInTheDocument()
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  it('notes real edits after publishing', async () => {
    current = detail({ updatedAt: '2026-09-05T10:00:00Z' })
    renderPost()
    expect(await screen.findByText(/Updated/)).toBeInTheDocument()
  })

  it('links to newer and older posts', async () => {
    renderPost()
    expect(await screen.findByRole('link', { name: /Newer.*Newest post/ })).toHaveAttribute('href', '/posts/newest')
    expect(screen.getByRole('link', { name: /Older.*Oldest post/ })).toHaveAttribute('href', '/posts/oldest')
  })

  it('"All posts" goes back to the feed', async () => {
    renderPost()
    await userEvent.click(await screen.findByRole('link', { name: 'All posts' }))
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
  })

  it('copies the link when native sharing is unavailable', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPost()
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    current = detail({ images: [1, 2].map((n) => ({ publicId: `blog/${n}`, position: n, width: 800, height: 600, format: 'jpg', bytes: 1, altText: null })) })
    const { container } = renderPost()
    await screen.findByRole('heading', { level: 1 })
    await expectNoA11yViolations(container)
  })
})
