import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    inspectAudioBuffer,
    normalizePassageInput,
    validateCommentContent
} from '../domains/scripture-tools/recording-validation.js';
import {
    createLegacyShareToken,
    createPlaybackTicket,
    createShareToken,
    hashShareToken,
    recoverShareToken,
    verifyPlaybackTicket
} from '../domains/scripture-tools/recording-tokens.js';

test('recording passage accepts one to thirty continuous verses in a public version', () => {
    const passage = normalizePassageInput({
        version: 'unv', book: '詩篇', chapter: 23, verseStart: 1, verseEnd: 30
    });
    assert.equal(passage.version, 'CUV_TRAD');
    assert.equal(passage.book, 'Psalms');
    assert.throws(
        () => normalizePassageInput({ version: 'CUV_TRAD', book: 'Psalms', chapter: 23, verseStart: 1, verseEnd: 31 }),
        error => error.code === 'PASSAGE_TOO_LONG'
    );
});

test('recording inspection rejects empty, forged and unsupported audio content', async () => {
    await assert.rejects(inspectAudioBuffer(Buffer.alloc(0)), error => error.code === 'EMPTY_AUDIO');
    await assert.rejects(inspectAudioBuffer(Buffer.from('not-a-browser-audio-file')), error => error.code === 'UNSUPPORTED_AUDIO_FORMAT');
    await assert.rejects(inspectAudioBuffer(Buffer.alloc(5 * 1024 * 1024 + 1)), error => error.code === 'AUDIO_TOO_LARGE');
});

test('recording inspection accepts an uploaded WAV voice file', async () => {
    const sampleRate = 8000;
    const dataLength = sampleRate;
    const wav = Buffer.alloc(44 + dataLength, 128);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataLength, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate, 28);
    wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataLength, 40);

    const inspected = await inspectAudioBuffer(wav, { clientDurationMs: 1000 });
    assert.equal(inspected.mimeType, 'audio/wav');
    assert.equal(inspected.extension, 'wav');
    assert.equal(inspected.durationMs, 1000);
});

test('browser recording creates one finalized speech-optimized audio container', async () => {
    const [recorderSource, enhancerSource] = await Promise.all([
        readFile(new URL('../../src/features/scripture-recording/useLocalScriptureRecording.js', import.meta.url), 'utf8'),
        readFile(new URL('../../src/features/scripture-recording/voiceCaptureEnhancer.js', import.meta.url), 'utf8')
    ]);

    assert.match(enhancerSource, /VOICE_AUDIO_BIT_RATE\s*=\s*96000/);
    assert.match(enhancerSource, /echoCancellation\s*=\s*\{\s*ideal:\s*true\s*\}/);
    assert.match(enhancerSource, /noiseSuppression\s*=\s*\{\s*ideal:\s*true\s*\}/);
    assert.match(enhancerSource, /channelCount\s*=\s*\{\s*ideal:\s*1\s*\}/);
    assert.match(recorderSource, /contentHint\s*=\s*'speech'/);
    assert.match(recorderSource, /recorder\.start\(\);/);
    assert.doesNotMatch(recorderSource, /recorder\.start\(1000\)/);
});

test('community comment accepts plain text and rejects markup or links', () => {
    assert.equal(validateCommentContent('謝謝你的朗讀，一起成長。'), '謝謝你的朗讀，一起成長。');
    assert.throws(() => validateCommentContent('請看 https://example.com'), error => error.code === 'COMMENT_LINKS_NOT_ALLOWED');
    assert.throws(() => validateCommentContent('<b>阿們</b>'), error => error.code === 'COMMENT_LINKS_NOT_ALLOWED');
    assert.throws(() => validateCommentContent('a'.repeat(301)), error => error.code === 'INVALID_COMMENT_LENGTH');
});

test('share token is stored as a one-way hash and playback ticket detects tampering and expiry', () => {
    const share = createShareToken();
    assert.notEqual(share.token, share.tokenHash);
    assert.equal(hashShareToken(share.token), share.tokenHash);

    const ticket = createPlaybackTicket({ recordingId: 'recording-1', assetId: 'asset-1' }, 60);
    assert.equal(verifyPlaybackTicket(ticket).recordingId, 'recording-1');
    assert.equal(verifyPlaybackTicket(`${ticket.slice(0, -1)}x`), null);
    assert.equal(verifyPlaybackTicket(createPlaybackTicket({ recordingId: 'recording-1' }, -1)), null);
});

