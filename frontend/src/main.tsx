import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', fontFamily: 'monospace', color: '#f88', background: '#1a0000' }}>
          <h2>⚠️ App failed to load</h2>
          <pre style={{ marginTop: '12px', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
            {this.state.error}
          </pre>
          <p style={{ marginTop: '12px', color: '#888', fontSize: '12px' }}>
            Check the browser console (F12) for the full stack trace.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
