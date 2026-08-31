const SoundManager = {
    audioCtx: null,
    enabled: true,

    init() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        }
    },

    playSound(type) {
        if (!this.enabled || !this.audioCtx) return;

        // Resume context if suspended (browser autoplay policy)
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        switch (type) {
            case 'move':
                this.playMove();
                break;
            case 'flip':
                this.playFlip();
                break;
            case 'win':
                this.playWin();
                break;
            case 'lose':
                this.playLose();
                break;
            case 'start':
                this.playStart();
                break;
        }
    },

    // 1. Move Sound: Sharp "Clack" (Plastic/Stone calling board)
    playMove() {
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // High pitch snap
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

        // Percussive envelope
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(t);
        osc.stop(t + 0.1);

        // Add a "thud" body
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(150, t);

        gain2.gain.setValueAtTime(0.3, t);
        gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        osc2.connect(gain2);
        gain2.connect(this.audioCtx.destination);

        osc2.start(t);
        osc2.stop(t + 0.15);
    },

    // 2. Flip Sound: Multiple soft clicks/swish
    playFlip() {
        // Play multiple soft noises with slight random delay?
        // Actually just one soft "zip" per flip batch might be better to avoid noise storm.
        // Let's do a simple soft swish.
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.1);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(t);
        osc.stop(t + 0.1);
    },

    // 3. Win Sound: Major Chord Arpeggio
    playWin() {
        const now = this.audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major: C5, E5, G5, C6

        notes.forEach((freq, i) => {
            const t = now + (i * 0.1);
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(t);
            osc.stop(t + 0.8);
        });
    },

    // 4. Lose Sound: Descending tritone/minor
    playLose() {
        const now = this.audioCtx.currentTime;
        const notes = [392.00, 311.13, 261.63]; // G4, Eb4, C4 (C Minorish)

        notes.forEach((freq, i) => {
            const t = now + (i * 0.2);
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'triangle';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0.1, t);
            gain.gain.linearRampToValueAtTime(0.001, t + 0.6);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(t);
            osc.stop(t + 0.6);
        });
    },

    playStart() {
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.2);

        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(t);
        osc.stop(t + 0.2);
    }
};
