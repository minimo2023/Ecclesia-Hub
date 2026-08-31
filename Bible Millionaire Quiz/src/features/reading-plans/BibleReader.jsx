import React, { useState, useEffect } from 'react';
import { ChevronLeft, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAchievements } from '../../hooks/useAchievements';

/**
 * 聖經閱讀器 (共用商業邏輯層)
 *
 * @param {string} scheduleId - 今日排程 ID（由路由或父層傳入）
 * @param {function} onNavigate - 導航回呼，完成後呼叫 'reading-plans'
 * @param {function} onBack - 返回上一層
 */
export default function BibleReader({ scheduleId, onNavigate, onBack }) {
  const { getToken } = useAuth();
  const { checkAchievements } = useAchievements();

  const [verses, setVerses] = useState([]);
  const [chapterTitle, setChapterTitle] = useState('約翰福音 第三章');
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('CUV_TRAD');
  const [availableVersions, setAvailableVersions] = useState([]);

  const [timer, setTimer] = useState(0);

  useEffect(() => {
    const fetchVerses = async () => {
      setLoading(true);
      setError(null);
      try {
        // 若有 scheduleId，嘗試從後端取得今日指定章節
        // 否則 fallback 到 John 3
        const url = scheduleId
          ? `/api/bible/reading-plans/schedule/${scheduleId}/verses?version=${selectedVersion}`
          : `/api/bible/fetch-local?book=John&chapter=3&version=${selectedVersion}`;

        const [res, versionsRes] = await Promise.all([
          fetch(url),
          fetch('/api/bible/versions')
        ]);
        
        const data = await res.json();
        const versionsData = await versionsRes.json();
        
        if (versionsData.versions) {
          setAvailableVersions(versionsData.versions);
        }

        let fetchedVerses = [];
        if (data.verses && data.verses.length > 0) {
          fetchedVerses = data.verses;
          if (data.chapterTitle) setChapterTitle(data.chapterTitle);
        } else {
          // 本地 DB 尚未填充時顯示示範經文
          fetchedVerses = [
            { verse: 16, text: '神愛世人，甚至將他的獨生子賜給他們，叫一切信他的，不至滅亡，反得永生。' },
            { verse: 17, text: '因為神差他的兒子降世，不是要定世人的罪，乃是要叫世人因他得救。' },
          ];
        }
        setVerses(fetchedVerses);
        
        // 設置計時器: 每節1秒 * 總節數
        const requiredSeconds = Math.ceil(fetchedVerses.reduce((count, verse) => (
          count + Math.max(1, Number(verse.verseEnd ?? verse.verse) - Number(verse.verseStart ?? verse.verse) + 1)
        ), 0));
        setTimer(requiredSeconds);
        
      } catch (e) {
        console.error('[BibleReader] Failed to fetch verses:', e);
        setError('無法載入經文，請稍後再試。');
      } finally {
        setLoading(false);
      }
    };

    fetchVerses();
  }, [scheduleId, selectedVersion]);

  // 計時器倒數邏輯
  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleComplete = async () => {
    if (completing || timer > 0) return;
    setCompleting(true);
    try {
      const token = getToken();
      const res = await fetch(
        `/api/bible/reading-plans/schedule/${scheduleId}/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Check achievements after completing reading plan
      checkAchievements({ gameMode: 'reading_plan' });

      // 觸發首頁進度刷新
      window.dispatchEvent(new CustomEvent('refresh-ai-wallet'));
      if (onNavigate) {
        onNavigate('reading-plans');
      }
    } catch (e) {
      console.error('[BibleReader] Failed to complete:', e);
      alert('暫時無法完成今日閱讀，請稍後再試。');
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 items-center">
      <div className="w-full max-w-2xl flex flex-col h-full relative md:bg-white md:shadow-2xl md:border-x md:border-slate-100 overflow-hidden">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100 shrink-0">
        <div className="flex h-14 items-center justify-between px-2">
          <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">今日閱讀</span>
            <span className="text-sm font-black text-slate-900">{chapterTitle.replace('第', '').replace('章', '').trim()}</span>
          </div>
          <div className="flex items-center">
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="text-xs font-bold text-indigo-600 bg-indigo-50 border-none rounded-full px-3 py-1.5 focus:ring-0 outline-none cursor-pointer"
            >
              {availableVersions.length > 0 ? availableVersions.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              )) : (
                <option value="CUV_TRAD">和合本</option>
              )}
            </select>
          </div>
        </div>

        {/* Reading progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div className="h-full bg-indigo-500 w-1/3 transition-all" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <AlertCircle className="h-10 w-10" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-prose mx-auto">
            <h1 className="text-2xl font-black text-slate-900 mb-6">{chapterTitle}</h1>
            {verses.map((v, i) => (
              <p key={`${v.verse}-${i}`} className="text-lg leading-loose text-slate-800">
                <sup className="text-xs font-bold text-slate-400 mr-1.5 select-none">{v.verseLabel ?? v.verse}</sup>
                {v.text}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100 pb-safe shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleComplete}
          disabled={completing || !!error || timer > 0}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-full font-black text-lg transition-all ${
            timer > 0 
              ? 'bg-slate-200 text-slate-400 shadow-none cursor-default' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-md shadow-emerald-200 disabled:opacity-70'
          }`}
        >
          {completing ? '儲存中…' : '完成今日閱讀'}
          {!completing && timer === 0 && <Check className="h-5 w-5" />}
        </button>
      </div>
      </div>
    </div>
  );
}
