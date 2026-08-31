const ChessGame = {
    game: null, // chess.js instance
    boardEl: null,

    // Game Settings
    gameMode: 'pve',    // 'pve', 'pvp', 'eve'
    aiEnabled: false,   // Will be set based on game mode
    aiPlaysWhite: false,
    aiPlaysBlack: true,
    aiDifficulty: 'normal', // 'easy', 'normal', 'hard'

    // Difficulty depth mapping
    difficultyDepth: {
        'easy': 3,
        'normal': 8,
        'hard': 15
    },

    // Show Chess App
    show() {
        document.getElementById('chessApp').style.display = 'block';
        document.getElementById('chessMenu').style.display = 'flex';
        document.getElementById('chessGameScreen').style.display = 'none';
        this.setupMenuEvents();
    },

    // Setup Menu Event Listeners
    setupMenuEvents() {
        // Difficulty buttons
        document.querySelectorAll('.chess-diff-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.chess-diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.aiDifficulty = btn.dataset.diff;
                document.getElementById('chessDifficulty').value = btn.dataset.diff;
                console.log('AI Difficulty set to:', this.aiDifficulty);
            };
        });

        // PvE Button
        document.getElementById('chessBtnPvE').onclick = () => this.startGame('pve');

        // PvP Button
        document.getElementById('chessBtnPvP').onclick = () => this.startGame('pvp');

        // Network Button - Show Lobby
        document.getElementById('chessBtnNet').onclick = () => this.showLobby();

        // EvE Button
        document.getElementById('chessBtnEvE').onclick = () => this.startGame('eve');

        // Lobby: Join Room Button
        document.getElementById('chessJoinRoomBtn').onclick = () => {
            const roomId = document.getElementById('chessRoomInput').value.trim();
            if (!roomId) {
                alert('請輸入房間號碼');
                return;
            }
            if (window.ChessSocket) {
                ChessSocket.init();
                ChessSocket.joinRoom(roomId);
            }
        };

        // Lobby: Back Button
        document.getElementById('chessBackFromLobby').onclick = () => {
            if (window.ChessSocket) ChessSocket.disconnect();
            this.showMenu();
        };
    },

    // Show Lobby Screen
    showLobby() {
        document.getElementById('chessMenu').style.display = 'none';
        document.getElementById('chessLobby').style.display = 'flex';
        document.getElementById('chessGameScreen').style.display = 'none';
    },

    // Start Game with Mode
    startGame(mode) {
        this.gameMode = mode;

        // Set AI flags based on mode
        if (mode === 'pve') {
            this.aiEnabled = true;
            this.aiPlaysWhite = false;
            this.aiPlaysBlack = true;
        } else if (mode === 'pvp') {
            this.aiEnabled = false;
            this.aiPlaysWhite = false;
            this.aiPlaysBlack = false;
        } else if (mode === 'eve') {
            this.aiEnabled = true;
            this.aiPlaysWhite = true;
            this.aiPlaysBlack = true;
        }

        // Show game screen
        document.getElementById('chessMenu').style.display = 'none';
        document.getElementById('chessGameScreen').style.display = 'flex';

        this.init();

        // For EvE, start AI immediately
        if (mode === 'eve') {
            setTimeout(() => this.requestAIMove(), 1000);
        }
    },

    // Start Network Game (called by ChessSocket when both players joined)
    startNetworkGame(playerColor) {
        this.gameMode = 'network';
        this.playerColor = playerColor; // 'w' or 'b'
        this.aiEnabled = false;
        this.aiPlaysWhite = false;
        this.aiPlaysBlack = false;
        this.isNetworkGame = true;

        // Show game screen
        document.getElementById('chessLobby').style.display = 'none';
        document.getElementById('chessGameScreen').style.display = 'flex';

        this.init();

        const colorName = playerColor === 'w' ? '白方 (先手)' : '黑方 (後手)';
        this.updateStatusMessage(`網路對戰 - 您是${colorName}`);
    },

    // Apply move from remote opponent
    applyRemoteMove(moveData) {
        if (!this.isNetworkGame) return;

        try {
            const move = this.game.move(moveData);
            if (move) {
                this.selectedSquare = null;
                this.renderBoard();
                this.updateStatus();
            }
        } catch (e) {
            console.error("Remote move error:", e);
        }
    },

    // Update status message
    updateStatusMessage(message) {
        const statusEl = document.getElementById('chessStatus');
        if (statusEl) statusEl.textContent = message;
    },

    // Show Menu (from game)
    showMenu() {
        document.getElementById('chessGameScreen').style.display = 'none';
        document.getElementById('chessLobby').style.display = 'none';
        document.getElementById('chessMenu').style.display = 'flex';
        this.isNetworkGame = false;
        if (window.ChessSocket) ChessSocket.disconnect();
    },

    // Restart Game (same mode)
    restart() {
        this.init();
        if (this.gameMode === 'eve') {
            setTimeout(() => this.requestAIMove(), 1000);
        }
    },

    // Undo Move
    undoMove() {
        if (this.aiEnabled && this.gameMode === 'pve') {
            // Undo both player and AI move
            this.game.undo();
            this.game.undo();
        } else {
            this.game.undo();
        }
        this.selectedSquare = null;
        this.renderBoard();
        this.updateStatus();
    },

    init() {
        console.log("Chess Game Initialized -", this.gameMode.toUpperCase(), "Mode");
        this.game = new Chess();
        this.boardEl = document.getElementById('chessBoard');
        this.selectedSquare = null;

        this.renderBoard();
        this.updateStatus();
        this.initAI();
    },

    renderBoard() {
        if (!this.boardEl) return;

        this.boardEl.innerHTML = '';

        const board = this.game.board(); // 8x8 array
        let validMoves = [];
        if (this.selectedSquare) {
            validMoves = this.game.moves({ square: this.selectedSquare, verbose: true }).map(m => m.to);
        }

        // SVG piece path mapping
        const svgPath = (color, type) => {
            const prefix = color === 'w' ? 'w' : 'b';
            const pieceMap = { 'k': 'K', 'q': 'Q', 'r': 'R', 'b': 'B', 'n': 'N', 'p': 'P' };
            return `assets/chess/svg/${prefix}${pieceMap[type]}.svg`;
        };

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                cell.className = 'chess-cell';
                const isDark = (r + c) % 2 === 1;
                cell.style.backgroundColor = isDark ? '#b58863' : '#f0d9b5';

                const pos = String.fromCharCode(97 + c) + (8 - r);

                // Highlight Selected
                if (this.selectedSquare === pos) {
                    cell.style.backgroundColor = '#ffff33'; // Bright yellow
                    cell.style.opacity = '0.8';
                }

                // Highlight Valid Moves (Green Dot)
                if (validMoves.includes(pos)) {
                    const hintEffect = document.createElement('div');
                    hintEffect.style.position = 'absolute';
                    hintEffect.style.width = '20px';
                    hintEffect.style.height = '20px';
                    hintEffect.style.borderRadius = '50%';
                    hintEffect.style.backgroundColor = 'rgba(0, 255, 0, 0.6)';
                    hintEffect.style.pointerEvents = 'none';
                    hintEffect.style.zIndex = '1';
                    cell.style.position = 'relative';
                    cell.appendChild(hintEffect);
                    cell.style.boxShadow = 'inset 0 0 10px rgba(0, 255, 0, 0.4)';
                }

                cell.style.display = 'flex';
                cell.style.justifyContent = 'center';
                cell.style.alignItems = 'center';
                cell.style.fontSize = '45px';
                cell.style.cursor = 'pointer';
                cell.dataset.pos = pos;

                const piece = board[r][c];
                if (piece) {
                    // Use SVG image with 3D-like CSS effects
                    const pieceImg = document.createElement('img');
                    pieceImg.src = svgPath(piece.color, piece.type);
                    pieceImg.alt = piece.type;
                    pieceImg.className = 'chess-piece-img'; // Apply 3D CSS effects
                    pieceImg.draggable = false;
                    cell.appendChild(pieceImg);
                }

                // Use addEventListener for better event handling
                const cellPos = pos; // Capture in closure
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Cell clicked:', cellPos);
                    this.handleCellClick(cellPos);
                });
                this.boardEl.appendChild(cell);
            }
        }
        console.log('Board rendered, cells:', this.boardEl.children.length);
    },

    selectedSquare: null,
    playerColor: null,
    isNetworkGame: false,

    handleCellClick(square) {
        // Network game: check if it's our turn
        if (this.isNetworkGame) {
            if (this.game.turn() !== this.playerColor) {
                console.log("Not your turn!");
                return;
            }
        }

        // If nothing selected, try to select
        if (!this.selectedSquare) {
            const piece = this.game.get(square);
            // In network mode, can only select own pieces
            const canSelect = this.isNetworkGame
                ? (piece && piece.color === this.playerColor)
                : (piece && piece.color === this.game.turn());

            if (canSelect) {
                this.selectedSquare = square;
                console.log("Selected:", square);
                this.renderBoard();
            }
            return;
        }

        // If clicking the same square, deselect
        if (this.selectedSquare === square) {
            this.selectedSquare = null;
            this.renderBoard();
            return;
        }

        // Try to move
        try {
            const moveData = {
                from: this.selectedSquare,
                to: square,
                promotion: 'q'
            };

            const move = this.game.move(moveData);

            if (move) {
                // Move successful
                this.selectedSquare = null;
                this.renderBoard();
                this.updateStatus();

                // Send move to network if in network game
                if (this.isNetworkGame && window.ChessSocket) {
                    ChessSocket.sendMove(moveData);
                }

                // Trigger AI move if applicable
                const currentTurn = this.game.turn();
                if (!this.game.game_over() && this.aiEnabled) {
                    if ((currentTurn === 'w' && this.aiPlaysWhite) ||
                        (currentTurn === 'b' && this.aiPlaysBlack)) {
                        setTimeout(() => this.requestAIMove(), 500);
                    }
                }
            } else {
                // Move failed/invalid
                // Check if user clicked their own piece instead (Switch Selection)
                const piece = this.game.get(square);
                if (piece && piece.color === this.game.turn()) {
                    this.selectedSquare = square;
                    console.log("Switched Selection:", square);
                    this.renderBoard();
                } else {
                    // Invalid move to empty square or enemy
                    console.log("Invalid move");
                }
            }
        } catch (e) {
            console.error("Move error:", e);
        }
    },

    updateStatus() {
        const statusEl = document.getElementById('chessStatus');
        if (statusEl) {
            let status = '';
            let moveColor = this.game.turn() === 'b' ? '黑方 (Black)' : '白方 (White)';
            let loserColor = this.game.turn(); // The side that is in checkmate

            if (this.game.in_checkmate()) {
                status = '🏆 遊戲結束，' + moveColor + ' 被將死！';
                this.showCheckmateAnimation(loserColor);
            } else if (this.game.in_draw()) {
                status = '🤝 遊戲結束，和局 (Draw)。';
                this.showDrawAnimation();
            } else {
                status = moveColor + ' 回合';
                if (this.game.in_check()) {
                    status += ' ⚠️ 將軍！';
                    this.showCheckAnimation(this.game.turn());
                }
            }
            statusEl.textContent = status;
        }
    },

    // Find king position for a given color
    findKingPosition(color) {
        const board = this.game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === color) {
                    return String.fromCharCode(97 + c) + (8 - r);
                }
            }
        }
        return null;
    },

    // Check animation (warning flash)
    showCheckAnimation(kingColor) {
        const kingPos = this.findKingPosition(kingColor);
        if (!kingPos) return;

        const cells = this.boardEl.querySelectorAll('.chess-cell');
        cells.forEach(cell => {
            if (cell.dataset.pos === kingPos) {
                cell.classList.add('king-in-check');
                setTimeout(() => cell.classList.remove('king-in-check'), 1500);
            }
        });
    },

    // Checkmate animation (dramatic ending)
    showCheckmateAnimation(loserColor) {
        const kingPos = this.findKingPosition(loserColor);
        if (!kingPos) return;

        const cells = this.boardEl.querySelectorAll('.chess-cell');
        cells.forEach(cell => {
            if (cell.dataset.pos === kingPos) {
                cell.classList.add('king-checkmate');
                const pieceImg = cell.querySelector('.chess-piece-img');
                if (pieceImg) {
                    pieceImg.classList.add('piece-defeated');
                }
            }
        });

        // Show game over overlay
        this.showGameOverOverlay(loserColor === 'w' ? '黑方勝利！' : '白方勝利！');
    },

    // Draw animation
    showDrawAnimation() {
        this.showGameOverOverlay('和局！');
    },

    // Game Over Overlay
    showGameOverOverlay(message) {
        // Remove existing overlay if any
        const existing = document.querySelector('.chess-game-over-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'chess-game-over-overlay';
        overlay.innerHTML = `
            <div class="game-over-content">
                <h2>${message}</h2>
                <button class="menu-btn" onclick="ChessGame.restart()">再來一局</button>
                <button class="menu-btn secondary" onclick="ChessGame.showMenu()">返回選單</button>
            </div>
        `;
        document.getElementById('chessGameScreen').appendChild(overlay);
    },

    // AI Integration
    makeRandomMove() {
        if (this.game.game_over()) return;
        const moves = this.game.moves();
        if (moves.length === 0) return;
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        this.game.move(randomMove);
        this.renderBoard();
        this.updateStatus();
    },

    requestAIMove() {
        if (this.game.game_over()) return;

        const fen = this.game.fen();
        const depth = this.difficultyDepth[this.aiDifficulty] || 8;

        // If ChessAI instance exists
        if (window.chessAI) {
            console.log("Requesting AI Move... (depth:", depth, ")");
            window.chessAI.getBestMove(fen, depth);
        } else {
            // Fallback to random if no Stockfish
            console.warn("Stockfish AI not loaded, using Random.");
            setTimeout(() => this.makeRandomMove(), 500);
        }
    },

    initAI() {
        if (window.ChessAI && !window.chessAI) {
            window.chessAI = new window.ChessAI();
            window.chessAI.onBestMove = (move) => {
                console.log("AI Best Move:", move);
                const from = move.substring(0, 2);
                const to = move.substring(2, 4);
                const promotion = move.length > 4 ? move.substring(4) : undefined;

                this.game.move({ from, to, promotion: promotion || 'q' });
                this.renderBoard();
                this.updateStatus();

                // Continue EvE mode or check if other AI should move
                if (!this.game.game_over() && this.aiEnabled) {
                    const currentTurn = this.game.turn();
                    if ((currentTurn === 'w' && this.aiPlaysWhite) ||
                        (currentTurn === 'b' && this.aiPlaysBlack)) {
                        setTimeout(() => this.requestAIMove(), 800);
                    }
                }
            };
        }
    }
};

// Expose
window.ChessGame = ChessGame;
