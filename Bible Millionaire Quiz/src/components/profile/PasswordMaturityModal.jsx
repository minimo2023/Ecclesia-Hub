import React from 'react';
import { ShieldAlert, Clock, ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * [V9.9 Pillar] PasswordMaturityModal
 * Tiered enforcement: 90 days (Tip), 150 days (Warning), 180 days (Force)
 */
export default function PasswordMaturityModal({ onForceChange }) {
    const { user, dismissPasswordWarning } = useAuth();
    
    if (!user || !user.passwordMaturity || user.passwordMaturity.stage === 'safe') return null;

    const { stage, daysSinceLastChange } = user.passwordMaturity;

    const renderContent = () => {
        switch (stage) {
            case 'warn1': // 90 days (First reminder)
                return {
                    title: '帳號安全性提醒',
                    desc: `您的密碼已使用 ${daysSinceLastChange} 天。為了您的帳號安全，建議定期更新密碼。`,
                    icon: Clock,
                    color: 'text-amber-500',
                    bg: 'bg-amber-50',
                    actionLabel: '延後 90 天提醒',
                    canDismiss: true
                };
            case 'warn2': // 150 days (Second reminder)
                return {
                    title: '關鍵安全警告',
                    desc: `密碼連續使用已超過 150 天。為了帳號安全，建議您現在更新密碼。`,
                    icon: ShieldAlert,
                    color: 'text-orange-500',
                    bg: 'bg-orange-50',
                    actionLabel: '延後 30 天提醒',
                    canDismiss: true
                };
            case 'force': // 180 days (Forced change)
                return {
                    title: '必須變更密碼',
                    desc: `您的密碼已使用 ${daysSinceLastChange} 天。為了繼續存取系統，請立即更新您的密碼。`,
                    icon: Lock,
                    color: 'text-red-600',
                    bg: 'bg-red-50',
                    actionLabel: '立即前往更換',
                    canDismiss: false
                };
            default:
                return null;
        }
    };

    const config = renderContent();
    if (!config) return null;

    const Icon = config.icon;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white rounded-[40px] shadow-2xl overflow-hidden border border-stone-200 animate-in zoom-in-95 duration-300">
                <div className={`${config.bg} p-8 flex flex-col items-center text-center`}>
                    <div className={`p-4 rounded-3xl bg-white shadow-sm mb-4 ${config.color}`}>
                        <Icon size={32} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-lg font-black text-stone-800 tracking-tight">{config.title}</h2>
                    <p className="mt-2 text-xs font-bold text-stone-500 leading-relaxed px-2">
                        {config.desc}
                    </p>
                </div>

                <div className="p-6 space-y-3">
                    <button 
                        onClick={onForceChange}
                        className="w-full bg-stone-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-stone-800 transition-all active:scale-95"
                    >
                        前往更換密碼
                        <ChevronRight size={14} />
                    </button>

                    {config.canDismiss && (
                        <button 
                            onClick={dismissPasswordWarning}
                            className="w-full py-4 text-stone-400 font-black text-[10px] uppercase tracking-widest hover:text-stone-600 transition-colors"
                        >
                            {config.actionLabel}
                        </button>
                    )}
                </div>

                <div className="bg-stone-100 border-t border-stone-100 p-4 flex items-center justify-center gap-2">
                    <ShieldCheck size={12} className="text-stone-300" />
                    <span className="text-[10px] font-black text-stone-300 tracking-[0.2em] uppercase">
                        Account Security 3.0
                    </span>
                </div>
            </div>
        </div>
    );
}
