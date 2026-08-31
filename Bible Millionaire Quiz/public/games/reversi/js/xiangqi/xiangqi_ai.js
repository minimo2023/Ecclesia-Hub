/**
 * Xiangqi AI - Minimax with Alpha-Beta Pruning
 * Difficulty 1-10 (search depth 1-5, with evaluation complexity scaling)
 */

const XiangqiAI = {
    // Piece values (centipawn-like scale)
    PIECE_VALUES: {
        'k': 10000,  // King - infinite value
        'r': 1000,   // Rook
        'c': 500,    // Cannon
        'n': 450,    // Horse
        'b': 200,    // Elephant
        'a': 200,    // Advisor
        'p': 100     // Pawn
    },

    // Position value tables (10x9, from Red's perspective)
    // Higher values = better positions
    POSITION_TABLES: {
        // Rook - center files, penetration
        'r': [
            [14, 14, 12, 18, 16, 18, 12, 14, 14],
            [16, 20, 18, 24, 26, 24, 18, 20, 16],
            [12, 12, 12, 18, 18, 18, 12, 12, 12],
            [12, 18, 16, 22, 22, 22, 16, 18, 12],
            [12, 14, 12, 18, 18, 18, 12, 14, 12],
            [12, 16, 14, 20, 20, 20, 14, 16, 12],
            [6, 10, 8, 14, 14, 14, 8, 10, 6],
            [4, 8, 6, 14, 12, 14, 6, 8, 4],
            [8, 4, 8, 16, 8, 16, 8, 4, 8],
            [-2, 10, 6, 14, 12, 14, 6, 10, -2]
        ],
        // Cannon - avoid corners, center control
        'c': [
            [6, 4, 0, -10, -12, -10, 0, 4, 6],
            [2, 2, 0, -4, -14, -4, 0, 2, 2],
            [2, 2, 0, -10, -8, -10, 0, 2, 2],
            [0, 0, -2, 4, 10, 4, -2, 0, 0],
            [0, 0, 0, 2, 8, 2, 0, 0, 0],
            [-2, 0, 4, 2, 6, 2, 4, 0, -2],
            [0, 0, 0, 2, 4, 2, 0, 0, 0],
            [4, 0, 8, 6, 10, 6, 8, 0, 4],
            [0, 2, 4, -2, 6, -2, 4, 2, 0],
            [0, 0, 2, 6, 6, 6, 2, 0, 0]
        ],
        // Horse - center, avoid edge
        'n': [
            [4, 8, 16, 12, 4, 12, 16, 8, 4],
            [4, 10, 28, 16, 8, 16, 28, 10, 4],
            [12, 14, 16, 20, 18, 20, 16, 14, 12],
            [8, 24, 18, 24, 20, 24, 18, 24, 8],
            [6, 16, 14, 18, 16, 18, 14, 16, 6],
            [4, 12, 16, 14, 12, 14, 16, 12, 4],
            [2, 6, 8, 6, 10, 6, 8, 6, 2],
            [4, 2, 8, 8, 4, 8, 8, 2, 4],
            [0, 2, 4, 4, -2, 4, 4, 2, 0],
            [0, -4, 0, 0, 0, 0, 0, -4, 0]
        ],
        // Pawn - advanced pawns are much stronger
        'p': [
            [0, 3, 6, 9, 12, 9, 6, 3, 0],
            [18, 36, 56, 80, 120, 80, 56, 36, 18],
            [14, 26, 42, 60, 80, 60, 42, 26, 14],
            [10, 20, 30, 34, 40, 34, 30, 20, 10],
            [6, 12, 18, 18, 20, 18, 18, 12, 6],
            [2, 0, 8, 0, 8, 0, 8, 0, 2],
            [0, 0, -2, 0, 4, 0, -2, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0]
        ],
        // Advisor - stay in palace center
        'a': [
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 20, 0, 20, 0, 0, 0],
            [0, 0, 0, 0, 23, 0, 0, 0, 0],
            [0, 0, 0, 20, 0, 20, 0, 0, 0]
        ],
        // Elephant - protect, not too exposed
        'b': [
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 20, 0, 0, 0, 20, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [18, 0, 0, 0, 23, 0, 0, 0, 18],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 20, 0, 0, 0, 20, 0, 0]
        ],
        // King - stay in palace
        'k': [
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 1, 5, 1, 0, 0, 0],
            [0, 0, 0, -8, -8, -8, 0, 0, 0],
            [0, 0, 0, 5, 8, 5, 0, 0, 0]
        ]
    },

    // Difficulty settings (1-10)
    // depth: search depth, randomness: adds noise to evaluation
    DIFFICULTY: {
        1: { depth: 1, randomness: 50 },
        2: { depth: 1, randomness: 30 },
        3: { depth: 2, randomness: 25 },
        4: { depth: 2, randomness: 15 },
        5: { depth: 3, randomness: 10 },
        6: { depth: 3, randomness: 5 },
        7: { depth: 4, randomness: 3 },
        8: { depth: 4, randomness: 1 },
        9: { depth: 5, randomness: 0 },
        10: { depth: 5, randomness: 0, quiescence: true }
    },

    /**
     * Evaluate board position from perspective of 'color'
     */
    evaluate(game, color) {
        let score = 0;
        const enemyColor = color === 'r' ? 'b' : 'r';

        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = game.board[r][c];
                if (!piece) continue;

                // Get piece value
                let value = this.PIECE_VALUES[piece.type];

                // Get position value (flip for black)
                const posTable = this.POSITION_TABLES[piece.type];
                if (posTable) {
                    const posRow = piece.color === 'r' ? r : (9 - r);
                    value += posTable[posRow][c];
                }

                // Add or subtract based on color
                if (piece.color === color) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }

        // Bonus for checking enemy
        if (game.in_check(enemyColor)) {
            score += 50;
        }

        // Penalty for being in check
        if (game.in_check(color)) {
            score -= 30;
        }

        return score;
    },

    /**
     * Minimax with Alpha-Beta Pruning
     */
    minimax(game, depth, alpha, beta, maximizing, aiColor) {
        // Terminal conditions
        if (depth === 0 || game.game_over()) {
            return { score: this.evaluate(game, aiColor), move: null };
        }

        const moves = game.moves();
        if (moves.length === 0) {
            // No moves = game over for current player
            return { score: maximizing ? -99999 : 99999, move: null };
        }

        let bestMove = moves[0];

        if (maximizing) {
            let maxScore = -Infinity;
            for (const move of moves) {
                // Make move
                const captured = game.board[move.to.r][move.to.c];
                const piece = game.board[move.from.r][move.from.c];
                game.board[move.to.r][move.to.c] = piece;
                game.board[move.from.r][move.from.c] = null;
                game.turnColor = game.turnColor === 'r' ? 'b' : 'r';

                const result = this.minimax(game, depth - 1, alpha, beta, false, aiColor);

                // Undo move
                game.board[move.from.r][move.from.c] = piece;
                game.board[move.to.r][move.to.c] = captured;
                game.turnColor = game.turnColor === 'r' ? 'b' : 'r';

                if (result.score > maxScore) {
                    maxScore = result.score;
                    bestMove = move;
                }
                alpha = Math.max(alpha, result.score);
                if (beta <= alpha) break; // Prune
            }
            return { score: maxScore, move: bestMove };
        } else {
            let minScore = Infinity;
            for (const move of moves) {
                // Make move
                const captured = game.board[move.to.r][move.to.c];
                const piece = game.board[move.from.r][move.from.c];
                game.board[move.to.r][move.to.c] = piece;
                game.board[move.from.r][move.from.c] = null;
                game.turnColor = game.turnColor === 'r' ? 'b' : 'r';

                const result = this.minimax(game, depth - 1, alpha, beta, true, aiColor);

                // Undo move
                game.board[move.from.r][move.from.c] = piece;
                game.board[move.to.r][move.to.c] = captured;
                game.turnColor = game.turnColor === 'r' ? 'b' : 'r';

                if (result.score < minScore) {
                    minScore = result.score;
                    bestMove = move;
                }
                beta = Math.min(beta, result.score);
                if (beta <= alpha) break; // Prune
            }
            return { score: minScore, move: bestMove };
        }
    },

    /**
     * Get best move for AI
     * @param {Xiangqi} game - Game instance
     * @param {number} difficulty - 1-10
     * @returns {object} Best move { from: {r,c}, to: {r,c} }
     */
    getBestMove(game, difficulty = 5) {
        console.log('AI: Starting getBestMove, difficulty:', difficulty);
        const settings = this.DIFFICULTY[difficulty] || this.DIFFICULTY[5];
        const aiColor = game.turn();

        console.log('AI: Calling minimax with depth:', settings.depth);
        const result = this.minimax(game, settings.depth, -Infinity, Infinity, true, aiColor);
        console.log('AI: Minimax returned:', result);

        // Add randomness for lower difficulties
        if (settings.randomness > 0) {
            const moves = game.moves();
            if (moves.length > 1 && Math.random() * 100 < settings.randomness) {
                // Pick a random move sometimes
                return moves[Math.floor(Math.random() * moves.length)];
            }
        }

        return result.move;
    }
};

if (typeof window !== 'undefined') {
    window.XiangqiAI = XiangqiAI;
}
