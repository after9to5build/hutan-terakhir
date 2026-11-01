// Damkar: bantuan yang dikirim dari Peta Titik Panas.
// Jalan sendiri lewat jalan tanah, nyemprot api di sekitar jalan, lalu balik ke posko.
import * as THREE from 'three';
import { STATE } from './config.js';
import { groundHeight } from './world.js';
import { ROADS, POSKO } from './map.js';
import { makeLabel } from './dozer.js';
import { Particles, makeSoftTexture } from './particles.js';
import { swapInModel } from './models.js';

const SPEED = 9;
export const REACH = 22; // jangkauan meriam air
const SPLASH = 5; // lebar cipratan di titik kena semburan
const TANK = 600;
const PARK = { x: POSKO.x + 8, z: POSKO.z + 7 }; // parkir di sisi selatan posko

// ---------- Jaringan jalan (graf sederhana) ----------
const key = (p) => `${p[0]},${p[1]}`;
const nodes = new Map();
for (const road of ROADS) {
  for (let i = 0; i < road.length; i++) {
    const k = key(road[i]);
    if (!nodes.has(k)) nodes.set(k, { p: road[i], edges: [] });
    if (i > 0) {
      const a = nodes.get(key(road[i - 1])), b = nodes.get(k);
      const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
      a.edges.push({ to: b, d });
      b.edges.push({ to: a, d });
    }
  }
}
function dijkstra(src) {
  const dist = new Map([[src, 0]]), prev = new Map(), todo = new Set(nodes.values());
  while (todo.size) {
    let u = null;
    for (const n of todo) if (dist.has(n) && (!u || dist.get(n) < dist.get(u))) u = n;
    if (!u) break;
    todo.delete(u);
    for (const e of u.edges) {
      const alt = dist.get(u) + e.d;
      if (!dist.has(e.to) || alt < dist.get(e.to)) { dist.set(e.to, alt); prev.set(e.to, u); }
    }
  }
  return { dist, prev };
}
// Titik di jalan yang paling dekat dengan (x, z), plus segmen jalannya
function nearestOnRoad(x, z) {
  let best = null;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const px = ax + vx * t, pz = az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, p: [px, pz], a: nodes.get(key(road[i])), b: nodes.get(key(road[i + 1])) };
    }
  }
  return best;
}

const chain = (prev, node) => {
  const out = [];
  for (let n = node; n; n = prev.get(n)) out.unshift(n.p);
  return out;
};

// Rute lewat jalan tanah dari posisi mana pun ke tujuan mana pun
function routeBetween(fx, fz, tx, tz) {
  const A = nearestOnRoad(fx, fz), B = nearestOnRoad(tx, tz);
  const same = (A.a === B.a && A.b === B.b) || (A.a === B.b && A.b === B.a);
  if (same) return { path: [A.p, B.p], offRoad: B.d };
  let best = null;
  for (const s of [A.a, A.b]) {
    const dj = dijkstra(s);
    const toS = Math.hypot(A.p[0] - s.p[0], A.p[1] - s.p[1]);
    for (const e of [B.a, B.b]) {
      if (!dj.dist.has(e)) continue;
      const c = toS + dj.dist.get(e) + Math.hypot(B.p[0] - e.p[0], B.p[1] - e.p[1]);
      if (!best || c < best.c) best = { c, nodes: chain(dj.prev, e) };
    }
  }
  return { path: [A.p, ...best.nodes, B.p], offRoad: B.d };
}

function buildTruck() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1 });
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(2.3, 1.9, 4.2), red, 0, 1.75, -0.8); // badan tangki
  add(new THREE.BoxGeometry(2.3, 1.7, 1.6), red, 0, 1.65, 2.1); // kabin
  add(new THREE.BoxGeometry(2.2, 0.75, 0.05), glass, 0, 2.0, 2.92);
  add(new THREE.BoxGeometry(2.32, 0.18, 5.85), white, 0, 1.35, 0); // garis putih
  for (const x of [-0.5, 0.5]) add(new THREE.BoxGeometry(0.08, 0.08, 4.2), steel, x, 2.85, -0.8); // tangga
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(1.0, 0.05, 0.06), steel, 0, 2.85, -2.7 + i * 0.75);
  const cannon = add(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 10), steel, 0, 3.05, 0.6);
  cannon.rotation.x = Math.PI / 2.6;
  const light = add(new THREE.BoxGeometry(1.2, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x2050ff, emissiveIntensity: 2 }), 0, 2.6, 2.3);
  for (const [x, z] of [[-1.05, 1.9], [1.05, 1.9], [-1.05, -1.6], [1.05, -1.6], [-1.05, -2.6], [1.05, -2.6]]) {
    const w = add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16), dark, x, 0.5, z);
    w.rotation.z = Math.PI / 2;
  }
  const labels = [-1, 1].map((side) => {
    const lbl = makeLabel(['DAMKAR', 'Siaga Karhutla'], { w: 2.4, h: 0.8, bg: '#c4161c' });
    lbl.position.set(side * 1.17, 1.85, -0.8);
    lbl.rotation.y = side * Math.PI / 2;
    lbl.userData.side = side;
    g.add(lbl);
    return lbl;
  });
  return { group: g, light, cannon, labels };
}

