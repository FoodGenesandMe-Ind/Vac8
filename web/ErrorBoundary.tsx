import React, { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui", color: "#f88", background: "#1e1e1e", minHeight: "100vh" }}>
          <h1 style={{ color: "#fff" }}>Vac8 failed to load</h1>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{this.state.error.message}</pre>
          <p style={{ color: "#aaa", marginTop: 16 }}>Check the terminal: run `pnpm dev` from the Vac8 folder.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
