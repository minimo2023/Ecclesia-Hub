import { dbOps } from '../../../database/index.js';
import { LogosBank } from '../../../database/services/LogosBankService.js';
import { generateQuestion } from '../../../domains/game/engine/QuestionCore.js';
import { activeRooms } from '../registry.js';
import { getPublicMemberData, syncMemberShield } from '../utils.js';
import { STAGE_WAIT_TIME, ANSWER_COUNTDOWN, getOptionCount } from '../constants.js';

const LOBBY_BUFFER_SIZE = 5; // 大廳預載題數
import { checkAchievements } from './achievements.js';
import { expeditionService as ExpeditionService } from '../../../domains/game/expedition/ExpeditionService.js';

function isValidAssembledQuestion(question, optionCount) {
    if (!question || !Array.isArray(question.options) || question.options.length !== optionCount) return false;
    const normalizedAnswer = String(question.answer ?? '').trim();
    const occurrences = question.options.filter(option => String(option ?? '').trim() === normalizedAnswer).length;
    return occurrences === 1
        && Number.isInteger(question.correctIndex)
        && question.correctIndex >= 0
        && question.correctIndex < question.options.length
        && String(question.options[question.correctIndex] ?? '').trim() === normalizedAnswer;
}

/**
 * 大廳預載：清除舊 buffer，重新填充 LOBBY_BUFFER_SIZE 道題（含選項）
 * 每次進大廳（首次加入 / 回到大廳）呼叫一次
 */
export async function startLobbyPrefetch(room) {
    // 清除舊快取
    room.questionBuffer = [];
    room.nextQuestionPromise = null;
    if (room._lobbyPrefetching) return;
    room._lobbyPrefetching = true;

    const stage = room.stage || 1;
    const targetOpts = getOptionCount(stage);

    try {
        for (let i = 0; i < LOBBY_BUFFER_SIZE; i++) {
            if (room.status === 'playing') break; // 遊戲已開始，停止填充
            const q = await generateQuestion({
                mode: 'expedition',
                stage,
                contextData: { answeredIds: Array.from(room.answeredIds || []) }
            });
            if (!q) continue;

            if (!isValidAssembledQuestion(q, targetOpts)) continue;
            room.questionBuffer.push(q);
        }
    } catch (e) {
        console.warn('[gameEngine] Lobby prefetch error:', e.message);
    } finally {
        room._lobbyPrefetching = false;
    }
}

/**
 * 背景預先生成下一題（含選項補充），存入 room.nextQuestionPromise
 */
function prefetchNextQuestion(room) {
    if (room.nextQuestionPromise) return; // 已在預取中，不重複
    const stage = room.stage;

    room.nextQuestionPromise = (async () => {
        try {
            const q = await generateQuestion({
                mode: 'expedition',
                stage,
                contextData: { answeredIds: Array.from(room.answeredIds || []) }
            });
            if (!q) return null;

            // 根據預取當下的階段補充選項
            const needed = getOptionCount(stage);
            if (!isValidAssembledQuestion(q, needed)) return null;
            return q;
        } catch (e) {
            return null;
        }
    })();
}

/**
 * 開始下一題（優先使用預取快取）
 */
export async function startNextQuestion(io, room) {
    if (activeRooms.get(room.teamId) !== room) return;

    try {
        room.members.forEach(member => { member.intentItemId = null; });

        // 優先順序：大廳 buffer → prefetch promise → 即時生成
        let question = null;

        if (room.questionBuffer?.length > 0) {
            question = room.questionBuffer.shift();
        } else if (room.nextQuestionPromise) {
            question = await room.nextQuestionPromise;
            room.nextQuestionPromise = null;
        }

        if (!question) {
            question = await generateQuestion({
                mode: 'expedition',
                stage: room.stage,
                contextData: { answeredIds: Array.from(room.answeredIds || []) }
            });
        }

        await sendQuestionToRoom(io, room.teamId, question);
    } catch (error) {
        console.error('Generate question error:', error);
        room.nextQuestionPromise = null;
        setTimeout(() => startNextQuestion(io, room), 2000);
    }
}

/**
 * 發送新題目到房間。選項必須已由 V4.1 統一組裝器完成。
 */
