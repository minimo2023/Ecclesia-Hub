import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MobileStartScreen from '../../../src/features/game/components/mobile/MobileStartScreen';

export default function GameSetupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeOptions = location.state || {};
  const [bibleVersion, setBibleVersion] = useState(routeOptions.bibleVersion || 'CUV_TRAD');
  const [includeGeography, setIncludeGeography] = useState(routeOptions.includeGeography ?? true);
  const [includeEncyclopedia, setIncludeEncyclopedia] = useState(routeOptions.includeEncyclopedia ?? true);

  const handleStartGame = (selectedBooks, extraOptions = {}) => {
    navigate('/game/play', {
      state: {
        selectedBooks,
        options: {
          ...routeOptions,
          ...extraOptions,
          bibleVersion,
          includeGeography,
          includeEncyclopedia,
        },
      },
    });
  };

  return (
    <MobileStartScreen
      onStartGame={handleStartGame}
      onAdminLogin={() => {}}
      onBack={() => navigate('/games', { state: { section: 'quiz' } })}
      highScores={[]}
      skipIntro
      semanticTag="div"
      gameMode={routeOptions.gameMode || 'classic'}
      bibleVersion={bibleVersion}
      onVersionChange={setBibleVersion}
      includeGeography={includeGeography}
      onToggleGeography={() => setIncludeGeography((value) => !value)}
      includeEncyclopedia={includeEncyclopedia}
      onToggleEncyclopedia={() => setIncludeEncyclopedia((value) => !value)}
    />
  );
}
