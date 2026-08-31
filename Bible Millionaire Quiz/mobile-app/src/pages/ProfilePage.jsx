import React, { useState, useEffect } from 'react';
import { 
  User, Lock, Shield, Settings2, LogOut, ChevronRight, 
  Coins, CreditCard, Camera, Edit2, Activity, ArrowRightLeft, BarChart3, BookOpen, Gift
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useCoinSystem } from '../../../src/contexts/CoinSystemContext';
import AuthModal from '../components/auth/AuthModal';
import Avatar from '../components/profile/Avatar';
import AvatarSelectorModal from '../components/profile/AvatarSelectorModal';
import AssetExchangePage from './member/AssetExchangePage';
import StatsPage from './member/StatsPage';
import DiaryHistoryPage from './member/DiaryHistoryPage';
import HistoryPage from './member/HistoryPage';
import MyVoiceBlessings from '../../../src/features/scripture-recording/MyVoiceBlessings';
import AccountSignInMethods from '../../../src/features/auth/AccountSignInMethods';
import GoogleReauthButton from '../../../src/features/auth/GoogleReauthButton';

function SecurityRadar({ label, icon: Icon, value, max, color, subText }) {
  const percent = (max && max > 0) ? Math.min(100, Math.floor(((value || 0) / max) * 100)) : 0;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="app-card flex flex-col items-center gap-3 p-4 text-center">
      <div className="relative w-14 h-14 shrink-0">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="28" cy="28" r={radius} fill="transparent" stroke="currentColor" strokeWidth="4" className="text-slate-200" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ${color}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs font-black uppercase tracking-wider text-slate-700 mb-1">{label}</span>
        <span className="text-lg font-black text-slate-800">
          {value} <span className="text-sm font-medium text-slate-600">/ {max} 天</span>
        </span>
        <span className={`text-[11px] font-bold mt-1.5 ${color === 'text-emerald-500' ? 'text-emerald-600' : 'text-amber-600'}`}>
          {subText}
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, isLoggedIn, logout, updateProfile, refreshUser } = useAuth();
  const { coins } = useCoinSystem();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalView, setAuthModalView] = useState('login');
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'profile');

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state?.tab]);
  
  // Nickname Editing State
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [namePassword, setNamePassword] = useState('');
  const [nameReauthToken, setNameReauthToken] = useState('');
  const [nameError, setNameError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Remove unused fetchCredits logic

  const handleLogout = () => {
    logout();
  };

  const openAuth = (view) => {
    setAuthModalView(view);
    setShowAuthModal(true);
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

  // 如果未登入，顯示登入提示區塊
  if (!isLoggedIn) {
    return (
      <div className="app-page flex flex-col">
        <header className="app-topbar flex items-center justify-center px-4">
          <h1 className="text-base font-black text-slate-900 tracking-wider">會員中心</h1>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="app-card w-full max-w-sm p-8 text-center">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="text-indigo-700 w-10 h-10" />
            </div>
            <h2 className="text-xl font-black text-slate-800 mb-2">請先登入</h2>
            <p className="app-supporting mb-6">登入後即可同步靈修進度、遊戲成就與專屬資產。</p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => openAuth('login')}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-black shadow-md shadow-indigo-200/60 active:bg-indigo-700 transition"
              >
                登入帳號
              </button>
              <button
                onClick={() => openAuth('register')}
                className="w-full py-3.5 bg-slate-50 text-slate-700 rounded-2xl font-black active:bg-slate-100 transition"
              >
                註冊新帳號
              </button>
            </div>
          </div>
        </div>

        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
          initialView={authModalView}
        />
      </div>
    );
  }

  // 已登入的會員介面
  const displayName = user?.displayName || user?.username || '會員';
  
  const now = new Date();
  const maturity = user?.passwordMaturity || { daysSinceLastChange: 0, stage: 'safe' };
  const lastNameChange = user?.lastDisplayNameChange ? new Date(user.lastDisplayNameChange) : null;
  const nameDays = lastNameChange ? Math.floor((now - lastNameChange) / (1000 * 60 * 60 * 24)) : 999;
  const canChangeName = nameDays >= 30;

  return (
    <div className="app-page flex flex-col pb-safe">
      <header className="app-topbar flex items-center justify-between px-4">
        <div className="w-8" /> {/* Spacer */}
        <h1 className="text-base font-black text-slate-900 tracking-wider">會員中心</h1>
        <button className="w-8 h-8 flex items-center justify-end text-slate-600">
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {/* Top Tab Bar */}
      <div className="flex shrink-0 justify-between gap-1.5 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        {[
          ['profile', '個人'],
          ['exchange', '資產'],
          ['stats', '成就'],
          ['diary', '筆記'],
          ['history', '錯題'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-black transition-colors ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'bg-slate-50 text-slate-600 active:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 relative">
        {activeTab === 'profile' && (
          <div className="px-4 pt-6 pb-24 space-y-6 animate-in fade-in duration-300">
            {/* Profile Card */}
        <div className="app-card relative overflow-hidden p-6">
          <div className="absolute -top-10 -right-10 text-slate-50 opacity-50 pointer-events-none">
            <Shield size={160} />
          </div>

          <div className="flex flex-col items-center relative z-10">
            <div className="relative group mb-4">
              <div className="w-24 h-24 rounded-full ring-4 ring-slate-50 overflow-hidden bg-slate-50 shadow-inner flex items-center justify-center">
                <Avatar user={user} size="full" />
              </div>
              <button 
                onClick={() => setShowAvatarSelector(true)}
                className="absolute bottom-0 right-0 bg-indigo-500 text-white p-2 rounded-full shadow-lg border-2 border-white hover:scale-110 active:scale-95 transition-all"
              >
                <Camera size={14} strokeWidth={3} />
              </button>
            </div>
            
            {isEditingName ? (
              <div className="w-full space-y-3 px-2 mt-2">
                  {nameError && <div className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-lg">{nameError}</div>}
                  <input 
                      autoFocus
                      value={tempName} 
                      onChange={e => setTempName(e.target.value)}
                      placeholder="新暱稱"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-center font-black outline-none transition-colors focus:border-indigo-500"
                  />
                  {user?.hasPassword ? <input 
                      type="password"
                      value={namePassword} 
                      onChange={e => setNamePassword(e.target.value)}
                      placeholder="輸入密碼驗證身分"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-center font-bold outline-none transition-colors focus:border-indigo-500"
                  /> : <GoogleReauthButton onVerified={token => { setNameReauthToken(token); setNameError(''); }} onError={setNameError} disabled={isLoading} />}
                  <div className="flex gap-2 pt-1">
                      <button onClick={() => setIsEditingName(false)} className="flex-1 py-3 text-slate-700 text-sm font-bold bg-slate-100 rounded-xl active:bg-slate-200 transition-colors">取消</button>
                      <button onClick={handleUpdateName} disabled={isLoading} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold shadow-md shadow-indigo-200/60 active:bg-indigo-700 disabled:opacity-50 transition-all">
                        {isLoading ? '處理中…' : '確認修改'}
                      </button>
                  </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-black text-slate-900">{displayName}</h2>
                  <button 
                    disabled={!canChangeName} 
                    onClick={() => { setTempName(user?.displayName || ''); setNamePassword(''); setNameError(''); setIsEditingName(true); }} 
                    className={`${canChangeName ? 'text-slate-300 hover:text-indigo-700 active:text-indigo-600' : 'text-slate-200 cursor-not-allowed'} transition`}
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
                <p className="text-xs font-black uppercase text-slate-600 tracking-[0.2em]">@{user?.username}</p>
              </>
            )}
          </div>
        </div>

        {/* Security Radar Grid */}
        <div className="grid grid-cols-2 gap-3">
            <SecurityRadar label="密碼使用天數" icon={Lock} value={maturity.daysSinceLastChange} max={180} color={maturity.daysSinceLastChange > 150 ? 'text-amber-700' : 'text-emerald-500'} subText={maturity.stage === 'safe' ? '安全狀態良好' : '建議定期更新'} />
            <SecurityRadar label="暱稱修改間隔" icon={Activity} value={Math.min(30, nameDays)} max={30} color={canChangeName ? 'text-emerald-500' : 'text-slate-300'} subText={canChangeName ? '可以修改' : `還需 ${30 - nameDays} 天`} />
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('blessings')}
          className="flex w-full items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left active:bg-indigo-100"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white"><Gift className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-black text-slate-900">我的祝福語音</strong>
            <small className="mt-1 block text-xs font-bold leading-5 text-slate-600">管理已保存的錄音與分享期限</small>
          </span>
          <ChevronRight className="h-5 w-5 text-indigo-400" />
        </button>

        <AccountSignInMethods />

        {/* Assets / Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex flex-col items-center justify-center">
            <Coins className="text-amber-700 mb-2 w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 mb-1">BI COIN 智匯金幣</span>
            <span className="text-xl font-black text-amber-700">{coins}</span>
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex flex-col items-center justify-center">
            <CreditCard className="text-blue-500 mb-2 w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700/60 mb-1">BI POINT 智匯點數</span>
            <span className="text-xl font-black text-blue-700">{user?.ai_credits || 0}</span>
          </div>
        </div>

        {/* Logout */}
        <div className="pt-2">
          <button 
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 text-sm font-black text-red-600 transition active:bg-red-100"
          >
            <LogOut className="w-4 h-4" />
            安全登出
          </button>
        </div>
          </div>
        )}

        {activeTab === 'exchange' && <AssetExchangePage isTab={true} />}
        {activeTab === 'stats' && <StatsPage isTab={true} />}
        {activeTab === 'diary' && <DiaryHistoryPage isTab={true} />}
        {activeTab === 'history' && <HistoryPage isTab={true} />}
        {activeTab === 'blessings' && <MyVoiceBlessings compact onBack={() => setActiveTab('profile')} />}
      </div>

      <AvatarSelectorModal 
        isOpen={showAvatarSelector} 
        onClose={() => setShowAvatarSelector(false)} 
        onSuccess={() => refreshUser()} 
      />
    </div>
  );
}