export async function sendQuestionToRoom(io, teamId, question) {
    const room = activeRooms.get(teamId);
    if (!room) return;

    const targetOptionCount = getOptionCount(room.stage);
    if (!isValidAssembledQuestion(question, targetOptionCount)) {
        console.error('[Expedition V4.1] Rejected question without a valid audited option assembly.');
        room.nextQuestionPromise = null;
        setTimeout(() => startNextQuestion(io, room), 500);
        return;
    }

    room.currentQuestion = question;
    room.phase = 'thinking';
    room.answers = new Map();
    room.removedIndices = new Set();
    
    if (room.answeredIds) {
        room.answeredIds.add(question.id);
    }

    const waitTime = STAGE_WAIT_TIME[room.stage] || 30;
    const removedIndices = [];
    if (room.pendingScroll) {
        const wrongIndices = question.options.map((_, i) => i).filter(i => i !== question.correctIndex);
        const countToRemove = Math.min(wrongIndices.length, 2);
        for (let k = 0; k < countToRemove; k++) {
            const r = Math.floor(Math.random() * wrongIndices.length);
            const removed = wrongIndices.splice(r, 1)[0];
            removedIndices.push(removed);
            room.removedIndices.add(removed);
        }
        room.pendingScroll = false;
    }

    // 只傳客戶端需要的欄位，不暴露 correctIndex/answer/distractors
    io.to(teamId).emit('question:new', {
        id: question.id,
        question: question.question,
        options: question.options,
        book: question.book,
        chapter: question.chapter,
        evidence: question.evidence,
        category: question.category,
        waitTime,
        currentQuestionCount: room.currentQuestionCount,
        removedIndices
    });

    if (removedIndices.length > 0) {
        io.to(teamId).emit('item:effect', {
            type: 'scroll',
            removedIndices: removedIndices,
            byPlayer: '系統 (卷軸效果)'
        });
    }

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        if (room.phase === 'thinking') {
            startAnswerCountdown(io, room);
        }
    }, waitTime * 1000);

    // 題目發出後立即在背景預取下一題（含選項），消除出題延遲
    prefetchNextQuestion(room);
}

/**
 * 開始答題倒數
 */
export function startAnswerCountdown(io, room) {
    room.phase = 'answering';
    io.to(room.teamId).emit('countdown:start', {
        seconds: ANSWER_COUNTDOWN,
        serverTime: Date.now(),
        endTime: Date.now() + ANSWER_COUNTDOWN * 1000
    });

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        judgeAnswers(io, room);
    }, ANSWER_COUNTDOWN * 1000);
}

/**
 * 判定答案
 */
