import { randomUUID } from 'node:crypto';
import { dbOps } from '../../../database/index.js';
import { applyAICreditGrantTx, applyCoinDeltaTx, EconomyError } from '../../economy/AssetLedgerService.js';

export class GameRewardError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'GameRewardError';
        this.code = code;
        this.status = status;
    }
}

const MODE_ALIASES = {
    millionaire: 'classic',
    endless: 'infinite',
    expedition: 'infinite'
};
const ALLOWED_MODES = new Set(['classic', 'speed', 'casual', 'practice', 'infinite']);
const SETTLEMENT_REASONS = new Set([
    'gameover', 'victory', 'speed-complete', 'walk-away', 'exit', 'timeout', 'unknown'
]);

const asInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
};

const parseJson = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

const normalizeMode = (mode, isInfiniteMode = false) => {
    if (isInfiniteMode) return 'infinite';
    const candidate = MODE_ALIASES[String(mode || '').toLowerCase()] || String(mode || '').toLowerCase();
    if (!ALLOWED_MODES.has(candidate)) {
        throw new GameRewardError('INVALID_GAME_MODE', '不支援的遊戲模式');
    }
    return candidate;
};

const normalizeBooks = (books) => {
    if (!Array.isArray(books)) return [];
    return books.slice(0, 66).map((book) => {
        if (typeof book === 'string') return book.trim().slice(0, 80);
        return String(book?.book || book?.name || '').trim().slice(0, 80);
    }).filter(Boolean);
};

const loadConfigValue = async (key, fallback) => {
    try {
        const row = await dbOps.gamesDb.get('SELECT value FROM expedition_config WHERE key = $1', [key]);
        return { ...fallback, ...parseJson(row?.value, {}) };
    } catch (error) {
        console.warn(`[GameReward] Failed to load ${key}; safe defaults are active:`, error.message);
        return fallback;
    }
};

async function loadRewardConfig() {
    const [classic, speed, infinite] = await Promise.all([
        loadConfigValue('classic_reward_config', {
            perQuestion: 1,
            victoryBonus: 0.2,
            categoryBonuses: [{ minBooks: 5, bonus: 0.1 }, { minBooks: 11, bonus: 0.15 }]
        }),
        loadConfigValue('speed_reward_config', {
            perQuestion: 2,
            streakBonuses: [{ streak: 5, bonus: 0.1 }, { streak: 10, bonus: 0.15 }, { streak: 15, bonus: 0.2 }]
        }),
        loadConfigValue('infinite_reward_config', {
            boostRatePer20Levels: 0.05,
            maxBoostMultiplier: 1,
            milestoneOddHundredCoinsMultiplier: 100,
            milestoneEvenHundredPointsMultiplier: 5
        })
    ]);
    return { classic, speed, infinite };
}

const highestRate = (rules, count, thresholdKey) => {
    if (!Array.isArray(rules)) return 0;
    return rules.reduce((best, rule) => {
        const threshold = Number(rule?.[thresholdKey]);
        const bonus = Number(rule?.bonus);
        return Number.isFinite(threshold) && Number.isFinite(bonus) && count >= threshold
            ? Math.max(best, Math.max(0, Math.min(1, bonus)))
            : best;
    }, 0);
};

function calculateGameplayReward(session, attempts, config, issuedBookCount = 0) {
    if (session.mode === 'casual' || session.mode === 'practice') return 0;

    if (session.mode === 'speed') {
        const base = asInteger(config.speed.perQuestion, 2, 0, 100);
        let reward = 0;
        let streak = 0;
        for (const attempt of attempts) {
            if (!attempt.isCorrect) {
                streak = 0;
                continue;
            }
            streak += 1;
            const rate = highestRate(config.speed.streakBonuses, streak, 'streak');
            reward += base + Math.ceil(base * rate);
        }
        return reward;
    }

    const base = asInteger(config.classic.perQuestion, 1, 0, 100);
    const categoryRate = highestRate(config.classic.categoryBonuses, issuedBookCount, 'minBooks');
    let reward = Number(session.correctCount) * (base + Math.ceil(base * categoryRate));
    const completedPerfectly = Number(session.totalAnswered) >= Number(session.questionCount)
        && Number(session.correctCount) === Number(session.totalAnswered);
    if (completedPerfectly) {
        const victoryRate = Math.max(0, Math.min(1, Number(config.classic.victoryBonus) || 0));
        reward += Math.ceil(reward * victoryRate);
    }

    if (session.mode === 'infinite' && Number(session.totalAnswered) >= 16) {
        const levels = Math.floor((Number(session.totalAnswered) - 1) / 20);
        const boost = Math.min(
            Math.max(0, Number(config.infinite.maxBoostMultiplier) || 0),
            levels * Math.max(0, Number(config.infinite.boostRatePer20Levels) || 0)
        );
        reward += Math.ceil(reward * boost);
    }
    return reward;
}

