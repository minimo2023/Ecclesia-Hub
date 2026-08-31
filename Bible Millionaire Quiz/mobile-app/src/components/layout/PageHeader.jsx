import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PageHeader({ title, showBack = false, rightElement, onBack }) {
  const navigate = useNavigate();

  return (
    <header className="app-topbar sticky top-0 z-50 flex items-center px-4 pt-safe">
      <div className="w-10 flex items-center justify-start">
        {showBack && (
          <button
            onClick={onBack || (() => navigate(-1))}
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900 transition-colors rounded-full active:bg-slate-100"
            aria-label="返回"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
      </div>
      <h1 className="flex-1 truncate text-center text-base font-black tracking-wide text-slate-900">
        {title}
      </h1>
      <div className="w-10 flex items-center justify-end">
        {rightElement}
      </div>
    </header>
  );
}
