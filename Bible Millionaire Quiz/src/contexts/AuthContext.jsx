/* eslint-disable react-refresh/only-export-components -- This context module intentionally exports its provider and consumer hook together. */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const SOCKET_URL = (API_BASE_URL || window.location.origin).replace(/\/api$/, '');

const AuthContext = createContext(null);

async function readJson(response) {
    const body = await response.text();
    if (!body.trim()) {
        return {};
    }

    try {
        return JSON.parse(body);
    } catch {
        return {
            success: false,
            error: response.ok
                ? '伺服器回應格式錯誤，請稍後再試'
                : `伺服器暫時無法處理（${response.status}）`
        };
    }
}

// --- Global Fetch Interceptor for 401 Auto-Refresh ---
if (!window._fetchIntercepted) {
    window._fetchIntercepted = true;
    const originalFetch = window.fetch;
    let isRefreshing = false;
    let refreshQueue = [];

    function processQueue(error, token = null) {
        refreshQueue.forEach(prom => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve(token);
            }
        });
        refreshQueue = [];
    }

    window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        const isApi = url.includes('/api/') && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login') && !url.includes('/api/auth/register');

        // [New] Automatically inject Authorization header for API requests
        if (isApi) {
            const token = sessionStorage.getItem('authToken');
            if (token) {
                let options = args[1] || {};
                let newOptions = { ...options };
                
                // Initialize headers if undefined
                if (!newOptions.headers) {
                    newOptions.headers = {};
                }
                
                // Check if Authorization header already exists
                let hasAuth = false;
                if (newOptions.headers instanceof Headers) {
                    hasAuth = newOptions.headers.has('Authorization');
                } else {
                    hasAuth = !!(newOptions.headers['Authorization'] || newOptions.headers['authorization']);
                }

                // Inject token if not already present
                if (!hasAuth) {
                    if (newOptions.headers instanceof Headers) {
                        newOptions.headers.set('Authorization', `Bearer ${token}`);
                    } else {
                        newOptions.headers['Authorization'] = `Bearer ${token}`;
                    }
                }
                args[1] = newOptions;
            }
        }

        const res = await originalFetch(...args);
        
        if (res.status === 401 && isApi) {
            if (!isRefreshing) {
                isRefreshing = true;
                const baseURL = import.meta.env.VITE_API_BASE_URL || '';
                originalFetch(`${baseURL}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: '{}'
                }).then(refreshRes => readJson(refreshRes).then(refreshData => {
                    if (refreshRes.ok && refreshData.success) {
                        console.log('🔄 [Global Fetch] Token 自動換發成功');
                        sessionStorage.setItem('authToken', refreshData.accessToken);
                        isRefreshing = false;
                        processQueue(null, refreshData.accessToken);
                    } else {
                        throw new Error('Refresh failed');
                    }
                })).catch(err => {
                    console.log('⏰ [Global Fetch] 換發失敗，清除 Token');
                    isRefreshing = false;
                    sessionStorage.removeItem('authToken');
                    sessionStorage.removeItem('refreshToken');
                    processQueue(err);
                });
            }

            return new Promise((resolve, reject) => {
                refreshQueue.push({ resolve, reject });
            }).then(newToken => {
                let options = args[1] || {};
                let newOptions = { ...options };
                if (options.headers) {
                    if (options.headers instanceof Headers) {
                        newOptions.headers = new Headers(options.headers);
                    } else {
                        newOptions.headers = { ...options.headers };
                    }
                } else {
                    newOptions.headers = {};
                }
                
                if (newOptions.headers instanceof Headers) {
                    newOptions.headers.set('Authorization', `Bearer ${newToken}`);
                } else {
                    newOptions.headers['Authorization'] = `Bearer ${newToken}`;
                }
                
                return originalFetch(args[0], newOptions);
            }).catch(() => {
                return res; // Fallback to returning original 401
            });
        }
        return res;
    };
}
// ---------------------------------------------------

function AuthLinkAction({ onAuthenticated }) {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('auth');
    const token = params.get('token');
    const [status, setStatus] = useState(action === 'verify-email' ? 'verifying' : 'idle');
    const [message, setMessage] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const startedRef = useRef(false);

    const close = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('auth'); url.searchParams.delete('token');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        setStatus('closed');
    };

    useEffect(() => {
        if (action !== 'verify-email' || !token || startedRef.current) return;
        startedRef.current = true;
        fetch(`${API_BASE_URL}/api/auth/email/verify`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
        }).then(async response => ({ response, data: await readJson(response) })).then(({ response, data }) => {
            if (!response.ok || !data.success) throw new Error(data.error || 'Email 驗證失敗');
            sessionStorage.setItem('authToken', data.accessToken || data.token);
            onAuthenticated(data.user);
            setMessage('Email 驗證完成，帳號已啟用。'); setStatus('success');
        }).catch(error => { setMessage(error.message); setStatus('error'); });
    }, [action, token, onAuthenticated]);

    if (!token || status === 'closed' || !['verify-email', 'reset-password'].includes(action)) return null;

    const submitReset = async event => {
        event.preventDefault();
        if (password !== confirmPassword) return setMessage('兩次輸入的密碼不一致');
        setStatus('verifying'); setMessage('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetToken: token, newPassword: password })
            });
            const data = await readJson(response);
            if (!response.ok || !data.success) throw new Error(data.error || '密碼重設失敗');
            setMessage('密碼已重設，請使用新密碼登入。'); setStatus('success');
        } catch (error) { setMessage(error.message); setStatus('error'); }
    };

    return (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-black text-slate-900">{action === 'verify-email' ? 'Email 驗證' : '設定新密碼'}</h2>
                {action === 'reset-password' && status !== 'success' ? (
                    <form onSubmit={submitReset} className="mt-5 space-y-4">
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required placeholder="新密碼" className="w-full rounded-xl border border-slate-300 px-4 py-3" />
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required placeholder="確認新密碼" className="w-full rounded-xl border border-slate-300 px-4 py-3" />
                        <button disabled={status === 'verifying'} className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white">{status === 'verifying' ? '處理中...' : '重設密碼'}</button>
                    </form>
                ) : <p className="mt-4 text-sm text-slate-600">{status === 'verifying' ? '正在驗證，請稍候…' : message}</p>}
                {message && action === 'reset-password' && status !== 'success' && <p className="mt-3 text-sm text-red-600">{message}</p>}
                {(status === 'success' || status === 'error') && <button onClick={close} className="mt-5 w-full rounded-xl bg-slate-900 py-3 font-bold text-white">關閉</button>}
            </div>
        </div>
    );
}

/**
 * AuthProvider - 認證狀態管理
 * 包裹整個 App 以提供認證狀態
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const socketRef = useRef(null);
    const handleLinkAuthenticated = useCallback(authenticatedUser => setUser(authenticatedUser), []);
    const [emailReminderDismissed, setEmailReminderDismissed] = useState(() => sessionStorage.getItem('emailReminderDismissed') === '1');

    // Get token from sessionStorage (cleared automatically when browser/tab closes)
    const getToken = () => {
        return sessionStorage.getItem('authToken');
    };

    const setToken = (token) => {
        if (token) {
            sessionStorage.setItem('authToken', token);
        } else {
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('refreshToken');
        }
        // 確保徹底清除舊版殘留在 localStorage 的 token，避免干擾
        localStorage.removeItem('authToken');
        localStorage.removeItem('lastActivity');
    };

    /**
     * normalizeUrl - [V8.8 Fix] Ensure relative paths are served from backend URL
     * Fixes cross-port (5173 vs 3005) avatar rendering issues.
     */
    const normalizeUrl = useCallback((path) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        // Prepend API_BASE_URL (e.g. http://localhost:3005)
        const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${baseUrl}${cleanPath}`;
    }, []);

    // Fetch current user on app load
    const fetchCurrentUser = useCallback(async () => {
        let token = getToken();
        if (!token) {
            try {
                const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
                });
                const refreshData = await readJson(refreshResponse);
                if (refreshResponse.ok && refreshData.success) {
                    token = refreshData.accessToken;
                    setToken(token);
                }
            } catch {
                // No valid cookie session; continue as signed out.
            }
        }
        if (!token) {
            setToken(null); setUser(null); setLoading(false); return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await readJson(response);
                if (data.success) {
                    setUser(data.user);
                }
            } else {
                // Token invalid or expired
                setToken(null);
                setUser(null);
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            setToken(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initialize on mount, clean legacy storage, and fetch user session
    useEffect(() => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('lastActivity');
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    // 簡化為空函數以維持與外部元件 (如遠征模式) 相容性，不再執行自動登出與 localStorage 寫入
    const updateActivity = useCallback(() => {}, []);

    // 解決被登出卻不知道的 UX 痛點：主動偵測 Token 是否過期
    useEffect(() => {
        if (!user) return;

        const checkTokenValidity = async () => {
            const token = getToken();
            if (!token) {
                setUser(null);
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok && response.status === 401) {
                    // 嘗試使用 Refresh Token 換發
                    try {
                            const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: '{}'
                            });
                            const refreshData = await readJson(refreshRes);
                            if (refreshRes.ok && refreshData.success) {
                                console.log('🔄 [Auth] Token 換發成功');
                                setToken(refreshData.accessToken);
                                // 換發成功後，重新呼叫 /me 來更新資料
                                const retryRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
                                    headers: { 'Authorization': `Bearer ${refreshData.accessToken}` }
                                });
                                if (retryRes.ok) {
                                    const retryData = await readJson(retryRes);
                                    if (retryData.success) setUser(retryData.user);
                                }
                                return; // 換發並重試成功，中斷原本的登出流程
                            }
                    } catch (refreshErr) {
                            console.error('🔄 [Auth] Token 換發請求失敗:', refreshErr);
                    }

                    console.log('⏰ [Auth] 背景心跳/前台喚醒偵測到 Token 已失效且換發失敗，自動登出');
                    setUser(null);
                    setToken(null);
                }
            } catch (err) {
                console.error('⏰ [Auth] 背景心跳/前台喚醒主動驗證 Token 失敗:', err);
                // 網路連線中斷等異常不進行強制登出，保障網路抖動體驗
            }
        };

        // 1. 背景定時心跳輪詢：每 3 分鐘主動校驗一次
        const interval = setInterval(checkTokenValidity, 3 * 60 * 1000);

        // 2. 切回前台/喚醒即時校驗：當使用者切回分頁或睡眠喚醒時立即校驗
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkTokenValidity();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);

    // Socket.IO connection for user-specific events (coins:updated, etc.)
    useEffect(() => {
        if (user?.id) {
            // Connect to socket for user events
            const socket = io(SOCKET_URL, {
                transports: ['polling', 'websocket'],
                autoConnect: true,
                auth: { token: getToken() }
            });

            socket.on('connect', () => {
                console.log('🔌 [AuthContext] Socket connected, identifying user...');
                socket.emit('user:identify');
            });

            // Listen for real-time coin updates from admin
            socket.on('coins:updated', (data) => {
                console.log('💰 [AuthContext] Received coins:updated:', data);
                setUser(prev => prev ? { ...prev, coins: data.coins } : prev);
            });

            // Listen for admin notifications
            socket.on('admin:notification', (data) => {
                console.log('🛡️ [AuthContext] Received admin:notification:', data);
                window.dispatchEvent(new CustomEvent('admin:notification', { detail: data }));
            });

            socket.on('disconnect', () => {
                console.log('🔌 [AuthContext] Socket disconnected');
            });

            socketRef.current = socket;

            return () => {
                socket.disconnect();
                socketRef.current = null;
            };
        }
    }, [user?.id]);

    // Register
    const register = async ({ username, email, password, confirmPassword, displayName }) => {
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, email, password, confirmPassword, displayName })
            });

            const data = await readJson(response);

            if (!response.ok || !data.success) {
                return { success: false, error: data.error || '註冊失敗', code: data.code };
            }

            if (data.accessToken || data.token) {
                setToken(data.accessToken || data.token);
                setUser(data.user);
            }
            return { success: true, code: data.code, message: data.message };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    };

    // Login
    const login = async (identifier, password) => {
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ identifier, password })
            });

            const data = await readJson(response);

            if (!response.ok || !data.success) {
                return { success: false, error: data.error || '登入失敗', code: data.code };
            }

            setToken(data.token || data.accessToken);
            setUser(data.user);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    };

    // Logout
    const logout = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
            });
        } catch {
            // Local sign-out must still complete when the network is unavailable.
        }
        setToken(null);
        setUser(null);
        setError(null);
    };

    const postAuthAction = async (path, body) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        const data = await readJson(response);
        if (response.ok && data.success && (data.accessToken || data.token)) {
            setToken(data.accessToken || data.token);
            setUser(data.user);
        }
        return { ...data, success: response.ok && data.success };
    };

    const getGoogleNonce = async () => postAuthAction('google/nonce', {});
    const googleLogin = async (credential) => postAuthAction('google', { credential });
    const completeGoogleOnboarding = async (onboardingToken, username, displayName) =>
        postAuthAction('google/complete', { onboardingToken, username, displayName });
    const linkGoogleAccount = async (linkToken, identifier, password) =>
        postAuthAction('google/link', { linkToken, identifier, password });
    const verifyEmail = async (token) => postAuthAction('email/verify', { token });
    const resendVerificationEmail = async (email) => postAuthAction('email/resend', { email });
    const requestPasswordReset = async (identifier) => postAuthAction('password/forgot', { identifier });

    const lastRefreshRef = useRef(0);
    // Refresh user data (e.g., after earning coins or updating profile)
    const refreshUser = async (force = false) => {
        const token = getToken();
        if (!token) return;

        // [Fix] Throttling for refresh: Prevent 429 Too Many Requests
        const now = Date.now();
        if (!force && now - lastRefreshRef.current < 5000) {
            console.log('⏳ Skip refreshUser (throttled)');
            return;
        }
        lastRefreshRef.current = now;

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await readJson(response);
            if (response.ok && data.success) {
                setUser(data.user);
            } else if (response.status === 401) {
                setToken(null);
                setUser(null);
            }
        } catch (err) {
            console.error('Refresh user failed:', err);
        }
    };

    /**
     * dismissPasswordWarning - 沿用舊密碼，延後提醒
     */
    const dismissPasswordWarning = async () => {
        const token = getToken();
        if (!token) return { success: false, error: 'Unauthorized' };

        try {
            const response = await fetch(`${API_BASE_URL}/api/users/dismiss-pwd-warning`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await readJson(response);
            if (data.success) {
                // 成功後重新整理用戶資料，以獲取新的 stage
                await refreshUser();
                return { success: true };
            }
            return { success: false, error: data.error };
        } catch (err) {
            console.error('Dismiss password warning failed:', err);
            return { success: false, error: err.message };
        }
    };

    // Get security questions (for registration)
    const getSecurityQuestions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/security-questions`);
            const data = await readJson(response);
            return data.questions || [];
        } catch (err) {
            console.error('Get security questions failed:', err);
            return [];
        }
    };

    // Get user's security question (for password reset)
    const getUserSecurityQuestion = async (username) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/security-question/${encodeURIComponent(username)}`);
            const data = await readJson(response);
            if (!response.ok || !data.success) {
                throw new Error(data.error || '找不到用戶');
            }
            return { success: true, question: data.securityQuestion };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Verify security answer (step 1 of password reset)
    const verifySecurityAnswer = async (username, securityAnswer) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/verify-security-answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, securityAnswer })
            });

            const data = await readJson(response);
            if (!response.ok || !data.success) {
                throw new Error(data.error || '驗證失敗');
            }
            return { success: true, resetToken: data.resetToken };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Reset password (step 2)
    const resetPassword = async (resetToken, newPassword) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resetToken, newPassword })
            });

            const data = await readJson(response);
            if (!response.ok || !data.success) {
                throw new Error(data.error || '重設失敗');
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Change password (for logged-in users)
    const updatePassword = async (oldPassword, newPassword) => {
        const token = getToken();
        if (!token) {
            return { success: false, error: '請先登入' };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const data = await readJson(response);
            if (!response.ok || !data.success) {
                if (response.status === 401) {
                    setToken(null);
                    setUser(null);
                }
                throw new Error(data.error || '修改密碼失敗');
            }
            return { success: true };
        } catch (err) {
            console.error('Update Password Error:', err);
            return { success: false, error: err.message };
        }
    };

    // Update profile (e.g. display name)
    const updateProfile = async (profileData) => {
        const token = getToken();
        if (!token) return { success: false, error: '請先登入' };

        try {
            const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData) // profileData will contain currentPassword
            });

            const result = await readJson(response);
            if (!response.ok || !result.success) {
                if (response.status === 401) {
                    setToken(null);
                    setUser(null);
                }
                throw new Error(result.error || '更新失敗');
            }

            // [Sovereignty 3.0] Refresh user to sync state and maturity info
            await refreshUser();
            return { success: true };
        } catch (err) {
            console.error('Update Profile Error:', err);
            return { success: false, error: err.message };
        }
    };

    // --- Guest Logic ---
    const [guestId, setGuestId] = useState(() => sessionStorage.getItem('guestId'));
    const [guestAvatar, setGuestAvatarState] = useState(() => sessionStorage.getItem('guestAvatar') || 'guest');

    // Compute derived state: isGuest is true if no user but we have a guestId
    const isGuest = !user && !!guestId;

    const setGuestAvatar = useCallback((avatarId) => {
        sessionStorage.setItem('guestAvatar', avatarId);
        setGuestAvatarState(avatarId);
    }, []);

    const loginAsGuest = useCallback(() => {
        let id = sessionStorage.getItem('guestId');
        if (!id) {
            // Generate simple unique ID
            id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('guestId', id);
        }
        setGuestId(id);
        return id;
    }, []);

    const getUserId = useCallback(() => {
        if (user) return user.id;
        if (guestId) return guestId;
        return null;
    }, [user, guestId]);

    const getDisplayName = useCallback(() => {
        if (user) return user.displayName || user.username;
        if (guestId) return `訪客${guestId.substr(-4)}`;
        return '未登入';
    }, [user, guestId]);

    const value = {
        user,
        loading,
        error,
        isLoggedIn: !!user,
        isGuest,          // New
        guestId,          // New
        guestAvatar,      // New
        setGuestAvatar,   // New
        loginAsGuest,     // New
        getUserId,        // New
        getDisplayName,   // New
        register,
        login,
        logout,
        getGoogleNonce,
        googleLogin,
        completeGoogleOnboarding,
        linkGoogleAccount,
        verifyEmail,
        resendVerificationEmail,
        requestPasswordReset,
        refreshUser,
        getSecurityQuestions,
        getUserSecurityQuestion,
        verifySecurityAnswer,
        resetPassword,
        updatePassword,
        updateProfile,
        dismissPasswordWarning,
        normalizeUrl, // [V8.8 Fix] Exported for global image rendering
        getToken,     // [Fix] Exported for authenticated requests
        updateActivity // [Fix] Exported to allow keep-alive in specific modes
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
            {user?.needsEmailVerification && !emailReminderDismissed && (
                <div className="fixed inset-x-3 top-3 z-[900] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-xl" role="status">
                    <div className="min-w-0 flex-1"><strong className="block font-black">建議驗證 Email</strong><span className="text-xs">驗證後可使用 Email 找回密碼；目前仍可繼續使用網站。</span></div>
                    <button onClick={() => { sessionStorage.setItem('emailReminderDismissed', '1'); setEmailReminderDismissed(true); }} className="shrink-0 font-bold text-amber-800">稍後</button>
                </div>
            )}
            <AuthLinkAction onAuthenticated={handleLinkAuthenticated} />
        </AuthContext.Provider>
    );
}

/**
 * useAuth - Hook to access auth context
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
