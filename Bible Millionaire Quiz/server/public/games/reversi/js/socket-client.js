// socket-client.js
let socketClient = null;
let currentRoomId = null;

function initSocket(onGameStart, onRemoteMove, onPlayerColor, onReset) {
    if (socketClient && socketClient.connected) {
        socketClient.disconnect();
    }

    // Use explicit URL based on current page origin (handles both IP and Domain access)
    const socketUrl = window.location.origin + '/boardgames';
    socketClient = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
    });

    socketClient.on('connect', () => {
        console.log("Connected to server");
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) statusEl.textContent = "";
    });

    socketClient.on('disconnect', () => {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) statusEl.textContent = "(斷線中...)";
    });

    socketClient.on('player_color', (color) => {
        console.log("Assigned color:", color);
        onPlayerColor(color);
        const msg = color === 1 ? "您是黑方 (先手)，等待對手加入..." : "您是白方 (後手)，遊戲開始！";
        // Optional: alert(msg); // Removed intrusive alert
        const infoEl = document.getElementById('statusMessage');
        if (infoEl) infoEl.textContent = msg;
    });

    socketClient.on('waiting_for_opponent', () => {
        const infoEl = document.getElementById('statusMessage');
        if (infoEl) infoEl.textContent = "等待對手加入...";
    });

    socketClient.on('game_start', () => {
        console.log("Game Start!");
        onGameStart();
    });

    socketClient.on('remote_move', (move) => {
        console.log("Remote move received:", move);
        onRemoteMove(move);
    });

    socketClient.on('room_full', () => {
        alert("房間已滿！請換一個房間號碼。");
        socketClient.disconnect();
    });

    socketClient.on('game_reset', ({ boardSize }) => {
        onReset(boardSize);
    });
}

function joinGameRoom(roomId) {
    if (!socketClient) return;
    currentRoomId = roomId;
    socketClient.emit('join_game', { roomId });
}

function sendMove(move) {
    if (!socketClient || !currentRoomId) return;
    socketClient.emit('player_move', { roomId: currentRoomId, move });
}

function sendReset(boardSize) {
    if (!socketClient || !currentRoomId) return;
    socketClient.emit('game_reset', { roomId: currentRoomId, boardSize });
}
