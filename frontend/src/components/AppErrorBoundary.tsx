import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('AppErrorBoundary', error, info.componentStack)
    }
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  public render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-slate-100">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-center text-sm text-slate-400">
            The UI hit an unexpected error. You can try reloading the page or return home.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
              onClick={() => {
                window.location.reload()
              }}
            >
              Reload page
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              onClick={this.handleRetry}
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Home
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