export class FireTruck {
  constructor(scene, world, fire) {
    const b = buildTruck();
    Object.assign(this, b);
    this.scene = scene;
    this.world = world;
    this.fire = fire;
    scene.add(this.group);
    // Model Meshy (ASET-MESHY.md #7): sirine & label DAMKAR tetap dari kode, ditempel ke badan model
    swapInModel(this.group, 'damkar', { length: 5.8 }, [this.light, ...this.labels]).then((m) => {
      if (!m) return;
      const box = m.userData.box;
      for (const l of this.labels) l.position.set(l.userData.side * (box.max.x + 0.03), box.max.y * 0.48, -1.0);
      this.light.position.set(0, box.max.y * 0.82, 1.9);
      this.cannon.position.y = box.max.y; // titik keluar semprotan
    });
    this.pos = new THREE.Vector3(PARK.x, 0, PARK.z);
    this.heading = Math.PI;
    this.state = 'idle'; // idle | going | stuck | spray | returning
    this.water = TANK;
    this.path = [];
    this.events = [];
    this.saved = 0;
    this.spray = new Particles(700, { map: makeSoftTexture('flame'), gravity: -12, drag: 0.3 });
    this.spray.points.renderOrder = 4;
    scene.add(this.spray.points);
    this.mist = new Particles(400, { map: makeSoftTexture('smoke'), gravity: 0.5, drag: 1.3 }); // cipratan di titik kena
    this.mist.points.renderOrder = 4;
    scene.add(this.mist.points);
    this.aim = null; // titik bidik semburan
    this.aimTile = null;
    this.aimT = 0;
    this.place();
  }

  // Tanpa batas: air gak habis, bisa dikirim/dialihkan kapan aja
  get available() {
    return !this.locked;
  }

  // Kenapa damkar gak bisa dikirim (null = bisa)
  get blocked() {
    return this.locked ? 'Damkar belum tersedia.' : null;
  }

