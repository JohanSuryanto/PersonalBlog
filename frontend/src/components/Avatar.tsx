/** Initial-letter avatar with an Instagram-style gradient ring. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      <span>{name.trim().charAt(0).toUpperCase() || '?'}</span>
    </span>
  )
}
