import React from 'react';
import { useNavigate } from 'react-router-dom';
import ExpeditionScreen from '../../../src/features/expedition/components/ExpeditionScreen';

export default function GameExpeditionPage() {
  const navigate = useNavigate();

  return (
    <ExpeditionScreen
      onBack={() => navigate('/games', { replace: true })}
    />
  );
}
