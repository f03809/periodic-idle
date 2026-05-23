/**
 * UIManager — Builds and manages the HTML overlay UI.
 * Handles: top bar, harvester panel, refiner panel, buy buttons,
 * upgrade buttons, modals (settings, prestige, periodic table).
 */

import { gameState, PRESTIGE_TIERS } from '../systems/GameState.js';
import { soundManager } from '../systems/SoundManager.js';
import { saveManager } from '../systems/SaveManager.js';
import { formatCredits, formatNumber, formatUnits } from '../utils/format.js';
import { ELEMENTS, getPurchaseCost, getUpgradeCost } from '../data/elements.js';

export class UIManager {
  constructor(scene) {
    this._scene = scene;
    this._harvesterCards = new Map(); // purchaseOrder -> DOM element
    this._refinerCards = new Map();
    this._updateInterval = null;
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  build() {
    this._buildTopBar();
    this._buildHarvesterPanel();
    this._buildRefinerPanel();
    this._buildToastContainer();
    this._buildModals();
    this._startUIUpdateLoop();
    this._syncCardsFromState();
  }

  // ── Top Bar ──────────────────────────────────────────────────────────────────

  _buildTopBar() {
    const bar = document.getElementById('top-bar');
    if (!bar) return;

    bar.innerHTML = `
      <div class="game-title">⚗ Periodic Idle</div>

      <div class="element-info">
        <div class="element-badge" id="element-badge">
          <span class="symbol" id="tb-symbol">H</span>
          <span class="atomic-num" id="tb-atomic">1</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span id="tb-element-name" style="font-size:13px;color:var(--accent-primary);font-weight:bold;">Hydrogen</span>
          <span id="tb-refined-name" style="font-size:10px;color:var(--text-secondary);">Refining → Deuterium</span>
        </div>
      </div>

      <div class="credits-display">
        <span class="credits-label">Credits</span>
        <span class="credits-value" id="tb-credits">₢0.00</span>
      </div>

      <div class="prestige-info">
        <span style="font-size:10px;color:var(--text-secondary);">Prestige ×</span>
        <span class="multiplier" id="tb-prestige-mult">1.00</span>
        <span style="font-size:10px;color:var(--text-secondary);" id="tb-prestige-pts">0 pts</span>
      </div>

      <div class="top-bar-actions">
        <button class="btn btn-primary" id="btn-periodic-table" title="Periodic Table / Element Select">🔬 Elements</button>
        <button class="btn btn-prestige" id="btn-prestige" title="Prestige — Reset for a multiplier bonus">★ Prestige</button>
        <button class="btn btn-primary" id="btn-settings" title="Settings">⚙ Settings</button>
        <span id="save-indicator" style="font-size:10px;color:var(--accent-success);opacity:0;transition:opacity 0.3s;">✓ Saved</span>
      </div>
    `;

    // Wire buttons
    document.getElementById('btn-periodic-table').addEventListener('click', () => {
      soundManager.playClick();
      this._openPeriodicTableModal();
    });
    document.getElementById('btn-prestige').addEventListener('click', () => {
      soundManager.playClick();
      this._openPrestigeModal();
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      soundManager.playClick();
      this._openSettingsModal();
    });

    // Save indicator style
    const style = document.getElementById('save-indicator');
    if (style) {
      const css = document.createElement('style');
      css.textContent = `#save-indicator.visible { opacity: 1 !important; }`;
      document.head.appendChild(css);
    }
  }

  updateTopBar() {
    const el = gameState.activeElement;
    if (!el) return;

    const credEl = document.getElementById('tb-credits');
    if (credEl) credEl.textContent = formatCredits(gameState.credits);

    const multEl = document.getElementById('tb-prestige-mult');
    if (multEl) multEl.textContent = gameState.prestigeMultiplier.toFixed(2);

    const ptsEl = document.getElementById('tb-prestige-pts');
    if (ptsEl) ptsEl.textContent = formatNumber(gameState.prestigePoints, 0) + ' pts';
  }

  // ── Harvester Panel ──────────────────────────────────────────────────────────

  _buildHarvesterPanel() {
    const panel = document.getElementById('harvester-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-header">⛏ Harvesters</div>
      <div id="harvester-scroll"></div>
      <div class="buy-next-panel">
        <div class="cost-display">Next harvester: <span id="next-harvester-cost">—</span></div>
        <button class="btn btn-buy" id="btn-buy-harvester">+ Buy Harvester</button>
      </div>
    `;

    document.getElementById('btn-buy-harvester').addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getNextHarvesterCost(gameState.activeElementId);
      if (!gameState.canAfford(cost)) {
        soundManager.playError();
        this.showToast('Not enough credits!', 'warning');
        return;
      }
      const h = gameState.buyHarvester(gameState.activeElementId);
      if (h) {
        soundManager.playPurchase();
        this._addHarvesterCard(h);
        this._scene._transportRenderer?.onHarvesterAdded(h);
        this.showToast(`Harvester #${h.purchaseOrder} online!`, 'success');
      }
    });
  }

  _syncCardsFromState() {
    const ops = gameState.activeOps;
    if (!ops) return;
    ops.harvesters.forEach(h => this._addHarvesterCard(h));
    ops.refiners.forEach(r => this._addRefinerCard(r));
    this._updateBuyCosts();
  }

  _addHarvesterCard(harvester) {
    const el = gameState.activeElement;
    const scroll = document.getElementById('harvester-scroll');
    if (!scroll) return;

    const card = document.createElement('div');
    card.className = 'harvester-card';
    card.id = `harvester-card-${harvester.purchaseOrder}`;
    card.innerHTML = this._harvesterCardHTML(harvester, el);
    scroll.appendChild(card);

    // Wire upgrade button
    card.querySelector('.btn-upgrade')?.addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getUpgradeCostFor(harvester, gameState.activeElementId);
      if (!gameState.canAfford(cost)) {
        soundManager.playError();
        this.showToast('Not enough credits!', 'warning');
        return;
      }
      gameState.upgradeUnit(harvester, gameState.activeElementId);
      soundManager.playUpgrade();
      this._refreshHarvesterCard(harvester);
      this.showToast(`Harvester #${harvester.purchaseOrder} → Level ${harvester.level}!`, 'success');
    });

    this._harvesterCards.set(harvester.purchaseOrder, card);
    this._updateBuyCosts();
  }

  _harvesterCardHTML(harvester, element) {
    const upgradeCost = getUpgradeCost(harvester.purchaseOrder,
      element.atomicWeight, harvester.level);
    return `
      <div class="card-header">
        <span class="card-title">Harvester #${harvester.purchaseOrder}</span>
        <span class="card-level">Lv.${harvester.level}</span>
      </div>
      <div class="hopper-display">
        <span class="hopper-label">Hopper</span>
        <span class="hopper-count" id="hhopper-${harvester.purchaseOrder}">0.00</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" id="hprog-${harvester.purchaseOrder}"></div>
        <span class="progress-label" id="hprog-label-${harvester.purchaseOrder}">Idle</span>
      </div>
      <div class="status-text idle" id="hstatus-${harvester.purchaseOrder}">Initializing...</div>
      <div class="card-actions">
        <button class="btn btn-upgrade" title="Cost: ${formatCredits(upgradeCost)}">
          ↑ Upgrade (${formatCredits(upgradeCost)})
        </button>
      </div>
      <div style="font-size:10px;color:var(--text-secondary);text-align:center;">
        Output: ${formatNumber(harvester.baseProduction * harvester.level, 2)} u/cycle
      </div>
    `;
  }

  _refreshHarvesterCard(harvester) {
    const card = this._harvesterCards.get(harvester.purchaseOrder);
    if (!card) return;
    const el = gameState.activeElement;
    card.innerHTML = this._harvesterCardHTML(harvester, el);
    card.querySelector('.btn-upgrade')?.addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getUpgradeCostFor(harvester, gameState.activeElementId);
      if (!gameState.canAfford(cost)) { soundManager.playError(); return; }
      gameState.upgradeUnit(harvester, gameState.activeElementId);
      soundManager.playUpgrade();
      this._refreshHarvesterCard(harvester);
    });
  }

  // ── Refiner Panel ────────────────────────────────────────────────────────────

  _buildRefinerPanel() {
    const panel = document.getElementById('refiner-panel');
    if (!panel) return;

    const el = gameState.activeElement;
    panel.innerHTML = `
      <div class="panel-header">🔬 Refiners → <span style="color:var(--accent-secondary)">${el?.refinedName || 'Refined'}</span></div>
      <div id="refiner-scroll"></div>
      <div class="buy-next-panel">
        <div class="cost-display">Next refiner: <span id="next-refiner-cost">—</span></div>
        <button class="btn btn-buy" id="btn-buy-refiner">+ Buy Refiner</button>
      </div>
    `;

    document.getElementById('btn-buy-refiner').addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getNextRefinerCost(gameState.activeElementId);
      if (!gameState.canAfford(cost)) {
        soundManager.playError();
        this.showToast('Not enough credits!', 'warning');
        return;
      }
      const r = gameState.buyRefiner(gameState.activeElementId);
      if (r) {
        soundManager.playPurchase();
        this._addRefinerCard(r);
        this._scene._transportRenderer?.onRefinerAdded(r);
        this.showToast(`Refiner #${r.purchaseOrder} online!`, 'success');
      }
    });
  }

  _addRefinerCard(refiner) {
    const el = gameState.activeElement;
    const scroll = document.getElementById('refiner-scroll');
    if (!scroll) return;

    const card = document.createElement('div');
    card.className = 'refiner-card';
    card.id = `refiner-card-${refiner.purchaseOrder}`;
    card.innerHTML = this._refinerCardHTML(refiner, el);
    scroll.appendChild(card);

    card.querySelector('.btn-upgrade')?.addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getUpgradeCostFor(refiner, gameState.activeElementId);
      if (!gameState.canAfford(cost)) { soundManager.playError(); return; }
      gameState.upgradeUnit(refiner, gameState.activeElementId);
      soundManager.playUpgrade();
      this._refreshRefinerCard(refiner);
      this.showToast(`Refiner #${refiner.purchaseOrder} → Level ${refiner.level}!`, 'success');
    });

    this._refinerCards.set(refiner.purchaseOrder, card);
    this._updateBuyCosts();
  }

  _refinerCardHTML(refiner, element) {
    const upgradeCost = getUpgradeCost(refiner.purchaseOrder,
      element.atomicWeight, refiner.level);
    return `
      <div class="card-header">
        <span class="card-title" style="color:var(--accent-secondary)">Refiner #${refiner.purchaseOrder}</span>
        <span class="card-level">Lv.${refiner.level}</span>
      </div>
      <div class="hopper-display">
        <span class="hopper-label">Input Hopper</span>
        <span class="hopper-count" id="rhinput-${refiner.purchaseOrder}">0.00</span>
      </div>
      <div class="hopper-display" style="margin-top:4px;">
        <span class="hopper-label">${element?.refinedName || 'Refined'} Output</span>
        <span class="hopper-count" id="rhoutput-${refiner.purchaseOrder}" style="color:var(--accent-secondary)">0.00</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" id="rprog-${refiner.purchaseOrder}" style="background:linear-gradient(90deg,var(--accent-secondary),var(--accent-primary))"></div>
        <span class="progress-label" id="rprog-label-${refiner.purchaseOrder}">Idle</span>
      </div>
      <div class="status-text idle" id="rstatus-${refiner.purchaseOrder}">Waiting for ore...</div>
      <div class="card-actions">
        <button class="btn btn-upgrade" style="border-color:var(--accent-secondary)" title="Cost: ${formatCredits(upgradeCost)}">
          ↑ Upgrade (${formatCredits(upgradeCost)})
        </button>
      </div>
      <div style="font-size:10px;color:var(--text-secondary);text-align:center;">
        Output: ${formatNumber(refiner.baseProduction * refiner.level, 2)} u/cycle
      </div>
    `;
  }

  _refreshRefinerCard(refiner) {
    const card = this._refinerCards.get(refiner.purchaseOrder);
    if (!card) return;
    const el = gameState.activeElement;
    card.innerHTML = this._refinerCardHTML(refiner, el);
    card.querySelector('.btn-upgrade')?.addEventListener('click', () => {
      soundManager.playClick();
      const cost = gameState.getUpgradeCostFor(refiner, gameState.activeElementId);
      if (!gameState.canAfford(cost)) { soundManager.playError(); return; }
      gameState.upgradeUnit(refiner, gameState.activeElementId);
      soundManager.playUpgrade();
      this._refreshRefinerCard(refiner);
    });
  }

  // ── Buy Cost Updates ─────────────────────────────────────────────────────────

  _updateBuyCosts() {
    const hCostEl = document.getElementById('next-harvester-cost');
    const rCostEl = document.getElementById('next-refiner-cost');
    const hBtnEl = document.getElementById('btn-buy-harvester');
    const rBtnEl = document.getElementById('btn-buy-refiner');

    const hCost = gameState.getNextHarvesterCost(gameState.activeElementId);
    const rCost = gameState.getNextRefinerCost(gameState.activeElementId);

    if (hCostEl) hCostEl.textContent = formatCredits(hCost);
    if (rCostEl) rCostEl.textContent = formatCredits(rCost);
    if (hBtnEl) hBtnEl.disabled = !gameState.canAfford(hCost);
    if (rBtnEl) rBtnEl.disabled = !gameState.canAfford(rCost);
  }

  // ── UI Update Loop (every 250ms for non-animation counters) ──────────────────

  _startUIUpdateLoop() {
    this._updateInterval = setInterval(() => {
      this._updateHopperCounters();
      this._updateBuyCosts();
      this._updatePrestigeButton();
    }, 250);
  }

  _updateHopperCounters() {
    const ops = gameState.activeOps;
    if (!ops) return;

    ops.harvesters.forEach(h => {
      const el = document.getElementById(`hhopper-${h.purchaseOrder}`);
      if (el) el.textContent = formatUnits(h.hopper);
    });

    ops.refiners.forEach(r => {
      const inEl = document.getElementById(`rhinput-${r.purchaseOrder}`);
      const outEl = document.getElementById(`rhoutput-${r.purchaseOrder}`);
      if (inEl) inEl.textContent = formatUnits(r.inputHopper);
      if (outEl) outEl.textContent = formatUnits(r.outputHopper);
    });
  }

  _updatePrestigeButton() {
    const btn = document.getElementById('btn-prestige');
    if (!btn) return;
    const tier = gameState.getCurrentPrestigeTier();
    if (tier) {
      btn.style.boxShadow = '0 0 12px var(--accent-danger)';
      btn.title = `Prestige available! Tier ${tier.tier} — ${tier.multiplier}x multiplier`;
    } else {
      btn.style.boxShadow = '';
    }
  }

  // ── Modals ───────────────────────────────────────────────────────────────────

  _buildModals() {
    const container = document.createElement('div');
    container.id = 'modal-container';
    document.body.appendChild(container);
  }

  _openModal(html) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="modal-overlay" id="active-modal-overlay">
        <div class="modal-box">
          ${html}
        </div>
      </div>
    `;
    document.getElementById('active-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'active-modal-overlay') this._closeModal();
    });
  }

  _closeModal() {
    const container = document.getElementById('modal-container');
    if (container) container.innerHTML = '';
  }

  // ── Settings Modal ────────────────────────────────────────────────────────────

  _openSettingsModal() {
    const s = gameState.settings;
    this._openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span class="modal-title" style="margin:0;padding:0;border:none;">⚙ Settings</span>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;">

        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Theme</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${['dark','industrial','lab','hybrid'].map(t => `
              <button class="btn ${s.theme===t?'btn-primary':'btn-upgrade'} theme-btn" data-theme="${t}" style="font-size:11px;padding:8px;">
                ${t==='dark'?'🌌 Deep Space':t==='industrial'?'🏭 Industrial':t==='lab'?'🧪 Clean Lab':'🌗 Hybrid'}
                ${s.theme===t?' ✓':''}
              </button>
            `).join('')}
          </div>
        </div>

        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Sound Effects</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn ${s.sfxEnabled?'btn-upgrade':'btn-primary'}" id="sfx-toggle" style="width:80px;">
              ${s.sfxEnabled?'ON':'OFF'}
            </button>
            <input type="range" id="sfx-volume" min="0" max="1" step="0.05" value="${s.sfxVolume}"
              style="flex:1;accent-color:var(--accent-primary);">
            <span id="sfx-vol-label" style="font-size:11px;color:var(--text-secondary);width:40px;">${Math.round(s.sfxVolume*100)}%</span>
          </div>
        </div>

        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Background Atmosphere</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn ${s.bgmEnabled?'btn-upgrade':'btn-primary'}" id="bgm-toggle" style="width:80px;">
              ${s.bgmEnabled?'ON':'OFF'}
            </button>
            <input type="range" id="bgm-volume" min="0" max="1" step="0.05" value="${s.bgmVolume}"
              style="flex:1;accent-color:var(--accent-primary);">
            <span id="bgm-vol-label" style="font-size:11px;color:var(--text-secondary);width:40px;">${Math.round(s.bgmVolume*100)}%</span>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:12px;display:flex;gap:8px;">
          <button class="btn btn-primary" id="btn-save-now" style="flex:1;">💾 Save Now</button>
          <button class="btn btn-prestige" id="btn-reset-game" style="flex:1;">🗑 Reset Game</button>
        </div>

        <div style="font-size:10px;color:var(--text-secondary);text-align:center;">
          Auto-saves every 30 seconds to local storage. Cloud save coming soon.
        </div>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => this._closeModal());

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        gameState.settings.theme = theme;
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme);
        soundManager.playClick();
        this._closeModal();
        this._openSettingsModal();
      });
    });

    // SFX toggle
    document.getElementById('sfx-toggle').addEventListener('click', () => {
      gameState.settings.sfxEnabled = !gameState.settings.sfxEnabled;
      soundManager.updateSettings();
      this._closeModal();
      this._openSettingsModal();
    });

    // BGM toggle
    document.getElementById('bgm-toggle').addEventListener('click', () => {
      gameState.settings.bgmEnabled = !gameState.settings.bgmEnabled;
      soundManager.updateSettings();
      this._closeModal();
      this._openSettingsModal();
    });

    // SFX volume
    document.getElementById('sfx-volume').addEventListener('input', (e) => {
      gameState.settings.sfxVolume = parseFloat(e.target.value);
      soundManager.updateSettings();
      document.getElementById('sfx-vol-label').textContent = Math.round(e.target.value * 100) + '%';
    });

    // BGM volume
    document.getElementById('bgm-volume').addEventListener('input', (e) => {
      gameState.settings.bgmVolume = parseFloat(e.target.value);
      soundManager.updateSettings();
      document.getElementById('bgm-vol-label').textContent = Math.round(e.target.value * 100) + '%';
    });

    // Save now
    document.getElementById('btn-save-now').addEventListener('click', () => {
      saveManager.save();
      soundManager.playClick();
      this.showToast('Game saved!', 'success');
      this._closeModal();
    });

    // Reset
    document.getElementById('btn-reset-game').addEventListener('click', () => {
      if (confirm('⚠ This will permanently delete ALL progress. Are you sure?')) {
        saveManager.reset();
      }
    });
  }

  // ── Prestige Modal ────────────────────────────────────────────────────────────

  _openPrestigeModal() {
    const currentTier = gameState.getCurrentPrestigeTier();
    const nextTier = gameState.getNextPrestigeTier();
    const pts = gameState.prestigePoints;
    const currentMult = gameState.prestigeMultiplier;

    const tiersHTML = PRESTIGE_TIERS.map(t => {
      const reached = pts >= t.pointsRequired;
      const isCurrent = currentTier?.tier === t.tier;
      return `
        <tr style="color:${reached?'var(--accent-success)':'var(--text-secondary)'};${isCurrent?'font-weight:bold;color:var(--accent-warning)':''}">
          <td style="padding:4px 8px;">Tier ${t.tier}</td>
          <td style="padding:4px 8px;">${formatNumber(t.pointsRequired, 0)}</td>
          <td style="padding:4px 8px;">${t.multiplier}x</td>
          <td style="padding:4px 8px;">${reached?'✓':''}</td>
        </tr>
      `;
    }).join('');

    const historyHTML = gameState.prestigeHistory.length === 0
      ? '<div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:8px;">No prestige history yet.</div>'
      : gameState.prestigeHistory.map((h, i) => `
        <div style="font-size:11px;color:var(--text-secondary);display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border-color);">
          <span>Prestige #${i+1}</span>
          <span style="color:var(--accent-warning)">Tier ${h.tier} — ${h.multiplier}x</span>
          <span>${new Date(h.timestamp).toLocaleDateString()}</span>
        </div>
      `).join('');

    const newMult = currentTier ? currentMult * currentTier.multiplier : currentMult;

    this._openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span class="modal-title" style="margin:0;padding:0;border:none;">★ Prestige</span>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;padding:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12px;color:var(--text-secondary);">Your Prestige Points</span>
            <span style="font-size:14px;font-weight:bold;color:var(--accent-warning);">${formatNumber(pts, 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12px;color:var(--text-secondary);">Current Multiplier</span>
            <span style="font-size:14px;font-weight:bold;color:var(--accent-primary);">${currentMult.toFixed(2)}×</span>
          </div>
          ${currentTier ? `
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:12px;color:var(--text-secondary);">After Prestige</span>
            <span style="font-size:14px;font-weight:bold;color:var(--accent-success);">${newMult.toFixed(2)}×</span>
          </div>` : `
          <div style="color:var(--accent-danger);font-size:11px;text-align:center;margin-top:4px;">
            Need ${formatNumber(PRESTIGE_TIERS[0].pointsRequired, 0)} points for Tier 1 prestige.<br>
            ${nextTier ? `Next tier: ${formatNumber(nextTier.pointsRequired - pts, 0)} pts away.` : ''}
          </div>`}
        </div>

        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Milestone Tiers</div>
          <table style="width:100%;font-size:11px;border-collapse:collapse;">
            <thead>
              <tr style="color:var(--text-secondary);font-size:10px;">
                <th style="text-align:left;padding:4px 8px;">Tier</th>
                <th style="text-align:left;padding:4px 8px;">Points</th>
                <th style="text-align:left;padding:4px 8px;">Mult</th>
                <th style="text-align:left;padding:4px 8px;"></th>
              </tr>
            </thead>
            <tbody>${tiersHTML}</tbody>
          </table>
        </div>

        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Prestige History</div>
          ${historyHTML}
        </div>

        <div style="background:rgba(255,51,102,0.1);border:1px solid var(--accent-danger);border-radius:6px;padding:10px;font-size:11px;color:var(--text-secondary);">
          ⚠ Prestige causes a <strong style="color:var(--accent-danger)">full reset</strong> — all credits, harvesters, refiners, and unlocked elements are lost. Only your multiplier stack is kept.
        </div>

        <button class="btn btn-prestige" id="btn-confirm-prestige"
          ${!currentTier ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}
          style="padding:12px;font-size:13px;">
          ${currentTier ? `★ Prestige Now (Tier ${currentTier.tier} — ${currentTier.multiplier}x)` : '★ Prestige Not Yet Available'}
        </button>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => this._closeModal());

    document.getElementById('btn-confirm-prestige')?.addEventListener('click', () => {
      if (!currentTier) return;
      if (confirm(`Prestige at Tier ${currentTier.tier}? You will receive a ${currentTier.multiplier}x multiplier but lose ALL progress.`)) {
        gameState.doPrestige();
        soundManager.playPrestige();
        this._closeModal();
        this._rebuildActiveElement();
        this.showToast(`Prestige! New multiplier: ${gameState.prestigeMultiplier.toFixed(2)}×`, 'success');
      }
    });
  }

  // ── Periodic Table Modal ──────────────────────────────────────────────────────

  _openPeriodicTableModal() {
    const unlocked = new Set(gameState.unlockedElements);
    const next = gameState.nextUnlockableElement;

    // Build simplified periodic table grid (first 18 for Phase 1)
    const elementsHTML = ELEMENTS.map(el => {
      const isUnlocked = unlocked.has(el.atomicNumber);
      const isActive = el.atomicNumber === gameState.activeElementId;
      const isNext = el.atomicNumber === next?.atomicNumber;
      const canUnlock = isNext && gameState.canAfford(el.unlockCost);

      let borderColor = 'var(--border-color)';
      let bgColor = 'var(--bg-secondary)';
      let cursor = 'default';
      let badge = '';

      if (isActive) { borderColor = 'var(--accent-primary)'; bgColor = 'var(--btn-primary-bg)'; cursor = 'pointer'; }
      else if (isUnlocked) { borderColor = 'var(--accent-success)'; cursor = 'pointer'; }
      else if (canUnlock) { borderColor = 'var(--accent-warning)'; cursor = 'pointer'; badge = '🔓'; }
      else if (isNext) { borderColor = 'var(--accent-danger)'; badge = `₢${formatNumber(el.unlockCost,0)}`; }

      return `
        <div class="pt-cell ${isUnlocked?'unlocked':''} ${isActive?'active':''} ${canUnlock?'can-unlock':''}"
          data-atomic="${el.atomicNumber}"
          style="border:1px solid ${borderColor};background:${bgColor};border-radius:4px;
                 padding:6px 4px;text-align:center;cursor:${cursor};transition:all 0.2s;
                 ${isActive?'box-shadow:0 0 10px var(--accent-primary);':''}">
          <div style="font-size:9px;color:var(--text-secondary);">${el.atomicNumber}</div>
          <div style="font-size:16px;font-weight:bold;color:${isUnlocked?'var(--accent-primary)':'var(--text-secondary)'};">${el.symbol}</div>
          <div style="font-size:8px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${el.name}</div>
          ${badge ? `<div style="font-size:8px;color:var(--accent-warning);margin-top:2px;">${badge}</div>` : ''}
        </div>
      `;
    }).join('');

    this._openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span class="modal-title" style="margin:0;padding:0;border:none;">🔬 Periodic Table</span>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
        Select an unlocked element to view its operation. Unlock new elements by earning enough credits.
      </div>

      <div id="pt-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-height:400px;overflow-y:auto;">
        ${elementsHTML}
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-secondary);">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <span>🟦 Active &nbsp;</span>
          <span style="color:var(--accent-success)">● Unlocked</span>
          <span style="color:var(--accent-warning)">🔓 Can Unlock</span>
          <span style="color:var(--border-color)">● Locked</span>
        </div>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => this._closeModal());

    // Cell click handlers
    document.querySelectorAll('.pt-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const atomicNum = parseInt(cell.dataset.atomic);
        const el = ELEMENTS.find(e => e.atomicNumber === atomicNum);
        if (!el) return;

        soundManager.playClick();

        if (unlocked.has(atomicNum)) {
          // Switch active element
          gameState.activeElementId = atomicNum;
          this._closeModal();
          this._rebuildActiveElement();
          this.showToast(`Switched to ${el.name}`, 'success');
        } else if (atomicNum === next?.atomicNumber && gameState.canAfford(el.unlockCost)) {
          // Unlock new element
          if (confirm(`Unlock ${el.name} (${el.symbol})? Cost: ${formatCredits(el.unlockCost)}`)) {
            if (gameState.doAscend()) {
              soundManager.playAscension();
              this._closeModal();
              this._rebuildActiveElement();
              this.showToast(`${el.name} unlocked! Refining → ${el.refinedName}`, 'success');
            }
          }
        } else if (!unlocked.has(atomicNum)) {
          this.showToast(`Need ${formatCredits(el.unlockCost)} to unlock ${el.name}`, 'warning');
        }
      });
    });
  }

  // ── Rebuild on element switch / prestige ──────────────────────────────────────

  _rebuildActiveElement() {
    this._harvesterCards.clear();
    this._refinerCards.clear();

    // Rebuild harvester panel
    const hScroll = document.getElementById('harvester-scroll');
    if (hScroll) hScroll.innerHTML = '';

    // Rebuild refiner panel header
    const rPanel = document.getElementById('refiner-panel');
    const rHeader = rPanel?.querySelector('.panel-header');
    const el = gameState.activeElement;
    if (rHeader) rHeader.innerHTML = `🔬 Refiners → <span style="color:var(--accent-secondary)">${el?.refinedName || 'Refined'}</span>`;
    const rScroll = document.getElementById('refiner-scroll');
    if (rScroll) rScroll.innerHTML = '';

    // Update top bar element info
    const tbSymbol = document.getElementById('tb-symbol');
    const tbAtomic = document.getElementById('tb-atomic');
    const tbName = document.getElementById('tb-element-name');
    const tbRefined = document.getElementById('tb-refined-name');
    if (tbSymbol) tbSymbol.textContent = el?.symbol || '';
    if (tbAtomic) tbAtomic.textContent = el?.atomicNumber || '';
    if (tbName) tbName.textContent = el?.name || '';
    if (tbRefined) tbRefined.textContent = `Refining → ${el?.refinedName || ''}`;

    this._syncCardsFromState();
    this._scene._transportRenderer?.rebuild();
  }

  // ── Toast Notifications ───────────────────────────────────────────────────────

  _buildToastContainer() {
    if (!document.getElementById('toast-container')) {
      const el = document.createElement('div');
      el.id = 'toast-container';
      document.body.appendChild(el);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
  }

  // ── Resize / Destroy ──────────────────────────────────────────────────────────

  onResize() {
    // CSS handles most of it; just reflow buy costs
    this._updateBuyCosts();
  }

  destroy() {
    if (this._updateInterval) clearInterval(this._updateInterval);
    this._harvesterCards.clear();
    this._refinerCards.clear();
  }
}
