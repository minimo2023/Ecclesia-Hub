import { BOOK_CHAPTERS } from '../../../../src/data/constants.js';
import { dbOps } from '../../../database/index.js';
import { applyCoinDeltaTx } from '../../economy/AssetLedgerService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_DAYS = ['0', '1', '2', '3', '4', '5', '6'];

export class ReadingPlanError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ReadingPlanError';
        this.code = code;
        this.status = status;
    }
}

export function taiwanDateKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function parseDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) throw new ReadingPlanError('INVALID_DATE', '日期格式不正確');
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateKey(date) {
    return date.toISOString().slice(0, 10);
}

export function databaseDateKey(value) {
    if (typeof value === 'string') {
        const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
        if (match) return match[0];
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    throw new ReadingPlanError('INVALID_DATE', '日期格式不正確');
}

function addDays(dateKey, amount) {
    return formatDateKey(new Date(parseDateKey(dateKey).getTime() + amount * DAY_MS));
}

function normalizeReadingDays(readingDays) {
    const values = Array.isArray(readingDays) ? readingDays.map(String) : ALL_DAYS;
    const normalized = [...new Set(values.filter(day => ALL_DAYS.includes(day)))];
    if (normalized.length === 0) {
        throw new ReadingPlanError('READING_DAYS_REQUIRED', '請至少選擇一個閱讀日');
    }
    return normalized;
}

function eligibleDates(startDate, durationDays, readingDays) {
    const allowed = new Set(normalizeReadingDays(readingDays));
    const duration = Number(durationDays);
    if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
        throw new ReadingPlanError('INVALID_DURATION', '目標天數必須介於 1 到 3650 天');
    }
    const dates = [];
    for (let offset = 0; offset < duration; offset += 1) {
        const value = addDays(startDate, offset);
        if (allowed.has(String(parseDateKey(value).getUTCDay()))) dates.push(value);
    }
    if (dates.length === 0) {
        for (let offset = duration; offset < duration + 7; offset += 1) {
            const value = addDays(startDate, offset);
            if (allowed.has(String(parseDateKey(value).getUTCDay()))) {
                dates.push(value);
                break;
            }
        }
    }
    return dates;
}

export function expandBooks(targetBooks) {
    if (!Array.isArray(targetBooks) || targetBooks.length === 0) {
        throw new ReadingPlanError('TARGET_BOOKS_REQUIRED', '請至少選擇一卷書');
    }
    const unknown = targetBooks.filter(book => !BOOK_CHAPTERS[book]);
    if (unknown.length) {
        throw new ReadingPlanError('INVALID_BOOK', `不支援的書卷：${unknown.join('、')}`);
    }
    return [...new Set(targetBooks)].flatMap(book =>
        Array.from({ length: BOOK_CHAPTERS[book] }, (_, index) => ({ book, chapter: index + 1 }))
    );
}

export function distributeReferences(references, dates) {
    if (!Array.isArray(references) || references.length === 0) return [];
    if (!Array.isArray(dates) || dates.length === 0) {
        throw new ReadingPlanError('NO_READING_DATE', '所選期間內沒有可用閱讀日');
    }
    const groupCount = Math.min(references.length, dates.length);
    const base = Math.floor(references.length / groupCount);
    let extra = references.length % groupCount;
    let cursor = 0;
    return dates.slice(0, groupCount).map((assignedDate, index) => {
        const size = base + (extra > 0 ? 1 : 0);
        extra = Math.max(0, extra - 1);
        const scriptureReferences = references.slice(cursor, cursor + size);
        cursor += size;
        return { dayNumber: index + 1, assignedDate, scriptureReferences };
    });
}

export function buildSchedule({ targetBooks, durationDays, readingDays, startDate = taiwanDateKey() }) {
    const references = expandBooks(targetBooks);
    const dates = eligibleDates(startDate, durationDays, readingDays);
    const schedule = distributeReferences(references, dates);
    const maxChaptersPerDay = Math.max(...schedule.map(item => item.scriptureReferences.length));
    return {
        schedule,
        summary: {
            totalChapters: references.length,
            actualReadingDays: schedule.length,
            averageChaptersPerDay: Number((references.length / schedule.length).toFixed(1)),
            maxChaptersPerDay,
            highLoad: maxChaptersPerDay > 10,
            targetEndDate: addDays(startDate, Number(durationDays) - 1)
        }
    };
}

