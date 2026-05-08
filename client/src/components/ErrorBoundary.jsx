import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[id3a error]', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0908', color: '#f4ede0',
        padding: 32, fontFamily: 'Inter, sans-serif', overflow: 'auto',
      }}>
        <p style={{ color: '#857f74', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          runtime error
        </p>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 40, fontWeight: 800, margin: '8px 0 24px', letterSpacing: '-0.025em' }}>
          {this.state.error.message || 'Something broke.'}
        </h1>
        {this.state.error.stack && (
          <pre style={{
            background: '#13110f', padding: 16, borderRadius: 6, overflow: 'auto',
            fontSize: 12, lineHeight: 1.5, color: '#bdb6a8',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          }}>
            {this.state.error.stack}
          </pre>
        )}
        <button
          onClick={() => location.reload()}
          style={{ marginTop: 24, background: '#9eff4a', color: '#0a0908', padding: '10px 18px', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    );
  }
}
