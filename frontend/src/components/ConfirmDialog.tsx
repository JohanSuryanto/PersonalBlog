import { useEffect, useRef, type ReactNode } from 'react'

/** Small modal confirmation. Focus starts on the safe choice; Esc cancels. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        onClick={(e) => e.stopPropagation()}
        // preventDefault keeps Esc from also closing a surrounding <dialog> (e.g. the post popup).
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }}
      >
        <h2 id="dialog-title">{title}</h2>
        <div id="dialog-body" className="muted">{children}</div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="primary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
