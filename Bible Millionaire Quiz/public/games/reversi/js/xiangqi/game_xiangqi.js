
const XiangqiGame = {
    game: null,
    boardEl: null,
    selected: null,
    validMoves: [],
    playerColor: 'r',
    gameMode: 'pvp', // 'pvp', 'pve', 'net'
    aiDifficulty: 5,
    aiColor: 'b',
    isAIThinking: false,
    isNetworkGame: false,
    flip: false, // If true, board is rotated 180 degrees (Black at bottom)

    // Piece character mapping
    piecesMap: {
        'r': { 'k': '帥', 'a': '仕', 'b': '相', 'n': '傌', 'r': '車', 'c': '炮', 'p': '兵' },
        'b': { 'k': '將', 'a': '士', 'b': '象', 'n': '馬', 'r': '車', 'c': '砲', 'p': '卒' }
    },

    // Calculate board dimensions dynamically
    getDimensions() {
        if (this.gameMode === 'dark') {
            // Dark Chess: 8x4 Grid. Margins of 0.5 gap each side => 9w x 5h units.
            // Fit within screen but leave some padding.
            const maxWidth = window.innerWidth * 0.9; // Reduced from 0.96
            const maxHeight = window.innerHeight * 0.8; // Reduced from 0.85

            // Calculate max gap that fits both constraints
            const gap = Math.min(maxWidth / 9, maxHeight / 5);

            const boardWidth = gap * 9;
            const boardHeight = gap * 5;
            const margin = gap / 2;
            const pieceSize = gap * 0.82; // Reduced size (was gap - 6) to stop touching lines

            return { boardWidth, boardHeight, gap, margin, pieceSize };
        }

        // Standard Xiangqi
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        const boardWidth = Math.min(vmin * 0.90, 650); // Increased limit slightly
        const gap = boardWidth / 9;
        const margin = gap / 2;
        const pieceSize = gap * 0.85; // Standard mode also slightly smaller
        return { boardWidth, boardHeight: boardWidth * 10 / 9, gap, margin, pieceSize };
    },

    // === Menu Navigation ===
    show() {
        document.getElementById('xiangqiApp').style.display = 'flex';
        document.getElementById('gameSelector').style.display = 'none';
        this.showXiangqiMenu();
    },

    showXiangqiMenu() {
        document.getElementById('xiangqiMenu').style.display = 'flex';
        document.getElementById('xiangqiPvEMenu').style.display = 'none';
        document.getElementById('xiangqiLobbyScreen').style.display = 'none';
        document.getElementById('xiangqiGameScreen').style.display = 'none';
    },

    showLobby() {
        document.getElementById('xiangqiMenu').style.display = 'none';
        document.getElementById('xiangqiLobbyScreen').style.display = 'flex';
        // Clear status
        this.setLobbyStatus("");
    },

    joinNetworkGame(roomId) {
        if (!roomId) return;
        this.setLobbyStatus("連線中...");
        XiangqiSocket.joinRoom(roomId);
    },

    setLobbyStatus(msg) {
        const el = document.getElementById('xqConnectionStatus');
        if (el) el.textContent = msg;
    },

    showPvEMenu() {
        document.getElementById('xiangqiMenu').style.display = 'none';
        document.getElementById('xiangqiPvEMenu').style.display = 'flex';
        this.setupDifficultyButtons();
    },

    showMainMenu() {
        document.getElementById('xiangqiApp').style.display = 'none';
        document.getElementById('gameSelector').style.display = 'flex';
    },

    setupDifficultyButtons() {
        const buttons = document.querySelectorAll('#xiangqiPvEMenu .diff-btn');
        buttons.forEach(btn => {
            btn.onclick = () => {
                const level = parseInt(btn.dataset.level);
                this.startPvE(level);
            };
        });
    },

    // === Game Modes ===
    startNetworkGame(color) {
        this.gameMode = 'net';
        this.isNetworkGame = true;
        this.playerColor = color;
        this.flip = (color === 'b'); // Rotate board if playing Black
        this.initGame();

        // If we are Black (second player), game starts immediately but Red moves first
        // If we are Red, we wait for Black? No, in socket_xiangqi.js we start when both join.
        this.updateStatus();
    },

    startPvP() {
        this.gameMode = 'pvp';
        this.isNetworkGame = false;
        this.flip = false;
        this.initGame();
    },

    startPvE(difficulty) {
        this.gameMode = 'pve';
        this.isNetworkGame = false;
        this.aiDifficulty = difficulty;
        this.aiColor = 'b'; // AI plays black
        this.playerColor = 'r'; // Player plays red
        this.flip = false;
        this.initGame();
    },

    startDarkChess() {
        this.gameMode = 'dark';
        this.isNetworkGame = false;
        this.flip = false;
        this.initGame();
    },

    initGame() {
        console.log(`Xiangqi Init - Mode: ${this.gameMode}, AI Level: ${this.aiDifficulty}`);
        if (this.gameMode === 'dark') {
            this.game = new Banqi();
        } else {
            this.game = new Xiangqi();
        }

        this.boardEl = document.getElementById('xiangqiBoard');
        this.selected = null;
        this.validMoves = [];
        this.isAIThinking = false;

        // Reset connection status message if needed
        const statusEl = document.getElementById('xiangqiStatus');
        if (statusEl) statusEl.textContent = "";

        document.getElementById('xiangqiMenu').style.display = 'none';
        document.getElementById('xiangqiPvEMenu').style.display = 'none';
        document.getElementById('xiangqiLobbyScreen').style.display = 'none';
        document.getElementById('xiangqiGameScreen').style.display = 'flex';

        this.renderBoard();
        this.renderPieces();
        this.renderCapturedPieces();
        this.updateStatus();
    },

    renderBoard() {
        const { boardWidth, boardHeight, gap, margin } = this.getDimensions();

        // Apply dimensions to the container directly to override CSS
        this.boardEl.style.width = `${boardWidth}px`;
        this.boardEl.style.height = `${boardHeight}px`;

        if (this.gameMode === 'dark') {
            // Dark Chess Board (4x8 Squares) - Red Lines, Paper Background

            let svg = `<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg">`;
            // Lighter paper background
            svg += `<rect x="0" y="0" width="${boardWidth}" height="${boardHeight}" fill="#f5e6d3" />`;

            const lineColor = "#cc0000";
            const lineWidth = 2;

            // Horizontal lines (5 lines for 4 rows)
            for (let i = 0; i < 5; i++) {
                const y = margin + i * gap;
                svg += `<line x1="${margin}" y1="${y}" x2="${margin + 8 * gap}" y2="${y}" stroke="${lineColor}" stroke-width="${lineWidth}" />`;
            }

            // Vertical lines (9 lines for 8 cols)
            for (let i = 0; i < 9; i++) {
                const x = margin + i * gap;
                svg += `<line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + 4 * gap}" stroke="${lineColor}" stroke-width="${lineWidth}" />`;
            }

            // Border (Double Border effect)
            const borderGap = 4;
            svg += `<rect x="${borderGap}" y="${borderGap}" width="${boardWidth - 2 * borderGap}" height="${boardHeight - 2 * borderGap}" stroke="${lineColor}" stroke-width="4" fill="none" />`;
            svg += `<rect x="${borderGap + 6}" y="${borderGap + 6}" width="${boardWidth - 2 * borderGap - 12}" height="${boardHeight - 2 * borderGap - 12}" stroke="${lineColor}" stroke-width="1" fill="none" />`;

            svg += `</svg>`;

            let html = `<div style="position: relative; width:100%; height:100%;">${svg}`;
            html += `<div id="xq-click-layer" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index: 10;"></div>`;
            html += `</div>`;
            this.boardEl.innerHTML = html;
        } else {
            // Standard Board
            let svg = `<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg">`;
            svg += `<rect x="0" y="0" width="${boardWidth}" height="${boardHeight}" fill="#e8c18c" />`;

            // Horizontal lines
            for (let r = 0; r < 10; r++) {
                const y = margin + r * gap;
                svg += `<line x1="${margin}" y1="${y}" x2="${boardWidth - margin}" y2="${y}" stroke="#5d4037" stroke-width="2" />`;
            }

            // Vertical lines (with river gap)
            for (let c = 0; c < 9; c++) {
                const x = margin + c * gap;
                svg += `<line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + 4 * gap}" stroke="#5d4037" stroke-width="2" />`;
                svg += `<line x1="${x}" y1="${margin + 5 * gap}" x2="${x}" y2="${margin + 9 * gap}" stroke="#5d4037" stroke-width="2" />`;
            }

            // Edge vertical lines (connect river)
            svg += `<line x1="${margin}" y1="${margin + 4 * gap}" x2="${margin}" y2="${margin + 5 * gap}" stroke="#5d4037" stroke-width="2" />`;
            svg += `<line x1="${boardWidth - margin}" y1="${margin + 4 * gap}" x2="${boardWidth - margin}" y2="${margin + 5 * gap}" stroke="#5d4037" stroke-width="2" />`;

            // Palaces
            svg += `<line x1="${margin + 3 * gap}" y1="${margin}" x2="${margin + 5 * gap}" y2="${margin + 2 * gap}" stroke="#5d4037" stroke-width="2" />`;
            svg += `<line x1="${margin + 5 * gap}" y1="${margin}" x2="${margin + 3 * gap}" y2="${margin + 2 * gap}" stroke="#5d4037" stroke-width="2" />`;
            svg += `<line x1="${margin + 3 * gap}" y1="${margin + 7 * gap}" x2="${margin + 5 * gap}" y2="${margin + 9 * gap}" stroke="#5d4037" stroke-width="2" />`;
            svg += `<line x1="${margin + 5 * gap}" y1="${margin + 7 * gap}" x2="${margin + 3 * gap}" y2="${margin + 9 * gap}" stroke="#5d4037" stroke-width="2" />`;

            // River Text
            const fontSize = gap * 0.5;
            svg += `<text x="${boardWidth / 2}" y="${margin + 4.65 * gap}" font-size="${fontSize}" text-anchor="middle" fill="#5d4037" font-family="KaiTi, serif">楚 河          漢 界</text>`;

            svg += `</svg>`;

            let html = `<div style="position: relative; width:${boardWidth}px; height:${boardHeight}px;">${svg}`;
            html += `<div id="xq-click-layer" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index: 10;"></div>`;
            html += `</div>`;

            this.boardEl.innerHTML = html;

            document.getElementById('xq-click-layer').addEventListener('click', (e) => this.handleBoardClick(e));
        }
    },

    renderPieces() {
        this.renderCapturedPieces();
        const oldPieces = this.boardEl.querySelectorAll('.xq-piece, .xq-piece-container, .xq-hint');
        oldPieces.forEach(p => p.remove());

        const { gap, margin, pieceSize } = this.getDimensions();
        const wrapper = this.boardEl.querySelector('div');
        const hintSize = pieceSize * 0.4;

        // Render valid move hints
        this.validMoves.forEach(move => {
            const hint = document.createElement('div');
            hint.className = 'xq-hint';
            hint.style.width = `${hintSize}px`;
            hint.style.height = `${hintSize}px`;
            const viewTo = this.flip ? { r: 9 - move.to.r, c: 8 - move.to.c } : move.to;
            hint.style.left = `${margin + viewTo.c * gap - hintSize / 2}px`;
            hint.style.top = `${margin + viewTo.r * gap - hintSize / 2}px`;
            hint.onclick = (e) => {
                e.stopPropagation();
                this.handleAction(move.to.r, move.to.c);
            };
            wrapper.appendChild(hint);
        });

        const rows = this.gameMode === 'dark' ? 4 : 10;
        const cols = this.gameMode === 'dark' ? 8 : 9;
        const validKeys = new Set();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const piece = this.game.get(r, c);
                if (piece) {
                    const key = `${r},${c}`;
                    validKeys.add(key);

                    // Try to find existing element
                    let el = wrapper.querySelector(`.xq-piece-container[data-rc="${key}"], .xq-piece[data-rc="${key}"]`);

                    let isNew = false;
                    if (!el) {
                        isNew = true;
                        el = document.createElement('div');
                        el.setAttribute('data-rc', key);

                        // Initial placement styles
                        el.style.width = `${pieceSize}px`;
                        el.style.height = `${pieceSize}px`;
                        el.onclick = (e) => {
                            e.stopPropagation();
                            this.handleAction(r, c);
                        };
                        wrapper.appendChild(el);
                    }

                    // Update Position (in case of resize, though resize usually calls full render)
                    // Visual R/C depends on flip
                    let viewR = r;
                    let viewC = c;
                    if (this.flip) {
                        viewR = (rows - 1) - r;
                        viewC = (cols - 1) - c;
                    }

                    // Dark Chess pieces are centered in squares, standard are at intersections
                    if (this.gameMode === 'dark') {
                        el.style.left = `${margin + viewC * gap + gap / 2 - pieceSize / 2}px`;
                        el.style.top = `${margin + viewR * gap + gap / 2 - pieceSize / 2}px`;
                    } else {
                        el.style.left = `${margin + viewC * gap - pieceSize / 2}px`;
                        el.style.top = `${margin + viewR * gap - pieceSize / 2}px`;
                    }


                    // Update Class & Content
                    if (this.gameMode === 'dark') {
                        // Dark Chess Container
                        el.className = `xq-piece-container ${piece.color}`;
                        // Manage Inner structure
                        if (isNew || el.innerHTML === "") {
                            const inner = document.createElement('div');
                            inner.className = 'xq-piece-inner';

                            const front = document.createElement('div');
                            front.className = `xq-piece-front ${piece.color}`;
                            front.style.fontSize = `${pieceSize * 0.6}px`;
                            front.textContent = this.piecesMap[piece.color][piece.type];

                            const back = document.createElement('div');
                            back.className = 'xq-piece-back';

                            inner.appendChild(front);
                            inner.appendChild(back);
                            el.appendChild(inner);
                        } else {
                            // Update existing front piece text and color if needed
                            const front = el.querySelector('.xq-piece-front');
                            if (front) {
                                front.className = `xq-piece-front ${piece.color}`;
                                front.textContent = this.piecesMap[piece.color][piece.type];
                            }
                        }

                        // Update Flipped State for Animation
                        if (!piece.covered) {
                            el.classList.add('flipped');
                        } else {
                            el.classList.remove('flipped');
                        }

                    } else {
                        // Standard Xiangqi Piece
                        el.className = `xq-piece ${piece.color}`;
                        el.style.fontSize = `${pieceSize * 0.6}px`;
                        el.textContent = this.piecesMap[piece.color][piece.type];
                        // Standard pieces don't use inner structure usually, but for consistency we could?
                        // Current CSS for .xq-piece doesn't support flip structure.
                        // So standard pieces are simple DIVs.
                    }

                    // Selected State
                    if (this.selected && this.selected.r === r && this.selected.c === c) {
                        el.classList.add('selected');
                    } else {
                        el.classList.remove('selected');
                    }

                    // Check State
                    if (piece.type === 'k' && piece.color === this.game.turn() && typeof this.game.in_check === 'function' && this.game.in_check(piece.color)) {
                        el.classList.add('in-check');
                    } else {
                        el.classList.remove('in-check');
                    }
                }
            }
        }

        // Remove pieces that are no longer on the board (captured or moved away - logic handles move largely by clearing old pos?)
        // If a piece moves from A to B:
        // loop at A: piece is null. Element at A is NOT in validKeys.
        // loop at B: piece is present. Element at B is found/created.
        // So we need to remove elements not in validKeys.

        const allPieces = wrapper.querySelectorAll('.xq-piece-container, .xq-piece');
        allPieces.forEach(el => {
            if (!validKeys.has(el.getAttribute('data-rc'))) {
                el.remove();
            }
        });
    },

    handleBoardClick(e) {
        const rect = this.boardEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { gap, margin } = this.getDimensions();

        let c = Math.round((x - margin) / gap);
        let r = Math.round((y - margin) / gap);

        if (this.gameMode === 'dark') {
            // In Dark Chess, pieces are in squares, so coordinate is determined by floor(value / gap)
            // But strict standard click logic for intersections is round().
            // For squares: 0 to gap is col 0. 
            // x - margin: starts at 0.
            c = Math.floor((x - margin) / gap);
            r = Math.floor((y - margin) / gap);
        }

        const rows = this.gameMode === 'dark' ? 4 : 10;
        const cols = this.gameMode === 'dark' ? 8 : 9;

        if (this.flip) {
            c = (cols - 1) - c;
            r = (rows - 1) - r;
        }

        if (c < 0 || c >= cols || r < 0 || r >= rows) return;
        this.handleAction(r, c);
    },

    handleAction(r, c) {
        // Check game over
        if (this.game.gameOver || (this.game.game_over && this.game.game_over())) return;

        if (this.isAIThinking) return;

        if (this.gameMode === 'dark') {
            // Dark Chess Logic
            const result = this.game.play({ type: 'flip', r, c });
            if (result && result.success) {
                this.selected = null;
                this.renderPieces();
                this.updateStatus();
                return;
            }

            // If flip failed, maybe it's a move?
            const piece = this.game.get(r, c);
            const myTurnColor = this.game.turn(); // 'r' or 'b'

            // Select own piece (face up)
            if (piece && !piece.covered && piece.color === myTurnColor) {
                this.selected = { r, c };
                this.renderPieces();
                // Show valid moves? Banqi is simpler, adjacent moves.
                // Optional: compute and show hints.
                return;
            }

            // Try to move to target
            if (this.selected) {
                const moveResult = this.game.play({
                    type: 'move',
                    r: this.selected.r,
                    c: this.selected.c,
                    toR: r,
                    toC: c
                });

                if (moveResult) {
                    this.selected = null;
                    this.renderPieces();
                    this.updateStatus();
                }
            }
            return;
        }

        if (this.isAIThinking) return; // Block input during AI turn

        // In PvE, only allow player to move their pieces
        if (this.gameMode === 'pve' && this.game.turn() === this.aiColor) return;

        // In Network mode, only allow player to move when it's their turn
        if (this.isNetworkGame && this.game.turn() !== this.playerColor) return;

        const piece = this.game.get(r, c);
        const turn = this.game.turn();

        if (piece && piece.color === turn) {
            console.log('Selected piece:', piece.type, 'at', r, c);
            this.selected = { r, c };
            const allMoves = this.game.moves();
            this.validMoves = allMoves.filter(m => m.from.r === r && m.from.c === c);
            console.log('Valid moves for', piece.type, ':', this.validMoves.length);
            this.renderPieces();
            return;
        }

        if (this.selected) {
            const move = { from: this.selected, to: { r, c } };

            if (this.game.move(move)) {
                this.selected = null;
                this.validMoves = [];
                this.renderPieces();
                this.updateStatus();

                if (this.game.game_over()) {
                    this.showGameOver();
                } else if (this.gameMode === 'pve' && this.game.turn() === this.aiColor) {
                    this.triggerAIMove();
                } else if (this.isNetworkGame) {
                    XiangqiSocket.sendMove(move);
                }
            } else {
                console.log("Invalid move");
            }
        }
    },

    renderCapturedPieces() {
        const captured = this.game.getCapturedPieces();
        // captured = { r: ['type', ...], b: ['type', ...] }

        const leftPanel = document.getElementById('xqCapturedLeft');
        const rightPanel = document.getElementById('xqCapturedRight');
        if (!leftPanel || !rightPanel) return;

        leftPanel.innerHTML = '';
        rightPanel.innerHTML = '';

        // Determine which side shows which color
        // If not flipped (Player Red at bottom):
        // Left: Black's lost pieces (Red captured) ?? 
        // Or Top (Black) captured pieces?
        // Let's stick to initial plan:
        // Left Panel: Black pieces captured (Lost by Black)
        // Right Panel: Red pieces captured (Lost by Red)
        // Wait, usually it's "My Graveyard" vs "Opponent's Graveyard"
        // If I am Red (Bottom), my captured pieces (Black pieces I took) should be near me? 
        // Or pieces I LOST?
        // Let's go with:
        // Left Panel (Upper/Opponent side): Red pieces captured (Lost by Red, held by Black)
        // Right Panel (Lower/Player side): Black pieces captured (Lost by Black, held by Red)

        // Actually, physically on screen:
        // Left Panel is vertically centered.
        // Let's just put:
        // Left Panel: Black Pieces (that were captured)
        // Right Panel: Red Pieces (that were captured)
        // Simple and clear.

        const renderPiece = (type, color, container) => {
            const el = document.createElement('div');
            el.className = `captured-piece ${color}`;
            el.textContent = this.piecesMap[color][type];
            container.appendChild(el);
        };

        // Render Black captured pieces (on Left)
        captured['b'].forEach(type => renderPiece(type, 'b', leftPanel));

        // Render Red captured pieces (on Right)
        captured['r'].forEach(type => renderPiece(type, 'r', rightPanel));
    },

    triggerAIMove() {
        this.isAIThinking = true;
        this.updateStatus();

        // Delay before calculating to show thinking
        setTimeout(() => {
            try {
                const aiMove = XiangqiAI.getBestMove(this.game, this.aiDifficulty);
                if (aiMove) {
                    // Show the move with animation
                    this.animateMove(aiMove, () => {
                        this.game.move(aiMove);
                        this.renderPieces();
                        this.updateStatus();
                        this.isAIThinking = false;

                        if (this.game.game_over()) {
                            this.showGameOver();
                        }
                    });
                } else {
                    this.isAIThinking = false;
                    this.updateStatus();
                }
            } catch (e) {
                console.error('AI Error:', e);
                this.isAIThinking = false;
                this.updateStatus();
            }
        }, 300);
    },

    applyRemoteMove(move) {
        if (!this.game.move(move)) {
            console.error("Invalid remote move received:", move);
            return;
        }

        // Show animation for remote move
        this.animateMove(move, () => {
            this.renderPieces();
            this.updateStatus();

            if (this.game.game_over()) {
                const winner = this.game.turn() === 'r' ? '黑方' : '紅方';
                this.showGameOver(`${winner} 獲勝！`);
            }
        });
    },

    setConnectionStatus(msg) {
        // Update Game Screen Title
        const titleEl = document.querySelector('#xiangqiGameScreen h1');
        if (titleEl) {
            // Restore title if empty msg, else show status
            if (!msg) titleEl.textContent = "中國象棋";
            else titleEl.textContent = `中國象棋 - ${msg}`;
        }

        // Update Lobby Status
        this.setLobbyStatus(msg);
    },

    animateMove(move, callback) {
        const { gap, margin, pieceSize } = this.getDimensions();
        const wrapper = this.boardEl.querySelector('div');

        // Find the piece element at from position
        const pieces = wrapper.querySelectorAll('.xq-piece');
        let pieceEl = null;

        for (const el of pieces) {
            const left = parseFloat(el.style.left);
            const top = parseFloat(el.style.top);
            const expectedLeft = margin + move.from.c * gap - pieceSize / 2;
            const expectedTop = margin + move.from.r * gap - pieceSize / 2;

            if (Math.abs(left - expectedLeft) < 5 && Math.abs(top - expectedTop) < 5) {
                pieceEl = el;
                break;
            }
        }

        if (pieceEl) {
            // Highlight the piece
            pieceEl.classList.add('ai-moving');

            // Calculate destination
            const destLeft = margin + move.to.c * gap - pieceSize / 2;
            const destTop = margin + move.to.r * gap - pieceSize / 2;

            // Animate with CSS transition
            pieceEl.style.transition = 'left 0.8s ease-out, top 0.8s ease-out';
            pieceEl.style.left = `${destLeft}px`;
            pieceEl.style.top = `${destTop}px`;

            // Wait for animation to complete
            setTimeout(() => {
                pieceEl.classList.remove('ai-moving');
                callback();
            }, 900);
        } else {
            // Fallback if piece not found
            callback();
        }
    },

    updateStatus() {
        const statusEl = document.getElementById('xiangqiStatus');
        const turnColor = this.game.turn();

        // Handle Dark Chess initial state (Color not assigned)
        let turnText = '';
        if (!turnColor && this.gameMode === 'dark') {
            turnText = '輪到: 先手 (請翻棋)';
        } else {
            turnText = turnColor === 'r' ? '輪到: 紅方' : '輪到: 黑方';
        }

        let status = turnText;

        if (this.isAIThinking) {
            status += ' 🤔';
        } else if (this.game.in_check && this.game.in_check(turnColor)) {
            status += ' ⚠️將軍';
        }

        statusEl.textContent = status;
    },

    showGameOver() {
        const winner = this.game.winner();
        const winnerName = winner === 'r' ? '紅方' : '黑方';
        const message = this.game.isCheckmate() ? `${winnerName} 將死獲勝！` : `${winnerName} 獲勝 (困斃)`;

        setTimeout(() => {
            alert(`🏆 遊戲結束！${message}`);
        }, 300);
    },

    undoMove() {
        if (this.game.history.length === 0) return;

        // In PvE, undo both player and AI moves
        if (this.gameMode === 'pve' && this.game.history.length >= 2) {
            this.game.undo();
            this.game.undo();
        } else {
            this.game.undo();
        }

        this.selected = null;
        this.validMoves = [];
        this.renderPieces();
        this.updateStatus();
    },

    restart() {
        this.initGame();
    }
};

window.XiangqiGame = XiangqiGame;
