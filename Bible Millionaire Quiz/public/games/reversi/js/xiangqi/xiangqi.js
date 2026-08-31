
class Xiangqi {
    constructor() {
        this.board = Array(10).fill(null).map(() => Array(9).fill(null));
        this.turnColor = 'r'; // 'r' (Red) or 'b' (Black)
        this.history = [];
        this.init();
    }

    init() {
        // Clear board
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) this.board[r][c] = null;

        // Setup pieces
        const setupRow = (row, color, types) => {
            types.forEach((type, col) => {
                this.board[row][col] = { type, color };
            });
        };

        // Black (Top, Row 0-4)
        setupRow(0, 'b', ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r']);
        this.board[2][1] = { type: 'c', color: 'b' };
        this.board[2][7] = { type: 'c', color: 'b' };
        for (let i = 0; i < 9; i += 2) this.board[3][i] = { type: 'p', color: 'b' };

        // Red (Bottom, Row 5-9)
        setupRow(9, 'r', ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r']);
        this.board[7][1] = { type: 'c', color: 'r' };
        this.board[7][7] = { type: 'c', color: 'r' };
        for (let i = 0; i < 9; i += 2) this.board[6][i] = { type: 'p', color: 'r' };

        this.turnColor = 'r'; // Red goes first
    }

    get(r, c) {
        if (r < 0 || r > 9 || c < 0 || c > 8) return null;
        return this.board[r][c];
    }

    turn() {
        return this.turnColor;
    }

    move(move) {
        // move: { from: {r, c}, to: {r, c} }
        const { from, to } = move;
        const piece = this.get(from.r, from.c);

        // Basic validation
        if (!piece) return false;
        if (piece.color !== this.turnColor) return false;
        if (from.r === to.r && from.c === to.c) return false;

        const target = this.get(to.r, to.c);
        if (target && target.color === piece.color) return false; // Capture own piece

        // Validate specific piece rules
        if (!this.validateMove(piece, from, to)) return false;

        // Execute move
        this.history.push({
            move,
            captured: target,
            prevTurn: this.turnColor
        });

        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;

        // Check for Flying General (Generals facing each other with no pieces in between)
        if (this.isFlyingGeneral()) {
            this.undo(); // Illegal move
            return false;
        }

        // Switch turn
        this.turnColor = this.turnColor === 'r' ? 'b' : 'r';
        return true;
    }

    undo() {
        const last = this.history.pop();
        if (!last) return;

        const { move, captured, prevTurn } = last;
        this.board[move.from.r][move.from.c] = this.board[move.to.r][move.to.c];
        this.board[move.to.r][move.to.c] = captured;
        this.turnColor = prevTurn;
    }

    validateMove(piece, from, to) {
        const dr = to.r - from.r;
        const dc = to.c - from.c;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);

        switch (piece.type) {
            case 'k': // General (King)
                // Orthogonal 1 step, confined to palace
                if (!(absDr + absDc === 1)) return false;
                if (!this.inPalace(to.r, to.c, piece.color)) return false;
                return true;

            case 'a': // Advisor
                // Diagonal 1 step, confined to palace
                if (!(absDr === 1 && absDc === 1)) return false;
                if (!this.inPalace(to.r, to.c, piece.color)) return false;
                return true;

            case 'b': // Elephant (Bishop)
                // Diagonal 2 steps, cannot cross river
                if (!(absDr === 2 && absDc === 2)) return false;
                if (piece.color === 'r' && to.r < 5) return false; // Red cannot cross to top
                if (piece.color === 'b' && to.r > 4) return false; // Black cannot cross to bottom
                // Check block (Elephant eye)
                if (this.get(from.r + dr / 2, from.c + dc / 2)) return false;
                return true;

            case 'n': // Horse (Knight)
                // 1 ortho + 1 diag (L-shape). absDr*absDc == 2 means (1,2) or (2,1)
                if (!(absDr * absDc === 2)) return false;
                // Check block (Hobbling the horse's leg)
                // If moving vertical 2, check adjacent vertical. If horiz 2, check adjacent horiz.
                if (absDr === 2) {
                    if (this.get(from.r + dr / 2, from.c)) return false;
                } else {
                    if (this.get(from.r, from.c + dc / 2)) return false;
                }
                return true;

            case 'r': // Rook
                // Orthogonal any distance
                if (!(dr === 0 || dc === 0)) return false;
                // Check path clear
                if (this.countPiecesBetween(from, to) !== 0) return false;
                return true;

            case 'c': // Cannon
                // Orthogonal any distance
                if (!(dr === 0 || dc === 0)) return false;
                const cnt = this.countPiecesBetween(from, to);
                const target = this.get(to.r, to.c);
                if (!target) {
                    // Move: need 0 pieces between
                    return cnt === 0;
                } else {
                    // Capture: need 1 piece between (screen)
                    return cnt === 1;
                }

            case 'p': // Pawn (Soldier)
                if (piece.color === 'r') {
                    // Red moves up (dr < 0)
                    if (to.r > from.r) return false; // Cannot move back
                    if (to.r < 5) { // Crossed river
                        // Forward or Sideways 1 step
                        if (absDr + absDc !== 1) return false;
                    } else {
                        // Before river: only forward
                        if (dr !== -1 || dc !== 0) return false;
                    }
                } else {
                    // Black moves down (dr > 0)
                    if (to.r < from.r) return false; // Cannot move back
                    if (to.r > 4) { // Crossed river
                        if (absDr + absDc !== 1) return false;
                    } else {
                        if (dr !== 1 || dc !== 0) return false;
                    }
                }
                return true;
        }
    }

