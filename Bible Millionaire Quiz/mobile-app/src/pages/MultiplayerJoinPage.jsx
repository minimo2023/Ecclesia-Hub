import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PlayerScreen from '../../../src/features/GameOnline/PlayerScreen';
import { getMultiplayerRoomCodeFromLocation } from '../../../src/features/GameOnline/multiplayerJoinLink';

export default function MultiplayerJoinPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialRoomCode = getMultiplayerRoomCodeFromLocation(location);

  return (
    <PlayerScreen
      initialRoomCode={initialRoomCode}
      onBack={() => navigate('/games', { replace: true })}
    />
  );
}
