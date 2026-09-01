import crypto from 'crypto';
import { dbOps } from '../../database/index.js';
import { bibleTranslator } from '../../utils/bibleTranslator.js';
import { presentBibleChapterVerses } from '../content/bible/BibleTextPresentation.js';
import { resolveBibleVersion } from '../content/bible/BibleVersionRegistry.js';
import recordingStorage from './recording-storage.js';
import {
    hashPassageRows,
    inspectAudioBuffer,
    normalizePassageInput,
    recordingError,
    validateCommentContent
} from './recording-validation.js';
import {
    createPlaybackTicket,
    createShareToken,
    hashShareToken,
    recoverShareToken,
    verifyPlaybackTicket
} from './recording-tokens.js';

const LIMITS = Object.freeze({
    memberBytes: Number(process.env.SCRIPTURE_RECORDING_MEMBER_BYTES || 500 * 1024 * 1024),
    savesPerDay: Number(process.env.SCRIPTURE_RECORDING_DAILY_SAVES || 20),
    publishesPerDay: Number(process.env.SCRIPTURE_RECORDING_DAILY_PUBLISHES || 5),
    commentsPerDay: Number(process.env.SCRIPTURE_RECORDING_DAILY_COMMENTS || 30),
    reactionsPerDay: Number(process.env.SCRIPTURE_RECORDING_DAILY_REACTIONS || 100)
});

const REACTION_TYPES = new Set(['THANKS', 'AMEN', 'HELPED', 'GROWING']);
const REPORT_REASONS = new Set(['INAPPROPRIATE', 'HARASSMENT', 'COPYRIGHT', 'PRIVACY', 'OTHER']);
const SHARE_KINDS = new Set(['RECORDING', 'VOICE_BLESSING']);
const BLESSING_THEMES = new Set(['dawn', 'peace', 'hope']);
const SIGNATURE_MODES = new Set(['custom', 'member', 'anonymous']);

const rows = result => result?.rows || result || [];
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const taipeiDayStartSql = `(date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei')`;

function optionalText(value, maxLength, fieldName) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (text.length > maxLength) throw recordingError('INVALID_SHARE_CARD', `${fieldName}字數超過限制`);
    return text;
}

function normalizeShareInput(rawInput = {}) {
    const input = rawInput && typeof rawInput === 'object'
        ? rawInput
        : { expiresInDays: rawInput };
    const expiry = input.expiresInDays ?? 30;
    const expiresInDays = expiry === null || expiry === 'never' ? null : Number(expiry);
    if (expiresInDays !== null && ![7, 30].includes(expiresInDays)) {
        throw recordingError('INVALID_SHARE_EXPIRY', '分享期限無效');
    }

    const visibility = String(input.visibility || 'UNLISTED').toUpperCase();
    if (!['UNLISTED', 'PUBLIC'].includes(visibility)) {
        throw recordingError('INVALID_VISIBILITY', '分享範圍無效');
    }
    const shareKind = String(input.shareKind || 'RECORDING').toUpperCase();
    if (!SHARE_KINDS.has(shareKind)) throw recordingError('INVALID_SHARE_KIND', '分享類型無效');
    const card = input.card && typeof input.card === 'object' ? input.card : {};
    const cardTheme = card.theme ? String(card.theme) : null;
    const signatureMode = card.signatureMode ? String(card.signatureMode) : null;
    if (cardTheme && !BLESSING_THEMES.has(cardTheme)) throw recordingError('INVALID_SHARE_CARD', '卡片主題無效');
    if (signatureMode && !SIGNATURE_MODES.has(signatureMode)) throw recordingError('INVALID_SHARE_CARD', '署名方式無效');

    const normalized = {
        expiresInDays,
        visibility,
        shareKind,
        recipientLabel: optionalText(card.recipient, 60, '收件人稱呼'),
        cardTitle: optionalText(card.title, 80, '卡片標題'),
        cardMessage: optionalText(card.message, 500, '文字祝福'),
        cardTheme,
        signatureMode,
        signatureText: optionalText(card.signatureText, 60, '署名'),
        clientRequestId: optionalText(input.clientRequestId, 120, '重送識別碼')
    };
    if (shareKind === 'VOICE_BLESSING') {
        if (!normalized.cardTitle) throw recordingError('INVALID_SHARE_CARD', '請填寫卡片標題');
        if (!normalized.cardTheme || !normalized.signatureMode) {
            throw recordingError('INVALID_SHARE_CARD', '卡片主題與署名方式不可空白');
        }
        if (normalized.signatureMode === 'custom' && !normalized.signatureText) {
            throw recordingError('INVALID_SHARE_CARD', '請填寫署名內容');
        }
    }
    return normalized;
}

function mapRecording(row) {
    if (!row) return null;
    return {
        id: row.id,
        version: row.version,
        versionName: resolveBibleVersion(row.version)?.displayName || row.version,
        book: row.book,
        bookName: bibleTranslator.toChinese(row.book),
        chapter: Number(row.chapter),
        verseStart: Number(row.verseStart),
        verseEnd: Number(row.verseEnd),
        reference: `${bibleTranslator.toChinese(row.book)} ${row.chapter}:${row.verseStart}-${row.verseEnd}`,
        recordingKind: row.recordingKind || 'READING',
        visibility: row.visibility,
        status: row.status,
        displayAnonymous: Boolean(row.displayAnonymous),
        commentsEnabled: Boolean(row.commentsEnabled),
        durationMs: Number(row.durationMs || 0),
        byteSize: Number(row.byteSize || 0),
        createdAt: row.createdAt,
        publishedAt: row.publishedAt,
        ownerId: row.userId,
        displayName: row.displayAnonymous ? '匿名讀者' : (row.displayName || row.username || '讀者'),
        reactionCounts: row.reactionCounts || {},
        commentCount: Number(row.commentCount || 0),
        myReaction: row.myReaction || null,
        isOwner: Boolean(row.isOwner),
        activeShares: Array.isArray(row.activeShares) ? row.activeShares : [],
        blessingShares: Array.isArray(row.blessingShares) ? row.blessingShares : []
    };
}

