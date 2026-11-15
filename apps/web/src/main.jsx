import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@bgio/ui/styles/tokens.css';
import '@bgio/ui/styles/base.css';
import '@bgio/ui/lib/prefs.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