function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function ownedPlan(tx, userPlanId, userId, lock = false) {
    return tx.get(`
        SELECT urp.*, rp.title AS plan_name, rp.description AS plan_desc, rp.target_ranges,
               rp.default_duration_days
        FROM public.user_reading_plans urp
        JOIN public.reading_plans rp ON rp.id = urp.plan_id
        WHERE urp.id = $1 AND urp.user_id = $2
        ${lock ? 'FOR UPDATE OF urp' : ''}
    `, [userPlanId, userId]);
}

async function ownedSchedule(tx, scheduleId, userId, lock = false) {
    return tx.get(`
        SELECT urs.*, urp.user_id, urp.status, urp.reading_days, urp.target_end_date
        FROM public.user_reading_schedule urs
        JOIN public.user_reading_plans urp ON urp.id = urs.user_plan_id
        WHERE urs.id = $1 AND urp.user_id = $2
        ${lock ? 'FOR UPDATE OF urs, urp' : ''}
    `, [scheduleId, userId]);
}

async function unlockReadingPlanAchievementsTx(tx, userId) {
    const completedPlans = await tx.query(`
        SELECT urp.id, rp.target_ranges
        FROM public.user_reading_plans urp
        JOIN public.reading_plans rp ON rp.id = urp.plan_id
        WHERE urp.user_id = $1 AND urp.status = 'completed'
    `, [userId]);
    const requested = ['reading_first_plan'];
    const completedBooks = new Set(completedPlans.flatMap(plan => parseJsonArray(plan.targetRanges)));
    if (completedBooks.size === Object.keys(BOOK_CHAPTERS).length) requested.push('reading_bible');

    const unlocked = [];
    for (const achievementId of requested) {
        const achievement = await tx.get('SELECT * FROM achievements WHERE id = $1', [achievementId]);
        if (!achievement) continue;
        const inserted = await tx.get(`
            INSERT INTO user_achievements (user_id, achievement_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            RETURNING achievement_id
        `, [userId, achievementId]);
        if (!inserted) continue;
        const reward = Number(achievement.coinReward || 0);
        if (reward > 0) {
            await applyCoinDeltaTx(tx, {
                userId,
                delta: reward,
                reasonCode: `achievement_unlock_${achievementId}`,
                sourceId: achievementId,
                idempotencyKey: `achievement:${userId}:${achievementId}`
            });
        }
        unlocked.push({ ...achievement, coinReward: reward });
    }
    return unlocked;
}

export class ReadingPlanService {
    static preview(input) {
        return buildSchedule({
            targetBooks: input.target_books || input.targetBooks || input.target_ranges,
            durationDays: input.duration_days || input.durationDays || input.target_days || 30,
            readingDays: input.reading_days || input.readingDays || ALL_DAYS
        });
    }

    static async create(userId, input) {
        const targetBooks = input.target_books || input.targetBooks || [];
        const targetDays = Number(input.target_days || input.duration_days || 30);
        const readingDays = normalizeReadingDays(input.reading_days || ALL_DAYS);
        const generated = buildSchedule({ targetBooks, durationDays: targetDays, readingDays });
        return dbOps.notesDb.transaction(async tx => {
            await tx.run(`
                UPDATE public.user_reading_plans
                SET status = 'abandoned'
                WHERE user_id = $1 AND status = 'active'
            `, [userId]);

            let planId = input.plan_id || input.planId;
            if (!planId || planId === 'custom') {
                const plan = await tx.get(`
                    INSERT INTO public.reading_plans
                        (title, description, target_ranges, default_duration_days)
                    VALUES ($1, $2, $3::jsonb, $4)
                    RETURNING id
                `, ['自訂讀經計畫', '使用者自訂的專屬計畫', JSON.stringify(targetBooks), targetDays]);
                planId = plan.id;
            }
            const userPlan = await tx.get(`
                INSERT INTO public.user_reading_plans
                    (user_id, plan_id, schedule_algorithm, reading_days, target_end_date, schedule_version)
                VALUES ($1, $2, $3, $4::jsonb, $5, 'v4.2')
                RETURNING id
            `, [userId, planId, input.schedule_algorithm || 'chronological', JSON.stringify(readingDays), generated.summary.targetEndDate]);

            for (const item of generated.schedule) {
                await tx.run(`
                    INSERT INTO public.user_reading_schedule
                        (user_plan_id, day_number, assigned_date, scripture_references)
                    VALUES ($1, $2, $3, $4::jsonb)
                `, [userPlan.id, item.dayNumber, item.assignedDate, JSON.stringify(item.scriptureReferences)]);
            }
            return { userPlanId: userPlan.id, ...generated.summary };
        });
    }

