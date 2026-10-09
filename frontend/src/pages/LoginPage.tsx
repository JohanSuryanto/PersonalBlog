import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError, type Image } from '../api'
import { useAuth } from '../auth'
import { imageUrl } from '../cloudinary'
import { Icon } from '../components/Icon'
import { LogoMark } from '../components/Logo'
import { SITE_NAME } from '../site'

export function LoginPage() {
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const target = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [photos, setPhotos] = useState<Image[]>([])

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
  const described = [error && 'login-error', capsLock && 'caps-warning'].filter(Boolean).join(' ') || undefined

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
                aria-describedby={error ? 'login-error' : undefined}
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

            {error && (
              <p id="login-error" role="alert" className="alert">
                {error}
                {lockedUntil && <> Try again in <strong><time>{countdown}</time></strong>.</>}
              </p>
            )}

            <button type="submit" className="primary login-submit" disabled={busy || Boolean(lockedUntil)}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Logging in…</> : 'Log in'}
            </button>
          </form>

          <Link to="/" className="back-link login-back"><Icon name="chevronLeft" size={18} /> Back to the blog</Link>
        </div>
      </section>
    </div>
  )
}
