// KOPDES di tengah hutan: bangunan koperasi cat merah-putih baru kinclong, digembok,
// "sudah diresmikan", gak ada jalan ke sana, anggotanya orangutan. Satir "proyek seremoni".
// Dekorasi doang (gak masuk misi). Nama cuma "KOPDES", tanpa logo atau nama program resmi.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { POSKO, COURT, CEREMONY, CIRCUIT, roadDist, riverDist, inPeat } from './map.js';
import { HALF } from './config.js';
import { makeLabel } from './dozer.js';
import { paintedMat } from './props.js';
import { makeChar } from './characters.js';

const START = { x: POSKO.x + 1, z: POSKO.z - 10 }; // posisi awal pemain (sama kayak main.js), ngadep utara

// Titik di hutan yang tetap gampang ditemukan: 7–11 m masuk dari jalan (kelihatan dari jalan),
// 20–36 m dari start, di depan arah pandang awal pemain (ke utara / -z).
// Jauh dari posko, pengadilan, panggung, sirkuit, sungai, gambut.
function pickSpot(world) {
  let best = null, bestScore = -Infinity;
  for (let x = -HALF + 14; x <= HALF - 14; x += 1) {
    for (let z = -HALF + 14; z <= HALF - 14; z += 1) {
      const t = world.tileAt(x, z);
      if (!t || !t.burnable) continue;
      const road = roadDist(x, z);
      if (road < 7 || road > 11 || riverDist(x, z) < 10 || inPeat(x, z)) continue;
      if (Math.hypot(x - POSKO.x, z - POSKO.z) < 22 || Math.hypot(x - COURT.x, z - COURT.z) < 22) continue;
      if (Math.hypot(x - CEREMONY.x, z - CEREMONY.z) < 20 || Math.hypot(x - CIRCUIT.x, z - CIRCUIT.z) < 22) continue;
      const ahead = START.z - z; // makin positif = makin ke depan (utara)
      const d = Math.hypot(x - START.x, z - START.z);
      if (d < 20 || d > 36 || ahead < 12 || Math.abs(x - START.x) > ahead * 0.75) continue;
      const score = -Math.abs(x - START.x) / ahead - Math.abs(road - 9) * 0.2 - Math.abs(d - 27) * 0.05;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best || { x: -30, z: 22 };
}

// Bersihin cuma pohon/semak yang nabrak bangunan + teras (kotak lokal), sisanya dibiarin mepet
// biar kerasa nyempil di semak-semak. Collider di area itu juga dibuang.
const AREA = { x0: -4.8, x1: 4.8, z0: -3.9, z1: 6.0 };
function clearAround(world, x, z, rotY) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const cos = Math.cos(-rotY), sin = Math.sin(-rotY);
  const inside = (wx, wz, pad = 0) => {
    const dx = wx - x, dz = wz - z;
    const lx = dx * cos + dz * sin, lz = -dx * sin + dz * cos;
    return lx > AREA.x0 - pad && lx < AREA.x1 + pad && lz > AREA.z0 - pad && lz < AREA.z1 + pad;
  };
  for (const t of world.tiles) {
    if (Math.hypot(t.cx - x, t.cz - z) > 12) continue;
    for (const part of t.parts) {
      part.mesh.getMatrixAt(part.i, m);
      p.setFromMatrixPosition(m);
      if (inside(p.x, p.z, 0.6)) {
        part.mesh.setMatrixAt(part.i, zero);
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    t.colliders = t.colliders.filter((c) => !inside(c.x, c.z, c.r));
  }
}

function mat(key, opts, o) { return paintedMat(`kopdes-${key}`, opts, o); }

function buildKopdes() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  // cat baru: putih bersih + merah, hampir tanpa kotor (kontras sama hutan)
  // cat merah-putih yang mulai kusam: noda air ngalir dari atas, lumut di bawah (terbengkalai)
  const stains = (c, w, h, r) => {
    for (let i = 0; i < 14; i++) {
      const x = r() * w, len = h * (0.2 + r() * 0.5);
      const gr = c.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(70,60,45,0.28)'); gr.addColorStop(1, 'rgba(70,60,45,0)');
      c.fillStyle = gr; c.fillRect(x, 0, 3 + r() * 6, len);
    }
    const moss = c.createLinearGradient(0, h * 0.72, 0, h);
    moss.addColorStop(0, 'rgba(60,85,35,0)'); moss.addColorStop(1, 'rgba(60,85,35,0.55)');
    c.fillStyle = moss; c.fillRect(0, h * 0.72, w, h * 0.28);
  };
  const white = mat('putih', { base: 0xe9e4d8, edge: 0.22, dirt: 0.12, strokes: 0.06, seed: 201, draw: stains });
  const red = mat('merah', { base: 0xb0181c, edge: 0.18, dirt: 0.12, strokes: 0.07, seed: 202, draw: stains }, { rough: 0.6 });
  const concrete = mat('beton', { base: 0x9a968c, edge: 0.2, dirt: 0.2, seed: 203 }, { rough: 0.95 });
  const roof = mat('atap', {
    base: 0x9e161a, edge: 0.05, dirt: 0.5, seed: 204, // atap kotor, ketutup daun kering
    draw: (c, w, h) => { // seng gelombang
      for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, 0, 5, h); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 9, 0, 4, h); }
    },
  }, { rough: 0.4, metal: 0.3 });
  const shutter = mat('rolling', {
    base: 0xa9adb2, edge: 0.25, dirt: 0.05, seed: 205,
    draw: (c, w, h) => { c.strokeStyle = 'rgba(40,40,40,0.45)'; c.lineWidth = 3; for (let y = 8; y < h; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } },
  }, { rough: 0.35, metal: 0.5 });
  const windowMat = mat('jendela', {
    base: 0x1f2a30, edge: 0.3, dirt: 0.02, strokes: 0.02, seed: 206,
    draw: (c, w, h) => { // rak kosong di balik kaca
      c.strokeStyle = 'rgba(200,200,190,0.55)'; c.lineWidth = 5;
      for (const y of [0.3, 0.55, 0.8]) { c.beginPath(); c.moveTo(w * 0.08, h * y); c.lineTo(w * 0.92, h * y); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 0.35, 0); c.lineTo(0, h * 0.6); c.fill(); // kilap kaca
    },
  }, { rough: 0.1, metal: 0.2 });

  const W = 6, D = 4.6, H = 3.0;
  add(new THREE.BoxGeometry(W + 0.8, 0.35, D + 2.2), concrete, 0, 0.175, 0.5); // lantai + teras
  add(new THREE.BoxGeometry(W, H * 0.62, D), white, 0, 0.35 + H * 0.69, 0); // dinding atas putih
  add(new THREE.BoxGeometry(W + 0.02, H * 0.38, D + 0.02), red, 0, 0.35 + H * 0.19, 0); // dinding bawah merah
  // atap pelana merah: dua lembar seng miring ketemu di bubungan (memanjang kiri-kanan)
  const slope = 0.5, half = (D / 2 + 0.45) / Math.cos(slope);
  for (const s of [-1, 1]) {
    const sheet = add(new THREE.BoxGeometry(W + 0.9, 0.08, half), roof, 0, 0.35 + H + Math.sin(slope) * half / 2, s * Math.cos(slope) * half / 2);
    sheet.rotation.x = s * slope;
  }
  // segitiga dinding (gevel) kiri-kanan, putih
  const gable = new THREE.Shape();
  gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, Math.tan(slope) * D / 2); gable.lineTo(-D / 2, 0);
  for (const s of [-1, 1]) {
    const gm = add(new THREE.ShapeGeometry(gable), white, s * (W / 2 - 0.01), 0.35 + H, 0);
    gm.rotation.y = s * Math.PI / 2;
    gm.material = white.clone(); gm.material.side = THREE.DoubleSide;
  }
  // teras: atap kecil + 2 tiang merah
  add(new THREE.BoxGeometry(W + 0.4, 0.12, 1.7), red, 0, 0.35 + H - 0.1, D / 2 + 0.8);
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) add(new THREE.BoxGeometry(0.22, H - 0.1, 0.22), red, x, 0.35 + (H - 0.1) / 2, D / 2 + 1.5);
  // pintu rolling ketutup + gembok
  add(new THREE.BoxGeometry(2.0, 2.3, 0.08), shutter, -0.9, 0.35 + 1.15, D / 2 + 0.03);
  add(new THREE.BoxGeometry(0.14, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.7, roughness: 0.3 }), -0.9, 0.5, D / 2 + 0.1);
  // jendela kaca, rak kosong kelihatan
  add(new THREE.BoxGeometry(1.7, 1.2, 0.06), windowMat, 1.6, 0.35 + 1.55, D / 2 + 0.03);
  add(new THREE.BoxGeometry(1.86, 0.1, 0.12), red, 1.6, 0.35 + 0.9, D / 2 + 0.06);
  // papan nama di atas teras
  const sign = makeLabel(['KOPDES'], { w: 3.4, h: 0.85, bg: '#c4161c', fg: '#ffffff', border: '#ffffff' });
  sign.position.set(0, 0.35 + H + 0.35, D / 2 + 1.67);
  sign.rotation.z = 0.05; // papan agak miring, gak ada yang benerin
  g.add(sign);
  // plakat "sudah diresmikan" + sisa pita gunting di depan teras
  const plaque = makeLabel(['SUDAH DIRESMIKAN'], { w: 1.9, h: 0.5, bg: '#1b1408', fg: '#ffd060', border: '#d4af37' });
  plaque.position.set(1.6, 0.35 + 2.6, D / 2 + 0.04); // di atas jendela, gak ketutup tiang
  g.add(plaque);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 });
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xd61f26, roughness: 0.6, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), gold, s * 1.4, 0.35 + 0.55, D / 2 + 2.6);
    // pita kegunting, ngegantung lemas
    const r = add(new THREE.PlaneGeometry(0.5, 0.09), ribbon, s * 1.18, 0.35 + 0.8, D / 2 + 2.6);
    r.rotation.z = s * 0.9;
  }
  // umbul-umbul merah-putih tinggi (bambu + kain panjang), nongol di atas pohon biar kelihatan dari jauh
  const bamboo = new THREE.MeshStandardMaterial({ color: 0xc9b27a, roughness: 0.8 });
  const fc = document.createElement('canvas');
  fc.width = 32; fc.height = 256;
  const fg = fc.getContext('2d');
  fg.fillStyle = '#d61f26'; fg.fillRect(0, 0, 32, 128);
  fg.fillStyle = '#ffffff'; fg.fillRect(0, 128, 32, 128);
  const ft = new THREE.CanvasTexture(fc);
  ft.colorSpace = THREE.SRGBColorSpace;
  const flagMat = new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 });
  g.userData.flags = [];
  for (const [x, z] of [[-W / 2 - 1.2, D / 2 + 2.6], [W / 2 + 1.2, D / 2 + 2.6], [-W / 2 - 1.2, -D / 2], [W / 2 + 1.2, -D / 2]]) {
    const pole = add(new THREE.CylinderGeometry(0.05, 0.08, 10, 6), bamboo, x, 5, z);
    pole.rotation.z = 0.04 * Math.sign(x); // bambu agak melengkung ke luar
    const flag = new THREE.Group();
    flag.position.set(x + 0.05 * Math.sign(x), 9.7, z);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 4.6), flagMat);
    cloth.position.set(0.3, -2.3, 0);
    flag.add(cloth);
    g.add(flag);
    g.userData.flags.push(flag);
  }
  return g;
}

