import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { api, PENDING_CHANGED } from './api'
import { useAuth } from './auth'
import { Icon } from './components/Icon'
import { LogoMark } from './components/Logo'
import { RequireAuth } from './components/RequireAuth'
import { SearchToggle } from './components/SearchToggle'
import { FeedPage } from './pages/FeedPage'
import { SITE_NAME } from './site'
import { useTheme } from './theme'

// Readers land on the feed; everything else (post page, login, author tools) loads on demand.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const PostPage = named(() => import('./pages/PostPage'), 'PostPage')
const LoginPage = named(() => import('./pages/LoginPage'), 'LoginPage')
const AdminListPage = named(() => import('./pages/AdminListPage'), 'AdminListPage')
const AdminCommentsPage = named(() => import('./pages/AdminCommentsPage'), 'AdminCommentsPage')
const EditorPage = named(() => import('./pages/EditorPage'), 'EditorPage')

/** Owner only: posts waiting for review. Refreshed on every page change and after a review. */
function usePendingCount(isOwner: boolean, pathname: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!isOwner) { setCount(0); return }
    const load = () => api.pendingCount().then(setCount, () => {})
    load()
    window.addEventListener(PENDING_CHANGED, load)
    return () => window.removeEventListener(PENDING_CHANGED, load)
  }, [isOwner, pathname])
  return count
}

export default function App() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/admin') || pathname === '/login'
  const pending = usePendingCount(Boolean(user?.isOwner), pathname)

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="brand">
            <LogoMark size={30} />
            <span className="brand-name">{SITE_NAME}</span>
          </Link>
          <nav aria-label="Main">
            <SearchToggle />
            {user ? (
              <>
                <Link to="/admin/posts/new" aria-label="New post" title="New post">
                  <Icon name="plus" />
                </Link>
                <Link to="/admin" className="nav-badged">
                  Dashboard
                  {pending > 0 && (
                    <span className="pill-count nav-badge">{pending}<span className="visually-hidden"> posts waiting for approval</span></span>
                  )}
                </Link>
              </>
            ) : (
              <Link to="/login">Log in</Link>
            )}
            <button
              type="button"
              className="icon"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={wide ? 'wide' : undefined}>
        <Suspense fallback={<p role="status" className="page-loading"><span className="spinner" aria-hidden="true" /> Loading…</p>}>
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/posts/:slug" element={<PostPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<RequireAuth><AdminListPage /></RequireAuth>} />
          <Route path="/admin/posts/new" element={<RequireAuth><EditorPage /></RequireAuth>} />
          <Route path="/admin/posts/:id" element={<RequireAuth><EditorPage /></RequireAuth>} />
          <Route path="/admin/comments" element={<RequireAuth><AdminCommentsPage /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
    </>
  )
}

function NotFound() {
  return (
    <section className="not-found">
      <p className="code" aria-hidden="true">404</p>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for doesn't exist or has moved.</p>
      <Link to="/" className="button-link"><Icon name="grid" size={18} /> Browse all posts</Link>
    </section>
  )
}
