const socket = io();

// State
let gameState = {
    board: [],
    currentPlayer: 1, // 1: Black, 2: White
    myPlayerId: 1,    // Default for local/PvE (Black goes first usually)
    gameMode: 'pve',  // 'pvp_local', 'pve', 'eve', 'pvp_network'
    boardSize: 8,
    isGameOver: false,
    aiThinking: false,
    networkActive: false
};
// Expose globally for View3D
window.gameState = gameState;

// Game Selector Logic
window.selectGame = function (game) {
    if (game === 'reversi') {
        document.getElementById('gameSelector').style.display = 'none';
        document.getElementById('reversiApp').style.display = 'block';
        document.getElementById('chessApp').style.display = 'none';
        showScreen('menu'); // Ensure we start at main menu
    } else if (game === 'chess') {
        document.getElementById('gameSelector').style.display = 'none';
        document.getElementById('reversiApp').style.display = 'none';
        if (window.ChessGame) {
            window.ChessGame.show(); // Show chess menu
        }
    }
};

window.showGameSelector = function () {
    document.getElementById('reversiApp').style.display = 'none';
    document.getElementById('chessApp').style.display = 'none';
    document.getElementById('gameSelector').style.display = 'flex';

    // Clear 3D container to avoid lingering renderers
    const container = document.getElementById('game-container-3d');
    if (container) {
        container.innerHTML = '';
        container.style.zIndex = '-1'; // Reset to background
    }
};

// DOM Elements
const boardEl = document.getElementById('gameBoard');
const statusEl = document.getElementById('statusMessage');
const blackScoreEl = document.getElementById('blackScore');
const whiteScoreEl = document.getElementById('whiteScore');
const blackScoreWrapper = document.getElementById('blackScoreWrapper');
const whiteScoreWrapper = document.getElementById('whiteScoreWrapper');
const restartBtn = document.getElementById('restartBtn');
const sizeButtonContainer = document.getElementById('sizeButtonContainer');
const boardSizeInput = document.getElementById('boardSize');
// Backward compatibility / Alias
const boardSizeSelect = boardSizeInput;
const gameModeSelect = document.getElementById('gameMode'); // Restored

// Level Config
// 6, 8 are free.
// 10 unlocks at 1 win, 12 at 2 wins... 30 at 11 wins.
// Formula: NeededWins = (Size - 8) / 2.  (e.g. Size 10 -> (2)/2 = 1)
const MAX_BOARD_SIZE = 30;

function getWinCount() {
    try {
        return parseInt(localStorage.getItem('reversi_pve_wins') || '0');
    } catch (e) {
        console.warn("Storage access restricted:", e);
        return 0;
    }
}

function addWin() {
    try {
        const current = getWinCount();
        localStorage.setItem('reversi_pve_wins', current + 1);
        checkUnlock(current + 1);
    } catch (e) {
        console.warn("Storage access restricted:", e);
    }
}

function checkUnlock(wins) {
    // Check if we just unlocked something?
    // Calculate max size unlocked
    // Size = 8 + (wins * 2)
    // Actually let's just re-render. 
    // If user hit a milestone, maybe alert?
    // Logic: Unlocked 10 when wins >= 1.
    // If previous wins was 0 and now 1, we unlocked 10x10.
    renderSizeButtons();
}

function renderSizeButtons() {
    sizeButtonContainer.innerHTML = '';
    const wins = getWinCount();
    const currentSelection = parseInt(boardSizeInput.value);

    for (let s = 6; s <= MAX_BOARD_SIZE; s += 2) {
        const btn = document.createElement('div');
        btn.classList.add('size-btn');

        // Progression Logic - DISABLED (all sizes now free)
        // 6 and 8 are always unlocked.
        // For s > 8: required wins = (s - 8) / 2
        let isLocked = false;
        let requiredWins = 0;

        // UNLOCK ALL SIZES
        /*
        if (s > 8) {
            requiredWins = (s - 8) / 2;
            if (wins < requiredWins) {
                isLocked = true;
            }
        }
        */

        if (isLocked) {
            btn.classList.add('locked');
            btn.textContent = "?";
            btn.title = `獲勝 ${requiredWins} 場以解鎖`;
            btn.onclick = () => {
                alert(`這是隱藏關卡！\n您需要在人機對戰中獲勝 ${requiredWins} 場才能解鎖 ${s}x${s} 棋盤。\n(目前勝場: ${wins})`);
            };
        } else {
            btn.classList.add('unlocked');
            btn.textContent = `${s}x${s}`;
            if (s === currentSelection) {
                btn.classList.add('selected');
            }
            btn.onclick = () => {
                boardSizeInput.value = s;
                renderSizeButtons(); // Re-render to update selected class
            };
        }

        sizeButtonContainer.appendChild(btn);
    }
}
// Init Render
renderSizeButtons();

