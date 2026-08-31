/**
 * Board Games Socket Handler (Reversi & Chess)
 * Isolated namespace: /boardgames
 */

const games = {}; // roomId -> { players: [], board: ..., turn: ... }

export function initBoardGamesSocket(io) {
    const gameIo = io.of('/boardgames');

    gameIo.on('connection', (socket) => {
        console.log(`♟️ [BoardGame] Client connected: ${socket.id}`);

        // ===== REVERSI EVENTS =====

        socket.on('join_game', ({ roomId }) => {
            const room = gameIo.adapter.rooms.get(roomId);
            const numClients = room ? room.size : 0;

            if (numClients === 0) {
                socket.join(roomId);
                games[roomId] = {
                    players: [socket.id],
                    colors: { [socket.id]: 1 }, // Host is Black (1)
                    currentTurn: 1
                };
                socket.emit('player_color', 1);
                socket.emit('waiting_for_opponent');
                console.log(`[Reversi] Room ${roomId} created by ${socket.id}`);
            } else if (numClients === 1) {
                if (!games[roomId]) {
                    socket.emit('error', 'Room state invalid. Please rejoin.');
                    return;
                }

                socket.join(roomId);
                const game = games[roomId];
                game.players.push(socket.id);
                game.colors[socket.id] = 2; // Joiner is White (2)

                socket.emit('player_color', 2);
                gameIo.to(roomId).emit('game_start', { roomId });
                console.log(`[Reversi] Room ${roomId} filled by ${socket.id}`);
            } else {
                socket.emit('room_full');
            }
        });

        socket.on('player_move', ({ roomId, move }) => {
            socket.to(roomId).emit('remote_move', move);
        });

        socket.on('game_reset', ({ roomId, boardSize }) => {
            gameIo.to(roomId).emit('game_reset', { boardSize });
        });

        // ===== CHESS EVENTS =====

        socket.on('chess_join', ({ roomId }) => {
            const room = gameIo.adapter.rooms.get(roomId);
            const numClients = room ? room.size : 0;

            if (numClients === 0) {
                socket.join(roomId);
                games[roomId] = {
                    players: [socket.id],
                    colors: { [socket.id]: 'w' }, // First player is White
                    type: 'chess'
                };
                socket.emit('chess_player_color', 'w');
                socket.emit('chess_waiting');
                console.log(`[Chess] Room ${roomId} created by ${socket.id}`);
            } else if (numClients === 1) {
                if (!games[roomId]) {
                    // Fallback if memory lost (server restart), treat as new or error
                    socket.join(roomId);
                    games[roomId] = {
                        players: [socket.id],
                        colors: { [socket.id]: 'w' }, // Treat as P1 if room strictly exists in adapter but not memory? 
                        // Actually if adapter has it but memory doesn't, it implies a desync or restart.
                        // For safety, let's just error or reset.
                        type: 'chess'
                    };
                    // But simpler logic:
                    socket.emit('chess_room_error', 'Game state not found');
                    return;
                }

                socket.join(roomId);
                const game = games[roomId];
                game.players.push(socket.id);
                game.colors[socket.id] = 'b'; // Second player is Black

                socket.emit('chess_player_color', 'b');
                gameIo.to(roomId).emit('chess_game_start');
                console.log(`[Chess] Room ${roomId} filled by ${socket.id}`);
            } else {
                socket.emit('chess_room_full');
            }
        });

        socket.on('chess_move', ({ roomId, move }) => {
            socket.to(roomId).emit('chess_remote_move', move);
        });

        // ===== COMMON DISCONNECT =====

        socket.on('disconnect', () => {
            console.log(`♟️ [BoardGame] Client disconnected: ${socket.id}`);
            
            // Inefficient scan, but robust for small scale
            for (const roomId in games) {
                const game = games[roomId];
                if (game.players && game.players.includes(socket.id)) {
                    
                    if (game.type === 'chess') {
                        socket.to(roomId).emit('chess_opponent_left');
                        console.log(`[Chess] Room ${roomId} closed`);
                    } else {
                        // Reversi logic (didn't have specific event in original, but good to add)
                        socket.to(roomId).emit('opponent_left'); 
                    }
                    
                    delete games[roomId];
                    break;
                }
            }
        });
    });

    console.log('♟️ [Socket] Board Games namespace (/boardgames) initialized');
}