function mapSharedRecording(row) {
    const recording = mapRecording(row);
    return {
        id: recording.id,
        version: recording.version,
        versionName: recording.versionName,
        book: recording.book,
        bookName: recording.bookName,
        chapter: recording.chapter,
        verseStart: recording.verseStart,
        verseEnd: recording.verseEnd,
        reference: recording.reference,
        durationMs: recording.durationMs,
        displayName: recording.displayName
    };
}

async function getRecordingRow(recordingId, queryable = dbOps.notesDb) {
    return queryable.get(`
        SELECT r.*, a.mime_type, a.byte_size, a.duration_ms, a.storage_key, a.sha256,
               u.display_name, u.username
        FROM scripture_recordings r
        LEFT JOIN scripture_recording_assets a ON a.id = r.active_asset_id
        JOIN users u ON u.id = r.user_id
        WHERE r.id = $1
    `, [recordingId]);
}

async function validatePassage(input) {
    const passage = normalizePassageInput(input);
    const chapterRows = rows(await dbOps.contentDb.query(`
        SELECT verse, text, metadata
        FROM bible_verses
        WHERE version = $1 AND book = $2 AND chapter = $3
        ORDER BY verse
    `, [passage.storageVersion, passage.book, passage.chapter]));
    const passageRows = presentBibleChapterVerses(chapterRows).filter(verse => (
        Number(verse.verseEnd ?? verse.verse) >= passage.verseStart
        && Number(verse.verseStart ?? verse.verse) <= passage.verseEnd
    ));
    const coveredVerses = new Set(passageRows.flatMap(verse => verse.coveredVerses || [verse.verse]));
    const missingVerse = Array.from(
        { length: passage.verseEnd - passage.verseStart + 1 },
        (_, index) => passage.verseStart + index
    ).find(verse => !coveredVerses.has(verse));
    if (!passageRows.length || missingVerse) {
        throw recordingError('PASSAGE_EVIDENCE_UNAVAILABLE', '正式經文庫找不到完整的起訖經節');
    }
    return { ...passage, passageHash: hashPassageRows(passageRows) };
}

async function assertDailyLimit(userId, table, limit, timestampColumn = 'created_at') {
    const result = await dbOps.notesDb.get(`
        SELECT COUNT(*)::INTEGER AS total
        FROM ${table}
        WHERE user_id = $1 AND ${timestampColumn} >= ${taipeiDayStartSql}
    `, [userId]);
    if (Number(result?.total || 0) >= limit) {
        throw recordingError('DAILY_LIMIT_REACHED', '今日使用次數已達上限', 429);
    }
}

async function assertStorageQuota(userId, incomingBytes) {
    const result = await dbOps.notesDb.get(`
        SELECT COALESCE(SUM(a.byte_size), 0)::BIGINT AS used_bytes
        FROM scripture_recordings r
        JOIN scripture_recording_assets a ON a.id = r.active_asset_id
        WHERE r.user_id = $1 AND r.status <> 'DELETED' AND a.state = 'READY'
    `, [userId]);
    if (Number(result?.usedBytes || 0) + incomingBytes > LIMITS.memberBytes) {
        throw recordingError('MEMBER_STORAGE_QUOTA_REACHED', '個人朗讀空間已達上限', 413);
    }
}

