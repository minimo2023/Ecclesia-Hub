import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, LogIn, UserPlus, KeyRound, ArrowLeft, AlertTriangle, BookOpen } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * AuthModal - 認證視窗（登入/註冊/忘記密碼）
 * 行動版：左側品牌圖文 + 右側表單（橫向分欄）
 * 桌機版：上方橙色 Header + 下方表單（原有設計）
 */
export default function AuthModal({ isOpen, onClose, initialView = 'login', onLoginSuccess }) {
    const [view, setView] = useState(initialView);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [capsLockOn, setCapsLockOn] = useState(false);
    const [userSecurityQuestion, setUserSecurityQuestion] = useState('');
    const [googleToken, setGoogleToken] = useState('');

    const {
        login, register, googleLogin, completeGoogleOnboarding, linkGoogleAccount,
        requestPasswordReset,
        getUserSecurityQuestion,
        verifySecurityAnswer, resetPassword
    } = useAuth();

    const handlePasswordKeyEvent = (e) => {
        if (e.getModifierState) setCapsLockOn(e.getModifierState('CapsLock'));
    };

    const resetForm = () => {
        setUsername(''); setEmail(''); setPassword(''); setConfirmPassword(''); setDisplayName('');
        setSecurityAnswer('');
        setNewPassword(''); setResetToken('');
        setError(''); setSuccess('');
        setShowPassword(false); setUserSecurityQuestion('');
        setGoogleToken('');
    };

    useEffect(() => {
        if (isOpen) { setView(initialView); resetForm(); }
    }, [isOpen, initialView]);

    const handleLogin = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const result = await login(username, password);
        setIsLoading(false);
        if (result.success) { onLoginSuccess?.(); onClose(); }
        else setError(result.error);
    };

    const handleRegister = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            setError('帳號名稱只能使用英文字母、數字與底線，長度須為 3～20 個字元。');
            return setIsLoading(false);
        }
        if (password.length < 8) {
            setError('密碼至少需要 8 個字元。');
            return setIsLoading(false);
        }
        if (password !== confirmPassword) {
            setError('兩次輸入的密碼不一致。');
            return setIsLoading(false);
        }
        const result = await register({ username, email, password, confirmPassword, displayName });
        setIsLoading(false);
        if (result.success && result.code === 'EMAIL_VERIFICATION_REQUIRED') {
            setSuccess(result.message || '驗證信已寄出，請至信箱完成驗證。');
        } else if (result.success) { onLoginSuccess?.(); onClose(); }
        else setError(result.error);
    };

    const handleForgotStep1 = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const result = await requestPasswordReset(username);
        setIsLoading(false);
        if (result.success) setSuccess(result.message);
        else setError(result.error);
    };

    const handleLegacyForgot = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const res = await getUserSecurityQuestion(username);
        if (!res.success) { setError(res.error); return setIsLoading(false); }
        setUserSecurityQuestion(res.question);
        setIsLoading(false); setView('forgot-answer');
    };

    const handleGoogleCredential = async (credential) => {
        setIsLoading(true); setError('');
        const result = await googleLogin(credential);
        setIsLoading(false);
        if (result.success) { onLoginSuccess?.(); onClose(); return; }
        if (result.code === 'GOOGLE_ONBOARDING_REQUIRED') {
            setGoogleToken(result.onboardingToken);
            setUsername(result.profile?.suggestedUsername || '');
            setDisplayName(result.profile?.displayName || '');
            setView('google-onboarding');
            return;
        }
        if (result.code === 'ACCOUNT_LINK_REQUIRED') {
            setGoogleToken(result.linkToken); setView('google-link'); return;
        }
        setError(result.error || 'Google 登入失敗，請稍後再試。');
    };

    const handleGoogleOnboarding = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const result = await completeGoogleOnboarding(googleToken, username, displayName);
        setIsLoading(false);
        if (result.success) { onLoginSuccess?.(); onClose(); } else setError(result.error);
    };

    const handleGoogleLink = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const result = await linkGoogleAccount(googleToken, username, password);
        setIsLoading(false);
        if (result.success) { onLoginSuccess?.(); onClose(); } else setError(result.error);
    };

    const handleVerifyAnswer = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        const result = await verifySecurityAnswer(username, securityAnswer);
        setIsLoading(false);
        if (result.success) { setResetToken(result.resetToken); setView('reset-password'); }
        else setError(result.error);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault(); setIsLoading(true); setError('');
        if (newPassword.length < 8) { setError('密碼至少需要 8 個字元。'); return setIsLoading(false); }
        const result = await resetPassword(resetToken, newPassword);
        setIsLoading(false);
        if (result.success) {
            setSuccess('密碼已重設，請使用新密碼登入。');
            setTimeout(() => { setView('login'); resetForm(); }, 2000);
        } else setError(result.error);
    };

    if (!isOpen) return null;

    // ── 左側品牌面板（行動版用）──
    const viewMeta = {
        login:          { icon: <LogIn className="w-10 h-10 mb-3 opacity-90" />,    title: '歡迎回來', sub: '登入您的聖經智匯帳號' },
        register:       { icon: <UserPlus className="w-10 h-10 mb-3 opacity-90" />, title: '加入我們', sub: '建立您的靈命成長檔案' },
        forgot:         { icon: <KeyRound className="w-10 h-10 mb-3 opacity-90" />, title: '找回密碼', sub: '透過已驗證 Email 取得重設連結' },
        'forgot-answer':{ icon: <KeyRound className="w-10 h-10 mb-3 opacity-90" />, title: '驗證身分', sub: '回答原本設定的安全問題' },
        'reset-password':{ icon: <KeyRound className="w-10 h-10 mb-3 opacity-90" />,title: '設定新密碼', sub: '請輸入新密碼' },
        'forgot-legacy': { icon: <KeyRound className="w-10 h-10 mb-3 opacity-90" />, title: '舊會員驗證', sub: '使用原安全問題找回密碼' },
        'google-onboarding': { icon: <UserPlus className="w-10 h-10 mb-3 opacity-90" />, title: '完成會員資料', sub: '確認您的站內名稱' },
        'google-link': { icon: <KeyRound className="w-10 h-10 mb-3 opacity-90" />, title: '連結既有帳號', sub: '請驗證原帳號密碼' },
    };
    const meta = viewMeta[view] || viewMeta.login;

    // ── 共用表單 JSX（行動版 compact / 桌機版 standard）──
    const renderForms = (compact = false) => {
        const inputCls = `w-full px-3 ${compact ? 'py-2 text-sm' : 'py-3'} bg-slate-50 border border-slate-300 text-slate-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none transition-all`;
        const labelCls = `block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide`;
        const btnCls   = `w-full ${compact ? 'py-2 text-sm' : 'py-3'} bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed`;
        const spaceCls = compact ? 'space-y-3' : 'space-y-4';

        return (
            <>
                {error && (
                    <div className={`${compact ? 'mb-2 p-2 text-xs' : 'mb-4 p-3 text-sm'} bg-red-50 border border-red-200 text-red-700 rounded-xl`}>
                        {error}
                    </div>
                )}
                {success && (
                    <div className={`${compact ? 'mb-2 p-2 text-xs' : 'mb-4 p-3 text-sm'} bg-green-50 border border-green-200 text-green-700 rounded-xl`}>
                        {success}
                    </div>
                )}

                {(view === 'login' || view === 'register') && (
                    <div className="mb-4 space-y-3">
                        <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} disabled={isLoading} />
                        <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-300" /><span>或使用帳號</span><span className="h-px flex-1 bg-slate-300" /></div>
                    </div>
                )}

                {/* Login */}
                {view === 'login' && (
                    <form onSubmit={handleLogin} className={spaceCls}>
                        <div>
                            <label className={labelCls}>帳號或 Email</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                                className={inputCls} placeholder="輸入帳號或 Email" required />
                        </div>
                        <div>
                            <label className={labelCls}>密碼</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={handlePasswordKeyEvent} onKeyUp={handlePasswordKeyEvent}
                                    className={inputCls + ' pr-10'} placeholder="輸入密碼" required />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {capsLockOn && <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs"><AlertTriangle className="w-3 h-3" /><span>Caps Lock 已啟用</span></div>}
                        </div>
                        <button type="submit" disabled={isLoading} className={btnCls}>
                            {isLoading ? '登入中…' : '登入'}
                        </button>
                    </form>
                )}

                {/* Register */}
                {view === 'register' && (
                    <form onSubmit={handleRegister} className={spaceCls}>
                        <div>
                            <label className={labelCls}>Email *</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className={inputCls} placeholder="用於驗證與找回密碼" required />
                        </div>
                        <div>
                            <label className={labelCls}>帳號名稱 *</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                                className={inputCls} placeholder="用於登入的帳號" required />
                        </div>
                        <div>
                            <label className={labelCls}>顯示名稱</label>
                            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                                className={inputCls} placeholder="排行榜顯示名稱（選填）" />
                        </div>
                        <div>
                            <label className={labelCls}>密碼 *</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={handlePasswordKeyEvent} onKeyUp={handlePasswordKeyEvent}
                                    className={inputCls + ' pr-10'} placeholder="至少 8 個字元" required minLength={8} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {capsLockOn && <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs"><AlertTriangle className="w-3 h-3" /><span>Caps Lock 已啟用</span></div>}
                        </div>
                        <div>
                            <label className={labelCls}>確認密碼 *</label>
                            <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)} className={inputCls}
                                placeholder="再次輸入密碼" required minLength={8} />
                        </div>
                        <button type="submit" disabled={isLoading} className={btnCls}>
                            {isLoading ? '註冊中…' : '註冊'}
                        </button>
                        <p className="text-center text-[11px] leading-5 text-slate-500">註冊即表示您同意 <a href="/terms.html" target="_blank" rel="noreferrer" className="text-indigo-700 underline">服務條款</a> 與 <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-indigo-700 underline">隱私政策</a>。</p>
                    </form>
                )}

                {/* Forgot Step 1 */}
                {view === 'forgot' && (
                    <form onSubmit={handleForgotStep1} className={spaceCls}>
                        <p className="text-stone-500 text-xs">請輸入帳號或已驗證 Email。若資料符合，系統會寄出重設連結。</p>
                        <div>
                            <label className={labelCls}>帳號或 Email</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                                className={inputCls} placeholder="輸入帳號或 Email" required />
                        </div>
                        <button type="submit" disabled={isLoading} className={btnCls}>
                            {isLoading ? '處理中…' : '寄送重設連結'}
                        </button>
                        <button type="button" onClick={() => { setError(''); setSuccess(''); setView('forgot-legacy'); }} className="w-full text-xs text-amber-700 hover:underline">舊會員尚未驗證 Email？使用安全問題</button>
                    </form>
                )}

                {view === 'forgot-legacy' && (
                    <form onSubmit={handleLegacyForgot} className={spaceCls}>
                        <p className="text-stone-500 text-xs">此方式僅提供尚未完成 Email 驗證的舊會員使用。</p>
                        <div><label className={labelCls}>帳號名稱</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} className={inputCls} required /></div>
                        <button type="submit" disabled={isLoading} className={btnCls}>{isLoading ? '查詢中…' : '下一步'}</button>
                    </form>
                )}

                {view === 'google-onboarding' && (
                    <form onSubmit={handleGoogleOnboarding} className={spaceCls}>
                        <div><label className={labelCls}>帳號名稱 *</label><input value={username} onChange={e => setUsername(e.target.value)} className={inputCls} required /></div>
                        <div><label className={labelCls}>顯示名稱</label><input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} /></div>
                        <button type="submit" disabled={isLoading} className={btnCls}>{isLoading ? '建立中…' : '確認並建立帳號'}</button>
                    </form>
                )}

                {view === 'google-link' && (
                    <form onSubmit={handleGoogleLink} className={spaceCls}>
                        <p className="text-stone-500 text-xs">此 Google Email 已有會員資料。請輸入原帳號與密碼完成安全綁定。</p>
                        <div><label className={labelCls}>原帳號或 Email</label><input value={username} onChange={e => setUsername(e.target.value)} className={inputCls} required /></div>
                        <div><label className={labelCls}>原密碼</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} required /></div>
                        <button type="submit" disabled={isLoading} className={btnCls}>{isLoading ? '綁定中…' : '驗證並綁定'}</button>
                    </form>
                )}

                {/* Forgot Step 2 */}
                {view === 'forgot-answer' && (
                    <form onSubmit={handleVerifyAnswer} className={spaceCls}>
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <p className="text-xs text-stone-400 mb-0.5">安全問題</p>
                            <p className="text-sm font-medium text-stone-800">{userSecurityQuestion}</p>
                        </div>
                        <div>
                            <label className={labelCls}>您的答案</label>
                            <input type="text" value={securityAnswer} onChange={e => setSecurityAnswer(e.target.value)}
                                className={inputCls} placeholder="輸入安全問題的答案" required />
                        </div>
                        <button type="submit" disabled={isLoading} className={btnCls}>
                            {isLoading ? '驗證中…' : '驗證'}
                        </button>
                    </form>
                )}

                {/* Reset Password */}
                {view === 'reset-password' && (
                    <form onSubmit={handleResetPassword} className={spaceCls}>
                        <div>
                            <label className={labelCls}>新密碼</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    onKeyDown={handlePasswordKeyEvent} onKeyUp={handlePasswordKeyEvent}
                                    className={inputCls + ' pr-10'} placeholder="至少 8 個字元" required minLength={8} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {capsLockOn && <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs"><AlertTriangle className="w-3 h-3" /><span>Caps Lock 已啟用</span></div>}
                        </div>
                        <button type="submit" disabled={isLoading} className={btnCls}>
                            {isLoading ? '重設中…' : '重設密碼'}
                        </button>
                    </form>
                )}

                {/* Footer Links */}
                <div className={`${compact ? 'mt-3' : 'mt-6'} text-center text-xs text-stone-500`}>
                    {view === 'login' && (
                        <>
                            <button onClick={() => { resetForm(); setView('forgot'); }} className="text-amber-600 hover:underline">忘記密碼？</button>
                            <span className="mx-2 text-stone-300">|</span>
                            <button onClick={() => { resetForm(); setView('register'); }} className="text-amber-600 hover:underline">註冊新帳號</button>
                        </>
                    )}
                    {view === 'register' && (
                        <button onClick={() => { resetForm(); setView('login'); }} className="text-amber-600 hover:underline">已有帳號？登入</button>
                    )}
                    {view === 'forgot' && (
                        <button onClick={() => { resetForm(); setView('login'); }} className="text-amber-600 hover:underline">返回登入</button>
                    )}
                </div>
            </>
        );
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-y-contain bg-slate-900/35 px-3 backdrop-blur-sm lg:items-center lg:p-4"
            style={{
                paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
                paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                WebkitOverflowScrolling: 'touch'
            }}
        >

            {/* ══ 行動版：直向卡片，表單內容獨立滑動 (< lg) ══ */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="shared-mobile-auth-modal-title"
                className="my-auto flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-2xl lg:hidden"
            >
                <div className="relative flex shrink-0 items-center gap-3 border-b border-slate-300 bg-slate-200 px-4 py-3 text-slate-900">
                    <button onClick={onClose}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors hover:bg-slate-300"
                        aria-label="關閉登入視窗">
                        <X className="h-5 w-5" />
                    </button>
                    {(view === 'forgot-answer' || view === 'forgot-legacy' || view === 'reset-password' || view.startsWith('google-')) && (
                        <button onClick={() => setView(view.startsWith('google-') ? 'login' : (view === 'reset-password' ? 'forgot-answer' : 'forgot'))}
                            className="rounded-full p-2 transition-colors hover:bg-slate-300"
                            aria-label="返回上一步">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-indigo-200 bg-white/80 text-indigo-700">
                        {React.cloneElement(meta.icon, { className: 'h-5 w-5' })}
                    </div>
                    <div className="min-w-0 pr-10">
                        <h2 id="shared-mobile-auth-modal-title" className="text-lg font-black leading-tight">{meta.title}</h2>
                        <p className="mt-0.5 truncate text-xs text-slate-600">{meta.sub}</p>
                    </div>
                </div>

                <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-slate-100" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="p-5">
                        {renderForms(true)}
                    </div>
                </div>
            </div>

            {/* ══ 桌機版：上下結構（原有設計，≥ lg）══ */}
            <div className="hidden lg:flex flex-col bg-slate-100 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] border border-slate-300">
                {/* Header */}
                <div className="bg-slate-200 text-slate-900 p-6 relative shrink-0 border-b border-slate-300">
                    <button onClick={onClose}
                        className="absolute top-4 right-4 p-2 hover:bg-slate-300 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    {(view === 'forgot-answer' || view === 'forgot-legacy' || view === 'reset-password' || view.startsWith('google-')) && (
                        <button onClick={() => setView(view.startsWith('google-') ? 'login' : (view === 'reset-password' ? 'forgot-answer' : 'forgot'))}
                            className="absolute top-4 left-4 p-2 hover:bg-slate-300 rounded-full transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div className="text-center">
                        {view === 'login' && <LogIn className="w-12 h-12 mx-auto mb-3" />}
                        {view === 'register' && <UserPlus className="w-12 h-12 mx-auto mb-3" />}
                        {(view === 'forgot' || view === 'forgot-answer' || view === 'reset-password') &&
                            <KeyRound className="w-12 h-12 mx-auto mb-3" />}
                        {(view === 'forgot-legacy' || view === 'google-link') && <KeyRound className="w-12 h-12 mx-auto mb-3" />}
                        {view === 'google-onboarding' && <UserPlus className="w-12 h-12 mx-auto mb-3" />}
                        <h2 className="text-2xl font-bold">
                            {view === 'login' && '登入'}
                            {view === 'register' && '註冊帳號'}
                            {view === 'forgot' && '忘記密碼'}
                            {view === 'forgot-answer' && '驗證安全問題'}
                            {view === 'reset-password' && '設定新密碼'}
                            {view === 'forgot-legacy' && '舊會員安全問題'}
                            {view === 'google-onboarding' && '完成會員資料'}
                            {view === 'google-link' && '連結既有帳號'}
                        </h2>
                    </div>
                </div>
                {/* Form Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {renderForms(false)}
                </div>
            </div>

        </div>,
        document.body
    );
}
