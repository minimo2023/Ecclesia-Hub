import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3
} from 'lucide-react';
import ReadingPlanBookSelector from './ReadingPlanBookSelector';
import { useReadingPlanWizard } from './hooks/useReadingPlanWizard';
import { BOOK_CHAPTERS } from '../../data/constants';

const PLAN_DURATIONS = [
  { val: 7, title: '7 天', desc: '一週衝刺' },
  { val: 14, title: '14 天', desc: '兩週專注' },
  { val: 21, title: '21 天', desc: '建立習慣' },
  { val: 30, title: '30 天', desc: '密集閱讀' },
  { val: 90, title: '90 天', desc: '一季完成' },
  { val: 180, title: '半年', desc: '輕鬆前進' },
  { val: 365, title: '一年', desc: '每天一點' }
];

const READING_DAYS_OPTIONS = [
  { id: 'daily', days: ['1', '2', '3', '4', '5', '6', '0'], title: '每天讀', desc: '每天安排閱讀進度' },
  { id: 'weekdays', days: ['1', '2', '3', '4', '5'], title: '平日讀', desc: '週一至週五閱讀' },
  { id: 'weekend', days: ['6', '0'], title: '週末讀', desc: '集中在週六、週日' }
];

const WEEK_DAYS = [
  { value: '1', label: '一' },
  { value: '2', label: '二' },
  { value: '3', label: '三' },
  { value: '4', label: '四' },
  { value: '5', label: '五' },
  { value: '6', label: '六' },
  { value: '0', label: '日' }
];

function sameDays(left, right) {
  return left.length === right.length && left.every(day => right.includes(day));
}

