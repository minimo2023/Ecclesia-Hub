import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildVoiceAudioConstraints,
    VOICE_AUDIO_BIT_RATE,
    voiceCaptureDetails
} from '../../src/features/scripture-recording/voiceCaptureEnhancer.js';
import {
    canonicalScriptureShareOrigin,
    scriptureBlessingShareUrl
} from '../../src/features/scripture-recording/scriptureRecordingApi.js';
import {
    MAX_SCRIPTURE_AUDIO_BYTES,
    SCRIPTURE_AUDIO_ACCEPT,
    scriptureAudioFileDetails
} from '../../src/features/scripture-recording/scriptureRecordingFile.js';
import {
    recordingForDraft,
    voiceBlessingDraftMatches
} from '../../src/features/scripture-recording/voiceBlessingDraftStore.js';

test('voice capture requests only audio constraints supported by the current browser', () => {
    assert.deepEqual(buildVoiceAudioConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: true,
        sampleRate: false,
        sampleSize: true
    }), {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        channelCount: { ideal: 1 },
        sampleSize: { ideal: 16 }
    });
    assert.equal(VOICE_AUDIO_BIT_RATE, 96000);
});

test('voice capture reports actual track settings separately from enhancement state', () => {
    const track = {
        getSettings: () => ({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 1
        })
    };
    assert.deepEqual(voiceCaptureDetails(track, true), {
        profile: 'enhanced',
        bitRate: 96000,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1
    });
});

test('voice blessing links are device-neutral and local mobile development points to the desktop origin', () => {
    const productionMobile = { origin: 'https://xtc-biblestudy.idv.tw', pathname: '/m/bible' };
    const localMobile = { origin: 'http://localhost:5174', pathname: '/bible' };
    assert.equal(canonicalScriptureShareOrigin(productionMobile), 'https://xtc-biblestudy.idv.tw');
    assert.equal(scriptureBlessingShareUrl('abc/123', productionMobile), 'https://xtc-biblestudy.idv.tw/b/abc%2F123');
    assert.equal(scriptureBlessingShareUrl('token', localMobile), 'http://localhost:5173/b/token');
});

test('local audio upload accepts common voice formats and rejects oversized or unknown files', () => {
    assert.deepEqual(scriptureAudioFileDetails({ name: 'blessing.m4a', type: 'audio/mp4', size: 2048 }), {
        mimeType: 'audio/mp4', extension: 'm4a'
    });
    assert.deepEqual(scriptureAudioFileDetails({ name: 'blessing.mp3', type: '', size: 2048 }), {
        mimeType: 'audio/mpeg', extension: 'mp3'
    });
    assert.match(SCRIPTURE_AUDIO_ACCEPT, /\.m4a/);
    assert.match(SCRIPTURE_AUDIO_ACCEPT, /\.mp3/);
    assert.match(SCRIPTURE_AUDIO_ACCEPT, /\.wav/);
    assert.throws(
        () => scriptureAudioFileDetails({ name: 'too-large.m4a', type: 'audio/mp4', size: MAX_SCRIPTURE_AUDIO_BYTES + 1 }),
        /5MB/
    );
    assert.throws(
        () => scriptureAudioFileDetails({ name: 'notes.txt', type: 'text\/plain', size: 128 }),
        /M4A、MP3、WAV、WebM 或 Ogg/
    );
});

test('voice blessing recovery keeps audio blobs local and restores only the matching passage', () => {
    const blob = new Blob(['voice'], { type: 'audio/webm' });
    const persisted = recordingForDraft({ blob, url: 'blob:temporary', durationMs: 1234, serverSaved: false });
    assert.equal(persisted.blob, blob);
    assert.equal('url' in persisted, false);
    assert.equal(voiceBlessingDraftMatches({
        context: { version: 'unv', book: '詩篇', chapter: 23 }
    }, { version: 'unv', book: '詩篇', chapter: 23 }), true);
    assert.equal(voiceBlessingDraftMatches({
        context: { version: 'unv', book: '詩篇', chapter: 23 }
    }, { version: 'unv', book: '詩篇', chapter: 24 }), false);
});
