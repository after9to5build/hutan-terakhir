import * as THREE from 'three';
import { STATE, TYPE, T } from './config.js';
import { groundHeight } from './world.js';
import { Particles, makeSoftTexture, makeFlameAtlas } from './particles.js';

// Angka-angka penyeimbang permainan
const GROW = 0.05; // seberapa cepat api membesar per detik
const FULL_BURN = 7; // detik di api maksimal sebelum petak habis terbakar
const SPREAD = 0.022; // peluang menjalar ke petak sebelah, per tick
const TICK = 0.25;

const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Fire {
  constructor(world, scene) {
    this.world = world;
    this.burning = new Set();
    this.tickT = 0;
    this.spreadMult = 1;

    const soft = makeSoftTexture('flame');
    this.flames = new Particles(4000, { map: makeFlameAtlas(), additive: true, gravity: 2.5, drag: 0.8, atlas: true });
    this.glow = new Particles(700, { map: soft, additive: true, gravity: 0.3, drag: 0.5 }); // cahaya lembut di dasar api
    this.glow.points.renderOrder = 2;
    scene.add(this.glow.points);
    this.embers = new Particles(500, { map: soft, additive: true, gravity: 0.8, drag: 0.15 });
    this.smoke = new Particles(1200, { map: makeSoftTexture('smoke'), gravity: 0.5, drag: 0.25 });
    this.smoke.points.renderOrder = 1;
    this.flames.points.renderOrder = 2;
    this.embers.points.renderOrder = 3;
    scene.add(this.smoke.points, this.flames.points, this.embers.points);

    this.light = new THREE.PointLight(0xff7a2a, 0, 50, 1.3);
    this.light.position.set(0, 3, 0);
    scene.add(this.light);
    this.lightPos = new THREE.Vector3();
  }

  get systems() {
    return [this.flames, this.glow, this.embers, this.smoke];
  }

  ignite(tile, heat = 0.12) {
    if (!tile || !tile.burnable || tile.state !== STATE.FOREST) return false;
    // gambut basah (kanal disekat): kebanyakan gagal nyala, kecuali api gede banget
    if (tile.wet && heat < 0.5 && Math.random() < 0.7) return false;
    tile.state = STATE.BURNING;
    tile.heat = heat;
    tile.full = 0;
    this.burning.add(tile);
    return true;
  }

  // Siram petak. Balikin true kalau apinya padam.
  water(tile, amount) {
    if (!tile || tile.state !== STATE.BURNING) return false;
    tile.heat -= amount;
    if (Math.random() < 0.3) {
      const gy = groundHeight(tile.cx, tile.cz);
      this.smoke.spawn(tile.cx + rnd(1.5), gy + 1, tile.cz + rnd(1.5), rnd(0.3), 2, rnd(0.3), 2, 1.5, 5,
        [0.85, 0.85, 0.85], [0.6, 0.6, 0.6], 0.35);
    }
    if (tile.heat <= 0) {
      tile.state = STATE.FOREST;
      tile.heat = 0;
      tile.full = 0;
      this.burning.delete(tile);
      this.world.restore(tile);
      return true;
    }
    return false;
  }

  update(dt, focus) {
    const w = this.world;
    let lightN = 0;
    this.lightPos.set(0, 0, 0);

    for (const t of this.burning) {
      const peat = t.type === TYPE.PEAT;
      t.heat = Math.min(1, t.heat + GROW * (t.wet ? 0.5 : peat ? 1.5 : 1) * dt);
      if (t.heat >= 1) {
        t.full += dt;
        if (t.full > FULL_BURN) {
          this.burning.delete(t);
          w.setBurnt(t);
          continue;
        }
      }
      w.setBurnVisual(t, t.heat);

      const gy = groundHeight(t.cx, t.cz);
      // Api di tanah + api naik ke kanopi saat makin besar
      t.emitF += (10 + 42 * t.heat) * dt;
      while (t.emitF >= 1) {
        t.emitF--;
        const crown = t.heat > 0.55 && Math.random() < 0.35;
        const y = crown ? gy + 4 + Math.random() * 9 * t.heat : gy + 0.2;
        const s = (crown ? 2.0 : 1.0) + t.heat * 1.7;
        // lidah api: inti kuning-putih → oranye → merah tua, mengecil sambil naik
        this.flames.spawn(t.cx + rnd(T * 0.45), y, t.cz + rnd(T * 0.45), rnd(0.4), 1.2 + t.heat * 2.5, rnd(0.4),
          0.4 + Math.random() * 0.5, s, s * 0.45, [2.1, 0.95, 0.2], [1.2, 0.16, 0.02], 0.55);
      }
      if (Math.random() < dt * (2 + 3 * t.heat)) {
        const s = 5 + t.heat * 5;
        this.glow.spawn(t.cx + rnd(1.4), gy + 0.8 + t.heat, t.cz + rnd(1.4), 0, 0.4, 0, 0.9 + Math.random() * 0.5, s, s * 1.2, [0.9, 0.33, 0.06], [0.5, 0.12, 0.02], 0.22);
      }
      t.emitS += (1 + 2.2 * t.heat) * dt;
      while (t.emitS >= 1) {
        t.emitS--;
        const g = 0.12 + Math.random() * 0.08;
        this.smoke.spawn(t.cx + rnd(1.5), gy + 2 + t.heat * 6, t.cz + rnd(1.5), 0.8 + rnd(0.4), 2.2 + Math.random() * 1.5, 0.3 + rnd(0.3),
          5 + Math.random() * 3, 3, 13, [g, g * 0.95, g * 0.9], [0.42, 0.4, 0.38], 0.5);
      }
      if (Math.random() < dt * 6 * t.heat) {
        this.embers.spawn(t.cx + rnd(1.5), gy + 1 + Math.random() * 6, t.cz + rnd(1.5), rnd(1.5), 2 + Math.random() * 3, rnd(1.5),
          1.5 + Math.random() * 1.5, 0.25, 0.08, [4, 1.4, 0.2], [2.4, 0.4, 0.05], 1);
      }

      const dx = t.cx - focus.x, dz = t.cz - focus.z;
      if (dx * dx + dz * dz < 40 * 40) {
        this.lightPos.x += t.cx * t.heat;
        this.lightPos.z += t.cz * t.heat;
        lightN += t.heat;
      }
    }

    // Api menjalar
    this.tickT += dt;
    while (this.tickT >= TICK) {
      this.tickT -= TICK;
      const spreading = [...this.burning];
      for (const t of spreading) {
        if (t.heat < 0.3) continue;
        for (const n of w.neighbors(t)) {
          // gambut kering bikin api menjalar 2x lebih cepat, gambut basah jauh lebih lambat
          const mult = n.wet ? 0.25 : n.type === TYPE.PEAT ? 2 : 1;
          if (n.state === STATE.FOREST && n.burnable && Math.random() < SPREAD * t.heat * this.spreadMult * mult) this.ignite(n, 0.08);
        }
      }
    }

    // Bekas terbakar masih berasap tipis
    for (const t of w.burntTiles) {
      if (Math.random() < dt * 0.35) {
        const gy = groundHeight(t.cx, t.cz);
        this.smoke.spawn(t.cx + rnd(1.5), gy + 0.5, t.cz + rnd(1.5), 0.4, 1.2, 0.2, 5, 1.5, 6, [0.25, 0.24, 0.23], [0.4, 0.4, 0.4], 0.25);
      }
    }

    for (const s of this.systems) s.update(dt);

    // Cahaya oranye dari kobaran terdekat
    if (lightN > 0) {
      this.lightPos.divideScalar(lightN);
      this.light.position.lerp(new THREE.Vector3(this.lightPos.x, groundHeight(this.lightPos.x, this.lightPos.z) + 4, this.lightPos.z), 0.1);
    }
    const target = Math.min(1, lightN / 5) * 260 * (0.85 + Math.random() * 0.3);
    this.light.intensity += (target - this.light.intensity) * 0.2;
  }
}
