import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initInspectListener } from './inspect-listener';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// /* A+W1 features */ — wire the DOM Editor iframe-side handler at app boot
// so the canvas's `foldo:inspect:*` postMessages are answered. The listener
// is harmless when standalone (parent === window) since the origin check
// drops anything not coming from the canvas.
initInspectListener();
