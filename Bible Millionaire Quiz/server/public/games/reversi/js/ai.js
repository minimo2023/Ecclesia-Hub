const AI = {
    // Dynamic weights cache-ish
    getWeights(size) {
        // Simplified dynamic weights: corners are best, adjacent to corners are bad
        const weights = Array(size).fill(null).map(() => Array(size).fill(1));

        // Corners
        const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
        corners.forEach(([r, c]) => weights[r][c] = 100);

        // Adjacent to corners (X-squares and C-squares) - dangerous if corner not taken
        const adj = [
            [0, 1], [1, 0], [1, 1],
            [0, size - 2], [1, size - 1], [1, size - 2],
            [size - 2, 0], [size - 1, 1], [size - 2, 1],
            [size - 2, size - 1], [size - 1, size - 2], [size - 2, size - 2]
        ];

        adj.forEach(([r, c]) => {
            if (r >= 0 && r < size && c >= 0 && c < size) {
                weights[r][c] = -20;
            }
        });

        // Edges (simple heuristic)
        for (let i = 2; i < size - 2; i++) {
            weights[0][i] = 10;
            weights[size - 1][i] = 10;
            weights[i][0] = 10;
            weights[i][size - 1] = 10;
        }

        return weights;
    },

    evaluate(board, player) {
        const size = board.length;
        const weights = this.getWeights(size);
        const opponent = player === 1 ? 2 : 1;
        let score = 0;

        // 1. Position Score
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === player) score += weights[r][c];
                else if (board[r][c] === opponent) score -= weights[r][c];
            }
        }

        // 2. Mobility Score (more moves = better)
        const myMoves = ReversiRules.getValidMoves(board, player).length;
        const oppMoves = ReversiRules.getValidMoves(board, opponent).length;
        score += (myMoves - oppMoves) * 5;

        // 3. Corner Control Bonus
        const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
        for (const [cr, cc] of corners) {
            if (board[cr][cc] === player) score += 50;
            else if (board[cr][cc] === opponent) score -= 50;
        }

        return score;
    },

    getBestMove(board, player, difficulty = 'normal') {
        const validMoves = ReversiRules.getValidMoves(board, player);
        if (validMoves.length === 0) return null;

        // Easy Mode: 30% chance to pick random move, otherwise greedy (depth 1)
        if (difficulty === 'easy') {
            if (Math.random() < 0.3) {
                return validMoves[Math.floor(Math.random() * validMoves.length)];
            }
            // Greedy (Depth 1)
            let bestScore = -Infinity;
            let bestMove = validMoves[0];
            const weights = this.getWeights(board.length);

            for (let move of validMoves) {
                // Simple 1-step lookahead evaluation
                const newBoard = ReversiRules.makeMove(board, move.row, move.col, player);
                // Simple eval using weights only
                let score = 0;
                for (let r = 0; r < board.length; r++) {
                    for (let c = 0; c < board.length; c++) {
                        if (newBoard[r][c] === player) score += weights[r][c];
                        else if (newBoard[r][c] === (player === 1 ? 2 : 1)) score -= weights[r][c];
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            }
            return bestMove;
        }

        // Normal/Hard Mode: Minimax
        // Optimization for larger boards: Reduce depth
        let depth = 5; // Increased from 4 to 5 for stronger play
        const size = board.length;
        if (size > 8) depth = 4; // Increased from 3
        if (size > 10) depth = 3; // Increased from 2

        let bestScore = -Infinity;
        let bestMove = validMoves[0];

        for (let move of validMoves) {
            const newBoard = ReversiRules.makeMove(board, move.row, move.col, player);
            const score = this.minimax(newBoard, depth - 1, -Infinity, Infinity, false, player);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return bestMove;
    },

    minimax(board, depth, alpha, beta, isMaximizing, player) {
        if (depth === 0 || ReversiRules.isGameOver(board)) {
            return this.evaluate(board, player);
        }

        const opponent = player === 1 ? 2 : 1;
        const currentTurn = isMaximizing ? player : opponent;
        const validMoves = ReversiRules.getValidMoves(board, currentTurn);

        if (validMoves.length === 0) {
            // Pass turn
            return this.minimax(board, depth - 1, alpha, beta, !isMaximizing, player);
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let move of validMoves) {
                const newBoard = ReversiRules.makeMove(board, move.row, move.col, currentTurn);
                const eval = this.minimax(newBoard, depth - 1, alpha, beta, false, player);
                maxEval = Math.max(maxEval, eval);
                alpha = Math.max(alpha, eval);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let move of validMoves) {
                const newBoard = ReversiRules.makeMove(board, move.row, move.col, currentTurn);
                const eval = this.minimax(newBoard, depth - 1, alpha, beta, true, player);
                minEval = Math.min(minEval, eval);
                beta = Math.min(beta, eval);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }
}


const Coach = {
    templates: {
        corner: [
            "太棒了！佔領角落是獲勝的關鍵，這枚棋子將永遠不會被翻轉。",
            "完美的選點！控制了角落，等於控制了半壁江山。",
            "這就是「金角」！穩固了陣地，對手壓力山大。"
        ],
        danger_x: [
            "危險！這是「X位」。如果不小心，下一手就會把角落送給對手。",
            "這個位置很敏感 (X-Square)，通常是高手設下的陷阱。",
            "小心！下在這裡很容易讓對手長驅直入佔領角落。"
        ],
        danger_c: [
            "小心！這是「C位」。下在這裡很容易讓對手侵入角落。",
            "這個邊上的位置 (C-Square) 往往是送角的開始，請三思。",
            "除非你有十足把握，否則這個 C 位通常是壞棋。"
        ],
        good_mobility: [
            "好棋！這步棋有效地限制了對手的行動力 (Mobility)。",
            "這手棋很安靜 (Quiet Move)，卻讓對手非常難受。",
            "控制得宜！對手下一回合的選擇非常少。"
        ],
        kill: [
            "絕殺！對手下回合「無路可走」，你將獲得連續下子的機會。",
            "完美的封鎖！對手 Pass 了，繼續進攻吧！"
        ],
        greedy: [
            "注意。太早吃太多子反而會讓你的棋子暴露在外圍 (Frontier)。",
            "這步棋吃得有點多。在開局階段，保留行動力比吃子更重要。",
            "雖然吃得很爽，但這會讓對手有更多好位置可以下。"
        ],
        neutral: [
            "這步棋中規中矩。提示：「壞位置」是指角落旁邊的格子 (C位/X位)，試著讓對手只剩這些選擇！",
            "穩紮穩打。記住：對手如果被迫下在角落「斜邊」(X位) 或「旁邊」(C位)，你就能趁機佔角！",
            "還可以。試著觀察：棋盤四個角落旁是否有空格？那些是「危險區」，逼對手下那裡就是好策略。"
        ]
    },

    pick(category) {
        const arr = this.templates[category];
        return arr[Math.floor(Math.random() * arr.length)];
    },

    analyzeMove(board, player, move) {
        const size = board.length;
        const r = move.row;
        const c = move.col;
        const opponent = player === 1 ? 2 : 1;

        // 1. Check Corner (Perfect)
        if ((r === 0 || r === size - 1) && (c === 0 || c === size - 1)) {
            return { type: 'good', text: this.pick('corner') };
        }

        // 2. Check C-Square / X-Square (Danger)
        const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
        for (let corner of corners) {
            const cr = corner[0];
            const cc = corner[1];
            if (board[cr][cc] !== 0) continue; // Safe if corner taken

            // X-Square
            if (Math.abs(r - cr) === 1 && Math.abs(c - cc) === 1) {
                return { type: 'warning', text: this.pick('danger_x') };
            }
            // C-Square
            if ((Math.abs(r - cr) === 1 && c === cc) || (Math.abs(c - cc) === 1 && r === cr)) {
                return { type: 'warning', text: this.pick('danger_c') };
            }
        }

        // 3. Simulation & Heuristics
        const newBoard = ReversiRules.makeMove(board, r, c, player);
        const opponentMoves = ReversiRules.getValidMoves(newBoard, opponent);

        // Kill (Opponent has 0 moves)
        if (opponentMoves.length === 0) {
            return { type: 'good', text: this.pick('kill') };
        }

        // Strong Mobility Restriction
        if (opponentMoves.length <= 2) {
            return { type: 'good', text: this.pick('good_mobility') };
        }

        // 4. Early Game Greed Check
        const totalDiscs = board.flat().filter(x => x !== 0).length;
        // Logic: new count - old count = 1 (placed). 
        // We verify flipped count by diff.
        let flipped = 0;
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (board[i][j] !== 0 && board[i][j] !== newBoard[i][j]) flipped++;
            }
        }

        if (totalDiscs < 20 && flipped > 4) {
            return { type: 'neutral', text: this.pick('greedy') };
        }

        // 5. Default
        return { type: 'neutral', text: this.pick('neutral') };
    },
    // 靜態知識庫 (Static Knowledge Base) - 教練第一人稱視角
    knowledgeBase: {
        // 位置類型 - 教練的想法
        position: {
            corner: "🧠 如果我下這裡... 這是角落！一旦佔領就永遠不會被翻轉。這是我最想搶的位置。",
            edge: "🧠 如果我下這裡... 這是邊線，比較穩定。雖然不如角落強，但不容易被對手包圍。",
            xsquare: "🧠 如果我下這裡... 等等，這是角落的斜對角(X位)！我必須非常小心，這步可能會送角給對手。",
            csquare: "🧠 如果我下這裡... 這是角落旁邊(C位)。除非角落已被佔，否則我會盡量避開這個位置。",
            normal: "🧠 如果我下這裡... 這是普通位置。我會繼續觀察有沒有更好的選擇，例如角落或邊線。"
        },
        // 行動力 - 教練的判斷
        mobility: {
            kill: "� 這步棋之後，對手將完全無路可走！我可以連續進攻，這是絕殺機會！",
            strong: "� 這步棋會讓對手只剩下很少的選擇。限制對手的行動力，是我追求的目標。",
            weak: "� 但是...這步棋會給對手太多選擇了。我要重新考慮，有沒有能更壓縮對手的下法。",
            normal: "💭 對手的選擇數量還可以。我要持續觀察哪一步能讓對手更難受。"
        },
        // AI 比較 - 教練的推薦
        comparison: {
            isBest: "✨ 這正是我會選的最佳位置！你的想法跟我一樣！",
            betterWeight: "🤔 不過...另一格的戰略價值更高。你要不要看看那邊？",
            betterMobility: "🤔 不過...我發現另一格能更有效地限制對手。可以考慮看看。",
            consider: "🤔 這步還可以，但我也在考慮其他位置。繼續探索看看吧。"
        },
        // 結果預測 - 教練的預測
        prediction: {
            opponentWill: "📈 如果你下這裡，對手接下來最可能的反應是...",
            opponentCorner: "⚠️ 對手將有機會佔領角落！這對你很不利。",
            opponentEdge: "對手會搶佔邊線，但還算可控。",
            youTrapped: "😰 而且你之後的選擇會變得很少，可能陷入被動！",
            youFree: "👍 你之後還有很多選擇，局勢仍在掌控中。"
        }
    },

    // External Database (loaded from JSON)
    database: null,
    databaseLoaded: false,

    // Load external database
    async loadDatabase() {
        if (this.databaseLoaded) return;
        try {
            const response = await fetch('/data/coach_database.json');
            this.database = await response.json();
            this.databaseLoaded = true;
            console.log('Coach database loaded:', this.database.version);
        } catch (e) {
            console.warn('Could not load coach database, using fallback:', e);
            this.database = null;
        }
    },

    // Get text from database with template replacement
    getText(category, key, vars = {}) {
        let text = '';
        if (this.database && this.database.advice && this.database.advice[category]) {
            text = this.database.advice[category][key] || '';
        }
        // Fallback to hardcoded if database not loaded
        if (!text) {
            const fallback = {
                'good.corner': '這一步能佔領角落，非常有利，建議下。',
                'good.killMove': '這一步讓對手無路可走，建議下。',
                'good.isBest': '這是最佳選擇（對手剩 {opponentChoices} 選擇），建議下。',
                'good.limitMobility': '這一步能限制對手只剩 {opponentChoices} 選擇，建議下。',
                'good.edge': '這一步能佔邊線，算穩健，建議下。',
                'warning.dangerZone': '這一步可能會讓對手佔角，建議換到 {altCoord}。',
                'warning.giveCorner': '這一步可能會讓對手搶到角落，建議換到 {altCoord}。',
                'warning.trapped': '這一步之後你只剩 {yourChoices} 選擇，建議換到 {altCoord}。',
                'warning.tooManyOptions': '下這裡對手有 {opponentChoices} 選擇，換到 {altCoord} 只剩 {altChoices}，建議換。',
                'neutral.ok': '這一步中規中矩，可以下。'
            };
            text = fallback[`${category}.${key}`] || '';
        }
        // Replace template variables
        for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
        return text;
    },

    // AI Reasoning with external database
    analyzeWithReasoning(board, player, move) {
        const size = board.length;
        const r = move.row;
        const c = move.col;
        const opponent = player === 1 ? 2 : 1;

        // Get AI's evaluation tools
        const weights = AI.getWeights(size);
        const cellWeight = weights[r][c];

        // === STEP 1: Simulate THIS move ===
        const newBoard = ReversiRules.makeMove(board, r, c, player);
        const opponentMovesAfter = ReversiRules.getValidMoves(newBoard, opponent);

        // === STEP 2: Predict OPPONENT's response ===
        let opponentResponse = null;
        let afterOpponentBoard = null;
        let yourNextMoves = 0;

        if (opponentMovesAfter.length > 0) {
            opponentResponse = AI.getBestMove(newBoard, opponent, 'normal');
            if (opponentResponse) {
                afterOpponentBoard = ReversiRules.makeMove(newBoard, opponentResponse.row, opponentResponse.col, opponent);
                yourNextMoves = ReversiRules.getValidMoves(afterOpponentBoard, player).length;
            }
        }

        // Get AI's best move for comparison (what Coach would pick)
        const aiBestMove = AI.getBestMove(board, player, 'normal');
        let aiBestWeight = 0;
        let aiMobility = 0;

        if (aiBestMove) {
            aiBestWeight = weights[aiBestMove.row][aiBestMove.col];
            const aiBoard = ReversiRules.makeMove(board, aiBestMove.row, aiBestMove.col, player);
            aiMobility = ReversiRules.getValidMoves(aiBoard, opponent).length;
        }

        // AI 最佳選擇
        const isBest = aiBestMove && aiBestMove.row === r && aiBestMove.col === c;
        const altCoord = aiBestMove ? `(${aiBestMove.row + 1}, ${aiBestMove.col + 1})` : '';

        // 計算對比數據
        const thisChoices = opponentMovesAfter.length;
        const altChoices = aiMobility;

        // 決定輸出 - 一句話格式 + 數字對比
        let text = '';
        let type = 'neutral';
        let suggestedMove = null; // 用於視覺提示

        if (cellWeight >= 100) {
            text = "這一步能佔領角落，非常有利，建議下。";
            type = 'good';
        } else if (opponentMovesAfter.length === 0) {
            text = "這一步讓對手無路可走，建議下。";
            type = 'good';
        } else if (isBest) {
            text = `這是最佳選擇（對手剩 ${thisChoices} 選擇），建議下。`;
            type = 'good';
        } else if (cellWeight <= -10) {
            text = `這一步可能會讓對手佔角，建議換到 ${altCoord}。`;
            type = 'warning';
            suggestedMove = aiBestMove;
        } else if (opponentResponse && weights[opponentResponse.row][opponentResponse.col] >= 100) {
            text = `這一步可能會讓對手搶到角落，建議換到 ${altCoord}。`;
            type = 'warning';
            suggestedMove = aiBestMove;
        } else if (yourNextMoves <= 2 && yourNextMoves > 0) {
            text = `這一步之後你只剩 ${yourNextMoves} 選擇，建議換到 ${altCoord}。`;
            type = 'warning';
            suggestedMove = aiBestMove;
        } else if (opponentMovesAfter.length >= 8) {
            text = `下這裡對手有 ${thisChoices} 選擇，換到 ${altCoord} 只剩 ${altChoices}，建議換。`;
            type = 'warning';
            suggestedMove = aiBestMove;
        } else if (opponentMovesAfter.length <= 2) {
            text = `這一步能限制對手只剩 ${thisChoices} 選擇，建議下。`;
            type = 'good';
        } else if (cellWeight >= 10) {
            text = "這一步能佔邊線，算穩健，建議下。";
            type = 'good';
        } else {
            text = "這一步中規中矩，可以下。";
            type = 'neutral';
        }

        return { type, text, suggestedMove };
    },

    // Enhanced: Deep Game Analysis for Replay
    analyzeGame(history, myPlayerId) {
        if (!history || history.length === 0) return { summary: "缺乏對局記錄。", moves: [] };

        let goodMoves = 0;
        let warningMoves = 0;
        let missedCorners = 0;
        let criticalMistakes = [];
        let brilliantMoves = [];
        const moveAnalysis = [];

        // Loop through history
        history.forEach((step, index) => {
            if (step.player !== myPlayerId) return; // Only analyze ME

            const board = step.boardSnapshot;
            const move = step.move;
            const size = board.length;
            const weights = AI.getWeights(size);

            // What player actually did
            const actualWeight = weights[move.row][move.col];

            // What AI would have done
            const aiBest = AI.getBestMove(board, step.player, 'normal');
            const aiBestWeight = aiBest ? weights[aiBest.row][aiBest.col] : 0;

            // Check valid moves - was there a corner available?
            const validMoves = ReversiRules.getValidMoves(board, step.player);
            const availableCorner = validMoves.find(m => weights[m.row][m.col] >= 100);

            // Determine quality
            let quality = 'neutral';
            let comment = '';

            if (actualWeight >= 100) {
                quality = 'brilliant';
                comment = '佔領角落！完美的一手。';
                brilliantMoves.push({ step: index + 1, move, comment });
                goodMoves++;
            } else if (availableCorner && actualWeight < 100) {
                quality = 'mistake';
                comment = `錯過了角落 (${availableCorner.row + 1}, ${availableCorner.col + 1})！`;
                criticalMistakes.push({ step: index + 1, move, missed: availableCorner, comment });
                missedCorners++;
                warningMoves++;
            } else if (actualWeight <= -10) {
                quality = 'risky';
                comment = '下在危險區域（靠近角落）。';
                warningMoves++;
            } else if (aiBest && aiBestWeight > actualWeight + 20) {
                quality = 'suboptimal';
                comment = `有更好的選擇 (${aiBest.row + 1}, ${aiBest.col + 1})。`;
                warningMoves++;
            } else if (aiBest && aiBest.row === move.row && aiBest.col === move.col) {
                quality = 'good';
                comment = '與 AI 選擇一致。';
                goodMoves++;
            } else {
                quality = 'ok';
                comment = '中規中矩。';
            }

            moveAnalysis.push({
                step: index + 1,
                move,
                quality,
                comment,
                actualWeight,
                aiBest,
                aiBestWeight
            });
        });

        const totalMoves = history.filter(s => s.player === myPlayerId).length;
        const accuracy = totalMoves > 0 ? Math.round((goodMoves / totalMoves) * 100) : 0;

        // Generate summary from database or fallback
        let summaryText = '';
        if (accuracy >= 80) {
            summaryText = this.database?.replay?.summary?.excellent || '這局表現非常出色！';
        } else if (accuracy >= 50) {
            summaryText = this.database?.replay?.summary?.good || '整體表現穩健。';
        } else if (missedCorners > 0) {
            summaryText = this.database?.replay?.summary?.needsWork || '有一些可以改進的地方。';
        } else {
            summaryText = this.database?.replay?.summary?.average || '中規中矩。';
        }

        const summary = `📊 **戰局總結**\n\n` +
            `✅ 好棋次數：${goodMoves} / ${totalMoves}\n` +
            `⚠️ 失誤/冒險：${warningMoves}\n` +
            `🎯 準確率：${accuracy}%\n` +
            (missedCorners > 0 ? `❌ 錯過角落：${missedCorners} 次\n` : '') +
            `\n📝 軍師總評：${summaryText}`;

        return {
            summary,
            accuracy,
            goodMoves,
            warningMoves,
            missedCorners,
            criticalMistakes,
            brilliantMoves,
            moves: moveAnalysis
        };
    }
};

if (typeof window !== 'undefined') {
    window.AI = AI;
    window.Coach = Coach;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AI, Coach };
}
