import * as THREE from 'three';
import { clamp } from './config.js';
import { groundHeight, WATER_Y } from './world.js';
import { Particles, makeSoftTexture } from './particles.js';
import { aimBone, loadChar } from './characters.js';
import { makeBackTank } from './props.js';
import { loadModel as loadGear, markHeroReady } from './models.js';

// Model Meshy (ASET-MESHY.md #1, file models/presiden.glb). Nama klip = nama animasi di file GLB.
const MODEL_HEIGHT = 2.2; // disamain sama tinggi placeholder biar pas sama motor, pintu, dll.
const CLIPS = {
  idle: 'Idle_9',
  look: 'Long_Breathe_and_Look_Around',
  walk: 'Walking',
  run: 'Running',
  wave: 'Wave_One_Hand',
  cheer: 'Victory_Cheer',
};

// Placeholder Pak Presiden dari bentuk dasar. Dipakai sampai model Meshy selesai dimuat
// (atau kalau file GLB-nya gak ada).
function buildPresident() {
  const g = new THREE.Group();
  const mat = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const shirt = mat(0xf2f0ea, 0.8);
  const pants = mat(0x1d1f24);
  const skin = mat(0xc08a63, 0.6);
  const black = mat(0x111111, 0.5);
  const shoe = mat(0x2b1a10, 0.35);

  const mesh = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };

  // Kaki (pivot di pinggul biar bisa diayun)
  const legs = [-0.13, 0.13].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.92, 0);
    g.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.11, 0.62, 4, 10), pants, 0, -0.42, 0, pivot);
    mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoe, 0, -0.86, 0.05, pivot);
    return pivot;
  });

  mesh(new THREE.CapsuleGeometry(0.29, 0.5, 6, 14), shirt, 0, 1.33, 0); // badan, kemeja putih
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), black, 0, 1.0, 0); // ikat pinggang
  mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10), skin, 0, 1.78, 0); // leher
  mesh(new THREE.SphereGeometry(0.21, 20, 16), skin, 0, 1.97, 0); // kepala
  mesh(new THREE.CylinderGeometry(0.19, 0.205, 0.16, 24), black, 0, 2.14, -0.01); // peci
  mesh(new THREE.SphereGeometry(0.025, 8, 8), black, -0.075, 2.0, 0.19); // mata
  mesh(new THREE.SphereGeometry(0.025, 8, 8), black, 0.075, 2.0, 0.19);

  // Lengan
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 1.62, 0);
    g.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 10), shirt, 0, -0.27, 0, pivot);
    mesh(new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.56, 0, pivot);
    return pivot;
  });

  // Tangki air di punggung + selang di tangan kanan
  const backTank = makeBackTank(); // props.js (Gelombang 4)
  backTank.position.set(0, 1.4, -0.36);
  g.add(backTank);
  const tank = [backTank];
  // searah lengan, jadi pas lengan diangkat ke depan, ujung selang ikut ke depan
  const nozzle = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.38, 10), black, 0, -0.78, 0.02, arms[1]);

  return { group: g, legs, arms, nozzle, tank };
}

const tmp = new THREE.Vector3();
const _a = new THREE.Vector3();

export class Player {
  constructor(scene) {
    const p = buildPresident();
    this.group = p.group;
    this.legs = p.legs;
    this.arms = p.arms;
    this.nozzle = p.nozzle;
    this.tank = p.tank;
    scene.add(this.group);

    this.model = null; // diisi pas GLB selesai dimuat
    this.pose = null;  // 'wave' / 'cheer' buat adegan ending
    this.idleT = 0;
    this.sprayW = 0;   // 0..1, lengan kanan ngarah ke depan pas nyiram
    this.scene = scene;
    this.group.visible = false; // muncul begitu model Meshy siap (atau placeholder kalau gagal)
    this.loadModel();

    this.pos = new THREE.Vector3(-6, 0, 12);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI; // menghadap -z
    this.water = 100;
    this.tankMax = 100;
    this.spraying = false;
    this.phase = 0;
    this.radius = 0.45;

    this.spray = new Particles(900, { map: makeSoftTexture('flame'), gravity: -14, drag: 0.4 });
    this.spray.points.renderOrder = 4;
    scene.add(this.spray.points);
  }