    static async getOwnedSchedule(scheduleId, userId) {
        const schedule = await ownedSchedule(dbOps.notesDb, scheduleId, userId);
        if (!schedule) throw new ReadingPlanError('SCHEDULE_NOT_FOUND', '找不到排程', 404);
        return { ...schedule, scriptureReferences: parseJsonArray(schedule.scriptureReferences) };
    }

    static async getActivePlan(userId) {
        const plan = await dbOps.notesDb.get(`
            SELECT urp.*, rp.title AS plan_name, rp.description AS plan_desc
            FROM public.user_reading_plans urp
            JOIN public.reading_plans rp ON rp.id = urp.plan_id
            WHERE urp.user_id = $1 AND urp.status = 'active'
            ORDER BY urp.started_at DESC LIMIT 1
        `, [userId]);
        if (!plan) return null;
        const schedules = await dbOps.notesDb.query(`
            SELECT * FROM public.user_reading_schedule
            WHERE user_plan_id = $1 ORDER BY day_number
        `, [plan.id]);
        return {
            ...plan,
            targetEndDate: plan.targetEndDate ? databaseDateKey(plan.targetEndDate) : null,
            schedules: schedules.map(schedule => ({
                ...schedule,
                assignedDate: databaseDateKey(schedule.assignedDate)
            }))
        };
    }

    static async abandon(userId, userPlanId) {
        return dbOps.notesDb.transaction(async tx => {
            const plan = await ownedPlan(tx, userPlanId, userId, true);
            if (!plan) throw new ReadingPlanError('PLAN_NOT_FOUND', '找不到讀經計畫', 404);
            await tx.run(`
                UPDATE public.user_reading_plans
                SET status = 'abandoned'
                WHERE id = $1 AND status = 'active'
            `, [userPlanId]);
            return { status: plan.status === 'active' ? 'abandoned' : plan.status };
        });
    }

    static async resync(userId, userPlanId, strategy) {
        if (!['shift', 'distribute'].includes(strategy)) {
            throw new ReadingPlanError('INVALID_STRATEGY', '重排方式必須是 shift 或 distribute');
        }
        return dbOps.notesDb.transaction(async tx => {
            const plan = await ownedPlan(tx, userPlanId, userId, true);
            if (!plan || plan.status !== 'active') {
                throw new ReadingPlanError('PLAN_NOT_FOUND', '找不到進行中的讀經計畫', 404);
            }
            const incomplete = await tx.query(`
                SELECT * FROM public.user_reading_schedule
                WHERE user_plan_id = $1 AND completed_at IS NULL
                ORDER BY day_number FOR UPDATE
            `, [userPlanId]);
            if (incomplete.length === 0) return { changed: 0, before: [], after: [] };

            const before = incomplete.map(row => ({
                id: row.id,
                assignedDate: databaseDateKey(row.assignedDate),
                scriptureReferences: parseJsonArray(row.scriptureReferences)
            }));
            const readingDays = parseJsonArray(plan.readingDays);
            const today = taiwanDateKey();
            let groups;
            if (strategy === 'shift') {
                const dates = eligibleDates(today, Math.max(incomplete.length * 7, 7), readingDays);
                groups = incomplete.map((row, index) => ({
                    scriptureReferences: parseJsonArray(row.scriptureReferences),
                    assignedDate: dates[index]
                }));
            } else {
                const refs = incomplete.flatMap(row => parseJsonArray(row.scriptureReferences));
                const targetEnd = databaseDateKey(plan.targetEndDate || before.at(-1).assignedDate);
                const remainingDays = Math.max(1, Math.round((parseDateKey(targetEnd) - parseDateKey(today)) / DAY_MS) + 1);
                const dates = eligibleDates(today, remainingDays, readingDays);
                groups = distributeReferences(refs, dates);
            }

            for (let index = 0; index < incomplete.length; index += 1) {
                const row = incomplete[index];
                const replacement = groups[index];
                if (replacement) {
                    await tx.run(`
                        UPDATE public.user_reading_schedule
                        SET assigned_date = $1, scripture_references = $2::jsonb
                        WHERE id = $3
                    `, [replacement.assignedDate, JSON.stringify(replacement.scriptureReferences), row.id]);
                } else {
                    await tx.run('DELETE FROM public.user_reading_schedule WHERE id = $1', [row.id]);
                }
            }
            for (let index = incomplete.length; index < groups.length; index += 1) {
                const maxDay = await tx.get('SELECT COALESCE(MAX(day_number), 0) AS value FROM public.user_reading_schedule WHERE user_plan_id = $1', [userPlanId]);
                await tx.run(`
                    INSERT INTO public.user_reading_schedule
                        (user_plan_id, day_number, assigned_date, scripture_references)
                    VALUES ($1, $2, $3, $4::jsonb)
                `, [userPlanId, Number(maxDay.value) + 1, groups[index].assignedDate, JSON.stringify(groups[index].scriptureReferences)]);
            }

            const after = groups.map(group => ({
                assignedDate: group.assignedDate,
                scriptureReferences: group.scriptureReferences
            }));
            const summary = { strategy, changed: groups.length, before, after, resyncedAt: new Date().toISOString() };
            await tx.run(`
                UPDATE public.user_reading_plans
                SET last_resync_summary = $1::jsonb, resync_notice_pending = TRUE
                WHERE id = $2
            `, [JSON.stringify(summary), userPlanId]);
            return summary;
        });
    }