// Init Game (Adapted for hidden input)
function initGame(remoteResetSize = null) {
    // ... logic continues ...
    gameState.gameMode = gameModeSelect.value;

    // UI Toggle
    if (gameState.gameMode === 'pvp_network') {
        networkInfo.style.display = 'inline-block';
        // boardSizeSelect.disabled = true; // Input disabled? 
        // It's in the menu, so we usually don't change it IN GAME.
        // But if we are in game, initGame is called.
        // The menu is hidden. So no need to disable the input explicitly.
        // But we should respect remoteResetSize.
        if (remoteResetSize) {
            boardSizeInput.value = remoteResetSize; // Update hidden input
        }
    } else {
        networkInfo.style.display = 'none';
        // boardSizeSelect.disabled = false;
    }

    gameState.boardSize = parseInt(boardSizeInput.value);
    gameState.board = ReversiRules.initBoard(gameState.boardSize);
    gameState.currentPlayer = 1;
    gameState.isGameOver = false;
    gameState.aiThinking = false;
    gameState.history = []; // Initialize Replay History
    // Default false unless explicitly set by the Learning Mode button handler AFTER this init
    // BUT wait, checking the handler order: startGameWithMode calls initGame. 
    // If we reset here to false, we might overwrite?
    // The handler calls startGameWithMode -> initGame -> THEN sets true.
    // So resetting here is SAFE and CORRECT to clear it for other modes.
    gameState.isLearningMode = false;

    // Reset IDs for local
    if (gameState.gameMode !== 'pvp_network') {
        gameState.myPlayerId = 1;
        if (gameState.gameMode === 'pve') gameState.myPlayerId = 1;
    }

    // Init 3D View
    View3D.init('game-container-3d', gameState.boardSize, (r, c) => {
        handleCellClick(r, c);
    });

    // Force clear 3D board state on new game init to prevent phantom state
    if (View3D.clearBoard) View3D.clearBoard();

    renderBoard();
    updateUI();

    if (gameState.gameMode === 'eve') {
        setTimeout(aiTurn, 500);
    }
}

// Render - Multi-Backend (3D + 2D legacy support)
function renderBoard() {
    let duration = 0;
    // 3D Render Update
    if (typeof View3D !== 'undefined' && View3D.scene) {
        // Calculate valid moves for logic normally
        const actualMoves = ReversiRules.getValidMoves(gameState.board, gameState.currentPlayer);

        // But only visualize them if it is "Player's Turn" (or Local PvP where every turn is player)
        // isPlayerTurn() handles pvp_local returning true always.
        // For PvE/Network, it returns true only if currentPlayer == myId.
        const visualMoves = isPlayerTurn() ? actualMoves : [];

        duration = View3D.updateBoard(gameState.board, visualMoves, gameState.lastMove);
    }
    return duration;
    // Legacy 2D Render (Keep hidden or for debug)
    // ...
}

// 3. Global Click Delegation - Removed for 3D View (View3D handles interaction)
/*
if (!boardEl.hasAttribute('data-click-listener')) {
    boardEl.addEventListener('click', (e) => {
        // ...
    });
}
*/

function handleCellClick(row, col) {
    if (gameState.isGameOver || gameState.aiThinking) return;
    if (!isPlayerTurn()) return;

    executeMove(row, col);
}

function executeMove(row, col) {
    const newBoard = ReversiRules.makeMove(gameState.board, row, col, gameState.currentPlayer);
    if (newBoard) {
        // RECORD HISTORY
        // console.log("Recording History. Step:", gameState.history.length);
        gameState.history.push({
            boardSnapshot: JSON.parse(JSON.stringify(gameState.board)), // Deep copy old board
            move: { row, col },
            player: gameState.currentPlayer
        });

        if (gameState.gameMode === 'pvp_network' && gameState.currentPlayer === gameState.myPlayerId) {
            sendMove({ row, col });
        }

        gameState.board = newBoard;
        gameState.lastMove = { row, col }; // Track last move
        switchTurn();
    }
}

