// Pembakar & penebang: orang suruhan yang masuk dari luar peta.
// Mereka gak dilukai, cuma ditangkap. Tiap penangkapan = 1 bukti.
import * as THREE from 'three';
import { STATE, TYPE, clamp } from './config.js';
import { groundHeight } from './world.js';
import { addRatHead, addTie, addTail } from './rat.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeJerrycan, makeChainsaw } from './props.js';
import { recolorMaterial } from './characters.js';

// Model Meshy tikus (ASET-MESHY.md #2 & #3). Dimuat sekali, tiap pelaku dapat salinannya.
// Kalau belum kemuat pas pelaku muncul, pelaku itu pakai placeholder kotak.
// Kunci klip: idle, approach (mendekat), walk (kepancing umpan), run (kabur), act (beraksi),
// arrested (ditangkap), dizzy (pusing/kepeleset).
const RAT_HEIGHT = 1.95; // sedikit lebih pendek dari Pak Presiden (2.2)
const RAT_MODELS = {
  arsonist: {
    url: 'models/tikus-pembakar.glb',
    clips: {
      idle: 'Scheming_Hand_Rub', approach: 'Sneaky_Walk_inplace', walk: 'Walking', run: 'Running',
      act: 'CrouchLookAroundBow', arrested: 'CrouchLookAroundBow', dizzy: 'Unsteady_Walk_inplace',
    },
    approachPace: 1.6, // kecepatan (m/s) yang pas sama langkah animasi, buat ngatur timeScale
    runPace: 7,
  },
  logger: {
    url: 'models/tikus-penebang.glb',
    clips: {
      idle: 'Scheming_Hand_Rub', approach: 'Proud_Strut_inplace', walk: 'Walking', run: 'RunFast',
      act: 'Attack', arrested: 'Unsteady_Walk_inplace', dizzy: 'Unsteady_Walk_inplace',
    },
    approachPace: 1.8,
    runPace: 9,
  },
};
const loader = new GLTFLoader();
for (const [kind, m] of Object.entries(RAT_MODELS)) {
  loader.load(m.url, (g) => {
    const box = new THREE.Box3().setFromObject(g.scene);
    m.scale = RAT_HEIGHT / (box.max.y - box.min.y);
    m.gltf = g;
  }, undefined, (e) => console.warn(`${m.url} gagal dimuat, ${kind} pakai placeholder`, e));
}

// Barang bawaan di tangan kanan (Gelombang 4, dibikin lewat kode di props.js)
function buildProp(kind) {
  return kind === 'logger' ? makeChainsaw() : makeJerrycan();
}

// Tikus investor buat ending sawit: model tikus pembakar, dasinya diwarnain emas,
// gerakannya gosok-gosok tangan. Balikin { group, mixer } atau null kalau model belum kemuat.
export function makeInvestorRat() {
  const def = RAT_MODELS.arsonist;
  if (!def.gltf) return null;
  const model = cloneSkinned(def.gltf.scene);
  model.scale.setScalar(def.scale);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    // cuma merah pekat (dasi) yang diganti, telinga pink gak kena
    o.material = recolorMaterial(o.material, 'dasiEmas', 0.0, 0.12, 0.85, { minS: 0.55, maxL: 0.6 });
  });
  const group = new THREE.Group();
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = def.gltf.animations.find((c) => c.name === def.clips.idle);
  if (clip) mixer.clipAction(clip).play();
  mixer.setTime(Math.random() * 3);
  return { group, mixer };
}

