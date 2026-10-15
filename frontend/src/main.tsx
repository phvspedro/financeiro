import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { iniciarAparencia } from './lib/aparencia'
import './index.css'

// Aplica tema, tamanho da letra e densidade antes da primeira renderização (sem piscar)
iniciarAparencia()

// Service worker: necessário para as notificações de vencimento aparecerem no celular (PWA)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
