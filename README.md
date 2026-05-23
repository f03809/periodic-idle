# ⚗ Periodic Idle

**A scientific sci-fi idle game based on the periodic table of elements.**

Harvest raw elemental ore, refine it into isotopes, and sell them on the galactic market. Ascend through all 118 elements and prestige for massive multipliers.

---

## 🎮 Gameplay Overview

- **Harvesters** (left panel) mine raw ore in animated cycles
- **Lifts** carry ore up to the raw ore hopper
- **Mine Cars** transport ore across the top track to the refiner intake hopper
- **Refiners** (right panel) process raw ore into refined isotopes
- **Pneumatic Tubes** shoot refined product to the market terminal for instant sale
- **Credits** accumulate and unlock new harvesters, refiners, and upgrades
- **Ascend** through all 118 elements via the Periodic Table screen
- **Prestige** at any time for a permanent multiplier bonus

---

## 🔬 Element Progression

Each element produces its own isotope:
- **Hydrogen (H)** → Deuterium (²H)
- **Helium (He)** → Helium-3 (³He)
- **Lithium (Li)** → Lithium-6 (⁶Li)
- ... and so on through all 118 elements

---

## 💰 Economy Formulas

| Formula | Description |
|---------|-------------|
| `(order × atomicWeight) × 2^order` | Cost to buy next harvester/refiner |
| `unitNum × atomicWeight × 2^(level+1)` | Upgrade cost |
| `atomicWeight` (rounded to 2dp) | Credits per unit sold |
| `atomicNumber × atomicWeight × 10,000` | Element unlock cost |

---

## 🏆 Prestige System

| Tier | Points Needed | Multiplier |
|------|--------------|------------|
| 1 | 1,000 | 1.5× |
| 2 | 10,000 | 2× |
| 3 | 100,000 | 3× |
| 4 | 1,000,000 | 5× |
| 5 | 10,000,000 | 8× |
| 6 | 100,000,000 | 13× |
| 7 | 1,000,000,000 | 21× |

Prestige points = `atomic number × refined units processed`

Multipliers stack **multiplicatively** across prestiges.

---

## 🛠 Tech Stack

- **[Phaser 3](https://phaser.io/)** — game engine (animations, tweens, particles)
- **Vite** — dev server and build tool
- **Vanilla JS** — no framework overhead for UI logic
- **Web Audio API** — procedural sound effects + atmosphere

---

## 🚀 Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🗺 Roadmap

- [x] **Phase 0** — Project setup, GitHub, Phaser 3 scaffold
- [ ] **Phase 1** — Core UI: Hydrogen harvester, lift, raw hopper, mine car animations
- [ ] **Phase 2** — Refiner pipeline, refined lift, warehouse, pneumatic tube, market
- [ ] **Phase 3** — Full purchase/upgrade economy system
- [ ] **Phase 4** — Ascension, periodic table modal, prestige system
- [ ] **Phase 5** — All 4 themes, sound system, settings modal, save/load

---

## 📁 Project Structure

```
periodic-idle/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js                 # Entry point, Phaser init
│   ├── styles/
│   │   └── main.css            # All 4 themes via CSS custom properties
│   ├── data/
│   │   └── elements.js         # Periodic table data + formulas
│   ├── utils/
│   │   └── format.js           # Number notation (K, M, B... AA, AB...)
│   ├── systems/
│   │   ├── GameState.js        # Central game state + save/load
│   │   ├── SaveManager.js      # Auto-save, localStorage, cloud stubs
│   │   └── SoundManager.js     # Web Audio procedural SFX + atmosphere
│   ├── scenes/
│   │   ├── BootScene.js        # Load, save check, offline progress
│   │   └── GameScene.js        # Main game loop
│   └── ui/
│       ├── UIManager.js        # HTML overlay: panels, cards, modals
│       └── TransportRenderer.js # Phaser: lifts, car, tube, particles
└── assets/
    ├── sounds/                 # (future) audio files
    └── fonts/                  # (future) custom fonts
```

---

*Built with ⚗ and 🚀 by the Periodic Idle team.*
