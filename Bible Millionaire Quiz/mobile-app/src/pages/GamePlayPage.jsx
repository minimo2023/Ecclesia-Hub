import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import GameManager from '../../../src/features/game/components/GameManager';

export default function GamePlayPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedBooks = location.state?.selectedBooks;
  const options = location.state?.options;

  if (!Array.isArray(selectedBooks) || selectedBooks.length === 0 || !options) {
    return <Navigate to="/game/setup" replace />;
  }

  const handleGameEnd = (score, reason, data = {}) => {
    navigate('/game/results', {
      replace: true,
      state: {
        score,
        reason,
        data,
        selectedBooks,
        options,
      },
    });
  };

  return (
    <GameManager
      selectedBooks={selectedBooks}
      options={options}
      onGameEnd={handleGameEnd}
      onExit={() => navigate('/games', { replace: true, state: { section: 'quiz' } })}
      useMobileInterface
    />
  );
}
