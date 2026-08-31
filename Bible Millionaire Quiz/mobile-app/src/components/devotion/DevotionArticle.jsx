import React, { useState, useEffect } from 'react';
import apiClient from '../../services/apiClient';
import { Loader2, BookOpen } from 'lucide-react';
import DevotionCard from '../../../../src/features/devotion/components/DevotionCard';
import { useDevotionalReadAloud } from '../../../../src/features/devotion/useDevotionalReadAloud';

export default function DevotionArticle({ onSwitchToNotes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const devotionalReadAloud = useDevotionalReadAloud(data);

  useEffect(() => {
    const fetchDevotion = async () => {
      try {
        const response = await apiClient.get('/ai/devotional');
        if (response.data.success) {
          setData(response.data.data);
        } else {
          setError('暫時無法載入靈修內容，請稍後再試。');
        }
      } catch {
        setError('暫時無法載入靈修內容，請稍後再試。');
      } finally {
        setLoading(false);
      }
    };
    fetchDevotion();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex justify-center items-center p-8 text-slate-500 text-sm">
        {error || '暫時無法載入靈修內容，請稍後再試。'}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#FDFBF7] px-4 py-4 pb-24 safe-area-pb">
      <div className="mx-auto w-full max-w-3xl">
        <DevotionCard
          devotionalContent={data}
          isLoading={false}
          fontSize="small"
          readAloudController={devotionalReadAloud}
        />

        <div className="flex justify-center pb-4">
          <button
            onClick={onSwitchToNotes}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-md shadow-indigo-200 transition-colors active:bg-indigo-700"
          >
            <BookOpen className="w-5 h-5" />
            寫回應筆記
          </button>
        </div>
      </div>
    </div>
  );
}
