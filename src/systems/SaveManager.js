/**
 * SaveManager — Handles auto-save scheduling and save/load orchestration.
 * Auto-saves to localStorage every 30 seconds.
 * Cloud-save hooks are stubbed for future backend integration.
 */

import { gameState } from './GameState.js';

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

export class SaveManager {
  constructor() {
    this._autoSaveTimer = null;
    this._onSaveCallbacks = [];
  }

  /**
   * Start the auto-save loop.
   */
  startAutoSave() {
    this.stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      const ok = this.save();
      if (ok) {
        this._onSaveCallbacks.forEach(cb => cb());
        console.log('[SaveManager] Auto-saved at', new Date().toLocaleTimeString());
      }
    }, AUTO_SAVE_INTERVAL);
    console.log('[SaveManager] Auto-save started (every 30s)');
  }

  /**
   * Stop the auto-save loop.
   */
  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  /**
   * Save game state to localStorage (and optionally cloud).
   */
  save() {
    return gameState.saveToLocal();
  }

  /**
   * Load game state from localStorage.
   * Returns offline seconds applied if any.
   */
  load() {
    return gameState.loadFromLocal();
  }

  /**
   * Register a callback fired after every successful auto-save.
   */
  onSave(callback) {
    this._onSaveCallbacks.push(callback);
  }

  /**
   * Hard reset — clear localStorage and re-initialize state.
   */
  reset() {
    this.stopAutoSave();
    localStorage.removeItem('periodic_idle_save');
    // Re-initialize game state by reloading the page
    window.location.reload();
  }
}

export const saveManager = new SaveManager();
