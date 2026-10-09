import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { expectNoA11yViolations, json } from '../test-utils'
import { LoginPage } from './LoginPage'

let loginResponse: () => Response
let loggedIn = false
let providersResponse: () => Response

beforeEach(() => {
  loggedIn = false
  providersResponse = () => json({ google: true })
  loginResponse = () => json({ email: 'a@b.c', displayName: 'Johan' })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return loggedIn ? json({ email: 'a@b.c', displayName: 'Johan' }) : json({}, 401)
    if (url === '/api/auth/login') return loginResponse()
    if (url === '/api/auth/providers') return providersResponse()
    if (url === '/api/profile') return json({ displayName: 'Johan', bio: null, postCount: 1 })
    return json({ items: [], nextCursor: null })
  }))
})

const renderLogin = (entry = '/login') =>
  render(
    <AuthProvider>
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: '/login', element: <LoginPage /> },
            { path: '/admin', element: <h1>Dashboard page</h1> },
          ],
          { initialEntries: [entry] },
        )}
      />
    </AuthProvider>,
  )

async function fillAndSubmit(password = 'secret') {
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('LoginPage', () => {
  it('logs in and goes to the dashboard', async () => {
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
  })

  it('skips the form when already logged in', async () => {
    loggedIn = true
    renderLogin()
    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument()
  })

  it('shows and hides the password', async () => {
    renderLogin()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('warns when Caps Lock is on', async () => {
    renderLogin()
    await userEvent.type(screen.getByLabelText('Password'), '{CapsLock}A')
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument()
  })

  it('explains wrong credentials', async () => {
    loginResponse = () => json({ title: 'Invalid' }, 401)
    renderLogin()
    await fillAndSubmit('wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  })

  it('counts down a lockout and disables the button', async () => {
    loginResponse = () => json({ retryAfterSeconds: 900 }, 423)
    renderLogin()
    await fillAndSubmit('wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Try again in 1[45]:\d\d/)
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderLogin()
    await screen.findByRole('heading', { name: 'Welcome back' })
    await screen.findByRole('link', { name: 'Continue with Google' })
    await expectNoA11yViolations(container)
  })

  it('offers Google sign-in as a full-page link', async () => {
    renderLogin()
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/api/auth/google')
  })

  it.each([
    ['disabled', () => json({ google: false })],
    ['unavailable', () => json({}, 500)],
  ])('hides Google sign-in when %s', async (_, response) => {
    providersResponse = response
    renderLogin()
    await screen.findByRole('heading', { name: 'Welcome back' })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it.each([
    ['cancelled', 'Google sign-in was cancelled. Please try again.'],
    ['failed', 'Google sign-in failed. Please try again.'],
    ['not-allowed', "This Google account can't sign in here."],
    ['locked', 'Too many failed attempts. Please wait before trying again.'],
  ])('explains Google error %s', async (code, message) => {
    renderLogin(`/login?error=${code}`)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('ignores unknown error codes', async () => {
    renderLogin('/login?error=whatever')
    await screen.findByRole('heading', { name: 'Welcome back' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
