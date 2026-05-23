/**
 * TransportRenderer — Phaser scene layer managing all transport animations:
 *  - Harvester lift shafts (left side)
 *  - Raw ore hopper (top center-left)
 *  - Mine car track (top center)
 *  - Refiner input hopper (top center-right)
 *  - Refiner lift shafts (right side)
 *  - Warehouse hopper
 *  - Pneumatic tube + canister
 *  - Particle effects for loading/unloading
 *
 * Coordinate system:
 *   x=0 is left edge of center canvas
 *   y=0 is top edge of center canvas
 */

import Phaser from 'phaser';
import { gameState } from '../systems/GameState.js';
import { soundManager } from '../systems/SoundManager.js';
import { formatUnits } from '../utils/format.js';

// ── Layout constants (will be recomputed on resize) ──────────────────────────
const LIFT_WIDTH = 32;
const LIFT_HEIGHT = 48;
const HOPPER_WIDTH = 60;
const HOPPER_HEIGHT = 40;
const CAR_WIDTH = 48;
const CAR_HEIGHT = 28;
const TRACK_Y_OFFSET = 60;       // distance from top where track runs
const LIFT_SHAFT_X_LEFT = 40;    // x center of harvester lift shaft
const LIFT_SHAFT_X_RIGHT = -40;  // x from right edge of center for refiner lift

// Particle colors for raw ore (random mixed colors)
const RAW_ORE_COLORS = [
  0xff6b35, 0xf7931e, 0xffcd3c, 0x8bc34a,
  0x26c6da, 0x7c4dff, 0xff4081, 0xa0522d,
  0x78909c, 0xd4e157,
];

export class TransportRenderer {
  constructor(scene) {
    this._scene = scene;
    this._graphics = null;
    this._particleManagers = [];
    this._lifts = new Map();       // harvesterOrder -> LiftState
    this._refinerLifts = new Map(); // refinerOrder -> LiftState
    this._car = null;
    this._tube = null;
    this._canister = null;
    this._width = 0;
    this._height = 0;
    this._hopperTexts = {};
    this._liftTexts = {};
    this._carText = null;
    this._warehouseText = null;
    this._tubeText = null;
    this._rawHopperValue = 0;
    this._refinerHopperValue = 0;
    this._warehouseHopperValue = 0;
  }

  build() {
    const canvas = document.getElementById('transport-canvas-container');
    if (!canvas) return;

    this._width = canvas.clientWidth || 400;
    this._height = canvas.clientHeight || 600;

    // The Phaser game's canvas is already in the DOM via config
    // We use graphics objects to draw everything
    this._graphics = this._scene.add.graphics();

    this._buildStaticLayout();
    this._buildHopperLabels();
    this._buildLiftForHarvester(1);
    this._buildCar();
    this._buildTube();

    // Start the main transport state machine
    this._startTransportLoop();
  }

