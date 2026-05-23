/**
 * GameScene — Main Phaser scene.
 * Manages the transport canvas (lifts, car, tube, hoppers, particles).
 * The HTML overlay panels (harvesters, refiners) are managed by UIManager.
 */

import Phaser from 'phaser';
import { gameState } from '../systems/GameState.js';
import { saveManager } from '../systems/SaveManager.js';
import { soundManager } from '../systems/SoundManager.js';
import { UIManager } from '../ui/UIManager.js';
import { TransportRenderer } from '../ui/TransportRenderer.js';
import { formatCredits, formatNumber } from '../utils/format.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._uiManager = null;
    this._transportRenderer = null;
    this._lastTick = 0;
    this._saveIndicatorTimer = 0;
  }

  create() {
    // Initialize sound on first user interaction
    this.input.once('pointerdown', () => soundManager.init());

    // Start auto-save
    saveManager.startAutoSave();
    saveManager.onSave(() => this._flashSaveIndicator());

    // Build HTML UI overlay
    this._uiManager = new UIManager(this);
    this._uiManager.build();

    // Build Phaser transport canvas
    this._transportRenderer = new TransportRenderer(this);
    this._transportRenderer.build();

    // Start background tick for backgrounded elements
    this._lastTick = Date.now();

    // Resize handler
    this.scale.on('resize', () => {
      this._uiManager.onResize();
      this._transportRenderer.onResize();
    });

    console.log('[GameScene] Ready');
  }

  update(time, delta) {
    const now = Date.now();
    const deltaSeconds = (now - this._lastTick) / 1000;
    this._lastTick = now;

    // Tick background elements
    if (deltaSeconds > 0 && deltaSeconds < 10) {
      gameState.tickBackground(deltaSeconds);
    }

    // Update transport animations
    this._transportRenderer?.update(delta);

    // Update top bar every frame
    this._uiManager?.updateTopBar();
  }

  _flashSaveIndicator() {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    el.classList.add('visible');
    clearTimeout(this._saveIndicatorTimer);
    this._saveIndicatorTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 2000);
  }

  shutdown() {
    saveManager.stopAutoSave();
    saveManager.save();
    this._uiManager?.destroy();
    this._transportRenderer?.destroy();
  }
}
