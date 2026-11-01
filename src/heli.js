// Helikopter water bombing: bantuan sekali pakai buat kobaran besar (Level 3).
// Dipanggil dari Peta Titik Panas, terbang ke target, menumpahkan air, lalu pergi.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { Particles, makeSoftTexture } from './particles.js';
import { makeLabel } from './dozer.js';
import { swapInModel } from './models.js';

const SPEED = 32;
const HEIGHT = 24; // ketinggian jelajah
const DROP_HEIGHT = 15; // turun pas nyiram biar kelihatan di atas pucuk pohon
const RADIUS = 15; // jangkauan siraman (lingkaran 30 m, mirip jejak ember heli asli)
const FALL_DELAY = 0.7; // detik air jatuh dari ember sampai nyentuh tanah
const SPREAD_TIME = 1.1; // basahnya nyebar dari tengah ke pinggir lingkaran

function buildHeli() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1 });
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  add(new THREE.CapsuleGeometry(1.2, 2.6, 8, 16), body, 0, 0, 0).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(1.05, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.1, 1.6).rotation.x = Math.PI / 2.4;
  add(new THREE.CylinderGeometry(0.25, 0.45, 5, 10), white, 0, 0.3, -3.8).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.1, 1.2, 0.8), body, 0, 0.9, -6.1);
  for (const x of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.12, 0.12, 3.4), dark, x, -1.55, 0.2);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.45, 0);
  g.add(rotor);
  add(new THREE.BoxGeometry(11, 0.06, 0.4), dark, 0, 0, 0, rotor);
  add(new THREE.BoxGeometry(0.4, 0.06, 11), dark, 0, 0, 0, rotor);
  const tail = new THREE.Group();
  tail.position.set(0.2, 0.9, -6.1);
  g.add(tail);
  add(new THREE.BoxGeometry(0.05, 1.6, 0.2), dark, 0, 0, 0, tail);
  // Ember air (bambi bucket) tergantung tali
  add(new THREE.CylinderGeometry(0.02, 0.02, 6, 4), dark, 0, -4.4, 0);
  const bucket = add(new THREE.CylinderGeometry(0.9, 0.6, 1.2, 14), new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.6 }), 0, -7.8, 0);
  const rope = g.children[g.children.indexOf(bucket) - 1];
  const lbl = makeLabel(['SATGAS UDARA', 'Water Bombing'], { w: 1.6, h: 0.6, bg: '#e8661c' });
  lbl.position.set(1.22, 0, 0);
  lbl.rotation.y = Math.PI / 2;
  g.add(lbl);
  return { group: g, rotor, tail, bucket, rope, lbl };
}

