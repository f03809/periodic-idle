/**
 * TransportRenderer — Phaser 3.90 scene layer managing all transport animations.
 *
 * Layout (center canvas):
 *   TOP AREA (trackY = 80):
 *     - Horizontal mine car track spans full width
 *     - Raw ore hopper (left side, above track)
 *     - Refiner intake hopper (right side, above track)
 *     - Warehouse hopper (far right)
 *     - Pneumatic tube (horizontal, mid-right)
 *
 *   LEFT LIFT SHAFT (x=60):
 *     - Harvester lift travels up/down
 *
 *   RIGHT LIFT SHAFT (x = width-60):
 *     - Refiner lift (Phase 2)
 *
 *   MINE CAR travels left↔right on track
 *   CANISTER travels right through tube → off screen
 */

import Phaser from 'phaser';
import { gameState } from '../systems/GameState.js';
import { soundManager } from '../systems/SoundManager.js';
import { formatUnits } from '../utils/format.js';

// ── Raw ore particle colors ──────────────────────────────────────────────────
const RAW_COLORS = [
  0xff6b35, 0xf7931e, 0xffcd3c, 0x8bc34a,
  0x26c6da, 0x7c4dff, 0xff4081, 0xa0522d,
  0x78909c, 0xd4e157,
];

// ── Layout constants ─────────────────────────────────────────────────────────
const TRACK_Y       = 80;   // y of the mine car track
const LIFT_W        = 34;   // lift car width
const LIFT_H        = 50;   // lift car height
const CAR_W         = 52;   // mine car width
const CAR_H         = 30;   // mine car height
const HOP_W         = 64;   // hopper width
const HOP_H         = 42;   // hopper height
const LIFT_L_X      = 60;   // x-center of left (harvester) lift shaft
const CANISTER_W    = 22;   // pneumatic canister width
const CANISTER_H    = 14;   // pneumatic canister height

