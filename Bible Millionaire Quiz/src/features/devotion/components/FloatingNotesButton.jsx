/**
 * 浮動筆記按鈕與視窗元件
 * Floating Notes Button and Modal for Devotional Page
 * With Edit/Append mode for existing notes
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PenLine, X, Save, AlertTriangle, Loader2, Edit3, Plus } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import AuthModal from '../../auth/AuthModal';

// API helpers
const API_BASE = '';

const fetchWithAuth = async (url, options = {}) => {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };

    console.log(`🌐 [Notes API] ${options.method || 'GET'} ${url}`);

    try {
        const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
        const data = await response.json().catch(() => ({}));

        console.log(`📥 [Notes API] Response:`, response.status, data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error(`❌ [Notes API] Error:`, error);
        throw error;
    }
};

export default function FloatingNotesButton({ devotionalDate, isInHeader = false, onRequestLogin }) {
    const { user, isLoggedIn } = useAuth();
    const textareaRef = useRef(null);

    // State
    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [originalNote, setOriginalNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // 模式選擇：當已有舊筆記時
    const [hasExistingNote, setHasExistingNote] = useState(false);
    const [mode, setMode] = useState(null); // null | 'edit' | 'append'

    // 載入筆記
    const loadNote = useCallback(async () => {
        if (!devotionalDate) return;

        // 訪客模式：草稿不持久，每次開啟都是空白
        if (!isLoggedIn || !user?.id) {
            setNote('');
            setOriginalNote('');
            setHasExistingNote(false);
            setMode('edit');
            return;
        }

        // 登入用戶 - 從伺服器載入
        setLoading(true);
        setError('');

        try {
            // 平行請求：筆記本體與草稿
            const [noteData, draftData] = await Promise.all([
                fetchWithAuth(`/api/devotional-notes/${devotionalDate}`).catch(() => ({ note: '' })),
                fetchWithAuth(`/api/devotional-notes/draft/${devotionalDate}`).catch(() => ({ draft: null }))
            ]);

            const serverNote = noteData.note || '';
            const serverDraft = draftData.draft;

            setOriginalNote(serverNote);
            setHasExistingNote(!!serverNote);

            if (serverDraft && serverDraft !== serverNote) {
                // 有草稿，優先顯示草稿內容
                setNote(serverDraft);
                setMode(serverNote ? null : 'edit'); // 如果有正式筆記，讓用戶選擇（這裡可能需要優化介面提示"載入草稿"）
                // 為了簡化，若有草稿，直接進入編輯模式並帶入草稿，但保留返回選擇的權利
                if (!serverNote) {
                    setMode('edit');
                } else {
                    // 兩者都有，用戶需要決定。
                    // 目前的 UI 是 hasExistingNote && mode === null 會顯示選擇頁
                    // 我們可以在選擇頁加一個提示？或者直接預設選 draft
                    // 簡單策略：先進入選擇頁，但點擊 'edit' 時會看到草稿內容 (因為 setNote 已經是 draft)
                    setMode(null);
                }
                console.log('📝 [Draft] Loaded server draft');
            } else {
                // 無草稿，使用正式筆記
                if (serverNote) {
                    setMode(null);
                    setNote(serverNote);
                } else {
                    setMode('edit');
                    setNote('');
                }
            }
        } catch (err) {
            console.error('Failed to load note:', err);
            setError('載入失敗');
            setMode('edit');
        } finally {
            setLoading(false);
        }
    }, [devotionalDate, isLoggedIn, user?.id]);

    // 當日期或用戶改變時載入筆記
    useEffect(() => {
        if (isOpen) {
            loadNote();
        }
    }, [isOpen, loadNote]);

    // 選擇模式
    const selectMode = (selectedMode) => {
        setMode(selectedMode);

        if (selectedMode === 'edit') {
            // 編輯模式：
            // 如果目前的 note 已經是草稿（在 loadNote 設定的），就保留它
            // 如果 note === originalNote，代表沒有草稿，就用 originalNote
            if (!note) setNote(originalNote);
        } else if (selectedMode === 'append') {
            // 追加模式：在舊內容後添加分隔線
            const now = new Date();
            const timestamp = now.toLocaleString('zh-TW', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const separator = `\n\n--- ${timestamp} 更新 ---\n`;
            setNote(originalNote + separator);

            // 稍後將游標定位到最後
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.selectionStart = textareaRef.current.value.length;
                    textareaRef.current.selectionEnd = textareaRef.current.value.length;
                }
            }, 100);
        }
    };

    // 儲存筆記
    const saveNote = async () => {
        if (!devotionalDate) return;

        setSaving(true);
        setError('');
        setSuccessMsg('');

        // 訪客模式：筆記僅在本次瀏覽有效，不持久儲存
        if (!isLoggedIn || !user?.id) {
            try {
                setOriginalNote(note);
                setSuccessMsg('筆記已暫存（登入後可永久儲存）');
                setTimeout(() => setIsOpen(false), 1200);
            } catch (err) {
                setError('儲存失敗');
            } finally {
                setSaving(false);
            }
            return;
        }

        // 登入用戶
        try {
            console.log(`📝 [Notes] Saving note for ${devotionalDate}, length: ${note.length}`);

            await fetchWithAuth(`/api/devotional-notes/${devotionalDate}`, {
                method: 'POST',
                body: JSON.stringify({ note })
            });

            // 儲存成功後，刪除草稿
            await fetchWithAuth(`/api/devotional-notes/draft/${devotionalDate}`, {
                method: 'DELETE'
            });

            setOriginalNote(note);
            setSuccessMsg('✅ 筆記已儲存！');
            setTimeout(() => setIsOpen(false), 800);
        } catch (err) {
            console.error('Failed to save note:', err);
            setError(`儲存失敗：${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // 登入用戶自動儲存草稿 (Debounce 2000ms)，訪客不儲
    useEffect(() => {
        if (!devotionalDate || !note || note === originalNote || !mode) return;
        if (!isLoggedIn) return; // 訪客不自動儲存草稿

        const timer = setTimeout(async () => {
            // 登入用戶：存 Server Draft
            try {
                await fetchWithAuth(`/api/devotional-notes/draft/${devotionalDate}`, {
                    method: 'PUT',
                    body: JSON.stringify({ note })
                });
                console.log('💾 [Draft] Auto-saved');
            } catch (err) {
                console.error('Draft auto-save failed:', err);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [note, originalNote, devotionalDate, mode, isLoggedIn]);

    const hasChanges = note !== originalNote;

    const [showAuthModal, setShowAuthModal] = useState(false);

    // 處理按鈕點擊
    const handleButtonClick = () => {
        if (!isLoggedIn) {
            setShowAuthModal(true);
            return;
        }
        setIsOpen(true);
    };

    // 關閉
    const handleClose = () => {
        if (hasChanges && mode) {
            if (!confirm('您有未儲存的變更，確定要關閉嗎？')) {
                return;
            }
        }
        setIsOpen(false);
        setMode(null);
    };

    // 浮動按鈕
    const buttonContent = (
        <button
            onClick={handleButtonClick}
            className={`
                ${isInHeader
                    ? 'p-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors'
                    : 'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95'
                }
                flex items-center justify-center
            `}
            title="靈修筆記"
        >
            <PenLine size={isInHeader ? 20 : 24} />
            {hasChanges && !isInHeader && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
        </button>
    );

    return (
        <>
            {buttonContent}

            {/* 筆記視窗 */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden m-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
                            <div>
                                <h3 className="text-lg font-bold text-stone-800">靈修筆記</h3>
                                <p className="text-sm text-stone-500">{devotionalDate}</p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-stone-200 rounded-full transition-colors"
                            >
                                <X size={20} className="text-stone-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-5 overflow-auto">
                            {loading ? (
                                <div className="flex items-center justify-center h-40 text-stone-400">
                                    <Loader2 className="animate-spin mr-2" />
                                    載入中...
                                </div>
                            ) : hasExistingNote && mode === null ? (
                                /* 模式選擇畫面 */
                                <div className="space-y-4">
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                        <p className="text-amber-800 font-medium mb-2">✏️ 您今日已有筆記：</p>
                                        <div className="bg-white rounded-lg p-3 text-sm text-stone-600 max-h-32 overflow-y-auto whitespace-pre-wrap border border-amber-100">
                                            {originalNote.length > 200 ? originalNote.substring(0, 200) + '...' : originalNote}
                                        </div>
                                    </div>

                                    <p className="text-stone-600 font-medium">📌 您想要：</p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <button
                                            onClick={() => selectMode('edit')}
                                            className="flex items-center gap-3 p-4 bg-white border-2 border-stone-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                <Edit3 size={20} className="text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-stone-800">編輯原有筆記</p>
                                                <p className="text-sm text-stone-500">修改或重寫內容</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => selectMode('append')}
                                            className="flex items-center gap-3 p-4 bg-white border-2 border-stone-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-all text-left"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                                <Plus size={20} className="text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-stone-800">追加新內容</p>
                                                <p className="text-sm text-stone-500">保留舊筆記，在下方新增</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* 編輯畫面 */
                                <>
                                    {mode === 'append' && (
                                        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                                            ✨ 追加模式：新內容將添加在原有筆記下方
                                        </div>
                                    )}

                                    <textarea
                                        ref={textareaRef}
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                        placeholder="在這裡寫下您的靈修心得、感動或禱告..."
                                        className="w-full h-64 p-4 border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-700 leading-relaxed"
                                    />

                                    {error && (
                                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
                                            <AlertTriangle size={16} />
                                            {error}
                                        </div>
                                    )}
                                    {successMsg && (
                                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
                                            {successMsg}
                                        </div>
                                    )}

                                    {!isLoggedIn && (
                                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-center gap-2">
                                            <AlertTriangle size={16} />
                                            您目前以遊客身份使用，筆記僅儲存於本機。
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer - 只在編輯模式顯示 */}
                        {mode && (
                            <div className="px-5 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {hasExistingNote && (
                                        <button
                                            onClick={() => setMode(null)}
                                            className="text-sm text-stone-500 hover:text-stone-700 underline"
                                        >
                                            ← 返回選擇
                                        </button>
                                    )}
                                    <span className="text-xs text-stone-400">
                                        {hasChanges ? '有未儲存的變更' : '已儲存'}
                                    </span>
                                </div>
                                <button
                                    onClick={saveNote}
                                    disabled={saving || !hasChanges}
                                    className={`
                                        flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all
                                        ${hasChanges
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg active:scale-95'
                                            : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                                        }
                                    `}
                                >
                                    {saving ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    {saving ? '儲存中...' : (hasExistingNote ? '更新' : '儲存')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <AuthModal 
                isOpen={showAuthModal} 
                onClose={() => setShowAuthModal(false)} 
                onLoginSuccess={() => {
                    setShowAuthModal(false);
                    setIsOpen(true);
                }} 
            />
        </>
    );
}
