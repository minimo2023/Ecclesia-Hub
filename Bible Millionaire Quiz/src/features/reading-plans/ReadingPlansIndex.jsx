import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ReadingPlansCatalog from './ReadingPlansCatalog';
import ReadingPlansDesktopCatalog from './ReadingPlansDesktopCatalog';
import MyReadingPlan from './MyReadingPlan';
import AuthModal from '../auth/AuthModal';

/**
 * 讀經計畫入口元件 (共用商業邏輯層)
 * 
 * 負責判斷使用者是否有作用中的計畫：
 * - 有計畫 → 顯示進度儀表板 (MyReadingPlan)
 * - 無計畫 → 顯示建立計畫精靈 (ReadingPlansCatalog)
 * 
 * @param {function} onNavigate - 導航回呼，由上層注入 (桌面版 App.jsx / 手機版 RouterAdapter)
 * @param {function} onBack - 返回上一層回呼
 */
export default function ReadingPlansIndex({ onNavigate, onBack, AuthModalComponent = AuthModal, layout = 'desktop' }) {
  const { isLoggedIn, getToken } = useAuth();
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      setShowAuthModal(true);
      return;
    }

    const checkActivePlan = async () => {
      try {
        const token = getToken();
        const res = await fetch('/api/bible/reading-plans/my-plan', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setHasActivePlan(data.success && !!data.plan);
      } catch (e) {
        console.error('[ReadingPlansIndex] Failed to check active plan:', e);
        setHasActivePlan(false);
      } finally {
        setLoading(false);
      }
    };

    checkActivePlan();
  }, [isLoggedIn, getToken]);

  const handlePlanCreated = () => {
    setHasActivePlan(true);
  };

  const handlePlanCanceled = () => {
    setHasActivePlan(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <AuthModalComponent 
          isOpen={showAuthModal} 
          onClose={() => {
            setShowAuthModal(false);
            if (onBack) onBack();
          }} 
          onLoginSuccess={() => setShowAuthModal(false)} 
        />
      </div>
    );
  }

  if (hasActivePlan) {
    return <MyReadingPlan onNavigate={onNavigate} onBack={onBack} onPlanCanceled={handlePlanCanceled} />;
  }

  if (layout === 'mobile') {
    return <ReadingPlansCatalog onPlanCreated={handlePlanCreated} onNavigate={onNavigate} onBack={onBack} />;
  }

  return <ReadingPlansDesktopCatalog onPlanCreated={handlePlanCreated} onBack={onBack} />;
}
