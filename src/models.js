// Pemuat model Meshy yang gak dianimasi (kendaraan, gedung, barang).
// Tiap file dimuat sekali, lalu disalin tiap kali dipakai.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = {};

// Presiden + perlengkapannya didownload duluan. Model lain nunggu sampai presiden siap,
// biar gak rebutan internet (dulu presiden telat muncul di koneksi lambat).
const HERO_GEAR = new Set(['tangki-punggung', 'alat-semprot']);
let heroDone;
export const heroReady = new Promise((r) => { heroDone = r; });
export function markHeroReady() { heroDone(); }
setTimeout(markHeroReady, 20000); // jaga-jaga: jangan nahan model lain selamanya

// Mulai muat model `name` (file public/models/<name>.glb). Balikin Promise berisi gltf.
export function loadModel(name) {
  if (!cache[name]) {
    cache[name] = { gltf: null };
    const wait = HERO_GEAR.has(name) ? Promise.resolve() : heroReady;
    cache[name].promise = wait.then(() => loader.loadAsync(`models/${name}.glb`)).then((g) => {
      cache[name].gltf = g;
      return g;
    }).catch((e) => {
      console.warn(`${name}.glb gagal dimuat, pakai placeholder`, e);
      return null;
    });
  }
  return cache[name].promise;
}

export function isLoaded(name) {
  return !!cache[name]?.gltf;
}

// Salinan model yang udah diputar ke depan (+z), dibesarin sampai panjangnya `length` meter,
// ditaruh di tengah dan napak di tanah (y = 0). `rotY`: putaran biar bagian depan model ngadep +z.
// Model Meshy kendaraan kita ngadep -x, jadi defaultnya +90°.
export function placeModel(name, { length, rotY = Math.PI / 2, shadows = true } = {}) {
  const g = cache[name]?.gltf;
  if (!g) return null;
  const inner = g.scene.clone(true);
  inner.rotation.y = rotY;
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner);
  const s = length / (box.max.z - box.min.z);
  inner.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  inner.traverse((o) => {
    if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; }
  });
  wrap.userData.height = box.max.y - box.min.y;
  // Batas model dalam koordinat lokal grupnya (sebelum ditempel ke apa pun)
  wrap.userData.box = new THREE.Box3().setFromObject(wrap);
  return wrap;
}

// Tukar badan placeholder `group` dengan model Meshy begitu kemuat.
// Mesh di `keep` tetap kelihatan (label, lampu, ember, dll.); mesh placeholder lain disembunyiin
// (bukan dihapus, biar kode yang masih nyimpen referensinya gak error).
// Balikin Promise berisi model yang dipasang (atau null kalau gagal).
export function swapInModel(group, name, opts, keep = []) {
  // Placeholder langsung disembunyiin biar gak kelihatan kotak-kotak sedetik pas game baru dibuka.
  // Kalau model gagal dimuat, placeholder dimunculin lagi.
  const keepSet = new Set();
  for (const k of keep) k.traverse((o) => keepSet.add(o));
  const hidden = [];
  group.traverse((o) => { if (o.isMesh && !keepSet.has(o) && o.visible) { o.visible = false; hidden.push(o); } });
  return loadModel(name).then((g) => {
    if (!g) { for (const o of hidden) o.visible = true; return null; }
    const model = placeModel(name, opts);
    group.add(model);
    return model;
  });
}

// Mulai dimuat dari awal biar siap pas dibutuhin
for (const n of ['motor', 'bulldozer', 'mega-bulldozer', 'damkar', 'heli', 'pengadilan', 'tangki-punggung', 'alat-semprot']) loadModel(n);
