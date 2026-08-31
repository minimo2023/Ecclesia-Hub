import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useAchievements } from '../../hooks/useAchievements.js';
import { normalizeReadingPlanVerses, readingSecondsForVerses } from './readingPlanSessionUtils.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Adds reading-plan progress to an existing scripture reader without changing
 * the reader's ordinary (non-plan) data flow.
 */
export default function useReadingPlanSession({ scheduleId, onCompleted }) {
  const { getToken } = useAuth();
  const { checkAchievements } = useAchievements();
  const enabled = Boolean(scheduleId);
  const [verses, setVerses] = useState([]);
  const [references, setReferences] = useState([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('CUV_TRAD');
  const [availableVersions, setAvailableVersions] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [timer, setTimer] = useState(0);
  const [completing, setCompleting] = useState(false);
  const unlockedChapters = useRef(new Set());

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/bible/versions`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('無法取得譯本清單');
        return response.json();
      })
      .then(data => setAvailableVersions(Array.isArray(data.versions) ? data.versions : []))
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') console.warn('[ReadingPlan] Version list unavailable:', fetchError);
      });
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => {
    unlockedChapters.current = new Set();
    setChapterIndex(0);
  }, [scheduleId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        if (!token) throw new Error('請先登入以繼續讀經計畫');
        const params = new URLSearchParams({
          version: selectedVersion,
          chapter_index: String(chapterIndex)
        });
        const response = await fetch(
          `${API_BASE_URL}/api/bible/reading-plans/schedule/${encodeURIComponent(scheduleId)}/verses?${params}`,
          {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || '無法載入今日經文');
        const nextVerses = normalizeReadingPlanVerses(Array.isArray(data.verses) ? data.verses : []);
        if (!nextVerses.length) throw new Error('今日排程沒有可讀取的經文');
        setVerses(nextVerses);
        setReferences(Array.isArray(data.references) ? data.references : []);
        setChapterTitle(data.chapterTitle || '今日閱讀');
        if (Number.isInteger(Number(data.chapterIndex))) setChapterIndex(Number(data.chapterIndex));
        if (data.version) setSelectedVersion(data.version);
        setTimer(unlockedChapters.current.has(Number(data.chapterIndex ?? chapterIndex))
          ? 0
          : readingSecondsForVerses(nextVerses));
      } catch (loadError) {
        if (loadError.name === 'AbortError') return;
        console.error('[ReadingPlan] Failed to load schedule:', loadError);
        setVerses([]);
        setError(loadError.message || '無法載入今日經文');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [chapterIndex, enabled, getToken, scheduleId, selectedVersion]);

  useEffect(() => {
    if (!enabled || timer <= 0) return undefined;
    const interval = window.setInterval(() => {
      setTimer(previous => Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, timer]);

  useEffect(() => {
    if (enabled && !loading && !error && verses.length && timer === 0) {
      unlockedChapters.current.add(chapterIndex);
    }
  }, [chapterIndex, enabled, error, loading, timer, verses.length]);

  const chapterCount = Math.max(1, references.length);
  const activeReference = references[chapterIndex] || null;
  const isFirstChapter = chapterIndex <= 0;
  const isLastChapter = chapterIndex >= chapterCount - 1;
  const canAdvance = !loading && !error && timer === 0;
  const progress = Math.round(((chapterIndex + (canAdvance ? 1 : 0)) / chapterCount) * 100);

  const goPrevious = useCallback(() => {
    setChapterIndex(index => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    if (!canAdvance) return;
    setChapterIndex(index => Math.min(chapterCount - 1, index + 1));
  }, [canAdvance, chapterCount]);

  const complete = useCallback(async () => {
    if (!enabled || completing || !canAdvance || !isLastChapter) return false;
    setCompleting(true);
    setError(null);
    try {
      const token = getToken();
      if (!token) throw new Error('請先登入以完成讀經計畫');
      const response = await fetch(
        `${API_BASE_URL}/api/bible/reading-plans/schedule/${encodeURIComponent(scheduleId)}/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.error || '無法完成今日閱讀');
      checkAchievements({ gameMode: 'reading_plan' });
      window.dispatchEvent(new CustomEvent('refresh-ai-wallet'));
      onCompleted?.(data);
      return true;
    } catch (completeError) {
      console.error('[ReadingPlan] Failed to complete:', completeError);
      setError(completeError.message || '無法完成今日閱讀');
      return false;
    } finally {
      setCompleting(false);
    }
  }, [canAdvance, checkAchievements, completing, enabled, getToken, isLastChapter, onCompleted, scheduleId]);

  return useMemo(() => ({
    enabled,
    verses,
    references,
    activeReference,
    chapterIndex,
    chapterCount,
    chapterTitle,
    selectedVersion,
    setSelectedVersion,
    availableVersions,
    loading,
    error,
    timer,
    completing,
    isFirstChapter,
    isLastChapter,
    canAdvance,
    progress,
    goPrevious,
    goNext,
    complete
  }), [
    activeReference, availableVersions, canAdvance, chapterCount, chapterIndex, chapterTitle,
    complete, completing, enabled, error, goNext, goPrevious, isFirstChapter, isLastChapter,
    loading, progress, references, selectedVersion, timer, verses
  ]);
}
