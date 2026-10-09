import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { Icon } from './components/Icon'
import { RequireAuth } from './components/RequireAuth'
import { SearchToggle } from './components/SearchToggle'
import { AdminCommentsPage } from './pages/AdminCommentsPage'
import { AdminListPage } from './pages/AdminListPage'
import { EditorPage } from './pages/EditorPage'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { PostPage } from './pages/PostPage'
import { useTheme } from './theme'

export default function App() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/admin') || pathname === '/login'

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="brand">
            Personal Blog
          </Link>
          <nav aria-label="Main">
            <SearchToggle />
            {user ? (
              <>
                <Link to="/admin/posts/new" aria-label="New post" title="New post">
                  <Icon name="plus" />
                </Link>
                <Link to="/admin">Dashboard</Link>
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
