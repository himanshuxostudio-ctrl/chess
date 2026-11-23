import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGame } from './game/store'

// Test hook: open the site with ?debug to drive the game store from the console.
if (location.search.includes('debug')) (window as unknown as { __awc: typeof useGame }).__awc = useGame

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
