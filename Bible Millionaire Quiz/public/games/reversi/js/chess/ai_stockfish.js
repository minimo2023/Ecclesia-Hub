class ChessAI {
    constructor() {
        this.stockfish = new Worker('js/vendor/stockfish.js');
        this.isReady = false;
        this.onBestMove = null; // Callback function(move, cp)

        this.stockfish.onmessage = (event) => {
            const line = event.data;
            // console.log("Stockfish:", line);

            if (line === 'uciok') {
                this.isReady = true;
                console.log("Stockfish Engine Ready");
            }

            if (line.startsWith('bestmove')) {
                const parts = line.split(' ');
                const bestMove = parts[1];
                if (this.onBestMove) {
                    this.onBestMove(bestMove);
                }
            }
        };

        this.stockfish.postMessage('uci');
    }

    startNewGame() {
        this.stockfish.postMessage('ucinewgame');
        this.stockfish.postMessage('isready');
    }

    /**
     * Analyze position and find best move
     * @param {string} fen - Current board state in FEN
     * @param {number} depth - Search depth (default 10)
     */
    getBestMove(fen, depth = 10) {
        if (!this.isReady) return;
        this.stockfish.postMessage(`position fen ${fen}`);
        this.stockfish.postMessage(`go depth ${depth}`);
    }
}

// Export global
window.ChessAI = ChessAI;
