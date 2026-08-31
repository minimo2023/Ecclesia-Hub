import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

let googleScriptPromise;

function loadGoogleScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!googleScriptPromise) {
        googleScriptPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-ecclesia-google-identity]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.dataset.ecclesiaGoogleIdentity = 'true';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    return googleScriptPromise;
}

export default function GoogleSignInButton({ onCredential, onError, disabled = false }) {
    const buttonRef = useRef(null);
    const { getGoogleNonce } = useAuth();
    const getNonceRef = useRef(getGoogleNonce);
    const onCredentialRef = useRef(onCredential);
    const onErrorRef = useRef(onError);
    const [unavailable, setUnavailable] = useState(false);
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    useEffect(() => {
        getNonceRef.current = getGoogleNonce;
        onCredentialRef.current = onCredential;
        onErrorRef.current = onError;
    }, [getGoogleNonce, onCredential, onError]);

    useEffect(() => {
        let cancelled = false;
        if (!clientId || disabled) {
            setUnavailable(!clientId);
            return undefined;
        }

        Promise.all([loadGoogleScript(), getNonceRef.current()]).then(([, nonceResult]) => {
            if (cancelled || !buttonRef.current) return;
            if (!nonceResult.success || !nonceResult.nonce) throw new Error(nonceResult.error || '無法建立 Google 登入驗證');
            window.google.accounts.id.initialize({
                client_id: clientId,
                nonce: nonceResult.nonce,
                callback: response => onCredentialRef.current?.(response.credential),
                auto_select: false,
                cancel_on_tap_outside: true
            });
            buttonRef.current.replaceChildren();
            window.google.accounts.id.renderButton(buttonRef.current, {
                type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
                shape: 'pill', width: Math.min(360, buttonRef.current.clientWidth || 320), locale: 'zh_TW'
            });
        }).catch(error => {
            if (!cancelled) {
                setUnavailable(true);
                onErrorRef.current?.(error.message || 'Google 登入暫時無法使用');
            }
        });

        return () => { cancelled = true; };
    }, [clientId, disabled]);

    if (!clientId || unavailable) {
        return <p className="text-center text-xs text-slate-500">Google 登入尚未完成設定</p>;
    }
    return <div ref={buttonRef} className={disabled ? 'pointer-events-none opacity-50' : 'flex min-h-10 w-full justify-center'} />;
}
