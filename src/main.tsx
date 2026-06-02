import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;
(globalThis as any).Buffer = Buffer;

// Apply saved theme synchronously before first render to prevent flash
try {
  const saved = localStorage.getItem("ocs-theme");
  document.documentElement.setAttribute("data-theme", saved || "light");
} catch { /* ignore */ }

import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n/config";
import App from "./App";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#eaeaea', background: '#1a1a2e', height: '100vh' }}>
          <h1 style={{ color: '#e94560', marginBottom: 16 }}>Er is een fout opgetreden</h1>
          <pre style={{ fontSize: 12, color: '#a0a0a0', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
          </pre>
          <button
            style={{
              marginTop: 20, padding: '8px 16px', background: '#3b82f6',
              color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
            onClick={() => window.location.reload()}
          >
            Herlaad applicatie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Production: disable context menu and browser dev shortcuts
if (import.meta.env.PROD) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.key === "F12") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "I") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "J") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "C") { e.preventDefault(); return; }
    if (e.ctrlKey && e.key === "u") { e.preventDefault(); return; }
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
