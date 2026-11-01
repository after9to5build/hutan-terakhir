// Tiga ending + layar fakta. Ending ditentukan pilihan pemain di semua level.
import * as THREE from 'three';
import { STATE, TYPE } from './config.js';
import { POSKO, COURT } from './map.js';
import { groundHeight } from './world.js';
import { makeLabel } from './dozer.js';
import { addRatHead, addTie, addTail } from './rat.js';
import { makeChar, recolorMaterial, attachToBone } from './characters.js';
import { makePodium } from './props.js';
import { makeInvestorRat } from './enemies.js';

// ---------- Aturan penentu ending ----------
// taken   = jumlah titipan yang diterima (dari semua level)
// boss    = Mega Bulldozer berhasil disegel
// ratio   = hutan tersisa di akhir Level 3 (0..1)
// citra   = total detik nyiram di depan kamera drone
export function decideEnding({ taken, boss, ratio, citra }) {
  if (taken >= 2) return 'sawit';
  if (citra >= 20 && ratio < 0.6) return 'pencitraan';
  if (boss && ratio >= 0.5) return 'hutan';
  return 'pencitraan';
}

// Gelar satir di Rapor Presiden (kartu buat di-screenshot). Semua fiktif.
export function raporTitle({ win, ratio, caught, taken, citra, boss, shouts, ceremonies = 0, laps = 0 }) {
  if (!win) return { e: '🌴', t: 'Presiden Peresmi Sawit', d: 'Hutannya habis, guntingnya udah siap.' };
  if (taken >= 2) return { e: '💼', t: 'Presiden Titipan', d: 'Hutannya dijual, kuitansinya rapi.' };
  if (citra >= 20 && ratio < 0.6) return { e: '📸', t: 'Presiden Konten', d: 'Apinya gede, tapi angle kameranya bagus.' };
  if (ratio >= 0.5 && boss && taken === 0) return { e: '🌳', t: 'Penjaga Hutan Terakhir', d: 'Tikus berdasi gagal panen tahun ini.' };
  if (ceremonies >= 5 && ratio < 0.6) return { e: '🎀', t: 'Presiden Gunting Pita', d: 'Pitanya abis, hutannya juga.' };
  if (laps >= 5 && ratio < 0.6) return { e: '🏁', t: 'Presiden Balap', d: 'Lap-nya kenceng, hutannya keburu abis.' };
  if (caught >= 12) return { e: '🐀', t: 'Presiden Pemburu Tikus', d: 'Tikusnya ketangkep, bosnya masih aman.' };
  if (shouts >= 25) return { e: '📢', t: 'Presiden Toa', d: 'Teriaknya kenceng, apinya gak dengerin.' };
  if (ratio < 0.5) return { e: '🌧️', t: 'Presiden Nunggu Hujan', d: 'Yang kerja keras tetap awan.' };
  return { e: '👞', t: 'Presiden Turun Lapangan', d: 'Sepatunya kotor, hutannya lumayan.' };
}

export const ENDINGS = {
  hutan: {
    kicker: 'Ending · Hutan Terakhir',
    title: 'Hutan Bertahan',
    text: 'Izin dicabut, bulldozer disegel, orangutan pulang. Kali ini bukan cuma hujan yang madamin.',
    other: 'Ada 2 ending lain. Coba terima titipan.',
  },
  pencitraan: {
    kicker: 'Ending · Konferensi Pers',
    title: 'Karhutla Berhasil Dikendalikan',
    text: 'Fotonya bagus, liputannya di mana-mana. Asapnya juga.',
    other: 'Ending terbaik: segel Mega Bulldozer dan sisain hutan minimal 50%.',
  },
  sawit: {
    kicker: 'Ending · Peresmian Kebun',
    title: 'Selamat Datang, Investasi',
    text: 'Titipan diterima, hutan jadi sawit, pita digunting. Orangutan gak diundang.',
    other: 'Tiap titipan ada harganya. Coba tolak.',
  },
};

