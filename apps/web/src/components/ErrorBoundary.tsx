import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

/**
 * Keeps a render error from blanking the whole portal.
 *
 * Before this existed, any exception while drawing a screen (a browser API the page did not have,
 * malformed data) unmounted the entire React tree — after a successful sign-in that looked exactly
 * like "sign in does nothing". Now the shell survives, the failure is explained, and the user can
 * retry the screen or sign out.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the details in the console for support; never render a stack trace to the user.
    console.error('[portal] screen failed to render', error, info.componentStack);
  }

  private reset = () => { this.setState({ error: null }); this.props.onReset?.(); };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="panel" role="alert" style={{ maxWidth: 620, margin: '48px auto', padding: 28 }}>
        <p className="eyebrow">SOMETHING WENT WRONG</p>
        <h2>This screen could not be displayed</h2>
        <p style={{ color: '#5a6b85', lineHeight: 1.6 }}>
          The portal hit an unexpected error while drawing this page. Your session is still active —
          try again, or sign out and back in.
        </p>
        <p style={{ color: '#8894a6', fontSize: 12, wordBreak: 'break-word' }}>{error.message}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="button button-primary" onClick={this.reset}>Try again</button>
          <button className="button button-soft" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>Back to sign in</button>
        </div>
      </div>
    );
  }
}
