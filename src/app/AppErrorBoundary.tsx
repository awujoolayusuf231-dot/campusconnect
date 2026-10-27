import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/lib/observability";

interface State { failed: boolean }
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(error, { source: "react.boundary", component: (info.componentStack ?? "").split("\n")[1]?.trim() ?? "" }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted">The page hit an unexpected problem. Your data is safe. Try reloading; if it keeps happening, contact support.</p>
        <div className="flex gap-3"><button className="btn-primary" onClick={() => window.location.reload()}>Reload</button><a className="btn" href="/">Go to home</a></div>
      </main>
    );
  }
}
