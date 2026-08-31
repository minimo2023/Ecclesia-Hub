import React, { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../../../../src/contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { Loader2, CheckCircle2, Save } from 'lucide-react';

export default function DevotionNotes({ dateStr }) {
  const { isLoggedIn } = useAuth();
  
  const [noteRemind, setNoteRemind] = useState('');
  const [noteRespond, setNoteRespond] = useState('');
  const [notePrayer, setNotePrayer] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);

  const parseNote = useCallback((fullText) => {
    if (!fullText) return;
    const parts = fullText.split('\n\n');
    let r1 = '', r2 = '', r3 = '';

    parts.forEach(part => {
      if (part.includes('📖 今天經文提醒我：')) r1 = part.replace('📖 今天經文提醒我：\n', '').trim();
      else if (part.includes('🙋 我需要回應神：')) r2 = part.replace('🙋 我需要回應神：\n', '').trim();
      else if (part.includes('🙏 今天的禱告：')) r3 = part.replace('🙏 今天的禱告：\n', '').trim();
    });

    if (r1) setNoteRemind(r1);
    if (r2) setNoteRespond(r2);
    if (r3) setNotePrayer(r3);
  }, []);

  // Load existing note
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchNote = async () => {
      try {
        const response = await apiClient.get(`/devotional-notes/${dateStr}`);
        if (response.data.success && response.data.note) {
          parseNote(response.data.note.note || '');
          setCompleted(true);
        } else {
          // Check for draft if no completed note
          const draftRes = await apiClient.get(`/devotional-notes/draft/${dateStr}`);
          if (draftRes.data.success && draftRes.data.draft) {
            parseNote(draftRes.data.draft.note || '');
          }
        }
      } catch (err) {
        console.error('Fetch note error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, [isLoggedIn, dateStr, parseNote]);

  const buildNote = () => {
    return `📖 今天經文提醒我：\n${noteRemind || '（未填寫）'}\n\n🙋 我需要回應神：\n${noteRespond || '（未填寫）'}\n\n🙏 今天的禱告：\n${notePrayer || '（未填寫）'}`;
  };

  const handleSave = async () => {
    if (!isLoggedIn) {
      try {
        const guestNotes = JSON.parse(localStorage.getItem('guest_devotional_notes') || '{}');
        guestNotes[dateStr] = buildNote();
        localStorage.setItem('guest_devotional_notes', JSON.stringify(guestNotes));
        setLastSaved(new Date().toLocaleTimeString('zh-TW', {
          hour: '2-digit',
          minute: '2-digit'
        }));
        setError(null);
      } catch {
        setError('本機筆記儲存失敗，請稍後再試。');
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(`/devotional-notes/draft/${dateStr}`, {
        note: buildNote()
      });
      const now = new Date();
      setLastSaved(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch {
      setError('筆記儲存失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!isLoggedIn) {
      await handleSave();
      setCompleted(true);
      return;
    }
    if (!noteRemind && !noteRespond && !notePrayer) {
      setError('請至少填寫一個欄位。');
      return;
    }

    setCheckingIn(true);
    setError(null);
    try {
      await apiClient.post(`/devotional-notes/${dateStr}/complete`, {
        note: buildNote()
      });
      setCompleted(true);
    } catch {
      setError('暫時無法完成今日靈修，請稍後再試。');
    } finally {
      setCheckingIn(false);
    }
  };

  if (isLoggedIn && loading) {
    return (
      <div className="flex-1 flex justify-center items-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 safe-area-pb">
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900 mb-1">我的回應筆記</h2>
        {!isLoggedIn ? (
          <p className="text-sm text-amber-700 font-bold">訪客筆記只會儲存在這台裝置，也不會獲得會員金幣。</p>
        ) : completed ? (
          <p className="text-sm text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> 今日已完成靈修
          </p>
        ) : (
          <p className="text-xs text-slate-400 font-bold">
            {lastSaved ? `上次儲存於 ${lastSaved}` : '草稿尚未儲存'}
          </p>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-black text-slate-700 mb-2">
            📖 今天經文提醒我
          </label>
          <textarea
            value={noteRemind}
            onChange={(e) => setNoteRemind(e.target.value)}
            disabled={completed}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-shadow"
            rows={4}
            placeholder="記錄這段經文帶來的提醒…"
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700 mb-2">
            🙋 我需要回應神
          </label>
          <textarea
            value={noteRespond}
            onChange={(e) => setNoteRespond(e.target.value)}
            disabled={completed}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-shadow"
            rows={4}
            placeholder="寫下想採取的行動或改變…"
          />
        </div>

        <div>
          <label className="block text-sm font-black text-amber-700 mb-2">
            🙏 今天的禱告
          </label>
          <textarea
            value={notePrayer}
            onChange={(e) => setNotePrayer(e.target.value)}
            disabled={completed}
            className="w-full rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm font-medium text-amber-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none transition-shadow"
            rows={5}
            placeholder="寫下祈求與感謝…"
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 text-center text-sm font-bold text-red-500">{error}</p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {!completed && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl border-2 border-indigo-100 bg-indigo-50 text-indigo-600 font-black text-sm active:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存草稿
          </button>
        )}

        <button
          onClick={handleComplete}
          disabled={checkingIn || completed}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-sm active:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors shadow-sm"
        >
          {checkingIn ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : completed ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : null}
          {completed ? '已完成今日靈修' : '完成今日靈修'}
        </button>
      </div>
    </div>
  );
}
