import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/effect errors anywhere in the tree so a single failure can
 * never blank the entire window. Shows a minimal, on-theme fallback with the
 * error text (useful for diagnosing issues in the packaged app).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught UI error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            The interface hit an unexpected error. Restart the app; if it keeps happening, please
            report it with the details below.
          </p>
          <pre className="mt-4 max-h-40 select-text overflow-auto rounded-xl border border-line bg-black/40 p-3 text-left font-mono text-xs text-danger">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-xl border border-line-strong bg-elevated px-4 py-2 text-sm text-fg hover:border-white/20"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