async function notify(tx, { ownerId, actorId, recordingId, type, payload = {} }) {
    if (!ownerId || ownerId === actorId) return;
    await tx.query(`
        INSERT INTO scripture_recording_notifications
            (id, user_id, actor_user_id, recording_id, notification_type, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [id('srn'), ownerId, actorId, recordingId, type, JSON.stringify(payload)]);
}

export async function createRecording({ userId, clientRequestId, input, file }) {
    if (!clientRequestId || String(clientRequestId).length > 120) {
        throw recordingError('IDEMPOTENCY_KEY_REQUIRED', '缺少有效的重送保護識別碼');
    }
    if (!file?.buffer) throw recordingError('AUDIO_REQUIRED', '請先完成錄音');

    const existing = await dbOps.notesDb.get(`
        SELECT id FROM scripture_recordings WHERE user_id = $1 AND client_request_id = $2
    `, [userId, clientRequestId]);
    if (existing) return { recording: mapRecording(await getRecordingRow(existing.id)), reused: true };

    await assertDailyLimit(userId, 'scripture_recordings', LIMITS.savesPerDay);
    const [passage, audio] = await Promise.all([
        validatePassage(input),
        inspectAudioBuffer(file.buffer, { clientDurationMs: input.durationMs })
    ]);
    const recordingKind = String(input.recordingKind || 'READING').toUpperCase();
    if (!['READING', 'VOICE_BLESSING'].includes(recordingKind)) {
        throw recordingError('INVALID_RECORDING_KIND', '不支援的錄音用途');
    }
    await assertStorageQuota(userId, audio.byteSize);

    const recordingId = id('srr');
    const assetId = id('sra');
    const claimed = await dbOps.notesDb.transaction(async tx => {
        const inserted = rows(await tx.query(`
            INSERT INTO scripture_recordings
                (id, user_id, client_request_id, version, book, chapter, verse_start, verse_end,
                 passage_hash, recording_kind)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (user_id, client_request_id) DO NOTHING
            RETURNING id
        `, [recordingId, userId, clientRequestId, passage.version, passage.book, passage.chapter,
            passage.verseStart, passage.verseEnd, passage.passageHash, recordingKind]));
        return inserted[0]?.id || null;
    });

    if (!claimed) {
        const duplicate = await dbOps.notesDb.get(`
            SELECT id FROM scripture_recordings WHERE user_id = $1 AND client_request_id = $2
        `, [userId, clientRequestId]);
        if (duplicate) return { recording: mapRecording(await getRecordingRow(duplicate.id)), reused: true };
        throw recordingError('UPLOAD_IN_PROGRESS', '相同錄音正在保存中', 409);
    }

    let stored;
    try {
        stored = await recordingStorage.write({ assetId, extension: audio.extension, buffer: file.buffer });
        await dbOps.notesDb.transaction(async tx => {
            await tx.query(`
                INSERT INTO scripture_recording_assets
                    (id, recording_id, client_request_id, storage_key, mime_type, extension,
                     byte_size, duration_ms, sha256, state)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'READY')
            `, [assetId, recordingId, clientRequestId, stored.storageKey, audio.mimeType, audio.extension,
                audio.byteSize, audio.durationMs, audio.sha256]);
            await tx.query(`
                UPDATE scripture_recordings
                SET active_asset_id = $1, status = 'READY', updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [assetId, recordingId]);
        });
    } catch (error) {
        if (stored?.storageKey) await recordingStorage.remove(stored.storageKey).catch(() => {});
        await dbOps.notesDb.query(`
            UPDATE scripture_recordings SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'UPLOADING'
        `, [recordingId]).catch(() => {});
        throw error;
    }

    return { recording: mapRecording(await getRecordingRow(recordingId)), reused: false };
}

export async function listMine(userId, requestedKind = null) {
    const recordingKind = requestedKind ? String(requestedKind).toUpperCase() : null;
    if (recordingKind && !['READING', 'VOICE_BLESSING'].includes(recordingKind)) {
        throw recordingError('INVALID_RECORDING_KIND', '不支援的錄音用途');
    }
    return rows(await dbOps.notesDb.query(`
        SELECT r.*, a.byte_size, a.duration_ms, u.display_name, u.username,
               COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                       'id', s.id,
                       'expiresAt', s.expires_at,
                       'createdAt', s.created_at
                   ) ORDER BY s.created_at DESC)
                   FROM scripture_recording_shares s
                   WHERE s.recording_id = r.id AND s.revoked_at IS NULL
                     AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
               ), '[]'::jsonb) AS active_shares,
               COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                       'id', s.id,
                       'title', s.card_title,
                       'recipient', s.recipient_label,
                       'theme', s.card_theme,
                       'expiresAt', s.expires_at,
                       'revokedAt', s.revoked_at,
                       'createdAt', s.created_at,
                       'status', CASE
                           WHEN s.revoked_at IS NOT NULL THEN 'REVOKED'
                           WHEN s.expires_at IS NOT NULL AND s.expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
                           ELSE 'ACTIVE'
                       END
                   ) ORDER BY s.created_at DESC)
                   FROM scripture_recording_shares s
                   WHERE s.recording_id = r.id AND s.share_kind = 'VOICE_BLESSING'
               ), '[]'::jsonb) AS blessing_shares
        FROM scripture_recordings r
        LEFT JOIN scripture_recording_assets a ON a.id = r.active_asset_id
        JOIN users u ON u.id = r.user_id
        WHERE r.user_id = $1 AND r.status <> 'DELETED'
          AND ($2::TEXT IS NULL OR r.recording_kind = $2)
        ORDER BY r.created_at DESC
        LIMIT 200
    `, [userId, recordingKind])).map(row => mapRecording({ ...row, isOwner: true }));
}

export async function getRecording(recordingId, userId) {
    const row = await getOwnedRecording(recordingId, userId);
    return mapRecording({ ...row, isOwner: true });
}