export class Heli {
  constructor(scene, fire) {
    const b = buildHeli();
    Object.assign(this, b);
    this.scene = scene;
    this.fire = fire;
    this.group.visible = false;
    scene.add(this.group);
    // Model Meshy (ASET-MESHY.md #8): badan dari Meshy, baling-baling (muter), tali, ember & label dari kode
    swapInModel(this.group, 'heli', { length: 8.5 }, [this.rotor, this.bucket, this.rope, this.lbl]).then((m) => {
      if (!m) return;
      m.position.y = -1.7; // titik tengah grup = badan, skid di bawah
      const box = m.userData.box;
      this.rotor.position.y = box.max.y - 1.7 + 0.05;
      this.lbl.position.set(box.max.x * 0.9 + 0.03, -0.4, 0.4);
      // cakram blur baling-baling utama (kesan muter kencang) + baling-baling ekor
      const blurMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40).rotateX(-Math.PI / 2), blurMat);
      disc.position.y = this.rotor.position.y + 0.02;
      this.group.add(disc);
      this.tailRotor = new THREE.Group();
      this.tailRotor.position.set(0.22, box.max.y * 0.55 - 1.7, box.min.z + 0.35);
      const tdisc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24).rotateY(Math.PI / 2), blurMat);
      const tblade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      this.tailRotor.add(tdisc, tblade);
      this.group.add(this.tailRotor);
    });
    this.state = 'idle';
    this.enabled = false;
    this.events = [];
    this.pos = new THREE.Vector3();
    this.water = new Particles(1800, { map: makeSoftTexture('flame'), gravity: -18, drag: 0.1 });
    this.water.points.renderOrder = 4;
    scene.add(this.water.points);
    this.dust = new Particles(500, { map: makeSoftTexture('smoke'), gravity: 0.6, drag: 1.4 });
    scene.add(this.dust.points);
    this.mist = new Particles(700, { map: makeSoftTexture('smoke'), gravity: 0.5, drag: 1.3 }); // kabut & cipratan di tanah
    this.mist.points.renderOrder = 4;
    scene.add(this.mist.points);
    this.heading = 0;
    this.bank = 0;
    this.age = 0;
  }

  // Tanpa batas jatah: bisa dipanggil lagi begitu selesai nyiram (pas lagi pergi pun bisa)
  get available() {
    return this.enabled && (this.state === 'idle' || this.state === 'outbound');
  }

  dispatch(x, z) {
    if (!this.available) return false;
    this.target = new THREE.Vector3(x, groundHeight(x, z) + DROP_HEIGHT, z);
    if (this.state === 'idle') this.pos.set(x + 140, groundHeight(x, z) + HEIGHT + 15, z + 70); // datang dari luar peta
    this.state = 'inbound';
    this.heading = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z); // langsung ngadep tujuan
    this.group.visible = true;
    this.events.push({ type: 'dispatched' });
    return true;
  }

  // perkiraan detik sampai tiba di target
  get eta() {
    return this.state === 'inbound' ? this.pos.distanceTo(this.target) / SPEED : 0;
  }

  update(dt) {
    this.age += dt;
    this.rotor.rotation.y += dt * 30;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 45;
    let speed = 0;
    if (this.state === 'inbound' || this.state === 'outbound') {
      const to = this.state === 'inbound' ? this.target : this.exit;
      const d = to.clone().sub(this.pos);
      const flat = Math.hypot(d.x, d.z);
      const step = SPEED * dt;
      // melambat & turun pas mendekati target
      const slow = this.state === 'inbound' ? Math.min(1, 0.35 + flat / 60) : 1;
      if (d.length() <= step * slow) {
        this.pos.copy(to);
        if (this.state === 'inbound') { this.state = 'drop'; this.timer = 2.8; this.dropT = 0; this.dropSaved = 0; this.dropHit = false; this.dropDone = false; }
        else { this.state = 'idle'; this.group.visible = false; this.events.push({ type: 'gone' }); }
      } else {
        this.pos.addScaledVector(d.normalize(), step * slow);
        speed = slow;
        // belok halus + miring ke arah belokan
        const want = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
        const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
        const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
        this.heading += turn;
        this.bank += ((-turn / Math.max(dt, 1e-3)) * 0.25 - this.bank) * Math.min(1, dt * 3);
      }
    } else if (this.state === 'drop') {
      this.timer -= dt;
      this.dropT += dt;
      this.pour(dt);
      if (this.timer <= 0) {
        this.state = 'outbound';
        this.exit = this.pos.clone().add(new THREE.Vector3(-150, 22, -90));
      }
    }
    // pose: nunduk sesuai kecepatan, miring pas belok, goyang pelan pas melayang
    this.bank *= Math.exp(-dt * 1.5);
    const hover = this.state === 'drop' ? 1 : 0.3;
    this.group.rotation.set(
      speed * 0.2 + Math.sin(this.age * 1.3) * 0.02 * hover,
      this.heading,
      Math.max(-0.35, Math.min(0.35, this.bank)) + Math.sin(this.age * 0.9) * 0.025 * hover,
      'YXZ'
    );
    this.group.position.copy(this.pos);
    this.group.position.y += Math.sin(this.age * 1.7) * 0.25 * hover;
    // angin baling-baling: debu & daun kering beterbangan kalau heli cukup rendah
    if (this.group.visible) {
      const gy = groundHeight(this.pos.x, this.pos.z);
      const h = this.pos.y - gy;
      if (h < 30) {
        const n = Math.round((1 - h / 30) * 10);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 5;
          const out = 6 + Math.random() * 6;
          const leaf = Math.random() < 0.35;
          this.dust.spawn(this.pos.x + Math.cos(a) * r, gy + 0.3, this.pos.z + Math.sin(a) * r,
            Math.cos(a) * out, 0.5 + Math.random() * 2, Math.sin(a) * out, 1.4 + Math.random(), leaf ? 0.25 : 1.2, leaf ? 0.25 : 3.2,
            leaf ? [0.55, 0.42, 0.2] : [0.62, 0.55, 0.42], leaf ? [0.45, 0.33, 0.15] : [0.5, 0.45, 0.36], leaf ? 0.9 : 0.35);
        }
      }
    }
    this.dust.update(dt);
    this.water.update(dt);
    this.mist.update(dt);
  }

  // Siraman: tirai air dari ember melebar sampai nutup lingkaran RADIUS.
  // Api baru padam pas airnya nyentuh tanah, nyebar dari tengah ke pinggir.
  pour(dt) {
    const t = this.dropT;
    const b = this.bucket.getWorldPosition(new THREE.Vector3());
    const gy = groundHeight(this.target.x, this.target.z);
    if (t < 2.1) {
      // tiap butir air diarahin ke titik acak di dalam lingkaran, jadi sebarannya pas sama jangkauan
      const h = Math.max(2, b.y - gy);
      const vy = 5;
      const fall = (-vy + Math.sqrt(vy * vy + 36 * h)) / 18; // waktu jatuh (gravitasi 18)
      const reach = RADIUS * Math.min(1, 0.3 + t / 0.7); // tirai melebar pas ember dibuka
      for (let i = 0; i < 45; i++) {
        const a = Math.random() * Math.PI * 2, r = reach * Math.sqrt(Math.random());
        const k = (r / fall) * 1.06; // dikit dilebihin buat ngimbangin hambatan udara
        this.water.spawn(b.x + Math.cos(a) * 0.4, b.y - 0.5, b.z + Math.sin(a) * 0.4,
          Math.cos(a) * k, -vy - Math.random() * 1.5, Math.sin(a) * k, fall + 0.15, 0.9, 2.8, [0.8, 0.92, 1], [0.65, 0.82, 0.95], 0.55);
      }
    }
    if (t < FALL_DELAY || this.dropDone) return;
    if (!this.dropHit) { this.dropHit = true; this.events.push({ type: 'impact' }); }
    const ring = RADIUS * Math.min(1, (t - FALL_DELAY) / SPREAD_TIME);
    // kabut & cipratan di tanah, ngikutin batas yang udah basah
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = ring * Math.sqrt(Math.random());
      const x = this.target.x + Math.cos(a) * r, z = this.target.z + Math.sin(a) * r;
      const out = 1 + Math.random() * 2;
      this.mist.spawn(x, groundHeight(x, z) + 0.4, z, Math.cos(a) * out, 0.8 + Math.random() * 1.5, Math.sin(a) * out,
        1.4 + Math.random(), 1.6, 5.5, [0.92, 0.95, 1], [0.78, 0.82, 0.86], 0.4);
    }
    for (const tile of [...this.fire.burning]) {
      if (Math.hypot(tile.cx - this.target.x, tile.cz - this.target.z) < ring && this.fire.water(tile, 5)) this.dropSaved++;
    }
    if (ring >= RADIUS) {
      this.dropDone = true;
      this.events.push({ type: 'dropped', saved: this.dropSaved });
    }
  }
}