test('idempotent blessing shares can recover the same opaque token without storing it', () => {
    const first = createShareToken('srs-stable-request');
    const retry = createShareToken('srs-stable-request');
    const different = createShareToken('srs-different-request');

    assert.equal(first.token, retry.token);
    assert.equal(first.tokenHash, retry.tokenHash);
    assert.notEqual(first.token, different.token);
    assert.equal(hashShareToken(first.token), first.tokenHash);
    assert.equal(first.token.length, 22);
    assert.doesNotMatch(first.token, /詩篇|recording|VOICE_BLESSING/i);
});

test('share token recovery keeps existing long blessing links valid', () => {
    const tokenId = 'srs_existing-share';
    const legacy = createLegacyShareToken(tokenId);
    const recovered = recoverShareToken(tokenId, legacy.tokenHash);

    assert.equal(recovered.token, legacy.token);
    assert.equal(recovered.tokenHash, legacy.tokenHash);
});

test('recording module remains isolated from AI, points, public uploads and formal social feeds', async () => {
    const schema = await readFile(new URL('../database/schemas/scripture_recordings.js', import.meta.url), 'utf8');
    const service = await readFile(new URL('../domains/scripture-tools/recording-service.js', import.meta.url), 'utf8');
    const routes = await readFile(new URL('../domains/scripture-tools/recording.routes.js', import.meta.url), 'utf8');
    const compose = await readFile(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');

    assert.match(schema, /UNIQUE\(user_id, client_request_id\)/);
    assert.match(schema, /client_request_id TEXT/);
    assert.match(schema, /share_kind TEXT NOT NULL DEFAULT 'RECORDING'/);
    assert.match(schema, /recording_kind TEXT NOT NULL DEFAULT 'READING'/);
    assert.match(schema, /idx_scripture_recordings_owner_kind/);
    assert.match(schema, /card_title TEXT/);
    assert.match(schema, /signature_mode TEXT/);
    assert.match(schema, /uq_scripture_recording_share_request/);
    assert.match(schema, /UNIQUE\(recording_id, reporter_user_id\)/);
    assert.match(service, /VOICE_BLESSING/);
    assert.match(service, /INVALID_RECORDING_KIND/);
    assert.match(service, /expiresInDays !== null && !\[7, 30\]\.includes/);
    assert.match(service, /mapSharedRecording/);
    assert.match(routes, /router\.post\('\/recordings\/:id\/shares', authenticateToken/);
    assert.match(routes, /router\.get\('\/shares\/:token'/);
    assert.match(service, /HIDDEN_PENDING_REVIEW/);
    assert.match(service, /THREE_UNIQUE_REPORTERS/);
    assert.match(routes, /Content-Disposition', 'inline'/);
    assert.match(routes, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
    assert.match(compose, /\.\/private-media:\/app\/private-media/);
    assert.doesNotMatch(`${schema}\n${service}\n${routes}`, /asset_ledger|adjustCoins|LogosEngine|Gemini/i);
});

test('voice blessings remain member recordings when their share expires or is revoked', async () => {
    const [schema, service, api, collection, desktopMember, mobileMember] = await Promise.all([
        readFile(new URL('../database/schemas/scripture_recordings.js', import.meta.url), 'utf8'),
        readFile(new URL('../domains/scripture-tools/recording-service.js', import.meta.url), 'utf8'),
        readFile(new URL('../../src/features/scripture-recording/scriptureRecordingApi.js', import.meta.url), 'utf8'),
        readFile(new URL('../../src/features/scripture-recording/MyVoiceBlessings.jsx', import.meta.url), 'utf8'),
        readFile(new URL('../../src/features/member/MemberCenter.jsx', import.meta.url), 'utf8'),
        readFile(new URL('../../mobile-app/src/pages/ProfilePage.jsx', import.meta.url), 'utf8')
    ]);

    assert.match(schema, /recording_kind IN \('READING', 'VOICE_BLESSING'\)/);
    assert.match(schema, /SET recording_kind = 'VOICE_BLESSING'/);
    assert.match(service, /recordingKind: row\.recordingKind \|\| 'READING'/);
    assert.match(service, /blessing_shares/);
    assert.match(api, /deleteScriptureRecording/);
    assert.match(collection, /錄音會保留在會員帳號中；分享期限只影響收件人的連結/);
    assert.match(collection, /撤銷後，已傳出的連結會立即失效；原錄音仍保留在會員中心/);
    assert.match(desktopMember, /我的祝福語音/);
    assert.match(mobileMember, /我的祝福語音/);
});
