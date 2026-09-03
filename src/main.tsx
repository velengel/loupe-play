import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { runtimeFoundationGateway } from './platform/tauri-foundation'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('LoupePlay root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <App gateway={runtimeFoundationGateway} />
  </StrictMode>,
)
