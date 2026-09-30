import React from 'react'
import ReactDOM from 'react-dom/client'
import './theme.css'
import { App } from './App'
import { applyTheme, loadTheme } from './Shell'

// Before the first paint, so the saved theme never flashes the other one.
applyTheme(loadTheme())

/**
 * Catches any render/runtime error in the tree and shows it on screen,
 * so a crash surfaces as a readable message instead of a blank white window.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Renderer crash:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'ui-monospace, monospace', padding: 28, color: '#1C1B19', background: '#FBFAF7', minHeight: '100vh' }}>
          <h2 style={{ color: '#B23A2E', margin: '0 0 12px' }}>Something crashed while loading</h2>
          <p style={{ margin: '0 0 14px', fontFamily: 'ui-sans-serif, system-ui' }}>The app caught an error instead of showing a blank screen. Details:</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#1A1915', color: '#ECE7DB', padding: '14px 16px', borderRadius: 9, fontSize: 12.5 }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
          <button onClick={() => location.reload()} style={{ marginTop: 14, background: '#E85D1A', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