export async function replaceRecordingAsset({ recordingId, userId, clientRequestId, input, file }) {
    if (!clientRequestId || String(clientRequestId).length > 120) {
        throw recordingError('IDEMPOTENCY_KEY_REQUIRED', '缺少有效的重送保護識別碼');
    }
    if (!file?.buffer) throw recordingError('AUDIO_REQUIRED', '請先完成錄音');

    const recording = await getOwnedRecording(recordingId, userId);
    if (recording.status !== 'READY') {
        throw recordingError('RECORDING_NOT_EDITABLE', '這筆朗讀目前不能重新錄製', 409);
    }
    const duplicate = await dbOps.notesDb.get(`
        SELECT id FROM scripture_recording_assets
        WHERE recording_id = $1 AND client_request_id = $2
    `, [recordingId, clientRequestId]);
    if (duplicate) return { recording: await getRecording(recordingId, userId), reused: true };

    const todayAssets = await dbOps.notesDb.get(`
        SELECT COUNT(*)::INTEGER AS total
        FROM scripture_recording_assets a
        JOIN scripture_recordings r ON r.id = a.recording_id
        WHERE r.user_id = $1 AND a.created_at >= ${taipeiDayStartSql}
    `, [userId]);
    if (Number(todayAssets?.total || 0) >= LIMITS.savesPerDay) {
        throw recordingError('DAILY_LIMIT_REACHED', '今日保存錄音次數已達上限', 429);
    }

    const audio = await inspectAudioBuffer(file.buffer, { clientDurationMs: input.durationMs });
    await assertStorageQuota(userId, audio.byteSize);
    const assetId = id('sra');
    let stored;
    try {
        stored = await recordingStorage.write({ assetId, extension: audio.extension, buffer: file.buffer });
        await dbOps.notesDb.transaction(async tx => {
            const locked = await tx.get(`
                SELECT active_asset_id, status FROM scripture_recordings
                WHERE id = $1 AND user_id = $2 FOR UPDATE
            `, [recordingId, userId]);
            if (!locked || locked.status !== 'READY') {
                throw recordingError('RECORDING_NOT_EDITABLE', '這筆朗讀目前不能重新錄製', 409);
            }
            await tx.query(`
                INSERT INTO scripture_recording_assets
                    (id, recording_id, client_request_id, storage_key, mime_type, extension,
                     byte_size, duration_ms, sha256, state)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'READY')
            `, [assetId, recordingId, clientRequestId, stored.storageKey, audio.mimeType,
                audio.extension, audio.byteSize, audio.durationMs, audio.sha256]);
            await tx.query(`
                UPDATE scripture_recording_assets
                SET state = 'SUPERSEDED', delete_after = CURRENT_TIMESTAMP + INTERVAL '24 hours'
                WHERE id = $1 AND state = 'READY'
            `, [locked.activeAssetId]);
            await tx.query(`
                UPDATE scripture_recordings
                SET active_asset_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [assetId, recordingId]);
        });
    } catch (error) {
        if (stored?.storageKey) await recordingStorage.remove(stored.storageKey).catch(() => {});
        if (error?.code === '23505') {
            const existing = await dbOps.notesDb.get(`
                SELECT id FROM scripture_recording_assets
                WHERE recording_id = $1 AND client_request_id = $2
            `, [recordingId, clientRequestId]);
            if (existing) return { recording: await getRecording(recordingId, userId), reused: true };
        }
        throw error;
    }
    return { recording: await getRecording(recordingId, userId), reused: false };
}

export async function getOwnedRecording(recordingId, userId) {
    const row = await getRecordingRow(recordingId);
    if (!row || row.userId !== userId || row.status === 'DELETED') {
        throw recordingError('RECORDING_NOT_FOUND', '找不到這筆朗讀', 404);
    }
    return row;
}

export async function updateRecording(recordingId, userId, input = {}) {
    const current = await getOwnedRecording(recordingId, userId);
    if (current.status !== 'READY' && current.status !== 'HIDDEN_PENDING_REVIEW') {
        throw recordingError('RECORDING_NOT_EDITABLE', '這筆朗讀目前不能修改', 409);
    }
    const visibility = input.visibility === undefined ? current.visibility : String(input.visibility).toUpperCase();
    if (!['PRIVATE', 'UNLISTED', 'PUBLIC'].includes(visibility)) {
        throw recordingError('INVALID_VISIBILITY', '分享範圍無效');
    }
    if (visibility === 'PUBLIC' && current.visibility !== 'PUBLIC') {
        const result = await dbOps.notesDb.get(`
            SELECT COUNT(*)::INTEGER AS total FROM scripture_recordings
            WHERE user_id = $1 AND published_at >= ${taipeiDayStartSql}
        `, [userId]);
        if (Number(result?.total || 0) >= LIMITS.publishesPerDay) {
            throw recordingError('DAILY_PUBLISH_LIMIT_REACHED', '今日公開朗讀次數已達上限', 429);
        }
    }
    const displayAnonymous = input.displayAnonymous === undefined
        ? current.displayAnonymous : Boolean(input.displayAnonymous);
    const commentsEnabled = input.commentsEnabled === undefined
        ? current.commentsEnabled : Boolean(input.commentsEnabled);

    await dbOps.notesDb.transaction(async tx => {
        await tx.query(`
            UPDATE scripture_recordings
            SET visibility = $1, display_anonymous = $2, comments_enabled = $3,
                published_at = CASE WHEN $1 = 'PUBLIC' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND user_id = $5
        `, [visibility, displayAnonymous, commentsEnabled, recordingId, userId]);
        if (visibility === 'PRIVATE') {
            await tx.query(`
                UPDATE scripture_recording_shares SET revoked_at = CURRENT_TIMESTAMP
                WHERE recording_id = $1 AND revoked_at IS NULL
            `, [recordingId]);
        }
    });
    return mapRecording({ ...(await getRecordingRow(recordingId)), isOwner: true });
}

export async function deleteRecording(recordingId, userId) {
    await getOwnedRecording(recordingId, userId);
    await dbOps.notesDb.transaction(async tx => {
        await tx.query(`
            UPDATE scripture_recording_shares SET revoked_at = CURRENT_TIMESTAMP
            WHERE recording_id = $1 AND revoked_at IS NULL
        `, [recordingId]);
        await tx.query(`
            UPDATE scripture_recording_assets
            SET state = 'DELETED', delete_after = CURRENT_TIMESTAMP
            WHERE recording_id = $1 AND state <> 'DELETED'
        `, [recordingId]);
        await tx.query(`
            UPDATE scripture_recordings
            SET status = 'DELETED', visibility = 'PRIVATE', deleted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
        `, [recordingId, userId]);
    });
}

export async function createShare(recordingId, userId, rawInput = {}) {
    const recording = await getOwnedRecording(recordingId, userId);
    if (recording.status !== 'READY') throw recordingError('RECORDING_NOT_SHAREABLE', '這筆朗讀目前不能分享', 409);
    const options = normalizeShareInput(rawInput);

    if (options.visibility === 'PUBLIC' && recording.visibility !== 'PUBLIC') {
        const result = await dbOps.notesDb.get(`
            SELECT COUNT(*)::INTEGER AS total FROM scripture_recordings
            WHERE user_id = $1 AND published_at >= ${taipeiDayStartSql}
        `, [userId]);
        if (Number(result?.total || 0) >= LIMITS.publishesPerDay) {
            throw recordingError('DAILY_PUBLISH_LIMIT_REACHED', '今日公開朗讀次數已達上限', 429);
        }
    }

    const shareId = id('srs');
    const { tokenHash } = createShareToken(shareId);
    const saved = await dbOps.notesDb.transaction(async tx => {
        const inserted = rows(await tx.query(`
            INSERT INTO scripture_recording_shares
                (id, recording_id, creator_user_id, client_request_id, token_hash, share_kind,
                 recipient_label, card_title, card_message, card_theme, signature_mode, signature_text, expires_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                CASE WHEN $13::INTEGER IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + ($13 * INTERVAL '1 day') END)
            ON CONFLICT DO NOTHING
            RETURNING id, recording_id, token_hash, expires_at, created_at
        `, [shareId, recordingId, userId, options.clientRequestId, tokenHash, options.shareKind,
            options.recipientLabel, options.cardTitle, options.cardMessage, options.cardTheme,
            options.signatureMode, options.signatureText, options.expiresInDays]));

        let share = inserted[0];
        let reused = false;
        if (!share && options.clientRequestId) {
            share = await tx.get(`
                SELECT id, recording_id, token_hash, expires_at, created_at
                FROM scripture_recording_shares
                WHERE creator_user_id = $1 AND client_request_id = $2
            `, [userId, options.clientRequestId]);
            reused = Boolean(share);
        }
        if (!share || share.recordingId !== recordingId) {
            throw recordingError('SHARE_CREATE_CONFLICT', '分享建立發生衝突，請重新嘗試', 409);
        }
        if (reused) return { ...share, reused };

        const displayAnonymous = options.signatureMode !== 'member';
        await tx.query(`
            UPDATE scripture_recordings
            SET visibility = $1, display_anonymous = $2,
                comments_enabled = $3,
                published_at = CASE WHEN $1 = 'PUBLIC' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND user_id = $5
        `, [options.visibility, displayAnonymous, options.visibility === 'PUBLIC', recordingId, userId]);
        return { ...share, reused };
    });
    const recoveredToken = recoverShareToken(saved.id, saved.tokenHash);
    if (!recoveredToken) throw recordingError('SHARE_TOKEN_RECOVERY_FAILED', '分享連結建立失敗，請重新建立分享', 500);
    return {
        id: saved.id,
        token: recoveredToken.token,
        expiresInDays: options.expiresInDays,
        expiresAt: saved.expiresAt,
        reused: saved.reused
    };
}

export async function revokeShare(shareId, userId) {
    const result = await dbOps.notesDb.query(`
        UPDATE scripture_recording_shares
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND creator_user_id = $2 AND revoked_at IS NULL
        RETURNING id
    `, [shareId, userId]);
    if (!rows(result).length) throw recordingError('SHARE_NOT_FOUND', '找不到這個分享', 404);
}

async function findActiveShare(token) {
    const tokenHash = hashShareToken(token);
    const share = await dbOps.notesDb.get(`
        SELECT s.id AS share_id, s.expires_at, s.share_kind, s.recipient_label,
               s.card_title, s.card_message, s.card_theme, s.signature_mode, s.signature_text,
               r.*, a.mime_type, a.byte_size, a.duration_ms,
               a.storage_key, u.display_name, u.username
        FROM scripture_recording_shares s
        JOIN scripture_recordings r ON r.id = s.recording_id
        JOIN scripture_recording_assets a ON a.id = r.active_asset_id AND a.state = 'READY'
        JOIN users u ON u.id = r.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL
          AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
          AND r.status = 'READY'
    `, [tokenHash]);
    if (!share) throw recordingError('SHARE_NOT_FOUND', '分享不存在或已失效', 404);
    return share;
}

export async function getShare(token) {
    const share = await findActiveShare(token);
    const chapterRows = rows(await dbOps.contentDb.query(`
        SELECT verse, text, metadata
        FROM bible_verses
        WHERE version = $1 AND book = $2 AND chapter = $3
        ORDER BY verse
    `, [share.version, share.book, share.chapter]));
    const verses = presentBibleChapterVerses(chapterRows).filter(verse => (
        Number(verse.verseEnd ?? verse.verse) >= share.verseStart
        && Number(verse.verseStart ?? verse.verse) <= share.verseEnd
    ));
    const signature = share.signatureMode === 'member'
        ? (share.displayName || share.username || '一位讀者')
        : share.signatureMode === 'anonymous'
            ? '匿名祝福'
            : share.signatureText || '一位朋友';
    return {
        shareId: share.shareId,
        recording: mapSharedRecording(share),
        expiresAt: share.expiresAt,
        verses: verses.map(verse => ({
            verse: Number(verse.verse),
            verseStart: Number(verse.verseStart ?? verse.verse),
            verseEnd: Number(verse.verseEnd ?? verse.verse),
            verseLabel: verse.verseLabel || String(verse.verse),
            coveredVerses: verse.coveredVerses || [Number(verse.verse)],
            text: verse.text
        })),
        card: share.shareKind === 'VOICE_BLESSING' ? {
            kind: 'VOICE_BLESSING',
            recipient: share.recipientLabel || '給親愛的你',
            title: share.cardTitle,
            message: share.cardMessage || '',
            theme: share.cardTheme || 'peace',
            signature
        } : null
    };
}

export async function createSharePlaybackTicket(token) {
    const share = await findActiveShare(token);
    return createPlaybackTicket({ recordingId: share.id, assetId: share.activeAssetId, shareId: share.shareId });
}

export async function createRecordingPlaybackTicket(recordingId, userId = null) {
    const recording = await getRecordingRow(recordingId);
    if (!recording || recording.status !== 'READY' || !recording.activeAssetId) {
        throw recordingError('RECORDING_NOT_FOUND', '找不到這筆朗讀', 404);
    }
    if (recording.visibility !== 'PUBLIC' && recording.userId !== userId) {
        throw recordingError('RECORDING_NOT_FOUND', '找不到這筆朗讀', 404);
    }
    return createPlaybackTicket({ recordingId, assetId: recording.activeAssetId, ownerId: recording.userId === userId ? userId : null });
}

export async function createModerationPlaybackTicket(recordingId) {
    const recording = await getRecordingRow(recordingId);
    if (!recording || !['READY', 'HIDDEN_PENDING_REVIEW'].includes(recording.status) || !recording.activeAssetId) {
        throw recordingError('RECORDING_NOT_FOUND', '找不到這筆朗讀', 404);
    }
    return createPlaybackTicket({ recordingId, assetId: recording.activeAssetId, moderation: true }, 180);
}

export async function resolvePlaybackTicket(ticket) {
    const payload = verifyPlaybackTicket(ticket);
    if (!payload?.recordingId || !payload?.assetId) throw recordingError('INVALID_PLAYBACK_TICKET', '播放憑證無效', 404);
    const recording = await getRecordingRow(payload.recordingId);
    const statusAllowed = recording && (recording.status === 'READY'
        || (payload.moderation && recording.status === 'HIDDEN_PENDING_REVIEW'));
    if (!statusAllowed || recording.activeAssetId !== payload.assetId) {
        throw recordingError('AUDIO_NOT_FOUND', '錄音已失效', 404);
    }
    if (payload.shareId) {
        const share = await dbOps.notesDb.get(`
            SELECT id FROM scripture_recording_shares
            WHERE id = $1 AND recording_id = $2 AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `, [payload.shareId, recording.id]);
        if (!share) throw recordingError('SHARE_NOT_FOUND', '分享已失效', 404);
    } else if (!payload.moderation && recording.visibility !== 'PUBLIC' && payload.ownerId !== recording.userId) {
        throw recordingError('AUDIO_NOT_FOUND', '錄音已失效', 404);
    }
    return recording;
}

export async function listCommunity({ userId = null, version, book, chapter, verseStart, verseEnd, cursor }) {
    const passage = normalizePassageInput({ version, book, chapter, verseStart: verseStart || 1, verseEnd: verseEnd || 30 });
    const params = [passage.version, passage.book, passage.chapter, passage.verseStart, passage.verseEnd];
    let cursorSql = '';
    if (cursor) {
        params.push(new Date(cursor));
        cursorSql = `AND r.published_at < $${params.length}`;
    }
    params.push(userId || '');
    const result = rows(await dbOps.notesDb.query(`
        SELECT r.*, a.byte_size, a.duration_ms, u.display_name, u.username,
               COALESCE((SELECT jsonb_object_agg(x.reaction_type, x.total)
                    FROM (SELECT reaction_type, COUNT(*)::INTEGER AS total
                          FROM scripture_recording_reactions
                          WHERE recording_id = r.id GROUP BY reaction_type) x), '{}'::jsonb) AS reaction_counts,
               (SELECT COUNT(*)::INTEGER FROM scripture_recording_comments
                    WHERE recording_id = r.id AND status = 'VISIBLE') AS comment_count,
               (SELECT reaction_type FROM scripture_recording_reactions
                    WHERE recording_id = r.id AND user_id = $${params.length}) AS my_reaction,
               (r.user_id = $${params.length}) AS is_owner
        FROM scripture_recordings r
        JOIN scripture_recording_assets a ON a.id = r.active_asset_id AND a.state = 'READY'
        JOIN users u ON u.id = r.user_id
        WHERE r.visibility = 'PUBLIC' AND r.status = 'READY'
          AND r.version = $1 AND r.book = $2 AND r.chapter = $3
          AND r.verse_start <= $5 AND r.verse_end >= $4
          AND NOT EXISTS (
              SELECT 1 FROM scripture_recording_blocks b
              WHERE b.user_id = $${params.length} AND b.blocked_user_id = r.user_id
          )
          ${cursorSql}
        ORDER BY r.published_at DESC
        LIMIT 30
    `, params));
    return {
        items: result.map(mapRecording),
        nextCursor: result.length === 30 ? result.at(-1).publishedAt : null
    };
}

async function requirePublicRecording(recordingId) {
    const recording = await getRecordingRow(recordingId);
    if (!recording || recording.visibility !== 'PUBLIC' || recording.status !== 'READY') {
        throw recordingError('RECORDING_NOT_FOUND', '找不到這筆公開朗讀', 404);
    }
    return recording;
}

export async function setReaction(recordingId, userId, reactionType) {
    const normalized = String(reactionType || '').toUpperCase();
    if (!REACTION_TYPES.has(normalized)) throw recordingError('INVALID_REACTION', '回應類型無效');
    const recording = await requirePublicRecording(recordingId);
    await assertDailyLimit(userId, 'scripture_recording_reactions', LIMITS.reactionsPerDay);
    return dbOps.notesDb.transaction(async tx => {
        const current = await tx.get(`
            SELECT id, reaction_type FROM scripture_recording_reactions
            WHERE recording_id = $1 AND user_id = $2 FOR UPDATE
        `, [recordingId, userId]);
        if (current?.reactionType === normalized) {
            await tx.query(`DELETE FROM scripture_recording_reactions WHERE id = $1`, [current.id]);
            return { reaction: null };
        }
        if (current) {
            await tx.query(`UPDATE scripture_recording_reactions SET reaction_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [normalized, current.id]);
        } else {
            await tx.query(`INSERT INTO scripture_recording_reactions (id, recording_id, user_id, reaction_type) VALUES ($1,$2,$3,$4)`, [id('srrx'), recordingId, userId, normalized]);
            await notify(tx, { ownerId: recording.userId, actorId: userId, recordingId, type: 'REACTION', payload: { reactionType: normalized } });
        }
        return { reaction: normalized };
    });
}

