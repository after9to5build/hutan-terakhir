// Relawan warga (Masyarakat Peduli Api): sesekali datang bawa ember ke api
// yang jauh dari pemain, nyiram sampai padam, lalu pulang. Bantuan kecil tapi nyata.
import * as THREE from 'three';
import { STATE, HALF, clamp } from './config.js';
import { groundHeight } from './world.js';
import { POSKO } from './map.js';
import { Particles, makeSoftTexture } from './particles.js';
import { makeChar, attachToBone, aimBone, recolorMaterial } from './characters.js';
import { makeBucket } from './props.js';

const WALK = 3.4;
const SPLASH_RANGE = 4.6; // jarak lempar air dari ember
const SPLASH_EVERY = 1.1; // detik antar siraman
const SPLASH_POWER = 0.16; // panas api yang berkurang per siraman
const STAY = 55; // detik maksimal di lokasi sebelum pulang

const SHIRTS = [0x2f6fb3, 0x3f8a4a, 0xc23b22, 0xe0a020, 0x8a4fa8];
const skin = new THREE.MeshStandardMaterial({ color: 0x9a6a46, roughness: 0.8 });
const pantsM = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 });
const hatM = new THREE.MeshStandardMaterial({ color: 0xc9a861, roughness: 0.9 });

// Model Meshy relawan (ASET-MESHY.md #12b): 1 model kaos biru, warna kaos beda-beda lewat kode.
// Diam pinjam dari presiden, jalan dari file relawan sendiri.
const RELAWAN_CLIPS = { idle: ['presiden', 'Idle_9'], walk: ['relawan', 'Walking'] };
const SHIRT_HUE = 0.58; // hue kaos biru di tekstur model

function buildMeshyVillager(i) {
  const ch = makeChar('relawan', { height: 1.9, clips: RELAWAN_CLIPS });
  if (!ch) return null;
  // warna kaos: yang pertama biru asli, sisanya diganti hue-nya
  const shirt = new THREE.Color(SHIRTS[i % SHIRTS.length]);
  const hsl = {};
  shirt.getHSL(hsl);
  if (i % SHIRTS.length !== 0) {
    ch.model.traverse((o) => { if (o.isMesh) o.material = recolorMaterial(o.material, `kaos${i % SHIRTS.length}`, SHIRT_HUE, hsl.h); });
  }
  // tanpa topi (keputusan user 31 Okt 2026: topi kode kelihatan aneh di model Meshy)
  ch.group.updateMatrixWorld(true);
  // ember digantung di tangan kanan
  const bucket = makeBucket(0x2c7fc0);
  bucket.position.copy(ch.bones.RightHand.getWorldPosition(new THREE.Vector3())).y -= 0.2;
  ch.group.add(bucket);
  attachToBone(ch, 'RightHand', bucket);
  ch.play('idle', 0);
  const dummy = () => new THREE.Object3D();
  return { group: ch.group, legs: [dummy(), dummy()], arms: [dummy(), dummy()], bucket, ch };
}

function buildVillager(i) {
  const meshy = buildMeshyVillager(i);
  if (meshy) return meshy;
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[i % SHIRTS.length], roughness: 0.85 });
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const legs = [-0.11, 0.11].map((x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.85, 0);
    g.add(p);
    add(new THREE.CapsuleGeometry(0.09, 0.58, 4, 8), pantsM, 0, -0.4, 0, p);
    return p;
  });
  add(new THREE.CapsuleGeometry(0.24, 0.42, 6, 10), shirt, 0, 1.25, 0);
  add(new THREE.SphereGeometry(0.18, 12, 10), skin, 0, 1.8, 0);
  if (i % 2 === 0) add(new THREE.ConeGeometry(0.42, 0.22, 14), hatM, 0, 2.0, 0); // caping
  else add(new THREE.CylinderGeometry(0.17, 0.18, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x1d1d1d }), 0, 1.95, 0); // peci
  const arms = [-1, 1].map((side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.3, 1.5, 0);
    g.add(p);
    add(new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), shirt, 0, -0.24, 0, p);
    return p;
  });
  // ember di tangan kanan
  const bucket = makeBucket(0x2c7fc0);
  bucket.position.set(0, -0.58, 0.05);
  arms[1].add(bucket);
  return { group: g, legs, arms, bucket };
}

