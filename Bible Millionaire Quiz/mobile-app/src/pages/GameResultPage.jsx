import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import GameOverScreen from '../../../src/features/game/components/GameOverScreen';
import SpeedResultsScreen from '../../../src/features/game/components/SpeedResultsScreen';
import { leaderboardService } from '../../../src/features/game/services/LeaderboardService';
import { useAuth } from '../../../src/contexts/AuthContext';

export default function GameResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const result = location.state;

  if (!result?.reason) {
    return <Navigate to="/games" replace />;
  }

  const replay = (replayOptions = {}) => {
    navigate('/game/play', {
      replace: true,
      state: {
        selectedBooks: result.selectedBooks,
        options: {
          ...result.options,
          ...replayOptions,
        },
      },
    });
  };

  const returnToQuizHub = () => {
    navigate('/games', {
      replace: true,
      state: { section: 'quiz' },
    });
  };

  const saveScore = async (name) => {
    await leaderboardService.saveScore({
      name,
      score: result.score || 0,
      isVictory: result.reason === 'victory',
      date: new Date().toISOString(),
    });
  };

  if (result.reason === 'speed-complete') {
    return (
      <SpeedResultsScreen
        correctCount={result.data?.correctCount || 0}
        totalAnswered={
          result.data?.totalAnswered
          || result.options?.questionCount
          || 0
        }
        coinsEarned={result.data?.coinsEarned || result.score || 0}
        bonusCoins={result.data?.bonusCoins || 0}
        onReplay={replay}
        onBackToMenu={returnToQuizHub}
      />
    );
  }

  return (
    <GameOverScreen
      score={result.score || 0}
      wrongAnswers={result.data?.wrongAnswers || []}
      totalQuestions={result.options?.questionCount || 0}
      onReplay={replay}
      onExit={returnToQuizHub}
      onSaveScore={saveScore}
      gameMode={result.options?.gameMode}
      isVictory={result.reason === 'victory'}
      isLoggedIn={isLoggedIn}
      user={user}
      isInfiniteMode={result.options?.isInfiniteMode}
    />
  );
}