export async function listComments(recordingId, userId = null) {
    const recording = await requirePublicRecording(recordingId);
    if (!recording.commentsEnabled) return [];
    return rows(await dbOps.notesDb.query(`
        SELECT c.id, c.content, c.user_id, c.created_at, u.display_name, u.username,
               (c.user_id = $2) AS is_owner
        FROM scripture_recording_comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.recording_id = $1 AND c.status = 'VISIBLE'
          AND NOT EXISTS (
              SELECT 1 FROM scripture_recording_blocks b
              WHERE b.user_id = $2 AND b.blocked_user_id = c.user_id
          )
        ORDER BY c.created_at
        LIMIT 100
    `, [recordingId, userId || '']));
}

export async function addComment(recordingId, userId, content, idempotencyKey) {
    const recording = await requirePublicRecording(recordingId);
    if (!recording.commentsEnabled) throw recordingError('COMMENTS_DISABLED', '這筆朗讀已關閉留言', 409);
    if (!idempotencyKey || String(idempotencyKey).length > 120) throw recordingError('IDEMPOTENCY_KEY_REQUIRED', '缺少重送保護識別碼');
    const normalized = validateCommentContent(content);
    const existing = await dbOps.notesDb.get(`SELECT * FROM scripture_recording_comments WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey]);
    if (existing) return existing;
    await assertDailyLimit(userId, 'scripture_recording_comments', LIMITS.commentsPerDay);
    return dbOps.notesDb.transaction(async tx => {
        const commentId = id('src');
        const inserted = rows(await tx.query(`
            INSERT INTO scripture_recording_comments (id, recording_id, user_id, idempotency_key, content)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
            RETURNING *
        `, [commentId, recordingId, userId, idempotencyKey, normalized]));
        const comment = inserted[0] || await tx.get(`SELECT * FROM scripture_recording_comments WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey]);
        if (inserted.length) await notify(tx, { ownerId: recording.userId, actorId: userId, recordingId, type: 'COMMENT', payload: { commentId } });
        return comment;
    });
}

