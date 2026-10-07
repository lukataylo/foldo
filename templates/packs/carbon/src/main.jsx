// IBM Carbon Design System, precompiled CSS (no Sass build needed).
import '@carbon/styles/css/styles.min.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
