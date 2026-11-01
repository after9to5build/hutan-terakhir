// Bulldozer konsesi: masuk dari batas konsesi, meratakan hutan pelan-pelan.
// Tahan tombol aksi di dekatnya buat SEGEL. Versi emas "Izin Resmi" kebal segel.
import * as THREE from 'three';
import { STATE } from './config.js';
import { groundHeight } from './world.js';
import { placeModel } from './models.js';

export const ENTRIES = [
  { x: -66, z: 8, name: 'batas konsesi' },
  { x: -66, z: -28, name: 'batas konsesi' },
  { x: 2, z: -77, name: 'ujung jalan utara' },
];
const SPEED = 1.7;
const SEAL_TIME = 1.5; // detik menahan tombol
const SEAL_RANGE = 4.2;

export function makeLabel(lines, { w = 2.4, h = 0.8, bg = '#d61f26', fg = '#ffffff', border = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 14;
    g.strokeRect(7, 7, c.width - 14, c.height - 14);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = c.height / lines.length;
  lines.forEach((ln, i) => {
    g.font = `${i === 0 ? 800 : 600} ${Math.min(80, lh * 0.6)}px Inter, Arial, sans-serif`;
    g.fillText(ln, c.width / 2, lh * (i + 0.5), c.width - 30);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.7 }));
}

function buildDozer(golden, boss = false) {
  const g = new THREE.Group();
  const body = golden
    ? new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25, emissive: 0x3a2a00 })
    : new THREE.MeshStandardMaterial({ color: 0xf2b822, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.4, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.3 });
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // Model Meshy (kalau udah kemuat). Panjang 4,4 m sama kayak placeholder; boss dibesarin 1,9× di bawah.
  const model = placeModel(boss ? 'mega-bulldozer' : 'bulldozer', { length: 4.4 });
  let top = 3.2; // tinggi atap kabin, buat naruh papan
  if (model) {
    if (golden && !boss) {
      // Versi "Izin Resmi": emas bersih mengkilap, lumpurnya ikut "diputihkan"
      model.traverse((o) => { if (o.isMesh) o.material = body; });
    }
    g.add(model);
    top = model.userData.height;
  } else buildPlaceholder();
  function buildPlaceholder() {
  add(new THREE.BoxGeometry(2.4, 1.2, 3.2), body, 0, 1.15, -0.2);
  add(new THREE.BoxGeometry(1.7, 1.4, 1.5), body, 0, 2.45, -0.7);
  add(new THREE.BoxGeometry(1.5, 0.8, 1.52), glass, 0, 2.6, -0.7);
  add(new THREE.BoxGeometry(1.72, 0.12, 1.52), body, 0, 3.2, -0.7);
  for (const x of [-1.3, 1.3]) add(new THREE.BoxGeometry(0.65, 0.9, 3.8), dark, x, 0.45, -0.2);
  add(new THREE.BoxGeometry(3.4, 1.15, 0.28), steel, 0, 0.65, 2.0);
  for (const x of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.2, 0.25, 1.4), steel, x, 0.9, 1.25);
  add(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 8), dark, 0.75, 2.4, 0.9);
  }
  if (golden) {
    const sign = boss
      ? makeLabel(['MEGA BULLDOZER KONSESI', 'IZIN RESMI · HGU 10.000 HA'], { w: 2.6, h: 0.8, bg: '#1b1408', fg: '#ffd060', border: '#d4af37' })
      : makeLabel(['IZIN RESMI', 'Sudah diatur'], { w: 1.9, h: 0.7, bg: '#1b1408', fg: '#ffd060', border: '#d4af37' });
    sign.position.set(0, top + 0.55, -0.7);
    g.add(sign);
  }
  if (boss) g.scale.setScalar(1.9);
  return g;
}

export class Dozers {
  constructor(scene, world, fire) {
    this.scene = scene;
    this.world = world;
    this.fire = fire;
    this.list = [];
    this.events = [];
    this.permitRevoked = false; // dicabut lewat pengadilan (Level 3)
  }

  isImmune(d) {
    return d.golden && !this.permitRevoked;
  }

  // Izin dicabut: semua bulldozer emas kehilangan kekebalan, yang "selesai kuota" jalan lagi
  revokePermits() {
    this.permitRevoked = true;
    for (const d of this.list) if (d.golden && d.done) d.done = false;
  }

  active() {
    return this.list.filter((d) => !d.sealed && !d.done);
  }

  spawn(golden = false, entryIndex, boss = false) {
    const entry = ENTRIES[entryIndex ?? Math.floor(Math.random() * ENTRIES.length)];
    const group = buildDozer(golden, boss);
    this.scene.add(group);
    const d = {
      group, golden, entry, boss,
      scale: boss ? 1.9 : 1,
      pos: new THREE.Vector3(entry.x, 0, entry.z),
      heading: Math.PI / 2,
      sealed: false, done: false,
      cleared: 0, seal: 0,
      target: null, smokeT: 0, immuneShown: false,
    };
    d.target = this.pickTarget(d);
    this.list.push(d);
    this.events.push({ type: 'spawn', dozer: d });
    return d;
  }