    inPalace(r, c, color) {
        if (c < 3 || c > 5) return false;
        if (color === 'r') return r >= 7 && r <= 9;
        if (color === 'b') return r >= 0 && r <= 2;
        return false;
    }

    countPiecesBetween(from, to) {
        let cnt = 0;
        if (from.r === to.r) {
            const min = Math.min(from.c, to.c);
            const max = Math.max(from.c, to.c);
            for (let c = min + 1; c < max; c++) {
                if (this.board[from.r][c]) cnt++;
            }
        } else {
            const min = Math.min(from.r, to.r);
            const max = Math.max(from.r, to.r);
            for (let r = min + 1; r < max; r++) {
                if (this.board[r][from.c]) cnt++;
            }
        }
        return cnt;
    }

    isFlyingGeneral() {
        let rKing = null, bKing = null;
        // Find kings
        for (let r = 0; r < 10; r++) {
            for (let c = 3; c <= 5; c++) {
                const p = this.board[r][c];
                if (p && p.type === 'k') {
                    if (p.color === 'r') rKing = { r, c };
                    else bKing = { r, c };
                }
            }
        }
        if (!rKing || !bKing) return false; // Should not happen
        if (rKing.c !== bKing.c) return false; // Not on same file

        // Check if any pieces between
        const piecesBetween = this.countPiecesBetween(rKing, bKing);
        return piecesBetween === 0;
    }

    // Check if current player is in check
    in_check(color) {
        // Not strictly efficiently implemented, but good for validity
        // Find King of 'color'
        let kingPos = null;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const p = this.board[r][c];
                if (p && p.type === 'k' && p.color === color) {
                    kingPos = { r, c };
                    break;
                }
            }
        }
        if (!kingPos) return true; // King missing?

        // Check if attacked by any enemy piece
        const enemyColor = color === 'r' ? 'b' : 'r';
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const p = this.board[r][c];
                if (p && p.color === enemyColor) {
                    // Can p attack kingPos?
                    // Use validateMove (without checking turn or recursion)
                    // We need a raw validate
                    // Note: validateMove checks "inPalace" etc which is fine.
                    // Special: Flying General is a rule, but handled by move(). 
                    // Here we just check regular moves.
                    // Optimization: Actually, reusing validateMove is tricky because it might not account for all "capture" logic vs "move" logic distinct enough?
                    // No, validateMove handles capture logic (target presence).
                    if (this.validateMove(p, { r, c }, kingPos)) return true;
                }
            }
        }

        // Flying General check is also a form of "check"
        // If kings face each other, it is illegal state, but if it's the player's turn to move and they are facing, they ARE in check effectively or rather it is a "check" condition if the enemy moved to open the line.
        // Actually, in Xiangqi, you cannot MAKE a move that leaves Kings facing. 
        // If the enemy moves a piece opening the line, that IS a check.
        // My isFlyingGeneral check is post-move.
        return this.isFlyingGeneral();
    }

    // getAllValidMoves()
    moves() {
        const validMoves = [];
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const p = this.board[r][c];
                if (p && p.color === this.turnColor) {
                    // Try all targets
                    // Optimization: restrict loop based on piece type
                    // For now, brute force all board spots (90 spots) is okay for JS
                    for (let tr = 0; tr < 10; tr++) {
                        for (let tc = 0; tc < 9; tc++) {
                            const move = { from: { r, c }, to: { r: tr, c: tc } };
                            if (this.validateMove(p, move.from, move.to)) {
                                // Simulate move to check for self-check
                                const target = this.board[tr][tc];
                                if (target && target.color === p.color) continue;

                                // Try
                                this.board[tr][tc] = p;
                                this.board[r][c] = null;

                                const illegal = this.in_check(this.turnColor) || this.isFlyingGeneral();

                                // Revert
                                this.board[r][c] = p;
                                this.board[tr][tc] = target;

                                if (!illegal) {
                                    validMoves.push(move);
                                }
                            }
                        }
                    }
                }
            }
        }
        return validMoves;
    }

    // Check if current player is in checkmate (in check and no valid moves)
    isCheckmate() {
        if (!this.in_check(this.turnColor)) return false;
        return this.moves().length === 0;
    }

    // Check if current player has no valid moves (stalemate in Xiangqi is usually a loss)
    isStalemate() {
        if (this.in_check(this.turnColor)) return false;
        return this.moves().length === 0;
    }

    // General game over check
    game_over() {
        return this.isCheckmate() || this.isStalemate();
    }

    // Get winner: 'r', 'b', or null (if game not over)
    winner() {
        if (!this.game_over()) return null;
        // The player whose turn it is has lost (they are checkmated or stalemated)
        return this.turnColor === 'r' ? 'b' : 'r';
    }

    getCapturedPieces() {
        const captured = { r: [], b: [] };
        this.history.forEach(h => {
            if (h.captured) {
                // h.captured is the piece object { type, color }
                captured[h.captured.color].push(h.captured.type);
            }
        });
        return captured;
    }
}

if (typeof window !== 'undefined') {
    window.Xiangqi = Xiangqi;
}
