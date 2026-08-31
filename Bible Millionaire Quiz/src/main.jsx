import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import GlobalErrorBoundary from './shared/components/GlobalErrorBoundary'

console.log('🚀 Running v5.1.0')
console.log('📅 Build Time: ' + new Date().toLocaleString())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>
)
