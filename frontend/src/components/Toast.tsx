import { useEffect } from 'react'

/** Brief confirmation shown at the bottom of the screen; announced politely to screen readers. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [message, onDone])

  return (
    <div role="status" aria-live="polite" className={message ? 'toast show' : 'toast'}>
      {message}
    </div>
  )
}