export async function deleteComment(commentId, userId) {
    const result = rows(await dbOps.notesDb.query(`
        UPDATE scripture_recording_comments
        SET status = 'REMOVED', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND status = 'VISIBLE'
        RETURNING id
    `, [commentId, userId]));
    if (!result.length) throw recordingError('COMMENT_NOT_FOUND', '找不到這則留言', 404);
}

export async function reportRecording(recordingId, userId, reason, detail = '') {
    const recording = await requirePublicRecording(recordingId);
    if (recording.userId === userId) throw recordingError('CANNOT_REPORT_SELF', '不能檢舉自己的朗讀');
    const normalizedReason = String(reason || 'OTHER').toUpperCase();
    if (!REPORT_REASONS.has(normalizedReason)) throw recordingError('INVALID_REPORT_REASON', '檢舉原因無效');
    return dbOps.notesDb.transaction(async tx => {
        await tx.query(`
            INSERT INTO scripture_recording_reports (id, recording_id, reporter_user_id, reason, detail)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (recording_id, reporter_user_id) DO NOTHING
        `, [id('srp'), recordingId, userId, normalizedReason, String(detail || '').trim().slice(0, 500)]);
        const count = await tx.get(`SELECT COUNT(*)::INTEGER AS total FROM scripture_recording_reports WHERE recording_id = $1`, [recordingId]);
        const hidden = Number(count?.total || 0) >= 3;
        if (hidden) {
            await tx.query(`UPDATE scripture_recordings SET status = 'HIDDEN_PENDING_REVIEW', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'READY'`, [recordingId]);
            await tx.query(`INSERT INTO scripture_recording_moderation_events (id, recording_id, actor_user_id, action, reason) VALUES ($1,$2,NULL,'AUTO_HIDE_REPORT_THRESHOLD','THREE_UNIQUE_REPORTERS')`, [id('srm'), recordingId]);
        }
        return { reportCount: Number(count?.total || 0), hidden };
    });
}

