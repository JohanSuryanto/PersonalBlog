import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, type FeedItem } from '../api'

export type FeedFilters = { q?: string; from?: string; to?: string }

type Snapshot = { items: FeedItem[]; cursor: string | null; done: boolean; scrollY: number }

// Loaded feeds per filter combination, kept for the session so "back" can restore the list and scroll position.
const snapshots = new Map<string, Snapshot>()

/** For tests: forget all remembered feeds. */
export const resetFeedCache = () => snapshots.clear()

/** `restore`: reuse the previously loaded posts and scroll position for these filters, if any. */
export function useFeed(filters: FeedFilters, restore = false) {
  const { q, from, to } = filters
  const key = JSON.stringify([q ?? '', from ?? '', to ?? ''])
  const [initial] = useState(() => ({ key, snap: restore ? snapshots.get(key) : undefined }))
  const snap = initial.snap

  const [items, setItems] = useState<FeedItem[]>(snap?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(snap?.cursor ?? null)
  const [done, setDone] = useState(snap?.done ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  const generation = useRef(0)
  const loadedKey = useRef(snap ? key : null)

  const fetchPage = useCallback(
    async (after: string | null, gen: number) => {
      busy.current = true
      setLoading(true)
      setError(false)
      try {
        const page = await api.feed({ cursor: after, q, from, to })
        if (gen !== generation.current) return // filters changed while loading
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...page.items.filter((p) => !seen.has(p.id))]
        })
        setCursor(page.nextCursor)
        setDone(page.nextCursor === null)
      } catch {
        if (gen === generation.current) setError(true)
      } finally {
        if (gen === generation.current) {
          busy.current = false
          setLoading(false)
        }
      }
    },
    [q, from, to],
  )

  // Reset and load the first batch whenever the filters change (skipped when restored).
  useEffect(() => {
    if (loadedKey.current === key) return
    loadedKey.current = key
    const gen = ++generation.current
    setItems([])
    setCursor(null)
    setDone(false)
    fetchPage(null, gen)
  }, [key, fetchPage])

  // Remember what is loaded for this filter combination.
  useEffect(() => {
    const scrollY = snapshots.get(key)?.scrollY ?? 0
    snapshots.set(key, { items, cursor, done, scrollY })
  }, [key, items, cursor, done])

  // Restore the scroll position after the restored items are in the DOM; save it when leaving.
  useLayoutEffect(() => {
    if (snap && key === initial.key) window.scrollTo(0, snap.scrollY)
    return () => {
      const s = snapshots.get(key)
      if (s) s.scrollY = window.scrollY
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount / filter set
  }, [key])

  const loadMore = useCallback(() => {
    if (busy.current || done || error) return
    fetchPage(cursor, generation.current)
  }, [cursor, done, error, fetchPage])

  /** Patch one loaded post in place (e.g. its comment count after commenting in the popup). */
  const updateItem = useCallback((slug: string, patch: Partial<FeedItem>) =>
    setItems((list) => list.map((p) => (p.slug === slug ? { ...p, ...patch } : p))), [])

  const retry = useCallback(() => {
    if (!busy.current) fetchPage(cursor, generation.current)
  }, [cursor, fetchPage])

  // Infinite scroll: load more when the sentinel comes near the viewport.
  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect()
      if (!node) return
      observer.current = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
        rootMargin: '400px',
      })
      observer.current.observe(node)
    },
    [loadMore],
  )

  return { items, loading, error, done, loadMore, retry, sentinelRef, updateItem }
}
