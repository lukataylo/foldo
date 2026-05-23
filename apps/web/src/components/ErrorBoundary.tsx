// Root-level React error boundary. Without this, a single uncaught render
// error blanks the entire canvas (and the marketing site, and Home, etc.).
// Mounted in main.tsx around every top-level route; can also wrap individual
// frames so one bad frame doesn't take down its neighbours.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Label shown in the fallback so we know *which* boundary fired. */
  label?: string;
  /** Render this instead of the default fallback. */
  fallback?: (err: Error, retry: () => void) => ReactNode;
  /** Optional callback (e.g. to send to Sentry once we wire it). */
  onError?: (err: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[foldo] ErrorBoundary caught', this.props.label ?? '', err, info);
    this.props.onError?.(err, info);
  }

  private retry = (): void => {
    this.setState({ err: null });
  };

  render(): ReactNode {
    const { err } = this.state;
    if (!err) return this.props.children;
    if (this.props.fallback) return this.props.fallback(err, this.retry);
    return <DefaultFallback err={err} label={this.props.label} retry={this.retry} />;
  }
}

function DefaultFallback({
  err,
  label,
  retry,
}: {
  err: Error;
  label?: string;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0e0e10',
        color: '#e8e6e3',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#857a68',
            marginBottom: 8,
          }}
        >
          Something broke
        </div>
        <h1 style={{ fontSize: 22, margin: '0 0 12px', fontWeight: 600 }}>
          Foldo hit an unexpected error{label ? ` in ${label}` : ''}.
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#b8b0a4', margin: '0 0 18px' }}>
          The page recovered the crash so the rest of the app stays alive. Try
          again, or reload if it keeps happening.
        </p>
        <pre
          style={{
            background: '#1a1a1d',
            border: '1px solid #2a2a30',
            borderRadius: 6,
            padding: 12,
            fontSize: 11.5,
            lineHeight: 1.5,
            color: '#cfc9bf',
            overflow: 'auto',
            maxHeight: 200,
            marginBottom: 18,
          }}
        >
{err.message}
{err.stack ? '\n\n' + err.stack.split('\n').slice(1, 6).join('\n') : ''}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={retry}
            style={{
              background: '#FDB306',
              color: '#1a1a1d',
              border: 0,
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'transparent',
              color: '#e8e6e3',
              border: '1px solid #2a2a30',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
