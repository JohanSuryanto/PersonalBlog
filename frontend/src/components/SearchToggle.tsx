import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

type SearchPanel = {
  open: boolean
  setOpen: (open: boolean) => void
  /** Closes the panel and returns focus to the header button. */
  close: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}

const SearchPanelContext = createContext<SearchPanel | null>(null)

export function SearchPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()

  // The panel belongs to the feed: close it whenever the reader leaves the feed.
  useEffect(() => {
    if (pathname !== '/') setOpen(false)
  }, [pathname])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }
  return <SearchPanelContext.Provider value={{ open, setOpen, close, buttonRef }}>{children}</SearchPanelContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearchPanel() {
  const ctx = useContext(SearchPanelContext)
  if (!ctx) throw new Error('useSearchPanel must be used inside SearchPanelProvider')
  return ctx
}

/** Header search icon: toggles the feed's search panel; from other pages it opens the feed with the panel. */
export function SearchToggle() {
  const { open, setOpen, close, buttonRef } = useSearchPanel()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const onFeed = pathname === '/'
  const filtered = onFeed && /[?&](q|from|to)=/.test(search)

  function onClick() {
    if (!onFeed) {
      navigate('/')
      setOpen(true)
    } else if (open) close()
    else setOpen(true)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={open && onFeed ? 'icon header-search active' : 'icon header-search'}
      aria-expanded={onFeed ? open : undefined}
      aria-controls={onFeed ? 'search-panel' : undefined}
      aria-label={filtered ? 'Search & filter (filters active)' : 'Search & filter'}
      title="Search & filter"
      onClick={onClick}
    >
      <Icon name="search" />
      {filtered && <span className="dot" aria-hidden="true" />}
    </button>
  )
}
