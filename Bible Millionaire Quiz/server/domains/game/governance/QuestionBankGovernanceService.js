import crypto from 'node:crypto';
import { dbOps } from '../../../database/index.js';
import { bibleTranslator } from '../../../utils/bibleTranslator.js';

export const ACTIVE_QUESTION_BANKS = Object.freeze([
    { id: 'CUV_TRAD', storageVersion: 'CUV_TRAD', label: '和合本' },
    { id: 'LCC_TRAD', storageVersion: 'LCC_TRAD', label: '呂振中譯本' },
    { id: 'CNV_TRAD', storageVersion: 'CNV_TRAD', label: '新譯本' },
    { id: 'TCV2019_TRAD', storageVersion: 'TCV2010_TRAD', label: '現代中文譯本 2019' }
]);

export const DEFAULT_QUESTION_BANK_POLICY = Object.freeze({
    enabled: true,
    autoReplenishment: true,
    freeOnly: true,
    milestones: [15, 30, 50, 100],
    milestoneIncrement: 50,
    batchLimit: 12,
    difficultyRatios: Object.freeze({ EASY: 5, MEDIUM: 7, HARD: 2, VERY_HARD: 1 }),
    categoryMode: 'AUTO_BALANCE',
    categoryWeights: Object.freeze({}),
    pauseForActiveRooms: true,
    duplicateSaturationStreak: 3,
    noVerifiedSaturationStreak: 10
});

