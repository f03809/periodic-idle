/**
 * main.js — Periodic Idle entry point
 * Initializes Phaser 3 and mounts the HTML overlay structure.
 */

import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

// ── Build the HTML scaffold that sits outside Phaser ─────────────────────────

function buildHTMLScaffold() {
  const container = document.getElementById('game-container');
  if (!container) return;

  container.innerHTML = `
    <!-- Top Bar -->
    <div id="top-bar"></div>

    <!-- Main Game Area -->
    <div id="main-game-area">

      <!-- Left: Harvester Panel -->
      <div id="harvester-panel">
        <div class="panel-header">⛏ Harvesters</div>
        <div id="harvester-scroll"></div>
        <div class="buy-next-panel">
          <div class="cost-display">Next: <span id="next-harvester-cost">—</span></div>
          <button class="btn btn-buy" id="btn-buy-harvester" disabled>+ Buy Harvester</button>
        </div>
      </div>

      <!-- Center: Phaser Canvas (transport animations) -->
      <div id="center-area">
        <div id="transport-canvas-container"></div>
      </div>

      <!-- Right: Refiner Panel -->
      <div id="refiner-panel">
        <div class="panel-header">🔬 Refiners</div>
        <div id="refiner-scroll"></div>
        <div class="buy-next-panel">
          <div class="cost-display">Next: <span id="next-refiner-cost">—</span></div>
          <button class="btn btn-buy" id="btn-buy-refiner" disabled>+ Buy Refiner</button>
        </div>
      </div>

    </div>
  `;
}

// ── Measure center panel for Phaser canvas size ───────────────────────────────

function getCenterSize() {
  const el = document.getElementById('transport-canvas-container');
  if (!el) return { width: 400, height: 600 };
  const rect = el.getBoundingClientRect();
  return { width: Math.max(rect.width, 300), height: Math.max(rect.height, 400) };
}

// ── Initialize Phaser ─────────────────────────────────────────────────────────

function initPhaser() {
  const { width, height } = getCenterSize();

  const config = {
    type: Phaser.AUTO,
    width,
    height,
    backgroundColor: '#0a0a1a',
    parent: 'transport-canvas-container',
    transparent: false,
    scene: [BootScene, GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  };

  return new Phaser.Game(config);
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildHTMLScaffold();

  // Small delay to let CSS layout settle so we can measure the center panel
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__periodicIdleGame = initPhaser();
    });
  });
});
