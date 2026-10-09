import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Me } from './api'

type Auth = {
  user: Me | null
  loading: boolean
  setUser: (user: Me | null) => void
}

const AuthContext = createContext<Auth>({ user: null, loading: false, setUser: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me().then(setUser, () => setUser(null)).finally(() => setLoading(false))
  }, [])

  return <AuthContext.Provider value={{ user, loading, setUser }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
