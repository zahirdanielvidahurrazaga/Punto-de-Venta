import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { instalarReporteGlobal } from './lib/errores'

instalarReporteGlobal()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Última red: lo que truene fuera de una pantalla (menú, login). */}
    <ErrorBoundary pantalla="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
