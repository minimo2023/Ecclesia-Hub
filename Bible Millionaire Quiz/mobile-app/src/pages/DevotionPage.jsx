import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import DevotionArticle from '../components/devotion/DevotionArticle';
import DevotionNotes from '../components/devotion/DevotionNotes';

export default function DevotionPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('article'); // 'article' | 'notes'
  
  // Helpers for date string YYYY-MM-DD
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const displayDate = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

  const headerRight = (
    <span className="text-xs font-black text-slate-400">
      {displayDate}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FDFBF7] relative">
      <PageHeader 
        title="每日靈修日誌" 
        showBack={true} 
        onBack={() => navigate('/', { replace: true })}
        rightElement={headerRight} 
      />

      <div className="flex-shrink-0 flex border-b border-stone-200 bg-white/90 backdrop-blur-md sticky top-[56px] z-40">
        <button
          onClick={() => setActiveTab('article')}
          className={`flex-1 py-3 text-sm font-black text-center transition-colors border-b-2 ${
            activeTab === 'article' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          靈修短文
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-3 text-sm font-black text-center transition-colors border-b-2 ${
            activeTab === 'notes' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          我的筆記
        </button>
      </div>

      {/* 
        Using hidden instead of unmounting to preserve scroll position 
        and form state when switching tabs.
      */}
      <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'article' ? 'flex' : 'hidden'}`}>
        <DevotionArticle onSwitchToNotes={() => setActiveTab('notes')} />
      </div>
      
      <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'notes' ? 'flex' : 'hidden'}`}>
        <DevotionNotes dateStr={dateStr} />
      </div>
    </div>
  );
}
