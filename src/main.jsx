import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'katex/dist/katex.min.css'

// Initialize i18n
import './i18n/config.js'

// Clean up stale caching service workers, but preserve notification SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      const scriptURL = registration.active?.scriptURL || '';
      // Only unregister caching SWs (sw.js), preserve notification-sw.js
      if (scriptURL.includes('sw.js') && !scriptURL.includes('notification-sw.js')) {
        registration.unregister();
      }
    });
    return registrations;
  }).catch(err => {
    console.warn('Failed to manage service workers:', err);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