function buildRatModel(kind) {
  const def = RAT_MODELS[kind];
  const g = new THREE.Group();
  const model = cloneSkinned(def.gltf.scene);
  model.scale.setScalar(def.scale);
  const bones = {};
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  g.add(model);
  g.updateMatrixWorld(true);
  // Jeriken / gergaji digantung di tangan kanan (posisi dihitung pas A-pose)
  const prop = buildProp(kind);
  g.add(prop);
  prop.position.copy(bones.RightHand.getWorldPosition(new THREE.Vector3())).y -= 0.2;
  bones.RightHand.attach(prop);
  const cuffs = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2 }));
  cuffs.position.set(0, 0.9, -0.25);
  cuffs.visible = false;
  g.add(cuffs);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [key, name] of Object.entries(def.clips)) {
    const clip = def.gltf.animations.find((c) => c.name === name);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  // legs/arms bohongan biar kode pose placeholder gak error
  const dummy = () => new THREE.Object3D();
  return { group: g, legs: [dummy(), dummy()], arms: [dummy(), dummy()], cuffs, model, mixer, actions, current: null, def };
}

// Titik masuk/keluar pelaku
export const ENTRIES = [
  { x: -64, z: 8, name: 'batas konsesi' },
  { x: 0, z: -77, name: 'ujung jalan utara' },
  { x: -50, z: -74, name: 'bekas lahan terbakar' },
];

const EVIDENCE = [
  'Jeriken PT Lahan Siap Tanam Kilat',
  'Transfer "uang bensin" Rp500 ribu',
  'Peta konsesi bertanda X',
  'Kuitansi "pembersihan lahan"',
  'Chat: "Bakar aja, Bos aman"',
];

const WALK = 3.2, RUN = 7.2;
const rnd = (a) => (Math.random() - 0.5) * 2 * a;

function buildPerson(kind) {
  const g = new THREE.Group();
  const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  // Tikus berdasi: pembakar pakai jas gelap, penebang pakai rompi hijau, dua-duanya berdasi
  const shirt = mat(kind === 'logger' ? 0x3d5a2a : 0x23232b);
  const pants = mat(kind === 'logger' ? 0x4a4a44 : 0x23232b);

  const legs = [-0.12, 0.12].map((x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.9, 0);
    g.add(p);
    add(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), pants, 0, -0.42, 0, p);
    add(new THREE.BoxGeometry(0.15, 0.1, 0.26), mat(0x222222), 0, -0.85, 0.04, p);
    return p;
  });
  add(new THREE.CapsuleGeometry(0.26, 0.48, 6, 12), shirt, 0, 1.3, 0);
  addRatHead(g, 1.92);
  addTie(g, 1.42, kind === 'logger' ? 0xf2c12e : 0xc4161c);
  addTail(g, 0.95);
  if (kind === 'logger') {
    add(new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c12e, 0.4), 0, 2.02, -0.03); // helm proyek
  }
  const arms = [-1, 1].map((side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.33, 1.58, 0);
    g.add(p);
    add(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), shirt, 0, -0.25, 0, p);
    return p;
  });
  // Barang bawaan di tangan kanan
  const prop = buildProp(kind);
  prop.position.set(0, kind === 'logger' ? -0.55 : -0.68, kind === 'logger' ? 0.2 : 0.05);
  arms[1].add(prop);
  // Borgol (muncul saat ditangkap)
  const cuffs = add(new THREE.TorusGeometry(0.08, 0.02, 6, 12), mat(0xcccccc, 0.2), 0, 1.0, -0.25);
  cuffs.visible = false;
  return { group: g, legs, arms, cuffs };
}

class Enemy {
  constructor(kind, scene, world, entry) {
    const b = RAT_MODELS[kind]?.gltf ? buildRatModel(kind) : buildPerson(kind);
    Object.assign(this, b);
    this.kind = kind;
    this.scene = scene;
    this.world = world;
    this.entry = entry;
    this.pos = new THREE.Vector3(entry.x, 0, entry.z);
    this.facing = 0;
    this.state = 'approach';
    this.timer = 0;
    this.acts = 0;
    this.wet = 0;
    this.phase = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.target = null;
    this.alive = true;
    scene.add(this.group);
  }
}

