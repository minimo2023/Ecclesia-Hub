class SoundManager {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        console.log(`SoundManager: Initialized (${this.id})`);
        this.enabled = true;
        const savedVolume = localStorage.getItem('bible_millionaire_volume');
        this.masterVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.3;
        this._muted = this.masterVolume === 0;
        this.bgm = null;
        this.wasPlayingBeforeHidden = false; // Track if BGM was playing before page hidden
        this.unavailableTracks = new Set();
        this.warnedUnavailableTracks = new Set();

        const soundSources = {
            theme: '/audio/theme.mp3',
            tension: '/audio/tension.mp3',
            correct: '/audio/correct.mp3',
            wrong: '/audio/wrong.mp3',
            win: '/audio/win.mp3',
            gameover: '/audio/gameover.mp3',
        };
        this.sounds = Object.fromEntries(
            Object.entries(soundSources).map(([name, src]) => [name, this.createAudio(name, src)])
        );
        this.sounds.select = null; // No specific file for select, maybe reuse or ignore

        // Configure loops
        if (this.sounds.theme) this.sounds.theme.loop = true;
        if (this.sounds.tension) this.sounds.tension.loop = true;

        // Initialize all audio elements with volume 0 to prevent popping sounds
        // Volume will be set correctly when audio is played
        Object.values(this.sounds).forEach(audio => {
            if (audio) {
                audio.volume = 0;
                audio.load();
            }
        });

        // Handle page visibility changes to pause music when page is hidden
        this.setupVisibilityListener();

        // Initialize shared AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
        }
    }

    createAudio(trackName, src) {
        if (typeof Audio === 'undefined') {
            this.markTrackUnavailable(trackName, new Error('HTML Audio is not available'));
            return null;
        }

        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.addEventListener('error', () => {
            this.markTrackUnavailable(trackName, audio.error || new Error(`Audio source failed: ${src}`));
        });
        return audio;
    }

    isUnsupportedAudioError(error) {
        return error?.name === 'NotSupportedError' || error?.code === 4 || error?.message?.includes('supported sources');
    }

    markTrackUnavailable(trackName, error) {
        this.unavailableTracks.add(trackName);
        if (this.pendingBGM === trackName) this.pendingBGM = null;
        if (this.bgm === this.sounds?.[trackName]) this.bgm = null;

        if (!this.warnedUnavailableTracks.has(trackName)) {
            this.warnedUnavailableTracks.add(trackName);
            console.warn(`SoundManager: Audio track "${trackName}" is unavailable; using silent/synth fallback.`, error);
        }
    }

    safePlay(trackName, kind, onBlocked) {
        const track = this.sounds[trackName];
        if (!track || this.unavailableTracks.has(trackName)) {
            return Promise.resolve(false);
        }

        return track.play().then(() => true).catch(error => {
            if (this.isUnsupportedAudioError(error)) {
                this.markTrackUnavailable(trackName, error);
                return false;
            }

            console.warn(`SoundManager: ${kind} play blocked for "${trackName}"`, error);
            if (onBlocked) onBlocked(error);
            return false;
        });
    }

    getTrackNameForAudio(audio) {
        return Object.entries(this.sounds).find(([, candidate]) => candidate === audio)?.[0] || null;
    }

    unlockAudio() {
        // 1. Resume Shared AudioContext
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => {
                    console.log('SoundManager: AudioContext resumed successfully');
                }).catch(e => {
                    console.warn('SoundManager: AudioContext resume failed', e);
                });
            }

            // Create and play a silent buffer to warm up the context
            try {
                const buffer = this.ctx.createBuffer(1, 1, 22050);
                const source = this.ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(this.ctx.destination);
                source.start(0);
            } catch (e) {
                console.warn('SoundManager: Silent buffer warmup failed', e);
            }
        }

        // 2. Unlock HTML5 Audio elements (for BGM/SFX)
        // Playing and immediately pausing one sound is often enough to unlock the capability
        if (this.bgm && this.bgm.paused && this.masterVolume > 0 && !this._muted) {
            this.bgm.play().catch(() => { });
        }

        if (this.sounds.theme) {
            Object.values(this.sounds).forEach(audio => {
                if (audio && audio !== this.bgm) {
                    audio.volume = 0;
                    const playPromise = audio.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            audio.pause();
                            audio.currentTime = 0;
                        }).catch(() => {});
                    }
                }
            });
        }
    }

    setupVisibilityListener() {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // Page is hidden (user switched tabs or minimized browser)
                    console.log('SoundManager: Page hidden, pausing all sounds');
                    this.wasPlayingBeforeHidden = this.bgm && !this.bgm.paused;
                    this.pauseAll();
                } else {
                    // Page is visible again - resume BGM if it was playing before
                    console.log('SoundManager: Page visible again');
                    if (this.ctx && this.ctx.state === 'suspended') {
                        this.ctx.resume();
                    }
                    if (this.wasPlayingBeforeHidden && this.bgm) {
                        console.log('SoundManager: Resuming BGM');
                        const trackName = this.getTrackNameForAudio(this.bgm);
                        if (trackName) {
                            this.safePlay(trackName, 'BGM resume');
                        } else {
                            this.bgm.play().catch(e => console.warn('SoundManager: Failed to resume custom BGM:', e));
                        }
                    }
                }
            });
        }
    }

    pauseAll() {
        console.log('SoundManager: Pausing all sounds');
        if (this.bgm) {
            this.bgm.pause();
        }
        Object.values(this.sounds).forEach(sound => {
            if (sound && !sound.paused) {
                sound.pause();
            }
        });
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
    }

    toggle(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopBGM();
        }
    }

    setVolume(volume) {
        console.log(`SoundManager (${this.id}): setVolume called with ${volume}`);
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this._muted = this.masterVolume === 0;
        localStorage.setItem('bible_millionaire_volume', this.masterVolume.toString());

        if (this.masterVolume === 0) {
            this.pauseAll();
        } else {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            // Update current BGM volume if playing
            if (this.bgm) {
                const modifier = (this.bgm === this.sounds.tension ? 0.3 : 1.0);
                console.log(`SoundManager (${this.id}): Updating BGM volume to ${this.masterVolume * modifier}`);
                this.bgm.volume = this.masterVolume * modifier;

                // If it was paused due to mute, we might want to resume? 
                // For now, let's rely on the game logic to call playBGM, or user to unmute.
                // But if we just unmuted, we probably want to hear the BGM if we are in a state that should have BGM.
                if (this.bgm.paused && this.enabled) {
                    const trackName = this.getTrackNameForAudio(this.bgm);
                    if (trackName) {
                        this.safePlay(trackName, 'BGM resume');
                    } else {
                        this.bgm.play().catch(e => console.warn("SoundManager: Custom BGM resume failed", e));
                    }
                }
            } else {
                console.log(`SoundManager (${this.id}): No active BGM to update`);
            }
        }
    }

    getVolume() {
        return this.masterVolume;
    }

    isMuted() {
        return this._muted || false;
    }

    mute() {
        this._muted = true;
        this._volumeBeforeMute = this.masterVolume;
        this.pauseAll();
    }

    unmute() {
        this._muted = false;
        if (this._volumeBeforeMute !== undefined) {
            this.setVolume(this._volumeBeforeMute);
        }
    }

    playBGM(trackName) {
        if (!this.enabled) return;

        console.log(`SoundManager: Playing BGM ${trackName}`);

        // If volume is 0, we just track what SHOULD be playing but don't actually play
        if (this.masterVolume === 0) {
            this.bgm = this.unavailableTracks.has(trackName) ? null : this.sounds[trackName];
            return;
        }

        if (this.unavailableTracks.has(trackName)) {
            console.warn(`SoundManager: Skipping unavailable BGM ${trackName}`);
            return;
        }

        if (this.bgm === this.sounds[trackName]) {
            // Already playing this track
            if (this.bgm.paused) {
                this.safePlay(trackName, 'BGM', () => {
                    this.pendingBGM = trackName;
                });
            }
            return;
        }

        this.stopBGM();

        const track = this.sounds[trackName];
        if (track) {
            track.currentTime = 0;
            const baseVolume = trackName === 'tension' ? 0.3 : 1.0;
            track.volume = this.masterVolume * baseVolume;
            this.safePlay(trackName, 'BGM', () => {
                // If play failed due to autoplay policy, mark as pending
                this.pendingBGM = trackName;
            });
            this.bgm = track;
        } else {
            console.warn(`SoundManager: Track ${trackName} not found`);
        }
    }

    setupGlobalUnlock() {
        if (typeof document === 'undefined') return;

        const unlockHandler = () => {
            console.log('SoundManager: Global unlock triggered');
            this.unlockAudio();

            // Retry pending BGM if exists
            if (this.pendingBGM) {
                console.log(`SoundManager: Retrying pending BGM ${this.pendingBGM}`);
                this.playBGM(this.pendingBGM);
                this.pendingBGM = null;
            }

            // Remove listeners once unlocked
            ['click', 'touchstart', 'keydown'].forEach(event => {
                document.removeEventListener(event, unlockHandler);
            });
        };

        // Add listeners to document for first interaction
        ['click', 'touchstart', 'keydown'].forEach(event => {
            document.addEventListener(event, unlockHandler, { once: true });
        });
    }

    stopBGM() {
        this._pendingPlayUrl = null; // Cancel any pending play intent
        if (this.bgm) {
            console.log("SoundManager: Stopping BGM immediately");
            this.bgm.pause();
            this.bgm.currentTime = 0;
            this.bgm = null;
        }
    }

    // Fade out current BGM over duration (ms)
    fadeOutBGM(duration = 1000) {
        return new Promise((resolve) => {
            if (!this.bgm || this.bgm.paused) {
                resolve();
                return;
            }

            console.log(`SoundManager: Fading out BGM over ${duration}ms`);
            const startVolume = this.bgm.volume;
            const steps = 20;
            const stepTime = duration / steps;
            const volumeStep = startVolume / steps;
            let currentStep = 0;

            const fadeInterval = setInterval(() => {
                currentStep++;
                if (currentStep >= steps) {
                    clearInterval(fadeInterval);
                    this.bgm.pause();
                    this.bgm.currentTime = 0;
                    this.bgm = null;
                    resolve();
                } else {
                    if (this.bgm) {
                        this.bgm.volume = Math.max(0, startVolume - (volumeStep * currentStep));
                    }
                }
            }, stepTime);
        });
    }

    // Play BGM from a custom URL path (for expedition music)
    playBGMFromUrl(url, fadeIn = true, loop = true) {
        if (!this.enabled || this.masterVolume === 0) return;

        // Check if already playing this URL
        if (this._currentBGMUrl === url && this.bgm && !this.bgm.paused) {
            console.log(`SoundManager: Already playing ${url}`);
            return;
        }

        console.log(`SoundManager: Playing BGM from URL ${url}`);

        // Stop current BGM immediately (caller should fade out first if needed)
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }

        // Create new Audio element for custom URL
        const audio = new Audio(url);
        audio.loop = loop;

        if (fadeIn) {
            audio.volume = 0;
        } else {
            audio.volume = this.masterVolume;
        }

        this.bgm = audio;
        this._currentBGMUrl = url;
        this._pendingPlayUrl = url; // Track intent

        audio.play().then(() => {
            // Check if we still want to play this URL (race condition check)
            if (this._currentBGMUrl !== url || !this.bgm || this.bgm !== audio) {
                console.log(`SoundManager: Aborting late play for ${url} (switched or stopped)`);
                audio.pause();
                audio.currentTime = 0;
                return;
            }

            if (this._pendingPlayUrl === url) {
                this._pendingPlayUrl = null; // Clear pending
            }

            if (fadeIn) {
                // Fade in over 1 second
                const targetVolume = this.masterVolume;
                const steps = 20;
                const stepTime = 1000 / steps;
                const volumeStep = targetVolume / steps;
                let currentStep = 0;

                const fadeInterval = setInterval(() => {
                    // Re-check validity during fade
                    if (this._currentBGMUrl !== url || !this.bgm || this.bgm.paused || this.bgm !== audio) {
                        clearInterval(fadeInterval);
                        return;
                    }

                    currentStep++;
                    if (currentStep >= steps) {
                        clearInterval(fadeInterval);
                        if (this.bgm === audio) audio.volume = targetVolume;
                    } else {
                        if (this.bgm === audio) audio.volume = Math.min(targetVolume, volumeStep * currentStep);
                    }
                }, stepTime);
            }
        }).catch(e => {
            console.warn("SoundManager: BGM from URL play failed (likely user interaction required)", e);
            if (this._currentBGMUrl === url && this.bgm === audio) {
                this.bgm = null;
                this._currentBGMUrl = null;
            }
        });
    }

    // Convenience method: fade out then play new BGM
    async switchBGM(newUrl, fadeOutDuration = 800, fadeIn = true) {
        await this.fadeOutBGM(fadeOutDuration);
        this.playBGMFromUrl(newUrl, fadeIn);
    }

    playSFX(trackName) {
        if (!this.enabled || this.masterVolume === 0) return;

        const track = this.sounds[trackName];
        if (track) {
            console.log(`SoundManager: Playing SFX ${trackName}`);
            track.currentTime = 0;
            track.volume = this.masterVolume;
            this.safePlay(trackName, 'SFX').then((played) => {
                if (!played) this.playSyntheticSFX(trackName);
            });
        } else {
            console.warn(`SoundManager: SFX ${trackName} not found`);
            this.playSyntheticSFX(trackName);
        }
    }

    playSyntheticSFX(trackName) {
        if (!this.enabled || this.masterVolume === 0 || !this.ctx) return;

        const profiles = {
            correct: { type: 'sine', start: 660, end: 990, duration: 0.16, volume: 0.08 },
            wrong: { type: 'sawtooth', start: 220, end: 120, duration: 0.18, volume: 0.07 },
            win: { type: 'triangle', start: 523, end: 1046, duration: 0.35, volume: 0.09 },
            gameover: { type: 'sawtooth', start: 180, end: 80, duration: 0.45, volume: 0.08 },
        };
        const profile = profiles[trackName];
        if (!profile) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;
        osc.type = profile.type;
        osc.frequency.setValueAtTime(profile.start, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, profile.end), now + profile.duration);
        gain.gain.setValueAtTime(profile.volume * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);

        osc.start(now);
        osc.stop(now + profile.duration);
    }

    stopAll() {
        console.log("SoundManager: Stopping ALL sounds");
        this.stopBGM();
        Object.values(this.sounds).forEach(sound => {
            if (sound) {
                sound.pause();
                sound.currentTime = 0;
            }
        });
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
    }

    playCountdown() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.1 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playGo() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(1100, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playLifeline() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Rising sound effect
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.1 * this.masterVolume, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    // Legacy method support
    playCorrect() { this.playSFX('correct'); }
    playWrong() { this.playSFX('wrong'); }
    playWin() { this.playSFX('win'); }
    playGameOver() { this.playSFX('gameover'); }
    playSelect() {
        // Optional: synthesize a blip or use a file if we had one. 
        // For now, let's silence it or use a very short snippet of correct? No, silence is better than wrong sound.
    }

    // Speed Mode: Tick sound for countdown (plays every second)
    playTimerTick() {
        if (!this.enabled || this.masterVolume === 0 || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.08 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    // Speed Mode: Warning beep for last 3 seconds (more urgent)
    playTimerWarning() {
        if (!this.enabled || this.masterVolume === 0 || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Higher pitched, more urgent
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.15 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }
}

export const soundManager = new SoundManager();