  _buildStaticLayout() {
    const g = this._graphics;
    const w = this._width;
    const h = this._height;
    const trackY = TRACK_Y_OFFSET;

    g.clear();

    // ── Track (top horizontal rail) ──────────────────────────────────────────
    g.lineStyle(3, 0x1e2a5e, 1);
    g.beginPath();
    g.moveTo(60, trackY);
    g.lineTo(w - 60, trackY);
    g.strokePath();

    // Rail ties
    g.lineStyle(2, 0x0f1a40, 0.7);
    for (let x = 70; x < w - 60; x += 20) {
      g.beginPath();
      g.moveTo(x, trackY - 6);
      g.lineTo(x, trackY + 6);
      g.strokePath();
    }

    // ── Left lift shaft ───────────────────────────────────────────────────────
    const lsX = LIFT_SHAFT_X_LEFT;
    g.lineStyle(2, 0x1e2a5e, 1);
    g.strokeRect(lsX - LIFT_WIDTH / 2 - 2, trackY, LIFT_WIDTH + 4, h - trackY - 20);

    // Shaft guide rails
    g.lineStyle(1, 0x2a4adf, 0.5);
    g.beginPath(); g.moveTo(lsX - LIFT_WIDTH / 2, trackY); g.lineTo(lsX - LIFT_WIDTH / 2, h - 20); g.strokePath();
    g.beginPath(); g.moveTo(lsX + LIFT_WIDTH / 2, trackY); g.lineTo(lsX + LIFT_WIDTH / 2, h - 20); g.strokePath();

    // ── Right lift shaft ─────────────────────────────────────────────────────
    const rsX = w + LIFT_SHAFT_X_RIGHT;
    g.lineStyle(2, 0x1e2a5e, 1);
    g.strokeRect(rsX - LIFT_WIDTH / 2 - 2, trackY, LIFT_WIDTH + 4, h - trackY - 20);
    g.lineStyle(1, 0x7b2fff, 0.5);
    g.beginPath(); g.moveTo(rsX - LIFT_WIDTH / 2, trackY); g.lineTo(rsX - LIFT_WIDTH / 2, h - 20); g.strokePath();
    g.beginPath(); g.moveTo(rsX + LIFT_WIDTH / 2, trackY); g.lineTo(rsX + LIFT_WIDTH / 2, h - 20); g.strokePath();

    // ── Raw ore hopper (left of track top) ───────────────────────────────────
    const rawHX = lsX + LIFT_WIDTH / 2 + 20 + HOPPER_WIDTH / 2;
    this._rawHopperX = rawHX;
    this._rawHopperY = trackY - HOPPER_HEIGHT / 2;
    this._drawHopper(g, rawHX, trackY - HOPPER_HEIGHT / 2, HOPPER_WIDTH, HOPPER_HEIGHT, 0x1e2a5e, 0x00d4ff, 'RAW');

    // ── Refiner input hopper (right of track top) ─────────────────────────────
    const refHX = rsX - LIFT_WIDTH / 2 - 20 - HOPPER_WIDTH / 2;
    this._refHopperX = refHX;
    this._refHopperY = trackY - HOPPER_HEIGHT / 2;
    this._drawHopper(g, refHX, trackY - HOPPER_HEIGHT / 2, HOPPER_WIDTH, HOPPER_HEIGHT, 0x1e2a5e, 0x7b2fff, 'ORE');

    // ── Warehouse hopper (far right, above pneumatic tube) ────────────────────
    const whX = w - 30;
    this._warehouseX = whX;
    this._warehouseY = trackY - HOPPER_HEIGHT / 2;
    this._drawHopper(g, whX - HOPPER_WIDTH / 2, trackY - HOPPER_HEIGHT / 2, HOPPER_WIDTH, HOPPER_HEIGHT, 0x1a0a30, 0x7b2fff, 'WH');

    // ── Pneumatic tube (horizontal, below warehouse) ──────────────────────────
    const tubeY = trackY + 20;
    this._tubeStartX = whX - HOPPER_WIDTH / 2;
    this._tubeEndX = w;
    this._tubeY = tubeY;
    g.lineStyle(4, 0x2a4adf, 0.8);
    g.beginPath();
    g.moveTo(this._tubeStartX, tubeY);
    g.lineTo(this._tubeEndX, tubeY);
    g.strokePath();
    // Tube border
    g.lineStyle(1, 0x7b2fff, 0.4);
    g.beginPath(); g.moveTo(this._tubeStartX, tubeY - 6); g.lineTo(this._tubeEndX, tubeY - 6); g.strokePath();
    g.beginPath(); g.moveTo(this._tubeStartX, tubeY + 6); g.lineTo(this._tubeEndX, tubeY + 6); g.strokePath();

    // Market terminal arrow
    g.lineStyle(2, 0x00ff9d, 1);
    g.beginPath();
    g.moveTo(w - 20, tubeY - 12);
    g.lineTo(w - 4, tubeY);
    g.lineTo(w - 20, tubeY + 12);
    g.strokePath();
  }

  _drawHopper(g, x, y, w, h, fillColor, borderColor, label) {
    // Trapezoid hopper shape
    const bw = w * 0.5; // bottom width
    g.fillStyle(fillColor, 1);
    g.fillRect(x - w / 2, y, w, h);
    g.lineStyle(2, borderColor, 1);
    g.strokeRect(x - w / 2, y, w, h);

    // Spout
    g.fillStyle(fillColor, 1);
    g.fillTriangle(
      x - bw / 2, y + h,
      x + bw / 2, y + h,
      x, y + h + 12
    );
    g.lineStyle(1, borderColor, 0.8);
    g.strokeTriangle(
      x - bw / 2, y + h,
      x + bw / 2, y + h,
      x, y + h + 12
    );
  }