export async function blockMember(userId, blockedUserId) {
    if (!blockedUserId || blockedUserId === userId) throw recordingError('INVALID_BLOCK_TARGET', '封鎖對象無效');
    await dbOps.notesDb.query(`
        INSERT INTO scripture_recording_blocks (user_id, blocked_user_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING
    `, [userId, blockedUserId]);
}

export async function listNotifications(userId) {
    return rows(await dbOps.notesDb.query(`
        SELECT * FROM scripture_recording_notifications
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50
    `, [userId]));
}

export async function markNotificationsRead(userId) {
    await dbOps.notesDb.query(`UPDATE scripture_recording_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = $1`, [userId]);
}

export async function moderateRecording(recordingId, actorUserId, action, reason = '') {
    const status = action === 'RESTORE' ? 'READY' : action === 'REMOVE' ? 'REMOVED' : null;
    if (!status) throw recordingError('INVALID_MODERATION_ACTION', '管理操作無效');
    const recording = await getRecordingRow(recordingId);
    if (!recording) throw recordingError('RECORDING_NOT_FOUND', '找不到這筆朗讀', 404);
    await dbOps.notesDb.transaction(async tx => {
        await tx.query(`UPDATE scripture_recordings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [status, recordingId]);
        await tx.query(`INSERT INTO scripture_recording_moderation_events (id, recording_id, actor_user_id, action, reason) VALUES ($1,$2,$3,$4,$5)`, [id('srm'), recordingId, actorUserId, action, String(reason || '').slice(0, 500)]);
        await notify(tx, { ownerId: recording.userId, actorId: actorUserId, recordingId, type: 'MODERATION', payload: { action, reason } });
    });
}

export async function listModerationQueue() {
    const items = rows(await dbOps.notesDb.query(`
        SELECT r.*, a.byte_size, a.duration_ms, u.display_name, u.username,
               (SELECT COUNT(*)::INTEGER FROM scripture_recording_reports
                    WHERE recording_id = r.id) AS report_count,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'reason', reports.reason,
                    'detail', reports.detail,
                    'createdAt', reports.created_at
               ) ORDER BY reports.created_at DESC)
                    FROM scripture_recording_reports reports
                    WHERE reports.recording_id = r.id), '[]'::jsonb) AS reports
        FROM scripture_recordings r
        JOIN scripture_recording_assets a ON a.id = r.active_asset_id AND a.state = 'READY'
        JOIN users u ON u.id = r.user_id
        WHERE r.status = 'HIDDEN_PENDING_REVIEW'
        ORDER BY r.updated_at
        LIMIT 100
    `));
    return items.map(row => ({
        ...mapRecording(row),
        reportCount: Number(row.reportCount || 0),
        reports: Array.isArray(row.reports) ? row.reports : []
    }));
}

export async function moderateComment(commentId, actorUserId, action, reason = '') {
    const status = action === 'RESTORE' ? 'VISIBLE' : action === 'REMOVE' ? 'REMOVED' : action === 'HIDE' ? 'HIDDEN' : null;
    if (!status) throw recordingError('INVALID_MODERATION_ACTION', '管理操作無效');
    const comment = await dbOps.notesDb.get(`SELECT * FROM scripture_recording_comments WHERE id = $1`, [commentId]);
    if (!comment) throw recordingError('COMMENT_NOT_FOUND', '找不到這則留言', 404);
    await dbOps.notesDb.transaction(async tx => {
        await tx.query(`UPDATE scripture_recording_comments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [status, commentId]);
        await tx.query(`INSERT INTO scripture_recording_moderation_events (id, recording_id, comment_id, actor_user_id, action, reason) VALUES ($1,$2,$3,$4,$5,$6)`, [id('srm'), comment.recordingId, commentId, actorUserId, `COMMENT_${action}`, String(reason || '').slice(0, 500)]);
    });
}

