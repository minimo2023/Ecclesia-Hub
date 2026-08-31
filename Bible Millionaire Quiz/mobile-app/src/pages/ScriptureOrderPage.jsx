import React from 'react';
import { useNavigate } from 'react-router-dom';
import ScriptureOrderGame from '../../../src/features/scripture-order/ScriptureOrderGame';

export default function ScriptureOrderPage() {
  const navigate = useNavigate();
  return (
    <ScriptureOrderGame
      onExit={() => navigate('/games', { state: { section: 'memory' } })}
      onBack={() => navigate('/games', { state: { section: 'memory' } })}
      onHome={() => navigate('/')}
    />
  );
}