// Fakta nyata buat layar akhir. Dicek ulang ke artikel sumbernya 1 Nov 2026:
// tiap kalimat harus persis sesuai isi artikel yang di-link, jangan dilebih-lebihin.
export const FACTS = [
  {
    text: 'Walhi: 74% titik panas di Kalimantan (Jan–Jul 2026) ada di area berizin perusahaan.',
    src: 'Mongabay',
    url: 'https://mongabay.co.id/2026/08/06/ketika-kebakaran-hutan-dan-lahan-menggila-di-kalimantan/',
  },
  {
    text: 'Rinciannya: 10.739 titik di kebun sawit, 7.880 di tambang, 6.905 di izin hutan.',
    src: 'NU Online',
    url: 'https://www.nu.or.id/nasional/34-262-titik-api-kepung-kalimantan-65-persen-di-kalbar-wqPjN',
  },
  {
    text: 'Pantau Gambut & Madani: kebun monokultur skala besar salah satu biang karhutla 2025. Cuaca bukan satu-satunya alasan.',
    src: 'Green Network',
    url: 'https://greennetwork.id/?p=10444',
  },
  {
    text: 'Warga Palangka Raya menggugat pemerintah soal karhutla 2015 dan menang sampai kasasi (2019). Tahun 2022, MA membaliknya lewat PK.',
    src: 'EmitenNews',
    url: 'https://www.emitennews.com/news/kasus-karhutla-kalteng-ma-menangkan-presiden-para-penggugat-prihatin',
  },
];

// ---------- Bahan adegan ----------
// Orangutan Meshy (ASET-MESHY.md #12): joget pakai FunnyDancing_03 dari file-nya sendiri.
// `dancers` nampung karakter yang perlu di-update tiap frame selama adegan ending.
const dancers = [];
function makeOrangutan(scale = 1) {
  const ch = makeChar('orangutan', { height: 1.6 * scale, clips: { dance: ['orangutan', 'FunnyDancing_03'] } });
  if (!ch) {
    const g = buildOrangutan();
    g.scale.multiplyScalar(scale);
    return g;
  }
  ch.play('dance', 0);
  ch.mixer.setTime(Math.random() * 8); // gak joget serempak kayak robot
  dancers.push(ch);
  return ch.group;
}
const updateDancers = (dt) => { for (const ch of dancers) ch.mixer.update(dt); };

// Wartawan konferensi pers: pakai model relawan (gratis, udah ada), kaos diwarnain beda, pegang kamera TV
const PRESS_SHIRTS = [0.0, 0.08, 0.33, 0.75, 0.6, 0.12];
function makeReporter(i) {
  const ch = makeChar('relawan', { height: 1.9, clips: { idle: ['presiden', 'Idle_9'] } });
  if (!ch) return null;
  if (i % PRESS_SHIRTS.length !== 4) {
    ch.model.traverse((o) => { if (o.isMesh) o.material = recolorMaterial(o.material, `pers${i % 6}`, 0.58, PRESS_SHIRTS[i % 6]); });
  }
  ch.play('idle', 0);
  ch.mixer.setTime(Math.random() * 2);
  dancers.push(ch);
  // kamera TV: badan hitam + lensa, nempel di depan muka (ikut gerak kepala)
  ch.group.updateMatrixWorld(true);
  const cam = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.42), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 14), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.5 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.27;
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
  tally.position.set(0.08, 0.13, 0.15);
  cam.add(body, lens, tally);
  for (const o of cam.children) o.castShadow = true;
  const head = ch.bones.Head.getWorldPosition(new THREE.Vector3());
  cam.position.set(head.x + 0.12, head.y + 0.02, head.z + 0.3);
  ch.group.add(cam);
  attachToBone(ch, 'Head', cam);
  return ch.group;
}
function buildReporterPlaceholder(i) {
  const r = buildPerson([0x3a4a5a, 0x5a3a3a, 0x3a5a3a][i % 3]);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.25), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cam.position.set(0, 1.85, 0.25);
  r.add(cam);
  return r;
}

function buildOrangutan() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x9a4a1e, roughness: 0.95 });
  const face = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.8 });
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, 0, rz);
    o.castShadow = true;
    g.add(o);
  };
  add(new THREE.SphereGeometry(0.55, 16, 12), fur, 0, 0.75, 0);
  add(new THREE.SphereGeometry(0.32, 14, 10), fur, 0, 1.45, 0.05);
  add(new THREE.SphereGeometry(0.22, 12, 8), face, 0, 1.4, 0.24);
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.11, 1.0, 4, 8), fur, s * 0.55, 0.85, 0.1, 0.3, s * 0.5); // lengan panjang
    add(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), fur, s * 0.25, 0.25, 0.3, 1.3, 0);
  }
  g.scale.setScalar(1.1);
  return g;
}

function buildPerson(color, rat = false) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xa8744f });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f3a }), 0, 0.5, 0);
  add(new THREE.CapsuleGeometry(0.26, 0.48, 6, 10), m, 0, 1.3, 0);
  if (rat) {
    addRatHead(g, 1.92);
    addTie(g, 1.42, 0xd4af37); // dasi emas
    addTail(g, 0.95);
  } else {
    add(new THREE.SphereGeometry(0.19, 12, 10), skin, 0, 1.9, 0);
  }
  return g;
}

