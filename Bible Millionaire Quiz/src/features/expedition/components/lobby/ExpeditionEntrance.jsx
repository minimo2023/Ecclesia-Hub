import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, User, Shield, Info, LogIn } from 'lucide-react';
import Avatar from '../../../../components/common/Avatar';
import { useAuth } from '../../../../contexts/AuthContext';
import AuthModal from '../../../auth/AuthModal';

/**
 * [SOVEREIGN] ExpeditionEntrance
 * 遠征攔截門檻 - 提供「入隊支援」與「註冊開通」兩大核心路徑
 */
export default function ExpeditionEntrance({
    onJoinTeam,
    onOpenLogin,
    onCreateTeam,
    onResumeTeam,
    isLoggedIn,
    ownedTeam,
    onBack
}) {
    const { user, guestAvatar } = useAuth();
    const [joinCode, setJoinCode] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const guestName = localStorage.getItem('guest_name') || '訪客';

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in zoom-in-95 duration-700 bg-slate-950/20 relative overflow-y-auto">
            {/* Back Button */}
            {onBack && (
                <button
                    onClick={onBack}
                    className="absolute top-3 left-3 md:top-4 md:left-4 flex items-center gap-2 text-slate-300 hover:text-white transition-colors bg-black/20 hover:bg-black/40 px-3 py-1.5 md:px-4 md:py-2 rounded-full backdrop-blur-md z-10 text-sm"
                >
                    <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                    <span>返回</span>
                </button>
            )}
            <div className="w-full max-w-4xl flex flex-col items-center gap-5 md:gap-10 bg-slate-900/60 backdrop-blur-2xl p-5 md:p-12 rounded-3xl md:rounded-[4rem] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden my-8 md:my-0">
                {/* Decorative border */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent animate-pulse" />

                {/* Identity District */}
                <div className="flex flex-col items-center gap-3 md:gap-6">
                    <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl md:rounded-[2.5rem] border-4 border-amber-500/20 shadow-2xl overflow-hidden rotate-2 relative hover:rotate-0 transition-transform duration-500">
                        <Avatar avatarId={user?.settings?.avatar || guestAvatar} size="full" />
                    </div>
                    <div className="text-center space-y-1 md:space-y-2">
                        <div className="flex items-center justify-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isLoggedIn ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-amber-500 shadow-[0_0_10px_#f59e0b]'}`} />
                            <span className="text-xs md:text-sm font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.3em]">
                                {isLoggedIn ? '領主身份已識別' : '臨時援軍身份'}
                            </span>
                        </div>
                        <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter">
                            {isLoggedIn ? user.displayName : guestName} <span className="text-amber-500">遠征中</span>
                        </h2>
                    </div>
                </div>

                {/* Action Districts */}
                <div className="w-full grid md:grid-cols-2 gap-4 md:gap-8">

                    {/* District A: Support Path (Code Join) */}
                    <div className="bg-white/[0.03] border border-white/5 p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] space-y-4 md:space-y-6 hover:bg-white/[0.05] transition-all group">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500 shrink-0">
                                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                            <div>
                                <h3 className="text-base md:text-xl font-bold text-white">支援他人屬地</h3>
                                <p className="text-xs text-slate-500">執行戰友的遠征邀請</p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="六位傳送碼"
                                maxLength={6}
                                className="flex-1 bg-slate-950 border border-white/10 rounded-xl md:rounded-2xl px-3 md:px-4 py-3 md:py-4 text-center text-lg md:text-xl font-mono font-black text-amber-500 tracking-widest outline-none focus:ring-2 focus:ring-amber-500/30 transition-shadow"
                            />
                            <button
                                onClick={() => joinCode.length === 6 && onJoinTeam(joinCode)}
                                disabled={joinCode.length !== 6}
                                className={`px-4 md:px-6 rounded-xl md:rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center ${
                                    joinCode.length === 6 ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
                            </button>
                        </div>
                    </div>

                    {/* District B: Sovereignty Path (Login/Create) */}
                    <div className="bg-white/[0.03] border border-white/5 p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] space-y-4 md:space-y-6 hover:bg-white/[0.05] transition-all">
                        {!isLoggedIn ? (
                            <>
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-500 shrink-0">
                                        <User className="w-5 h-5 md:w-6 md:h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-base md:text-xl font-bold text-white">開通永久領地</h3>
                                        <p className="text-xs text-slate-500">註冊以保存資產與進度</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAuthModal(true)}
                                    className="w-full py-3 md:py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl md:rounded-2xl font-black shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 group text-sm md:text-base"
                                >
                                    <LogIn className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                                    立刻登入 / 註冊
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500 shrink-0">
                                        <Shield className="w-5 h-5 md:w-6 md:h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-base md:text-xl font-bold text-white">管理我的領地</h3>
                                        <p className="text-xs text-slate-500">恢復進度或建立新頻道</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        if (ownedTeam && !ownedTeam.isNew) {
                                            onResumeTeam(ownedTeam.id);
                                        } else {
                                            onCreateTeam();
                                        }
                                    }}
                                    className="w-full py-3 md:py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl md:rounded-2xl font-black shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 text-sm md:text-base"
                                >
                                    {(ownedTeam && !ownedTeam.isNew) ? '進入屬地指揮部' : '開拓新遠征領地'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-full bg-white/[0.02] border border-white/5 text-[10px] text-slate-500 font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-center">
                    <Info className="w-3 h-3 shrink-0" /> 遠征模式需要身份授權或有效的傳送代碼方可進入戰區
                </div>
            </div>

            <AuthModal 
                isOpen={showAuthModal} 
                onClose={() => setShowAuthModal(false)} 
                onLoginSuccess={() => setShowAuthModal(false)} 
            />
        </div>
    );
}
