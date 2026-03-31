import { Component, Fragment, type ReactNode } from "react";

interface Props {
  fallback?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
  retryKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: "", retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error: error.message };
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: "",
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <span>{this.props.fallback ?? "Ошибка компонента"}</span>
          <button className="btn btn-sm" onClick={this.handleRetry}>
            Повторить
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
