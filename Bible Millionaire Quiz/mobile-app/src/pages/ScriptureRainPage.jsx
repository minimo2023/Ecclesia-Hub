import React from 'react';
import { useNavigate } from 'react-router-dom';
import ScriptureRainGame from '../../../src/features/scripture-rain/ScriptureRainGame';

export default function ScriptureRainPage() {
  const navigate = useNavigate();
  return (
    <ScriptureRainGame
      onExit={() => navigate('/games', { state: { section: 'memory' } })}
      onBack={() => navigate('/games', { state: { section: 'memory' } })}
      onHome={() => navigate('/')}
    />
  );
}
