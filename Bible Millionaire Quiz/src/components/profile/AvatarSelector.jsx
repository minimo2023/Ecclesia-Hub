import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Check, X, Shield, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';

const AVATAR_Categories = {
    occupations: '聖經職人',
    legends: '聖典傳奇',
    custom: '自定義照片'
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

const AvatarSelector = ({ onClose, onSuccess }) => {
    const { user, refreshUser, getToken, isGuest, guestAvatar, setGuestAvatar } = useAuth();
    const fileInputRef = useRef(null);

    // Initialize: User settings > Guest memory > Default
    const [selectedAvatar, setSelectedAvatar] = useState(user?.settings?.avatar || guestAvatar || 'guest');
    const [activeTab, setActiveTab] = useState('occupations');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    // Handle File selection for Custom Photos
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Security Check
        if (file.size > 15 * 1024 * 1024) return setError('檔案太大 (上限 15MB)');
        
        setError(null);
        setUploading(true);

        try {
            const token = getToken();
            const formData = new FormData();
            formData.append('avatar', file);

            // [V8.7 Flagship Pipeline] Request Backend Preview
            console.log('📱 [Frontend] Requesting High-Res Hybrid Preview...');
            const response = await fetch('/api/users/avatar/preview', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                console.log('✅ [Frontend] Hybrid Preview Received:', data.previewUrl);
                setPreviewUrl(data.previewUrl);
                setSelectedAvatar(data.previewUrl);
            } else {
                throw new Error(data.message || '預覽失敗');
            }
        } catch (err) {
            console.error('Preview error:', err);
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
                // Guests can't upload photos in this version
                if (selectedAvatar.startsWith('/uploads')) {
                    throw new Error('訪客模式不支援自定義照片，請先登入');
                }
                setGuestAvatar(selectedAvatar);
                await new Promise(r => setTimeout(r, 500));
                if (onSuccess) onSuccess();
                if (onClose) onClose();
                return;
            }

            const token = getToken();
            let finalAvatarUrl = selectedAvatar;

            // If it's a new custom photo (preview), we must solidify it
            if (selectedAvatar.includes('preview_')) {
                console.log('🚀 [Frontend] Solidifying Custom Avatar...');
                // We need to re-upload the file or use a server-side "confirm" route.
                // For simplicity in this track, we assume the user already uploaded the file to preview,
                // BUT to be secure, we usually want to re-post or have the server move the temp file.
                // Here we will re-upload the actual file from the input for the final save.
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

            // Save to settings
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
                if (onClose) onClose();
            } else {
                throw new Error(data.error || '儲存失敗');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden relative">
            <h2 className="text-2xl font-black text-white mb-8 text-center tracking-tight">個人頭像與照片設定</h2>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-slate-800 rounded-2xl mb-8">
                {Object.entries(AVATAR_Categories).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === key
                            ? 'bg-amber-500 text-slate-900 shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                            }`}
                    >
                        {key === 'custom' && <Camera size={16} />}
                        {label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[320px]">
                {activeTab === 'custom' ? (
                    <div className="flex flex-col items-center justify-center h-[300px] bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-700 p-8 space-y-6">
                        {uploading ? (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-amber-500 font-mono text-xs uppercase tracking-widest text-center">媒體優化中...</p>
                            </div>
                        ) : (
                            <>
                                <div className="relative group">
                                    <div className="w-32 h-32 rounded-full border-4 border-slate-700 overflow-hidden bg-slate-800 shadow-inner flex items-center justify-center">
                                        {selectedAvatar.startsWith('/uploads') ? (
                                            <img src={selectedAvatar} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <Upload className="text-slate-600" size={40} />
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute bottom-1 right-1 bg-amber-500 text-slate-900 p-2 rounded-full shadow-lg border-2 border-slate-900 hover:scale-110 active:scale-95 transition-all"
                                    >
                                        <ImageIcon size={16} />
                                    </button>
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-bold text-sm mb-1">上傳個人相片</p>
                                    <p className="text-slate-400 text-[10px] uppercase font-mono tracking-tight leading-tight">
                                        支援 JPG, PNG, HEIC (iPhone)<br/>檔案大小限制 15MB
                                    </p>
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                    accept="image/*,.heic,.heif" 
                                />
                            </>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-4 animate-in fade-in duration-500">
                        {AVATAR_OPTIONS[activeTab].map((avatarId) => (
                            <button
                                key={avatarId}
                                onClick={() => {
                                    setSelectedAvatar(avatarId);
                                    setPreviewUrl(null);
                                }}
                                className={`group relative p-3 rounded-2xl transition-all ${selectedAvatar === avatarId
                                    ? 'bg-amber-500/10 ring-2 ring-amber-500 scale-105 shadow-xl shadow-amber-500/10'
                                    : 'bg-slate-800/30 hover:bg-slate-800/80 border border-transparent hover:border-slate-600'
                                    }`}
                            >
                                <div className="relative z-10">
                                    <Avatar
                                        avatarId={avatarId}
                                        size="lg"
                                        className={`mx-auto transition-transform ${selectedAvatar === avatarId ? 'scale-110' : 'group-hover:scale-110'}`}
                                    />
                                    {selectedAvatar === avatarId && (
                                        <div className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 rounded-full p-1 shadow-lg">
                                            <Check size={8} strokeWidth={4} />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 text-[10px] text-center text-slate-400 font-bold group-hover:text-amber-500 transition-colors">
                                    {avatarId === 'shepherd_m' ? '男牧羊人' : 
                                     avatarId === 'shepherd_f' ? '女牧羊人' :
                                     avatarId === 'fisherman_m' ? '男漁夫' :
                                     avatarId === 'fisherman_f' ? '女漁夫' :
                                     avatarId === 'soldier_m' ? '男士兵' :
                                     avatarId === 'soldier_f' ? '女士兵' :
                                     avatarId === 'scholar_m' ? '男學者' :
                                     avatarId === 'scholar_f' ? '女學者' :
                                     avatarId === 'prophet_m' ? '男先知' :
                                     avatarId === 'prophet_f' ? '女先知' :
                                     avatarId === 'priest_m' ? '祭司' :
                                     avatarId === 'priest_f' ? '女祭司' :
                                     avatarId === 'royal_m' ? '君王' :
                                     avatarId === 'royal_f' ? '后妃' :
                                     avatarId === 'traveler_m' ? '男使者' :
                                     avatarId === 'traveler_f' ? '女使者' :
                                     avatarId.replace('_', ' ')}
                                </div>
                                {selectedAvatar === avatarId && (
                                    <div className="absolute inset-0 bg-amber-500/5 rounded-2xl" />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Status Messages */}
            {error && (
                <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs font-bold animate-in slide-in-from-top-2">
                    <Shield size={14} />
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 mt-8 border-t border-slate-800 pt-8">
                <button
                    onClick={onClose}
                    className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-transparent hover:border-slate-700"
                    disabled={saving || uploading}
                >
                    取消
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || uploading}
                    className={`flex-[2] py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-900 shadow-2xl transition-all ${saving || uploading
                        ? 'bg-slate-700 cursor-wait'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:scale-[1.02] active:scale-95 shadow-amber-500/30'
                        }`}
                >
                    {saving ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                            儲存中...
                        </div>
                    ) : '確認儲存設定'}
                </button>
            </div>
            
            {/* Guest Hint */}
            {isGuest && (
                <p className="text-center mt-6 text-slate-500 text-[10px] font-bold uppercase tracking-tighter">
                    ⚠️ 訪客模式：部分自定義功能（上傳相片）受到限制
                </p>
            )}
        </div>
    );
};

export default AvatarSelector;
