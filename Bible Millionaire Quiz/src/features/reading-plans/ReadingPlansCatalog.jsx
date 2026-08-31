import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
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
  if (left.length !== right.length) return false;
  return left.every(day => right.includes(day));
}

export default function ReadingPlansCatalog({ onPlanCreated, onBack }) {
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
  const [currentStep, setCurrentStep] = useState(1);

  const alreadyReadBooks = useMemo(
    () => formData.selectedBooks.filter(book => completedBooks.includes(book)),
    [completedBooks, formData.selectedBooks]
  );
  const alreadyReadChapters = useMemo(
    () => alreadyReadBooks.reduce((sum, book) => sum + (BOOK_CHAPTERS[book] || 1), 0),
    [alreadyReadBooks]
  );
  const activeDaysPreset = READING_DAYS_OPTIONS.find(option => sameDays(option.days, formData.days));
  const selectedDayLabels = WEEK_DAYS.filter(day => formData.days.includes(day.value)).map(day => `週${day.label}`);
  const standardDuration = PLAN_DURATIONS.some(option => option.val === formData.duration);

  const isStepValid = step => {
    if (step === 1) return formData.selectedBooks.length > 0;
    if (step === 2) return Number(formData.duration) >= 1 && Number(formData.duration) <= 1000;
    if (step === 3) return formData.days.length > 0;
    return formData.selectedBooks.length > 0 && Number(formData.duration) >= 1 && formData.days.length > 0;
  };

  const goNext = () => {
    if (!isStepValid(currentStep)) return;
    const nextStep = Math.min(4, currentStep + 1);
    setCurrentStep(nextStep);
  };

  const toggleReadingDay = day => {
    const nextDays = formData.days.includes(day)
      ? formData.days.filter(value => value !== day)
      : WEEK_DAYS.map(item => item.value).filter(value => [...formData.days, day].includes(value));
    setFormData({ ...formData, days: nextDays });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-3">
          <button type="button" onClick={onBack} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-50" aria-label="返回">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="text-center">
            <h1 className="text-base font-black text-slate-900">建立讀經計畫</h1>
            <p className="text-[10px] font-bold text-slate-400">依你的步調安排</p>
          </div>
          <div className="w-10" aria-hidden="true" />
        </div>
      </header>

      <main className={`min-h-0 flex-1 touch-pan-y overscroll-y-contain px-3 py-2.5 sm:px-5 md:px-8 ${currentStep === 1 ? 'overflow-hidden' : 'overflow-y-auto'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className={`mx-auto w-full max-w-3xl ${currentStep === 1 ? 'h-full min-h-0' : ''}`}>
          {currentStep === 1 ? (
            <section className="flex h-full min-h-0 flex-col" aria-labelledby="reading-plan-step-one">
              <div className="mb-2 shrink-0 text-center">
                <small className="text-[10px] font-black tracking-wider text-indigo-600">歡迎，{getDisplayName()} · 步驟 1／4</small>
                <h2 id="reading-plan-step-one" className="mt-0.5 text-lg font-black text-slate-900 sm:text-xl">這次想讀哪些書卷？</h2>
                <p className="text-[11px] leading-4 text-slate-500 sm:text-xs">選好範圍後，我會依你的時間安排閱讀進度。</p>
                <p className={`h-4 truncate text-[10px] font-bold ${alreadyReadBooks.length > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                  {alreadyReadBooks.length > 0
                    ? `包含曾讀過的 ${alreadyReadBooks.length} 卷、${alreadyReadChapters} 章；原有紀錄會保留`
                    : '可選一卷、多卷，或整本新舊約'}
                </p>
              </div>

              <ReadingPlanBookSelector
                selectedBooks={formData.selectedBooks}
                completedBooks={completedBooks}
                onChange={books => setFormData({ ...formData, selectedBooks: books })}
              />
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section aria-labelledby="reading-plan-step-two">
              <div className="mb-4 text-center">
                <small className="text-[10px] font-black tracking-wider text-indigo-600">步驟 2／4</small>
                <h2 id="reading-plan-step-two" className="mt-1 text-xl font-black text-slate-900">希望多久完成？</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">天數越短，每個閱讀日安排的章數越多。</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {PLAN_DURATIONS.map(option => (
                  <button
                    key={option.val}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration: option.val })}
                    aria-pressed={formData.duration === option.val}
                    className={`min-h-20 rounded-2xl border-2 p-3 text-left transition ${formData.duration === option.val ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                  >
                    <strong className={`block text-base ${formData.duration === option.val ? 'text-indigo-900' : 'text-slate-800'}`}>{option.title}</strong>
                    <small className="mt-1 block text-[11px] text-slate-500">{formData.selectedBooks.length ? getDurationDesc(option.val, option.desc) : option.desc}</small>
                  </button>
                ))}

                <div className={`col-span-2 rounded-2xl border-2 p-3 transition ${!standardDuration ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="block text-base text-slate-800">自訂天數</strong>
                      <small className="text-[11px] text-slate-500">1 至 1000 天</small>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-500">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={!standardDuration ? (formData.duration || '') : ''}
                        onFocus={() => { if (standardDuration) setFormData({ ...formData, duration: 60 }); }}
                        onChange={event => {
                          const value = Number.parseInt(event.target.value, 10);
                          setFormData({ ...formData, duration: Number.isNaN(value) ? '' : value });
                        }}
                        placeholder="60"
                        aria-label="自訂完成天數"
                        className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      天
                    </label>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section aria-labelledby="reading-plan-step-three">
              <div className="mb-4 text-center">
                <small className="text-[10px] font-black tracking-wider text-indigo-600">步驟 3／4</small>
                <h2 id="reading-plan-step-three" className="mt-1 text-xl font-black text-slate-900">每週哪些日子閱讀？</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">排程只會安排在選取的星期；其他日子可休息或補進度。</p>
              </div>

              <div className="grid gap-2.5">
                {READING_DAYS_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, days: option.days })}
                    aria-pressed={activeDaysPreset?.id === option.id}
                    className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${activeDaysPreset?.id === option.id ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                  >
                    <span>
                      <strong className="block text-sm text-slate-900">{option.title}</strong>
                      <small className="mt-0.5 block text-[11px] text-slate-500">{option.desc}</small>
                    </span>
                    {activeDaysPreset?.id === option.id ? <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" /> : null}
                  </button>
                ))}
              </div>

              <fieldset className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <legend className="px-1 text-sm font-black text-slate-800">自訂閱讀日</legend>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {WEEK_DAYS.map(day => {
                    const selected = formData.days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleReadingDay(day.value)}
                        aria-pressed={selected}
                        aria-label={`週${day.label}${selected ? '，已選取' : '，未選取'}`}
                        className={`aspect-square min-h-10 rounded-xl text-sm font-black transition ${selected ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-200 bg-slate-50 text-slate-500'}`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                {formData.days.length === 0 ? <p className="mt-3 text-xs font-bold text-rose-600">至少選擇一個閱讀日。</p> : null}
              </fieldset>
            </section>
          ) : null}

          {currentStep === 4 ? (
            <section aria-labelledby="reading-plan-step-four">
              <div className="mb-4 text-center">
                <small className="text-[10px] font-black tracking-wider text-indigo-600">步驟 4／4</small>
                <h2 id="reading-plan-step-four" className="mt-1 text-xl font-black text-slate-900">確認你的讀經計畫</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">建立前再確認範圍、步調與每天的閱讀負荷。</p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><BookOpen className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <small className="font-bold text-slate-400">閱讀範圍</small>
                      <strong className="block text-sm text-slate-900">{getSelectedRangeTitle()}</strong>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{formData.selectedBooks.join('、')}</p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-100" />
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Clock3 className="h-5 w-5" /></span>
                    <div>
                      <small className="font-bold text-slate-400">完成目標</small>
                      <strong className="block text-sm text-slate-900">{formData.duration} 天</strong>
                    </div>
                  </div>
                  <div className="h-px bg-slate-100" />
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><CalendarDays className="h-5 w-5" /></span>
                    <div>
                      <small className="font-bold text-slate-400">每週閱讀日</small>
                      <strong className="block text-sm text-slate-900">{selectedDayLabels.join('、')}</strong>
                    </div>
                  </div>
                </div>

                <div className="border-t border-indigo-100 bg-indigo-50/70 p-4 sm:p-5">
                  {previewLoading ? (
                    <p className="text-sm font-bold text-indigo-700">正在計算實際排程…</p>
                  ) : preview?.summary ? (
                    <div>
                      <strong className="text-sm text-indigo-950">實際 {preview.summary.actualReadingDays} 個閱讀日</strong>
                      <p className="mt-1 text-xs leading-5 text-indigo-700">每日約 {preview.summary.averageChaptersPerDay} 章，最高單日 {preview.summary.maxChaptersPerDay} 章。</p>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-600">尚未取得排程預覽。</p>
                  )}
                  {preview?.summary?.highLoad ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">這個安排負荷較高，最高單日 {preview.summary.maxChaptersPerDay} 章；仍可依你的選擇建立。</p>
                  ) : null}
                  {error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="sticky bottom-0 z-30 shrink-0 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2">
          {currentStep === 1 ? (
            <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-slate-100">取消</button>
          ) : (
            <button type="button" onClick={() => setCurrentStep(step => Math.max(1, step - 1))} disabled={submitting} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ArrowLeft className="h-4 w-4" />上一步</button>
          )}

          {currentStep < 4 ? (
            <button type="button" onClick={goNext} disabled={!isStepValid(currentStep)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow-sm disabled:bg-indigo-300 disabled:shadow-none">下一步<ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={handleStartPlan} disabled={submitting || !isStepValid(4)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow-sm disabled:bg-indigo-300 disabled:shadow-none">{submitting ? '建立中…' : '建立計畫'}<Check className="h-4 w-4" /></button>
          )}
        </div>
      </footer>
    </div>
  );
}