function handleRemoteMove(move) {
    const newVal = ReversiRules.makeMove(gameState.board, move.row, move.col, gameState.currentPlayer);
    if (newVal) {
        // RECORD HISTORY
        gameState.history.push({
            boardSnapshot: JSON.parse(JSON.stringify(gameState.board)), // Deep copy old board
            move: move,
            player: gameState.currentPlayer
        });

        gameState.board = newVal;
        gameState.lastMove = move; // Track remote last move
        switchTurn();
    } else {
        console.error("Invalid remote move received?", move);
    }
}

function switchTurn() {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    updateUI();

    // Switch logic
    // We assume renderBoard just returned the estimated animation duration
    const animDuration = renderBoard() || 0;

    const validMoves = ReversiRules.getValidMoves(gameState.board, gameState.currentPlayer);
    if (validMoves.length === 0) {
        const opponent = gameState.currentPlayer === 1 ? 2 : 1;
        const opponentMoves = ReversiRules.getValidMoves(gameState.board, opponent);

        if (opponentMoves.length === 0) {
            setTimeout(endGame, animDuration + 500);
            return;
        } else {
            console.log("No valid moves, pass!");
            gameState.currentPlayer = opponent;
            updateUI();
            renderBoard();
        }
    }

    if (!gameState.isGameOver) {
        // AI Turn Logic
        if ((gameState.gameMode === 'pve' && gameState.currentPlayer !== gameState.myPlayerId) ||
            (gameState.gameMode === 'eve')) {

            // Wait for Animation + Thinking Time
            const waitTime = animDuration + 800; // 0.8s extra thinking time
            setTimeout(aiTurn, waitTime);
        }
    }
}

function aiTurn() {
    gameState.aiThinking = true;
    statusEl.textContent = 'AI 思考中...';

    // Get Difficulty
    const difficulty = document.getElementById('difficultyLevel').value || 'normal';

    setTimeout(() => {
        const move = AI.getBestMove(gameState.board, gameState.currentPlayer, difficulty);
        if (move) {
            executeMove(move.row, move.col);
        } else {
            console.log("AI cannot move");
            gameState.aiThinking = false;
        }
        gameState.aiThinking = false;
    }, 100);
}

function isPlayerTurn() {
    if (gameState.gameMode === 'pvp_local') return true;
    if (gameState.gameMode === 'pve') return gameState.currentPlayer === gameState.myPlayerId;
    if (gameState.gameMode === 'pvp_network') return gameState.currentPlayer === gameState.myPlayerId;
    return false;
}

function updateUI() {
    const scores = ReversiRules.getScore(gameState.board);
    blackScoreEl.textContent = scores.black;
    whiteScoreEl.textContent = scores.white;

    blackScoreWrapper.classList.toggle('active', gameState.currentPlayer === 1);
    whiteScoreWrapper.classList.toggle('active', gameState.currentPlayer === 2);

    blackScoreWrapper.classList.remove('is-me');
    whiteScoreWrapper.classList.remove('is-me');

    if (gameState.gameMode === 'pvp_network' || gameState.gameMode === 'pve') {
        if (gameState.myPlayerId === 1) blackScoreWrapper.classList.add('is-me');
        if (gameState.myPlayerId === 2) whiteScoreWrapper.classList.add('is-me');
    }

    if (!gameState.isGameOver) {
        let msg = gameState.currentPlayer === 1 ? "黑方回合" : "白方回合";

        if (gameState.gameMode === 'pvp_network') {
            const isMyTurn = gameState.currentPlayer === gameState.myPlayerId;
            const myColorStr = gameState.myPlayerId === 1 ? "黑方" : "白方";

            if (isMyTurn) {
                msg = `輪到你了！ (你是${myColorStr})`;
                document.body.style.backgroundColor = '#2e3a2e';
            } else {
                msg = `對手思考中... (你是${myColorStr})`;
                document.body.style.backgroundColor = '#222';
            }
        } else if (gameState.gameMode === 'pve') {
            if (gameState.currentPlayer === gameState.myPlayerId) {
                msg = "輪到你了！";
            } else {
                msg = "AI 思考中...";
            }
        }

        statusEl.textContent = msg;
        statusEl.style.color = (gameState.gameMode === 'pvp_network' && gameState.currentPlayer === gameState.myPlayerId) ? '#4caf50' : '#f0f0f0';
    } else {
        document.body.style.backgroundColor = '#222';
    }
}

// Game Over Modal Elements
const gameOverModal = document.getElementById('gameOverModal');
const winnerTitle = document.getElementById('winnerTitle');
const finalBlackScore = document.getElementById('finalBlackScore');
const finalWhiteScore = document.getElementById('finalWhiteScore');
const modalRestartBtn = document.getElementById('modalRestartBtn');
const modalBackBtn = document.getElementById('modalBackBtn');

