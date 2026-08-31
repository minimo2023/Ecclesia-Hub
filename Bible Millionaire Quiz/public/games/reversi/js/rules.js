const ReversiRules = {
    // Initialize the board with specific size (default 8)
    initBoard(size = 8) {
        const board = Array(size).fill(null).map(() => Array(size).fill(0));
        const mid = size / 2;
        // 1: Black, 2: White
        // Standard Othello setup
        board[mid - 1][mid - 1] = 2; // White
        board[mid][mid] = 2;         // White
        board[mid - 1][mid] = 1;     // Black
        board[mid][mid - 1] = 1;     // Black
        return board;
    },

    // Directions to check: [row_delta, col_delta]
    directions: [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ],

    isValidMove(board, row, col, player) {
        const size = board.length;
        if (row < 0 || row >= size || col < 0 || col >= size) return false;
        if (board[row][col] !== 0) return false;

        const opponent = player === 1 ? 2 : 1;

        // Check all 8 directions
        for (let [dr, dc] of this.directions) {
            let r = row + dr;
            let c = col + dc;
            let foundOpponent = false;

            while (r >= 0 && r < size && c >= 0 && c < size) {
                if (board[r][c] === opponent) {
                    foundOpponent = true;
                } else if (board[r][c] === player) {
                    if (foundOpponent) return true; // Valid capture found
                    break;
                } else {
                    break; // Empty cell
                }
                r += dr;
                c += dc;
            }
        }
        return false;
    },

    getValidMoves(board, player) {
        const moves = [];
        const size = board.length;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (this.isValidMove(board, r, c, player)) {
                    moves.push({ row: r, col: c });
                }
            }
        }
        return moves;
    },

    makeMove(board, row, col, player) {
        if (!this.isValidMove(board, row, col, player)) return false;

        const newBoard = board.map(row => [...row]); // Deep copy
        newBoard[row][col] = player;
        const opponent = player === 1 ? 2 : 1;
        const size = board.length;

        for (let [dr, dc] of this.directions) {
            let r = row + dr;
            let c = col + dc;
            let cellsToFlip = [];

            while (r >= 0 && r < size && c >= 0 && c < size) {
                if (newBoard[r][c] === opponent) {
                    cellsToFlip.push({ r, c });
                } else if (newBoard[r][c] === player) {
                    // Found closure, flip all accumulated cells
                    for (let cell of cellsToFlip) {
                        newBoard[cell.r][cell.c] = player;
                    }
                    break;
                } else {
                    break; // Empty cell
                }
                r += dr;
                c += dc;
            }
        }
        return newBoard;
    },

    getScore(board) {
        let black = 0;
        let white = 0;
        const size = board.length;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === 1) black++;
                else if (board[r][c] === 2) white++;
            }
        }
        return { black, white };
    },

    // Check if game is over (no moves for both players)
    isGameOver(board) {
        const blackMoves = this.getValidMoves(board, 1);
        const whiteMoves = this.getValidMoves(board, 2);
        return blackMoves.length === 0 && whiteMoves.length === 0;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReversiRules;
} else {
    window.ReversiRules = ReversiRules;
}
