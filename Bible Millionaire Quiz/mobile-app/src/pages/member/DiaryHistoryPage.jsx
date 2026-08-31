import React, { useCallback, useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, PenLine, BookOpen, Trash2, X, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../src/contexts/AuthContext';
import apiClient from '../../services/apiClient';

function parseNoteText(text) {
    if (!text) return { remind: '', respond: '', prayer: '' };
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
    return { remind: text, respond: '', prayer: '' };
}

function buildNoteText(remind, respond, prayer) {
    const parts = [];
    if (remind.trim()) parts.push(`📖 今天經文提醒我：\n${remind.trim()}`);
    if (respond.trim()) parts.push(`🙋 我需要回應神：\n${respond.trim()}`);
    if (prayer.trim()) parts.push(`🙏 今天的禱告：\n${prayer.trim()}`);
    return parts.join('\n\n');
}

export default function DiaryHistoryPage({ isTab = false }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    
    const [activeTab, setActiveTab] = useState('notes'); // 'notes' | 'history'
    
    // Notes State
    const [notes, setNotes] = useState([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [editingNoteDate, setEditingNoteDate] = useState(null);

    // History State
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    
    const loadNotes = useCallback(async () => {
        setNotesLoading(true);
        try {
            const res = await apiClient.get('/devotional-notes/list');
            const data = res.data;
            if (data.success) {
                setNotes(Array.isArray(data.notes) ? data.notes : []);
            }
        } catch (error) {}
        setNotesLoading(false);
    }, []);

    const deleteNote = async (date) => {
        if (!window.confirm('確定要刪除這則筆記嗎？')) return;
        try {
            const res = await apiClient.delete(`/devotional-notes/${encodeURIComponent(date)}`);
            const data = res.data;
            if (data.success) {
                loadNotes();
            } else {
                alert('筆記刪除失敗，請稍後再試。');
            }
        } catch (error) {
            alert('筆記刪除失敗，請稍後再試。');
        }
    };

    const loadHistory = useCallback(async (page) => {
        setHistoryLoading(true);
        try {
            const res = await apiClient.get(`/content/devotional/history?page=${page}&limit=10`);
            const data = res.data;
            if (data.success) {
                setHistory(Array.isArray(data.history) ? data.history : []);
                if (data.pagination) setHistoryTotalPages(data.pagination.totalPages || 1);
            }
        } catch (error) {}
        setHistoryLoading(false);
    }, []);

    useEffect(() => {
        if (!user) return;
        if (activeTab === 'notes') {
            loadNotes();
        } else {
            loadHistory(historyPage);
        }
    }, [user, activeTab, historyPage, loadHistory, loadNotes]);

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(Number(timestamp));
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
    };

    return (
        <div className={`app-page flex flex-col ${isTab ? 'h-full' : 'flex-1 pb-safe animate-in slide-in-from-right-full duration-300'}`}>
            {/* Header */}
            <header className="app-topbar flex h-auto flex-col px-4 pt-2 z-10 sticky top-0">
                {!isTab && (
                    <div className="flex h-12 items-center">
                        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-full transition">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <h1 className="flex-1 text-base font-black text-slate-900 tracking-wider text-center mr-6">靈修與筆記</h1>
                    </div>
                )}
                
                {/* Tabs */}
                <div className={`flex gap-4 px-2 pb-0 ${isTab ? 'mt-0' : 'mt-2'}`}>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={`flex-1 pb-3 text-sm font-black transition-all border-b-2 ${activeTab === 'notes' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}
                    >
                        <div className="flex items-center justify-center gap-1.5">
                            <PenLine size={16} /> 我的筆記
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 pb-3 text-sm font-black transition-all border-b-2 ${activeTab === 'history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400'}`}
                    >
                        <div className="flex items-center justify-center gap-1.5">
                            <BookOpen size={16} /> 閱讀紀錄
                        </div>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'notes' && (
                    <div className="space-y-4">
                        {notesLoading ? (
                            <div className="text-center py-10 text-slate-400 text-sm font-bold">正在載入</div>
                        ) : notes.length === 0 ? (
                            <div className="app-card mt-4 py-12 text-center">
                                <PenLine className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                                <p className="text-slate-500 font-bold">還沒有靈修筆記</p>
                            </div>
                        ) : (
                            notes.map((note, idx) => {
                                // 強制轉回 YYYY-MM-DD 格式
                                let dateStr = note.date;
                                if (dateStr.includes('T')) {
                                    dateStr = new Date(dateStr).toLocaleDateString('en-CA');
                                }
                                return (
                                    <div key={idx} className="app-card overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 bg-amber-50/50 border-b border-amber-100/50">
                                            <p className="font-black text-amber-900 text-xs tracking-wide">
                                                {dateStr}
                                            </p>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setEditingNoteDate(dateStr)} className="p-1.5 text-amber-600/70 hover:bg-amber-100/50 rounded-full">
                                                    <PenLine size={14} />
                                                </button>
                                                <button onClick={() => deleteNote(dateStr)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-full">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <p className="text-slate-600 text-xs leading-relaxed line-clamp-3 whitespace-pre-wrap">
                                                {note.note.replace(/📖 今天經文提醒我：|🙋 我需要回應神：|🙏 今天的禱告：/g, '').replace(/\(未填寫\)/g, '（未填寫）').replace(/^\s+/gm, '').trim()}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-3">
                        {historyLoading ? (
                            <div className="text-center py-10 text-slate-400 text-sm font-bold">正在載入</div>
                        ) : history.length === 0 ? (
                            <div className="app-card mt-4 py-12 text-center">
                                <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                                <p className="text-slate-500 font-bold">還沒有閱讀紀錄</p>
                            </div>
                        ) : (
                            <>
                                {history.map((item, idx) => (
                                    <div key={idx} className="app-card flex items-center justify-between gap-3 p-4">
                                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{item.date.split('-')[1]}月</span>
                                            <span className="text-lg font-black text-indigo-600 leading-none">{item.date.split('-')[2]}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-slate-800 text-sm truncate">{item.theme || '每日靈修'}</p>
                                            <p className="text-[10px] font-bold text-indigo-400 mt-0.5 truncate">{item.author ? `作者：${item.author}` : ''}</p>
                                            <p className="text-xs text-slate-400 mt-0.5 truncate">{item.scriptureReference}</p>
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-300 shrink-0">
                                            {formatDate(item.generated_at)}
                                        </div>
                                    </div>
                                ))}

                                {historyTotalPages > 1 && (
                                    <div className="flex justify-center items-center gap-4 py-4">
                                        <button onClick={() => setHistoryPage(p => p - 1)} disabled={historyPage === 1} className="p-2 bg-white border border-slate-200 rounded-full disabled:opacity-50 shadow-sm">
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs font-black text-slate-400">{historyPage} / {historyTotalPages}</span>
                                        <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage >= historyTotalPages} className="p-2 bg-white border border-slate-200 rounded-full disabled:opacity-50 shadow-sm">
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Modal Component Rendered Conditionally */}
            {editingNoteDate && (
                <MobileNoteEditor 
                    date={editingNoteDate} 
                    onClose={() => setEditingNoteDate(null)} 
                    onSaved={() => { setEditingNoteDate(null); loadNotes(); }} 
                />
            )}
        </div>
    );
}

function MobileNoteEditor({ date, onClose, onSaved }) {
    const [noteRemind, setNoteRemind] = useState('');
    const [noteRespond, setNoteRespond] = useState('');
    const [notePrayer, setNotePrayer] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadNote = async () => {
            setLoading(true);
            try {
                const res = await apiClient.get(`/devotional-notes/${date}`);
                const data = res.data;
                if (data.success) {
                    const parsed = parseNoteText(data.note || '');
                    setNoteRemind(parsed.remind); setNoteRespond(parsed.respond); setNotePrayer(parsed.prayer);
                }
            } catch (err) {}
            setLoading(false);
        };
        loadNote();
    }, [date]);

    const saveNote = async () => {
        setSaving(true);
        try {
            const noteText = buildNoteText(noteRemind, noteRespond, notePrayer);
            const res = await apiClient.post(`/devotional-notes/${date}`, { note: noteText });
            const data = res.data;
            if (data.success) onSaved();
        } catch (err) {}
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in slide-in-from-bottom-full duration-300">
            <div className="app-topbar flex items-center justify-between px-4 py-3 pt-safe">
                <button onClick={onClose} className="p-2 -ml-2 text-slate-400">
                    <X size={20} />
                </button>
                <div className="text-center">
                    <h3 className="text-sm font-black text-slate-800">編輯靈修筆記</h3>
                    <p className="text-[10px] text-slate-400 font-bold">{date}</p>
                </div>
                <button onClick={saveNote} disabled={saving} className="text-indigo-600 font-black text-sm px-2 disabled:opacity-50">
                    儲存
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {loading ? (
                    <div className="text-center py-10 text-slate-400">正在載入</div>
                ) : (
                    <>
                        <div className="app-card p-3">
                            <label className="block text-[10px] font-black text-slate-400 mb-2">📖 今天經文提醒我</label>
                            <textarea value={noteRemind} onChange={e => setNoteRemind(e.target.value)} rows={3} className="w-full text-sm outline-none resize-none" placeholder="寫下這段經文帶來的提醒…" />
                        </div>
                        <div className="app-card p-3">
                            <label className="block text-[10px] font-black text-indigo-400 mb-2">🙋 我需要回應神</label>
                            <textarea value={noteRespond} onChange={e => setNoteRespond(e.target.value)} rows={3} className="w-full text-sm outline-none resize-none" placeholder="寫下決心或行動…" />
                        </div>
                        <div className="app-card p-3">
                            <label className="block text-[10px] font-black text-amber-500 mb-2">🙏 今天的禱告</label>
                            <textarea value={notePrayer} onChange={e => setNotePrayer(e.target.value)} rows={4} className="w-full text-sm outline-none resize-none" placeholder="寫下禱告…" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