function endGame() {
    gameState.isGameOver = true;
    const scores = ReversiRules.getScore(gameState.board);

    // Trigger Animation
    startSettlementAnimation(scores);
}

function startSettlementAnimation(scores) {
    statusEl.textContent = "正在計算分數...";

    // 1. Clear Board visual only (keep logical board for reference if needed, but we rely on scores now)
    const size = gameState.boardSize;
    boardEl.innerHTML = '';
    // Re-create empty grid
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;

    const cells = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            boardEl.appendChild(cell);
            cells.push(cell); // Flat array for easy indexing
        }
    }

    // 2. Animation Loop
    let blackCount = 0;
    let whiteCount = 0;
    const totalBlack = scores.black;
    const totalWhite = scores.white;
    const totalCells = size * size;

    // Speed control
    const delay = 50; // ms per disc

    let steps = Math.max(totalBlack, totalWhite);

    for (let i = 0; i < steps; i++) {
        setTimeout(() => {
            // Anim Black (Top-Left -> Right/Down)
            // Index = i
            if (i < totalBlack) {
                const cellIndex = i;
                if (cellIndex < totalCells) {
                    addDiscToCell(cells[cellIndex], 'black');
                }
            }

            // Anim White (Bottom-Right -> Left/Up)
            // Index = totalCells - 1 - i
            if (i < totalWhite) {
                const cellIndex = totalCells - 1 - i;
                if (cellIndex >= 0) {
                    addDiscToCell(cells[cellIndex], 'white');
                }
            }

            // Update scores in real-time on the board header? 
            // Optional, but we show final in modal.

            // Check if done
            if (i === steps - 1) {
                setTimeout(() => showGameOverModal(scores), 800);
            }
        }, i * delay);
    }
}

function addDiscToCell(cell, type) {
    const disc = document.createElement('div');
    disc.classList.add('disc', type, 'pop-in');
    cell.appendChild(disc);
}

function showGameOverModal(scores) {
    let msg = '';
    let color = '';

    // Check Win for Progression
    // Only count PvE wins where Human is Black (std) and Human Won
    // Or just Human beats AI.
    // gameState.myPlayerId in PvE is Human.
    if (gameState.gameMode === 'pve') {
        const myScore = gameState.myPlayerId === 1 ? scores.black : scores.white;
        const aiScore = gameState.myPlayerId === 1 ? scores.white : scores.black;

        if (myScore > aiScore) {
            // Player Won!
            addWin(); // Save and update UI

            // Optional: Check if consistent logic needed for messaging
            msg = '恭喜獲勝! (勝場+1)';
            color = '#4caf50';

            // Calculate if we just unlocked something
            const newWins = getWinCount();
            // If newWins corresponds to exact unlock threshold
            // Thresholds: 1, 2, 3...
            // e.g. 1 -> Unlocks 10.
            const unlockedSize = 8 + (newWins * 2);
            if (unlockedSize <= MAX_BOARD_SIZE) {
                setTimeout(() => alert(`新紀錄！您已經解鎖了 ${unlockedSize}x${unversedSize} 棋盤！`), 1000);
            }
        } else if (myScore < aiScore) {
            msg = '挑戰失敗...';
            color = '#f44336';
        } else {
            msg = '平局!';
            color = '#ffd700';
        }
    } else {
        // Other modes
        if (scores.black > scores.white) {
            msg = '黑方獲勝!';
            color = '#4caf50';
        } else if (scores.white > scores.black) {
            msg = '白方獲勝!';
            color = '#f0f0f0';
        } else {
            msg = '平局!';
            color = '#ffd700';
        }
    }

    winnerTitle.textContent = msg;
    winnerTitle.style.color = color;
    finalBlackScore.textContent = scores.black;
    finalWhiteScore.textContent = scores.white;

    gameOverModal.style.display = 'flex';
}

// Modal Listeners
modalRestartBtn.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    if (gameState.gameMode === 'pvp_network') {
        sendReset(boardSizeSelect.value);
    } else {
        initGame();
    }
});

modalBackBtn.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    if (typeof socketClient !== 'undefined' && socketClient && socketClient.connected) {
        socketClient.disconnect();
    }
    showScreen('menu');
});

