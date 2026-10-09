import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Contains a crash to the current view instead of blanking the whole app. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Vocab] View crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <AlertTriangle size={48} />
        <h3>This view hit an error</h3>
        <p>{this.state.error.message}</p>
        <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