export default function ReadingPlansDesktopCatalog({ onPlanCreated, onBack }) {
  const {
    getDisplayName,
    formData,
    setFormData,
    submitting,
    handleStartPlan,
    getDurationDesc,
    getSelectedRangeTitle,
    completedBooks,
    preview,
    previewLoading,
    error
  } = useReadingPlanWizard(onPlanCreated);

  const alreadyReadBooks = useMemo(
    () => formData.selectedBooks.filter(book => completedBooks.includes(book)),
    [completedBooks, formData.selectedBooks]
  );
  const alreadyReadChapters = useMemo(
    () => alreadyReadBooks.reduce((sum, book) => sum + (BOOK_CHAPTERS[book] || 1), 0),
    [alreadyReadBooks]
  );
  const activeDaysPreset = READING_DAYS_OPTIONS.find(option => sameDays(option.days, formData.days));
  const standardDuration = PLAN_DURATIONS.some(option => option.val === formData.duration);
  const isValid = formData.selectedBooks.length > 0
    && Number(formData.duration) >= 1
    && Number(formData.duration) <= 1000
    && formData.days.length > 0;

  const toggleReadingDay = day => {
    const days = formData.days.includes(day)
      ? formData.days.filter(value => value !== day)
      : [...formData.days, day];
    setFormData({ ...formData, days });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      <header className="shrink-0 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-slate-500 transition hover:bg-slate-50" aria-label="返回">
            <ChevronLeft className="h-5 w-5" />返回
          </button>
          <div className="text-center">
            <h1 className="text-lg font-black text-slate-900">建立讀經計畫</h1>
            <p className="text-xs font-bold text-slate-400">歡迎，{getDisplayName()}，依你的步調安排閱讀</p>
          </div>
          <div className="w-20" aria-hidden="true" />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
          <section className="flex min-h-[640px] min-w-0 flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" aria-labelledby="desktop-reading-books">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 text-xs font-black tracking-wider text-indigo-600"><BookOpen className="h-4 w-4" />閱讀範圍</span>
                <h2 id="desktop-reading-books" className="mt-1 text-2xl font-black text-slate-900">這次想讀哪些書卷？</h2>
                <p className="mt-1 text-sm text-slate-500">可選一卷、多卷，或整本新舊約。</p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-black text-indigo-700">已選 {formData.selectedBooks.length} 卷</span>
            </div>

            {alreadyReadBooks.length > 0 ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />包含曾讀過的 {alreadyReadBooks.length} 卷、{alreadyReadChapters} 章；原有紀錄會保留
              </div>
            ) : null}

            <ReadingPlanBookSelector
              variant="desktop"
              selectedBooks={formData.selectedBooks}
              completedBooks={completedBooks}
              onChange={books => setFormData({ ...formData, selectedBooks: books })}
            />
          </section>

          <aside className="min-w-0 space-y-5" aria-label="讀經計畫安排">
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Clock3 className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-black text-slate-900">希望多久完成？</h2>
                  <p className="text-xs text-slate-500">天數越短，每個閱讀日安排越多。</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {PLAN_DURATIONS.map(option => (
                  <button key={option.val} type="button" onClick={() => setFormData({ ...formData, duration: option.val })} aria-pressed={formData.duration === option.val} className={`min-h-20 rounded-2xl border-2 p-3 text-left transition ${formData.duration === option.val ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50 hover:border-indigo-200'}`}>
                    <strong className="block text-sm text-slate-900">{option.title}</strong>
                    <small className="mt-1 block text-[11px] text-slate-500">{formData.selectedBooks.length ? getDurationDesc(option.val, option.desc) : option.desc}</small>
                  </button>
                ))}
                <label className={`col-span-2 flex items-center justify-between rounded-2xl border-2 p-3 ${standardDuration ? 'border-slate-100 bg-slate-50' : 'border-indigo-500 bg-indigo-50'}`}>
                  <span><strong className="block text-sm text-slate-900">自訂天數</strong><small className="text-[11px] text-slate-500">1 至 1000 天</small></span>
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-500">
                    <input type="number" min="1" max="1000" value={!standardDuration ? (formData.duration || '') : ''} onFocus={() => { if (standardDuration) setFormData({ ...formData, duration: 60 }); }} onChange={event => { const value = Number.parseInt(event.target.value, 10); setFormData({ ...formData, duration: Number.isNaN(value) ? '' : value }); }} placeholder="60" className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />天
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><CalendarDays className="h-5 w-5" /></span>
                <div><h2 className="text-lg font-black text-slate-900">每週哪些日子閱讀？</h2><p className="text-xs text-slate-500">選擇固定節奏，或自行調整。</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {READING_DAYS_OPTIONS.map(option => (
                  <button key={option.id} type="button" onClick={() => setFormData({ ...formData, days: option.days })} aria-pressed={activeDaysPreset?.id === option.id} className={`rounded-2xl border-2 px-3 py-3 text-left transition ${activeDaysPreset?.id === option.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                    <strong className="block text-sm text-slate-900">{option.title}</strong><small className="mt-1 block text-[10px] text-slate-500">{option.desc}</small>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {WEEK_DAYS.map(day => {
                  const selected = formData.days.includes(day.value);
                  return <button key={day.value} type="button" onClick={() => toggleReadingDay(day.value)} aria-pressed={selected} aria-label={`週${day.label}${selected ? '，已選取' : '，未選取'}`} className={`aspect-square rounded-xl text-sm font-black ${selected ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}>{day.label}</button>;
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
              <div className="p-5">
                <span className="text-xs font-black tracking-wider text-indigo-600">計畫摘要</span>
                <h2 className="mt-1 text-xl font-black text-slate-900">{formData.selectedBooks.length ? getSelectedRangeTitle() : '尚未選擇閱讀範圍'}</h2>
                {previewLoading ? <p className="mt-3 text-sm font-bold text-indigo-700">正在計算實際排程…</p> : preview?.summary ? <p className="mt-3 text-sm leading-6 text-slate-600">實際 {preview.summary.actualReadingDays} 個閱讀日，每日約 {preview.summary.averageChaptersPerDay} 章，最高單日 {preview.summary.maxChaptersPerDay} 章。</p> : <p className="mt-3 text-sm text-slate-500">完成左側與上方設定後即可預覽。</p>}
                {preview?.summary?.highLoad ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">這個安排負荷較高，最高單日 {preview.summary.maxChaptersPerDay} 章；仍可依你的選擇建立。</p> : null}
                {error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-indigo-100 bg-indigo-50/70 px-5 py-4">
                <button type="button" onClick={onBack} className="min-h-10 rounded-xl px-4 text-sm font-bold text-slate-500 hover:bg-white">取消</button>
                <button type="button" onClick={handleStartPlan} disabled={submitting || !isValid} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-black text-white shadow-sm disabled:bg-indigo-300 disabled:shadow-none">{submitting ? '建立中…' : '建立讀經計畫'}{submitting ? null : <><Check className="h-4 w-4" /><ArrowRight className="h-4 w-4" /></>}</button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