async function awardNewMilestonesTx(tx, session, config) {
    if (session.mode !== 'infinite') return { coins: 0, points: 0, levels: [] };
    const hundreds = Math.floor(Number(session.totalAnswered) / 100);
    const coinMultiplier = asInteger(config.infinite.milestoneOddHundredCoinsMultiplier, 100, 0, 1000);
    const pointMultiplier = asInteger(config.infinite.milestoneEvenHundredPointsMultiplier, 5, 0, 100);
    let coins = 0;
    let points = 0;
    const levels = [];

    for (let index = 1; index <= hundreds; index += 1) {
        const level = index * 100;
        const inserted = await tx.get(`
            INSERT INTO user_game_milestones (user_id, milestone_level, session_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, milestone_level) DO NOTHING
            RETURNING milestone_level
        `, [session.userId, level, session.id]);
        if (!inserted) continue;
        levels.push(level);
        if (index % 2 === 1) coins += index * coinMultiplier;
        else points += index * pointMultiplier;
    }
    return { coins, points, levels };
}

const achievementCandidates = (session) => {
    const candidates = [];
    if (session.mode === 'classic' || session.mode === 'infinite') {
        candidates.push('first_game');
        if (Number(session.totalAnswered) >= Number(session.questionCount)
            && Number(session.correctCount) === Number(session.totalAnswered)) {
            candidates.push('classic_win');
            const lifelines = parseJson(session.lifelinesUsed, {});
            if (!Object.values(lifelines).some(Boolean)) candidates.push('no_lifeline_win');
        }
        if (Number(session.correctCount) === 0) candidates.push('unlucky');
    }
    if (session.mode === 'speed') {
        candidates.push('speed_first');
        if (Number(session.totalAnswered) >= 10
            && Number(session.correctCount) === Number(session.totalAnswered)) candidates.push('speed_perfect');
        if (Number(session.maxStreak) >= 10) candidates.push('streak_10');
        if (Number(session.maxStreak) >= 15) candidates.push('streak_15');
    }
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) candidates.push('night_owl');
    if (hour >= 5 && hour < 7) candidates.push('early_bird');
    return [...new Set(candidates)];
};

async function unlockAchievementsTx(tx, session) {
    const unlocked = [];
    let coinReward = 0;
    for (const achievementId of achievementCandidates(session)) {
        const achievement = await tx.get('SELECT * FROM achievements WHERE id = $1', [achievementId]);
        if (!achievement) continue;
        const inserted = await tx.get(`
            INSERT INTO user_achievements (user_id, achievement_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, achievement_id) DO NOTHING
            RETURNING achievement_id, unlocked_at
        `, [session.userId, achievementId]);
        if (!inserted) continue;
        const reward = asInteger(achievement.coinReward ?? achievement.coin_reward, 0, 0, 1000);
        coinReward += reward;
        unlocked.push({
            id: achievement.id,
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
            coinReward: reward,
            unlockedAt: inserted.unlockedAt ?? inserted.unlocked_at
        });
    }
    return { unlocked, coinReward };
}