const NET_GEO = new THREE.SphereGeometry(0.85, 12, 8);
const NET_MAT = new THREE.MeshBasicMaterial({ color: 0xf0ead2, wireframe: true, transparent: true, opacity: 0.8 });

export class Enemies {
  constructor(scene, world, fire) {
    this.scene = scene;
    this.world = world;
    this.fire = fire;
    this.list = [];
    this.items = [];
    this.stats = { caught: 0, escaped: 0 };
    this.events = []; // pesan buat ditampilkan main.js
  }

  active() {
    return this.list.filter((e) => e.alive && e.state !== 'arrested');
  }

  spawn(kind, entryIndex) {
    const entry = ENTRIES[entryIndex ?? Math.floor(Math.random() * ENTRIES.length)];
    const e = new Enemy(kind, this.scene, this.world, entry);
    e.target = this.pickTarget(e, entry.x, entry.z, 16, 42);
    if (!e.target) { this.scene.remove(e.group); return null; }
    this.list.push(e);
    return e;
  }

  // Cari petak hutan buat dibakar/ditebang. Pembakar lebih suka gambut.
  pickTarget(e, x, z, minD, maxD) {
    const cands = [];
    for (const t of this.world.tiles) {
      if (!t.burnable || t.state !== STATE.FOREST) continue;
      if (e.kind === 'logger' && (t.type !== TYPE.FOREST || !t.colliders.length)) continue;
      const d = Math.hypot(t.cx - x, t.cz - z);
      if (d < minD || d > maxD) continue;
      const w = e.kind === 'arsonist' && t.type === TYPE.PEAT ? 3 : 1;
      for (let i = 0; i < w; i++) cands.push(t);
    }
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }

  // Ketahuan: kaget sebentar (kesempatan buat nyemprot), baru lari
  flee(e, surprised = true) {
    if (e.state === 'flee' || e.state === 'alert') return;
    e.state = surprised ? 'alert' : 'flee';
    e.timer = 0.8;
    this.events.push({ type: 'flee', enemy: e });
  }

