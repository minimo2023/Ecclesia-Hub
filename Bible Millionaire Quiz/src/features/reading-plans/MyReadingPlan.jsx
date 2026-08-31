import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Calendar as CalendarIcon, CheckCircle2, AlertCircle, RefreshCw, ChevronLeft, Trash2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 讀經計畫進度儀表板 (共用商業邏輯層)
 *
 * @param {function} onNavigate - 導航回呼，接受 'bible-reader' | 'feature-menu' 等
 * @param {function} onBack - 返回上一層回呼
 */
export default function MyReadingPlan({ onNavigate, onBack, onPlanCanceled }) {
  const { getToken } = useAuth();
  const [showReschedule, setShowReschedule] = useState(false);
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rescheduling, setRescheduling] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [feedback, setFeedback] = useState('');

  const fetchPlan = useCallback(async () => {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch('/api/bible/reading-plans/my-plan', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.success && data.plan) {
          setPlanData(data.plan);
          if (data.plan.resyncNotice) setFeedback('排程已依設定更新。');
        } else {
          setPlanData(null);
        }
      } catch (e) {
        console.error('[MyReadingPlan] Failed to fetch plan:', e);
        setFeedback('讀經計畫載入失敗，請稍後再試。');
      } finally {
        setLoading(false);
      }
  }, [getToken]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleReschedule = async (strategy) => {
    if (rescheduling) return;
    setRescheduling(true);
    try {
      const token = getToken();
      const response = await fetch('/api/bible/reading-plans/schedule/resync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_plan_id: planData?.id, strategy }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '排程調整失敗');
      setShowReschedule(false);
      setFeedback('排程已依設定更新。');
      await fetchPlan();
    } catch (e) {
      console.error('[MyReadingPlan] Failed to reschedule:', e);
      setFeedback('排程調整失敗，請稍後再試。');
    } finally {
      setRescheduling(false);
    }
  };

  const executeCancelPlan = async () => {
    if (!planData?.id) return;
    

    setCanceling(true);
    try {
      const res = await fetch(`/api/bible/reading-plans/my-plan/${planData.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setShowCancelConfirm(false);
        if (onPlanCanceled) onPlanCanceled();
      } else {
        setFeedback(data.message || data.error || '暫時無法放棄計畫，請稍後再試。');
      }
    } catch (error) {
      console.error('Cancel plan error:', error);
      setFeedback('網路連線異常，請稍後再試。');
    } finally {
      setCanceling(false);
    }
  };

  const handleCancelClick = () => {
    if (!planData?.id) {
      setFeedback('找不到可放棄的讀經計畫。');
      return;
    }
    setShowCancelConfirm(true);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
        <BookOpen className="h-12 w-12 text-indigo-300" />
        <h2 className="text-xl font-black text-slate-900">目前沒有進行中的讀經計畫</h2>
        {feedback && <p className="text-sm font-bold text-red-600">{feedback}</p>}
        <button onClick={onPlanCanceled} className="rounded-2xl bg-indigo-600 px-6 py-3 font-black text-white">
          建立讀經計畫
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 relative">
      <div className="w-full h-full flex flex-col relative overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shrink-0">
        <div className="flex h-14 items-center px-4 md:px-8 max-w-5xl mx-auto w-full">
          <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full mr-2 transition">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-black text-slate-900">讀經進度</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 space-y-6 max-w-5xl mx-auto w-full">

        {feedback && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
            {feedback}
          </div>
        )}

        {/* Main Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <BookOpen className="h-32 w-32" />
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-black mb-4">
              <CalendarIcon className="h-3.5 w-3.5" />
              {planData?.title}
            </div>

            <h2 className="text-3xl font-black text-slate-900 mb-1">{planData?.todayTarget}</h2>
            <p className="text-sm font-bold text-slate-400 mb-6">
              第 {planData?.currentDay} 天／共 {planData?.totalDays} 天
            </p>

            <div className="mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                <span>整體進度</span>
                <span className="text-indigo-600">{planData?.progress}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                  style={{ width: `${planData?.progress ?? 0}%` }}
                />
              </div>
            </div>

            {planData?.progress === 100 ? (
              <div className="flex flex-col gap-3">
                <div className="w-full py-4 rounded-2xl bg-emerald-100 text-emerald-700 font-black text-lg border border-emerald-200 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  此計畫已全部完成
                </div>
                <button
                  onClick={() => {
                    if (onPlanCanceled) onPlanCanceled();
                  }}
                  className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-lg shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  建立新計畫
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('bible-reader', { scheduleId: planData?.scheduleId })}
                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-lg shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                開始今日閱讀
                <BookOpen className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Reschedule Alert */}
        {(planData?.behindDays ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex gap-3">
              <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-amber-900">需要重新安排嗎？</h3>
                <p className="text-xs font-medium text-amber-700 mt-1 mb-3">
                  目前落後了 {planData.behindDays} 天。不要有壓力，可以彈性調整，重點是持續。
                </p>
                <button
                  onClick={() => setShowReschedule(true)}
                  className="px-4 py-2 bg-white rounded-lg text-sm font-bold text-amber-700 shadow-sm border border-amber-200 active:bg-amber-50 transition"
                >
                  調整進度
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming */}
        {planData?.upcoming?.length > 0 && (
          <div>
            <h3 className="text-sm font-black text-slate-900 mb-3 px-1">接下來</h3>
            <div className="space-y-2">
              {planData.upcoming.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center h-10 w-10 rounded-xl bg-slate-50 text-slate-400">
                      <span className="text-xs font-black">{item.day}</span>
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-700">{item.target}</div>
                      <div className="text-[11px] font-bold text-slate-400">{item.date}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Plan Button */}
        {planData?.progress !== 100 && (
          <div className="mt-8 mb-4">
            <button
              onClick={handleCancelClick}
              disabled={canceling}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 active:bg-red-100 transition-all disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {canceling ? '取消中…' : '放棄此計畫'}
            </button>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-safe animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-red-600 flex items-center gap-2">
                <AlertCircle className="h-6 w-6" />
                放棄計畫
              </h2>
              <button onClick={() => setShowCancelConfirm(false)} className="p-2 rounded-full hover:bg-slate-100 text-lg">
                ×
              </button>
            </div>
            <p className="text-sm font-medium text-slate-600 mb-6">
              確定要放棄目前的讀經計畫嗎？已完成與未完成的排程都會保留在歷史中，之後可重新建立新計畫。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 active:scale-[0.98] transition-all"
              >
                取消
              </button>
              <button
                onClick={executeCancelPlan}
                disabled={canceling}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-70"
              >
                {canceling ? '處理中…' : '確定放棄'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showReschedule && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-safe animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900">彈性重排</h2>
              <button onClick={() => setShowReschedule(false)} className="p-2 rounded-full hover:bg-slate-100 text-lg">
                ×
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleReschedule('shift')}
                disabled={rescheduling}
                className="w-full text-left p-4 rounded-2xl border-2 border-indigo-100 hover:border-indigo-500 bg-indigo-50/50 transition disabled:opacity-70"
              >
                <h3 className="text-base font-black text-indigo-900 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-indigo-500" />
                  順延進度（推薦）
                </h3>
                <p className="text-xs font-medium text-indigo-700/70 mt-1">
                  從上次的地方繼續讀，所有日期往後順延。不會跳過任何經文。
                </p>
              </button>

              <button
                onClick={() => handleReschedule('distribute')}
                disabled={rescheduling}
                className="w-full text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-300 transition disabled:opacity-70"
              >
                <h3 className="text-base font-black text-slate-800">重新分配</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">
                  保持原定完成日期，把落後的進度平均分配到未來每一天。
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
