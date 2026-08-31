import React, { useState } from 'react';
import { Lock, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function AdminLogin({ onLoginSuccess, onCancel }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
            const response = await fetch(`${API_BASE_URL}/api/auth/admin-login-simple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await response.json();

            if (data.success) {
                // Ensure auth consistency across the app
                sessionStorage.setItem('adminToken', data.token);
                sessionStorage.setItem('authToken', data.token); 
                onLoginSuccess();
            } else {
                setError(data.error || '密碼錯誤');
                setPassword('');
            }
        } catch (err) {
            setError('登入失敗，請檢查網路連線');
        }
    };

    return (
        <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Dynamic Background Elements */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-600/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
            </div>

            <div className="w-full max-w-lg bg-white/5 backdrop-blur-3xl p-12 rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-15px_rgba(0,0,0,0.5)] relative z-10 animate-in zoom-in-95 fade-in duration-700">
                <div className="flex flex-col items-center mb-12">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-amber-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
                        <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-amber-900/40 mb-8 relative z-10 group-hover:scale-110 transition-transform duration-500">
                            <ShieldCheck className="text-white w-10 h-10" />
                        </div>
                    </div>
                    
                    <div className="text-center">
                        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
                            管理員 <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">中心</span>
                        </h1>
                        <div className="flex items-center justify-center gap-3">
                            <span className="h-[1px] w-8 bg-white/10" />
                            <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.3em]">Administrator Control v3.0</p>
                            <span className="h-[1px] w-8 bg-white/10" />
                        </div>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-10">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <label className="text-stone-400 font-black text-[10px] uppercase tracking-[0.2em]">帳號驗證密碼</label>
                            <span className="text-[10px] text-stone-600 font-mono">SECURE ADMIN ACCESS</span>
                        </div>
                        <div className="relative group">
                            <div className="absolute inset-0 bg-amber-500/5 rounded-2xl blur-lg group-focus-within:bg-amber-500/10 transition-all" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white placeholder:text-stone-700 focus:border-amber-500/50 focus:bg-white/10 outline-none transition-all font-mono text-center tracking-[0.5em] text-xl relative z-10"
                                placeholder="••••••••"
                                autoFocus
                            />
                        </div>
                        {error && (
                            <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-bold py-3 px-4 bg-red-500/10 border border-red-500/20 rounded-xl animate-in shake-1 duration-300">
                                <span className="sr-only">Error:</span>
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <button
                            type="submit"
                            className="w-full px-8 py-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-2xl font-black transition-all shadow-[0_20px_40px_-10px_rgba(245,158,11,0.3)] active:scale-95 flex items-center justify-center gap-3 group overflow-hidden relative"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                            <span className="relative z-10 uppercase tracking-widest text-sm">確認登入</span>
                        </button>
                        
                        <button
                            type="button"
                            onClick={onCancel}
                            className="w-full px-8 py-5 bg-transparent hover:bg-white/5 text-stone-500 hover:text-white rounded-2xl font-bold transition-all border border-white/5 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                        >
                            <ArrowLeft size={16} />
                            取消登入
                        </button>
                    </div>
                </form>

                <div className="mt-16 flex flex-col items-center gap-4 opacity-30 group">
                    <div className="flex gap-1.5">
                        <div className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1 h-1 bg-white rounded-full animate-bounce" />
                    </div>
                    <p className="text-[9px] text-white font-black uppercase tracking-[0.4em]">Logos System Engine</p>
                </div>
            </div>
        </div>
    );
}