  // Arah berikutnya: petak hutan 15–35 m di depan, cenderung masuk ke dalam peta
  pickTarget(d) {
    const cands = this.world.tiles.filter((t) => {
      if (!t.burnable || t.state === STATE.BURNT) return false;
      const dist = Math.hypot(t.cx - d.pos.x, t.cz - d.pos.z);
      return dist > 15 && dist < 35 && t.cx > d.pos.x - 6;
    });
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }

  nearest(pos) {
    let best = null, bd = Infinity;
    for (const d of this.list) {
      if (d.sealed) continue;
      const dist = Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z);
      if (dist < SEAL_RANGE * d.scale && dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  update(dt, player, actionHeld, riding) {
    for (const d of this.list) {
      if (d.sealed || d.done) continue;
      // Gerak maju ke target sambil meratakan semua yang dilewati
      if (!d.target) d.target = this.pickTarget(d);
      if (d.target) {
        const dx = d.target.cx - d.pos.x, dz = d.target.cz - d.pos.z;
        const want = Math.atan2(dx, dz);
        let diff = Math.atan2(Math.sin(want - d.heading), Math.cos(want - d.heading));
        d.heading += Math.max(-0.6 * dt, Math.min(0.6 * dt, diff));
        const sp = d.boss ? SPEED * 0.8 : SPEED;
        d.pos.x += Math.sin(d.heading) * sp * dt;
        d.pos.z += Math.cos(d.heading) * sp * dt;
        if (Math.hypot(dx, dz) < 2) d.target = null;
      }
      const fx = Math.sin(d.heading), fz = Math.cos(d.heading);
      // Mega bulldozer meratakan jalur 3 petak sekaligus
      const offs = d.boss ? [[0, 0], [4, 0], [4, -3.5], [4, 3.5], [0, -3.5], [0, 3.5]] : [[0, 0], [2.2, 0]];
      for (const [off, side] of offs) {
        const t = this.world.tileAt(d.pos.x + fx * off + fz * side, d.pos.z + fz * off - fx * side);
        if (t && t.burnable && t.state !== STATE.BURNT) {
          if (t.state === STATE.BURNING) this.fire.burning.delete(t);
          if (this.world.setCleared(t)) d.cleared++;
        }
      }
      // Bulldozer emas: berhenti setelah "kuota izin" habis
      if (d.golden && !d.boss && !this.permitRevoked && d.cleared >= 12) {
        d.done = true;
        this.events.push({ type: 'quota', dozer: d });
      }
      // Asap knalpot
      d.smokeT -= dt;
      if (d.smokeT <= 0) {
        d.smokeT = 0.25;
        const ex = d.pos.x + Math.sin(d.heading) * 0.9 + Math.cos(d.heading) * 0.75;
        const ez = d.pos.z + Math.cos(d.heading) * 0.9 - Math.sin(d.heading) * 0.75;
        this.fire.smoke.spawn(ex, groundHeight(d.pos.x, d.pos.z) + 3, ez, 0.3, 1.8, 0.1, 2.5, 0.6, 2.5, [0.1, 0.1, 0.1], [0.3, 0.3, 0.3], 0.5);
      }
      this.place(d);
    }

    // Segel: tahan tombol aksi di dekat bulldozer (gak bisa sambil naik motor)
    const d = riding ? null : this.nearest(player.pos);
    for (const o of this.list) if (o !== d) o.seal = Math.max(0, o.seal - dt);
    if (d && actionHeld) {
      if (this.isImmune(d)) {
        if (!d.immuneShown) { d.immuneShown = true; this.events.push({ type: 'immune', dozer: d }); }
      } else {
        d.seal += dt / (d.boss ? SEAL_TIME * 2.5 : SEAL_TIME);
        if (d.seal >= 1) this.sealIt(d);
      }
    } else if (d) {
      d.seal = Math.max(0, d.seal - dt);
      d.immuneShown = false;
    }
  }

  sealIt(d) {
    d.sealed = true;
    d.seal = 1;
    // Pita segel kuning-hitam + papan DISEGEL
    const tape = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 3.3), new THREE.MeshStandardMaterial({ color: 0xffd400 }));
    tape.position.set(0, 1.4, -0.2);
    d.group.add(tape);
    const sign = makeLabel(['DISEGEL', 'Kementerian Urusan Asap'], { w: 2.6, h: 0.9 });
    sign.position.set(0, 1.0, 2.2);
    d.group.add(sign);
    this.events.push({ type: 'sealed', dozer: d });
  }

  // Dorong pemain/motor keluar dari badan bulldozer
  push(pos, r = 0.5) {
    for (const d of this.list) {
      const dx = pos.x - d.pos.x, dz = pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz);
      const min = 2.3 * d.scale + r;
      if (dist < min && dist > 0.001) {
        pos.x = d.pos.x + (dx / dist) * min;
        pos.z = d.pos.z + (dz / dist) * min;
      }
    }
  }

  place(d) {
    d.group.position.set(d.pos.x, groundHeight(d.pos.x, d.pos.z), d.pos.z);
    d.group.rotation.y = d.heading;
  }
}
