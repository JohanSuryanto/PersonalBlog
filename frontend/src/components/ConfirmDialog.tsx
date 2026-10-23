import { useEffect, useRef, useState, type ReactNode } from 'react'

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

/** Owner rejects a contributor's post, with an optional note the writer will see. */
/** With `writerName`, it also offers to block the writer (spam): they can't sign in or submit again. */
export function RejectDialog({ title, writerName, onReject, onCancel }: {
  title: string
  writerName?: string
  onReject: (note: string, block: boolean) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [block, setBlock] = useState(false)
  return (
    <ConfirmDialog title={`Reject "${title}"?`} confirmLabel={block ? 'Reject and block' : 'Reject'} cancelLabel="Cancel"
      onConfirm={() => onReject(note, block)} onCancel={onCancel}>
      <p>The writer can revise it and submit it again.</p>
      <label htmlFor="reject-note">Note for the writer (optional)</label>
      <textarea id="reject-note" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {writerName && (
        <label className="check-row">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
          Also block {writerName} (spam): they can't sign in or submit posts until you unblock them.
        </label>
      )}
    </ConfirmDialog>
  )
}