  update(dt, player, bike) {
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.sayT > 0) { e.sayT -= dt; if (e.sayT <= 0) e.say = null; }
      if (e.freeze > 0) { e.freeze -= dt; this.pose(e, dt); continue; } // bengong dengar teriakan
      const pd = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);

      switch (e.state) {
        case 'approach':
        case 'act': {
          // Ketahuan: kabur. Lagi sibuk = jarak awasnya lebih pendek.
          if (pd < (e.state === 'act' ? 5 : 9)) { this.flee(e); break; }
          if (e.state === 'approach') {
            if (!e.target || e.target.state !== STATE.FOREST) {
              e.target = this.pickTarget(e, e.pos.x, e.pos.z, 4, 18);
              if (!e.target) { this.flee(e); break; }
            }
            if (this.moveTo(e, e.target.cx, e.target.cz, WALK, dt) < 1.6) { e.state = 'act'; e.timer = 0; }
          } else {
            e.timer += dt;
            const dur = e.kind === 'logger' ? 5 : 2.6;
            if (e.timer >= dur) {
              if (e.kind === 'logger') {
                this.world.setLogged(e.target);
                this.events.push({ type: 'logged', enemy: e });
              } else if (this.fire.ignite(e.target, 0.3)) {
                this.events.push({ type: 'ignite', enemy: e });
              } else if (e.target.wet) {
                e.say = 'Basah, Bos! Gak nyala!'; e.sayT = 2.5;
                this.events.push({ type: 'fizzle', enemy: e });
              }
              e.acts++;
              if (e.acts >= (e.kind === 'logger' ? 5 : 3)) { // balance 31 Okt 2026: pembakar 5→3 titik, penebang 6→5 pohon
                // tugas beres: pulang ambil bayaran, gak balik lagi
                e.done = true;
                e.say = 'Beres, Bos!'; e.sayT = 3;
                this.events.push({ type: 'done', enemy: e });
                this.flee(e, false);
              }
              else {
                e.target = e.kind === 'logger'
                  ? this.world.neighbors(e.target).find((n) => n.burnable && n.state === STATE.FOREST && n.type === TYPE.FOREST) || this.pickTarget(e, e.pos.x, e.pos.z, 3, 14)
                  : this.pickTarget(e, e.pos.x, e.pos.z, 7, 18);
                e.state = e.target ? 'approach' : 'flee';
              }
            }
          }
          break;
        }
        case 'flee': {
          const d = this.moveTo(e, e.entry.x, e.entry.z, RUN, dt);
          if (d < 2) {
            e.alive = false;
            this.scene.remove(e.group);
            this.stats.escaped++;
            this.events.push({ type: 'escaped', enemy: e });
          }
          break;
        }
        case 'lured': {
          // kepancing amplop / nasi kotak
          const l = e.lure;
          if (!l || l.portions <= 0 || l.t <= 0) { e.state = 'flee'; e.say = 'Yah, abis…'; e.sayT = 2.5; break; }
          if (this.moveTo(e, l.x, l.z, WALK * 1.4, dt) < 1.3) {
            l.portions--;
            // makan, lalu pusing lama: waktunya Bapak datang bawa jaring
            this.stun(e, 12, true);
            e.say = 'Aduh… kok pusing abis makan ini?';
            e.sayT = 4;
            e.dizzy = true;
            this.events.push({ type: 'nasi', enemy: e });
          }
          break;
        }
        case 'alert': {
          e.timer -= dt;
          e.facing = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z); // noleh ke pemain
          if (e.timer <= 0) e.state = 'flee';
          break;
        }
        case 'stunned': {
          e.timer -= dt;
          if (e.timer <= 0) { e.state = 'flee'; e.dizzy = false; e.group.rotation.x = 0; }
          break;
        }
        case 'arrested': {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.alive = false;
            this.scene.remove(e.group);
            // tiap tangkapan langsung jadi 1 bukti
            this.events.push({ type: 'evidence', name: e.evidence });
          }
          break;
        }
      }

      // Ditabrak motor = jatuh
      if (bike.rider && Math.abs(bike.speed) > 5 && ['approach', 'act', 'flee', 'alert', 'lured'].includes(e.state)) {
        if (Math.hypot(bike.pos.x - e.pos.x, bike.pos.z - e.pos.z) < 1.5) {
          this.stun(e, 3.2);
          bike.speed *= 0.4;
        }
      }
      this.pose(e, dt);
    }
    this.list = this.list.filter((e) => e.alive);
    this.updateItems(dt, player);
  }

  moveTo(e, x, z, speed, dt) {
    const dx = x - e.pos.x, dz = z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      let ax = dx / d, az = dz / d;
      // nyangkut di pohon? belok sedikit
      if (e.stuckT > 0) { const s = e.stuckSide; [ax, az] = [ax * 0.4 - az * s, az * 0.4 + ax * s]; e.stuckT -= dt; }
      e.pos.x += ax * speed * dt;
      e.pos.z += az * speed * dt;
      this.world.collide(e.pos, 0.4);
      e.facing = Math.atan2(ax, az);
      if (e.pos.distanceTo(e.lastPos) < speed * dt * 0.3 && e.stuckT <= 0) { e.stuckT = 0.6; e.stuckSide = Math.random() < 0.5 ? -1 : 1; }
      e.lastPos.copy(e.pos);
      e.moving = speed;
    }
    return d;
  }

  stun(e, time, silent = false) {
    const first = !silent && !this.stunnedOnce;
    if (!silent) this.stunnedOnce = true;
    e.state = 'stunned';
    e.timer = time;
    e.wet = 0;
    e.lure = null;
    if (!silent) this.events.push({ type: 'stunned', enemy: e, first });
  }

  // Umpan dilempar: pelaku di sekitar lari ke umpan. Balikin jumlah yang kepancing.
  lure(l, r) {
    let n = 0;
    for (const e of this.list) {
      if (!e.alive || !['approach', 'act', 'flee', 'alert'].includes(e.state)) continue;
      if (Math.hypot(e.pos.x - l.x, e.pos.z - l.z) > r) continue;
      e.state = 'lured';
      e.lure = l;
      e.freeze = 0;
      e.say = 'Nasi MBG gratis?!';
      e.sayT = 2;
      n++;
    }
    return n;
  }

  // Semprotan air kena pelaku: kalau kena cukup lama, pelaku terpeleset
  sprayHit(origin, dir, reach, dt) {
    for (const e of this.list) {
      if (!e.alive || e.state === 'stunned' || e.state === 'arrested') continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 2 || d < 0.1) continue;
      if ((dx * dir.x + dz * dir.z) / d < 0.72) continue;
      e.wet += dt;
      if (e.wet > 0.2) this.stun(e, 4);
    }
  }

  // Teriakan: pelaku di sekitar bengong sebentar
  startle(pos, r, time) {
    for (const e of this.list) {
      if (!e.alive || !['approach', 'act', 'flee', 'alert'].includes(e.state)) continue;
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r) e.freeze = time;
    }
  }

  // Blitz kamera: pelaku di depan silau sebentar
  flash(origin, dir, reach) {
    let n = 0;
    for (const e of this.list) {
      if (!e.alive || e.state === 'stunned' || e.state === 'arrested') continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || (d > 1 && (dx * dir.x + dz * dir.z) / d < 0.5)) continue;
      this.stun(e, 2.5);
      n++;
    }
    return n;
  }

  // Pelaku yang bisa diborgol di dekat pemain
  arrestable(pos) {
    return this.list.find((e) => {
      if (!e.alive) return false;
      const d = Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z);
      return (e.state === 'stunned' && d < 2.4) || (e.state === 'act' && d < 1.8);
    });
  }

  arrest(e, how = 'borgol') {
    e.how = how;
    e.state = 'arrested';
    e.timer = 2.2;
    e.cuffs.visible = true;
    e.group.rotation.x = 0;
    if (how === 'jaring' && !e.net) {
      // jaring nutupin badan, tikusnya meronta
      e.net = new THREE.Mesh(NET_GEO, NET_MAT);
      e.net.position.y = 1.05;
      e.net.scale.set(1, 1.25, 1);
      e.group.add(e.net);
    }
    this.stats.caught++;
    e.evidence = EVIDENCE[(this.stats.caught - 1) % EVIDENCE.length];
    this.events.push({ type: 'arrested', enemy: e });
  }

  dropEvidence(pos) {
    const mesh = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xf2c12e, emissive: 0xf2a020, emissiveIntensity: 0.8 })
    );
    mesh.add(box);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.85;
    mesh.add(ring);
    mesh.position.set(pos.x, groundHeight(pos.x, pos.z) + 1, pos.z);
    this.scene.add(mesh);
    const name = EVIDENCE[(this.stats.caught - 1) % EVIDENCE.length];
    this.items.push({ mesh, name, t: 0 });
  }

  updateItems(dt, player) {
    for (const it of this.items) {
      it.t += dt;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.children[0].position.y = Math.sin(it.t * 3) * 0.12;
      if (Math.hypot(player.pos.x - it.mesh.position.x, player.pos.z - it.mesh.position.z) < 2.4) {
        it.taken = true;
        this.scene.remove(it.mesh);
        this.events.push({ type: 'evidence', name: it.name });
      }
    }
    this.items = this.items.filter((it) => !it.taken);
  }

  // Pose buat pelaku yang pakai model Meshy
  poseModel(e, dt) {
    const gy = groundHeight(e.pos.x, e.pos.z);
    e.group.position.set(e.pos.x, gy, e.pos.z);
    e.group.rotation.set(0, e.facing, 0);
    const moving = (e.state === 'approach' || e.state === 'flee' || e.state === 'lured') ? (e.moving || 0) : 0;
    let key = 'idle', ts = 1;
    if (e.state === 'act' || e.state === 'arrested') key = e.state;
    else if (e.state === 'stunned') key = 'dizzy';
    else if (moving > 0) {
      if (e.state === 'flee') { key = 'run'; ts = clamp(moving / e.def.runPace, 0.8, 1.5); }
      else if (e.state === 'lured') { key = 'walk'; ts = clamp(moving / 2.4, 0.8, 2); }
      else { key = 'approach'; ts = clamp(moving / e.def.approachPace, 0.8, 2.2); }
    }
    const next = e.actions[key] || e.actions.idle;
    if (next && next !== e.current) {
      next.reset().fadeIn(0.2).play();
      if (e.current) e.current.fadeOut(0.2);
      e.current = next;
    }
    if (next) next.timeScale = ts;
    e.mixer.update(dt);

    if (e.state === 'stunned' && e.dizzy) {
      e.group.rotation.z = Math.sin(performance.now() / 250) * 0.12; // pusing abis makan
    } else if (e.state === 'stunned') {
      e.group.rotation.x = -Math.PI / 2; // terpeleset, rebahan
      e.group.position.y = gy + 0.3;
    }
    if (e.state === 'arrested' && e.net) {
      e.group.rotation.z = Math.sin(performance.now() * 0.028 + e.phase) * Math.min(1, e.timer) * 0.16; // meronta
    }
    e.moving = 0;
  }

  pose(e, dt) {
    if (e.model) return this.poseModel(e, dt);
    const gy = groundHeight(e.pos.x, e.pos.z);
    e.group.position.set(e.pos.x, gy, e.pos.z);
    e.group.rotation.y = e.facing;
    const moving = (e.state === 'approach' || e.state === 'flee' || e.state === 'lured') ? (e.moving || 0) : 0;
    e.phase += dt * moving * 2;
    const swing = Math.sin(e.phase) * (moving ? Math.min(1, moving / 4) * 0.8 : 0);
    e.legs[0].rotation.x = swing;
    e.legs[1].rotation.x = -swing;
    e.arms[0].rotation.x = -swing;
    e.arms[1].rotation.x = swing;
    if (e.state === 'act') {
      // Pembakar menuang bensin, penebang mengayun gergaji
      e.arms[1].rotation.x = e.kind === 'logger' ? -1.2 + Math.sin(e.timer * 18) * 0.15 : -0.9 + Math.sin(e.timer * 4) * 0.3;
      e.arms[0].rotation.x = -0.6;
    }
    if (e.state === 'stunned' && e.dizzy) {
      // pusing abis makan MBG: duduk sambil goyang
      e.legs[0].rotation.x = e.legs[1].rotation.x = -1.4;
      e.group.position.y = gy - 0.45;
      e.group.rotation.x = 0;
      e.group.rotation.z = Math.sin(performance.now() / 250) * 0.25;
    } else if (e.state === 'stunned') {
      e.group.rotation.x = -Math.PI / 2; // terpeleset, rebahan
      e.group.position.y = gy + 0.3;
    } else {
      e.group.rotation.z = 0;
    }
    if (e.state === 'arrested') {
      e.legs[0].rotation.x = e.legs[1].rotation.x = -1.4; // berlutut
      e.group.position.y = gy - 0.45;
      e.arms[0].rotation.x = e.arms[1].rotation.x = 0.5;
      if (e.net) {
        const w = Math.sin(performance.now() * 0.028 + e.phase) * Math.min(1, e.timer);
        e.group.rotation.z = w * 0.16;
        e.arms[0].rotation.x = 0.5 + w * 0.8;
        e.arms[1].rotation.x = 0.5 - w * 0.8;
      }
    }
    e.moving = 0;
  }
}