    static async complete(userId, scheduleId) {
        return dbOps.notesDb.transaction(async tx => {
            const schedule = await ownedSchedule(tx, scheduleId, userId, true);
            const retryingCompletedPlan = schedule?.status === 'completed' && Boolean(schedule.completedAt);
            if (!schedule || (schedule.status !== 'active' && !retryingCompletedPlan)) {
                throw new ReadingPlanError('SCHEDULE_NOT_FOUND', '找不到排程', 404);
            }
            const duplicate = Boolean(schedule.completedAt);
            if (!duplicate) {
                await tx.run('UPDATE public.user_reading_schedule SET completed_at = CURRENT_TIMESTAMP WHERE id = $1', [scheduleId]);
            }
            const today = taiwanDateKey();
            const checkin = await tx.get(`
                INSERT INTO public.devotional_checkins
                    (user_id, date, scripture_read_at, scripture_coins_awarded)
                VALUES ($1, $2, CURRENT_TIMESTAMP, 0)
                ON CONFLICT (user_id, date) DO UPDATE
                    SET scripture_read_at = COALESCE(devotional_checkins.scripture_read_at, EXCLUDED.scripture_read_at)
                RETURNING scripture_coins_awarded
            `, [userId, today]);
            let reward = { duplicate: true, delta: 0 };
            if (Number(checkin.scriptureCoinsAwarded || 0) === 0) {
                reward = await applyCoinDeltaTx(tx, {
                    userId,
                    delta: 1,
                    reasonCode: 'daily_scripture_reading',
                    sourceId: today,
                    idempotencyKey: `reading:${userId}:${today}:scripture`
                });
                await tx.run(`
                    UPDATE public.devotional_checkins SET scripture_coins_awarded = 1
                    WHERE user_id = $1 AND date = $2
                `, [userId, today]);
            }

            const counts = await tx.get(`
                SELECT COUNT(*) AS total, COUNT(completed_at) AS completed
                FROM public.user_reading_schedule WHERE user_plan_id = $1
            `, [schedule.userPlanId]);
            const total = Number(counts.total);
            const completed = Number(counts.completed);
            const planCompleted = total > 0 && completed === total;
            let newlyUnlocked = [];
            if (planCompleted) {
                await tx.run(`
                    UPDATE public.user_reading_plans
                    SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
                    WHERE id = $1
                `, [schedule.userPlanId]);
                newlyUnlocked = await unlockReadingPlanAchievementsTx(tx, userId);
            }
            return {
                duplicate,
                progress: total ? Math.round((completed / total) * 100) : 0,
                completed,
                total,
                planCompleted,
                reward: { coins: reward.duplicate ? 0 : 1, balance: reward.balance },
                newlyUnlocked
            };
        });
    }

    static async migrateLegacyActivePlans() {
        const legacyPlans = await dbOps.notesDb.query(`
            SELECT id, user_id
            FROM public.user_reading_plans
            WHERE status = 'active' AND schedule_version IS DISTINCT FROM 'v4.2'
            ORDER BY started_at
        `);
        const results = [];
        for (const plan of legacyPlans) {
            try {
                const summary = await this.resync(plan.userId, plan.id, 'distribute');
                await dbOps.notesDb.run(`
                    UPDATE public.user_reading_plans
                    SET schedule_version = 'v4.2', resync_notice_pending = TRUE
                    WHERE id = $1 AND user_id = $2
                `, [plan.id, plan.userId]);
                results.push({ id: plan.id, success: true, changed: summary.changed });
            } catch (error) {
                results.push({ id: plan.id, success: false, error: error.message });
            }
        }
        return { inspected: legacyPlans.length, results };
    }
}

export default ReadingPlanService;
