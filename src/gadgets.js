// Dua alat buat nangkep pelaku. Tombol X pakai, D-pad ◀ ▶ ganti.
// 🕸️ Jaring: buat yang diuber, kena = langsung ketangkap.
// 🍱 Nasi MBG: jebakan. Pelaku di sekitar datang sendiri, makan, lalu pusing lama.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { makeEnvelope, makeRiceBox } from './props.js';

export const GADGETS = [
  { id: 'jaring', icon: '🕸️', name: 'Jaring', cd: 5, desc: 'Lempar ke pelaku yang kabur' },
  { id: 'nasi', icon: '🍱', name: 'Nasi MBG', cd: 20, desc: 'Jebakan: pelaku makan, terus pusing' },
];
const LURE_RADIUS = 30; // pelaku dalam jarak ini nyamperin MBG
const LURE_TIME = 35; // detik MBG bertahan di tanah
const PORTIONS = 3; // satu kotak cukup buat 3 pelaku

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  m.castShadow = true;
  return m;
}

function buildItem(kind) {
  const g = new THREE.Group();
  if (kind === 'amplop') {
    g.add(makeEnvelope());
  } else if (kind === 'nasi') {
    const tray = makeRiceBox(); // ompreng MBG
    tray.scale.setScalar(1.4); // dibesarin dikit biar kebaca dari kamera
    g.add(tray);
  } else {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, wireframe: true }));
    g.add(ball);
  }
  return g;
}

function buildNet() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6),
    new THREE.MeshStandardMaterial({ color: 0xcfc6a8, wireframe: true })
  );
  m.position.y = 0.4;
  return m;
}

export class Gadgets {
  constructor(ctx) {
    this.ctx = ctx; // { scene, player, enemies, hud, sfx, satire }
    this.idx = 0;
    this.cd = {};
    this.flying = [];
    this.lures = [];
    this.nets = [];
  }

  get current() {
    return GADGETS[this.idx];
  }

  cycle(dir) {
    this.idx = (this.idx + dir + GADGETS.length) % GADGETS.length;
    if (this.ctx.sfx) this.ctx.sfx.weaponSwap();
    this.showSwap();
  }

  // Popup besar di tengah layar: ikon, nama, keterangan, slot
  showSwap() {
    const g = this.current;
    const el = document.getElementById('weaponSwap');
    if (!el) return;
    document.getElementById('wsIcon').textContent = g.icon;
    document.getElementById('wsName').textContent = g.name.toUpperCase();
    const use = this.keyLabel ? ` · ${this.keyLabel('blitz')} pakai` : '';
    document.getElementById('wsDesc').textContent = g.desc + use;
    document.getElementById('wsSlots').innerHTML = GADGETS.map((x, i) => `<i class="${i === this.idx ? 'on' : ''}"></i>`).join('');
    el.classList.remove('show');
    void el.offsetWidth; // ulang animasi
    el.classList.add('show');
  }

  ready(id = this.current.id) {
    return !(this.cd[id] > 0);
  }

  use() {
    const g = this.current;
    const { hud } = this.ctx;
    if (!this.ready()) {
      hud.toast(`${g.icon} Belum siap (${Math.ceil(this.cd[g.id])} dtk).`, '', 1500);
      return;
    }
    this.cd[g.id] = g.cd;
    this.throwItem(g.id);
  }

  throwItem(kind) {
    const { player, scene, sfx } = this.ctx;
    const f = player.forward().clone();
    const from = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(f, 0.6);
    const mesh = buildItem(kind);
    mesh.position.copy(from);
    scene.add(mesh);
    // jaring melesat lurus & cepat, nasi dilempar melengkung
    const vel = kind === 'jaring' ? f.clone().multiplyScalar(26).add(new THREE.Vector3(0, 2, 0)) : f.clone().multiplyScalar(13).add(new THREE.Vector3(0, 6.5, 0));
    this.flying.push({ kind, mesh, vel, t: 0 });
    if (sfx) sfx.whoosh();
  }

  update(dt) {
    const { enemies, scene, hud, sfx } = this.ctx;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);

    // Barang yang lagi terbang
    for (const p of this.flying) {
      p.t += dt;
      p.vel.y -= (p.kind === 'jaring' ? 6 : 16) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.z += dt * 5;
      const pos = p.mesh.position;
      if (p.kind === 'jaring') {
        // kena pelaku pertama yang dilewati
        // kena pelaku pertama yang dilewati = langsung ketangkap
        const hit = enemies.list.find((e) => e.alive && e.state !== 'arrested' && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 1.5);
        if (hit) {
          const net = buildNet();
          hit.group.add(net);
          this.nets.push({ e: hit, net });
          enemies.arrest(hit, 'jaring');
          if (sfx) sfx.net();
          p.done = true;
        }
      }
      const gy = groundHeight(pos.x, pos.z);
      if (!p.done && (pos.y <= gy + 0.1 || p.t > 3)) {
        p.done = true;
        if (p.kind !== 'jaring') this.dropLure(p.kind, pos.x, pos.z);
      }
      if (p.done) scene.remove(p.mesh);
    }
    this.flying = this.flying.filter((p) => !p.done);

    // Jaring ikut hilang bareng pelaku yang dibawa
    for (const n of this.nets) {
      if (!n.e.alive) { n.e.group.remove(n.net); n.gone = true; }
    }
    this.nets = this.nets.filter((n) => !n.gone);

    // Nasi MBG di tanah: terus narik pelaku yang lewat sampai porsinya habis
    for (const l of this.lures) {
      l.t -= dt;
      l.mesh.rotation.y += dt;
      if (l.portions > 0 && l.t > 0) {
        const n = enemies.lure(l, LURE_RADIUS);
        if (n) hud.toast(`🍱 ${n} pelaku nyamperin Nasi MBG.`, 'satire', 2500);
      }
      if (l.t <= 0 || l.portions <= 0) { scene.remove(l.mesh); l.gone = true; }
    }
    this.lures = this.lures.filter((l) => !l.gone);
  }

  dropLure(kind, x, z) {
    const { scene, enemies, hud } = this.ctx;
    const mesh = buildItem(kind);
    mesh.position.set(x, groundHeight(x, z) + 0.02, z);
    scene.add(mesh);
    const lure = { kind, x, z, mesh, t: LURE_TIME, portions: PORTIONS };
    this.lures.push(lure);
    const n = enemies.lure(lure, LURE_RADIUS);
    hud.toast(n ? `🍱 Jebakan siap. ${n} pelaku nyamperin.` : '🍱 Jebakan siap. Tunggu pelaku lewat.', 'satire', 3000);
  }

  // Status buat HUD
  label(l) {
    this.keyLabel = l; // disimpen buat popup ganti alat
    const g = this.current;
    const st = this.ready() ? '<b>siap</b>' : `${Math.ceil(this.cd[g.id])} dtk`;
    return `<span class="g-ic">${g.icon}</span> ${g.name} · ${st} <span class="g-keys">${l('blitz')} pakai · ${l('gadgetPrev')} ${l('gadgetNext')} ganti</span>`;
  }
}