export async function createGameSession(userId, input = {}) {
    const mode = normalizeMode(input.mode, input.isInfiniteMode === true);
    const maxQuestions = mode === 'infinite' ? 5000 : 200;
    const questionCount = asInteger(input.questionCount, 15, 1, maxQuestions);
    const clientSessionKey = String(input.clientSessionKey || '').trim();
    if (!/^[A-Za-z0-9:_-]{8,120}$/.test(clientSessionKey)) {
        throw new GameRewardError('INVALID_CLIENT_SESSION_KEY', '遊戲階段識別碼格式不正確');
    }
    const selectedBooks = normalizeBooks(input.selectedBooks);
    const id = randomUUID();

    return dbOps.usersDb.transaction(async (tx) => {
        const user = await tx.get('SELECT status FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (!user || user.status !== 'active') {
            throw new GameRewardError('ACCOUNT_NOT_ACTIVE', '帳號不存在或已停用', 403);
        }

        const existing = await tx.get(`
            SELECT * FROM game_reward_sessions
            WHERE user_id = $1 AND client_session_key = $2
        `, [userId, clientSessionKey]);
        if (existing) return existing;

        return tx.get(`
            INSERT INTO game_reward_sessions
                (id, user_id, client_session_key, mode, question_count, selected_books, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP + INTERVAL '4 hours')
            RETURNING *
        `, [id, userId, clientSessionKey, mode, questionCount, JSON.stringify(selectedBooks)]);
    });
}

export async function registerIssuedQuestions(userId, sessionId, questions, context = {}) {
    const uniqueQuestions = new Map();
    for (const question of questions || []) {
        const id = String(typeof question === 'object' ? question?.id : question || '').trim().slice(0, 200);
        if (!id || uniqueQuestions.has(id)) continue;
        const book = typeof question === 'object' ? String(question?.book || '').trim().slice(0, 80) : '';
        uniqueQuestions.set(id, { id, book: book || null });
        if (uniqueQuestions.size >= 200) break;
    }
    if (!sessionId || uniqueQuestions.size === 0) return { registered: 0 };
    return dbOps.usersDb.transaction(async (tx) => {
        const session = await tx.get(`
            SELECT id, user_id, status, expires_at, mode
            FROM game_reward_sessions
            WHERE id = $1
            FOR UPDATE
        `, [sessionId]);
        if (!session || session.userId !== userId) {
            throw new GameRewardError('GAME_SESSION_NOT_FOUND', '找不到遊戲階段', 404);
        }
        if (session.status !== 'active' || new Date(session.expiresAt) <= new Date()) {
            throw new GameRewardError('GAME_SESSION_INACTIVE', '遊戲階段已結束', 409);
        }
        if (context.requestedMode) {
            const requestedMode = normalizeMode(context.requestedMode, context.isInfiniteMode === true);
            if (requestedMode !== session.mode) {
                throw new GameRewardError('GAME_MODE_MISMATCH', '題目模式與遊戲階段不一致', 409);
            }
        }
        let registered = 0;
        for (const question of uniqueQuestions.values()) {
            const result = await tx.run(`
                INSERT INTO game_reward_session_questions (session_id, question_id, book)
                VALUES ($1, $2, $3)
                ON CONFLICT (session_id, question_id) DO UPDATE SET
                    book = COALESCE(game_reward_session_questions.book, EXCLUDED.book)
            `, [sessionId, question.id, question.book]);
            registered += result.rowCount || 0;
        }
        return { registered };
    });
}

