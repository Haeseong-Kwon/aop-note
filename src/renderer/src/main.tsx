import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { replayEditKeysAfterComposition } from './lib/imeEditKeys'
import './index.css'

replayEditKeysAfterComposition()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