export class TransportRenderer {
  constructor(scene) {
    this._scene      = scene;
    this._built      = false;

    // Graphics layers
    this._bgGfx      = null;   // static background (shafts, track, hoppers)
    this._dynGfx     = null;   // dynamic overlays (particles drawn manually)

    // Transport objects (Phaser GameObjects)
    this._liftGfx    = null;   // harvester lift rectangle
    this._liftText   = null;   // lift counter
    this._carGfx     = null;   // mine car
    this._carText    = null;
    this._canisterGfx = null;
    this._canisterText = null;

    // Hopper text labels (Phaser Text objects)
    this._rawHopperText  = null;
    this._refHopperText  = null;
    this._whHopperText   = null;

    // Layout computed values
    this._w = 0;
    this._h = 0;
    this._liftRX    = 0;   // right lift x (Phase 2)
    this._rawHopX   = 0;
    this._refHopX   = 0;
    this._whHopX    = 0;
    this._tubeStartX = 0;
    this._tubeY      = 0;
    this._carStartX  = 0;
    this._carEndX    = 0;

    // State machines
    this._liftState  = { state: 'idle', y: 0, contents: 0, capacity: 1 };
    this._carState   = { state: 'idle', x: 0, contents: 0, capacity: 1 };
    this._tubeState  = { state: 'idle', x: 0, contents: 0, capacity: 1 };
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  build() {
    const container = document.getElementById('transport-canvas-container');
    if (!container) return;

    this._w = Math.max(container.clientWidth || 400, 300);
    this._h = Math.max(container.clientHeight || 600, 400);

    this._computeLayout();
    this._createGraphics();
    this._drawStaticBackground();
    this._createMovingObjects();
    this._createTextLabels();
    this._built = true;

    // Start state machines after a short delay
    this._scene.time.delayedCall(300, () => {
      this._startLiftLoop();
      this._startCarLoop();
      this._startTubeLoop();
    });
  }

  _computeLayout() {
    const w = this._w;
    const h = this._h;

    this._liftLX    = LIFT_L_X;
    this._liftRX    = w - 60;

    // Raw hopper: just right of left lift shaft
    this._rawHopX   = this._liftLX + LIFT_W / 2 + 10 + HOP_W / 2;

    // Refiner intake hopper: just left of right lift shaft
    this._refHopX   = this._liftRX - LIFT_W / 2 - 10 - HOP_W / 2;

    // Warehouse hopper: far right, 20px gap from right edge
    this._whHopX    = w - HOP_W / 2 - 16;

    // Pneumatic tube: below warehouse hopper, goes off-screen right
    this._tubeY      = TRACK_Y + 28;
    this._tubeStartX = this._whHopX - HOP_W / 2;

    // Mine car travel range
    this._carStartX  = this._rawHopX + HOP_W / 2 + CAR_W / 2 + 6;
    this._carEndX    = this._refHopX - HOP_W / 2 - CAR_W / 2 - 6;

    // Lift travel range
    this._liftTopY    = TRACK_Y + 4;
    this._liftBottomY = h - LIFT_H / 2 - 16;

    this._liftState.y = this._liftBottomY;
    this._carState.x  = this._carStartX;
    this._tubeState.x = this._tubeStartX;
  }

  _createGraphics() {
    // Destroy old if rebuilding
    this._bgGfx?.destroy();
    this._dynGfx?.destroy();
    this._bgGfx  = this._scene.add.graphics();
    this._dynGfx = this._scene.add.graphics();
  }

  // ── Static Background ────────────────────────────────────────────────────────

  _drawStaticBackground() {
    const g   = this._bgGfx;
    const w   = this._w;
    const h   = this._h;
    const ty  = TRACK_Y;

    // ── Mine car track ─────────────────────────────────────────────────────────
    // Rail bed
    g.lineStyle(4, 0x1e2a5e, 1);
    g.beginPath(); g.moveTo(50, ty); g.lineTo(w - 50, ty); g.strokePath();
    // Rail ties
    g.lineStyle(2, 0x0f1a40, 0.8);
    for (let x = 60; x < w - 50; x += 18) {
      g.beginPath(); g.moveTo(x, ty - 7); g.lineTo(x, ty + 7); g.strokePath();
    }
    // Second rail
    g.lineStyle(2, 0x2a4adf, 0.5);
    g.beginPath(); g.moveTo(50, ty - 8); g.lineTo(w - 50, ty - 8); g.strokePath();

    // ── Left lift shaft ───────────────────────────────────────────────────────
    this._drawShaft(g, this._liftLX, ty, h, 0x1e2a5e, 0x2a4adf);

    // ── Right lift shaft (stub for Phase 2) ───────────────────────────────────
    this._drawShaft(g, this._liftRX, ty, h, 0x1e0a4e, 0x7b2fff);

    // ── Hoppers ────────────────────────────────────────────────────────────────
    this._drawHopper(g, this._rawHopX, ty - HOP_H - 4,  HOP_W, HOP_H, 0x0a1030, 0x00d4ff);
    this._drawHopper(g, this._refHopX, ty - HOP_H - 4,  HOP_W, HOP_H, 0x1a0a30, 0x7b2fff);
    this._drawHopper(g, this._whHopX,  ty - HOP_H - 4,  HOP_W, HOP_H, 0x100a28, 0x7b2fff);

    // ── Pneumatic tube ─────────────────────────────────────────────────────────
    const txS = this._tubeStartX;
    const txE = w + 10;
    const tubeY = this._tubeY;
    g.lineStyle(10, 0x0d1535, 1);
    g.beginPath(); g.moveTo(txS, tubeY); g.lineTo(txE, tubeY); g.strokePath();
    g.lineStyle(2, 0x2a4adf, 0.9);
    g.beginPath(); g.moveTo(txS, tubeY - 5); g.lineTo(txE, tubeY - 5); g.strokePath();
    g.beginPath(); g.moveTo(txS, tubeY + 5); g.lineTo(txE, tubeY + 5); g.strokePath();

    // Tube inlet funnel from warehouse hopper
    g.lineStyle(1, 0x7b2fff, 0.6);
    g.beginPath();
    g.moveTo(this._whHopX, ty - 4 + HOP_H + 12);
    g.lineTo(txS, tubeY);
    g.strokePath();

    // Market arrow at tube end
    g.lineStyle(2, 0x00ff9d, 1);
    g.beginPath(); g.moveTo(w - 22, tubeY - 10); g.lineTo(w - 6, tubeY); g.lineTo(w - 22, tubeY + 10); g.strokePath();

    // Market label area
    g.fillStyle(0x001a10, 1);
    g.fillRect(w - 6, tubeY - 12, 8, 24);
  }

  _drawShaft(g, cx, topY, bottomY, fillColor, railColor) {
    const hw = LIFT_W / 2 + 4;
    g.fillStyle(fillColor, 0.15);
    g.fillRect(cx - hw, topY, hw * 2, bottomY - topY - 10);
    g.lineStyle(1, railColor, 0.6);
    g.beginPath(); g.moveTo(cx - LIFT_W / 2, topY); g.lineTo(cx - LIFT_W / 2, bottomY - 10); g.strokePath();
    g.beginPath(); g.moveTo(cx + LIFT_W / 2, topY); g.lineTo(cx + LIFT_W / 2, bottomY - 10); g.strokePath();
  }

  _drawHopper(g, cx, topY, w, h, fillColor, borderColor) {
    g.fillStyle(fillColor, 1);
    g.fillRect(cx - w / 2, topY, w, h);
    g.lineStyle(2, borderColor, 1);
    g.strokeRect(cx - w / 2, topY, w, h);
    // Spout
    const bw = w * 0.4;
    g.fillStyle(fillColor, 1);
    g.fillTriangle(cx - bw / 2, topY + h, cx + bw / 2, topY + h, cx, topY + h + 14);
    g.lineStyle(1, borderColor, 0.8);
    g.strokeTriangle(cx - bw / 2, topY + h, cx + bw / 2, topY + h, cx, topY + h + 14);
  }

  // ── Moving Objects ────────────────────────────────────────────────────────────

  _createMovingObjects() {
    const ty = TRACK_Y;

    // ── Harvester Lift ────────────────────────────────────────────────────────
    this._liftGfx?.destroy();
    this._liftGfx = this._scene.add.graphics();
    this._drawLiftCar(this._liftGfx, 0x0d1535, 0x2a4adf);
    this._liftGfx.x = this._liftLX;
    this._liftGfx.y = this._liftBottomY;

    // ── Mine Car ──────────────────────────────────────────────────────────────
    this._carGfx?.destroy();
    this._carGfx = this._scene.add.graphics();
    this._drawMineCar(this._carGfx);
    this._carGfx.x = this._carStartX;
    this._carGfx.y = ty - CAR_H / 2 - 2;

    // ── Pneumatic Canister ────────────────────────────────────────────────────
    this._canisterGfx?.destroy();
    this._canisterGfx = this._scene.add.graphics();
    this._drawCanister(this._canisterGfx, 0);
    this._canisterGfx.x = this._tubeStartX;
    this._canisterGfx.y = this._tubeY;
    this._canisterGfx.visible = false;
  }

  _drawLiftCar(g, fillColor, borderColor) {
    g.clear();
    g.fillStyle(fillColor, 1);
    g.fillRect(-LIFT_W / 2, -LIFT_H / 2, LIFT_W, LIFT_H);
    g.lineStyle(2, borderColor, 1);
    g.strokeRect(-LIFT_W / 2, -LIFT_H / 2, LIFT_W, LIFT_H);
    // Cable
    g.lineStyle(1, borderColor, 0.5);
    g.beginPath(); g.moveTo(0, -LIFT_H / 2); g.lineTo(0, -LIFT_H / 2 - 12); g.strokePath();
  }

  _drawLiftCarFilled(g, fillColor, borderColor, fillFraction) {
    g.clear();
    // Fill background
    g.fillStyle(fillColor, 1);
    g.fillRect(-LIFT_W / 2, -LIFT_H / 2, LIFT_W, LIFT_H);
    // Fill content (bottom fills up)
    if (fillFraction > 0) {
      const fillH = LIFT_H * fillFraction;
      g.fillStyle(0x1a3a1a, 1);
      g.fillRect(-LIFT_W / 2 + 2, LIFT_H / 2 - fillH - 2, LIFT_W - 4, fillH);
    }
    g.lineStyle(2, borderColor, 1);
    g.strokeRect(-LIFT_W / 2, -LIFT_H / 2, LIFT_W, LIFT_H);
    g.lineStyle(1, borderColor, 0.5);
    g.beginPath(); g.moveTo(0, -LIFT_H / 2); g.lineTo(0, -LIFT_H / 2 - 12); g.strokePath();
  }

  _drawMineCar(g) {
    g.clear();
    g.fillStyle(0x0d1535, 1);
    g.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    g.lineStyle(2, 0x1e2a5e, 1);
    g.strokeRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    // Wheels
    g.fillStyle(0x2a4adf, 1);
    g.fillCircle(-CAR_W / 2 + 10, CAR_H / 2 + 4, 5);
    g.fillCircle(CAR_W / 2 - 10, CAR_H / 2 + 4, 5);
  }

  _drawMineCarFilled(g, fillFraction) {
    g.clear();
    g.fillStyle(0x0d1535, 1);
    g.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    if (fillFraction > 0) {
      // Draw mixed color fill (simulate ore)
      const fillH = (CAR_H - 6) * fillFraction;
      const fillW = CAR_W - 6;
      const startY = CAR_H / 2 - 3 - fillH;
      // Fill with color blocks to simulate particles
      const cols = 6;
      const rows = 4;
      const cw = fillW / cols;
      const ch = fillH / rows;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const color = RAW_COLORS[Math.floor(Math.random() * RAW_COLORS.length)];
          g.fillStyle(color, 0.85);
          g.fillRect(
            -CAR_W / 2 + 3 + col * cw,
            startY + row * ch,
            cw - 1, ch - 1
          );
        }
      }
    }
    g.lineStyle(2, 0x2a4adf, 1);
    g.strokeRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    g.fillStyle(0x2a4adf, 1);
    g.fillCircle(-CAR_W / 2 + 10, CAR_H / 2 + 4, 5);
    g.fillCircle(CAR_W / 2 - 10, CAR_H / 2 + 4, 5);
  }

  _drawCanister(g, fillFraction) {
    g.clear();
    g.fillStyle(0x1a0a40, 1);
    g.fillRect(-CANISTER_W / 2, -CANISTER_H / 2, CANISTER_W, CANISTER_H);
    if (fillFraction > 0) {
      g.fillStyle(0x7b2fff, 0.9);
      const fw = (CANISTER_W - 4) * fillFraction;
      g.fillRect(-CANISTER_W / 2 + 2, -CANISTER_H / 2 + 2, fw, CANISTER_H - 4);
    }
    g.lineStyle(2, 0x7b2fff, 1);
    g.strokeRect(-CANISTER_W / 2, -CANISTER_H / 2, CANISTER_W, CANISTER_H);
    // End caps
    g.fillStyle(0x5b1fdf, 1);
    g.fillRect(-CANISTER_W / 2 - 3, -CANISTER_H / 2, 3, CANISTER_H);
    g.fillRect(CANISTER_W / 2, -CANISTER_H / 2, 3, CANISTER_H);
  }

  // ── Text Labels ───────────────────────────────────────────────────────────────

  _createTextLabels() {
    const ty  = TRACK_Y;
    const baseStyle = { fontFamily: 'Courier New', fontSize: '10px', color: '#00d4ff' };
    const mutedStyle = { fontFamily: 'Courier New', fontSize: '8px',  color: '#3a4a7e' };
    const rightStyle = { ...baseStyle, color: '#9b4fff' };

    // Destroy old
    [this._rawHopperText, this._refHopperText, this._whHopperText,
     this._liftText, this._carText, this._canisterText].forEach(t => t?.destroy());

    // Hopper value labels
    this._rawHopperText = this._scene.add.text(this._rawHopX, ty - HOP_H - 22, '0.00', baseStyle).setOrigin(0.5);
    this._refHopperText = this._scene.add.text(this._refHopX, ty - HOP_H - 22, '0.00', rightStyle).setOrigin(0.5);
    this._whHopperText  = this._scene.add.text(this._whHopX,  ty - HOP_H - 22, '0.00', rightStyle).setOrigin(0.5);

    // Hopper name labels
    this._scene.add.text(this._rawHopX, ty - HOP_H - 34, 'RAW ORE', mutedStyle).setOrigin(0.5);
    this._scene.add.text(this._refHopX, ty - HOP_H - 34, 'INTAKE',  { ...mutedStyle, color: '#4a2a7e' }).setOrigin(0.5);
    this._scene.add.text(this._whHopX,  ty - HOP_H - 34, 'WAREH.',  { ...mutedStyle, color: '#4a2a7e' }).setOrigin(0.5);

    // Market label
    this._scene.add.text(this._w - 4, this._tubeY - 18, 'MARKET →', {
      fontFamily: 'Courier New', fontSize: '8px', color: '#00ff9d'
    }).setOrigin(1, 0.5);

    // Lift counter
    this._liftText = this._scene.add.text(this._liftLX, this._liftBottomY - LIFT_H / 2 - 8, '0.00', baseStyle).setOrigin(0.5);

    // Car counter
    this._carText = this._scene.add.text(this._carStartX, ty - CAR_H - 16, '0.00', baseStyle).setOrigin(0.5);

    // Tube/canister counter (shown near canister)
    this._canisterText = this._scene.add.text(this._tubeStartX, this._tubeY - 18, '', baseStyle).setOrigin(0.5);
    this._canisterText.visible = false;
  }

  // ── State Machine: Harvester Lift ─────────────────────────────────────────────

  _startLiftLoop() {
    this._liftLoopStep();
  }

  _liftLoopStep() {
    const ops = gameState.activeOps;
    if (!ops || !this._built) return;

    const harvester = ops.harvesters[0];
    if (!harvester) {
      this._scene.time.delayedCall(500, () => this._liftLoopStep());
      return;
    }

    // Wait until harvester has ore
    if (harvester.hopper <= 0) {
      this._scene.time.delayedCall(400, () => this._liftLoopStep());
      return;
    }

    // 1. Travel down to harvester
    this._moveLift(this._liftBottomY, 800, () => {
      // 2. Wait 1s at harvester
      this._scene.time.delayedCall(1000, () => {
        // 3. Load over 3s with particles
        this._loadLift(harvester, () => {
          // 4. Travel up to raw hopper
          soundManager.playLiftStart();
          this._moveLift(this._liftTopY, 800, () => {
            soundManager.playLiftArrive();
            // 5. Wait 1s at top
            this._scene.time.delayedCall(1000, () => {
              // 6. Unload into raw hopper over 3s
              this._unloadLift(() => {
                // 7. Loop
                this._scene.time.delayedCall(500, () => this._liftLoopStep());
              });
            });
          });
        });
      });
    });
  }

  _moveLift(targetY, speed, onComplete) {
    const dist = Math.abs(this._liftGfx.y - targetY);
    const dur  = Math.max(300, dist * speed / 600);
    this._scene.tweens.add({
      targets: this._liftGfx,
      y: targetY,
      duration: dur,
      ease: 'Linear',
      onUpdate: () => {
        this._liftText.y = this._liftGfx.y - LIFT_H / 2 - 8;
      },
      onComplete,
    });
  }

  _loadLift(harvester, onComplete) {
    const ops = gameState.activeOps;
    const capacity = this._liftState.capacity;
    const toLoad = Math.min(harvester.hopper, capacity);
    if (toLoad <= 0) { onComplete(); return; }

    const steps       = 24;
    const stepMs      = 3000 / steps;
    const stepAmount  = toLoad / steps;
    let step = 0;

    harvester.hopper -= toLoad; // deduct immediately (atomic)

    const tick = () => {
      if (!this._built) return;
      step++;
      this._liftState.contents = stepAmount * step;
      const frac = step / steps;

      // Redraw lift with fill
      this._drawLiftCarFilled(this._liftGfx, 0x0d1535, 0x2a4adf, frac);

      // Manual particle: a tiny colored square falling into the lift
      const color  = RAW_COLORS[Math.floor(Math.random() * RAW_COLORS.length)];
      const px     = this._liftGfx.x + (Math.random() - 0.5) * (LIFT_W - 8);
      const startY = this._liftGfx.y - LIFT_H / 2 - 10;
      const endY   = this._liftGfx.y + LIFT_H / 4;

      const ptGfx = this._scene.add.graphics();
      ptGfx.fillStyle(color, 1);
      ptGfx.fillRect(-3, -3, 6, 6);
      ptGfx.x = px;
      ptGfx.y = startY;
      this._scene.tweens.add({
        targets: ptGfx,
        y: endY,
        alpha: 0,
        duration: stepMs * 3,
        onComplete: () => ptGfx.destroy(),
      });

      // Update counter
      this._liftText.setText(formatUnits(this._liftState.contents));
      soundManager.playParticleLoad();

      if (step < steps) {
        this._scene.time.delayedCall(stepMs, tick);
      } else {
        this._liftState.contents = toLoad;
        onComplete();
      }
    };

    this._scene.time.delayedCall(stepMs, tick);
  }

  _unloadLift(onComplete) {
    const ops = gameState.activeOps;
    const amount = this._liftState.contents;
    if (amount <= 0) { onComplete(); return; }

    const steps      = 24;
    const stepMs     = 3000 / steps;
    const stepAmount = amount / steps;
    let step = 0;

    const tick = () => {
      if (!this._built) return;
      step++;
      this._liftState.contents = Math.max(0, amount - stepAmount * step);
      const frac = 1 - (step / steps);

      // Redraw lift emptying
      this._drawLiftCarFilled(this._liftGfx, 0x0d1535, 0x2a4adf, frac);

      // Particle rising out of lift into hopper
      const color  = RAW_COLORS[Math.floor(Math.random() * RAW_COLORS.length)];
      const px     = this._liftGfx.x + (Math.random() - 0.5) * (LIFT_W - 8);
      const startY = this._liftGfx.y;
      const endY   = this._rawHopperText.y + 10;

      const ptGfx = this._scene.add.graphics();
      ptGfx.fillStyle(color, 1);
      ptGfx.fillRect(-3, -3, 6, 6);
      ptGfx.x = px;
      ptGfx.y = startY;
      this._scene.tweens.add({
        targets: ptGfx,
        x: this._rawHopX + (Math.random() - 0.5) * HOP_W * 0.6,
        y: endY,
        alpha: 0,
        duration: stepMs * 4,
        onComplete: () => ptGfx.destroy(),
      });

      // Update raw hopper value
      ops.rawHopper += stepAmount;
      this._rawHopperText.setText(formatUnits(ops.rawHopper));
      this._liftText.setText(formatUnits(this._liftState.contents));
      soundManager.playParticleLoad();

      if (step < steps) {
        this._scene.time.delayedCall(stepMs, tick);
      } else {
        this._liftState.contents = 0;
        this._drawLiftCar(this._liftGfx, 0x0d1535, 0x2a4adf);
        this._liftText.setText('0.00');
        onComplete();
      }
    };

    this._scene.time.delayedCall(stepMs, tick);
  }

  // ── State Machine: Mine Car ───────────────────────────────────────────────────

  _startCarLoop() {
    this._scene.time.delayedCall(1000, () => this._carLoopStep());
  }

  _carLoopStep() {
    const ops = gameState.activeOps;
    if (!ops || !this._built) return;

    if (ops.rawHopper <= 0 || this._carState.state !== 'idle') {
      this._scene.time.delayedCall(400, () => this._carLoopStep());
      return;
    }

    // Wait 1s before loading
    this._scene.time.delayedCall(1000, () => {
      this._loadCar(() => {
        soundManager.playCarDispatch();
        // Travel right
        const travelDur = 2200;
        this._carState.state = 'traveling';
        this._scene.tweens.add({
          targets: this._carGfx,
          x: this._carEndX,
          duration: travelDur,
          ease: 'Linear',
          onUpdate: () => {
            this._carText.x = this._carGfx.x;
          },
          onComplete: () => {
            soundManager.playCarArrive();
            this._carState.state = 'unloading';
            this._scene.time.delayedCall(1000, () => {
              this._unloadCar(() => {
                // Return left
                this._carState.state = 'returning';
                this._scene.tweens.add({
                  targets: this._carGfx,
                  x: this._carStartX,
                  duration: travelDur,
                  ease: 'Linear',
                  onUpdate: () => { this._carText.x = this._carGfx.x; },
                  onComplete: () => {
                    this._carState.state = 'idle';
                    this._scene.time.delayedCall(400, () => this._carLoopStep());
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
    const ops      = gameState.activeOps;
    const capacity = this._carState.capacity;
    const toLoad   = Math.min(ops.rawHopper, capacity);
    if (toLoad <= 0) { onComplete(); return; }

    this._carState.state = 'loading';
    ops.rawHopper -= toLoad;

    const steps      = 24;
    const stepMs     = 3000 / steps;
    const stepAmount = toLoad / steps;
    let step = 0;

    const tick = () => {
      if (!this._built) return;
      step++;
      this._carState.contents = stepAmount * step;
      const frac = step / steps;

      this._drawMineCarFilled(this._carGfx, frac);
      ops.rawHopper = Math.max(0, ops.rawHopper);

      this._rawHopperText.setText(formatUnits(ops.rawHopper));
      this._carText.setText(formatUnits(this._carState.contents));
      soundManager.playParticleLoad();

      if (step < steps) {
        this._scene.time.delayedCall(stepMs, tick);
      } else {
        this._carState.contents = toLoad;
        onComplete();
      }
    };

    this._scene.time.delayedCall(stepMs, tick);
  }

  _unloadCar(onComplete) {
    const ops    = gameState.activeOps;
    const amount = this._carState.contents;
    if (amount <= 0) { onComplete(); return; }

    const steps      = 24;
    const stepMs     = 3000 / steps;
    const stepAmount = amount / steps;
    let step = 0;

    const tick = () => {
      if (!this._built) return;
      step++;
      this._carState.contents = Math.max(0, amount - stepAmount * step);
      const frac = 1 - (step / steps);

      this._drawMineCarFilled(this._carGfx, frac);
      ops.refinerInputHopper += stepAmount;

      this._refHopperText.setText(formatUnits(ops.refinerInputHopper));
      this._carText.setText(formatUnits(this._carState.contents));
      soundManager.playParticleLoad();

      if (step < steps) {
        this._scene.time.delayedCall(stepMs, tick);
      } else {
        this._carState.contents = 0;
        this._drawMineCar(this._carGfx);
        this._carText.setText('0.00');
        onComplete();
      }
    };

    this._scene.time.delayedCall(stepMs, tick);
  }

  // ── State Machine: Pneumatic Tube ─────────────────────────────────────────────

  _startTubeLoop() {
    this._scene.time.delayedCall(1500, () => this._tubeLoopStep());
  }

  _tubeLoopStep() {
    const ops = gameState.activeOps;
    if (!ops || !this._built) return;

    if (ops.warehouseHopper <= 0 || this._tubeState.state !== 'idle') {
      this._scene.time.delayedCall(400, () => this._tubeLoopStep());
      return;
    }

    const capacity = this._tubeState.capacity;
    const toSend   = Math.min(ops.warehouseHopper, capacity);
    ops.warehouseHopper -= toSend;
    this._tubeState.contents = toSend;
    this._tubeState.state    = 'traveling';

    if (this._whHopperText) this._whHopperText.setText(formatUnits(ops.warehouseHopper));

    // Show canister
    this._drawCanister(this._canisterGfx, 1);
    this._canisterGfx.x = this._tubeStartX;
    this._canisterGfx.y = this._tubeY;
    this._canisterGfx.visible = true;
    this._canisterText.x = this._tubeStartX;
    this._canisterText.y = this._tubeY - 18;
    this._canisterText.setText(formatUnits(toSend));
    this._canisterText.visible = true;

    soundManager.playTubeLaunch();

    this._scene.tweens.add({
      targets: [this._canisterGfx, this._canisterText],
      x: this._w + 40,
      duration: 1400,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this._canisterGfx.visible  = false;
        this._canisterText.visible = false;

        // Sell
        const el      = gameState.activeElement;
        const credits = gameState.sellRefined(toSend, el);
        soundManager.playSell();
        ops.totalSold += toSend;
        gameState.addPrestigePoints(toSend, el?.atomicNumber || 1);

        this._tubeState.contents = 0;
        this._tubeState.state    = 'idle';
        this._scene.time.delayedCall(400, () => this._tubeLoopStep());
      }
    });
  }

  // ── Harvester Progress Bar (ticked from GameScene.update) ─────────────────────

  update(delta) {
    if (!this._built) return;
    const ops = gameState.activeOps;
    if (!ops) return;

    // Update all hopper labels
    if (this._rawHopperText) this._rawHopperText.setText(formatUnits(ops.rawHopper));
    if (this._refHopperText) this._refHopperText.setText(formatUnits(ops.refinerInputHopper));
    if (this._whHopperText)  this._whHopperText.setText(formatUnits(ops.warehouseHopper));

    // Drive harvester mining animations via DOM
    ops.harvesters.forEach(h => this._tickHarvester(h, delta));

    // Drive refiner animations via DOM
    ops.refiners.forEach(r => this._tickRefiner(r, delta));
  }

  _tickHarvester(h, delta) {
    const progBar  = document.getElementById(`hprog-${h.purchaseOrder}`);
    const progLbl  = document.getElementById(`hprog-label-${h.purchaseOrder}`);
    const statusEl = document.getElementById(`hstatus-${h.purchaseOrder}`);
    if (!progBar) return;

    const production = h.baseProduction * Math.pow(2, h.level - 1) * gameState.prestigeMultiplier;

    if (!h.state || h.state === 'idle') {
      h.state    = 'mining';
      h.progress = 0;
      h._timer   = 0;
    }

    switch (h.state) {
      case 'mining': {
        h.progress = Math.min(1, h.progress + delta / 3000);
        progBar.style.width = (h.progress * 100) + '%';
        if (progLbl) progLbl.textContent = 'Mining...';
        if (statusEl) { statusEl.textContent = 'Mining ore...'; statusEl.className = 'status-text active'; }
        if (h.progress >= 1) { h.state = 'pause_full'; h._timer = 0; soundManager.playMiningTick(); }
        break;
      }
      case 'pause_full': {
        h._timer = (h._timer || 0) + delta;
        if (progLbl) progLbl.textContent = 'Full';
        if (statusEl) { statusEl.textContent = 'Loading hopper...'; statusEl.className = 'status-text loading'; }
        if (h._timer >= 1000) {
          h.hopper += production;
          const hopEl = document.getElementById(`hhopper-${h.purchaseOrder}`);
          if (hopEl) hopEl.textContent = formatUnits(h.hopper);
          soundManager.playHopperLoad();
          h.state = 'pause_loaded'; h._timer = 0;
        }
        break;
      }
      case 'pause_loaded': {
        h._timer = (h._timer || 0) + delta;
        if (h._timer >= 1000) { h.state = 'returning'; h._timer = 0; }
        break;
      }
      case 'returning': {
        h.progress = Math.max(0, h.progress - delta / 300);
        progBar.style.width = (h.progress * 100) + '%';
        if (progLbl) progLbl.textContent = 'Resetting';
        if (statusEl) { statusEl.textContent = 'Resetting...'; statusEl.className = 'status-text'; }
        if (h.progress <= 0) { soundManager.playBarReset(); h.state = 'pause_reset'; h._timer = 0; }
        break;
      }
      case 'pause_reset': {
        h._timer = (h._timer || 0) + delta;
        if (h._timer >= 1000) { h.state = 'mining'; h.progress = 0; }
        break;
      }
    }
  }

  _tickRefiner(r, delta) {
    const progBar  = document.getElementById(`rprog-${r.purchaseOrder}`);
    const progLbl  = document.getElementById(`rprog-label-${r.purchaseOrder}`);
    const statusEl = document.getElementById(`rstatus-${r.purchaseOrder}`);
    if (!progBar) return;

    const ops        = gameState.activeOps;
    const production = r.baseProduction * Math.pow(2, r.level - 1) * gameState.prestigeMultiplier;

    if (!r.state || r.state === 'idle') {
      if (ops.refinerInputHopper >= production) {
        r.state = 'refining'; r.progress = 0; r._timer = 0;
        if (statusEl) { statusEl.textContent = 'Refining ore...'; statusEl.className = 'status-text active'; }
      } else {
        if (statusEl) { statusEl.textContent = 'Waiting for ore...'; statusEl.className = 'status-text idle'; }
        if (progLbl) progLbl.textContent = 'Idle';
      }
      return;
    }

    switch (r.state) {
      case 'refining': {
        r.progress = Math.min(1, r.progress + delta / 3000);
        progBar.style.width = (r.progress * 100) + '%';
        if (progLbl) progLbl.textContent = 'Refining...';
        if (r.progress >= 1) { r.state = 'pause_full'; r._timer = 0; soundManager.playHopperLoad(); }
        break;
      }
      case 'pause_full': {
        r._timer = (r._timer || 0) + delta;
        if (progLbl) progLbl.textContent = 'Complete';
        if (statusEl) { statusEl.textContent = 'Outputting...'; statusEl.className = 'status-text loading'; }
        if (r._timer >= 1000) {
          ops.refinerInputHopper = Math.max(0, ops.refinerInputHopper - production);
          ops.warehouseHopper   += production;
          ops.totalRefined      += production;
          gameState.addPrestigePoints(production, gameState.activeElement?.atomicNumber || 1);
          r.state = 'pause_loaded'; r._timer = 0;
        }
        break;
      }
      case 'pause_loaded': {
        r._timer = (r._timer || 0) + delta;
        if (r._timer >= 1000) { r.state = 'returning'; r._timer = 0; }
        break;
      }
      case 'returning': {
        r.progress = Math.max(0, r.progress - delta / 300);
        progBar.style.width = (r.progress * 100) + '%';
        if (progLbl) progLbl.textContent = 'Resetting';
        if (statusEl) { statusEl.textContent = 'Resetting...'; statusEl.className = 'status-text'; }
        if (r.progress <= 0) { r.state = 'idle'; r._timer = 0; }
        break;
      }
    }
  }

  // ── Event Hooks ────────────────────────────────────────────────────────────────

  onHarvesterAdded(harvester) {
    // Additional lifts will be wired in Phase 2
  }

  onRefinerAdded(refiner) {
    // Phase 2
  }

  // ── Rebuild / Resize / Destroy ─────────────────────────────────────────────────

  rebuild() {
    this._built = false;

    // Destroy existing objects
    this._bgGfx?.destroy();
    this._dynGfx?.destroy();
    this._liftGfx?.destroy();
    this._carGfx?.destroy();
    this._canisterGfx?.destroy();
    [this._liftText, this._carText, this._canisterText,
     this._rawHopperText, this._refHopperText, this._whHopperText].forEach(t => t?.destroy());

    // Kill all tweens to avoid stale callbacks
    this._scene.tweens.killAll();

    // Reset state
    this._liftState = { state: 'idle', y: 0, contents: 0, capacity: 1 };
    this._carState  = { state: 'idle', x: 0, contents: 0, capacity: 1 };
    this._tubeState = { state: 'idle', x: 0, contents: 0, capacity: 1 };

    this.build();
  }

  onResize() {
    const container = document.getElementById('transport-canvas-container');
    if (!container) return;
    this._w = Math.max(container.clientWidth, 300);
    this._h = Math.max(container.clientHeight, 400);
    this.rebuild();
  }

  destroy() {
    this._built = false;
    this._bgGfx?.destroy();
    this._dynGfx?.destroy();
    this._liftGfx?.destroy();
    this._carGfx?.destroy();
    this._canisterGfx?.destroy();
    [this._liftText, this._carText, this._canisterText,
     this._rawHopperText, this._refHopperText, this._whHopperText].forEach(t => t?.destroy());
  }
}
