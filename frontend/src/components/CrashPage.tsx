import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { Icon } from './Icon'

/** Shown instead of the router's developer error screen when rendering throws. Works without the app's providers. */
export function CrashPage() {
  const error = useRouteError()
  useEffect(() => { console.error(error) }, [error])

  return (
    <main className="crash">
      <span className="crash-icon" aria-hidden="true"><Icon name="close" size={28} /></span>
      <h1>Something went wrong</h1>
      <p className="muted">Sorry, this page hit an unexpected error. Reloading usually fixes it.</p>
      <div className="crash-actions">
        <button type="button" className="primary" onClick={() => window.location.reload()}>Reload page</button>
        {/* A full page load (not a router link) so the app starts fresh. */}
        <a href="/" className="button-link secondary">Go to the blog</a>
      </div>
    </main>
  )
}