  loadModel() {
    // Presiden + perlengkapan Meshy (ASET-MESHY.md #12c) dimuat bareng, biar bisa ditempel pas pose A
    // `this.ready` selesai pas presiden udah kelihatan; menu nunggu ini sebelum tombol mulai aktif.
    this.ready = Promise.all([
      loadChar('presiden'),
      loadGear('tangki-punggung'),
      loadGear('alat-semprot'),
    ]).then(([gltf, tankG, lanceG]) => {
      if (!gltf) throw new Error('presiden.glb kosong');
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(MODEL_HEIGHT / (box.max.y - box.min.y));
      const bones = {};
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
        if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
      });

      // Sembunyiin badan placeholder, sisain tangki & selang
      const keep = new Set([this.nozzle]);
      for (const t of this.tank) t.traverse((o) => keep.add(o));
      this.group.traverse((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; });
      // Pose awal (A-pose) dipakai buat nempelin tangki & selang ke tulang
      const saved = [this.group.position.clone(), this.group.rotation.clone()];
      this.group.position.set(0, 0, 0);
      this.group.rotation.set(0, 0, 0);
      this.group.add(model);
      this.group.updateMatrixWorld(true);
      for (const m of this.tank) { m.position.z += 0.03; m.position.y -= 0.05; bones.Spine2.attach(m); }
      // Selang searah lengan bawah (dihitung dari posisi tulang pas A-pose), lalu ditempel ke tangan
      const hand = bones.RightHand.getWorldPosition(new THREE.Vector3());
      const dir = hand.clone().sub(bones.RightForeArm.getWorldPosition(new THREE.Vector3())).normalize();
      this.group.attach(this.nozzle);
      this.nozzle.position.copy(hand).addScaledVector(dir, 0.12);
      this.nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      bones.RightHand.attach(this.nozzle);
      if (tankG && lanceG) this.attachGear(bones, tankG, lanceG, hand, dir, model);
      this.group.position.copy(saved[0]);
      this.group.rotation.copy(saved[1]);

      this.mixer = new THREE.AnimationMixer(model);
      this.actions = {};
      for (const [key, name] of Object.entries(CLIPS)) {
        const clip = gltf.animations.find((c) => c.name === name);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      this.bones = bones;
      this.model = model;
      this.current = null;
      this.play('idle', 0);
      this.group.visible = true;
    }).catch((e) => {
      console.warn('presiden.glb gagal dimuat, pakai placeholder', e);
      this.group.visible = true;
    }).finally(markHeroReady);
  }

  // Tangki Meshy di punggung + alat semprot di tangan kanan + selang lentur di antaranya.
  // Dipanggil pas model presiden masih pose A dan grupnya di titik nol.
  attachGear(bones, tankG, lanceG, hand, dir, body) {
    const fit = (g) => {
      const o = g.scene.clone(true);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      return o;
    };
    // --- tangki: tinggi 0,62 m (badan presiden dari pinggul ke bahu cuma ±0,52 m; 0,8 m dulu nyampe pantat),
    // tali ngadep badan (+z), nempel di punggung
    const tank = fit(tankG);
    let b = new THREE.Box3().setFromObject(tank);
    tank.scale.setScalar(0.62 / (b.max.y - b.min.y));
    tank.rotation.y = Math.PI; // model Meshy: tali di -z
    const tw = new THREE.Group();
    tw.add(tank);
    tw.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(tank);
    // titik nol = tengah sisi tali (yang nempel punggung)
    tank.position.set(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -b.max.z);
    const hw = (b.max.x - b.min.x) / 2, hh = (b.max.y - b.min.y) / 2, dp = b.max.z - b.min.z;
    const outlet = new THREE.Object3D(); // keluaran selang di bawah tangki, sisi kanan badan (-x)
    outlet.position.set(-hw * 0.45, -hh + 0.05, -dp * 0.45);
    tw.add(outlet);
    // ukur permukaan badan (pose A) buat naruh tangki rapet & bikin tali ransel yang pas
    // cuma kulit/baju presiden (bukan tangki lama atau barang lain yang nempel di tulang)
    const skins = [];
    body.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); skins.push(o); } });
    const ray = new THREE.Raycaster();
    const hit = (from, to, fallback) => {
      ray.set(from, to.clone().normalize());
      const h = ray.intersectObjects(skins, false)[0];
      return h ? h.point : fallback;
    };
    hit.all = (from, to) => { ray.set(from, to.clone().normalize()); return ray.intersectObjects(skins, false); };
    // atas tangki sejajar pangkal leher, kayak tangki semprot yang digendong beneran
    const tankTop = bones.Neck.getWorldPosition(new THREE.Vector3()).y + 0.02;
    const cy = tankTop - hh;
    const backZ = hit(new THREE.Vector3(0, cy, -2), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -0.17)).z;
    tw.position.set(0, cy, backZ - 0.01);
    this.group.add(tw);
    tw.updateMatrixWorld(true);
    const tankBack = backZ - 0.01;
    this.buildStraps(hit, bones, tankTop, tankBack, hw, tankTop - 2 * hh);
    bones.Spine2.attach(tw);
    for (const t of this.tank) t.visible = false; // tangki kode lama gak dipakai lagi

    // --- alat semprot: panjang 1 m, ujung nozzle searah lengan bawah, gagang di genggaman
    const lance = fit(lanceG);
    b = new THREE.Box3().setFromObject(lance);
    const s = 1.0 / (b.max.x - b.min.x);
    lance.scale.setScalar(s);
    lance.rotation.z = -Math.PI / 2; // ujung nozzle (-x) → +y
    const half = ((b.max.x - b.min.x) / 2) * s;
    const grip = 0.4 * half; // gagang ±40% dari tengah ke arah belakang
    lance.position.y = grip;
    const lw = new THREE.Group();
    lw.add(lance);
    const tip = new THREE.Object3D();
    tip.position.y = half + grip;
    const back = new THREE.Object3D();
    back.position.y = -(half - grip);
    lw.add(tip, back);
    this.group.add(lw);
    lw.position.copy(hand);
    lw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    bones.RightHand.attach(lw);
    this.lance = lw;
    this.lanceBaseQ = lw.quaternion.clone(); // arah default (ikut pergelangan)
    this.nozzle.visible = false;
    this.nozzle = tip; // titik keluar semprotan air

    // --- selang: tabung lentur, digambar ulang tiap frame
    this.hoseA = outlet;
    this.hoseB = back;
    this.hose = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55 }));
    this.hose.castShadow = true;
    this.hose.frustumCulled = false;
    this.scene.add(this.hose);
  }

  // Tali ransel: pita hitam dari atas tangki → atas bahu → dada → pinggang → sisi bawah tangki.
  // Dua ujungnya nempel di muka depan tangki. Titik lainnya diambil dari permukaan badan (raycast)
  // biar nempel & gak nembus. Ditempel ke tulang punggung.
  buildStraps(hit, bones, tankTop, tankBack, hw, tankBottom) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, side: THREE.DoubleSide });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    const headY = wp(bones.Head).y;
    for (const sx of [-1, 1]) {
      const arm = wp(bones[sx < 0 ? 'RightArm' : 'LeftArm']);
      const x = sx * Math.abs(arm.x) * 0.6; // antara leher & sendi bahu
      // atas bahu: sinar ke bawah mulai dari pangkal kepala (biar gak kena kepala yang gede)
      const top = hit(V(x, headY, -0.02), V(0, -1, 0), V(x, arm.y + 0.08, -0.02)).y;
      const pts = [
        V(sx * 0.1, tankTop - 0.07, tankBack - 0.01), // keluar dari atas tangki
        V(x, top + 0.03, -0.11),
        V(x, top + 0.03, 0.0),
      ];
      // depan dada: dua titik, makin ke bawah makin ke samping
      for (const [dy, k] of [[-0.12, 1.05], [-0.3, 1.25]]) {
        const p = hit(V(x * k, top + dy, 2), V(0, 0, -1), V(x * k, top + dy, 0.25));
        pts.push(p.add(V(0, 0, 0.02)));
      }
      // pinggang: sinar dari samping, ambil permukaan yang paling dekat ke tengah (biar gak nyangkut di lengan)
      const yS = tankBottom + 0.16;
      const side = hit.all(V(sx * 1.5, yS, -0.04), V(-sx, 0, 0))
        .map((h) => h.point).filter((p) => p.x * sx > 0.08)
        .reduce((m, p) => (!m || Math.abs(p.x) < Math.abs(m.x) ? p : m), null);
      const sideX = side ? Math.abs(side.x) : 0.3;
      pts.push(V(sx * (sideX + 0.015), yS + 0.04, -0.04));
      // belokan ke punggung, nempel di permukaan belakang
      const backPt = hit(V(sx * sideX * 0.8, yS - 0.02, -2), V(0, 0, 1), V(sx * sideX * 0.8, yS - 0.02, tankBack + 0.02));
      pts.push(backPt.add(V(sx * 0.01, 0, -0.015)));
      pts.push(V(sx * hw * 0.75, tankBottom + 0.12, tankBack - 0.01)); // masuk ke sisi bawah tangki
      const curve = new THREE.CatmullRomCurve3(pts);
      // pita datar: lebar ke arah samping permukaan
      const N = 48, W = 0.07;
      const pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const core = V(0, Math.min(Math.max(p.y, 1.0), top - 0.25), -0.02);
        const out = p.clone().sub(core).normalize();
        const w = new THREE.Vector3().crossVectors(tan, out).normalize().multiplyScalar(W / 2);
        const q = p.clone().addScaledVector(out, 0.008);
        pos.push(q.x + w.x, q.y + w.y, q.z + w.z, q.x - w.x, q.y - w.y, q.z - w.z);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const strap = new THREE.Mesh(geo, mat);
      strap.castShadow = true;
      this.group.add(strap);
      bones.Spine2.attach(strap);
      // gesper kecil di dada: ditaruh persis di titik tali yang paling deket ke titik dada pertama
      const chest = pts[3];
      let bt = 0, bd = Infinity;
      for (let i = 0; i <= 100; i++) { const d = curve.getPointAt(i / 100).distanceTo(chest); if (d < bd) { bd = d; bt = i / 100; } }
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.018), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.6 }));
      buckle.position.copy(curve.getPointAt(bt)).add(V(0, 0, 0.014));
      const tan = curve.getTangentAt(bt);
      buckle.rotation.z = Math.atan2(tan.x, -tan.y); // miring ngikutin arah tali
      this.group.add(buckle);
      bones.Spine2.attach(buckle);
    }
  }

  updateHose() {
    if (!this.hose) return;
    const a = this.hoseA.getWorldPosition(new THREE.Vector3());
    const b = this.hoseB.getWorldPosition(new THREE.Vector3());
    // jalur selang: turun dari tangki, lewat belakang pinggul kanan, keluar di samping kanan, ke pangkal alat semprot
    // (titik bantu dalam koordinat badan: kanan = -x, belakang = -z)
    const behindHip = this.group.localToWorld(new THREE.Vector3(-0.28, 0.82, -0.32));
    const sideHip = this.group.localToWorld(new THREE.Vector3(-0.44, 0.92, 0.0));
    const curve = new THREE.CatmullRomCurve3([a, behindHip, sideHip, b]);
    this.hose.geometry.dispose();
    this.hose.geometry = new THREE.TubeGeometry(curve, 18, 0.022, 6);
  }

  // Ganti animasi dengan transisi halus
  play(key, fade = 0.2) {
    const next = this.actions[key] || this.actions.idle;
    if (!next || next === this.current) return next;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
    return next;
  }

  // Animasi model Meshy, dipanggil tiap frame setelah posisi diupdate
  animate(dt, v, riding = false) {
    let a;
    if (this.pose) {
      a = this.play(this.pose, 0.4);
      a.timeScale = 1;
    } else if (riding) {
      a = this.play('idle');
    } else if (v > 4.5) {
      a = this.play('run');
      a.timeScale = clamp(v / 8, 0.8, 1.5);
    } else if (v > 0.4) {
      a = this.play('walk');
      a.timeScale = clamp(v / 2.6, 0.6, 1.6);
    } else {
      // Diem lama: sesekali napas panjang & nengok kiri-kanan
      this.idleT += dt;
      if (this.idleT > 7 && this.actions.look) {
        a = this.play('look', 0.5);
        if (this.idleT > 7 + this.actions.look.getClip().duration - 0.5) this.idleT = 0;
      } else a = this.play('idle', 0.3);
    }
    if (v > 0.4 || riding || this.pose) this.idleT = 0;
    this.mixer.update(dt);

    const b = this.bones;
    const fw = _a.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (riding) {
      // Duduk di motor: paha ke depan, betis ke bawah, tangan ke setang
      const down = new THREE.Vector3(0, -1, 0);
      const thigh = fw.clone().multiplyScalar(0.95).add(new THREE.Vector3(0, -0.3, 0)).normalize();
      const hands = fw.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, -0.22, 0)).normalize();
      for (const side of ['Left', 'Right']) {
        aimBone(b[side + 'UpLeg'], b[side + 'Leg'], thigh);
        aimBone(b[side + 'Leg'], b[side + 'Foot'], down);
        aimBone(b[side + 'Arm'], b[side + 'ForeArm'], hands);
        aimBone(b[side + 'ForeArm'], b[side + 'Hand'], hands);
      }
    }
    // Nyiram: lengan kanan lurus ke depan (selang di tangan kanan)
    this.sprayW += ((this.spraying ? 1 : 0) - this.sprayW) * (1 - Math.exp(-dt * 14));
    if (this.sprayW > 0.01 && !riding) {
      const aim = fw.clone().add(new THREE.Vector3(0, 0.05, 0)).normalize();
      aimBone(b.RightArm, b.RightForeArm, aim, this.sprayW);
      aimBone(b.RightForeArm, b.RightHand, aim, this.sprayW);
    }
    // Teriak: tangan kiri ngepal ke atas (gerakan orator umum), naik-turun halus
    this.shoutT = Math.max(0, (this.shoutT || 0) - dt);
    const sw = Math.min(1, this.shoutT / 0.25, (1.7 - this.shoutT) / 0.15);
    if (sw > 0.01 && this.shoutT > 0) {
      const side = new THREE.Vector3(Math.cos(this.facing), 0, -Math.sin(this.facing)); // kiri badan
      const up = new THREE.Vector3(0, 1, 0);
      const upper = up.clone().multiplyScalar(0.85).addScaledVector(side, 0.35).addScaledVector(fw, 0.15).normalize();
      const fore = up.clone().addScaledVector(side, 0.08).addScaledVector(fw, 0.1).normalize();
      aimBone(b.LeftArm, b.LeftForeArm, upper, sw);
      aimBone(b.LeftForeArm, b.LeftHand, fore, sw);
    }
    // Alat semprot: pas nyiram ujungnya lurus ke depan (gak ikut pergelangan yang nekuk)
    if (this.lance) {
      if (this.sprayW > 0.01 && !riding) {
        const aim = fw.clone().add(new THREE.Vector3(0, 0.05, 0)).normalize();
        const parentQ = this.lance.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        const local = parentQ.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim));
        this.lance.quaternion.copy(this.lanceBaseQ).slerp(local, this.sprayW);
      } else this.lance.quaternion.copy(this.lanceBaseQ);
    }
  }

  forward() {
    return tmp.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  // Pose duduk di motor (gerakannya diatur Bike)
  rideOn(bike, dt) {
    this.pos.copy(bike.pos);
    this.vel.set(0, 0, 0);
    this.facing = bike.heading;
    this.spraying = false;
    this.inWater = false;
    this.group.position.copy(bike.seat()).y -= 0.62;
    this.group.position.y += this.model ? (bike.meshy ? -0.42 : -0.28) : 0.15;
    this.group.rotation.set(0, bike.heading, bike.lean, 'YXZ');
    this.legs[0].rotation.x = this.legs[1].rotation.x = -1.35;
    this.arms[0].rotation.x = this.arms[1].rotation.x = -1.05;
    if (this.model) this.animate(dt, 0, true);
    this.updateHose();
    this.spray.update(dt);
  }

  update(dt, input, camYaw, world) {
    // Gerak relatif ke arah kamera
    const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const r = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    // input.move: x = kanan, y = maju. Stik analog setengah = jalan pelan.
    const move = new THREE.Vector3().addScaledVector(f, input.move.y).addScaledVector(r, input.move.x);

    const inWater = world.inRiver(this.pos.x, this.pos.z);
    // Booster "SEMANGAT!" dari teriak: lari 45% lebih cepat selama beberapa detik
    if (this.boostT > 0) this.boostT -= dt;
    const boost = this.boostT > 0 ? 1.45 : 1;
    const speed = (input.sprint ? 11 : 7) * (inWater ? 0.6 : 1) * boost;
    move.multiplyScalar(speed);
    this.vel.lerp(move, 1 - Math.exp(-dt * 10));
    this.pos.addScaledVector(this.vel, dt);
    world.collide(this.pos, this.radius, this.vel);
    this.pos.y = Math.max(groundHeight(this.pos.x, this.pos.z), WATER_Y - 0.35);

    // Hadap: saat nyiram ikut arah kamera (biar gampang ngarahin), selain itu ikut arah jalan
    this.spraying = input.spray && this.water > 0;
    let targetFacing = this.facing;
    if (this.spraying) targetFacing = Math.atan2(f.x, f.z);
    else if (this.vel.lengthSq() > 0.5) targetFacing = Math.atan2(this.vel.x, this.vel.z);
    let d = targetFacing - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-dt * 12));

    // Animasi jalan sederhana
    const v = this.vel.length();
    this.phase += dt * v * 1.6;
    const swing = Math.sin(this.phase) * clamp(v / 7, 0, 1) * 0.7;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = this.spraying ? -1.35 : swing * 0.8;
    this.group.position.copy(this.pos);
    if (!this.model) this.group.position.y += Math.abs(Math.sin(this.phase)) * 0.06 * clamp(v / 7, 0, 1);
    this.group.rotation.set(0, this.facing, 0);
    if (this.model) this.animate(dt, v);
    this.updateHose();

    // Air
    const refill = world.canRefill(this.pos.x, this.pos.z);
    if (refill) this.water = Math.min(this.tankMax, this.water + 55 * dt);
    if (this.spraying) {
      this.water = Math.max(0, this.water - 5 * dt); // ±20 detik nyemprot per tangki penuh
      const fw = this.forward();
      const n = this.nozzle.getWorldPosition(new THREE.Vector3());
      for (let k = 0; k < 4; k++) {
        const s = 13 + Math.random() * 4;
        this.spray.spawn(n.x, n.y, n.z,
          fw.x * s + (Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, fw.z * s + (Math.random() - 0.5) * 2,
          0.7 + Math.random() * 0.3, 0.25, 0.9, [0.75, 0.9, 1.0], [0.6, 0.8, 0.95], 0.55);
      }
    }
    this.spray.update(dt);
    this.inWater = refill; // dipakai HUD buat tulisan "Mengisi air"
  }
}
