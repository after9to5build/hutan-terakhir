// Karakter Meshy yang di-rig (kerangka Mixamo). Animasi bisa dipinjam dari file lain
// karena nama tulangnya sama semua (mixamorigHips, mixamorigSpine, ...).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = {};

export function loadChar(name) {
  if (!cache[name]) {
    cache[name] = { gltf: null };
    cache[name].promise = loader.loadAsync(`models/${name}.glb`).then((g) => {
      cache[name].gltf = g;
      return g;
    }).catch((e) => {
      console.warn(`${name}.glb gagal dimuat, pakai placeholder`, e);
      return null;
    });
  }
  return cache[name].promise;
}

// Ambil klip `clip` dari file `from`. Klip pinjaman dibuang jalur posisinya
// (cuma rotasi tulang), soalnya ukuran kerangka tiap file beda dan bisa bikin karakter melayang.
const borrowed = {};
function getClip(from, clip, own) {
  const g = cache[from]?.gltf;
  const c = g?.animations.find((a) => a.name === clip);
  if (!c) return null;
  if (own) return c;
  const key = `${from}/${clip}`;
  if (!borrowed[key]) {
    borrowed[key] = new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => !t.name.endsWith('.position')));
  }
  return borrowed[key];
}

// Bikin satu salinan karakter `name` setinggi `height` meter.
// `clips`: { kunci: [file, namaKlip] }. File-nya harus udah dimuat (pakai loadChar dulu).
// Balikin null kalau model belum kemuat.
export function makeChar(name, { height, clips = {} }) {
  const g = cache[name]?.gltf;
  if (!g) return null;
  const model = cloneSkinned(g.scene);
  const box = new THREE.Box3().setFromObject(g.scene);
  model.scale.setScalar(height / (box.max.y - box.min.y));
  const bones = {};
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  const group = new THREE.Group();
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [key, [from, clip]] of Object.entries(clips)) {
    const c = getClip(from, clip, from === name);
    if (c) actions[key] = mixer.clipAction(c);
  }
  const ch = { group, model, mixer, actions, bones, current: null };
  ch.play = (key, fade = 0.25, timeScale = 1) => {
    const next = actions[key] || actions.idle;
    if (next && next !== ch.current) {
      next.reset().fadeIn(fade).play();
      if (ch.current) ch.current.fadeOut(fade);
      ch.current = next;
    }
    if (next) next.timeScale = timeScale;
  };
  return ch;
}

// Tempel `obj` ke tulang `bone` di posisi dunianya sekarang (karakter dalam pose A).
export function attachToBone(ch, boneName, obj) {
  ch.group.updateMatrixWorld(true);
  ch.bones[boneName].attach(obj);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();

// Putar tulang `bone` biar arah ke tulang `child` nunjuk ke `dir` (koordinat dunia).
// Gak peduli sumbu lokal tulangnya, jadi aman buat rig Mixamo dari Meshy.
export function aimBone(bone, child, dir, weight = 1) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _d.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_d, dir);
  bone.getWorldQuaternion(_qw);
  _q.multiply(_qw);
  bone.parent.getWorldQuaternion(_qp);
  _q.premultiply(_qp.invert());
  bone.quaternion.slerp(_q, weight);
  bone.updateWorldMatrix(false, true);
}

// Ganti warna bagian tekstur yang hue-nya deket `fromHue` (0..1) jadi `toHue`.
// Dipakai buat ganti warna kaos relawan tanpa bikin model baru. Hasilnya di-cache per warna.
const recolored = {};
export function recolorMaterial(mat, key, fromHue, toHue, toSat = null, { minS = 0.3, maxL = 1 } = {}) {
  if (!mat.map?.image) return mat;
  const id = `${mat.uuid}/${key}`;
  if (recolored[id]) return recolored[id];
  const img = mat.map.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const col = new THREE.Color();
  const hsl = {};
  for (let i = 0; i < px.length; i += 4) {
    col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    col.getHSL(hsl);
    let dh = Math.abs(hsl.h - fromHue);
    dh = Math.min(dh, 1 - dh);
    if (dh < 0.07 && hsl.s > minS && hsl.l > 0.12 && hsl.l < maxL) {
      col.setHSL(toHue, toSat ?? hsl.s, hsl.l);
      px[i] = col.r * 255; px[i + 1] = col.g * 255; px[i + 2] = col.b * 255;
    }
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = mat.map.flipY;
  tex.colorSpace = mat.map.colorSpace;
  const m = mat.clone();
  m.map = tex;
  recolored[id] = m;
  return m;
}

// Mulai muat karakter pendukung dari awal
for (const n of ['presiden', 'relawan', 'satgas', 'orangutan']) loadChar(n);
