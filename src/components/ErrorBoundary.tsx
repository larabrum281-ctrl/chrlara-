import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, errorMessage: ''};
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado no aplicativo.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('FLASH ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed.error === 'string') {
          friendly = `${parsed.error} (${parsed.operationType} em ${parsed.path || 'recurso'})`;
        }
      } catch {
        // Keep original message
      }

      return (
        <div className="min-h-screen bg-[#0B0B0D] text-[#F6F5F0] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#141418] border border-[#27272E] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#F6F5F0]">
              Algo deu errado no FLASH
            </h2>
            <p className="text-sm text-[#9A98A1] leading-relaxed break-words">{friendly}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] rounded-xl bg-[#FF5A1F] text-white font-medium text-sm hover:bg-[#e54d15] transition-colors"
            >
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
