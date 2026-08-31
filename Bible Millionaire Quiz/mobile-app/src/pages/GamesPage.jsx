import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Compass, BookOpen, Clock, Users, CloudRain, Grid2X2, HelpCircle, ArrowRight } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { useGuestGameExitGuard } from '../../../src/features/game/components/shared/useGuestGameExitGuard';

export default function GamesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestGuestGameExit, guestGameExitDialog } = useGuestGameExitGuard();
  const requestedSection = location.state?.section;
  const [activeSection, setActiveSection] = useState(
    ['quiz', 'memory', 'online'].includes(requestedSection) ? requestedSection : 'quiz'
  );

  // Handle game start
  const handleStartGame = (mode) => {
    // 遠征模式如果有自己的頁面，可以在這裡特例處理
    if (mode.id === 'expedition') {
      navigate('/game/expedition');
      return;
    }
    
    // 連線模式在手機端為純玩家端，直接導向加入房間畫面
    if (mode.id === 'multiplayer') {
      navigate('/game/multiplayer/join');
      return;
    }

    if (mode.id === 'scripture-rain') {
      navigate('/game/scripture-rain');
      return;
    }

    if (mode.id === 'scripture-order') {
      navigate('/game/scripture-order');
      return;
    }
    
    // 將玩家導向經卷設定頁面，並傳遞模式參數
    navigate('/game/setup', { state: { ...mode.params, modeName: mode.name, modeId: mode.id } });
  };

  const scriptureRainVisible = import.meta.env.DEV || import.meta.env.VITE_SCRIPTURE_RAIN_ENABLED === 'true';
  const scriptureOrderEnabled = import.meta.env.DEV
    || import.meta.env.VITE_SCRIPTURE_ORDER_LAB_ENABLED === 'true'
    || import.meta.env.VITE_SCRIPTURE_ORDER_ENABLED === 'true';
  const GAME_MODES = [
    {
      id: 'classic',
      section: 'quiz',
      name: '經典模式',
      description: '選擇熟悉的經卷，挑戰精選題目並獲得金幣獎勵。',
      icon: <Trophy className="w-8 h-8 text-amber-500" />,
      bgClass: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200',
      textClass: 'text-amber-800',
      badge: '🏆 最受歡迎',
      badgeClass: 'bg-amber-100 text-amber-700',
      params: { gameMode: 'classic', isInfiniteMode: false, questionCount: 15 }
    },
    {
      id: 'speed',
      section: 'quiz',
      name: '快答模式',
      description: '限時回答更多問題，訓練快速判斷與反應。',
      icon: <Clock className="w-8 h-8 text-rose-500" />,
      bgClass: 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200',
      textClass: 'text-rose-800',
      badge: '⚡ 刺激緊張',
      badgeClass: 'bg-rose-100 text-rose-700',
      params: { gameMode: 'speed', isInfiniteMode: false, questionCount: 15 }
    },
    {
      id: 'expedition',
      section: 'quiz',
      name: '遠征模式',
      description: '招募使徒、指派任務，在探索中認識聖經地理。',
      icon: <Compass className="w-8 h-8 text-violet-500" />,
      bgClass: 'bg-gradient-to-br from-violet-50 to-fuchsia-50 border-violet-200',
      textClass: 'text-violet-800',
      badge: '🗺️ 探索冒險',
      badgeClass: 'bg-violet-100 text-violet-700',
      params: { gameMode: 'expedition' }
    },
    {
      id: 'multiplayer',
      section: 'online',
      name: '連線同樂',
      description: '與好友即時連線搶答，一起挑戰聖經知識。',
      icon: <Users className="w-8 h-8 text-blue-500" />,
      bgClass: 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200',
      textClass: 'text-blue-800',
      badge: '🎮 好友同樂',
      badgeClass: 'bg-blue-100 text-blue-700',
      params: { gameMode: 'multiplayer-buzzer', isInfiniteMode: false, questionCount: 15 }
    },
    {
      id: 'scripture-order',
      section: 'memory',
      name: '經文四宮格',
      description: '依照原文順序，從四個片段中選出下一段經文。',
      icon: <Grid2X2 className="w-8 h-8 text-cyan-500" />,
      bgClass: 'bg-gradient-to-br from-cyan-50 to-teal-50 border-cyan-200',
      textClass: 'text-cyan-800',
      badge: scriptureOrderEnabled ? '🧩 順序挑戰' : '🧩 尚未開放',
      badgeClass: 'bg-cyan-100 text-cyan-700',
      available: scriptureOrderEnabled
    },
    {
      id: 'scripture-rain',
      section: 'memory',
      name: '經文雨',
      description: '依照和合本順序接住經文片段；使用提示會消耗智匯金幣。',
      icon: <CloudRain className="w-8 h-8 text-sky-500" />,
      bgClass: 'bg-gradient-to-br from-sky-50 to-indigo-50 border-sky-200',
      textClass: 'text-sky-800',
      badge: '🌧️ 動態挑戰',
      badgeClass: 'bg-sky-100 text-sky-700',
      visible: scriptureRainVisible,
      params: { gameMode: 'scripture-rain' }
    },
    {
      id: 'casual',
      section: 'quiz',
      name: '練習模式',
      description: '沒有時間壓力，也不會扣除金幣；按照自己的步調閱讀與練習。',
      icon: <BookOpen className="w-8 h-8 text-emerald-500" />,
      bgClass: 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200',
      textClass: 'text-emerald-800',
      badge: '📖 輕鬆學習',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      params: { gameMode: 'casual', isInfiniteMode: false, questionCount: 10 }
    }
  ].filter(mode => mode.visible !== false);

  const SECTIONS = [
    { id: 'quiz', label: '問答挑戰', icon: Trophy },
    { id: 'memory', label: '經文記憶', icon: BookOpen },
    { id: 'online', label: '連線同樂', icon: Users }
  ];
  const visibleModes = GAME_MODES.filter((mode) => mode.section === activeSection);

  return (
    <>
    <div className="app-page flex flex-col">
      <PageHeader title="聖經智匯遊戲" showBack onBack={() => requestGuestGameExit(() => navigate('/'))} />
      
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-24 safe-area-pb">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-900">遊戲分類</h2>
          <p className="app-supporting mt-1">選擇今天想玩的模式。</p>
        </div>

        <div className="app-segmented mb-5 grid grid-cols-3 gap-1.5" role="tablist" aria-label="遊戲分類">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSection(section.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[12px] font-black transition ${isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'text-slate-500'
                  }`}
              >
                <Icon className="h-5 w-5" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>

        {activeSection === 'memory' ? (
          <button
            type="button"
            onClick={() => navigate('/games/scripture-memory-guide')}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-cyan-50 p-4 text-left shadow-sm active:scale-[0.98]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><HelpCircle size={23} /></span>
            <span className="min-w-0 flex-1"><strong className="block text-[15px] font-black text-slate-900">第一次玩？先看圖解玩法</strong><small className="mt-0.5 block text-[12px] font-semibold text-slate-500">選經文、遊戲設定與兩種玩法一次看懂</small></span>
            <ArrowRight className="h-5 w-5 shrink-0 text-indigo-500" />
          </button>
        ) : null}

        <div className="space-y-4">
          {visibleModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={mode.available === false}
              onClick={mode.available === false ? undefined : () => handleStartGame(mode)}
              className={`w-full relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${mode.available === false
                ? 'cursor-not-allowed opacity-60'
                : 'active:scale-[0.98]'
                } ${mode.bgClass}`}
            >
              <div className="flex items-start gap-4 relative z-10">
                <div className="flex-shrink-0 bg-white p-3 rounded-xl shadow-sm">
                  {mode.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`text-[18px] font-black ${mode.textClass}`}>
                      {mode.name}
                    </h3>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${mode.badgeClass}`}>
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed mt-1">
                    {mode.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
    {guestGameExitDialog}
    </>
  );
}