function addAt(scene, obj, x, z, rotY = 0, lift = 0) {
  obj.position.set(x, groundHeight(x, z) + lift, z);
  obj.rotation.y = rotY;
  scene.add(obj);
  return obj;
}

// Lapangan terbuka paling lega, jauh dari posko & pengadilan (buat panggung ending)
function openSpot(world) {
  let best = null, bestScore = -1;
  for (const t of world.tiles) {
    if (t.type !== TYPE.CLEAR) continue;
    if (Math.hypot(t.cx - POSKO.x, t.cz - POSKO.z) < 28 || Math.hypot(t.cx - COURT.x, t.cz - COURT.z) < 22) continue;
    let score = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const n = world.tile(t.xi + dx, t.zi + dz);
      if (n && (n.type === TYPE.CLEAR || n.type === TYPE.ROAD)) score++;
    }
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best ? new THREE.Vector3(best.cx, 0, best.cz) : new THREE.Vector3(-13, 0, 19);
}

function placePlayer(player, spot, facing) {
  player.pos.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
  player.vel.set(0, 0, 0);
  player.facing = facing;
  player.group.position.copy(player.pos);
  player.group.rotation.set(0, facing, 0);
}

// ---------- Adegan ----------
// Tiap fungsi menata dunia lalu mengembalikan titik fokus kamera sinematik.
export function stageEnding(id, { scene, world, fire, player, game }) {
  for (const t of [...fire.burning]) fire.water(t, 10);
  // Hutan: di jalan tanah di tengah hutan. Lainnya: di lapangan terbuka.
  placePlayer(player, id === 'hutan' ? new THREE.Vector3(-13, 0, 19) : openSpot(world), id === 'pencitraan' ? Math.PI : 0);
  const p = player.pos.clone();

  // Gerakan model Meshy di tiap ending
  player.pose = id === 'hutan' ? 'cheer' : 'wave';
  if (id === 'hutan') {
    game.endingSmoke = 0;
    // orangutan kembali di sekitar Pak Presiden
    addAt(scene, makeOrangutan(), p.x + 2.5, p.z - 1.5, -0.6);
    addAt(scene, makeOrangutan(), p.x - 3, p.z - 3.5, 0.5);
    addAt(scene, makeOrangutan(0.6), p.x + 1.6, p.z - 2.6, -0.3); // anak orangutan
    // kamera dari depan agak serong (dulu dari belakang: muka & selebrasi gak kelihatan)
    return { focus: p.clone().add(new THREE.Vector3(0, 1.3, -1.2)), radius: 7, height: 1.4, speed: 0.05, angle: -0.25, update: updateDancers };
  }

  if (id === 'pencitraan') {
    game.endingSmoke = 0.65;
    const fx = p.x, fz = p.z;
    // podium + mikrofon (props.js)
    const podium = makePodium();
    addAt(scene, podium, fx, fz - 1.1, Math.PI);
    // spanduk besar di belakang
    const banner = makeLabel(['KARHUTLA BERHASIL DIKENDALIKAN', 'Konferensi Pers · Kementerian Urusan Asap'], { w: 9, h: 2.2, bg: '#c4161c', fg: '#ffffff' });
    addAt(scene, banner, fx, fz + 2.2, Math.PI, 3); // ngadep wartawan & kamera (dulu kebaca kebalik)
    for (const x of [-4.4, 4.4]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
      addAt(scene, pole, fx + x, fz + 2.2, 0, 2.1);
    }
    // wartawan: model relawan Meshy, kaos beda warna, kamera TV di depan muka (placeholder kalau belum kemuat)
    for (let i = 0; i < 6; i++) {
      const r = makeReporter(i) || buildReporterPlaceholder(i);
      addAt(scene, r, fx - 3.5 + i * 1.4, fz - 6 - (i % 2) * 0.8, Math.PI);
    }
    player.group.rotation.y = Math.PI; // menghadap wartawan
    player.facing = Math.PI;
    return { focus: new THREE.Vector3(fx, p.y + 1.8, fz - 1.5), radius: 8.5, height: 2.4, speed: 0.06, flashes: true, angle: Math.PI - 0.45, update: updateDancers };
  }

  // sawit: semua hutan berubah jadi barisan sawit
  game.endingSmoke = 0.25;
  const trunkMesh = world.meshes.palmTrunk, crownMesh = world.meshes.palmCrown;
  const spots = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const t of world.tiles) {
    if (!t.burnable) continue;
    for (const part of t.parts) {
      part.mesh.setMatrixAt(part.i, zero);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    t.colliders.length = 0;
    t.state = STATE.BURNT;
    t.cleared = true;
    world.paintGround(t);
    if ((t.xi + t.zi) % 2 === 0 && Math.hypot(t.cx - p.x, t.cz - p.z) > 8) spots.push(t);
  }
  const trunks = new THREE.InstancedMesh(trunkMesh.geometry, trunkMesh.material, spots.length);
  const crowns = new THREE.InstancedMesh(crownMesh.geometry, crownMesh.material, spots.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  spots.forEach((t, i) => {
    const gy = groundHeight(t.cx, t.cz);
    m.compose(new THREE.Vector3(t.cx, gy, t.cz), new THREE.Quaternion(), new THREE.Vector3(0.55, 5, 0.55));
    trunks.setMatrixAt(i, m);
    trunks.setColorAt(i, col.setHSL(0.08, 0.25, 0.22));
    m.compose(new THREE.Vector3(t.cx, gy + 5, t.cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(1, 1, 1));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(0.2, 0.35, 0.28));
  });
  for (const mesh of [trunks, crowns]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

  // pita peresmian
  const fx = p.x, fz = p.z + 2;
  for (const x of [-1.8, 1.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 }));
    addAt(scene, post, fx + x, fz, 0, 0.65);
  }
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xd61f26 }));
  addAt(scene, ribbon, fx, fz, 0, 1.15);
  const sign = makeLabel(['PERESMIAN KEBUN', 'PT Lahan Siap Tanam Kilat', '10.000 Ha'], { w: 5, h: 1.7, bg: '#2f6b3a', fg: '#ffd060', border: '#d4af37' });
  addAt(scene, sign, fx, p.z - 3, 0, 2.6);
  for (let i = 0; i < 4; i++) {
    // investor: model tikus Meshy berdasi emas, gosok-gosok tangan (placeholder kalau belum kemuat)
    const rat = makeInvestorRat();
    if (rat) dancers.push(rat);
    const inv = rat ? rat.group : buildPerson(0x1d1d24, true);
    addAt(scene, inv, p.x + (i < 2 ? -2.2 - i * 1.2 : 2.2 + (i - 2) * 1.2), p.z - 0.5, 0);
  }
  player.group.rotation.y = 0;
  player.facing = 0;
  player.arms[1].rotation.x = -1.3; // pegang gunting
  return { focus: new THREE.Vector3(p.x, p.y + 1.6, p.z), radius: 9, height: 2.8, speed: 0.07, flashes: true, angle: 0.3, update: updateDancers };
}