  _buildHopperLabels() {
    const style = {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#00d4ff',
    };

    this._hopperTexts.raw = this._scene.add.text(
      this._rawHopperX, this._rawHopperY - 18, '0.00',
      { ...style }
    ).setOrigin(0.5);

    this._hopperTexts.ref = this._scene.add.text(
      this._refHopperX, this._refHopperY - 18, '0.00',
      { ...style, color: '#7b2fff' }
    ).setOrigin(0.5);

    this._hopperTexts.warehouse = this._scene.add.text(
      this._warehouseX - HOPPER_WIDTH / 2, this._warehouseY - 18, '0.00',
      { ...style, color: '#7b2fff' }
    ).setOrigin(0.5);

    // Labels
    const labelStyle = { fontFamily: 'Courier New', fontSize: '8px', color: '#3a4a7e' };
    this._scene.add.text(this._rawHopperX, this._rawHopperY - 28, 'RAW ORE HOPPER', labelStyle).setOrigin(0.5);
    this._scene.add.text(this._refHopperX, this._refHopperY - 28, 'REFINER INTAKE', { ...labelStyle, color: '#4a2a7e' }).setOrigin(0.5);
    this._scene.add.text(this._warehouseX - HOPPER_WIDTH / 2, this._warehouseY - 28, 'WAREHOUSE', { ...labelStyle, color: '#4a2a7e' }).setOrigin(0.5);

    // Market label
    this._scene.add.text(this._tubeEndX - 8, this._tubeY - 20, 'MARKET', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#00ff9d'
    }).setOrigin(1, 0.5);
  }

  _buildLiftForHarvester(order) {
    const lsX = LIFT_SHAFT_X_LEFT;
    const trackY = TRACK_Y_OFFSET;
    const bottomY = this._height - 30;

    // Lift car graphic
    const liftGfx = this._scene.add.graphics();
    liftGfx.fillStyle(0x0d1535, 1);
    liftGfx.fillRect(-LIFT_WIDTH / 2, -LIFT_HEIGHT / 2, LIFT_WIDTH, LIFT_HEIGHT);
    liftGfx.lineStyle(2, 0x2a4adf, 1);
    liftGfx.strokeRect(-LIFT_WIDTH / 2, -LIFT_HEIGHT / 2, LIFT_WIDTH, LIFT_HEIGHT);

    const liftContainer = this._scene.add.container(lsX, bottomY, [liftGfx]);

    // Counter text
    const countText = this._scene.add.text(lsX, bottomY - LIFT_HEIGHT / 2 - 8, '0.00', {
      fontFamily: 'Courier New',
      fontSize: '9px',
      color: '#00d4ff',
    }).setOrigin(0.5);

    // Particle emitter (for loading effect)
    const emitter = this._scene.add.particles(lsX, bottomY, '__DEFAULT', {
      speed: { min: 5, max: 25 },
      angle: { min: 240, max: 300 },
      scale: { start: 0.3, end: 0.05 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      frequency: -1, // manual emit
      quantity: 3,
      tint: RAW_ORE_COLORS,
    });

    const liftState = {
      order,
      container: liftContainer,
      gfx: liftGfx,
      countText,
      emitter,
      y: bottomY,
      targetY: bottomY,
      contents: 0,
      capacity: 1,
      state: 'idle',
      bottomY,
      topY: trackY,
    };

    this._lifts.set(order, liftState);
  }

  _buildCar() {
    const trackY = TRACK_Y_OFFSET;
    const startX = this._rawHopperX + HOPPER_WIDTH / 2 + 10;

    const carGfx = this._scene.add.graphics();
    carGfx.fillStyle(0x0d1535, 1);
    carGfx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);
    carGfx.lineStyle(2, 0x1e2a5e, 1);
    carGfx.strokeRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);

    // Wheels
    carGfx.fillStyle(0x2a4adf, 1);
    carGfx.fillCircle(-CAR_WIDTH / 2 + 8, CAR_HEIGHT / 2 + 4, 5);
    carGfx.fillCircle(CAR_WIDTH / 2 - 8, CAR_HEIGHT / 2 + 4, 5);

    this._car = this._scene.add.container(startX, trackY - CAR_HEIGHT / 2, [carGfx]);

    this._carText = this._scene.add.text(startX, trackY - CAR_HEIGHT - 10, '0.00', {
      fontFamily: 'Courier New',
      fontSize: '9px',
      color: '#00d4ff',
    }).setOrigin(0.5);

    this._carStartX = startX;
    this._carEndX = this._refHopperX - HOPPER_WIDTH / 2 - 10;
    this._carTrackY = trackY - CAR_HEIGHT / 2;

    this._carState = {
      x: startX,
      contents: 0,
      capacity: 1,
      state: 'idle',
    };
  }

  _buildTube() {
    // Canister for pneumatic tube
    this._canister = this._scene.add.graphics();
    this._canister.visible = false;
    this._canisterX = this._tubeStartX;
    this._canisterY = this._tubeY;

    this._tubeState = {
      x: this._tubeStartX,
      contents: 0,
      capacity: 1,
      state: 'idle',
    };
  }

  // ── Main Transport State Machine ─────────────────────────────────────────────

  _startTransportLoop() {
    // The transport loop is event-driven via Phaser tweens and callbacks
    // Start the harvester-to-lift cycle
    this._scene.time.delayedCall(500, () => this._dispatchHarvesterLift(1));
    this._scene.time.delayedCall(1000, () => this._dispatchCar());
    this._scene.time.delayedCall(1500, () => this._dispatchTube());
  }

  // ── Lift State Machine (Harvester side) ──────────────────────────────────────

  _dispatchHarvesterLift(order) {
    const lift = this._lifts.get(order);
    const ops = gameState.activeOps;
    if (!lift || !ops) return;

    const harvester = ops.harvesters[order - 1];
    if (!harvester) return;

    // Only dispatch if harvester has ore
    if (harvester.hopper <= 0) {
      this._scene.time.delayedCall(500, () => this._dispatchHarvesterLift(order));
      return;
    }

    lift.state = 'waiting';
    soundManager.playLiftStart();

    // Wait 1 second after ore deposited (already elapsed), travel down to harvester
    this._scene.tweens.add({
      targets: lift.container,
      y: lift.bottomY,
      duration: Math.abs(lift.container.y - lift.bottomY) * 3,
      ease: 'Linear',
      onComplete: () => {
        // Wait 1 second at harvester
        this._scene.time.delayedCall(1000, () => {
          // Load over 3 seconds with particles
          this._loadLiftFromHarvester(lift, harvester, () => {
            // Travel up
            soundManager.playLiftStart();
            this._scene.tweens.add({
              targets: lift.container,
              y: lift.topY,
              duration: Math.abs(lift.bottomY - lift.topY) * 3,
              ease: 'Linear',
              onComplete: () => {
                soundManager.playLiftArrive();
                // Wait 1 second at top
                this._scene.time.delayedCall(1000, () => {
                  // Unload into raw hopper
                  this._unloadLiftToRawHopper(lift, () => {
                    // Dispatch again
                    this._scene.time.delayedCall(500, () => this._dispatchHarvesterLift(order));
                  });
                });
              }
            });
          });
        });
      }
    });
  }

  _loadLiftFromHarvester(lift, harvester, onComplete) {
    const capacity = lift.capacity;
    const available = Math.min(harvester.hopper, capacity);
    if (available <= 0) { onComplete(); return; }

    const duration = 3000;
    const steps = 30;
    const stepDuration = duration / steps;
    const stepAmount = available / steps;
    let loaded = 0;

    lift.state = 'loading';

    const loadStep = () => {
      if (loaded >= steps) {
        harvester.hopper = Math.max(0, harvester.hopper - available);
        lift.contents = available;
        lift.countText.setText(formatUnits(lift.contents));
        onComplete();
        return;
      }
      loaded++;
      lift.contents = stepAmount * loaded;
      lift.countText.setText(formatUnits(lift.contents));

      // Emit particle
      const color = RAW_ORE_COLORS[Math.floor(Math.random() * RAW_ORE_COLORS.length)];
      const px = lift.container.x + (Math.random() - 0.5) * LIFT_WIDTH;
      const py = lift.container.y - LIFT_HEIGHT / 4;

      const ptcl = this._scene.add.graphics();
      ptcl.fillStyle(color, 1);
      ptcl.fillRect(-3, -3, 6, 6);
      ptcl.x = px;
      ptcl.y = py - 10;

      this._scene.tweens.add({
        targets: ptcl,
        y: py,
        alpha: 0,
        duration: 400,
        onComplete: () => ptcl.destroy(),
      });

      soundManager.playParticleLoad();
      this._scene.time.delayedCall(stepDuration, loadStep);
    };

    loadStep();
  }

  _unloadLiftToRawHopper(lift, onComplete) {
    const duration = 3000;
    const steps = 30;
    const stepDuration = duration / steps;
    const amount = lift.contents;
    const stepAmount = amount / steps;
    let unloaded = 0;

    lift.state = 'unloading';

    const unloadStep = () => {
      if (unloaded >= steps) {
        gameState.activeOps.rawHopper += amount;
        lift.contents = 0;
        lift.countText.setText('0.00');
        if (this._hopperTexts.raw) {
          this._hopperTexts.raw.setText(formatUnits(gameState.activeOps.rawHopper));
        }
        lift.state = 'idle';
        onComplete();
        return;
      }
      unloaded++;
      const remaining = amount - stepAmount * unloaded;
      lift.countText.setText(formatUnits(remaining));
      if (this._hopperTexts.raw) {
        this._hopperTexts.raw.setText(formatUnits(gameState.activeOps.rawHopper + stepAmount * unloaded));
      }

      soundManager.playParticleLoad();
      this._scene.time.delayedCall(stepDuration, unloadStep);
    };

    unloadStep();
  }

  // ── Car State Machine ─────────────────────────────────────────────────────────

  _dispatchCar() {
    const ops = gameState.activeOps;
    if (!ops) { this._scene.time.delayedCall(1000, () => this._dispatchCar()); return; }

    if (ops.rawHopper <= 0 || this._carState.state !== 'idle') {
      this._scene.time.delayedCall(500, () => this._dispatchCar());
      return;
    }

    // Wait 1 second before loading
    this._scene.time.delayedCall(1000, () => {
      this._loadCar(() => {
        // Travel right
        soundManager.playCarDispatch();
        this._scene.tweens.add({
          targets: this._car,
          x: this._carEndX,
          duration: 2000,
          ease: 'Linear',
          onUpdate: () => {
            this._carText.x = this._car.x;
          },
          onComplete: () => {
            soundManager.playCarArrive();
            // Wait 1 second then unload
            this._scene.time.delayedCall(1000, () => {
              this._unloadCar(() => {
                // Return car left
                this._scene.tweens.add({
                  targets: this._car,
                  x: this._carStartX,
                  duration: 2000,
                  ease: 'Linear',
                  onUpdate: () => { this._carText.x = this._car.x; },
                  onComplete: () => {
                    this._carState.state = 'idle';
                    this._scene.time.delayedCall(500, () => this._dispatchCar());
                  }
                });
              });
            });
          }
        });
      });
    });
  }

  _loadCar(onComplete) {
    const ops = gameState.activeOps;
    const capacity = this._carState.capacity;
    const available = Math.min(ops.rawHopper, capacity);
    if (available <= 0) { onComplete(); return; }

    this._carState.state = 'loading';
    const duration = 3000;
    const steps = 30;
    const stepDuration = duration / steps;
    const stepAmount = available / steps;
    let loaded = 0;

    const loadStep = () => {
      if (loaded >= steps) {
        ops.rawHopper = Math.max(0, ops.rawHopper - available);
        this._carState.contents = available;
        this._carText.setText(formatUnits(available));
        if (this._hopperTexts.raw) this._hopperTexts.raw.setText(formatUnits(ops.rawHopper));
        onComplete();
        return;
      }
      loaded++;
      this._carState.contents = stepAmount * loaded;
      ops.rawHopper = Math.max(0, ops.rawHopper - stepAmount);
      this._carText.setText(formatUnits(this._carState.contents));
      if (this._hopperTexts.raw) this._hopperTexts.raw.setText(formatUnits(ops.rawHopper));

      // Colored particle loading into car
      const color = RAW_ORE_COLORS[Math.floor(Math.random() * RAW_ORE_COLORS.length)];
      const px = this._car.x + (Math.random() - 0.5) * CAR_WIDTH * 0.8;
      const py = this._car.y;
      const ptcl = this._scene.add.graphics();
      ptcl.fillStyle(color, 1);
      ptcl.fillRect(-2, -2, 5, 5);
      ptcl.x = px;
      ptcl.y = py - 15;
      this._scene.tweens.add({
        targets: ptcl,
        y: py,
        alpha: 0,
        duration: 300,
        onComplete: () => ptcl.destroy(),
      });

      soundManager.playParticleLoad();
      this._scene.time.delayedCall(stepDuration, loadStep);
    };

    loadStep();
  }

  _unloadCar(onComplete) {
    const ops = gameState.activeOps;
    const amount = this._carState.contents;
    const steps = 30;
    const stepDuration = 3000 / steps;
    const stepAmount = amount / steps;
    let unloaded = 0;

    this._carState.state = 'unloading';

    const unloadStep = () => {
      if (unloaded >= steps) {
        ops.refinerInputHopper += amount;
        this._carState.contents = 0;
        this._carText.setText('0.00');
        if (this._hopperTexts.ref) this._hopperTexts.ref.setText(formatUnits(ops.refinerInputHopper));
        onComplete();
        return;
      }
      unloaded++;
      this._carState.contents = Math.max(0, amount - stepAmount * unloaded);
      ops.refinerInputHopper += stepAmount;
      this._carText.setText(formatUnits(this._carState.contents));
      if (this._hopperTexts.ref) this._hopperTexts.ref.setText(formatUnits(ops.refinerInputHopper));

      soundManager.playParticleLoad();
      this._scene.time.delayedCall(stepDuration, unloadStep);
    };

    unloadStep();
  }

  // ── Tube State Machine ────────────────────────────────────────────────────────

  _dispatchTube() {
    const ops = gameState.activeOps;
    if (!ops) { this._scene.time.delayedCall(1000, () => this._dispatchTube()); return; }

    if (ops.warehouseHopper <= 0 || this._tubeState.state !== 'idle') {
      this._scene.time.delayedCall(500, () => this._dispatchTube());
      return;
    }

    const capacity = this._tubeState.capacity;
    const toSend = Math.min(ops.warehouseHopper, capacity);
    ops.warehouseHopper -= toSend;
    this._tubeState.contents = toSend;
    this._tubeState.state = 'traveling';

    if (this._hopperTexts.warehouse) {
      this._hopperTexts.warehouse.setText(formatUnits(ops.warehouseHopper));
    }

    // Show canister
    this._canister.clear();
    this._canister.fillStyle(0x7b2fff, 1);
    this._canister.fillRect(-10, -8, 20, 16);
    this._canister.lineStyle(2, 0xbc8cff, 1);
    this._canister.strokeRect(-10, -8, 20, 16);
    this._canister.x = this._tubeStartX;
    this._canister.y = this._tubeY;
    this._canister.visible = true;

    soundManager.playTubeLaunch();

    // Travel right through tube
    this._scene.tweens.add({
      targets: this._canister,
      x: this._tubeEndX + 20,
      duration: 1500,
      ease: 'Linear',
      onComplete: () => {
        this._canister.visible = false;

        // Sell!
        const el = gameState.activeElement;
        const credits = gameState.sellRefined(toSend, el);
        soundManager.playSell();

        ops.totalSold += toSend;
        gameState.addPrestigePoints(toSend, el.atomicNumber);

        this._tubeState.contents = 0;
        this._tubeState.state = 'idle';

        this._scene.time.delayedCall(500, () => this._dispatchTube());
      }
    });
  }

  // ── Refiner Transport (stub — Phase 2) ───────────────────────────────────────

  _startRefinerTransport() {
    // Will be implemented in Phase 2
    // Refiner processes ore → refined product → refiner lift → warehouse hopper
  }

  // ── Simple Harvester Progress Bar Updates (called from GameScene.update) ─────

  update(delta) {
    const ops = gameState.activeOps;
    if (!ops) return;

    // Update hopper text labels
    if (this._hopperTexts.raw) {
      this._hopperTexts.raw.setText(formatUnits(ops.rawHopper));
    }
    if (this._hopperTexts.ref) {
      this._hopperTexts.ref.setText(formatUnits(ops.refinerInputHopper));
    }
    if (this._hopperTexts.warehouse) {
      this._hopperTexts.warehouse.setText(formatUnits(ops.warehouseHopper));
    }

    // Drive harvester mining animations via DOM progress bars
    ops.harvesters.forEach(h => this._tickHarvester(h, delta));

    // Drive refiner animations
    ops.refiners.forEach(r => this._tickRefiner(r, delta));
  }

  _tickHarvester(harvester, delta) {
    const progBar = document.getElementById(`hprog-${harvester.purchaseOrder}`);
    const progLabel = document.getElementById(`hprog-label-${harvester.purchaseOrder}`);
    const statusEl = document.getElementById(`hstatus-${harvester.purchaseOrder}`);
    if (!progBar) return;

    const production = harvester.baseProduction * gameState.prestigeMultiplier;

    switch (harvester.state) {
      case 'idle':
        harvester.state = 'mining';
        harvester.progress = 0;
        harvester._stateTimer = 0;
        break;

      case 'mining': {
        const rate = 1 / (3000); // fills in 3 seconds
        harvester.progress = Math.min(1, harvester.progress + (delta * rate));
        progBar.style.width = (harvester.progress * 100) + '%';
        if (progLabel) progLabel.textContent = 'Mining...';
        if (statusEl) { statusEl.textContent = 'Mining ore...'; statusEl.className = 'status-text active'; }

        if (harvester.progress >= 1) {
          harvester.state = 'pause_full';
          harvester._stateTimer = 0;
          soundManager.playMiningTick();
        }
        break;
      }

      case 'pause_full':
        harvester._stateTimer = (harvester._stateTimer || 0) + delta;
        if (progLabel) progLabel.textContent = 'Full';
        if (statusEl) { statusEl.textContent = 'Loading hopper...'; statusEl.className = 'status-text loading'; }
        if (harvester._stateTimer >= 1000) {
          // Load ore into hopper
          harvester.hopper += production;
          const hopperEl = document.getElementById(`hhopper-${harvester.purchaseOrder}`);
          if (hopperEl) hopperEl.textContent = formatUnits(harvester.hopper);
          soundManager.playHopperLoad();
          harvester.state = 'pause_loaded';
          harvester._stateTimer = 0;
        }
        break;

      case 'pause_loaded':
        harvester._stateTimer = (harvester._stateTimer || 0) + delta;
        if (harvester._stateTimer >= 1000) {
          harvester.state = 'returning';
          harvester._stateTimer = 0;
        }
        break;

      case 'returning': {
        const rate = 1 / 300; // rapid return in 0.3 seconds
        harvester.progress = Math.max(0, harvester.progress - (delta * rate));
        progBar.style.width = (harvester.progress * 100) + '%';
        if (progLabel) progLabel.textContent = 'Resetting';
        if (statusEl) { statusEl.textContent = 'Resetting...'; statusEl.className = 'status-text'; }
        if (harvester.progress <= 0) {
          soundManager.playBarReset();
          harvester.state = 'pause_reset';
          harvester._stateTimer = 0;
        }
        break;
      }

      case 'pause_reset':
        harvester._stateTimer = (harvester._stateTimer || 0) + delta;
        if (harvester._stateTimer >= 1000) {
          harvester.state = 'mining';
          harvester.progress = 0;
        }
        break;
    }
  }

  _tickRefiner(refiner, delta) {
    const progBar = document.getElementById(`rprog-${refiner.purchaseOrder}`);
    const progLabel = document.getElementById(`rprog-label-${refiner.purchaseOrder}`);
    const statusEl = document.getElementById(`rstatus-${refiner.purchaseOrder}`);
    if (!progBar) return;

    const ops = gameState.activeOps;
    const production = refiner.baseProduction * gameState.prestigeMultiplier;

    switch (refiner.state) {
      case 'idle':
        if (ops.refinerInputHopper >= production) {
          refiner.state = 'refining';
          refiner.progress = 0;
          refiner._stateTimer = 0;
          if (statusEl) { statusEl.textContent = 'Refining ore...'; statusEl.className = 'status-text active'; }
        } else {
          if (statusEl) { statusEl.textContent = 'Waiting for ore...'; statusEl.className = 'status-text idle'; }
          if (progLabel) progLabel.textContent = 'Idle';
        }
        break;

      case 'refining': {
        const rate = 1 / 3000;
        refiner.progress = Math.min(1, refiner.progress + (delta * rate));
        progBar.style.width = (refiner.progress * 100) + '%';
        if (progLabel) progLabel.textContent = 'Refining...';

        if (refiner.progress >= 1) {
          refiner.state = 'pause_full';
          refiner._stateTimer = 0;
          soundManager.playHopperLoad();
        }
        break;
      }

      case 'pause_full':
        refiner._stateTimer = (refiner._stateTimer || 0) + delta;
        if (progLabel) progLabel.textContent = 'Complete';
        if (refiner._stateTimer >= 1000) {
          // Consume input, produce output
          ops.refinerInputHopper = Math.max(0, ops.refinerInputHopper - production);
          refiner.outputHopper += production;
          // Move to warehouse hopper directly (Phase 1 — refiner lift is Phase 2)
          ops.warehouseHopper += production;
          refiner.outputHopper = 0;
          ops.totalRefined += production;
          gameState.addPrestigePoints(production, gameState.activeElement?.atomicNumber || 1);

          refiner.state = 'pause_loaded';
          refiner._stateTimer = 0;
        }
        break;

      case 'pause_loaded':
        refiner._stateTimer = (refiner._stateTimer || 0) + delta;
        if (refiner._stateTimer >= 1000) {
          refiner.state = 'returning';
        }
        break;

      case 'returning': {
        const rate = 1 / 300;
        refiner.progress = Math.max(0, refiner.progress - (delta * rate));
        progBar.style.width = (refiner.progress * 100) + '%';
        if (progLabel) progLabel.textContent = 'Resetting';
        if (refiner.progress <= 0) {
          refiner.state = 'pause_reset';
          refiner._stateTimer = 0;
        }
        break;
      }

      case 'pause_reset':
        refiner._stateTimer = (refiner._stateTimer || 0) + delta;
        if (refiner._stateTimer >= 1000) {
          refiner.state = 'idle';
        }
        break;
    }
  }

  // ── Event Hooks ───────────────────────────────────────────────────────────────

  onHarvesterAdded(harvester) {
    this._buildLiftForHarvester(harvester.purchaseOrder);
    this._scene.time.delayedCall(500, () => this._dispatchHarvesterLift(harvester.purchaseOrder));
  }

  onRefinerAdded(refiner) {
    // Phase 2: add refiner lift
  }

  rebuild() {
    // Called on element switch / prestige
    this._graphics?.clear();
    this._lifts.forEach(l => { l.container.destroy(); l.countText.destroy(); });
    this._lifts.clear();
    if (this._car) this._car.destroy();
    if (this._carText) this._carText.destroy();
    if (this._canister) this._canister.destroy();

    Object.values(this._hopperTexts).forEach(t => t?.destroy());
    this._hopperTexts = {};

    this.build();
  }

  onResize() {
    const canvas = document.getElementById('transport-canvas-container');
    if (!canvas) return;
    this._width = canvas.clientWidth;
    this._height = canvas.clientHeight;
    this.rebuild();
  }

  destroy() {
    this._graphics?.destroy();
    this._lifts.forEach(l => { l.container?.destroy(); l.countText?.destroy(); });
    if (this._car) this._car.destroy();
    if (this._carText) this._carText.destroy();
    if (this._canister) this._canister.destroy();
  }
}
