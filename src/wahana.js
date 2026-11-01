// Wahana satir di luar misi: panggung peresmian (gunting pita + foto dokumentasi) dan sirkuit motor trail.
// Gak masuk checklist misi. Api tetap merambat selama main, jadi tetap bisa kalah.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { makeLabel } from './dozer.js';
import { CEREMONY, CIRCUIT_PTS, CIRCUIT_START, CIRCUIT_CPS, ROAD_HALF } from './map.js';
import { Particles, makeSoftTexture } from './particles.js';

// Spanduk peresmian, ganti tiap pita digunting. Semua fiktif, gak nyebut proyek asli.
const BANNERS = [
  'Sumur Bor (Airnya Menyusul)',
  'Pos Pantau Api (Orangnya Menyusul)',
  'Jalan Damkar (10 Meter Pertama)',
  'Baliho Siaga Karhutla',
  'Menara Pantau (Tangganya Menyusul)',
  'Peresmian Peresmian Berikutnya',
];
const CONFETTI = [[1, 0.25, 0.3], [1, 0.82, 0.2], [0.3, 0.7, 1], [0.4, 0.9, 0.45], [1, 1, 1]];
const FLAG_COLORS = [0xf2c12e, 0x2f86c9, 0xe8661c];
const BEST_KEY = 'ht-lap-best';