export class Kopdes {
  constructor(scene, world, { hud }) {
    this.hud = hud;
    const s = pickSpot(world);
    const rotY = Math.atan2(START.x - s.x, START.z - s.z); // depannya ngadep ke arah start pemain
    clearAround(world, s.x, s.z, rotY);
    this.pos = new THREE.Vector3(s.x, groundHeight(s.x, s.z), s.z);
    this.group = buildKopdes();
    this.group.position.copy(this.pos);
    this.group.rotation.y = rotY;
    this.addWeeds(world);
    scene.add(this.group);
    world.addCollider(s.x, s.z, 3.4);
    this.apes = [];
    this.told = false;
  }

  // Semak, pakis, & rumput liar numbuh mepet tembok dan di teras (pakai bentuk tanaman yang sama kayak hutan)
  addWeeds(world) {
    const r = (() => { let v = 7; return () => ((v = (v * 16807) % 2147483647) / 2147483647); })();
    const col = new THREE.Color();
    const plant = (key, spots, scale, hue, sat, light) => {
      const src = world.meshes[key];
      if (!src) return;
      const im = new THREE.InstancedMesh(src.geometry, src.material, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      spots.forEach(([x, y, z], i) => {
        const sc = scale[0] + r() * (scale[1] - scale[0]);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc * (0.8 + r() * 0.4), sc));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.setHSL(hue + (r() - 0.5) * 0.04, sat, light + (r() - 0.5) * 0.06));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
    };
    // semak gede di pojok & samping (nutupin sebagian tembok)
    plant('bush', [[-3.6, 0, -2.6], [3.5, 0, -2.9], [-3.7, 0, 0.3], [3.8, 0, 0.9], [-4.1, 0, 3.4], [4.0, 0, 3.6], [0.5, 0, -3.4], [-1.9, 0, -3.3]], [1.1, 1.7], 0.27, 0.48, 0.26);
    // pakis di pinggir teras & mepet tembok samping
    const ferns = [];
    for (let i = 0; i < 9; i++) ferns.push([-3 + i * 0.75 + (r() - 0.5) * 0.3, 0, 4.1 + r() * 0.5]);
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) ferns.push([sx * (3.2 + r() * 0.3), 0, -1.8 + i * 1.3]);
    plant('fern', ferns, [0.8, 1.25], 0.26, 0.45, 0.32);
    // rumput liar: di sela lantai teras (yang lama gak disapu) & sekitar tiang pita
    const grass = [];
    for (let i = 0; i < 10; i++) grass.push([(r() - 0.5) * 6, 0.35, 2.4 + r() * 1.4]);
    for (let i = 0; i < 14; i++) grass.push([(r() - 0.5) * 8, 0, 4.6 + r() * 1.6]);
    plant('grass', grass, [0.6, 1.1], 0.2, 0.42, 0.36);
  }

  // Orangutan dipasang begitu modelnya kemuat: satu di teras, satu anak ngintip jendela
  spawnApes() {
    const spots = [
      { x: 1.2, z: 3.3, rot: 0, scale: 1 }, // teras, ngadep luar
      { x: 1.6, z: 2.75, rot: Math.PI, scale: 0.6 }, // anak, ngadep jendela
    ];
    for (const sp of spots) {
      const ch = makeChar('orangutan', { height: 1.6 * sp.scale, clips: { idle: ['orangutan', 'Idle_9'] } });
      if (!ch) return false;
      ch.play('idle', 0);
      ch.mixer.setTime(Math.random() * 2);
      ch.group.position.set(sp.x, 0.35, sp.z);
      ch.group.rotation.y = sp.rot;
      this.group.add(ch.group);
      this.apes.push(ch);
    }
    return true;
  }

  update(dt, player, playing) {
    if (!this.apes.length) this.spawnApes();
    this.t = (this.t || 0) + dt;
    this.group.userData.flags.forEach((f, i) => { f.rotation.y = Math.sin(this.t * 1.6 + i) * 0.35; f.rotation.z = Math.sin(this.t * 2.3 + i * 2) * 0.05; });
    for (const ch of this.apes) ch.mixer.update(dt);
    if (playing && !this.told && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 15) {
      this.told = true;
      this.hud.toast('🏪 KOPDES di tengah hutan. Anggotanya orangutan.', 'satire', 5000);
    }
  }
}