export async function runRecordingMaintenance() {
    const stagingRemoved = await recordingStorage.cleanupStaging();
    const abandonedUploads = rows(await dbOps.notesDb.query(`
        UPDATE scripture_recordings
        SET status = 'DELETED', visibility = 'PRIVATE', deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'UPLOADING' AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'
        RETURNING id
    `)).length;
    const due = rows(await dbOps.notesDb.query(`
        SELECT id, storage_key FROM scripture_recording_assets
        WHERE state IN ('SUPERSEDED', 'DELETED') AND delete_after <= CURRENT_TIMESTAMP
          AND deleted_at IS NULL
        LIMIT 100
    `));
    let assetsRemoved = 0;
    for (const asset of due) {
        try {
            await recordingStorage.remove(asset.storageKey);
            await dbOps.notesDb.query(`UPDATE scripture_recording_assets SET state = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [asset.id]);
            assetsRemoved += 1;
        } catch (error) {
            console.warn(`[ScriptureRecording] Cleanup retry required for ${asset.id}: ${error.message}`);
        }
    }
    return { stagingRemoved, abandonedUploads, assetsRemoved };
}

export { LIMITS };
export default {
    createRecording, listMine, getRecording, getOwnedRecording, replaceRecordingAsset,
    updateRecording, deleteRecording,
    createShare, revokeShare, getShare, createSharePlaybackTicket,
    createRecordingPlaybackTicket, createModerationPlaybackTicket, resolvePlaybackTicket, listCommunity,
    setReaction, listComments, addComment, deleteComment, reportRecording,
    blockMember, listNotifications, markNotificationsRead, listModerationQueue,
    moderateRecording, moderateComment,
    runRecordingMaintenance
};
