import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Check, X, Shield, Upload } from 'lucide-react';
import { useAuth } from '../../../../src/contexts/AuthContext';
import Avatar from './Avatar';

const AVATAR_Categories = {
    occupations: '聖經職人',
    legends: '聖典傳奇',
    custom: '自定義'
};

const AVATAR_OPTIONS = {
    occupations: [
        'shepherd_m', 'shepherd_f',
        'fisherman_m', 'fisherman_f',
        'soldier_m', 'soldier_f',
        'scholar_m', 'scholar_f'
    ],
    legends: [
        'prophet_m', 'prophet_f',
        'priest_m', 'priest_f',
        'royal_m', 'royal_f',
        'traveler_m', 'traveler_f'
    ]
};

const AvatarSelectorModal = ({ isOpen, onClose, onSuccess }) => {
    const { user, refreshUser, getToken, isGuest, guestAvatar, setGuestAvatar } = useAuth();
    const fileInputRef = useRef(null);

    const [selectedAvatar, setSelectedAvatar] = useState(user?.settings?.avatar || guestAvatar || 'guest');
    const [activeTab, setActiveTab] = useState('occupations');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 15 * 1024 * 1024) return setError('檔案太大 (上限 15MB)');
        
        setError(null);
        setUploading(true);

        try {
            const token = getToken();
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await fetch('/api/users/avatar/preview', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                setSelectedAvatar(data.previewUrl);
            } else {
                throw new Error(data.message || '預覽失敗');
            }
        } catch (err) {
            setError('轉檔失敗，請確認檔案格式');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            if (isGuest || !user) {
                if (selectedAvatar.startsWith('/uploads')) {
                    throw new Error('訪客模式不支援自定義照片');
                }
                setGuestAvatar(selectedAvatar);
                if (onSuccess) onSuccess();
                onClose();
                return;
            }

            const token = getToken();
            let finalAvatarUrl = selectedAvatar;

            if (selectedAvatar.includes('preview_')) {
                const file = fileInputRef.current?.files[0];
                if (file) {
                    const formData = new FormData();
                    formData.append('avatar', file);
                    const uploadRes = await fetch('/api/users/avatar/upload', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) {
                        finalAvatarUrl = uploadData.avatar;
                    } else {
                        throw new Error(uploadData.message || '儲存失敗');
                    }
                }
            }

            const response = await fetch('/api/users/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    settings: { avatar: finalAvatarUrl }
                })
            });

            if (!response.ok) throw new Error('儲存失敗');

            const data = await response.json();
            if (data.success) {
                await refreshUser();
                if (onSuccess) onSuccess();
                onClose();
            } else {
                throw new Error(data.error || '儲存失敗');
            }
        } catch {
            setError('相片儲存失敗，請稍後再試。');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-t-[32px] w-full max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
                    <h2 className="text-xl font-black text-slate-800">更換大頭貼</h2>
                    <button onClick={onClose} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pb-safe">
                    {/* Tabs */}
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-6">
                        {Object.entries(AVATAR_Categories).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === key
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-200/50'
                                    }`}
                            >
                                {key === 'custom' && <Camera size={14} />}
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="min-h-[280px]">
                        {activeTab === 'custom' ? (
                            <div className="flex h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6">
                                {uploading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                        <p className="text-indigo-600 text-xs font-bold">正在上傳相片</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative group mb-6">
                                            <div className="w-32 h-32 rounded-full border-4 border-white overflow-hidden bg-slate-100 shadow-lg flex items-center justify-center">
                                                {selectedAvatar.startsWith('/uploads') ? (
                                                    <img src={selectedAvatar} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Upload className="text-slate-300" size={40} />
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="absolute bottom-0 right-0 bg-indigo-600 text-white p-3 rounded-full shadow-lg border-2 border-white hover:scale-110 active:scale-95 transition-all"
                                            >
                                                <ImageIcon size={18} />
                                            </button>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-slate-700 font-black text-sm mb-1">上傳專屬相片</p>
                                            <p className="text-slate-400 text-xs font-medium">支援 JPG, PNG, HEIC (上限 15MB)</p>
                                        </div>
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,.heic,.heif" />
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-3 animate-in fade-in">
                                {AVATAR_OPTIONS[activeTab].map((avatarId) => (
                                    <button
                                        key={avatarId}
                                        onClick={() => {
                                            setSelectedAvatar(avatarId);
                                        }}
                                        className={`relative flex flex-col items-center gap-2 rounded-2xl p-2 transition-all ${selectedAvatar === avatarId
                                            ? 'bg-indigo-50 ring-2 ring-indigo-500'
                                            : 'bg-white border border-slate-200'
                                            }`}
                                    >
                                        <div className="relative">
                                            <Avatar avatarId={avatarId} size="md" className={selectedAvatar === avatarId ? 'scale-110 transition-transform' : ''} />
                                            {selectedAvatar === avatarId && (
                                                <div className="absolute -top-1 -right-1 bg-indigo-500 text-white rounded-full p-0.5 shadow-md">
                                                    <Check size={10} strokeWidth={4} />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-500 rounded-xl flex items-center gap-2 text-xs font-bold border border-red-100">
                            <Shield size={14} />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-white border-t border-slate-200 pb-safe shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={saving || uploading}
                        className={`w-full py-4 rounded-2xl font-black text-sm shadow-md transition-all ${saving || uploading
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-indigo-600 text-white active:bg-indigo-700 shadow-indigo-200'
                            }`}
                    >
                        {saving ? '儲存中…' : '確認變更'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AvatarSelectorModal;
