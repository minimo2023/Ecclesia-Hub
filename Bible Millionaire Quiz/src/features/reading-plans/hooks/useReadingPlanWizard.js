import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { BOOK_CHAPTERS } from '../../../data/constants';

export function useReadingPlanWizard(onPlanCreated) {
  const { getToken, getDisplayName } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    selectedBooks: [], // Default empty
    duration: 30, // Changed default to 30 to avoid default invalid state
    days: ['1', '2', '3', '4', '5', '6', '0'],
  });

  const [completedBooks, setCompletedBooks] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/bible/reading-plans/history', {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success) {
          setCompletedBooks(data.completedBooks || []);
        }
      } catch (e) {
        console.error('Failed to fetch reading history', e);
      }
    };
    fetchHistory();
  }, [getToken]);

  useEffect(() => {
    if (!formData.selectedBooks.length || !formData.duration || !formData.days.length) {
      setPreview(null);
      setPreviewLoading(false);
      setError('');
      return undefined;
    }

    setPreview(null);
    setPreviewLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/bible/reading-plans/wizard-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            target_books: formData.selectedBooks,
            duration_days: formData.duration,
            reading_days: formData.days,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || '無法預覽排程');
        }
        setPreview(data);
        setPreviewLoading(false);
        setError('');
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setPreview(null);
          setPreviewLoading(false);
          setError('暫時無法預覽排程，請稍後再試。');
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [formData.selectedBooks, formData.duration, formData.days, getToken]);

  const handleStartPlan = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch('/api/bible/reading-plans/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_id: 'custom',
          target_books: formData.selectedBooks,
          schedule_algorithm: 'chronological',
          reading_days: formData.days,
          target_days: formData.duration,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (onPlanCreated) onPlanCreated();
      } else {
        throw new Error(data.message || data.error || '建立讀經計畫失敗');
      }
    } catch (e) {
      console.error('[ReadingPlanWizard] Failed to create plan:', e);
      setError('暫時無法建立讀經計畫，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // 動態計算每天需要讀幾章
  const getDurationDesc = (optVal, fallbackDesc) => {
    if (formData.selectedBooks.length === 0) return fallbackDesc;
    
    const totalChapters = formData.selectedBooks.reduce((sum, book) => sum + (BOOK_CHAPTERS[book] || 1), 0);
    const activeDaysPerWeek = formData.days.length || 7;
    const actualReadingDays = Math.max(1, Math.floor(optVal * (activeDaysPerWeek / 7)));
    const chaptersPerDay = totalChapters / actualReadingDays;
    
    if (chaptersPerDay < 1) return '每天不到 1 章';
    if (chaptersPerDay <= 2) return '每天約 1-2 章';
    return `每天約 ${Math.floor(chaptersPerDay)}-${Math.ceil(chaptersPerDay)} 章`;
  };

  // 取得閱讀範圍標題
  const getSelectedRangeTitle = () => {
    const len = formData.selectedBooks.length;
    if (len === 66) return '整本聖經';
    if (len === 27 && formData.selectedBooks.includes('馬太福音') && formData.selectedBooks.includes('啟示錄')) return '新約全書';
    if (len === 39 && formData.selectedBooks.includes('創世記') && formData.selectedBooks.includes('瑪拉基書')) return '舊約全書';
    if (len === 4 && formData.selectedBooks.includes('馬太福音') && formData.selectedBooks.includes('約翰福音')) return '四福音書';
    return `自訂範圍 (${len} 卷)`;
  };

  const getTotalChapters = () => {
    return formData.selectedBooks.reduce((sum, book) => sum + (BOOK_CHAPTERS[book] || 1), 0);
  };

  return {
    getDisplayName,
    formData,
    setFormData,
    submitting,
    handleStartPlan,
    getDurationDesc,
    getSelectedRangeTitle,
    getTotalChapters,
    completedBooks,
    preview,
    previewLoading,
    error
  };
}
