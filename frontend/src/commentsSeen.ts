/** Id of the newest comment the author has seen on the dashboard; newer ones are flagged "new". */
const KEY = 'blog.lastSeenComment'

export function lastSeenComment() {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 }
}

export function markCommentsSeen(id: number) {
  try { if (id > lastSeenComment()) localStorage.setItem(KEY, String(id)) } catch { /* private mode */ }
}
