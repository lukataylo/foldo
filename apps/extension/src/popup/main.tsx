import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup.tsx';

const host = document.getElementById('root');
if (!host) {
  throw new Error('Foldo popup: #root not found');
}
createRoot(host).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
