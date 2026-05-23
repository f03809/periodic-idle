/**
 * SoundManager — Web Audio API based sound system.
 * Generates procedural sound effects so no external audio files are needed in Phase 1.
 * Background atmospheric loop is generated via oscillators.
 * All sounds respect the settings toggles and volume levels.
 */

import { gameState } from './GameState.js';

export class SoundManager {
  constructor() {
    this._ctx = null;
    this._bgmGain = null;
    this._sfxGain = null;
    this._bgmNodes = [];
    this._initialized = false;
  }

  /**
   * Initialize AudioContext on first user interaction (browser policy).
   */
  init() {
    if (this._initialized) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._bgmGain = this._ctx.createGain();
      this._bgmGain.connect(this._ctx.destination);
      this._sfxGain = this._ctx.createGain();
      this._sfxGain.connect(this._ctx.destination);
      this._initialized = true;
      this._applySettings();
      this._startAtmosphere();
      console.log('[SoundManager] Initialized');
    } catch (e) {
      console.warn('[SoundManager] Web Audio not available:', e);
    }
  }

  _applySettings() {
    if (!this._initialized) return;
    const s = gameState.settings;
    this._sfxGain.gain.value = s.sfxEnabled ? s.sfxVolume : 0;
    this._bgmGain.gain.value = s.bgmEnabled ? s.bgmVolume : 0;
  }

  updateSettings() {
    this._applySettings();
  }

  // ── Background Atmosphere ────────────────────────────────────────────────────

  _startAtmosphere() {
    if (!this._initialized) return;
    // Deep space ambient hum: two detuned oscillators + noise
    const freqs = [55, 82.5]; // A1, E2 — industrial / space feel
    freqs.forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = i === 0 ? -8 : 8;
      gain.gain.value = 0.015;
      osc.connect(gain);
      gain.connect(this._bgmGain);
      osc.start();
      this._bgmNodes.push(osc, gain);
    });

    // Slow LFO on the hum for "breathing" feel
    const lfo = this._ctx.createOscillator();
    const lfoGain = this._ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // very slow
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(this._bgmGain.gain);
    lfo.start();
    this._bgmNodes.push(lfo, lfoGain);
  }

  stopAtmosphere() {
    this._bgmNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    this._bgmNodes = [];
  }

  // ── SFX Helpers ──────────────────────────────────────────────────────────────

  _playTone(freq, duration, type = 'sine', gainVal = 0.2, fadeOut = true) {
    if (!this._initialized || !gameState.settings.sfxEnabled) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal, this._ctx.currentTime);
    if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start();
    osc.stop(this._ctx.currentTime + duration + 0.05);
  }

  _playNoise(duration, gainVal = 0.05) {
    if (!this._initialized || !gameState.settings.sfxEnabled) return;
    const bufferSize = this._ctx.sampleRate * duration;
    const buffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    source.buffer = buffer;
    gain.gain.setValueAtTime(gainVal, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxGain);
    source.start();
    source.stop(this._ctx.currentTime + duration + 0.05);
  }

  // ── Named Sound Effects ──────────────────────────────────────────────────────

  /** Mining progress tick (subtle low click) */
  playMiningTick() {
    this._playTone(120, 0.05, 'square', 0.05);
  }

  /** Ore dumped into hopper */
  playHopperLoad() {
    this._playNoise(0.15, 0.08);
    this._playTone(220, 0.1, 'triangle', 0.1);
  }

  /** Mining bar resets */
  playBarReset() {
    this._playTone(440, 0.08, 'sawtooth', 0.06);
  }

  /** Lift starts moving */
  playLiftStart() {
    this._playTone(180, 0.2, 'square', 0.08);
    this._playTone(200, 0.2, 'square', 0.06);
  }

  /** Lift arrives */
  playLiftArrive() {
    this._playTone(330, 0.1, 'triangle', 0.12);
    setTimeout(() => this._playTone(440, 0.1, 'triangle', 0.1), 80);
  }

  /** Particle loading sound (soft tick per particle) */
  playParticleLoad() {
    this._playTone(600 + Math.random() * 200, 0.04, 'sine', 0.04);
  }

  /** Car dispatch */
  playCarDispatch() {
    this._playNoise(0.1, 0.06);
    this._playTone(150, 0.3, 'sawtooth', 0.07);
  }

  /** Car arrive */
  playCarArrive() {
    this._playNoise(0.15, 0.07);
    this._playTone(250, 0.15, 'triangle', 0.1);
  }

  /** Pneumatic tube launch */
  playTubeLaunch() {
    const start = this._ctx?.currentTime || 0;
    if (!this._initialized || !gameState.settings.sfxEnabled) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, start);
    osc.frequency.exponentialRampToValueAtTime(1200, start + 0.3);
    gain.gain.setValueAtTime(0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start();
    osc.stop(start + 0.4);
  }

  /** Credits earned (sell chime) */
  playSell() {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.3, 'sine', 0.15), i * 60);
    });
  }

  /** Purchase success */
  playPurchase() {
    this._playTone(440, 0.1, 'triangle', 0.2);
    setTimeout(() => this._playTone(554.37, 0.15, 'triangle', 0.2), 100);
    setTimeout(() => this._playTone(659.25, 0.2, 'triangle', 0.2), 200);
  }

  /** Upgrade success */
  playUpgrade() {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((f, i) => setTimeout(() => this._playTone(f, 0.15, 'triangle', 0.18), i * 50));
  }

  /** Prestige! Big dramatic sound */
  playPrestige() {
    // Deep boom + rising sweep
    this._playTone(55, 1.5, 'sawtooth', 0.3, true);
    const start = this._ctx?.currentTime || 0;
    if (!this._initialized) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(2200, start + 2);
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 2.2);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start();
    osc.stop(start + 2.3);
  }

  /** Ascension unlock */
  playAscension() {
    const notes = [261.63, 329.63, 392, 523.25, 659.25, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this._playTone(f, 0.4, 'sine', 0.2), i * 80));
  }

  /** Error / can't afford */
  playError() {
    this._playTone(200, 0.1, 'square', 0.1);
    setTimeout(() => this._playTone(150, 0.15, 'square', 0.1), 100);
  }

  /** UI click */
  playClick() {
    this._playTone(800, 0.05, 'square', 0.08);
  }
}

export const soundManager = new SoundManager();
