import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth'
import { SearchPanelProvider } from './components/SearchToggle'
import './index.css'

// A data router (needed for useBlocker) wrapping the app's existing <Routes>.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <SearchPanelProvider>
          <App />
        </SearchPanelProvider>
      </AuthProvider>
    ),
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