export class Volunteers {
  constructor(scene, world, fire, schedule = []) {
    this.scene = scene;
    this.world = world;
    this.fire = fire;
    this.schedule = schedule.map((at) => ({ at, done: false }));
    this.list = [];
    this.events = [];
    this.saved = 0;
    this.crew = null; // rombongan yang lagi aktif
    this.made = 0; // jumlah relawan yang pernah dibikin
    this.drops = new Particles(400, { map: makeSoftTexture('smoke'), gravity: -9, drag: 0.1 });
    scene.add(this.drops.points);
  }

  get active() {
    return this.list.filter((v) => v.alive);
  }

  // Api yang paling jauh dari pemain (pemain gak bisa ke sana)
  pickFire(player) {
    let best = null, bd = 25;
    for (const t of this.fire.burning) {
      const d = Math.hypot(t.cx - player.pos.x, t.cz - player.pos.z);
      if (d > bd) { bd = d; best = t; }
    }
    return best;
  }

  call(player) {
    const target = this.pickFire(player);
    if (!target) return false;
    // datang dari arah posko (kampung), 20 m dari api
    const dx = POSKO.x - target.cx, dz = POSKO.z - target.cz;
    const l = Math.hypot(dx, dz) || 1;
    const sx = clamp(target.cx + (dx / l) * 20, -HALF + 3, HALF - 3);
    const sz = clamp(target.cz + (dz / l) * 20, -HALF + 3, HALF - 3);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const b = buildVillager(this.made++); // nomor urut: warna kaos gantian
      const pos = new THREE.Vector3(sx + (i - 1) * 1.4, 0, sz + (Math.random() - 0.5) * 1.5);
      b.group.position.copy(pos);
      this.scene.add(b.group);
      this.list.push({
        ...b, pos, home: pos.clone(), alive: true, state: 'go', target, t: 0,
        splashT: Math.random() * SPLASH_EVERY, phase: Math.random() * 6, swing: 0, stuckT: 0, side: Math.random() < 0.5 ? 1 : -1,
      });
    }
    this.crew = { x: target.cx, z: target.cz, t: 0, saved: 0 };
    this.events.push({ type: 'arrive', x: target.cx, z: target.cz });
    return true;
  }

  // Api terdekat dari titik (buat relawan pindah sasaran)
  nextFire(x, z, range) {
    let best = null, bd = range;
    for (const t of this.fire.burning) {
      const d = Math.hypot(t.cx - x, t.cz - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  leaveAll(reason) {
    if (!this.crew) return;
    for (const v of this.active) v.state = 'home';
    this.events.push({ type: 'leave', saved: this.crew.saved, reason });
    this.crew = null;
  }

  update(dt, elapsed, player, playing) {
    // jadwal kedatangan
    if (playing) {
      for (const s of this.schedule) {
        if (s.done || elapsed < s.at || this.crew) continue;
        if (this.call(player)) s.done = true;
        else s.at = elapsed + 8; // belum ada api jauh: coba lagi nanti
      }
    } else if (this.crew) this.leaveAll('rain');

    if (this.crew) {
      this.crew.t += dt;
      if (this.crew.t > STAY) this.leaveAll('time');
    }

    for (const v of this.list) {
      if (!v.alive) continue;
      let goal = null;
      if (v.state === 'home') goal = v.home;
      else {
        if (!v.target || v.target.state !== STATE.BURNING) {
          const c = this.crew;
          v.target = c ? this.nextFire(v.pos.x, v.pos.z, 16) : null;
          if (!v.target && c && this.active.every((o) => o.state === 'home' || !o.target || o.target.state !== STATE.BURNING)) {
            this.leaveAll('done');
          }
          if (!v.target) { v.state = 'home'; continue; }
        }
        goal = new THREE.Vector3(v.target.cx, 0, v.target.cz);
      }
      const dx = goal.x - v.pos.x, dz = goal.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      const stopAt = v.state === 'home' ? 1 : SPLASH_RANGE - 1;
      let moving = false;
      if (d > stopAt) {
        // nyangkut pohon: belok ke samping dulu biar bisa muter
        let mx = dx / d, mz = dz / d;
        if (v.stuckT > 0.5) {
          const side = v.side;
          const k = Math.min(1, (v.stuckT - 0.5) * 2);
          mx = mx * (1 - k) - (dz / d) * side * k;
          mz = mz * (1 - k) + (dx / d) * side * k;
        }
        const bx = v.pos.x, bz = v.pos.z;
        v.pos.x += mx * WALK * dt;
        v.pos.z += mz * WALK * dt;
        this.world.collide(v.pos, 0.35);
        const goalBefore = Math.hypot(goal.x - bx, goal.z - bz);
        const goalAfter = Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z);
        v.stuckT = goalBefore - goalAfter < WALK * dt * 0.3 ? v.stuckT + dt : Math.max(0, v.stuckT - dt * 2);
        if (v.stuckT > 2.5) v.stuckT = 0; // kelamaan: coba arah lurus lagi
        moving = true;
      }
      v.group.rotation.y = Math.atan2(dx, dz);
      v.pos.y = groundHeight(v.pos.x, v.pos.z);
      v.group.position.copy(v.pos);

      // animasi jalan
      v.phase += dt * (moving ? 9 : 0);
      const sw = moving ? Math.sin(v.phase) * 0.6 : 0;
      v.legs[0].rotation.x = sw;
      v.legs[1].rotation.x = -sw;
      v.arms[0].rotation.x = -sw * 0.7;

      // siram pakai ember
      v.swing = Math.max(0, v.swing - dt * 3);
      // kalau mentok, lempar air dari agak jauh
      if (v.state !== 'home' && d < (v.stuckT > 0.8 ? SPLASH_RANGE + 2.5 : SPLASH_RANGE)) {
        v.splashT -= dt;
        if (v.splashT <= 0) {
          v.splashT = SPLASH_EVERY;
          v.swing = 1;
          this.splash(v);
        }
      }
      v.arms[1].rotation.x = v.state === 'home' ? sw * 0.5 : -0.3 - v.swing * 1.6;
      if (v.ch) {
        v.ch.play(moving ? 'walk' : 'idle', 0.2, moving ? WALK / 2.2 : 1);
        v.ch.mixer.update(dt);
        // nyiram: lengan kanan diayun ke depan-atas
        if (v.swing > 0.01) {
          const yaw = v.group.rotation.y;
          const dir = new THREE.Vector3(Math.sin(yaw), 0.55, Math.cos(yaw)).normalize();
          aimBone(v.ch.bones.RightArm, v.ch.bones.RightForeArm, dir, v.swing);
          aimBone(v.ch.bones.RightForeArm, v.ch.bones.RightHand, dir, v.swing);
        }
      }

      if (v.state === 'home' && d <= 1.2) {
        v.alive = false;
        this.scene.remove(v.group);
      }
    }
    this.list = this.list.filter((v) => v.alive);
    this.drops.update(dt);
  }

  splash(v) {
    const t = v.target;
    const gy = groundHeight(t.cx, t.cz);
    // percikan air dari ember ke arah api
    const hx = v.pos.x, hz = v.pos.z, hy = v.pos.y + 1.4;
    const tx = t.cx - hx, tz = t.cz - hz;
    for (let i = 0; i < 14; i++) {
      const k = 0.75 + Math.random() * 0.45;
      this.drops.spawn(hx, hy, hz, tx * k + (Math.random() - 0.5) * 1.5, 3.5 + Math.random() * 1.5, tz * k + (Math.random() - 0.5) * 1.5,
        0.8, 0.35, 0.15, [0.75, 0.88, 1.0], [0.6, 0.75, 0.9], 0.75);
    }
    // semua api kecil di sekitar sasaran ikut kena
    for (const n of [t, ...this.world.neighbors(t)]) {
      if (n.state !== STATE.BURNING) continue;
      if (Math.hypot(n.cx - t.cx, n.cz - t.cz) > 4.5) continue;
      if (this.fire.water(n, n === t ? SPLASH_POWER : SPLASH_POWER * 0.5)) {
        this.saved++;
        if (this.crew) this.crew.saved++;
      }
    }
    this.fire.smoke.spawn(t.cx, gy + 1, t.cz, 0, 2, 0, 1.6, 1.5, 4, [0.9, 0.9, 0.9], [0.7, 0.7, 0.7], 0.35);
  }
}
