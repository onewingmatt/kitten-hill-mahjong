import React from 'react';

interface State {
  error: Error | null;
}

const STORAGE_PREFIXES = ['khm.'];

/**
 * A crash in one screen must not leave a white page. Retail builds always have somewhere to land,
 * and this one also offers a way back out if a stored profile is what broke the render.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // keep the stack for QA; the shipped surface stays calm
    console.error('Kitten Hill crashed', error, info.componentStack);
    // the message alone does not say where: the component stack is what makes
    // the next crash report actionable
    void import('./telemetry').then((m) =>
      m.track('crash', {
        message: String(error.message).slice(0, 160),
        stack: String(info.componentStack ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
      }),
    );
  }

  private reload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private reset = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (STORAGE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
      }
    } catch {
      /* storage may be unavailable; reload anyway */
    }
    this.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen crash" role="alert">
        <h1 className="crash__title">The table tipped over</h1>
        <p className="crash__body">
          Something went wrong on this screen. Your cats and their wins are still on this device.
        </p>
        <pre className="crash__detail">{this.state.error.message}</pre>
        <div className="crash__actions">
          <button className="btn btn--primary" onClick={this.reload}>
            Reload
          </button>
          <button className="btn btn--ghost" onClick={this.reset}>
            Start fresh
          </button>
        </div>
        <p className="crash__hint">Start fresh clears the cat, the record and any saved table on this device.</p>
      </div>
    );
  }
}
