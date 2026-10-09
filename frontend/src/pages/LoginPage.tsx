import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, type Image } from '../api'
import { useAuth } from '../auth'
import { imageUrl } from '../cloudinary'
import { Icon } from '../components/Icon'
import { LogoMark } from '../components/Logo'
import { SITE_NAME } from '../site'

// Where /api/auth/google/done sends a refused or failed Google sign-in (contracts/api.md, spec 003).
const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled. Please try again.',
  failed: 'Google sign-in failed. Please try again.',
  'not-allowed': "This Google account can't sign in here.",
  locked: 'Too many failed attempts. Please wait before trying again.',
}

export function LoginPage() {
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const target = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [photos, setPhotos] = useState<Image[]>([])
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    api.providers().then((p) => setGoogle(p.google), () => {})
  }, [])

  // Decorative collage of recent post photos for the brand panel.
  useEffect(() => {
    api.feed({}).then((page) => setPhotos(page.items.flatMap((p) => p.images).slice(0, 6)), () => {})
  }, [])

  // Live lockout countdown.
  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null)
        setError(null)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [lockedUntil])

  if (!loading && user) return <Navigate to={target} replace />

  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    setSearchParams({}, { replace: true })
    try {
      setUser(await api.login(String(form.get('email')), String(form.get('password'))))
      navigate(target, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setLockedUntil(Date.now() + Number(err.body.retryAfterSeconds ?? 900) * 1000)
        setNow(Date.now())
        setError('Too many failed attempts. Please wait before trying again.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Email or password is incorrect.')
      } else {
        setError('Could not log in. Check your connection and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  const shownError = error ?? GOOGLE_ERRORS[searchParams.get('error') ?? ''] ?? null
  const described = [shownError && 'login-error', capsLock && 'caps-warning'].filter(Boolean).join(' ') || undefined

  return (
    <div className="login-layout">
      <aside className="login-brand" aria-hidden="true">
        <div className="collage">
          {photos.map((img) => <img key={img.publicId} src={imageUrl(img.publicId, 400)} alt="" loading="lazy" />)}
        </div>
        <div className="login-brand-text">
          <LogoMark size={64} />
          <p className="login-brand-title">{SITE_NAME}</p>
          <p>Stories, photos and notes — written in one place, shared with everyone.</p>
        </div>
      </aside>

      <section className="login-form-wrap">
        <div className="login-form">
          <h1>Welcome back</h1>
          <p className="muted">Log in to write and manage your posts.</p>

          <form onSubmit={submit} className="stack">
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="you@example.com"
                aria-describedby={shownError ? 'login-error' : undefined}
              />
            </label>
            <label htmlFor="login-password">Password</label>
            <div className="password-field">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                onKeyDown={checkCaps}
                onKeyUp={checkCaps}
                aria-describedby={described}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            {capsLock && <p id="caps-warning" className="hint-warning">Caps Lock is on</p>}

            {shownError && (
              <p id="login-error" role="alert" className="alert">
                {shownError}
                {lockedUntil && <> Try again in <strong><time>{countdown}</time></strong>.</>}
              </p>
            )}

            <button type="submit" className="primary login-submit" disabled={busy || Boolean(lockedUntil)}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Logging in…</> : 'Log in'}
            </button>
          </form>

          {google && (
            <>
              <p className="login-divider"><span>or</span></p>
              {/* A real navigation, not a router Link: the API redirects to Google. */}
              <a className="google-login" href="/api/auth/google">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continue with Google
              </a>
            </>
          )}

          <Link to="/" className="back-link login-back"><Icon name="chevronLeft" size={18} /> Back to the blog</Link>
        </div>
      </section>
    </div>
  )
}
