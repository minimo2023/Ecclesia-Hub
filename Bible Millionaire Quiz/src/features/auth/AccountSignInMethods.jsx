import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function AccountSignInMethods() {
    const { user, getToken, refreshUser } = useAuth();
    const [identities, setIdentities] = useState([]);
    const [email, setEmail] = useState(user?.email || '');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const request = useCallback(async (path, options = {}) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
            credentials: 'include',
            ...options,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) }
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || '操作失敗');
        return data;
    }, [getToken]);

    const load = useCallback(() => {
        request('identities').then(data => setIdentities(data.identities || [])).catch(() => {});
    }, [request]);

    useEffect(load, [load]);
    const hasGoogle = identities.some(identity => identity.provider === 'google');

    const verifyEmail = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            const data = await request('email/request-verification', { method: 'POST', body: JSON.stringify({ email }) });
            setMessage(data.message);
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    const linkGoogle = async credential => {
        setBusy(true); setError(''); setMessage('');
        try {
            const data = await request('identities/google', { method: 'POST', body: JSON.stringify({ credential }) });
            setIdentities(data.identities || []); setMessage('Google 登入已綁定。'); await refreshUser(true);
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    const unlinkGoogle = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await request('identities/google', { method: 'DELETE', body: JSON.stringify({ currentPassword: password }) });
            setPassword(''); setMessage('Google 登入已解除。'); load();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div><h4 className="font-black text-slate-900">登入方式</h4><p className="mt-1 text-xs text-slate-600">管理 Email、密碼與 Google 帳號。</p></div>
            {!user?.emailVerifiedAt && (
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600">Email 驗證</label>
                    <div className="flex flex-col gap-2 sm:flex-row"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="name@example.com" /><button disabled={busy} onClick={verifyEmail} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">寄送驗證信</button></div>
                </div>
            )}
            {hasGoogle ? (
                <div className="space-y-2"><p className="text-sm font-bold text-emerald-700">Google 已綁定</p><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="輸入目前密碼以解除綁定" /><button disabled={busy || !password} onClick={unlinkGoogle} className="text-xs font-bold text-red-600">解除 Google 登入</button></div>
            ) : <GoogleSignInButton onCredential={linkGoogle} onError={setError} disabled={busy} />}
            {message && <p className="text-sm font-bold text-emerald-700">{message}</p>}
            {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        </div>
    );
}