// Helper to switch screens
function showScreen(screenName) {
    mainMenu.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameScreen.style.display = 'none';

    if (screenName === 'menu') {
        mainMenu.style.display = 'flex';
    } else if (screenName === 'lobby') {
        lobbyScreen.style.display = 'flex';
        setTimeout(() => roomIdInput.focus(), 100);
    } else {
        gameScreen.style.display = 'block';
    }
}

// Start Game Handler
function startGameWithMode(mode) {
    if (mode === 'pvp_network') {
        roomIdInput.value = '';
        showScreen('lobby');
    } else {
        gameModeSelect.value = mode;
        showScreen('game');
        initGame();
    }
}

// Network Join Handler
function onNetworkJoinBtn() {
    const rid = roomIdInput.value.trim();
    if (!rid) {
        alert("請輸入房間號碼!");
        return;
    }

    if (typeof socketClient !== 'undefined' && socketClient && socketClient.connected) {
        socketClient.disconnect();
    }

    initSocket(
        () => { // onGameStart
            waitingOverlay.style.display = 'none';
            document.getElementById('statusMessage').textContent = "遊戲開始！";
        },
        handleRemoteMove,
        (color) => {
            gameModeSelect.value = 'pvp_network';
            showScreen('game');

            gameState.myPlayerId = color;
            gameState.networkActive = true;
            currentRoomDisplay.textContent = rid;

            initGame();
            if (color === 1) {
                waitingRoomIdEl.textContent = rid;
                waitingOverlay.style.display = 'flex';
            }
        },
        (size) => { // onReset
            boardSizeSelect.value = size;
            initGame(size);
            waitingOverlay.style.display = 'none';
        }
    );

    joinGameRoom(rid);
}

// Event Listeners
// Event Listeners
btnPvE.addEventListener('click', () => {
    gameState.isLearningMode = false;
    startGameWithMode('pve');
});

btnLearning.addEventListener('click', () => {
    startGameWithMode('pve'); // Base on PvE
    gameState.isLearningMode = true; // Enable Guidelines
    // Force update markers to show initial hints if black
    if (typeof View3D !== 'undefined') {
        // A bit hacky, but ensures view knows about the mode immediately if initGame didn't trigger an update
        // Usually initGame calls renderBoard which updates markers.
        // We just ensure the flag is set.
    }
});

btnPvP.addEventListener('click', () => {
    gameState.isLearningMode = false;
    startGameWithMode('pvp_local');
});

btnNet.addEventListener('click', () => {
    gameState.isLearningMode = false;
    startGameWithMode('pvp_network');
});

btnEvE.addEventListener('click', () => {
    gameState.isLearningMode = false;
    startGameWithMode('eve');
});

backToMenuBtn.addEventListener('click', () => {
    if (typeof socketClient !== 'undefined' && socketClient && socketClient.connected) {
        socketClient.disconnect();
    }
    showScreen('menu');
});

backFromLobbyBtn.addEventListener('click', () => showScreen('menu'));

restartBtn.addEventListener('click', () => {
    if (gameState.gameMode === 'pvp_network') {
        sendReset(boardSizeInput.value);
    } else {
        initGame();
    }
});

// boardSizeSelect listener removed (handled by button clicks in renderSizeButtons)
joinGameBtn.addEventListener('click', onNetworkJoinBtn);

// Difficulty Toggle Logic
const difficultyBtn = document.getElementById('difficultyBtn');
const difficultyInput = document.getElementById('difficultyLevel');

if (difficultyBtn) {
    difficultyBtn.addEventListener('click', () => {
        const current = difficultyInput.value;
        if (current === 'normal') {
            difficultyInput.value = 'easy';
            difficultyBtn.textContent = 'AI 難度: 簡單 (適合新手)';
            difficultyBtn.style.color = '#4caf50';
            difficultyBtn.style.borderColor = '#4caf50';
        } else {
            difficultyInput.value = 'normal';
            difficultyBtn.textContent = 'AI 難度: 普通 (挑戰)';
            difficultyBtn.style.color = '#888';
            difficultyBtn.style.borderColor = '#555';
        }
    });
}

