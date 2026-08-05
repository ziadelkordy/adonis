import { Component, type ErrorInfo, type ReactNode } from 'react'

/*
 * A render error anywhere below this used to blank the entire page — nothing but
 * white, with the reason only in the console. Now it shows something honest and
 * offers a way out.
 *
 * Class component because React exposes no hook equivalent of
 * componentDidCatch.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only record of what actually broke — worth keeping even in production.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-cream p-6">
        <div className="w-full max-w-lg rounded-shell bg-shell p-6 ring-1 ring-ink-200 ring-inset shadow-mid sm:p-8">
          <span className="grid size-12 place-items-center rounded-full bg-bloom-100 text-2xl" aria-hidden>
            🌥️
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink-900">
            Something broke on this screen
          </h1>
          <p className="mt-2 text-sm text-ink-700">
            Not your fault. The error is logged in the browser console if you're curious.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-petal bg-sand p-3 text-xs text-ink-800">
            {error.message}
          </pre>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex h-10 items-center rounded-full bg-sun-400 px-4 text-sm font-medium text-ink-900 shadow-low transition hover:bg-sun-300"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-full bg-shell px-4 text-sm font-medium text-ink-900 ring-1 ring-ink-200 ring-inset transition hover:bg-sun-50"
            >
              Back to Today
            </a>
          </div>
        </div>
      </div>
    )
  }
}