const $ = (id) => document.getElementById(id);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function part(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Kamera foto di atas tripod (buat panggung). Moncong lensa ngadep +z.
function makeTripodCamera() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = part(new THREE.CylinderGeometry(0.015, 0.015, 1.45, 6), steel, Math.sin(a) * 0.22, 0.7, Math.cos(a) * 0.22);
    leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
    g.add(leg);
  }
  g.add(part(new THREE.BoxGeometry(0.22, 0.16, 0.14), black, 0, 1.47, 0));
  const lens = part(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 12), black, 0, 1.47, 0.14);
  lens.rotation.x = Math.PI / 2;
  g.add(lens);
  return g;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Wahana {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { hud, sfx, player, bike, fire, satire, pop, get game() }
    this.confetti = new Particles(400, { map: makeSoftTexture('flame'), gravity: -5, drag: 1.1 });
    scene.add(this.confetti.points);
    this.bannerIdx = 0;
    this.ribbonUp = true;
    this.cutT = -1;
    this.resetT = 0;
    this.poseT = 0;
    this.snapPending = false;
    this.race = null;
    this.armed = true;
    this.laps = 0;
    try { this.best = Number(localStorage.getItem(BEST_KEY)) || null; } catch { this.best = null; }
    this.buildStage();
    this.buildCircuit();
    this.buildHud();
  }

  // ---------- Panggung peresmian ----------
  buildStage() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
    const carpet = new THREE.MeshStandardMaterial({ color: 0x9e1b24, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd81f2a, roughness: 0.45 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.8 });
    const pot = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.8 });
    g.add(part(new THREE.BoxGeometry(3.6, 0.3, 2.2), wood, 0, 0.15, 0));
    g.add(part(new THREE.BoxGeometry(1.3, 0.02, 2.2), carpet, 0, 0.31, 0));
    g.add(part(new THREE.BoxGeometry(1.3, 0.02, 1.6), carpet, 0, 0.01, 1.9)); // karpet merah nyambung ke tanah
    for (const x of [-1.75, 1.75]) g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), gold, x, 1.5, -0.95));
    // pot bunga di pojok panggung
    for (const x of [-1.5, 1.5]) {
      g.add(part(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 10), pot, x, 0.45, 0.85));
      g.add(part(new THREE.SphereGeometry(0.26, 10, 8), leaf, x, 0.78, 0.85));
    }
    // pita: dua tiang emas di depan panggung, pitanya dua potong (biar bisa jatuh ke dua arah)
    const RZ = 2.4, RY = 0.95, HALFW = 0.9;
    const pivots = [];
    for (const sx of [-1, 1]) {
      g.add(part(new THREE.CylinderGeometry(0.035, 0.045, RY, 8), gold, sx * HALFW, RY / 2, RZ));
      g.add(part(new THREE.SphereGeometry(0.06, 10, 8), gold, sx * HALFW, RY + 0.03, RZ));
      const piv = new THREE.Group();
      piv.position.set(sx * HALFW, RY, RZ);
      piv.add(part(new THREE.BoxGeometry(HALFW, 0.09, 0.012), red, -sx * HALFW / 2, 0, 0));
      g.add(piv);
      pivots.push(piv);
    }
    const bow = new THREE.Group();
    bow.position.set(0, RY, RZ);
    for (const sx of [-1, 1]) {
      const loop = part(new THREE.TorusGeometry(0.08, 0.025, 6, 12), red, sx * 0.08, 0, 0);
      loop.scale.set(1, 0.7, 1);
      bow.add(loop);
    }
    bow.add(part(new THREE.SphereGeometry(0.045, 8, 6), red, 0, 0, 0));
    g.add(bow);
    // kamera dokumentasi di depan, ngadep panggung
    const cam = makeTripodCamera();
    cam.position.set(1.9, 0, 4.6);
    cam.rotation.y = Math.atan2(-1.9, -4.6);
    g.add(cam);

    // panggung ngadep jalan ke sirkuit
    this.yaw = Math.atan2(5.6, 3.5);
    const gy = groundHeight(CEREMONY.x, CEREMONY.z);
    g.position.set(CEREMONY.x, gy, CEREMONY.z);
    g.rotation.y = this.yaw;
    this.scene.add(g);
    this.stage = g;
    this.pivots = pivots;
    this.bow = bow;
    // tempat berdiri buat gunting pita: di depan pita
    const spot = new THREE.Vector3(0, 0, RZ + 0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.spot = { x: CEREMONY.x + spot.x, z: CEREMONY.z + spot.z };
    this.setBanner();
  }

  setBanner() {
    if (this.banner) {
      this.stage.remove(this.banner);
      this.banner.material.map.dispose();
      this.banner.material.dispose();
      this.banner.geometry.dispose();
    }
    this.banner = makeLabel(['PERESMIAN', BANNERS[this.bannerIdx % BANNERS.length]], { w: 3.4, h: 1.15, bg: '#7d0f1a', fg: '#ffd060', border: '#d4af37' });
    this.banner.position.set(0, 2.45, -0.95);
    this.stage.add(this.banner);
  }

  // Teks tombol aksi kalau pemain berdiri di depan pita
  prompt(pos) {
    if (!this.ribbonUp) return null;
    return Math.hypot(pos.x - this.spot.x, pos.z - this.spot.z) < 2.4 ? 'Gunting pita peresmian' : null;
  }

  use(pos) {
    if (!this.prompt(pos)) return false;
    const { player, sfx, pop } = this.ctx;
    const game = this.ctx.game;
    const name = BANNERS[this.bannerIdx % BANNERS.length];
    this.ribbonUp = false;
    this.cutT = 0;
    this.resetT = 8;
    this.snapped = false;
    this.bow.visible = false;
    player.facing = this.yaw + Math.PI; // ngadep panggung
    player.pose = 'cheer';
    this.poseT = 2.4;
    // konfeti dari simpul pita
    const b = this.bow.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      const c = CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
      this.confetti.spawn(b.x, b.y + 0.2, b.z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s,
        2.2 + Math.random() * 1.2, 0.22, 0.18, c, c, 0.95);
    }
    sfx.applause(3);
    [0.3, 0.75, 1.2, 1.7].forEach((t) => setTimeout(() => sfx.shutter(), t * 1000));
    pop('🎀 DIRESMIKAN!', name);
    game.citra += 3;
    game.ceremonies = (game.ceremonies || 0) + 1;
    setTimeout(() => {
      const n = this.ctx.fire.burning.size;
      this.ctx.hud.toast(n ? `📸 Fotonya bagus. ${n} petak masih kebakar.` : '📸 Fotonya bagus. Apinya lagi libur.', 'satire', 4000);
    }, 2000);
    this.lastBanner = name;
    return true;
  }

  // Dipanggil abis layar dirender: ambil "foto dokumentasi" dari layar game
  takeSnap(canvas) {
    this.snapPending = false;
    let url = null;
    try { url = canvas.toDataURL('image/jpeg', 0.75); } catch { url = null; }
    const el = this.el.snap;
    el.querySelector('img').src = url || '';
    el.querySelector('img').style.display = url ? '' : 'none';
    el.querySelector('small').textContent = this.lastBanner || '';
    el.classList.remove('hidden', 'out');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { el.classList.remove('show'); el.classList.add('out'); }, 3200);
  }

  // ---------- Sirkuit motor ----------
  buildCircuit() {
    const pts = CIRCUIT_PTS;
    const n = pts.length;
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 });
    // cone di dua sisi lintasan, tiap ±4,5 m
    const spots = [];
    const [sx0, sz0] = CIRCUIT_START;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const steps = Math.max(1, Math.round(len / 4.5));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (const side of [-1, 1]) {
          const px = x + nx * side * (ROAD_HALF + 0.5), pz = z + nz * side * (ROAD_HALF + 0.5);
          if (Math.hypot(px - sx0, pz - sz0) < 4.5) continue; // gerbang start
          // sisi luar dekat start dibiarin kosong: jalan masuk dari panggung nyambung di sini
          if (Math.hypot(px - sx0, pz - (sz0 + 3)) < 7 && pz > sz0) continue;
          spots.push([px, pz]);
        }
      }
    }
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.55, 10), orange, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m.makeTranslation(x, groundHeight(x, z) + 0.27, z); cones.setMatrixAt(i, m); });
    cones.castShadow = true;
    this.scene.add(cones);

    // gerbang start/finish: dua tiang + spanduk kotak-kotak + garis di tanah
    const [px, pz] = pts[2], [qx, qz] = pts[4];
    const tl = Math.hypot(qx - px, qz - pz);
    const tx = (qx - px) / tl, tz = (qz - pz) / tl; // arah lintasan di garis start
    const gate = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
    const half = ROAD_HALF + 0.8;
    for (const s of [-1, 1]) gate.add(part(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), white, s * half, 1.8, 0));
    const checker = checkerTexture();
    const strip = part(new THREE.BoxGeometry(half * 2, 0.35, 0.05), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }), 0, 3.45, 0);
    gate.add(strip);
    const lbl = makeLabel(['START · FINISH'], { w: 3.2, h: 0.55, bg: '#111111', fg: '#ffffff' });
    lbl.position.set(0, 2.95, 0);
    gate.add(lbl);
    const lineTex = checkerTexture();
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 0.5), new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.9 }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    gate.add(line);
    gate.position.set(sx0, groundHeight(sx0, sz0), sz0);
    gate.rotation.y = Math.atan2(tx, tz); // sumbu z gerbang searah lintasan, tiang di kiri-kanan
    this.scene.add(gate);

    // papan nama sirkuit di sisi dalam dekat start
    const sign = makeLabel(['SIRKUIT TRAIL KEPRESIDENAN', 'Diresmikan pas hutan terbakar'], { w: 3.6, h: 1.0, bg: '#1d2a4a', fg: '#ffd060', border: '#d4af37' });
    const sg = new THREE.Group();
    for (const s of [-1.6, 1.6]) sg.add(part(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), white, s, 1.1, 0));
    sign.position.y = 1.9;
    sg.add(sign);
    const ix = sx0 + (-tz) * (ROAD_HALF + 3.2), iz = sz0 + tx * (ROAD_HALF + 3.2); // geser ke dalam oval
    sg.position.set(ix + tx * 5, groundHeight(ix, iz), iz + tz * 5);
    sg.rotation.y = Math.atan2(sx0 - ix, sz0 - iz);
    this.scene.add(sg);

    // 3 bendera checkpoint di sisi dalam lintasan
    this.flags = CIRCUIT_CPS.map(([x, z], i) => {
      const g = new THREE.Group();
      g.add(part(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), white, 0, 1.2, 0));
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.9, -0.28); shape.lineTo(0, -0.56); shape.lineTo(0, 0);
      const mat = new THREE.MeshStandardMaterial({ color: FLAG_COLORS[i], roughness: 0.6, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      flag.position.y = 2.35;
      g.add(flag);
      // ke sisi dalam oval
      const dx = 10 - x, dz = 34 - z, d = Math.hypot(dx, dz);
      const fx = x + (dx / d) * (ROAD_HALF + 0.9), fz = z + (dz / d) * (ROAD_HALF + 0.9);
      g.position.set(fx, groundHeight(fx, fz), fz);
      g.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(g);
      return { x, z, mat, color: FLAG_COLORS[i], flag };
    });
  }

  buildHud() {
    const hudEl = $('hud');
    const timer = document.createElement('div');
    timer.id = 'lapTimer';
    timer.className = 'hidden';
    hudEl.appendChild(timer);
    const snap = document.createElement('div');
    snap.id = 'photoSnap';
    snap.className = 'hidden';
    snap.innerHTML = '<img alt=""><b>📸 Dokumentasi Kegiatan</b><small></small>';
    hudEl.appendChild(snap);
    this.el = { timer, snap };
  }

  resetFlags() {
    for (const f of this.flags) { f.hit = false; f.mat.color.setHex(f.color); }
  }

  updateRace(dt) {
    const { bike, hud, sfx } = this.ctx;
    const p = bike.pos;
    const dStart = Math.hypot(p.x - CIRCUIT_START[0], p.z - CIRCUIT_START[1]);
    if (dStart > 9) this.armed = true;
    if (!this.race) {
      if (bike.rider && this.armed && dStart < 5 && Math.abs(bike.speed) > 2) {
        this.race = { t: 0 };
        this.armed = false;
        this.resetFlags();
        sfx.whistle();
        hud.toast('🏁 Mulai! Lewati 3 bendera, balik ke garis start.', 'good', 3500);
      }
      return;
    }
    const r = this.race;
    r.t += dt;
    if (!bike.rider || r.t > 150) {
      this.race = null;
      this.el.timer.classList.add('hidden');
      hud.toast(!bike.rider ? '🏁 Turun dari motor, balapan batal.' : '🏁 Kelamaan, balapan batal.', '', 3000);
      return;
    }
    for (const f of this.flags) {
      if (!f.hit && Math.hypot(p.x - f.x, p.z - f.z) < 6.5) {
        f.hit = true;
        f.mat.color.setHex(0x3fd46a);
        if (sfx.ok()) sfx.tone(988, 0, 0.12, { type: 'triangle', vol: 0.12 });
      }
    }
    const hits = this.flags.filter((f) => f.hit).length;
    if (hits === this.flags.length && dStart < 5) {
      const t = r.t;
      const record = !this.best || t < this.best;
      if (record) { this.best = t; try { localStorage.setItem(BEST_KEY, String(t)); } catch { /* gak bisa simpan */ } }
      this.laps++;
      this.ctx.game.citra += 2;
      this.ctx.game.laps = this.laps;
      sfx.win();
      const n = this.ctx.fire.burning.size;
      hud.toast(record ? `🏁 Rekor baru ${fmt(t)}! Tayang: "Presiden Uji Sirkuit."` : `🏁 Lap ${fmt(t)} · terbaik ${fmt(this.best)}`, 'good', 4000);
      if (n >= 8) setTimeout(() => hud.toast(`🔥 ${n} petak kebakar. Satu lap lagi, Pak?`, 'satire', 3500), 2200);
      // langsung lanjut lap berikutnya
      r.t = 0;
      this.resetFlags();
    }
    this.el.timer.classList.remove('hidden');
    this.el.timer.innerHTML = `🏁 <b>${fmt(r.t)}</b> · ${hits}/${this.flags.length} bendera${this.best ? ` · terbaik ${fmt(this.best)}` : ''}`;
  }

  update(dt, playing) {
    this.confetti.update(dt);
    // pita jatuh ke dua arah abis digunting
    if (this.cutT >= 0) {
      this.cutT += dt;
      const k = Math.min(1, this.cutT / 0.45);
      const e = 1 - (1 - k) * (1 - k);
      this.pivots[0].rotation.z = -1.4 * e;
      this.pivots[1].rotation.z = 1.4 * e;
      if (!this.snapped && this.cutT > 0.7) { this.snapped = true; this.ctx.satire.flash(0.85); this.snapPending = true; }
    }
    if (this.poseT > 0) {
      this.poseT -= dt;
      if (this.poseT <= 0 && this.ctx.player.pose === 'cheer') this.ctx.player.pose = null;
    }
    // pita dipasang lagi, spanduknya ganti
    if (!this.ribbonUp) {
      this.resetT -= dt;
      if (this.resetT <= 0) {
        this.ribbonUp = true;
        this.cutT = -1;
        this.pivots[0].rotation.z = 0;
        this.pivots[1].rotation.z = 0;
        this.bow.visible = true;
        this.bannerIdx++;
        this.setBanner();
      }
    }
    if (playing) this.updateRace(dt);
    else if (this.race) { this.race = null; this.el.timer.classList.add('hidden'); }
  }
}
