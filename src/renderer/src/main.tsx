import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { replayEditKeysAfterComposition } from './lib/imeEditKeys'
import { IS_ANDROID } from './lib/utils'
import './index.css'

replayEditKeysAfterComposition()

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

// The Android build gets the phone shell (loaded on demand so its CSS never reaches the desktop).
if (IS_ANDROID) {
  void import('./mobile/MobileApp').then(({ MobileApp }) =>
    root.render(
      <React.StrictMode>
        <MobileApp />
      </React.StrictMode>
    )
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