const POLICY_FIELDS = new Set(Object.keys(DEFAULT_QUESTION_BANK_POLICY));
const PUBLICATION_STATES = new Set(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED']);

export function getPolicyTargetAtStage(policy = DEFAULT_QUESTION_BANK_POLICY, stageIndex = 0) {
    const milestones = Array.isArray(policy?.milestones) && policy.milestones.length
        ? policy.milestones.map(Number)
        : [...DEFAULT_QUESTION_BANK_POLICY.milestones];
    const stage = Math.max(0, Number.parseInt(stageIndex, 10) || 0);
    if (stage < milestones.length) return milestones[stage];
    return milestones[milestones.length - 1]
        + Number(policy?.milestoneIncrement || DEFAULT_QUESTION_BANK_POLICY.milestoneIncrement)
        * (stage - milestones.length + 1);
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function digest(value) {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function mergePolicy(...policies) {
    return policies.reduce((merged, policy) => {
        if (!policy || typeof policy !== 'object') return merged;
        const next = { ...merged, ...policy };
        next.difficultyRatios = { ...(merged.difficultyRatios || {}), ...(policy.difficultyRatios || {}) };
        next.categoryWeights = { ...(merged.categoryWeights || {}), ...(policy.categoryWeights || {}) };
        return next;
    }, structuredClone(DEFAULT_QUESTION_BANK_POLICY));
}

function validatePolicyPatch(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_POLICY_CONFIG');
    const patch = {};
    for (const [key, value] of Object.entries(input)) {
        if (!POLICY_FIELDS.has(key)) throw new Error(`UNKNOWN_POLICY_FIELD:${key}`);
        patch[key] = value;
    }
    if ('milestones' in patch) {
        if (!Array.isArray(patch.milestones) || patch.milestones.length === 0) throw new Error('INVALID_MILESTONES');
        const values = patch.milestones.map(Number);
        if (values.some((value, index) => !Number.isInteger(value) || value < 1 || (index > 0 && value <= values[index - 1]))) {
            throw new Error('INVALID_MILESTONES');
        }
        patch.milestones = values;
    }
    for (const key of ['milestoneIncrement', 'batchLimit', 'duplicateSaturationStreak', 'noVerifiedSaturationStreak']) {
        if (key in patch && (!Number.isInteger(Number(patch[key])) || Number(patch[key]) < 1)) {
            throw new Error(`INVALID_POLICY_NUMBER:${key}`);
        }
        if (key in patch) patch[key] = Number(patch[key]);
    }
    for (const key of ['enabled', 'autoReplenishment', 'freeOnly', 'pauseForActiveRooms']) {
        if (key in patch && typeof patch[key] !== 'boolean') throw new Error(`INVALID_POLICY_BOOLEAN:${key}`);
    }
    if ('difficultyRatios' in patch) {
        const ratios = patch.difficultyRatios;
        const allowed = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'];
        if (!ratios || typeof ratios !== 'object' || allowed.some(band => Number(ratios[band]) < 0)) {
            throw new Error('INVALID_DIFFICULTY_RATIOS');
        }
        if (allowed.reduce((sum, band) => sum + Number(ratios[band] || 0), 0) <= 0) {
            throw new Error('INVALID_DIFFICULTY_RATIOS');
        }
        patch.difficultyRatios = Object.fromEntries(allowed.map(band => [band, Number(ratios[band] || 0)]));
    }
    if ('categoryMode' in patch && !['AUTO_BALANCE', 'CUSTOM_WEIGHTS'].includes(patch.categoryMode)) {
        throw new Error('INVALID_CATEGORY_MODE');
    }
    return patch;
}

function scopeKey({ scopeType, versionId = null, book = null }) {
    const type = String(scopeType || '').toUpperCase();
    if (!['GLOBAL', 'VERSION', 'BOOK'].includes(type)) throw new Error('INVALID_POLICY_SCOPE');
    if (type === 'GLOBAL' && (versionId || book)) throw new Error('INVALID_GLOBAL_SCOPE');
    if (type === 'VERSION' && (!versionId || book)) throw new Error('INVALID_VERSION_SCOPE');
    if (type === 'BOOK' && (!versionId || !book)) throw new Error('INVALID_BOOK_SCOPE');
    if (versionId && !ACTIVE_QUESTION_BANKS.some(bank => bank.id === versionId)) throw new Error('UNSUPPORTED_BIBLE_VERSION');
    return { scopeType: type, versionId: versionId || null, book: book || null };
}

class QuestionBankGovernanceService {
    async getCorpusStatus() {
        const rows = await dbOps.contentDb.query(`
            SELECT version,
                   COUNT(*)::INTEGER AS verse_count,
                   COUNT(DISTINCT book)::INTEGER AS book_count,
                   COUNT(DISTINCT (book, chapter))::INTEGER AS chapter_count,
                   COUNT(*) FILTER (WHERE text IS NULL OR BTRIM(text) = '')::INTEGER AS empty_count,
                   COUNT(*) - COUNT(DISTINCT (book, chapter, verse))::INTEGER AS duplicate_count,
                   MAX(cached_at) AS last_updated_at
            FROM bible_verses
            WHERE version = ANY($1)
            GROUP BY version
        `, [ACTIVE_QUESTION_BANKS.map(bank => bank.storageVersion)]);
        const byStorage = new Map(rows.map(row => [row.version, row]));
        return ACTIVE_QUESTION_BANKS.map(bank => {
            const row = byStorage.get(bank.storageVersion) || {};
            const bookCount = Number(row.bookCount || 0);
            const chapterCount = Number(row.chapterCount || 0);
            const emptyCount = Number(row.emptyCount || 0);
            const duplicateCount = Number(row.duplicateCount || 0);
            const ready = bookCount === 66 && chapterCount === 1189 && emptyCount === 0 && duplicateCount === 0;
            return {
                ...bank,
                verseCount: Number(row.verseCount || 0),
                bookCount,
                chapterCount,
                emptyCount,
                duplicateCount,
                ready,
                generationAllowed: ready,
                reason: ready ? null : emptyCount > 0 ? `有 ${emptyCount} 節內容空白` : '經文庫尚未通過完整性檢查',
                lastUpdatedAt: row.lastUpdatedAt || null
            };
        });
    }

    async getPolicies() {
        return dbOps.gamesDb.query(`
            SELECT * FROM question_bank_policies
            WHERE is_active = TRUE
            ORDER BY CASE scope_type WHEN 'GLOBAL' THEN 1 WHEN 'VERSION' THEN 2 ELSE 3 END,
                     version_id NULLS FIRST, book NULLS FIRST
        `);
    }

    async getPolicyHistory({ versionId = null, book = null, limit = 20 } = {}) {
        if (versionId && !ACTIVE_QUESTION_BANKS.some(bank => bank.id === versionId)) throw new Error('UNSUPPORTED_BIBLE_VERSION');
        const params = [];
        const where = [];
        if (versionId) { params.push(versionId); where.push(`version_id = $${params.length}`); }
        if (book) { params.push(book); where.push(`book = $${params.length}`); }
        params.push(Math.min(100, Math.max(1, Number(limit) || 20)));
        return dbOps.gamesDb.query(`
            SELECT * FROM question_bank_policies
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY created_at DESC
            LIMIT $${params.length}
        `, params);
    }

    async getEffectivePolicy({ versionId = null, book = null } = {}) {
        if (versionId && !ACTIVE_QUESTION_BANKS.some(bank => bank.id === versionId)) throw new Error('UNSUPPORTED_BIBLE_VERSION');
        const policies = await this.getPolicies();
        const globalPolicy = policies.find(item => item.scopeType === 'GLOBAL')?.config;
        const versionPolicy = policies.find(item => item.scopeType === 'VERSION' && item.versionId === versionId)?.config;
        const bookPolicy = policies.find(item => item.scopeType === 'BOOK' && item.versionId === versionId && item.book === book)?.config;
        return {
            policy: mergePolicy(globalPolicy, versionPolicy, bookPolicy),
            sources: {
                global: Boolean(globalPolicy),
                version: Boolean(versionPolicy),
                book: Boolean(bookPolicy)
            }
        };
    }

    async getOverview({ versionId = null } = {}) {
        const versions = versionId
            ? ACTIVE_QUESTION_BANKS.filter(bank => bank.id === versionId)
            : ACTIVE_QUESTION_BANKS;
        if (versionId && versions.length === 0) throw new Error('UNSUPPORTED_BIBLE_VERSION');
        const rawBooks = await dbOps.getAllBooks();
        const discoveredBooks = [...new Set(rawBooks.map(book => bibleTranslator.toChinese(
            book.nameZh || book.name_zh || book.nameEn || book.name_en || book.id
        )).filter(Boolean))];
        const discoveredSet = new Set(discoveredBooks);
        const books = [
            ...bibleTranslator.allBooks.filter(book => discoveredSet.has(book)),
            ...discoveredBooks.filter(book => !bibleTranslator.allBooks.includes(book)).sort(bibleTranslator.compareBooks)
        ];
        const counts = await dbOps.gamesDb.query(`
            SELECT canonical_version, book, publication_state,
                   COUNT(*)::INTEGER AS count,
                   COUNT(*) FILTER (WHERE difficulty_band = 'EASY')::INTEGER AS easy,
                   COUNT(*) FILTER (WHERE difficulty_band = 'MEDIUM')::INTEGER AS medium,
                   COUNT(*) FILTER (WHERE difficulty_band = 'HARD')::INTEGER AS hard,
                   COUNT(*) FILTER (WHERE difficulty_band = 'VERY_HARD')::INTEGER AS very_hard
            FROM questions
            WHERE canonical_version = ANY($1)
            GROUP BY canonical_version, book, publication_state
        `, [versions.map(bank => bank.id)]);
        const corpus = await this.getCorpusStatus();
        const savedPlan = await dbOps.getSetting('replenishment_global_plan_v1', null);
        const parsedPlan = typeof savedPlan === 'string' ? JSON.parse(savedPlan) : savedPlan;
        const stageIndex = Math.max(0, Number(parsedPlan?.stageIndex) || 0);
        const rows = [];
        for (const version of versions) {
            for (const book of books) {
                const matches = counts.filter(item => item.canonicalVersion === version.id && item.book === book);
                const published = matches.find(item => item.publicationState === 'PUBLISHED') || {};
                const effective = await this.getEffectivePolicy({ versionId: version.id, book });
                const firstTarget = getPolicyTargetAtStage(effective.policy, stageIndex);
                const playable = Number(published.count || 0);
                rows.push({
                    versionId: version.id,
                    versionLabel: version.label,
                    book,
                    playable,
                    target: firstTarget,
                    shortage: Math.max(0, firstTarget - playable),
                    stateCounts: Object.fromEntries(matches.map(item => [item.publicationState, Number(item.count)])),
                    byDifficulty: {
                        EASY: Number(published.easy || 0),
                        MEDIUM: Number(published.medium || 0),
                        HARD: Number(published.hard || 0),
                        VERY_HARD: Number(published.veryHard || 0)
                    },
                    corpusReady: corpus.find(item => item.id === version.id)?.ready || false,
                    effectivePolicy: effective.policy
                });
            }
        }
        return { versions, corpus, rows };
    }

    async previewPolicy({ scopeType, versionId = null, book = null, config = {} }) {
        const scope = scopeKey({ scopeType, versionId, book });
        const patch = validatePolicyPatch(config);
        const current = await this.getEffectivePolicy({ versionId: scope.versionId, book: scope.book });
        const proposed = mergePolicy(current.policy, patch);
        const target = Number(proposed.milestones?.[0] || 15);
        const overview = await this.getOverview({ versionId: scope.versionId });
        const inventory = overview.rows.filter(item => !scope.book || item.book === scope.book);
        const affectedQuestions = inventory.reduce((sum, item) => sum + Number(item.playable || 0), 0);
        const shortage = inventory.reduce((sum, item) => sum + Math.max(0, target - Number(item.playable || 0)), 0);
        const policySnapshot = await this.getPolicies();
        const preview = {
            scope,
            current: current.policy,
            proposed,
            impact: { groups: inventory.length, affectedQuestions, estimatedMinimumShortage: shortage },
            basedOn: digest({
                scope,
                policies: policySnapshot,
                inventory: inventory.map(item => [item.versionId, item.book, item.playable])
            })
        };
        return { ...preview, previewToken: digest(preview) };
    }

    async applyPolicy({ preview, previewToken, actor }) {
        if (!preview || digest(preview) !== previewToken) throw new Error('INVALID_POLICY_PREVIEW');
        const fresh = await this.previewPolicy({ ...preview.scope, config: preview.proposed });
        if (fresh.basedOn !== preview.basedOn) throw new Error('STALE_POLICY_PREVIEW');
        const scope = scopeKey(preview.scope);
        const config = validatePolicyPatch(preview.proposed);
        return dbOps.gamesDb.transaction(async tx => {
            const current = await tx.get(`
                SELECT * FROM question_bank_policies
                WHERE scope_type = $1
                  AND version_id IS NOT DISTINCT FROM $2
                  AND book IS NOT DISTINCT FROM $3
                  AND is_active = TRUE
                FOR UPDATE
            `, [scope.scopeType, scope.versionId, scope.book]);
            if (current) {
                await tx.run(`UPDATE question_bank_policies SET is_active = FALSE, deactivated_at = CURRENT_TIMESTAMP WHERE id = $1`, [current.id]);
            }
            const id = crypto.randomUUID();
            await tx.run(`
                INSERT INTO question_bank_policies
                    (id, scope_type, version_id, book, config, revision, previous_policy_id, created_by)
                VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
            `, [id, scope.scopeType, scope.versionId, scope.book, JSON.stringify(config), Number(current?.revision || 0) + 1, current?.id || null, actor || 'admin']);
            return { id, revision: Number(current?.revision || 0) + 1, scope, config };
        });
    }

    async rollbackPolicy({ policyId, actor }) {
        const target = await dbOps.gamesDb.get(`SELECT * FROM question_bank_policies WHERE id = $1`, [policyId]);
        if (!target) throw new Error('POLICY_NOT_FOUND');
        const scope = scopeKey({ scopeType: target.scopeType, versionId: target.versionId, book: target.book });
        const config = validatePolicyPatch(target.config);
        return dbOps.gamesDb.transaction(async tx => {
            const current = await tx.get(`
                SELECT * FROM question_bank_policies
                WHERE scope_type = $1
                  AND version_id IS NOT DISTINCT FROM $2
                  AND book IS NOT DISTINCT FROM $3
                  AND is_active = TRUE
                FOR UPDATE
            `, [scope.scopeType, scope.versionId, scope.book]);
            if (current?.id === target.id) return { ...current, unchanged: true };
            if (current) await tx.run(`UPDATE question_bank_policies SET is_active = FALSE, deactivated_at = CURRENT_TIMESTAMP WHERE id = $1`, [current.id]);
            const id = crypto.randomUUID();
            const revision = Number(current?.revision || target.revision || 0) + 1;
            await tx.run(`
                INSERT INTO question_bank_policies
                    (id, scope_type, version_id, book, config, revision, previous_policy_id, created_by)
                VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
            `, [id, scope.scopeType, scope.versionId, scope.book, JSON.stringify(config), revision, current?.id || target.id, actor || 'admin']);
            return { id, revision, scope, config, restoredFrom: target.id };
        });
    }

    async setPublicationState({ questionId, state, reason = null, actor = 'admin' }) {
        const nextState = String(state || '').toUpperCase();
        if (!PUBLICATION_STATES.has(nextState)) throw new Error('INVALID_PUBLICATION_STATE');
        if (nextState === 'PUBLISHED') {
            const row = await dbOps.gamesDb.get(`
                SELECT id FROM questions
                WHERE id = $1 AND quality_state = 'VERIFIED' AND active_revision_id IS NOT NULL
            `, [questionId]);
            if (!row) throw new Error('QUESTION_NOT_PUBLISHABLE');
        }
        const result = await dbOps.gamesDb.run(`
            UPDATE questions SET publication_state = $1,
                publication_state_reason = $2,
                publication_state_changed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP,
                status = CASE WHEN $1 = 'PUBLISHED' THEN 'PASS' WHEN $1 = 'ARCHIVED' THEN 'RETIRED' ELSE status END,
                quality_state = CASE WHEN $1 = 'PUBLISHED' THEN 'VERIFIED' WHEN $1 = 'ARCHIVED' THEN 'RETIRED' ELSE quality_state END
            WHERE id = $3
        `, [nextState, reason ? `${reason} (${actor})` : actor, questionId]);
        if (!result.changes) throw new Error('QUESTION_NOT_FOUND');
        return { questionId, publicationState: nextState };
    }
}

export const questionBankGovernanceService = new QuestionBankGovernanceService();
export default questionBankGovernanceService;
