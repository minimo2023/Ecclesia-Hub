import React from 'react';
import { useNavigate } from 'react-router-dom';
import ScriptureMemoryGuide from '../../../src/features/scripture-memory/ScriptureMemoryGuide';

export default function ScriptureMemoryGuidePage() {
  const navigate = useNavigate();

  return (
    <ScriptureMemoryGuide
      onBack={() => navigate('/games', { state: { section: 'memory' } })}
      onStartOrder={() => navigate('/game/scripture-order')}
      onStartRain={() => navigate('/game/scripture-rain')}
    />
  );
}
