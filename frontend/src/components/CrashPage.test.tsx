import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../test-utils'
import { CrashPage } from './CrashPage'

function Boom(): never {
  throw new Error('boom')
}

describe('CrashPage', () => {
  it('replaces a crashed page with a friendly reload screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter([{ path: '*', element: <Boom />, errorElement: <CrashPage /> }])
    const { container } = render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the blog' })).toHaveAttribute('href', '/')
    await expectNoA11yViolations(container)
  })
})