// ---------- Adegan kalah: sawit tumbuh serentak di lahan yang habis ----------
// Gelombang dari barat (batas konsesi) ke timur. Balikin fungsi update per frame.
export function sawitTakeover({ scene, world, fire }) {
  for (const t of [...fire.burning]) fire.water(t, 10);
  const spots = world.tiles.filter((t) => t.burnable && t.state === STATE.BURNT);
  const trunkMesh = world.meshes.palmTrunk, crownMesh = world.meshes.palmCrown;
  const n = Math.max(1, spots.length);
  const trunks = new THREE.InstancedMesh(trunkMesh.geometry, trunkMesh.material, n);
  const crowns = new THREE.InstancedMesh(crownMesh.geometry, crownMesh.material, n);
  const col = new THREE.Color();
  const data = spots.map((t, i) => {
    trunks.setColorAt(i, col.setHSL(0.08, 0.25, 0.22));
    crowns.setColorAt(i, col.setHSL(0.2, 0.35, 0.28 + Math.random() * 0.04));
    const x = t.cx + (Math.random() - 0.5) * 1.2, z = t.cz + (Math.random() - 0.5) * 1.2;
    return { t, x, z, gy: groundHeight(x, z), h: 4.2 + Math.random() * 1.4, rot: Math.random() * 6.28, delay: ((t.cx + 80) / 160) * 3.2 + Math.random() * 0.7, painted: false };
  });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) { trunks.setMatrixAt(i, zero); crowns.setMatrixAt(i, zero); }
  for (const mesh of [trunks, crowns]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const back = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // easeOutBack: "nyembul"
  let time = 0;
  return function update(dt) {
    time += dt;
    data.forEach((d, i) => {
      const k = Math.min(1, Math.max(0, (time - d.delay) / 0.7));
      if (k <= 0) return;
      if (!d.painted) { d.painted = true; d.t.cleared = true; world.paintGround(d.t); }
      const s = back(k);
      q.setFromAxisAngle(up, d.rot);
      m.compose(new THREE.Vector3(d.x, d.gy, d.z), q, new THREE.Vector3(0.55 * s, d.h * s, 0.55 * s));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(d.x, d.gy + d.h * s, d.z), q, new THREE.Vector3(s, s, s));
      crowns.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
  };
}
