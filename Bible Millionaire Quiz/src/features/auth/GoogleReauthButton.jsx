import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function GoogleReauthButton({ onVerified, onError, disabled }) {
    const { getToken } = useAuth();
    const handleCredential = async credential => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reauth/google`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ credential })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Google 重新驗證失敗');
            onVerified?.(data.reauthToken);
        } catch (error) { onError?.(error.message); }
    };
    return <GoogleSignInButton onCredential={handleCredential} onError={onError} disabled={disabled} />;
}