export async function recordVerifiedAttempt(userId, sessionId, decodedAnswerToken, isCorrect, telemetry = {}) {
    const questionId = String(decodedAnswerToken?.id || '').trim().slice(0, 200);
    if (!questionId) throw new GameRewardError('INVALID_QUESTION_ID', '題目識別碼不存在');
    const revisionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(decodedAnswerToken?.revisionId || ''))
        ? String(decodedAnswerToken.revisionId)
        : null;
    const selectedOption = telemetry?.selectedOption == null
        ? null
        : String(telemetry.selectedOption).trim().slice(0, 200);
    const responseMsValue = Number(telemetry?.responseMs);
    const responseMs = Number.isFinite(responseMsValue)
        ? Math.max(0, Math.min(600000, Math.round(responseMsValue)))
        : null;

    return dbOps.usersDb.transaction(async (tx) => {
        const session = await tx.get(`
            SELECT * FROM game_reward_sessions
            WHERE id = $1
            FOR UPDATE
        `, [sessionId]);
        if (!session || session.userId !== userId) {
            throw new GameRewardError('GAME_SESSION_NOT_FOUND', '找不到遊戲階段', 404);
        }
        if (session.status !== 'active' || new Date(session.expiresAt) <= new Date()) {
            throw new GameRewardError('GAME_SESSION_INACTIVE', '遊戲階段已結束', 409);
        }
        if (Number(session.totalAnswered) >= Number(session.questionCount)) {
            throw new GameRewardError('QUESTION_LIMIT_REACHED', '本局已達題數上限', 409);
        }
        const issued = await tx.get(`
            SELECT question_id FROM game_reward_session_questions
            WHERE session_id = $1 AND question_id = $2
        `, [sessionId, questionId]);
        if (!issued) {
            throw new GameRewardError('QUESTION_NOT_ISSUED', '此題不屬於目前遊戲階段', 409);
        }

        const inserted = await tx.get(`
            INSERT INTO game_reward_attempts (
                session_id, question_id, is_correct, question_revision_id,
                selected_option, response_ms, game_mode
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (session_id, question_id) DO NOTHING
            RETURNING id
        `, [
            sessionId,
            questionId,
            Boolean(isCorrect),
            revisionId,
            selectedOption,
            responseMs,
            session.mode
        ]);
        if (!inserted) {
            return { recorded: false, duplicate: true };
        }

        const nextStreak = isCorrect ? Number(session.currentStreak) + 1 : 0;
        const maxStreak = Math.max(Number(session.maxStreak), nextStreak);
        await tx.run(`
            UPDATE game_reward_sessions
            SET total_answered = total_answered + 1,
                correct_count = correct_count + $1,
                current_streak = $2,
                max_streak = $3
            WHERE id = $4
        `, [isCorrect ? 1 : 0, nextStreak, maxStreak, sessionId]);
        return { recorded: true, duplicate: false };
    });
}

export async function recordSessionLifelineTx(tx, userId, sessionId, lifelineType) {
    if (!sessionId) return;
    const session = await tx.get(`
        SELECT user_id, status, lifelines_used
        FROM game_reward_sessions
        WHERE id = $1
        FOR UPDATE
    `, [sessionId]);
    if (!session || session.userId !== userId || session.status !== 'active') return;
    const lifelines = parseJson(session.lifelinesUsed, {});
    lifelines[String(lifelineType)] = Number(lifelines[String(lifelineType)] || 0) + 1;
    await tx.run(`
        UPDATE game_reward_sessions SET lifelines_used = $1::jsonb WHERE id = $2
    `, [JSON.stringify(lifelines), sessionId]);
}

