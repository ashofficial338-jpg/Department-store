import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

// Catches a page that fails to load or crashes while rendering, so the sidebar and header keep working
// instead of the whole app going blank. The layout remounts this per route, which clears the error
// as soon as another page is opened.
export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Page failed to render:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3" role="alert">
        <span className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center"><AlertTriangle size={22} /></span>
        <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>This page could not be loaded</h1>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
          Check your connection and try again. The rest of the app is still available from the menu.
        </p>
        <button onClick={() => window.location.reload()} className="text-sm font-medium text-gold-600 hover:text-gold-500">Reload page</button>
      </div>
    );
  }
}

export default RouteErrorBoundary;
