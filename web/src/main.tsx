import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Providers } from './providers.tsx'

// Openfort allows http only for the host "localhost", not 127.0.0.1.
if (import.meta.env.DEV && window.location.hostname === '127.0.0.1') {
  const { protocol, port, pathname, search, hash } = window.location
  window.location.replace(`${protocol}//localhost${port ? `:${port}` : ''}${pathname}${search}${hash}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
)
