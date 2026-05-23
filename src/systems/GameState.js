/**
 * GameState — Central state management for Periodic Idle
 * All game data lives here. UI and Phaser scenes read/write through this.
 *
 * Cloud-save ready: the serialize/deserialize methods produce a clean
 * JSON payload that can be sent to a backend API in a future phase.
 */

import { ELEMENTS, getPurchaseCost, getUpgradeCost, getBaseProduction, getSellPrice } from '../data/elements.js';
import { formatNumber } from '../utils/format.js';

// ─── Prestige milestone table ────────────────────────────────────────────────
export const PRESTIGE_TIERS = [
  { tier: 1, pointsRequired: 1_000,         multiplier: 1.5 },
  { tier: 2, pointsRequired: 10_000,        multiplier: 2.0 },
  { tier: 3, pointsRequired: 100_000,       multiplier: 3.0 },
  { tier: 4, pointsRequired: 1_000_000,     multiplier: 5.0 },
  { tier: 5, pointsRequired: 10_000_000,    multiplier: 8.0 },
  { tier: 6, pointsRequired: 100_000_000,   multiplier: 13.0 },
  { tier: 7, pointsRequired: 1_000_000_000, multiplier: 21.0 },
];

// ─── Default unit template factories ─────────────────────────────────────────

function makeHarvester(purchaseOrder, element) {
  return {
    id: `harvester_${purchaseOrder}`,
    purchaseOrder,
    level: 1,
    hopper: 0,          // raw ore waiting in hopper
    baseProduction: getBaseProduction(purchaseOrder),
    state: 'idle',      // idle | mining | pausing | loading | returning
    progress: 0,        // 0..1 fill progress
  };
}

function makeRefiner(purchaseOrder, element) {
  return {
    id: `refiner_${purchaseOrder}`,
    purchaseOrder,
    level: 1,
    inputHopper: 0,     // raw ore waiting to be refined
    outputHopper: 0,    // refined product waiting for lift
    baseProduction: getBaseProduction(purchaseOrder),
    state: 'idle',
    progress: 0,
  };
}

function makeLift(id, purchaseOrder) {
  return {
    id,
    purchaseOrder,
    level: 1,
    capacity: 1,
    contents: 0,
    state: 'idle',  // idle | loading | traveling_up | traveling_down | unloading | waiting
  };
}

function makeCar(id) {
  return {
    id,
    level: 1,
    capacity: 1,
    contents: 0,
    state: 'idle',  // idle | loading | traveling_right | traveling_left | unloading | waiting
  };
}

function makeTube(id) {
  return {
    id,
    level: 1,
    capacity: 1,
    contents: 0,
    state: 'idle',  // idle | loading | traveling | unloading
  };
}

// ─── Default element operation state ─────────────────────────────────────────

function makeElementOps(elementId) {
  return {
    elementId,
    // Harvesters
    harvesters: [],
    harvesterCount: 0,
    // Raw ore transport
    rawHopper: 0,          // hopper at top of harvester lift
    harvesterLifts: [],    // one lift per harvester
    mineCar: makeCar('mineCar_0'),
    refinerInputHopper: 0, // hopper feeding refiners
    // Refiners
    refiners: [],
    refinerCount: 0,
    // Refined product transport
    refinerLifts: [],      // one lift per refiner (right side)
    warehouseHopper: 0,    // warehouse hopper
    pneumaticTube: makeTube('tube_0'),
    // Totals
    totalRefined: 0,       // lifetime refined units (for prestige points)
    totalSold: 0,          // lifetime sold units
    // Background production (active when this is not the current element)
    backgroundRate: 0,     // units per second when backgrounded
    isBackground: false,
  };
}

// ─── GameState class ──────────────────────────────────────────────────────────

