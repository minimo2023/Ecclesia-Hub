import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Calendar, CheckCircle2, Save } from 'lucide-react';
import DevotionCard from './components/DevotionCard';
import { fetchDevotionalText } from '../../services/AIService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../shared/components/Toast';
import AuthModal from '../auth/AuthModal';
import { useDevotionalReadAloud } from './useDevotionalReadAloud';
/**
 * 靈修日誌主頁面 - 雙欄設計 (左側 2/3 靈修內容，右側 1/3 回應筆記)
 */
export default function DevotionPage({ onBack, onRequestLogin }) {
    const { getToken, isLoggedIn, refreshUser } = useAuth();
    const { addToast } = useToast();
    const [devotion, setDevotion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fontSize, setFontSize] = useState(localStorage.getItem('bible_millionaire_font_size') || 'medium');
    const [mobileTab, setMobileTab] = useState('article');
    const devotionalReadAloud = useDevotionalReadAloud(devotion);

    // Notes states
    const [noteRemind, setNoteRemind] = useState('');
    const [noteRespond, setNoteRespond] = useState('');
    const [notePrayer, setNotePrayer] = useState('');
    const [lastSaved, setLastSaved] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDraftSaving, setIsDraftSaving] = useState(false);
    const [hasCheckedIn, setHasCheckedIn] = useState(false);
    const [isExistingNote, setIsExistingNote] = useState(false);
    const [showRegisterInvite, setShowRegisterInvite] = useState(false);
    const autoDraftTimer = useRef(null);
    const currentDate = useRef(null);

    // Resizable Split Pane states - 優先從 localStorage 讀取歷史設定比例
    const [leftWidth, setLeftWidth] = useState(() => {
        const savedRatio = localStorage.getItem('bible_millionaire_devotion_split_ratio');
        if (savedRatio) {
            const num = parseFloat(savedRatio);
            return (!isNaN(num) && num >= 45 && num <= 75) ? num : 66;
        }
        return 66;
    });
    const [isDragging, setIsDragging] = useState(false);
    const [isLargeScreen, setIsLargeScreen] = useState(window.innerWidth >= 1024);
    const containerRef = useRef(null);

    // 監聽視窗 resize 以決定是否套用分欄寬度
    useEffect(() => {
        const handleResize = () => {
            setIsLargeScreen(window.innerWidth >= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    // 拖曳處理 - 流暢度優化與 body 樣式注入
    useEffect(() => {
        if (!isDragging) return;

        // 拖曳開始，為整個 body 強制注入游標與防反藍選取樣式
        const originalCursor = document.body.style.cursor;
        const originalUserSelect = document.body.style.userSelect;
        const originalWebkitSelect = document.body.style.webkitUserSelect;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        // 追蹤拖曳過程的最新比例值，以便在 mouseup 時寫入 localStorage
        let currentRatio = leftWidth;

        const handleMouseMove = (e) => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const relativeX = e.clientX - containerRect.left;
            let percentage = (relativeX / containerRect.width) * 100;
            
            // 限制拖曳範圍在 45% 到 75% 之間
            if (percentage < 45) percentage = 45;
            if (percentage > 75) percentage = 75;
            
            currentRatio = percentage;
            setLeftWidth(percentage);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // 持久化儲存偏好的比例
            localStorage.setItem('bible_millionaire_devotion_split_ratio', currentRatio.toString());
            
            // 還原 body 樣式
            document.body.style.cursor = originalCursor;
            document.body.style.userSelect = originalUserSelect;
            document.body.style.webkitUserSelect = originalWebkitSelect;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // 元件卸載時或 dragging 結束時，確保還原 body 樣式
            document.body.style.cursor = originalCursor;
            document.body.style.userSelect = originalUserSelect;
            document.body.style.webkitUserSelect = originalWebkitSelect;
        };
    }, [isDragging]);

    // 監聽字體大小變更
    useEffect(() => {
        const handleStorageChange = () => {
            setFontSize(localStorage.getItem('bible_millionaire_font_size') || 'medium');
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);



    const getContainerWidth = () => {
        switch (fontSize) {
            case 'large': return 'max-w-[1600px]';
            case 'extra-large': return 'max-w-[1920px]';
            default: return 'max-w-[1400px]';
        }
    };

    // 將三欄筆記組合成結構化純文字（會員中心可正常顯示）
    const buildNoteText = (remind, respond, prayer) => {
        const parts = [];
        if (remind.trim()) parts.push(`📖 今天經文提醒我：\n${remind.trim()}`);
        if (respond.trim()) parts.push(`🙋 我需要回應神：\n${respond.trim()}`);
        if (prayer.trim()) parts.push(`🙏 今天的禱告：\n${prayer.trim()}`);
        return parts.join('\n\n');
    };

    // 清洗 AI 回傳的日期，統一格式化為當地時間的 YYYY-MM-DD
    const cleanDateString = (dateInput) => {
        if (!dateInput) return new Date().toISOString().split('T')[0];
        try {
            const dateObj = new Date(dateInput);
            if (isNaN(dateObj.getTime())) {
                return String(dateInput).split('T')[0].substring(0, 10);
            }
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch {
            return String(dateInput).split('T')[0].substring(0, 10);
        }
    };


    // 從純文字解析回三欄（向前相容舊格式）
    const parseNoteText = (text) => {
        if (!text) return { remind: '', respond: '', prayer: '' };
        // 新格式：用標記拆解
        const remindMatch = text.match(/📖 今天經文提醒我：\n([\s\S]*?)(?=🙋|🙏|$)/);
        const respondMatch = text.match(/🙋 我需要回應神：\n([\s\S]*?)(?=📖|🙏|$)/);
        const prayerMatch = text.match(/🙏 今天的禱告：\n([\s\S]*?)(?=📖|🙋|$)/);
        if (remindMatch || respondMatch || prayerMatch) {
            return {
                remind: (remindMatch?.[1] || '').trim(),
                respond: (respondMatch?.[1] || '').trim(),
                prayer: (prayerMatch?.[1] || '').trim(),
            };
        }
        // 舊格式（純字串）：全放到「提醒」
        return { remind: text, respond: '', prayer: '' };
    };

    // 讀取筆記
    const fetchNotes = async (dateStr) => {
        if (!isLoggedIn) return;
        try {
            const token = getToken();
            // 先嘗試讀取草稿，再讀取正式筆記
            const [noteRes, draftRes] = await Promise.all([
                fetch(`/api/devotional-notes/${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ note: null })),
                fetch(`/api/devotional-notes/draft/${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ draft: null }))
            ]);

            // 草稿優先（較新），否則用正式筆記
            const rawText = draftRes?.draft || noteRes?.note || '';
            const parsed = parseNoteText(rawText);
            setNoteRemind(parsed.remind);
            setNoteRespond(parsed.respond);
            setNotePrayer(parsed.prayer);

            // 是否已經有正式儲存過的筆記紀錄
            setIsExistingNote(!!(noteRes?.note && noteRes.note.trim()));

            // 設定是否簽到過
            if (noteRes && noteRes.success) {
                setHasCheckedIn(!!noteRes.hasCheckedIn);
            }
        } catch (err) {
            console.error('Fetch notes failed', err);
        }
    };

    // 自動草稿儲存（登入狀態下 debounce 1.5s）
    const saveDraft = async (remind, respond, prayer) => {
        if (!isLoggedIn || !currentDate.current) return;
        setIsDraftSaving(true);
        try {
            const token = getToken();
            const noteText = buildNoteText(remind, respond, prayer);
            await fetch(`/api/devotional-notes/draft/${currentDate.current}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ note: noteText })
            });
        } catch (err) {
            console.error('Auto-draft failed', err);
        } finally {
            setIsDraftSaving(false);
        }
    };

    // 任一筆記欄位變動時觸發 auto-draft
    const handleNoteChange = (field, value) => {
        if (field === 'remind') setNoteRemind(value);
        if (field === 'respond') setNoteRespond(value);
        if (field === 'prayer') setNotePrayer(value);

        if (!isLoggedIn) return;
        // 取消舊的 timer，重新計時
        if (autoDraftTimer.current) clearTimeout(autoDraftTimer.current);
        autoDraftTimer.current = setTimeout(() => {
            const remind = field === 'remind' ? value : noteRemind;
            const respond = field === 'respond' ? value : noteRespond;
            const prayer = field === 'prayer' ? value : notePrayer;
            saveDraft(remind, respond, prayer);
        }, 1500);
    };

    // 儲存正式筆記
    const saveNote = async () => {
        if (!isLoggedIn) {
            // 訪客不持久儲存筆記，引導登入
            setShowRegisterInvite(true);
            return false;
        }
        setIsSaving(true);
        try {
            const noteText = buildNoteText(noteRemind, noteRespond, notePrayer);
            const token = getToken();
            const dateStr = currentDate.current || cleanDateString(null);
            const res = await fetch(`/api/devotional-notes/${dateStr}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ note: noteText })
            });
            const data = await res.json();
            if (data.success) {
                setLastSaved(new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
                setIsExistingNote(true);
                
                // 儲存筆記成功，給予明確的溫馨提示回饋
                if (data.coinsAwarded > 0) {
                    addToast(`🎉 首次儲存今日筆記！金幣 +${data.coinsAwarded}`, 'success');
                    refreshUser();
                } else {
                    addToast('✅ 筆記已成功更新儲存！', 'success');
                }

                // 儲存成功後刪除草稿
                const token2 = getToken();
                await fetch(`/api/devotional-notes/draft/${dateStr}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token2}` }
                }).catch(() => {});
                return true;
            }
            return false;
        } catch (err) {
            console.error('Save note failed', err);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    // 完成今日靈修：儲存正式筆記 + 簽到領金幣 + 返回
    const handleCompleteDevotion = async () => {
        if (!isLoggedIn) {
            // 訪客不持久儲存筆記，引導登入
            setShowRegisterInvite(true);
            return;
        }
        setIsSaving(true);
        try {
            const noteText = buildNoteText(noteRemind, noteRespond, notePrayer);
            const token = getToken();
            const dateStr = currentDate.current || cleanDateString(null);
            
            // 1. 儲存正式筆記 (檢查是否有筆記金幣回饋)
            const res = await fetch(`/api/devotional-notes/${dateStr}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ note: noteText })
            });
            const data = await res.json();
            
            if (data.success) {
                setLastSaved(new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
                setIsExistingNote(true);
                
                let totalCoins = 0;
                let noteCoins = 0;
                if (data.coinsAwarded > 0) {
                    totalCoins += data.coinsAwarded; // 筆記首儲金幣 (+2)
                    noteCoins = data.coinsAwarded;
                }
                
                // 2. 儲存成功後刪除草稿
                await fetch(`/api/devotional-notes/draft/${dateStr}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(() => {});

                // 3. 每日簽到領金幣並解鎖靈修歷史
                const checkinRes = await fetch('/api/devotional-notes/checkin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                const checkinData = await checkinRes.json();
                
                setHasCheckedIn(true);
                
                let checkinCoins = 0;
                if (checkinRes.ok && checkinData.success && !checkinData.alreadyCheckedIn && checkinData.coinsAwarded > 0) {
                    totalCoins += checkinData.coinsAwarded; // 簽到打卡金幣 (+1)
                    checkinCoins = checkinData.coinsAwarded;
                }
                
                let delayMs = 1200;
                if (totalCoins > 0) {
                    const details = [];
                    if (noteCoins > 0) details.push(`筆記 +${noteCoins}`);
                    if (checkinCoins > 0) details.push(`打卡 +${checkinCoins}`);
                    
                    addToast(`🎉 完成今日靈修！金幣總計 +${totalCoins} (${details.join(' | ')})`, 'success');
                    refreshUser();
                    delayMs = 2800; // 延長停留時間以利閱讀
                } else {
                    addToast('🎉 今日靈修已完成！', 'success');
                }

                // 4. 延遲後返回首頁
                setTimeout(() => {
                    onBack();
                }, delayMs);
            } else {
                alert(data.error || '儲存筆記失敗');
            }
        } catch (err) {
            console.error('Complete devotion failed', err);
            alert('完成今日靈修失敗，請稍後再試');
        } finally {
            setIsSaving(false);
        }
    };

    // 一般用戶：讀取靈修內容
    const fetchDevotion = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchDevotionalText();
            setDevotion(data);
            const dateStr = cleanDateString(data?.date);
            currentDate.current = dateStr;
            if (isLoggedIn) {
                fetchNotes(dateStr);
            } else {
                // 訪客：草稿不持久，每次重新瀏覽都是空白
                setNoteRemind('');
                setNoteRespond('');
                setNotePrayer('');
                setIsExistingNote(false);
                setHasCheckedIn(false);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || '今日靈修內容尚未生成');
        } finally {
            setLoading(false);
        }
    };
    // 清除 auto-draft timer
    useEffect(() => {
        return () => {
            if (autoDraftTimer.current) clearTimeout(autoDraftTimer.current);
        };
    }, []);

    // 監聽 isLoggedIn 與登入變動，確保身分切換時 (例如訪客登入成功回來) 立刻重新整理
    useEffect(() => {
        fetchDevotion();
    }, [isLoggedIn]);

    return (
        <div className="h-[var(--app-height)] bg-[#FDFBF7] text-stone-800 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-10 shrink-0">
                <div className={`${getContainerWidth()} mx-auto px-6 py-4 flex items-center gap-4`}>
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500 hover:text-stone-800"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold flex items-center gap-2 text-stone-800">
                            <Calendar className="w-5 h-5 text-amber-500" />
                            每日靈修日誌
                        </h1>
                        <p className="text-stone-400 text-sm">
                            {new Date().toLocaleDateString('zh-TW')}
                        </p>
                    </div>




                </div>
            </div>

            {/* Content - 雙欄佈局：全寬、兩欄各自獨立捲動、支援拖拉比例 */}
            <div 
                ref={containerRef}
                className={`flex-1 overflow-hidden w-full flex flex-col lg:flex-row py-6 px-0 ${isDragging ? 'select-none' : ''}`}
            >
                {error ? (
                    <div className="bg-rose-50 border border-rose-100 p-8 rounded-2xl text-center mx-6">
                        <p className="text-rose-600 mb-4 font-medium">{error}</p>
                        <button
                            onClick={fetchDevotion}
                            className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full transition-colors shadow-sm"
                        >
                            重試
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="lg:hidden shrink-0 w-full px-4 pb-4">
                            <div className="grid grid-cols-2 rounded-2xl bg-stone-100 p-1 border border-stone-200">
                                <button
                                    type="button"
                                    onClick={() => setMobileTab('article')}
                                    className={`py-2.5 rounded-xl text-sm font-black transition-all ${
                                        mobileTab === 'article'
                                            ? 'bg-white text-stone-900 shadow-sm'
                                            : 'text-stone-500'
                                    }`}
                                >
                                    靈修短文
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMobileTab('notes')}
                                    className={`py-2.5 rounded-xl text-sm font-black transition-all ${
                                        mobileTab === 'notes'
                                            ? 'bg-white text-stone-900 shadow-sm'
                                            : 'text-stone-500'
                                    }`}
                                >
                                    我的筆記
                                </button>
                            </div>
                        </div>
                        {/* 左側 - 靈修內容：有內部捲動，內容本身置中 */}
                        <div 
                            className={`${mobileTab === 'article' ? 'block' : 'hidden'} lg:block h-full overflow-y-auto px-6 w-full lg:shrink-0`}
                            style={isLargeScreen ? { width: `calc(${leftWidth}% - 5px)` } : {}}
                        >
                            <div className="max-w-[1008px] mx-auto">
                                <DevotionCard
                                    devotionalContent={devotion}
                                    isLoading={loading}
                                    fontSize={fontSize}
                                    readAloudController={devotionalReadAloud}
                                />
                                <div className="lg:hidden pb-6">
                                    <button
                                        type="button"
                                        onClick={() => setMobileTab('notes')}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-sm"
                                    >
                                        寫回應筆記
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Resize 分欄線拖拉條 */}
                        <div 
                            onMouseDown={handleMouseDown}
                            className={`hidden lg:block w-3.5 cursor-col-resize group transition-all duration-200 relative shrink-0 z-20 ${
                                isDragging ? 'bg-amber-100/30' : 'hover:bg-amber-50/50 bg-transparent'
                            }`}
                            title="左右拖拉可調整分欄比例"
                        >
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ease-out ${
                                isDragging 
                                ? 'w-[4px] h-16 bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]' 
                                : 'w-[3px] h-12 bg-stone-300 group-hover:bg-amber-500 group-hover:w-[4px] group-hover:h-16 group-hover:shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                            }`} />
                        </div>

                        {/* 右側 - 筆記欄：支援拖拉寬度，有自己的捲動 */}
                        <div 
                            className={`${mobileTab === 'notes' ? 'block' : 'hidden'} lg:block w-full shrink-0 h-full overflow-y-auto px-4 lg:px-6 border-t lg:border-t-0 lg:border-l border-stone-100`}
                            style={isLargeScreen ? { width: `calc(${100 - leftWidth}% - 3px)` } : {}}
                        >
                            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                                        <span className="w-1 h-6 bg-indigo-400 rounded-full inline-block"></span>
                                        我的回應筆記
                                    </h2>
                                    {isDraftSaving && (
                                        <span className="text-xs text-indigo-400 animate-pulse font-medium">草稿自動暫存中...</span>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* 筆記 1：提醒 */}
                                    <div>
                                        <label className="block text-sm font-bold text-stone-600 mb-1.5">
                                            📖 今天經文提醒我：
                                        </label>
                                        <textarea
                                            value={noteRemind}
                                            onChange={(e) => handleNoteChange('remind', e.target.value)}
                                            placeholder="寫下經文對你的提醒..."
                                            rows={4}
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all resize-none text-stone-700 placeholder-stone-400 text-sm leading-relaxed"
                                        />
                                    </div>

                                    {/* 筆記 2：回應 */}
                                    <div>
                                        <label className="block text-sm font-bold text-stone-600 mb-1.5">
                                            🙋 我需要回應神：
                                        </label>
                                        <textarea
                                            value={noteRespond}
                                            onChange={(e) => handleNoteChange('respond', e.target.value)}
                                            placeholder="寫下你的決心或今日行動..."
                                            rows={4}
                                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all resize-none text-stone-700 placeholder-stone-400 text-sm leading-relaxed"
                                        />
                                    </div>

                                    {/* 筆記 3：禱告 */}
                                    <div>
                                        <label className="block text-sm font-bold text-stone-600 mb-1.5">
                                            🙏 今天的禱告：
                                        </label>
                                        <textarea
                                            value={notePrayer}
                                            onChange={(e) => handleNoteChange('prayer', e.target.value)}
                                            placeholder="寫下你的禱告..."
                                            rows={5}
                                            className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all resize-none text-stone-700 placeholder-stone-400 text-sm leading-relaxed"
                                        />
                                    </div>
                                </div>

                                {/* 儲存按鈕 */}
                                <div className="mt-5 space-y-3">
                                    <button
                                        onClick={saveNote}
                                        disabled={isSaving}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-sm"
                                    >
                                        <Save className="w-4 h-4" />
                                        {isSaving ? '儲存中...' : isExistingNote ? '更新儲存筆記' : '儲存筆記'}
                                    </button>
                                    <button
                                        onClick={handleCompleteDevotion}
                                        disabled={isSaving || hasCheckedIn}
                                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-sm ${
                                            hasCheckedIn 
                                            ? 'bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        }`}
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        {isSaving ? '處理中...' : hasCheckedIn ? '今日靈修已完成' : '完成今日靈修'}
                                    </button>
                                    {lastSaved && (
                                        <p className="text-center text-xs text-stone-400">上次儲存：{lastSaved}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                    </>
                )}
            </div>

            {/* 邀請註冊引導對話框 (替換為 AuthModal) */}
            <AuthModal 
                isOpen={showRegisterInvite} 
                onClose={() => setShowRegisterInvite(false)} 
                onLoginSuccess={() => {
                    setShowRegisterInvite(false);
                    // Optionally trigger save here if we want auto-save after login
                }} 
            />
        </div>
    );
}
