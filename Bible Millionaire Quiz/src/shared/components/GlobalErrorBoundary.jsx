import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
                    <div className="bg-slate-800 border border-red-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center">
                        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={40} className="text-red-400" />
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-2">哎呀！發生了一些問題</h1>
                        <p className="text-slate-400 mb-6">
                            應用程式遇到未預期的錯誤。通常重新整理頁面可以解決此問題。
                        </p>

                        {/* Developer Debug Info (Collapsed by default logic handled by CSS or just rendered simply) */}
                        {import.meta.env.DEV && this.state.error && (
                            <div className="text-left bg-black/50 p-4 rounded-xl mb-6 overflow-auto max-h-40 text-xs font-mono text-red-300 border border-red-500/20">
                                {this.state.error.toString()}
                            </div>
                        )}

                        <button
                            onClick={this.handleReload}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-xl flex items-center justify-center gap-2 mx-auto transition-all transform hover:scale-105"
                        >
                            <RefreshCw size={20} />
                            重新整理頁面
                        </button>

                        <div className="mt-8 pt-6 border-t border-white/10 text-slate-500 text-sm">
                            如果問題持續發生，請聯繫管理員。
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