export class GameState {
  constructor() {
    this.version = '0.1.0';

    // Economy
    this.credits = 0;

    // Prestige
    this.prestigeHistory = [];        // [{ tier, multiplier, timestamp, totalPoints }]
    this.prestigeMultiplier = 1.0;    // current stacked multiplier
    this.prestigePoints = 0;          // accumulated this run

    // Ascension / Elements
    this.unlockedElements = [1];      // atomic numbers unlocked
    this.activeElementId = 1;         // currently viewed element
    this.elementOps = {};             // elementId -> ElementOps

    // Settings
    this.settings = {
      theme: 'dark',      // dark | industrial | lab | hybrid
      sfxEnabled: true,
      sfxVolume: 0.7,
      bgmEnabled: true,
      bgmVolume: 0.3,
    };

    // Meta
    this.sessionStart = Date.now();
    this.lastSave = Date.now();
    this.lastActive = Date.now();
    this.totalPlayTime = 0;           // seconds

    // Initialize Hydrogen
    this._initElement(1);
    // Buy first harvester and refiner automatically (tutorial)
    this._buyFirstHarvester(1);
    this._buyFirstRefiner(1);
  }

  // ── Element initialization ──────────────────────────────────────────────────

  _initElement(atomicNumber) {
    if (this.elementOps[atomicNumber]) return;
    this.elementOps[atomicNumber] = makeElementOps(atomicNumber);
  }

  _buyFirstHarvester(atomicNumber) {
    const ops = this.elementOps[atomicNumber];
    if (!ops) return;
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    ops.harvesterCount = 1;
    ops.harvesters.push(makeHarvester(1, element));
    ops.harvesterLifts.push(makeLift(`lift_h1`, 1));
  }

