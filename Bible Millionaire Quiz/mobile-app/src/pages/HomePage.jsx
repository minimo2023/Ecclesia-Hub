import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Flame,
  Heart,
  NotebookPen,
  Sparkles,
  Wallet
} from 'lucide-react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useCoinSystem } from '../../../src/contexts/CoinSystemContext';
import SupportModal from '../components/shared/SupportModal';

import {
  dayNames,
  getLocalDateString,
  getGreeting,
  buildWeek,
  calculateStreak
} from '../../../src/utils/devotionProgress';

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isLoggedIn, getToken } = useAuth();
  const { coins } = useCoinSystem();

  const [todayProgress, setTodayProgress] = useState({ read: false, meditate: false, note: false });
  const [streak, setStreak] = useState(0);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [aiCredits, setAiCredits] = useState(0);
  const [weekDays, setWeekDays] = useState(() => buildWeek());
  const [devotionData, setDevotionData] = useState({
    title: '今日同行的光',
    reference: '詩篇 119:105',
    summary: '你的話是我腳前的燈，是我路上的光。',
  });

  const displayName = user?.displayName || user?.username || '朋友';
  const today = new Date();
  const dateText = `${today.getMonth() + 1}/${today.getDate()}`;
  const weekdayText = `週${dayNames[today.getDay()]}`;
  const effectiveProgress = isLoggedIn
    ? todayProgress
    : { read: false, meditate: false, note: false };
  const effectiveStreak = isLoggedIn ? streak : 0;
  const effectiveWeekDays = isLoggedIn ? weekDays : buildWeek();

  const progressSteps = [
    { label: '讀經', complete: effectiveProgress.read, icon: BookOpen, path: '/reading-plans' },
    { label: '默想', complete: effectiveProgress.meditate, icon: Sparkles, path: '/devotion' },
    { label: '筆記', complete: effectiveProgress.note, icon: NotebookPen, path: '/profile', state: { tab: 'diary' } },
  ];
  const progressPercent = Math.round((progressSteps.filter((step) => step.complete).length / progressSteps.length) * 100);

  useEffect(() => {
    if (!isLoggedIn || !getToken()) return;

    const fetchUserProgress = async () => {
      try {
        const currentToken = getToken();
        if (!currentToken) return;
        
        const notesResponse = await fetch('/api/devotional-notes/list', {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        const notes = await notesResponse.json();
        if (notes.success) {
          const checkins = notes.checkins || [];
          const todayString = getLocalDateString(new Date());
          const todayCheckin = checkins.find(c => c.date === todayString);

          setTodayProgress({
            read: !!todayCheckin?.scripture_read_at,
            meditate: !!todayCheckin?.read_at,
            note: !!todayCheckin?.wrote_note_at
          });
          
          setStreak(calculateStreak(checkins));
          setWeekDays(buildWeek(checkins));
        }
      } catch (error) {
        console.error('Fetch user dashboard data error:', error);
      }
    };

    fetchUserProgress();
    const handleRefresh = () => fetchUserProgress();
    window.addEventListener('refresh-ai-wallet', handleRefresh);
    return () => window.removeEventListener('refresh-ai-wallet', handleRefresh);
  }, [isLoggedIn, getToken]);

  useEffect(() => {
    const fetchDevotion = async () => {
      try {
        const response = await fetch('/api/ai/devotional');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        if (!result.success || !result.data) {
          setDevotionData({
            title: '今日靈修尚未生成',
            reference: '---',
            summary: '請稍後再試，或檢查網路連線。',
          });
          return;
        }

        const data = result.data;
        const reference = data.scriptureReference || data.verse_ref || data.reference || '今日經文';
        
        // 優先使用 understanding 或 meditation 作為摘要，因為 scripture 只是經文
        let summaryText = '安靜讀一段經文，讓今天從神的話開始。';
        if (data.understanding) summaryText = data.understanding;
        else if (data.meditation) summaryText = data.meditation;
        else if (data.summary) summaryText = data.summary;
        else if (data.scripture) summaryText = data.scripture;

        setDevotionData({
          title: data.title || `${data.author || '作者'} 的今日靈修`,
          reference,
          summary: summaryText,
        });
      } catch (error) {
        console.error('Fetch devotion error:', error);
        setDevotionData({
          title: '無法取得今日靈修',
          reference: '---',
          summary: '請稍後再試。',
        });
      }
    };

    fetchDevotion();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      const fetchCredits = async () => {
        try {
          const currentToken = getToken();
          if (!currentToken) return;
          const res = await fetch('/api/users/ai-wallet', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
          });
          const data = await res.json();
          if (data.success) {
            setAiCredits(data.data.totalCredits);
          }
        } catch (error) {
          console.error('Fetch AI credits error:', error);
        }
      };
      fetchCredits();
    }
  }, [isLoggedIn, getToken]);

  return (
    <div className="app-page flex h-full w-full flex-col">
      {/* 頂部 Header */}
      <header className="app-topbar sticky top-0 z-40">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-sm font-black tracking-wide text-slate-900">聖經智匯</span>
          </div>

          <div
            className="flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1.5 gap-1.5"
            aria-label={`金幣 ${coins}，點數 ${aiCredits}`}
          >
            <span className="text-[13px]" aria-hidden="true">💰</span>
            <span className="text-[12px] font-black text-amber-700">{coins}</span>
            <div className="h-3 w-px bg-slate-300" aria-hidden="true" />
            <Wallet className="h-3.5 w-3.5 text-indigo-700" aria-hidden="true" />
            <span className="text-[12px] font-black text-indigo-700">{aiCredits}</span>
          </div>
        </div>
      </header>

      {/* 內容區塊 */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 safe-area-pb space-y-4">
        
        {/* 問候語 */}
        <section className="flex flex-col gap-1">
          <p className="text-sm font-bold text-slate-700">{getGreeting()}，{displayName}</p>
          <h1 className="text-2xl font-black tracking-normal text-slate-950">
            今天從一段經文開始
          </h1>
        </section>

        {/* 今日靈修 Hero Banner */}
        <button
          type="button"
          onClick={() => navigate('/devotion')}
          aria-label={`開啟今日靈修：${devotionData.title}`}
          className="relative block min-h-[230px] w-full overflow-hidden rounded-2xl bg-slate-900 text-left text-white shadow-lg shadow-indigo-950/10 transition active:scale-[0.995]"
          style={{
            backgroundImage: 'linear-gradient(120deg, rgba(49, 46, 129, 0.9), rgba(15, 23, 42, 0.88)), url("/images/平安平原.jpg")',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="flex h-full min-h-[230px] flex-col px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                今日靈修
              </span>
              <span className="flex flex-col items-center rounded-xl bg-white/15 px-3 py-1.5 text-center text-white backdrop-blur">
                <span className="block text-base font-black leading-none">{dateText}</span>
                <span className="mt-1 block text-[10px] font-bold text-white/75">{weekdayText}</span>
              </span>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-white/75">{devotionData.reference}</p>
              <h2 className="line-clamp-2 text-2xl font-black leading-snug tracking-normal">
                {devotionData.title}
              </h2>
              <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-white/80 line-clamp-5">
                {devotionData.summary}
              </p>
            </div>
          </div>
        </button>

        {/* 今日進度 */}
        <aside className="app-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">今日進度</h2>
              <p className="text-[11px] font-bold text-slate-600">每日節奏</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-sm font-black text-indigo-700 ring-4 ring-indigo-50">
              {progressPercent}%
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {progressSteps.map((step) => {
              const Icon = step.icon;
              return (
                <button
                  type="button"
                  key={step.label}
                  onClick={() => navigate(step.path, step.state ? { state: step.state } : undefined)}
                  className={`rounded-xl border px-2 py-2 text-center transition ${
                    step.complete
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-slate-100 bg-slate-50 text-slate-700 active:bg-slate-100'
                  }`}
                >
                  <Icon className="mx-auto h-4 w-4" />
                  <span className="mt-1 block text-[11px] font-black">{step.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-700">連續靈修</span>
              <span className="inline-flex items-center gap-1 text-[13px] font-black text-orange-600">
                <Flame className="h-4 w-4" />
                {effectiveStreak} 天
              </span>
            </div>
            <div className="mt-2.5 flex justify-between gap-1">
              {effectiveWeekDays.map((day) => (
                <div key={`${day.day}-${day.date}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-600">{day.day}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                      day.active
                        ? 'bg-indigo-100 text-indigo-700'
                        : day.isToday
                          ? 'border-2 border-slate-300 bg-white text-slate-700'
                          : day.future
                            ? 'text-slate-300'
                            : 'text-slate-600'
                    }`}
                  >
                    {day.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Support Section */}
        <button
          onClick={() => setShowSupportModal(true)}
          className="w-full rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-left flex items-center justify-between active:bg-rose-100 transition-colors"
        >
          <div>
            <h3 className="text-[13px] font-black text-rose-900">支持「聖經智匯」</h3>
            <p className="mt-0.5 text-[11px] font-medium text-rose-700/80">每一份支持，都幫助聖經智匯持續成長</p>
          </div>
          <Heart className="h-4 w-4 text-rose-400" />
        </button>

      </div>

      {/* Modals */}
      <SupportModal 
        isOpen={showSupportModal} 
        onClose={() => setShowSupportModal(false)} 
      />
    </div>
  );
}
