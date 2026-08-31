import React, { Suspense, lazy } from 'react';
import { Routes, Route, Outlet, Navigate, useParams } from 'react-router-dom';
import BottomNav from './components/layout/BottomNav';
import { useCoinSystem } from '../../src/contexts/CoinSystemContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const DevotionPage = lazy(() => import('./pages/DevotionPage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));
const ScriptureMemoryGuidePage = lazy(() => import('./pages/ScriptureMemoryGuidePage'));
const BiblePage = lazy(() => import('./pages/BiblePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AssetExchangePage = lazy(() => import('./pages/member/AssetExchangePage'));
const StatsPage = lazy(() => import('./pages/member/StatsPage'));
const DiaryHistoryPage = lazy(() => import('./pages/member/DiaryHistoryPage'));
const HistoryPage = lazy(() => import('./pages/member/HistoryPage'));
const GameSetupPage = lazy(() => import('./pages/GameSetupPage'));
const GamePlayPage = lazy(() => import('./pages/GamePlayPage'));
const GameResultPage = lazy(() => import('./pages/GameResultPage'));
const MultiplayerJoinPage = lazy(() => import('./pages/MultiplayerJoinPage'));
const GameExpeditionPage = lazy(() => import('./pages/GameExpeditionPage'));
const ScriptureRainPage = lazy(() => import('./pages/ScriptureRainPage'));
const ScriptureOrderPage = lazy(() => import('./pages/ScriptureOrderPage'));
const ReadingPlansRouterAdapter = lazy(() => import('./pages/reading-plans/ReadingPlansRouterAdapter'));
const BibleReaderRouterAdapter = lazy(() => import('./pages/reading-plans/BibleReaderRouterAdapter'));
const GuestDataMergeDialog = lazy(() => import('../../src/shared/components/GuestDataMergeDialog'));
const AchievementToast = lazy(() => import('../../src/shared/components/AchievementToast'));
const VoiceBlessingSharePage = lazy(() => import('../../src/features/scripture-recording/VoiceBlessingSharePage'));

function PageFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 px-4 pb-6 pt-5" role="status" aria-live="polite">
      <span className="sr-only">頁面載入中</span>
      <div className="mx-auto w-full max-w-md motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-3 w-20 rounded-full bg-slate-200" />
        <div className="mt-3 h-7 w-52 max-w-[70%] rounded-lg bg-slate-200" />

        <div className="mt-5 h-40 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between p-4">
            <div className="h-6 w-24 rounded-full bg-indigo-100" />
            <div className="h-10 w-12 rounded-xl bg-slate-100" />
          </div>
          <div className="space-y-2 px-4 pt-2">
            <div className="h-3 w-20 rounded-full bg-slate-200" />
            <div className="h-6 w-3/4 rounded-lg bg-slate-200" />
            <div className="h-3 w-full rounded-full bg-slate-100" />
            <div className="h-3 w-5/6 rounded-full bg-slate-100" />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded-lg bg-slate-200" />
            <div className="h-10 w-10 rounded-full bg-indigo-50" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

// 主佈局，包含底部導航
function MainLayout() {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50">
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

// 專注佈局，無底部導航 (如遊戲頁)
function FocusLayout() {
  return (
    <main className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50">
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </main>
  );
}

export default function App() {
  const coinSystem = useCoinSystem();

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/bible" element={<BiblePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/exchange" element={<AssetExchangePage />} />
          <Route path="/profile/stats" element={<StatsPage />} />
          <Route path="/profile/diary" element={<DiaryHistoryPage />} />
          <Route path="/profile/history" element={<HistoryPage />} />
          <Route path="/devotion" element={<DevotionPage />} />
          <Route path="/game/setup" element={<GameSetupPage />} />
          <Route path="/reading-plans" element={<ReadingPlansRouterAdapter />} />
        </Route>

        <Route path="/b/:token" element={<VoiceBlessingShareRoute />} />
        <Route path="/blessing/:token" element={<VoiceBlessingShareRoute />} />
        
        <Route element={<FocusLayout />}>
          <Route path="/game/play" element={<GamePlayPage />} />
          <Route path="/game/results" element={<GameResultPage />} />
          <Route path="/game/multiplayer/join" element={<MultiplayerJoinPage />} />
          <Route path="/game/expedition" element={<GameExpeditionPage />} />
          <Route path="/game/scripture-rain" element={<ScriptureRainPage />} />
          <Route path="/game/scripture-order" element={<ScriptureOrderPage />} />
          <Route path="/games/scripture-memory-guide" element={<ScriptureMemoryGuidePage />} />
          <Route path="/bible/reader/:scheduleId" element={<BibleReaderRouterAdapter />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <Suspense fallback={null}>
        {coinSystem && (
          <GuestDataMergeDialog 
            isOpen={coinSystem.isMergeRequired}
            coinCount={coinSystem.guestCoins} 
            isLoading={coinSystem.isLoading}
            onMerge={coinSystem.mergeGuestData}
            onDiscard={coinSystem.discardGuestData}
          />
        )}
        <AchievementToast />
      </Suspense>
    </>
  );
}

function VoiceBlessingShareRoute() {
  const { token } = useParams();
  return <VoiceBlessingSharePage token={token} />;
}
