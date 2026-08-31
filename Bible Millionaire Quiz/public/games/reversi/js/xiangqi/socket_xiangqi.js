// socket_xiangqi.js - Xiangqi-specific Socket.io Client
const XiangqiSocket = {
    socket: null,
    roomId: null,
    playerColor: null, // 'r' or 'b'
    isConnected: false,

    // Initialize socket connection
    init() {
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }

        // Use explicit URL based on current page origin
        const socketUrl = window.location.origin;
        this.socket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });

        this.setupListeners();
    },

    setupListeners() {
        this.socket.on('connect', () => {
            console.log("[XiangqiSocket] Connected to server");
            this.isConnected = true;
            this.updateStatus("");
        });

        this.socket.on('disconnect', () => {
            console.log("[XiangqiSocket] Disconnected");
            this.isConnected = false;
            this.updateStatus("(斷線中...)");
        });

        // Xiangqi-specific events
        this.socket.on('xiangqi_player_color', (color) => {
            console.log("[XiangqiSocket] Assigned color:", color);
            this.playerColor = color;
            const colorName = color === 'r' ? '紅方 (先手)' : '黑方 (後手)';
            this.updateStatus(`您是${colorName}`);
        });

        this.socket.on('xiangqi_waiting', () => {
            this.updateStatus("等待對手加入...");
        });

        this.socket.on('xiangqi_game_start', () => {
            console.log("[XiangqiSocket] Game Start!");
            this.updateStatus("遊戲開始！");
            // Start the game
            if (window.XiangqiGame) {
                XiangqiGame.startNetworkGame(this.playerColor);
            }
        });

        this.socket.on('xiangqi_remote_move', (moveData) => {
            console.log("[XiangqiSocket] Remote move:", moveData);
            if (window.XiangqiGame) {
                XiangqiGame.applyRemoteMove(moveData);
            }
        });

        this.socket.on('xiangqi_room_full', () => {
            alert("房間已滿！請換一個房間號碼。");
            this.disconnect();
        });

        this.socket.on('xiangqi_opponent_left', () => {
            this.updateStatus("對手已離開");
            if (window.XiangqiGame) {
                XiangqiGame.showGameOver("對手離開遊戲");
            }
        });
    },

    // Join a xiangqi room
    joinRoom(roomId) {
        if (!this.socket) this.init();

        this.roomId = 'xq_' + roomId; // Prefix to avoid collision
        console.log("[XiangqiSocket] Joining room:", this.roomId);
        this.socket.emit('xiangqi_join', { roomId: this.roomId });
    },

    // Send a move to opponent
    sendMove(moveData) {
        if (!this.socket || !this.roomId) return;
        console.log("[XiangqiSocket] Sending move:", moveData);
        this.socket.emit('xiangqi_move', { roomId: this.roomId, move: moveData });
    },

    // Update lobby status
    updateStatus(message) {
        // We will likely add a distinct connection status element or reuse the existing one
        const statusEl = document.getElementById('xiangqiStatus');
        if (statusEl) {
            // Append connection status to game status if relevant, or handle differently
            // For now, let's just log or set it if game hasn't started
            if (!message) return; // Ignore clear
            // Hacky: append to title or status?
            // Better: XiangqiGame should expose a setConnectionStatus method
            if (window.XiangqiGame) {
                XiangqiGame.setConnectionStatus(message);
            }
        }
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

window.XiangqiSocket = XiangqiSocket;
