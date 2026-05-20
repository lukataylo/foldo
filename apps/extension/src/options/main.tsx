import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage } from './OptionsPage.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <OptionsPage />
  </StrictMode>,
);
