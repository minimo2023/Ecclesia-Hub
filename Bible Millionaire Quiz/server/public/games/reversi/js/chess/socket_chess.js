// socket_chess.js - Chess-specific Socket.io Client
const ChessSocket = {
    socket: null,
    roomId: null,
    playerColor: null, // 'w' or 'b'
    isConnected: false,

    // Initialize socket connection
    init() {
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }

        // Use explicit URL based on current page origin
        const socketUrl = window.location.origin + '/boardgames';
        this.socket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });

        this.setupListeners();
    },

    setupListeners() {
        this.socket.on('connect', () => {
            console.log("[ChessSocket] Connected to server");
            this.isConnected = true;
            this.updateStatus("");
        });

        this.socket.on('disconnect', () => {
            console.log("[ChessSocket] Disconnected");
            this.isConnected = false;
            this.updateStatus("(斷線中...)");
        });

        // Chess-specific events
        this.socket.on('chess_player_color', (color) => {
            console.log("[ChessSocket] Assigned color:", color);
            this.playerColor = color;
            const colorName = color === 'w' ? '白方 (先手)' : '黑方 (後手)';
            this.updateStatus(`您是${colorName}`);
        });

        this.socket.on('chess_waiting', () => {
            this.updateStatus("等待對手加入...");
        });

        this.socket.on('chess_game_start', () => {
            console.log("[ChessSocket] Game Start!");
            this.updateStatus("遊戲開始！");
            // Start the game
            if (window.ChessGame) {
                ChessGame.startNetworkGame(this.playerColor);
            }
        });

        this.socket.on('chess_remote_move', (moveData) => {
            console.log("[ChessSocket] Remote move:", moveData);
            if (window.ChessGame) {
                ChessGame.applyRemoteMove(moveData);
            }
        });

        this.socket.on('chess_room_full', () => {
            alert("房間已滿！請換一個房間號碼。");
            this.disconnect();
        });

        this.socket.on('chess_opponent_left', () => {
            this.updateStatus("對手已離開");
            if (window.ChessGame) {
                ChessGame.showGameOverOverlay("對手離開遊戲");
            }
        });
    },

    // Join a chess room
    joinRoom(roomId) {
        if (!this.socket) this.init();

        this.roomId = 'chess_' + roomId; // Prefix to avoid collision with Reversi rooms
        console.log("[ChessSocket] Joining room:", this.roomId);
        this.socket.emit('chess_join', { roomId: this.roomId });
    },

    // Send a move to opponent
    sendMove(moveData) {
        if (!this.socket || !this.roomId) return;
        console.log("[ChessSocket] Sending move:", moveData);
        this.socket.emit('chess_move', { roomId: this.roomId, move: moveData });
    },

    // Update lobby status
    updateStatus(message) {
        const statusEl = document.getElementById('chessConnectionStatus');
        if (statusEl) statusEl.textContent = message;
    },

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.roomId = null;
        this.playerColor = null;
    }
};

window.ChessSocket = ChessSocket;
