// IBM Carbon Design System, precompiled CSS (no Sass build needed).
import '@carbon/styles/css/styles.min.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// A crash while rendering would otherwise leave a blank white page: show what happened instead.
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ font: '14px system-ui', padding: 24, maxWidth: 560, margin: '10vh auto' }}>
        <h2 style={{ margin: 0 }}>This preview hit an error</h2>
        <p style={{ color: '#555' }}>Ask Foldo to fix it, or press Reload. Details:</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f4f4f4', padding: 12, borderRadius: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>
    <App />
    </Boundary>
  </React.StrictMode>,
);
