import React from 'react';
import { useNavigate } from 'react-router-dom';
import ReadingPlansIndex from '../../../../src/features/reading-plans/ReadingPlansIndex';

export default function ReadingPlansRouterAdapter() {
  const navigate = useNavigate();

  const handleNavigate = (view, data = {}) => {
    if (view === 'bible-reader' && data.scheduleId) {
      navigate(`/bible/reader/${encodeURIComponent(data.scheduleId)}`);
      return;
    }
    if (view === 'reading-plans') {
      navigate('/reading-plans');
      return;
    }
    navigate('/bible');
  };

  return (
    <ReadingPlansIndex
      layout="mobile"
      onNavigate={handleNavigate}
      onBack={() => navigate('/')}
    />
  );
}