  dispatch(x, z) {
    if (!this.available) return false;
    // berangkat dari posisi sekarang (bisa dari posko, di jalan, atau lagi nyemprot)
    const r = routeBetween(this.pos.x, this.pos.z, x, z);
    this.path = [[this.pos.x, this.pos.z], ...r.path];
    this.target = { x, z };
    const end = r.path[r.path.length - 1];
    this.dest = { x: end[0], z: end[1] }; // titik di jalan tempat damkar berhenti & nyemprot
    this.state = 'going';
    this.saved = 0;
    this.aim = null;
    this.aimTile = null;
    // Sesekali damkar nyangkut di jalan rusak
    this.stuckAt = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * (this.path.length - 2)) : -1;
    this.events.push({ type: 'dispatched', far: r.offRoad > REACH });
    return true;
  }

  // perkiraan detik sampai tiba (termasuk kalau lagi nyangkut)
  get eta() {
    if (this.state !== 'going' && this.state !== 'stuck') return 0;
    let d = 0, px = this.pos.x, pz = this.pos.z;
    for (const [x, z] of this.path) { d += Math.hypot(x - px, z - pz); px = x; pz = z; }
    return d / SPEED + (this.state === 'stuck' ? this.timer : 0);
  }

  followPath(dt) {
    const next = this.path[0];
    if (!next) return true;
    const dx = next[0] - this.pos.x, dz = next[1] - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = SPEED * dt;
    if (d <= step) {
      this.pos.x = next[0];
      this.pos.z = next[1];
      this.path.shift();
      if (this.stuckAt >= 0) {
        this.stuckAt--;
        if (this.stuckAt === 0) { this.state = 'stuck'; this.timer = 8; this.events.push({ type: 'stuck' }); }
      }
      return this.path.length === 0;
    }
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const want = Math.atan2(dx, dz);
    this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 6);
    return false;
  }

  update(dt, time) {
    this.light.material.emissive.setHex(Math.sin(time * 10) > 0 ? 0x2050ff : 0xff2020);
    switch (this.state) {
      case 'idle':
        this.water = Math.min(TANK, this.water + 40 * dt); // isi ulang di posko
        this.light.visible = false;
        break;
      case 'going':
        this.light.visible = true;
        if (this.followPath(dt)) { this.state = 'spray'; this.timer = 25; this.calm = 0; this.events.push({ type: 'arrived' }); }
        break;
      case 'stuck':
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'going'; this.events.push({ type: 'unstuck' }); }
        break;
      case 'spray':
        this.sprayFires(dt);
        break;
      case 'returning':
        if (this.followPath(dt)) {
          this.state = 'idle';
          this.heading = Math.PI;
          this.events.push({ type: 'back' });
        }
        break;
    }
    this.spray.update(dt);
    this.mist.update(dt);
    this.place();
  }

  // Meriam air: semburan nyapu pindah-pindah ke api di sekitar truk (jangkauan REACH).
  // Api di titik kena padam paling cepat, sekelilingnya kena cipratan. Api yang gak disemprot gak ikut padam.
  sprayFires(dt) {
    this.timer -= dt;
    this.aimT -= dt;
    const inReach = (t) => Math.hypot(t.cx - this.pos.x, t.cz - this.pos.z) < REACH;
    const t0 = this.aimTile;
    if (!t0 || t0.state !== STATE.BURNING || !inReach(t0) || this.aimT <= 0) {
      // sasaran berikutnya = api terdekat dari titik bidik sekarang, biar moncongnya nyapu, gak loncat-loncat
      const ref = this.aim || this.pos;
      let best = null, bd = Infinity;
      for (const t of this.fire.burning) {
        if (!inReach(t)) continue;
        const d = Math.hypot(t.cx - ref.x, t.cz - ref.z);
        if (d < bd) { bd = d; best = t; }
      }
      this.aimTile = best;
      this.aimT = 2.5;
      if (best && !this.aim) this.aim = { x: best.cx, z: best.cz };
    }
    if (!this.aimTile) {
      this.calm += dt;
      this.aim = null;
    } else {
      this.calm = 0;
      const aim = this.aim;
      const k = Math.min(1, dt * 4); // moncong digeser halus ke sasaran
      aim.x += (this.aimTile.cx - aim.x) * k;
      aim.z += (this.aimTile.cz - aim.z) * k;
      for (const t of [...this.fire.burning]) {
        const d = Math.hypot(t.cx - aim.x, t.cz - aim.z);
        if (d < SPLASH && this.fire.water(t, dt * (d < 2.5 ? 2.0 : 0.9))) this.saved++;
      }
      // semburan dari meriam di atap ke titik bidik
      const from = new THREE.Vector3(this.pos.x, groundHeight(this.pos.x, this.pos.z) + 3.2, this.pos.z);
      const dx = aim.x - from.x, dz = aim.z - from.z;
      const d = Math.max(1, Math.hypot(dx, dz));
      const flight = d / 16;
      for (let n = 0; n < 4; n++) {
        this.spray.spawn(from.x, from.y, from.z,
          (dx / flight) + (Math.random() - 0.5) * 2, 6 * flight + 2 + Math.random(), (dz / flight) + (Math.random() - 0.5) * 2,
          flight + 0.4, 0.4, 1.4, [0.75, 0.9, 1.0], [0.6, 0.8, 0.95], 0.55);
      }
      // cipratan + kabut di titik kena
      const gy = groundHeight(aim.x, aim.z);
      for (let n = 0; n < 5; n++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * SPLASH * 0.7;
        const x = aim.x + Math.cos(a) * r, z = aim.z + Math.sin(a) * r;
        this.mist.spawn(x, gy + 0.3, z, Math.cos(a) * 1.5, 1 + Math.random() * 2, Math.sin(a) * 1.5,
          0.9 + Math.random() * 0.6, 1.0, 3.6, [0.92, 0.95, 1], [0.78, 0.82, 0.86], 0.4);
      }
      const want = Math.atan2(dx, dz);
      this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 2);
    }
    if (this.timer <= 0 || this.calm > 3) {
      // pulang ke posko lewat jalan terdekat (tetap bisa dialihkan kapan aja)
      const r = routeBetween(this.pos.x, this.pos.z, PARK.x, PARK.z);
      this.path = [...r.path, [PARK.x, PARK.z]];
      this.state = 'returning';
      this.events.push({ type: 'done', saved: this.saved });
    }
  }

  place() {
    this.group.position.set(this.pos.x, groundHeight(this.pos.x, this.pos.z), this.pos.z);
    this.group.rotation.y = this.heading;
  }
}