// Start Replay Mode
function startReplay() {
    if (!gameState.history || gameState.history.length === 0) return;

    // Hide Game Over Modal
    gameOverModal.style.display = 'none';

    // Show Replay Controls
    const replayHud = document.getElementById('replayHud');
    if (replayHud) replayHud.style.display = 'flex';

    // Ensure Coach HUD is ready
    gameState.isLearningMode = true; // Enable Coach for analysis

    // Initialize Replay State
    gameState.replayIndex = 0; // Start at beginning? Or end? Let's start at move 0.
    gameState.isReplay = true;

    renderReplayStep();

    // Show Summary Report
    if (typeof Coach !== 'undefined' && Coach.analyzeGame) {
        // Assume player played black(1) if PvE, or use myPlayerId
        // In Local PvP, which player to analyze? Usually show both or ask.
        // For now, default to Player 1 (Black/Host) for simplicity or gameState.myPlayerId
        const report = Coach.analyzeGame(gameState.history, gameState.myPlayerId);
        alert(report);
    }
}

function renderReplayStep() {
    if (!gameState.isReplay) return;

    const step = gameState.history[gameState.replayIndex];
    // step contains: { boardSnapshot (before move), move, player }

    // To show "What happened", we should show the board BEFORE the move,
    // and highlight the move made.

    gameState.board = JSON.parse(JSON.stringify(step.boardSnapshot)); // Restore board
    gameState.currentPlayer = step.player; // Restore player
    gameState.lastMove = step.move; // Highlight the move about to be made/made

    // Update View
    View3D.updateBoard(gameState.board, [], step.move); // No valid moves shown, just the board

    // Show Coach Analysis
    const hud = document.getElementById('coachHud');
    const text = document.getElementById('coachText');
    const stepInfo = document.getElementById('replayStepInfo');

    if (stepInfo) stepInfo.textContent = `第 ${gameState.replayIndex + 1} / ${gameState.history.length} 手`;

    if (typeof Coach !== 'undefined') {
        const analysis = Coach.analyzeMove(gameState.board, step.player, step.move);
        if (hud && text) {
            hud.style.display = 'flex';
            text.textContent = `(當時玩家下在 ${step.move.row},${step.move.col}) 
                 軍師點評：${analysis.text}`;

            hud.classList.remove('good', 'warning');
            if (analysis.type === 'good') hud.classList.add('good');
            if (analysis.type === 'warning') hud.classList.add('warning');
        }
    }
}

function nextReplayStep() {
    if (gameState.replayIndex < gameState.history.length - 1) {
        gameState.replayIndex++;
        renderReplayStep();
    }
}

function prevReplayStep() {
    if (gameState.replayIndex > 0) {
        gameState.replayIndex--;
        renderReplayStep();
    }
}

function exitReplay() {
    gameState.isReplay = false;
    gameState.isLearningMode = false; // Reset
    const replayHud = document.getElementById('replayHud');
    const coachHud = document.getElementById('coachHud');
    if (replayHud) replayHud.style.display = 'none';
    if (coachHud) coachHud.style.display = 'none';

    showScreen('menu'); // Go back to menu
}

// Expose for UI
window.startReplay = startReplay;
window.nextReplayStep = nextReplayStep;
window.prevReplayStep = prevReplayStep;
window.exitReplay = exitReplay;

window.addEventListener('DOMContentLoaded', () => {
    if (typeof ReversiRules === 'undefined' || typeof AI === 'undefined') {
        console.error("Dependencies not loaded!");
        alert("遊戲組件載入失敗，請重新整理頁面。");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        roomIdInput.value = roomParam;
        showScreen('lobby');
    } else {
        showScreen('menu');
    }
});

// Explicitly expose functions to window to prevent scope issues
window.selectGame = window.selectGame || function (game) {
    console.log("selectGame called fallback", game);
    if (game === 'reversi') {
        document.getElementById('gameSelector').style.display = 'none';
        document.getElementById('reversiApp').style.display = 'block';
        showScreen('menu');
    } else if (game === 'chess') {
        document.getElementById('gameSelector').style.display = 'none';
        document.getElementById('chessScreen').style.display = 'flex';
        if (window.ChessGame) window.ChessGame.init();
    }
};

window.showGameSelector = window.showGameSelector || function () {
    document.getElementById('reversiApp').style.display = 'none';
    document.getElementById('chessScreen').style.display = 'none';
    document.getElementById('gameSelector').style.display = 'flex';
    const container = document.getElementById('game-container-3d');
    if (container) {
        container.innerHTML = '';
        container.style.zIndex = '-1';
    }
};

function copyInviteLink() {
    let rid = roomIdInput.value.trim();
    if (!rid && currentRoomDisplay.textContent) rid = currentRoomDisplay.textContent;

    if (!rid) return;

    const url = `${window.location.origin}${window.location.pathname}?room=${rid}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("連結已複製！傳送給朋友即可邀請對戰。");
    });
}
window.copyInviteLink = copyInviteLink;
