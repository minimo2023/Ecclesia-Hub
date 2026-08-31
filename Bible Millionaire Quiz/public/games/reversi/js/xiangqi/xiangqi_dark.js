
class Banqi {
    constructor() {
        this.rows = 4;
        this.cols = 8;
        this.board = []; // [row][col] -> { type, color, covered: true/false } or null
        this.turnPlayer = 0; // 0 = Player 1 (First), 1 = Player 2
        this.myColor = null; // Color of Player 1
        this.colors = [null, null]; // [Player1Color, Player2Color]
        this.history = [];
        this.gameOver = false;
        this.init();
    }

    init() {
        this.board = Array(4).fill(null).map(() => Array(8).fill(null));
        this.turnPlayer = 0;
        this.colors = [null, null];
        this.gameOver = false;

        // Define pieces
        const pieces = [];
        // Red
        pieces.push({ type: 'k', color: 'r', rank: 7 }); // Gen
        pieces.push(...Array(2).fill({ type: 'a', color: 'r', rank: 6 })); // Adv
        pieces.push(...Array(2).fill({ type: 'b', color: 'r', rank: 5 })); // Ele
        pieces.push(...Array(2).fill({ type: 'r', color: 'r', rank: 4 })); // Rook
        pieces.push(...Array(2).fill({ type: 'n', color: 'r', rank: 3 })); // Horse
        pieces.push(...Array(2).fill({ type: 'c', color: 'r', rank: 2 })); // Canon
        pieces.push(...Array(5).fill({ type: 'p', color: 'r', rank: 1 })); // Pawn

        // Black
        pieces.push({ type: 'k', color: 'b', rank: 7 });
        pieces.push(...Array(2).fill({ type: 'a', color: 'b', rank: 6 }));
        pieces.push(...Array(2).fill({ type: 'b', color: 'b', rank: 5 }));
        pieces.push(...Array(2).fill({ type: 'r', color: 'b', rank: 4 }));
        pieces.push(...Array(2).fill({ type: 'n', color: 'b', rank: 3 }));
        pieces.push(...Array(2).fill({ type: 'c', color: 'b', rank: 2 }));
        pieces.push(...Array(5).fill({ type: 'p', color: 'b', rank: 1 }));

        // Shuffle
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }

        // Place on board
        let idx = 0;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 8; c++) {
                // Determine rank for hierarchy comparison
                // K(7) > A(6) > B(5) > R(4) > N(3) > C(2) > P(1)
                // Exception: P(1) can eat K(7)
                this.board[r][c] = {
                    ...pieces[idx++],
                    covered: true
                };
            }
        }
    }

    get(r, c) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
        return this.board[r][c];
    }

    // Returns 'r' or 'b' if determined, else null
    turn() {
        return this.colors[this.turnPlayer];
    }

    // Action: { type: 'flip'|'move', r, c, toR, toC }
    play(action) {
        if (this.gameOver) return false;

        const { r, c } = action;
        const p = this.get(r, c);
        if (!p) return false;

        if (action.type === 'flip') {
            if (!p.covered) return false;

            p.covered = false;

            // Assign colors if not yet assigned
            if (this.colors[0] === null) {
                this.colors[this.turnPlayer] = p.color;
                this.colors[1 - this.turnPlayer] = p.color === 'r' ? 'b' : 'r';
            }

            this.endTurn();

            this.history.push({
                type: 'flip',
                r, c,
                piece: { type: p.type, color: p.color }
            });

            return { success: true, action: 'flip', piece: p };
        }
        else if (action.type === 'move') {
            const { toR, toC } = action;
            if (p.covered) return false;

            // Check turn color owner
            if (this.colors[this.turnPlayer] !== p.color) return false;

            // Validate Move
            const dr = Math.abs(toR - r);
            const dc = Math.abs(toC - c);
            const target = this.get(toR, toC);

            // Cannot move to same spot
            if (dr === 0 && dc === 0) return false;

            // Common rule: 1 step orthogonal
            const isOneStep = (dr + dc === 1);

            if (p.type === 'c') {
                // Canon Mechanics
                if (target && !target.covered) {
                    // Canon Capture: Need screen
                    if (!this.canCanonCapture(r, c, toR, toC)) return false;
                } else {
                    // Canon Move: 1 step
                    if (!isOneStep) return false;
                    if (target) return false; // Cannot move to occupied (unless capture rule logic handled above but for canon move is strict 1 step empty)
                }
            } else {
                // Normal Piece
                if (!isOneStep) return false;
            }

            // Target Interaction
            if (target) {
                if (target.covered) return false; // Cannot eat covered
                if (target.color === p.color) return false; // Own piece

                if (p.type !== 'c') {
                    // Hierarchy Check
                    if (!this.canCapture(p, target)) return false;
                }
                // If canon, capture hierarchy is standard? Yes, Canon(2) just needs screen logic, 
                // but usually Canon can capture ANY piece? Or obey hierarchy?
                // Standard Banqi: Canon can capture ANY piece (except maybe itself? no specific exceptions usually).
                // Actually Banqi Canon captures ANYTHING as long as there is a screen.
            }

            // Execute Move
            this.board[toR][toC] = p;
            this.board[r][c] = null;

            this.history.push({
                type: 'move',
                from: { r, c },
                to: { toR, toC },
                piece: { type: p.type, color: p.color }, // Store copy
                captured: target ? { type: target.type, color: target.color } : null
            });

            this.endTurn();
            return { success: true, action: 'move', captured: target };
        }
    }

    canCapture(attacker, defender) {
        const a = attacker.rank;
        const d = defender.rank;

        // Pawn (1) vs King (7)
        if (a === 1 && d === 7) return true;
        // King (7) vs Pawn (1) - usually King cannot eat Pawn in some variants, but Taiwan rules say King > Pawn.
        // Wait, "King cannot eat Pawn" is common?
        // Let's verify: In Taiwan rules, General > everything except Pawn. Pawn > General.
        // General CANNOT eat Pawn?
        // Most common: King > A > B > R > N > C > P.
        // P > K. 
        // K cannot eat P? Yes, K cannot eat P is standard.
        // Let's implement K cannot eat P.
        if (a === 7 && d === 1) return false;

        // Standard Hierarchy
        return a >= d;
    }

    canCanonCapture(r, c, toR, toC) {
        if (r !== toR && c !== toC) return false; // Must be linear

        // Check pieces between
        let screens = 0;
        if (r === toR) {
            const min = Math.min(c, toC);
            const max = Math.max(c, toC);
            for (let k = min + 1; k < max; k++) {
                if (this.board[r][k]) screens++;
            }
        } else {
            const min = Math.min(r, toR);
            const max = Math.max(r, toR);
            for (let k = min + 1; k < max; k++) {
                if (this.board[k][c]) screens++;
            }
        }
        return screens === 1;
    }

    endTurn() {
        this.turnPlayer = 1 - this.turnPlayer;
        this.checkWin();
    }

    checkWin() {
        if (this.colors[0] === null) return; // Game too early

        const p1Color = this.colors[0];
        const p2Color = this.colors[1];

        let p1Alive = false;
        let p2Alive = false;

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p && !p.covered) {
                    if (p.color === p1Color) p1Alive = true;
                    if (p.color === p2Color) p2Alive = true;
                }
                // If covered pieces exist, game continues? 
                // Usually yes. If you lose all FACE UP pieces, and have covered pieces, 
                // you are not dead yet? 
                // Yes, you can flip.
                // But we can check if there are ANY pieces of that color left (covered or not).
                // Actually covered pieces color is known in data, so we can check.
                if (p && p.covered) {
                    if (p.color === p1Color) p1Alive = true;
                    if (p.color === p2Color) p2Alive = true;
                }
            }
        }

        if (!p1Alive) {
            this.gameOver = true;
            this.winner = 1; // Player 2 Wins
        } else if (!p2Alive) {
            this.gameOver = true;
            this.winner = 0; // Player 1 Wins
        }
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

    // Compatibility Interface
    turn() {
        if (this.colors[this.turnPlayer]) {
            return this.colors[this.turnPlayer];
        }
        return null; // Undecided
    }

    game_over() {
        return this.gameOver;
    }

    winner() {
        if (!this.gameOver) return null;
        // this.winner is index 0 or 1
        // return expected 'r' or 'b'
        // If undefined/null handled by logic
        if (this.colors[this.winner]) return this.colors[this.winner];
        // If color not assigned?? Impossible if game over.
        return null;
    }

    in_check() { return false; }
    isCheckmate() { return false; }
}

if (typeof window !== 'undefined') {
    window.Banqi = Banqi;
}

if (typeof module !== 'undefined') {
    module.exports = Banqi;
}