export async function judgeAnswers(io, room) {
    if (!room) return;
    room.phase = 'judging';
    room.members.forEach(member => { member.intentItemId = null; });

    const correctIndex = room.currentQuestion?.correctIndex;
    const results = [];
    let aliveCount = 0;
    let anyCorrect = false;

    // Load Config (Async)
    let stagesConfig = [];
    try {
        const configRow = await dbOps.gamesDb.get("SELECT value FROM expedition_config WHERE key = 'stages'");
        if (configRow) stagesConfig = typeof configRow.value === 'string' ? JSON.parse(configRow.value) : configRow.value;
    } catch (e) { console.error('Failed to parse stages config:', e); }

    if (!stagesConfig.length) {
        // [SOVEREIGN] 遠征與無限挑戰融合：每 100 題一階
        stagesConfig = [
            { milestone: 100, reward: 100, type: 'coins', perQuestionReward: 1 },
            { milestone: 200, reward: 10, type: 'points', perQuestionReward: 2 },
            { milestone: 300, reward: 300, type: 'coins', perQuestionReward: 3 },
            { milestone: 400, reward: 20, type: 'points', perQuestionReward: 4 },
            { milestone: 500, reward: 500, type: 'coins', perQuestionReward: 5 },
            { milestone: 600, reward: 30, type: 'points', perQuestionReward: 5 },
            { milestone: 700, reward: 700, type: 'coins', perQuestionReward: 5 },
            { milestone: 800, reward: 40, type: 'points', perQuestionReward: 5 },
            { milestone: 900, reward: 900, type: 'coins', perQuestionReward: 5 },
            { milestone: 999999, reward: 50, type: 'points', perQuestionReward: 5 }
        ];
    }

    let questionReward = 5;
    try {
        const currentStageConfig = stagesConfig[room.stage - 1];
        if (currentStageConfig && typeof currentStageConfig.perQuestionReward !== 'undefined') {
            questionReward = parseInt(currentStageConfig.perQuestionReward) || 5;
        }
    } catch (e) { }

    // Process members
    for (const member of room.members.values()) {
        let answer = room.answers.get(member.socketId);
        if (!answer) {
            for (const ans of room.answers.values()) {
                if (ans.displayName === member.displayName) answer = ans;
            }
        }

        const isCorrect = Number(answer?.optionIndex) === Number(correctIndex);
        const noAnswer = !answer;
        const finalCorrect = !noAnswer && isCorrect;

        if (finalCorrect) anyCorrect = true;

        const resultObj = {
            displayName: member.displayName,
            optionIndex: answer?.optionIndex ?? null,
            isCorrect: finalCorrect,
            noAnswer,
            shieldUsed: false
        };
        results.push(resultObj);

        if (!noAnswer) member.totalAnswers = (member.totalAnswers || 0) + 1;

        if (finalCorrect && member.lives > 0) {
            member.coins += questionReward;
            member.earnedCoins = (member.earnedCoins || 0) + questionReward;
            member.correctAnswers = (member.correctAnswers || 0) + 1;

            if (member.userId) {
                try {
                    const result = await LogosBank.adjustAssets(member.userId, 'COIN', questionReward, `expedition_question_s${room.stage || 1}`);
                    member.coins = result.coins;
                } catch (e) {
                    console.error(`Failed to sync per-question coins for ${member.displayName}:`, e);
                }
            }
        } else {
            // Damage Logic
            let shieldAvailable = false;
            if (member.hasActiveShield) {
                shieldAvailable = true;
                member.hasActiveShield = false;
            } else if (member.inventory && member.inventory['shield'] > 0) {
                shieldAvailable = true;
                member.inventory['shield'] -= 1;
                if (member.inventory['shield'] <= 0) {
                    delete member.inventory['shield'];
                }
                // [SOVEREIGN] 盾牌消耗僅更新內存，資料庫更新交由退房(Refund)統一處理，避免雙重扣除
            }


            if (shieldAvailable) {
                syncMemberShield(member);
                resultObj.shieldUsed = true;
            } else {
                member.lives -= 1;
                if (member.lives < 0) member.lives = 0;
            }
        }

        if (member.lives > 0) aliveCount++;
    }

    if (anyCorrect) {
        try {
            await dbOps.gamesDb.run('UPDATE expedition_teams SET current_question = current_question + 1 WHERE id = $1', [room.teamId]);
            room.currentQuestionCount = (room.currentQuestionCount || 0) + 1;
        } catch (e) {
            console.error('Failed to increment question count:', e);
        }
    }

    io.to(room.teamId).emit('question:judged', {
        correctIndex: anyCorrect ? correctIndex : null,
        anyCorrect,
        results,
        members: Array.from(room.members.values()).map(getPublicMemberData),
        teamProgress: {
            currentStage: room.stage || 1,
            currentQuestion: room.currentQuestionCount || 0
        }
    });

    if (anyCorrect) {
        if (room.currentQuestion?.id) {
            if (!room.answeredIds) room.answeredIds = new Set();
            room.answeredIds.add(room.currentQuestion.id);
        }

        const currentStageIndex = (room.stage || 1) - 1;
        const currentStageConfig = stagesConfig[currentStageIndex];

        if (currentStageConfig) {
            const milestone = currentStageConfig.milestone;
            const teamRow = await dbOps.gamesDb.get('SELECT current_question FROM expedition_teams WHERE id = $1', [room.teamId]);
            const totalQuestions = teamRow ? teamRow.current_question : room.currentQuestionCount;

            if (totalQuestions >= milestone) {
                const reward = currentStageConfig.reward || 0;
                const rewardType = currentStageConfig.type || 'coins'; // [SOVEREIGN] Support coins and points
                const nextStage = room.stage + 1;

                if (reward > 0) {
                    for (const member of room.members.values()) {
                        if (member.lives <= 0) continue;
                        if (member.userId) {
                            try {
                                if (rewardType === 'points') {
                                    const result = await LogosBank.adjustAssets(member.userId, 'POINT', reward, `expedition_stage_clear_${room.stage}`);
                                    member.points = result.points;
                                } else {
                                    const result = await LogosBank.adjustAssets(member.userId, 'COIN', reward, `expedition_stage_clear_${room.stage}`);
                                    member.coins = result.coins;
                                }
                            } catch (e) { console.error('Failed to sync assets:', e); }
                        } else {
                            if (rewardType === 'points') {
                                member.points = (member.points || 0) + reward;
                            } else {
                                member.coins += reward;
                            }
                        }
                    }
                }

                await dbOps.gamesDb.run('UPDATE expedition_teams SET current_stage = $1 WHERE id = $2', [nextStage, room.teamId]);
                room.stage = nextStage;

                // [GOSPEL SHOES] 隊長攜帶福音鞋 → 進入新關卡自動存檔
                const owner = Array.from(room.members.values()).find(m => m.isOwner);
                if (owner && (owner.backpack?.shoes > 0 || owner.inventory?.shoes > 0)) {
                    try {
                        await ExpeditionService.saveProgress(room.teamId, room.stage, 0, true, { isAutoSave: true });
                        console.log(`👟 [Gospel Shoes] Auto-saved at stage ${room.stage} for team ${room.teamId}`);
                    } catch (e) { console.error('[Gospel Shoes] Auto-save failed:', e); }
                }

                io.to(room.teamId).emit('stage:cleared', {
                    stage: room.stage - 1,
                    nextStage: room.stage,
                    reward: reward,
                    rewardType: rewardType,
                    totalQuestions
                });

                await checkAchievements(io, room, 'milestone', { stage: nextStage, questionCount: totalQuestions });
                
                io.to(room.teamId).emit('team:updated', {
                    members: Array.from(room.members.values()).map(getPublicMemberData),
                    currentStage: room.stage,
                    currentQuestion: room.currentQuestionCount
                });
            }
        }
    }

    if (aliveCount === 0) {
        let checkpoint = room.tentCheckpoint || null;
        try {
            await dbOps.gamesDb.run("UPDATE expedition_teams SET status = $1 WHERE id = $2", ['gameover', room.teamId]);
        } catch (e) { console.error('Failed to update team status on game over:', e); }

        io.to(room.teamId).emit('game:over', {
            reason: 'all_dead',
            checkpoint
        });
        return;
    }

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(async () => {
        if (anyCorrect) {
            await startNextQuestion(io, room);
        } else {
            // 答錯重出同一題，先清快取避免跳題
            room.nextQuestionPromise = null;
            await sendQuestionToRoom(io, room.teamId, room.currentQuestion);
        }
    }, 2000);
}
