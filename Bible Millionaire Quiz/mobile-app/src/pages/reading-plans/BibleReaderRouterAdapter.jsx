import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BibleReader from '../../../../src/features/reading-plans/BibleReader';
import BiblePage from '../BiblePage.jsx';

export default function BibleReaderRouterAdapter() {
  const navigate = useNavigate();
  const { scheduleId } = useParams();
  const useIntegratedReader = import.meta.env.VITE_READING_PLAN_SCRIPTURE_INTEGRATION !== 'false';

  if (useIntegratedReader) {
    return (
      <BiblePage
        readingPlanScheduleId={scheduleId}
        onReadingPlanBack={() => navigate('/reading-plans', { replace: true })}
        onReadingPlanCompleted={() => navigate('/reading-plans', { replace: true })}
      />
    );
  }

  return (
    <BibleReader
      scheduleId={scheduleId}
      onNavigate={() => navigate('/reading-plans', { replace: true })}
      onBack={() => navigate('/reading-plans', { replace: true })}
    />
  );
}