export async function settleGameSession(userId, sessionId, requestedReason = 'unknown') {
    const config = await loadRewardConfig();
    const reason = SETTLEMENT_REASONS.has(requestedReason) ? requestedReason : 'unknown';
    const perSessionCap = asInteger(process.env.GAME_REWARD_SESSION_COIN_CAP, 2500, 0, 100000);
    const dailyCoinCap = asInteger(process.env.GAME_REWARD_DAILY_COIN_CAP, 5000, 0, 1000000);
    const dailyPointCap = asInteger(process.env.GAME_REWARD_DAILY_POINT_CAP, 100, 0, 10000);

    return dbOps.usersDb.transaction(async (tx) => {
        const session = await tx.get(`
            SELECT * FROM game_reward_sessions
            WHERE id = $1
            FOR UPDATE
        `, [sessionId]);
        if (!session || session.userId !== userId) {
            throw new GameRewardError('GAME_SESSION_NOT_FOUND', '找不到遊戲階段', 404);
        }
        if (session.status === 'settled') {
            return parseJson(session.settlementResult, {
                success: true,
                duplicate: true,
                sessionId: session.id,
                coinsAwarded: Number(session.coinsAwarded),
                pointsAwarded: Number(session.pointsAwarded)
            });
        }
        if (session.status !== 'active') {
            throw new GameRewardError('GAME_SESSION_INACTIVE', '遊戲階段已結束', 409);
        }
        if (Number(session.totalAnswered) < 1) {
            throw new GameRewardError('NO_VERIFIED_ATTEMPTS', '沒有可結算的已驗證作答', 409);
        }

        const attempts = await tx.query(`
            SELECT is_correct FROM game_reward_attempts
            WHERE session_id = $1
            ORDER BY id
        `, [sessionId]);
        const issuedBooksRow = await tx.get(`
            SELECT COUNT(DISTINCT sq.book) AS count
            FROM game_reward_session_questions sq
            JOIN game_reward_attempts ga
              ON ga.session_id = sq.session_id AND ga.question_id = sq.question_id
            WHERE sq.session_id = $1 AND sq.book IS NOT NULL
        `, [sessionId]);
        const gameplayCoins = calculateGameplayReward(
            session,
            attempts,
            config,
            Number(issuedBooksRow?.count || 0)
        );
        const milestone = await awardNewMilestonesTx(tx, session, config);
        const achievements = await unlockAchievementsTx(tx, session);

        const dailyCoinsRow = await tx.get(`
            SELECT COALESCE(SUM(delta), 0) AS total
            FROM asset_ledger
            WHERE user_id = $1
              AND asset_type = 'COIN'
              AND delta > 0
              AND reason_code = 'game_reward_settlement'
              AND created_at >= CURRENT_DATE
        `, [userId]);
        const dailyPointsRow = await tx.get(`
            SELECT COALESCE(SUM(delta), 0) AS total
            FROM asset_ledger
            WHERE user_id = $1
              AND asset_type = 'AI_CREDIT'
              AND delta > 0
              AND reason_code = 'game_milestone_reward'
              AND created_at >= CURRENT_DATE
        `, [userId]);

        const requestedCoins = gameplayCoins + milestone.coins + achievements.coinReward;
        const dailyCoins = Number(dailyCoinsRow?.total || 0);
        const dailyPoints = Number(dailyPointsRow?.total || 0);
        const coinsAwarded = Math.max(0, Math.min(requestedCoins, perSessionCap, dailyCoinCap - dailyCoins));
        const pointsAwarded = Math.max(0, Math.min(milestone.points, dailyPointCap - dailyPoints));

        let coinBalance = Number((await tx.get('SELECT coins FROM users WHERE id = $1', [userId]))?.coins || 0);
        if (coinsAwarded > 0) {
            const reward = await applyCoinDeltaTx(tx, {
                userId,
                delta: coinsAwarded,
                reasonCode: 'game_reward_settlement',
                sourceId: sessionId,
                idempotencyKey: `game:session:${sessionId}:coins`,
                metadata: {
                    mode: session.mode,
                    gameplayCoins,
                    milestoneCoins: milestone.coins,
                    achievementCoins: achievements.coinReward,
                    capped: coinsAwarded < requestedCoins
                }
            });
            coinBalance = reward.balance;
        }

        let aiCreditBalance = null;
        if (pointsAwarded > 0) {
            const reward = await applyAICreditGrantTx(tx, {
                userId,
                amount: pointsAwarded,
                reasonCode: 'game_milestone_reward',
                sourceId: sessionId,
                idempotencyKey: `game:session:${sessionId}:points`,
                metadata: { milestoneLevels: milestone.levels, capped: pointsAwarded < milestone.points }
            });
            aiCreditBalance = reward.balance;
        }

        await tx.run(`
            UPDATE users
            SET total_games = COALESCE(total_games, 0) + 1,
                total_correct = COALESCE(total_correct, 0) + $1,
                total_answered = COALESCE(total_answered, 0) + $2
            WHERE id = $3
        `, [Number(session.correctCount), Number(session.totalAnswered), userId]);

        const profile = await tx.get('SELECT username, display_name FROM users WHERE id = $1', [userId]);
        const displayName = profile?.displayName || profile?.username || '玩家';
        const serverScore = Number(session.correctCount);
        if (session.mode === 'infinite') {
            await tx.run(`
                INSERT INTO infinite_leaderboard (user_id, name, level, date, timestamp)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
                ON CONFLICT (user_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    level = GREATEST(infinite_leaderboard.level, EXCLUDED.level),
                    date = CASE WHEN EXCLUDED.level > infinite_leaderboard.level THEN CURRENT_TIMESTAMP ELSE infinite_leaderboard.date END,
                    timestamp = CASE WHEN EXCLUDED.level > infinite_leaderboard.level THEN EXCLUDED.timestamp ELSE infinite_leaderboard.timestamp END
            `, [userId, displayName, Number(session.totalAnswered), Date.now()]);
        } else {
            await tx.run(`
                INSERT INTO leaderboard
                    (id, user_id, name, score, total_score, games_played, high_score, is_victory, mode, game_mode, date, timestamp, last_updated)
                VALUES ($1, $1, $2, $3, $3, 1, $3, $4, $5, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    score = EXCLUDED.score,
                    total_score = leaderboard.total_score + EXCLUDED.score,
                    games_played = leaderboard.games_played + 1,
                    high_score = GREATEST(leaderboard.high_score, EXCLUDED.high_score),
                    is_victory = EXCLUDED.is_victory,
                    mode = EXCLUDED.mode,
                    game_mode = EXCLUDED.game_mode,
                    date = CURRENT_TIMESTAMP,
                    timestamp = EXCLUDED.timestamp,
                    last_updated = CURRENT_TIMESTAMP
            `, [
                userId,
                displayName,
                serverScore,
                Number(session.totalAnswered) >= Number(session.questionCount)
                    && Number(session.correctCount) === Number(session.totalAnswered),
                session.mode,
                Date.now()
            ]);
        }

        const result = {
            success: true,
            duplicate: false,
            sessionId,
            mode: session.mode,
            reason,
            correctCount: Number(session.correctCount),
            totalAnswered: Number(session.totalAnswered),
            maxStreak: Number(session.maxStreak),
            serverScore,
            coinsAwarded,
            pointsAwarded,
            coinBalance,
            aiCreditBalance,
            milestoneLevels: milestone.levels,
            newlyUnlocked: achievements.unlocked,
            capped: coinsAwarded < requestedCoins || pointsAwarded < milestone.points
        };

        await tx.run(`
            UPDATE game_reward_sessions
            SET status = 'settled',
                coins_awarded = $1,
                points_awarded = $2,
                server_score = $3,
                settlement_reason = $4,
                settlement_result = $5::jsonb,
                settled_at = CURRENT_TIMESTAMP
            WHERE id = $6
        `, [coinsAwarded, pointsAwarded, serverScore, reason, JSON.stringify(result), sessionId]);

        if (result.capped) {
            console.warn('[GameReward] Reward cap applied', { userId, sessionId, requestedCoins, coinsAwarded });
        }
        return result;
    });
}

export async function getGameSession(userId, sessionId) {
    const session = await dbOps.usersDb.get(`
        SELECT id, mode, question_count, status, correct_count, total_answered,
               max_streak, coins_awarded, points_awarded, server_score,
               started_at, expires_at, settled_at
        FROM game_reward_sessions
        WHERE id = $1 AND user_id = $2
    `, [sessionId, userId]);
    if (!session) throw new GameRewardError('GAME_SESSION_NOT_FOUND', '找不到遊戲階段', 404);
    return session;
}

export async function abandonGameSession(userId, sessionId) {
    const result = await dbOps.usersDb.run(`
        UPDATE game_reward_sessions
        SET status = 'abandoned', settled_at = CURRENT_TIMESTAMP, settlement_reason = 'exit'
        WHERE id = $1 AND user_id = $2 AND status = 'active'
    `, [sessionId, userId]);
    return { success: true, changed: result.changes || 0 };
}

export function toSafeGameRewardError(error) {
    if (error instanceof GameRewardError || error instanceof EconomyError) {
        return { status: error.status || 400, code: error.code, message: error.message };
    }
    return { status: 500, code: 'SERVER_ERROR', message: '遊戲結算暫時無法完成' };
}
