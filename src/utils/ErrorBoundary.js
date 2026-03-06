// ErrorBoundary.jsx
import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      // clone your <ErrorScreen /> and pass error & info as props
      return React.cloneElement(
        this.props.fallback,
        { error: this.state.error, errorInfo: this.state.info }
      );
    }
    return this.props.children;
  }
}
