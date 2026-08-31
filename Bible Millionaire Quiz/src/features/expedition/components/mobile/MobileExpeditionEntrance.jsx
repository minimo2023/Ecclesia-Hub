import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, User, Shield, LogIn, Info } from 'lucide-react';
import Avatar from '../../../../components/common/Avatar';
import { useAuth } from '../../../../contexts/AuthContext';
import AuthModal from '../../../auth/AuthModal';

/**
 * [Mobile] ExpeditionEntrance
 * 手機專用遠征入口
 * - 直板 (portrait): 單欄上下排列
 * - 橫板 (landscape): 左欄=身份 / 右欄=操作，緊湊不捲動
 */
export default function MobileExpeditionEntrance({
    onJoinTeam, onOpenLogin, onCreateTeam, onResumeTeam,
    isLoggedIn, ownedTeam, onBack
}) {
    const { user, guestAvatar } = useAuth();
    const [joinCode, setJoinCode] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const guestName = localStorage.getItem('guest_name') || '訪客';

    // 身份卡（直/橫共用）
    const IdentityCard = (
        <div className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-3">
            <div className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-2xl border-2 border-amber-500/20 overflow-hidden shrink-0 rotate-1">
                <Avatar avatarId={user?.settings?.avatar || guestAvatar} size="full" />
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLoggedIn ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        {isLoggedIn ? '領主身份已識別' : '臨時援軍身份'}
                    </span>
                </div>
                <div className="text-lg font-black text-white truncate leading-tight">
                    {isLoggedIn ? user.displayName : guestName} <span className="text-amber-500">遠征中</span>
                </div>
            </div>
        </div>
    );

    // 入隊碼卡
    const JoinCard = (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                    <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                    <div className="text-sm font-bold text-white leading-tight">支援他人屬地</div>
                    <div className="text-[9px] text-slate-500">執行戰友的遠征邀請</div>
                </div>
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="六位傳送碼"
                    maxLength={6}
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-center text-base font-mono font-black text-amber-500 tracking-widest outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <button
                    onClick={() => joinCode.length === 6 && onJoinTeam(joinCode)}
                    disabled={joinCode.length !== 6}
                    className={`px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center ${joinCode.length === 6 ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );

    // 登入/建立卡
    const ActionCard = (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-3">
            {!isLoggedIn ? (
                <>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                            <User className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white leading-tight">開通永久領地</div>
                            <div className="text-[9px] text-slate-500">註冊以保存資產與進度</div>
                        </div>
                    </div>
                    <button onClick={() => setShowAuthModal(true)}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
                        <LogIn className="w-4 h-4" /> 立刻登入 / 註冊
                    </button>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                            <Shield className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white leading-tight">管理我的領地</div>
                            <div className="text-[9px] text-slate-500">恢復進度或建立新頻道</div>
                        </div>
                    </div>
                    <button
                        onClick={() => (ownedTeam && !ownedTeam.isNew) ? onResumeTeam(ownedTeam.id) : onCreateTeam()}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
                        {(ownedTeam && !ownedTeam.isNew) ? '進入屬地指揮部' : '開拓新遠征領地'}
                    </button>
                </>
            )}
        </div>
    );

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-3 gap-3 safe-area-pt animate-in fade-in zoom-in-95 duration-500">
            {/* Back */}
            {onBack && (
                <button onClick={onBack}
                    className="self-start flex items-center gap-1.5 text-slate-300 text-sm bg-black/20 px-3 py-1.5 rounded-full backdrop-blur-md shrink-0">
                    <ArrowLeft className="w-4 h-4" /> 返回
                </button>
            )}

            {/* Portrait: 單欄 */}
            <div className="flex flex-col gap-3 flex-1 portrait:flex landscape:hidden">
                {IdentityCard}
                {JoinCard}
                {ActionCard}
                <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-600 font-black uppercase tracking-widest">
                    <Info className="w-3 h-3" /> 需要身份授權或有效傳送代碼
                </div>
            </div>

            {/* Landscape: 左右兩欄 */}
            <div className="portrait:hidden landscape:flex gap-3 flex-1 min-h-0">
                {/* Left: identity */}
                <div className="w-2/5 flex flex-col justify-center gap-3">
                    {IdentityCard}
                    <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-600 font-black uppercase tracking-widest text-center">
                        <Info className="w-3 h-3 shrink-0" /> 需要身份授權或有效傳送代碼
                    </div>
                </div>
                {/* Right: actions */}
                <div className="flex-1 flex flex-col justify-center gap-3">
                    {JoinCard}
                    {ActionCard}
                </div>
            </div>
        </div>
    );
}
