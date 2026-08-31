export const VOICE_AUDIO_BIT_RATE = 96000;

const CONSTRAINT_KEYS = [
    'echoCancellation',
    'noiseSuppression',
    'autoGainControl',
    'channelCount',
    'sampleRate',
    'sampleSize'
];

export function buildVoiceAudioConstraints(supportedConstraints) {
    const knownSupport = supportedConstraints && Object.keys(supportedConstraints).length > 0
        ? supportedConstraints
        : Object.fromEntries(CONSTRAINT_KEYS.map(key => [key, true]));
    const constraints = {};

    if (knownSupport.echoCancellation) constraints.echoCancellation = { ideal: true };
    if (knownSupport.noiseSuppression) constraints.noiseSuppression = { ideal: true };
    if (knownSupport.autoGainControl) constraints.autoGainControl = { ideal: true };
    if (knownSupport.channelCount) constraints.channelCount = { ideal: 1 };
    if (knownSupport.sampleRate) constraints.sampleRate = { ideal: 48000 };
    if (knownSupport.sampleSize) constraints.sampleSize = { ideal: 16 };

    return constraints;
}

function shortRoomImpulse(context) {
    const durationSeconds = 0.08;
    const frameCount = Math.max(1, Math.round(context.sampleRate * durationSeconds));
    const impulse = context.createBuffer(2, frameCount, context.sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let frame = 0; frame < frameCount; frame += 1) {
            const progress = frame / frameCount;
            const decay = (1 - progress) ** 4;
            data[frame] = (Math.random() * 2 - 1) * decay;
        }
    }

    return impulse;
}

function disconnectQuietly(nodes) {
    nodes.forEach(node => {
        try { node?.disconnect?.(); } catch { /* best-effort cleanup */ }
    });
}

export async function createEnhancedVoiceStream(rawStream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass?.prototype?.createMediaStreamDestination) return null;

    const inputTrack = rawStream?.getAudioTracks?.()[0];
    if (!inputTrack) return null;

    let context;
    const nodes = [];
    try {
        const sampleRate = Number(inputTrack.getSettings?.().sampleRate || 0);
        const options = {
            latencyHint: 'interactive',
            ...(sampleRate > 0 ? { sampleRate } : {})
        };
        try {
            context = new AudioContextClass(options);
        } catch {
            context = new AudioContextClass();
        }
        await context.resume();
        if (context.state === 'suspended') throw new Error('AUDIO_CONTEXT_SUSPENDED');

        const source = context.createMediaStreamSource(rawStream);
        const highPass = context.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 80;
        highPass.Q.value = 0.7;

        const warmth = context.createBiquadFilter();
        warmth.type = 'lowshelf';
        warmth.frequency.value = 180;
        warmth.gain.value = 1.5;

        const presence = context.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2800;
        presence.Q.value = 0.9;
        presence.gain.value = 1.2;

        const lowPass = context.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 11000;
        lowPass.Q.value = 0.7;

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 18;
        compressor.ratio.value = 2.4;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.18;

        const dryGain = context.createGain();
        dryGain.gain.value = 0.98;
        const room = context.createConvolver();
        room.buffer = shortRoomImpulse(context);
        const roomGain = context.createGain();
        roomGain.gain.value = 0.025;
        const destination = context.createMediaStreamDestination();
        try {
            destination.channelCount = 1;
            destination.channelCountMode = 'explicit';
        } catch { /* the browser may expose a read-only channel layout */ }

        source.connect(highPass);
        highPass.connect(warmth);
        warmth.connect(presence);
        presence.connect(lowPass);
        lowPass.connect(compressor);
        compressor.connect(dryGain);
        dryGain.connect(destination);
        compressor.connect(room);
        room.connect(roomGain);
        roomGain.connect(destination);
        nodes.push(source, highPass, warmth, presence, lowPass, compressor, dryGain, room, roomGain, destination);

        let disposed = false;
        return {
            stream: destination.stream,
            dispose() {
                if (disposed) return;
                disposed = true;
                destination.stream.getTracks().forEach(track => track.stop());
                disconnectQuietly(nodes);
                Promise.resolve(context.close()).catch(() => {});
            }
        };
    } catch {
        disconnectQuietly(nodes);
        if (context) Promise.resolve(context.close()).catch(() => {});
        return null;
    }
}

export function voiceCaptureDetails(track, enhanced) {
    const settings = track?.getSettings?.() || {};
    return {
        profile: enhanced ? 'enhanced' : 'device',
        bitRate: VOICE_AUDIO_BIT_RATE,
        noiseSuppression: settings.noiseSuppression ?? null,
        echoCancellation: settings.echoCancellation ?? null,
        autoGainControl: settings.autoGainControl ?? null,
        sampleRate: Number(settings.sampleRate || 0) || null,
        channelCount: Number(settings.channelCount || 0) || null
    };
}
