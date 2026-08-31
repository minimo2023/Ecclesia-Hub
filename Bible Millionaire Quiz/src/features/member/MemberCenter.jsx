import React, { useState, useEffect } from 'react';
import { 
    BookOpen, BarChart3, ArrowLeft, Coins, CreditCard, 
    ShieldCheck, User, ChevronRight, Lock, Eye, EyeOff, 
    CheckCircle, XCircle, Camera, Edit2, Shield, Activity,
    Clock, Settings2, LogOut, ArrowRightLeft, Gift
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/common/Avatar';
import AvatarSelector from '../../components/profile/AvatarSelector';
import MemberStats from './MemberStats';
import DevotionalDiary from './DevotionalDiary';
import AssetExchange from './AssetExchange';
import AuthModal from '../auth/AuthModal';
import MyVoiceBlessings from '../scripture-recording/MyVoiceBlessings';
import AccountSignInMethods from '../auth/AccountSignInMethods';
import GoogleReauthButton from '../auth/GoogleReauthButton';

/**
 * [V10.1 Flagship] MemberCenter - Unified Account Hub
 * Merged: ProfilePage 3.0 + Classic Member Center
 * Features: Account Security Radar, Nickname Edit (Secure), Avatar Upload, Stats & Diary
 * Aesthetics: Classic Ivory Glassmorphism
 * Terminology: Normalized (Account Center, BI Gold Coin)
 */
export default function MemberCenter({ onNavigate, onBack, initialView = 'hub' }) {
    const { 
        user, isLoggedIn, logout, loading,
        updatePassword, updateProfile, 
        refreshUser, getToken
    } = useAuth();

    const [currentView, setCurrentView] = useState(initialView); // 'hub' | 'stats' | 'diary'

    // 監聽 initialView 屬性改變以即時切換視圖
    useEffect(() => {
        if (initialView) {
            setCurrentView(initialView);
        }
    }, [initialView]);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const [nameError, setNameError] = useState('');
    const [namePassword, setNamePassword] = useState('');
    const [nameReauthToken, setNameReauthToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [aiCredits, setAiCredits] = useState(0);

    // Password Form
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);

    // Fetch AI credits (BI Points)
    useEffect(() => {
        if (isLoggedIn) {
            const fetchCredits = async () => {
                try {
                    const token = getToken();
                    const res = await fetch('/api/users/ai-wallet', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        setAiCredits(data.data.totalCredits);
                    }
                } catch (error) {
                    console.error('Fetch AI credits error:', error);
                }
            };
            fetchCredits();
        }
    }, [isLoggedIn]);

    // Handle Password Update
    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        setPasswordError(''); setPasswordSuccess('');
        setIsLoading(true);

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('確認密碼不符');
            setIsLoading(false); return;
        }

        try {
            const result = await updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
            if (result.success) {
                setPasswordSuccess('密碼已成功更新');
                setTimeout(() => {
                    setIsChangingPassword(false);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }, 1500);
            } else {
                setPasswordError(result.error || '更新失敗');
            }
        } catch (error) {
            setPasswordError('網路連線失敗');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateName = async () => {
        setNameError('');
        if (!tempName.trim()) return setNameError('請輸入內容');
        if (user?.hasPassword && !namePassword) return setNameError('請輸入密碼以驗證身分');
        if (!user?.hasPassword && !nameReauthToken) return setNameError('請先使用 Google 重新驗證身分');
        
        setIsLoading(true);
        try {
            const result = await updateProfile({ 
                displayName: tempName,
                currentPassword: namePassword,
                reauthToken: nameReauthToken
            });
            if (result.success) {
                setIsEditingName(false);
                setNamePassword('');
                setNameReauthToken('');
                await refreshUser();
            } else {
                setNameError(result.error);
            }
        } catch (err) {
            setNameError('更新失敗');
        } finally {
            setIsLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center font-sans font-bold text-stone-400">載入帳號資料中...</div>;
    
    // [V10.1 Security Fix] 防止未登入閃屏
    if (!isLoggedIn) {
        return (
            <div className="h-[var(--app-height)] bg-[#FDFBF7] flex items-center justify-center p-6 text-center">
                <AuthModal 
                    isOpen={true} 
                    onClose={onBack} 
                    onLoginSuccess={() => {}} 
                />
            </div>
        );
    }

    // Radar Component (Normalized)
    const SecurityRadar = ({ label, icon: Icon, value, max, color, subText }) => {
        const percent = (max && max > 0) ? Math.min(100, Math.floor(((value || 0) / max) * 100)) : 0;
        const radius = 32;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;

        return (
            <div className="bg-stone-50/50 rounded-2xl p-4 flex items-center gap-4 border border-stone-100/50">
                <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r={radius} fill="transparent" stroke="currentColor" strokeWidth="4" className="text-stone-100" />
                        <circle cx="32" cy="32" r={radius} fill="transparent" stroke="currentColor" strokeWidth="4" 
                            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                            className={`transition-all duration-1000 ${color}`} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Icon size={18} className={color} />
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-widest text-stone-400 mb-0.5">{label}</span>
                    <span className="text-base font-black text-stone-800">{value} / {max} <span className="text-xs font-medium text-stone-400">天</span></span>
                    <span className="text-xs font-bold text-amber-600 mt-1">{subText}</span>
                </div>
            </div>
        );
    };

    const handleBackToHub = () => setCurrentView('hub');

    const now = new Date();
    const maturity = user?.passwordMaturity || { daysSinceLastChange: 0, stage: 'safe' };
    const lastNameChange = user?.lastDisplayNameChange ? new Date(user.lastDisplayNameChange) : null;
    const nameDays = lastNameChange ? Math.floor((now - lastNameChange) / (1000 * 60 * 60 * 24)) : 999;
    const canChangeName = nameDays >= 30;

    return (
        <div className="h-[100dvh] w-full bg-[#FDFBF7] text-stone-800 animate-in fade-in duration-700 font-sans flex flex-col overflow-hidden safe-area-pt safe-area-pb safe-area-pl safe-area-pr">

            {/* Mobile Top Bar */}
            <div className="lg:hidden shrink-0 bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-100">
                        <Coins size={13} className="text-amber-600" />
                        <span className="text-sm font-black text-stone-800">{user?.coins || 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100">
                        <CreditCard size={13} className="text-blue-600" />
                        <span className="text-sm font-black text-stone-800">{aiCredits}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentView('hub')} className={`p-2 rounded-xl transition-colors ${currentView === 'hub' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'}`}><User size={15} /></button>
                    <button onClick={() => setCurrentView('stats')} className={`p-2 rounded-xl transition-colors ${currentView === 'stats' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'}`}><BarChart3 size={15} /></button>
                    <button onClick={() => setCurrentView('diary')} className={`p-2 rounded-xl transition-colors ${currentView === 'diary' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'}`}><BookOpen size={15} /></button>
                    <button onClick={() => setCurrentView('exchange')} className={`p-2 rounded-xl transition-colors ${currentView === 'exchange' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'}`}><ArrowRightLeft size={15} /></button>
                    <button onClick={() => setCurrentView('blessings')} aria-label="我的祝福語音" className={`p-2 rounded-xl transition-colors ${currentView === 'blessings' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'}`}><Gift size={15} /></button>
                    <button onClick={onBack} className="p-2 rounded-xl bg-stone-100 text-stone-500"><ArrowLeft size={15} /></button>
                    <button onClick={logout} className="p-2 rounded-xl bg-red-50 text-red-500"><LogOut size={15} /></button>
                </div>
            </div>

            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Desktop Left Sidebar */}
                <aside className="hidden lg:flex w-[360px] shrink-0 bg-white border-r border-stone-200 flex-col overflow-hidden">
                    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        {/* 1. Quick Stats / Assets */}
                        <div className="space-y-4">
                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="bg-amber-100 p-2 rounded-lg"><Coins className="text-amber-600" size={16} /></div>
                                    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">智匯金幣</span>
                                </div>
                                <span className="text-2xl font-black text-stone-800">{user?.coins || 0}</span>
                            </div>
                            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="bg-blue-100 p-2 rounded-lg"><CreditCard className="text-blue-600" size={16} /></div>
                                    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">智匯點數</span>
                                </div>
                                <span className="text-2xl font-black text-stone-800">{aiCredits}</span>
                            </div>
                        </div>

                        <hr className="border-stone-100" />

                        {/* 2. Primary Feature Navigation */}
                        <div className="flex-1 space-y-2">
                            <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 px-1">常用功能</h4>
                            <ActionButton icon={ArrowRightLeft} label="資產雙向兌換" onClick={() => setCurrentView('exchange')} />
                            <ActionButton icon={BarChart3} label="學習成就" onClick={() => setCurrentView('stats')} />
                            <ActionButton icon={BookOpen} label="靈修筆記" onClick={() => setCurrentView('diary')} />
                            <ActionButton icon={Gift} label="我的祝福語音" onClick={() => setCurrentView('blessings')} />
                        </div>

                        {/* 3. Global Footer Actions */}
                        <div className="mt-auto space-y-2 pt-4">
                            <button onClick={onBack} className="w-full flex items-center justify-center gap-2 p-3 bg-stone-100 rounded-xl font-black text-xs text-stone-600 uppercase tracking-widest hover:bg-stone-200 transition-all">
                                <ArrowLeft size={14} /> 返回首頁
                            </button>
                            <button onClick={logout} className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl font-black text-xs uppercase tracking-widest border border-red-100 hover:bg-red-100 transition-all">
                                <LogOut size={14} /> 安全登出
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <section className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-10 space-y-6 lg:space-y-8">
                    <div className="max-w-4xl mx-auto w-full">
                        {currentView === 'stats' ? (
                            <MemberStats onBack={handleBackToHub} variant="nested" onNavigate={onNavigate} />
                        ) : currentView === 'diary' ? (
                            <DevotionalDiary onBack={handleBackToHub} variant="nested" />
                        ) : currentView === 'exchange' ? (
                            <div className="pt-4"><AssetExchange user={{...user, aiCredits}} refreshUser={refreshUser} onExchangeSuccess={(credits) => setAiCredits(credits)} /></div>
                        ) : currentView === 'blessings' ? (
                            <MyVoiceBlessings onBack={handleBackToHub} />
                        ) : (
                            <div className="space-y-8">
                                {/* Header Badge */}
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                                        <ShieldCheck className="text-stone-400" size={20} />
                                    </div>
                                    <h1 className="text-xs font-black uppercase tracking-[0.2em] text-stone-800">個人帳號與安全中心</h1>
                                </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Profile Card */}
                            <div className="bg-white rounded-[40px] p-8 border border-stone-200 shadow-2xl shadow-stone-200/40 relative overflow-hidden h-full">
                                <div className="absolute top-0 right-0 p-8 opacity-5 text-stone-800 pointer-events-none">
                                     <Shield size={120} />
                                </div>
                                
                                <div className="flex flex-col items-center text-center">
                                    <div className="relative group mb-6">
                                        <div className="w-28 h-28 rounded-full ring-8 ring-stone-100 overflow-hidden bg-stone-50 shadow-inner">
                                            <Avatar user={user} size="full" />
                                        </div>
                                        <button 
                                            onClick={() => setShowAvatarSelector(true)}
                                            className="absolute bottom-1 right-1 bg-amber-500 text-white p-2.5 rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all border-4 border-white"
                                        >
                                            <Camera size={16} strokeWidth={3} />
                                        </button>
                                    </div>

                                    {isEditingName ? (
                                        <div className="w-full space-y-3">
                                            <input 
                                                autoFocus
                                                value={tempName} 
                                                onChange={e => setTempName(e.target.value)}
                                                className="w-full bg-stone-50 border-2 border-stone-200 p-3 rounded-2xl text-center font-black"
                                            />
                                            {user?.hasPassword ? <input 
                                                type="password"
                                                value={namePassword} 
                                                onChange={e => setNamePassword(e.target.value)}
                                                placeholder="輸入驗證密碼"
                                                className="w-full bg-stone-50 border-2 border-stone-200 p-3 rounded-2xl text-center font-bold"
                                            /> : <GoogleReauthButton onVerified={token => { setNameReauthToken(token); setNameError(''); }} onError={setNameError} disabled={isLoading} />}
                                            <div className="flex gap-2">
                                                <button onClick={() => setIsEditingName(false)} className="flex-1 py-2 text-stone-400 text-sm font-bold">取消</button>
                                                <button onClick={handleUpdateName} className="flex-1 bg-stone-800 text-white py-2 rounded-xl text-sm font-bold">確認</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-center gap-2">
                                                <h2 className="text-2xl font-black text-stone-900 tracking-tight">{user?.displayName}</h2>
                                                <button disabled={!canChangeName} onClick={() => { setTempName(user?.displayName || ''); setIsEditingName(true); }} className={`${canChangeName ? 'text-stone-300 hover:text-amber-500' : 'text-stone-100 cursor-not-allowed'}`}>
                                                    <Edit2 size={16} />
                                                </button>
                                            </div>
                                            <p className="text-xs font-black uppercase text-stone-400 tracking-[0.3em]">@{user?.username}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Security Radar Grid */}
                            <div className="space-y-4">
                                <SecurityRadar label="密碼優化程度" icon={Lock} value={maturity.daysSinceLastChange} max={180} color={maturity.daysSinceLastChange > 150 ? 'text-amber-500' : 'text-emerald-500'} subText={maturity.stage === 'safe' ? '🛡️ 安全等級：極佳' : '⚠️ 建議定期更新'} />
                                <SecurityRadar label="暱稱更改冷卻" icon={Activity} value={Math.min(30, nameDays)} max={30} color={canChangeName ? 'text-emerald-500' : 'text-stone-300'} subText={canChangeName ? '✅ 目前可修改' : `⏳ 剩餘 ${30 - nameDays} 天`} />
                            </div>
                        </div>

                        {/* Settings Section */}
                        <div className="bg-white rounded-[40px] p-8 border border-stone-200 shadow-sm space-y-6">
                            <h3 className="text-sm font-black uppercase text-stone-400 tracking-[0.3em]">帳號與安全進階設定</h3>
                            <AccountSignInMethods />
                            <ActionButton icon={Lock} label={isChangingPassword ? "取消修改密碼" : "變更登入密碼保護"} onClick={() => setIsChangingPassword(!isChangingPassword)} />
                            {isChangingPassword && (
                                <form onSubmit={handlePasswordUpdate} className="bg-stone-50 rounded-3xl p-6 space-y-4 animate-in slide-in-from-top-4">
                                    <PasswordInput label="目前密碼" value={passwordForm.currentPassword} onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} show={showPasswords} toggle={() => setShowPasswords(!showPasswords)} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <PasswordInput label="新密碼" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} show={showPasswords} />
                                        <PasswordInput label="確認新密碼" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} show={showPasswords} />
                                    </div>
                                    <button disabled={isLoading} className="w-full bg-stone-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg">
                                        {isLoading ? '處理中...' : '提交密碼更新'}
                                    </button>
                                </form>
                            )}
                        </div>
                        </div>
                        )}
                    </div>
                </section>


            </main>

            {showAvatarSelector && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-stone-100/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-lg">
                        <AvatarSelector onClose={() => setShowAvatarSelector(false)} onSuccess={() => refreshUser()} />
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-components (Ivory Style)
const ActionButton = ({ icon: Icon, label, onClick, color = "text-stone-600", badge }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-5 bg-white border border-stone-200 rounded-[28px] hover:border-amber-400 hover:shadow-xl hover:shadow-stone-200/50 transition-all group">
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl bg-stone-50 group-hover:bg-amber-100 transition-colors ${color}`}>
                <Icon size={20} />
            </div>
            <span className="font-black text-base tracking-tight text-stone-800">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            {badge && <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-black rounded-full">{badge}</span>}
            <ChevronRight className="text-stone-200 group-hover:text-amber-500 transition-colors" size={18} />
        </div>
    </button>
);

const PasswordInput = ({ label, value, onChange, show, toggle }) => (
    <div className="space-y-1.5 flex-1 text-left">
        <label className="text-xs font-black uppercase text-stone-400 px-1 tracking-widest">{label}</label>
        <div className="relative">
            <input 
                type={show ? "text" : "password"}
                value={value}
                onChange={onChange}
                className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl text-base font-bold focus:bg-white focus:border-stone-400 outline-none transition-all pr-12"
            />
            {toggle && (
                <button type="button" onClick={toggle} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}
        </div>
    </div>
);