  _buyFirstRefiner(atomicNumber) {
    const ops = this.elementOps[atomicNumber];
    if (!ops) return;
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    ops.refinerCount = 1;
    ops.refiners.push(makeRefiner(1, element));
    ops.refinerLifts.push(makeLift(`lift_r1`, 1));
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get activeOps() {
    return this.elementOps[this.activeElementId];
  }

  get activeElement() {
    return ELEMENTS.find(e => e.atomicNumber === this.activeElementId);
  }

  get nextUnlockableElement() {
    const maxUnlocked = Math.max(...this.unlockedElements);
    return ELEMENTS.find(e => e.atomicNumber === maxUnlocked + 1) || null;
  }

  // ── Economy ─────────────────────────────────────────────────────────────────

  addCredits(amount) {
    const adjusted = amount * this.prestigeMultiplier;
    this.credits += adjusted;
    return adjusted;
  }

  canAfford(cost) {
    return this.credits >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.credits -= cost;
    return true;
  }

  sellRefined(units, element) {
    const pricePerUnit = getSellPrice(element);
    const gross = units * pricePerUnit;
    return this.addCredits(gross);
  }

  // ── Purchase: Harvester ─────────────────────────────────────────────────────

  getNextHarvesterCost(atomicNumber) {
    const ops = this.elementOps[atomicNumber];
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    const nextOrder = (ops?.harvesterCount || 0) + 1;
    return getPurchaseCost(nextOrder, element.atomicWeight);
  }

  buyHarvester(atomicNumber) {
    const cost = this.getNextHarvesterCost(atomicNumber);
    if (!this.spend(cost)) return null;
    const ops = this.elementOps[atomicNumber];
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    ops.harvesterCount++;
    const harvester = makeHarvester(ops.harvesterCount, element);
    ops.harvesters.push(harvester);
    ops.harvesterLifts.push(makeLift(`lift_h${ops.harvesterCount}`, ops.harvesterCount));
    return harvester;
  }

  // ── Purchase: Refiner ───────────────────────────────────────────────────────

  getNextRefinerCost(atomicNumber) {
    const ops = this.elementOps[atomicNumber];
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    const nextOrder = (ops?.refinerCount || 0) + 1;
    return getPurchaseCost(nextOrder, element.atomicWeight);
  }

  buyRefiner(atomicNumber) {
    const cost = this.getNextRefinerCost(atomicNumber);
    if (!this.spend(cost)) return null;
    const ops = this.elementOps[atomicNumber];
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    ops.refinerCount++;
    const refiner = makeRefiner(ops.refinerCount, element);
    ops.refiners.push(refiner);
    ops.refinerLifts.push(makeLift(`lift_r${ops.refinerCount}`, ops.refinerCount));
    return refiner;
  }

  // ── Upgrades ────────────────────────────────────────────────────────────────

  getUpgradeCostFor(unit, atomicNumber) {
    const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
    return getUpgradeCost(unit.purchaseOrder, element.atomicWeight, unit.level);
  }

  upgradeUnit(unit, atomicNumber) {
    const cost = this.getUpgradeCostFor(unit, atomicNumber);
    if (!this.spend(cost)) return false;
    unit.level++;
    // Capacity doubles per level (for lifts/cars/tubes)
    if (unit.capacity !== undefined) unit.capacity = Math.pow(2, unit.level - 1);
    // baseProduction is NOT mutated — level multiplier is applied at use site:
    // effectiveProduction = baseProduction * 2^(level-1)
    return true;
  }

  // ── Prestige Points ─────────────────────────────────────────────────────────

  addPrestigePoints(units, atomicNumber) {
    this.prestigePoints += units * atomicNumber;
  }

  getCurrentPrestigeTier() {
    let tier = null;
    for (const t of PRESTIGE_TIERS) {
      if (this.prestigePoints >= t.pointsRequired) tier = t;
    }
    return tier;
  }

  getNextPrestigeTier() {
    for (const t of PRESTIGE_TIERS) {
      if (this.prestigePoints < t.pointsRequired) return t;
    }
    return null;
  }

  // ── Prestige ────────────────────────────────────────────────────────────────

  canPrestige() {
    return this.getCurrentPrestigeTier() !== null;
  }

  doPrestige() {
    const tier = this.getCurrentPrestigeTier();
    if (!tier) return false;

    // Record history
    this.prestigeHistory.push({
      tier: tier.tier,
      multiplier: tier.multiplier,
      timestamp: Date.now(),
      totalPoints: this.prestigePoints,
    });

    // Stack multiplier multiplicatively
    this.prestigeMultiplier *= tier.multiplier;

    // Full reset
    this.credits = 0;
    this.prestigePoints = 0;
    this.unlockedElements = [1];
    this.activeElementId = 1;
    this.elementOps = {};
    this._initElement(1);
    this._buyFirstHarvester(1);
    this._buyFirstRefiner(1);

    return true;
  }

  // ── Ascension ───────────────────────────────────────────────────────────────

  canAscend() {
    const next = this.nextUnlockableElement;
    if (!next) return false;
    return this.credits >= next.unlockCost;
  }

  doAscend() {
    const next = this.nextUnlockableElement;
    if (!next) return false;
    if (!this.spend(next.unlockCost)) return false;

    // Background previous active element
    const prevOps = this.elementOps[this.activeElementId];
    if (prevOps) {
      prevOps.isBackground = true;
      // Compute a simple background rate from current refiners
      prevOps.backgroundRate = prevOps.refiners.reduce((sum, r) => {
        return sum + (r.baseProduction * r.level);
      }, 0) * 0.5; // background runs at 50% efficiency
    }

    this.unlockedElements.push(next.atomicNumber);
    this._initElement(next.atomicNumber);
    this._buyFirstHarvester(next.atomicNumber);
    this._buyFirstRefiner(next.atomicNumber);
    this.activeElementId = next.atomicNumber;

    return true;
  }

  // ── Background tick (called every second from game loop) ────────────────────

  tickBackground(deltaSeconds) {
    for (const [id, ops] of Object.entries(this.elementOps)) {
      if (!ops.isBackground) continue;
      const atomicNumber = parseInt(id);
      const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
      if (!element) continue;

      const units = ops.backgroundRate * deltaSeconds * this.prestigeMultiplier;
      ops.totalRefined += units;
      ops.totalSold += units;
      this.addPrestigePoints(units, atomicNumber);
      this.credits += units * getSellPrice(element); // direct credit (no prestige double-dip)
    }
  }

  // ── Offline catch-up ────────────────────────────────────────────────────────

  applyOfflineProgress(elapsedSeconds) {
    const MAX_OFFLINE = 7 * 24 * 3600; // 7 days
    const capped = Math.min(elapsedSeconds, MAX_OFFLINE);
    const effective = capped * 0.5; // 50% efficiency

    for (const [id, ops] of Object.entries(this.elementOps)) {
      const atomicNumber = parseInt(id);
      const element = ELEMENTS.find(e => e.atomicNumber === atomicNumber);
      if (!element) continue;

      // Use backgroundRate for all elements during offline
      const rate = ops.backgroundRate || ops.refiners.reduce((sum, r) => {
        return sum + (r.baseProduction * r.level);
      }, 0);

      const units = rate * effective * this.prestigeMultiplier;
      ops.totalRefined += units;
      ops.totalSold += units;
      this.addPrestigePoints(units, atomicNumber);
      this.credits += units * getSellPrice(element);
    }

    return effective;
  }

  // ── Serialization (save/load) ────────────────────────────────────────────────

  serialize() {
    return {
      version: this.version,
      credits: this.credits,
      prestigeHistory: this.prestigeHistory,
      prestigeMultiplier: this.prestigeMultiplier,
      prestigePoints: this.prestigePoints,
      unlockedElements: this.unlockedElements,
      activeElementId: this.activeElementId,
      elementOps: this.elementOps,
      settings: this.settings,
      lastActive: Date.now(),
      totalPlayTime: this.totalPlayTime,
    };
  }

  deserialize(data) {
    if (!data || data.version !== this.version) return false;

    this.credits = data.credits || 0;
    this.prestigeHistory = data.prestigeHistory || [];
    this.prestigeMultiplier = data.prestigeMultiplier || 1.0;
    this.prestigePoints = data.prestigePoints || 0;
    this.unlockedElements = data.unlockedElements || [1];
    this.activeElementId = data.activeElementId || 1;
    this.elementOps = data.elementOps || {};
    this.settings = { ...this.settings, ...(data.settings || {}) };
    this.lastActive = data.lastActive || Date.now();
    this.totalPlayTime = data.totalPlayTime || 0;

    return true;
  }

  // ── Save / Load ──────────────────────────────────────────────────────────────

  saveToLocal() {
    try {
      const payload = JSON.stringify(this.serialize());
      localStorage.setItem('periodic_idle_save', payload);
      this.lastSave = Date.now();
      return true;
    } catch (e) {
      console.error('[GameState] Save failed:', e);
      return false;
    }
  }

  loadFromLocal() {
    try {
      const raw = localStorage.getItem('periodic_idle_save');
      if (!raw) return false;
      const data = JSON.parse(raw);

      const ok = this.deserialize(data);
      if (!ok) return false;

      // Apply offline progress
      const elapsed = (Date.now() - this.lastActive) / 1000;
      if (elapsed > 30) {
        this.applyOfflineProgress(elapsed);
      }

      return true;
    } catch (e) {
      console.error('[GameState] Load failed:', e);
      return false;
    }
  }

  // Cloud-save stub (to be implemented with backend in a future phase)
  async saveToCloud() {
    // TODO: POST this.serialize() to cloud API
    console.log('[GameState] Cloud save: not yet implemented');
    return false;
  }

  async loadFromCloud() {
    // TODO: GET from cloud API and this.deserialize(data)
    console.log('[GameState] Cloud load: not yet implemented');
    return false;
  }
}

// Singleton export
export const gameState = new GameState();
