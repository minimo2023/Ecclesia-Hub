import React, { useState, useEffect } from 'react';
import { PenLine, Trash2, ArrowLeft, X, Save, BookOpen, HandHeart, HeartHandshake } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 解析筆記文字為三欄結構
 */
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

/**
 * 我的筆記組件 - 支援三欄顯示與編輯
 */
export default function MemberNotes({ onBack, hideHeader = false }) {
    const { user, getToken } = useAuth();
    const [notes, setNotes] = useState([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [editingNoteDate, setEditingNoteDate] = useState(null);



    useEffect(() => {
        if (user) loadNotes();
    }, [user]);

    const loadNotes = async () => {
        setNotesLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`/api/devotional-notes/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setNotes(Array.isArray(data.notes) ? data.notes : []);
            }
        } catch (error) {
            console.error('Failed to load notes:', error);
        } finally {
            setNotesLoading(false);
        }
    };

    const deleteNote = async (date) => {
        if (!confirm('確定要刪除這則筆記嗎？')) return;
        try {
            const token = getToken();
            const res = await fetch(`/api/devotional-notes/${date}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                loadNotes();
            } else {
                alert('刪除失敗');
            }
        } catch (error) {
            console.error('Delete note failed:', error);
            alert('刪除失敗');
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '無';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '無';
        return date.toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className={hideHeader ? "text-stone-800" : "min-h-screen bg-[#FDFBF7] text-stone-800"}>
            {/* Header */}
            {!hideHeader && (
                <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-10">
                    <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500 hover:text-stone-800"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                                ✍️ 我的靈修筆記
                            </h1>
                            <p className="text-stone-400 text-sm">共 {notes.length} 篇紀錄</p>
                        </div>
                    </div>
                </div>
            )}

            <div className={hideHeader ? "w-full py-2" : "max-w-4xl mx-auto px-4 py-8"}>
                {notesLoading ? (
                    <div className="text-center py-12 text-stone-400">載入中...</div>
                ) : notes.length === 0 ? (
                    <div className="text-center py-12 text-stone-400 bg-white rounded-2xl border border-stone-100 p-8">
                        <p className="text-lg">尚無筆記</p>
                        <p className="text-sm mt-2">在靈修時隨時記錄您的心得</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {notes.map((note, idx) => {
                            const parsed = parseNoteText(note.note);
                            const hasStructured = parsed.remind || parsed.respond || parsed.prayer;
                            return (
                                <div key={idx} className="bg-white rounded-2xl border border-stone-100 hover:border-amber-200 hover:shadow-md transition-all overflow-hidden">
                                    {/* 標題列 */}
                                    <div className={`flex items-center justify-between px-5 py-3 border-b border-stone-100 ${note.is_draft ? 'bg-stone-50/60' : 'bg-amber-50/60'}`}>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-stone-800">{note.date}</p>
                                            {note.is_draft && (
                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-stone-200 text-stone-600 rounded-md">
                                                    草稿
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setEditingNoteDate(note.date)}
                                                className="p-2 text-stone-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="編輯"
                                            >
                                                <PenLine size={16} />
                                            </button>
                                            <button
                                                onClick={() => deleteNote(note.date)}
                                                className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="刪除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 筆記內容 */}
                                    <div className="p-5">
                                        {hasStructured ? (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                {parsed.remind && (
                                                    <div className="bg-stone-50 rounded-xl p-4">
                                                        <p className="text-xs font-bold text-stone-500 mb-2 flex items-center gap-1">
                                                            📖 今天經文提醒我
                                                        </p>
                                                        <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                                                            {parsed.remind}
                                                        </p>
                                                    </div>
                                                )}
                                                {parsed.respond && (
                                                    <div className="bg-indigo-50/60 rounded-xl p-4">
                                                        <p className="text-xs font-bold text-indigo-500 mb-2 flex items-center gap-1">
                                                            🙋 我需要回應神
                                                        </p>
                                                        <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                                                            {parsed.respond}
                                                        </p>
                                                    </div>
                                                )}
                                                {parsed.prayer && (
                                                    <div className="bg-amber-50/80 rounded-xl p-4">
                                                        <p className="text-xs font-bold text-amber-600 mb-2 flex items-center gap-1">
                                                            🙏 今天的禱告
                                                        </p>
                                                        <p className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                                                            {parsed.prayer}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-stone-600 whitespace-pre-wrap text-[15px] leading-relaxed font-serif">
                                                {note.note?.length > 300 ? note.note.substring(0, 300) + '...' : note.note}
                                            </p>
                                        )}
                                        <p className="text-xs text-stone-400 mt-3 text-right">最後更新: {formatDate(note.updated_at)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Note Editor Modal */}
            {editingNoteDate && (
                <NoteEditorModal
                    date={editingNoteDate}
                    onClose={() => setEditingNoteDate(null)}
                    onSaved={() => {
                        setEditingNoteDate(null);
                        loadNotes();
                    }}
                />
            )}
        </div>
    );
}

// 三欄式筆記編輯器 Modal
function NoteEditorModal({ date, onClose, onSaved }) {
    const { getToken } = useAuth();
    const [noteRemind, setNoteRemind] = useState('');
    const [noteRespond, setNoteRespond] = useState('');
    const [notePrayer, setNotePrayer] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');



    useEffect(() => {
        loadNote();
    }, [date]);

    const loadNote = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`/api/devotional-notes/${date}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                const parsed = parseNoteText(data.note || '');
                setNoteRemind(parsed.remind);
                setNoteRespond(parsed.respond);
                setNotePrayer(parsed.prayer);
            }
        } catch {
            setError('載入失敗');
        } finally {
            setLoading(false);
        }
    };

    const saveNote = async () => {
        setSaving(true);
        setError('');
        try {
            const token = getToken();
            const noteText = buildNoteText(noteRemind, noteRespond, notePrayer);
            const res = await fetch(`/api/devotional-notes/${date}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ note: noteText })
            });
            const data = await res.json();
            if (data.success) {
                onSaved();
            } else {
                setError(data.error || '儲存失敗');
            }
        } catch {
            setError('儲存失敗');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-stone-800">✍️ 編輯靈修筆記</h3>
                        <p className="text-sm text-stone-500">{date}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                        <X size={20} className="text-stone-500" />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-stone-400">載入中...</div>
                    ) : (
                        <div className="space-y-5">
                            {/* 提醒 */}
                            <div>
                                <label className="block text-sm font-bold text-stone-600 mb-2">
                                    📖 今天經文提醒我：
                                </label>
                                <textarea
                                    value={noteRemind}
                                    onChange={e => setNoteRemind(e.target.value)}
                                    placeholder="寫下經文對你的提醒..."
                                    rows={4}
                                    className="w-full p-4 border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 text-stone-700 leading-relaxed font-serif bg-stone-50"
                                />
                            </div>

                            {/* 回應 */}
                            <div>
                                <label className="block text-sm font-bold text-stone-600 mb-2">
                                    🙋 我需要回應神：
                                </label>
                                <textarea
                                    value={noteRespond}
                                    onChange={e => setNoteRespond(e.target.value)}
                                    placeholder="寫下你的決心或今日行動..."
                                    rows={4}
                                    className="w-full p-4 border border-indigo-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 text-stone-700 leading-relaxed font-serif bg-indigo-50/50"
                                />
                            </div>

                            {/* 禱告 */}
                            <div>
                                <label className="block text-sm font-bold text-stone-600 mb-2">
                                    🙏 今天的禱告：
                                </label>
                                <textarea
                                    value={notePrayer}
                                    onChange={e => setNotePrayer(e.target.value)}
                                    placeholder="寫下你的禱告..."
                                    rows={5}
                                    className="w-full p-4 border border-amber-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-700 leading-relaxed font-serif bg-amber-50/60"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg transition-colors">
                        取消
                    </button>
                    <button
                        onClick={saveNote}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm"
                    >
                        <Save size={16} />
                        {saving ? '儲存中...' : '更新筆記'}
                    </button>
                </div>
            </div>
        </div>
    );
}
