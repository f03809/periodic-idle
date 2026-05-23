/**
 * BootScene — First scene. Loads assets, checks for saved game,
 * applies offline progress, then launches the main game scene.
 */

import Phaser from 'phaser';
import { gameState } from '../systems/GameState.js';
import { saveManager } from '../systems/SaveManager.js';
import { soundManager } from '../systems/SoundManager.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate all graphics procedurally — no external assets needed for Phase 1
    this._createLoadingScreen();
  }

  _createLoadingScreen() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background
    this.add.rectangle(cx, cy, width, height, 0x0a0a1a);

    // Title
    this.add.text(cx, cy - 80, 'PERIODIC IDLE', {
      fontFamily: 'Courier New',
      fontSize: '32px',
      color: '#00d4ff',
      stroke: '#000033',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 45, 'Elemental Harvesting Simulation', {
      fontFamily: 'Courier New',
      fontSize: '14px',
      color: '#7a8ab8',
    }).setOrigin(0.5);

    // Loading bar background
    const barW = 300;
    const barH = 14;
    const barX = cx - barW / 2;
    const barY = cy + 20;

    this.add.rectangle(cx, barY + barH / 2, barW + 4, barH + 4, 0x1e2a5e)
      .setOrigin(0.5);

    this._loadBar = this.add.rectangle(barX, barY, 0, barH, 0x00d4ff)
      .setOrigin(0, 0);

    this._loadText = this.add.text(cx, barY + barH + 14, 'Initializing...', {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#7a8ab8',
    }).setOrigin(0.5);

    // Animate the bar for visual feedback even though loading is instant
    this.load.on('progress', (value) => {
      this._loadBar.width = barW * value;
    });

    this.load.on('fileprogress', (file) => {
      this._loadText.setText('Loading: ' + file.key);
    });
  }

  create() {
    this._loadBar.width = 300;
    this._loadText.setText('Loading save data...');

    // Short delay for visual effect then proceed
    this.time.delayedCall(400, () => {
      this._initGame();
    });
  }

  _initGame() {
    // Try loading saved game
    const loaded = saveManager.load();

    if (loaded) {
      this._loadText.setText('Save data restored.');
      console.log('[BootScene] Save loaded successfully');
    } else {
      this._loadText.setText('Starting new game...');
      console.log('[BootScene] No save found, starting fresh');
    }

    // Apply theme from settings
    document.documentElement.setAttribute('data-theme',
      gameState.settings.theme === 'dark' ? '' :
      gameState.settings.theme === 'industrial' ? 'industrial' :
      gameState.settings.theme === 'lab' ? 'lab' : 'hybrid'
    );

    this.time.delayedCall(600, () => {
      this.scene.start('GameScene');
    });
  }
}
