import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N, T, HALF, W, STATE, TYPE, rng, clamp, LOW } from './config.js';
import {
  POSKO, TANK, ROAD_HALF, RIVER_HALF, SAWIT_X, WELLS, CANAL_HALF,
  riverDist, roadDist, poskoDist, inPeat, inScar, inGlade, canalDist, courtDist, COURT, ceremonyDist, CEREMONY,
} from './map.js';

import { leafClusterTexture, fernTexture, barkTextures, groundTextures, shaftTexture, waterNormal } from './textures.js';
import { tentMaterial, crateMaterial, tandonMaterial } from './props.js';

export { RIVER_HALF, riverDist };
export const WATER_Y = -0.45;
const EXT = 50; // tanah & hutan latar di luar area main

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function groundHeight(x, z) {
  const d = riverDist(x, z);
  const flat = Math.max(smoothstep(ROAD_HALF + 2.5, ROAD_HALF, roadDist(x, z)), smoothstep(POSKO.r + 4, POSKO.r - 2, poskoDist(x, z)),
    smoothstep(CEREMONY.r + 3, CEREMONY.r - 1, ceremonyDist(x, z)));
  const bump = (Math.sin(x * 0.31) * Math.cos(z * 0.27) + Math.sin(x * 0.13 + z * 0.11)) * 0.18 * (1 - flat * 0.8);
  const dip = Math.max(smoothstep(RIVER_HALF + 2.5, RIVER_HALF - 1.5, d), smoothstep(CANAL_HALF + 0.9, CANAL_HALF - 0.5, canalDist(x, z)));
  return bump * (1 - dip) - 1.3 * dip;
}

// ---------- Shader tambahan buat vegetasi ----------
// 1) Angin: daun & rumput goyang pelan.
// 2) Tembus pandang: pohon yang ada di antara kamera dan pemain dilubangi,
//    jadi Pak Presiden selalu kelihatan. Bayangannya tetap ada.
const shared = {
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
};
function enhance(material, strength) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader =
      'uniform float uTime;\nvarying vec3 vWPos;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sway = sin(uTime * 1.6 + ip.x * 0.35 + ip.y * 0.27) + 0.4 * sin(uTime * 3.3 + ip.x * 0.9);
        float h = max(position.y + 0.2, 0.0);
        transformed.x += sway * ${strength.toFixed(3)} * h;
        transformed.z += sway * ${(strength * 0.5).toFixed(3)} * h;
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`
      );
    shader.fragmentShader =
      'uniform vec3 uCam;\nuniform vec3 uTarget;\nvarying vec3 vWPos;\n' +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          vec3 seg = uTarget - uCam;
          float L = length(seg);
          vec3 dir = seg / L;
          float tp = dot(vWPos - uCam, dir);
          if (tp > 0.0 && tp < L - 0.6) {
            float dist = length(vWPos - (uCam + dir * tp));
            float rad = 0.8 + 2.4 * (tp / L);
            // pola Bayer 4x4 biar lubangnya rapi, gak berbintik
            ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
            int idx = q.x + q.y * 4;
            float bayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
            float n = (bayer[idx] + 0.5) / 16.0;
            if (dist < rad && n > smoothstep(rad * 0.75, rad, dist) * 0.85) discard;
          }
          // daun yang mepet banget ke kamera ikut tembus pandang
          float dc = length(vWPos - uCam);
          if (dc < 2.6) {
            ivec2 q2 = ivec2(mod(gl_FragCoord.xy, 4.0));
            float bayer2[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
            if ((bayer2[q2.x + q2.y * 4] + 0.5) / 16.0 > smoothstep(1.2, 2.6, dc)) discard;
          }
        }`
      );
  };
  return material;
}

// ---------- Geometri ----------
function blobGeometry(detail, rough) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * 3.1 + 1.7) * Math.sin(v.y * 2.7 + 0.3) * Math.sin(v.z * 3.3 + 2.1) +
      0.5 * Math.sin(v.x * 6.3 + v.z * 5.1 + v.y * 2.0);
    v.multiplyScalar(1 + rough * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

// Batang pohon dengan akar banir (khas meranti), tinggi 1 satuan (diskala per pohon)
function trunkGeometry() {
  const RS = 10, HS = 8;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= HS; j++) {
    const v = Math.pow(j / HS, 1.6); // lebih rapat di bawah, tempat banirnya
    for (let i = 0; i <= RS; i++) {
      const a = (i / RS) * Math.PI * 2;
      const fin = Math.pow(0.5 + 0.5 * Math.cos(a * 5 + 0.7), 3);
      const flare = Math.exp(-v * 16);
      const r = (0.5 - 0.15 * v) * (1 + flare * (0.5 + 1.8 * fin));
      pos.push(Math.cos(a) * r, v, Math.sin(a) * r);
      uv.push((i / RS) * 2, v * 7);
    }
  }
  for (let j = 0; j < HS; j++) {
    for (let i = 0; i < RS; i++) {
      const a = j * (RS + 1) + i, b = a + RS + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Gumpalan "kartu daun": banyak bidang bertekstur daun di dalam bola.
// Normal dibikin menghadap keluar bola biar cahayanya lembut kayak mahkota daun.
function leafClusterGeometry(cards, seed, flat = 0.75) {
  const r = rng(seed);
  const pos = [], nor = [], uv = [], idx = [];
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < cards; k++) {
    c.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.35 + 0.6 * Math.sqrt(r()));
    c.y *= flat;
    n.copy(c).normalize().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.9)).normalize();
    t1.set(0, 1, 0).cross(n);
    if (t1.lengthSq() < 0.01) t1.set(1, 0, 0);
    t1.normalize();
    t2.copy(n).cross(t1).normalize();
    const s = 0.55 + r() * 0.35;
    const base = pos.length / 3;
    const out = c.clone().normalize();
    out.y = out.y * 0.6 + 0.4; // sedikit ke atas: bagian atas lebih terang
    out.normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(c.x + (t1.x * a + t2.x * b) * s, c.y + (t1.y * a + t2.y * b) * s, c.z + (t1.z * a + t2.z * b) * s);
      nor.push(out.x, out.y, out.z);
      uv.push((a + 1) / 2, (b + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Pakis: 8 pelepah melengkung keluar
function fernGeometry() {
  const pos = [], nor = [], uv = [], idx = [];
  const SEG = 5;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const L = 0.9 + (k % 3) * 0.12, Wd = 0.2;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const out = L * t, up = 0.75 * Math.sin(t * Math.PI * 0.62) - 0.15 * t * t;
      for (const side of [-1, 1]) {
        pos.push(dx * out + sx * Wd * side, up, dz * out + sz * Wd * side);
        nor.push(dx * 0.3, 1, dz * 0.3);
        uv.push((side + 1) / 2, t);
      }
    }
    const b = k * (SEG + 1) * 2;
    for (let s = 0; s < SEG; s++) {
      const i = b + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function grassGeometry() {
  // 4 helai daun tipis yang saling silang
  const pos = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + Math.random() * 0.3;
    const ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
    const w = 0.07, h = 0.55 + Math.random() * 0.25, lean = 0.15;
    const cx = Math.cos(a + Math.PI / 2) * w, cz = Math.sin(a + Math.PI / 2) * w;
    pos.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = [];
  for (let i = 0; i < pos.length / 3; i++) { const top = pos[i * 3 + 1] > 0.1; col.push(top ? 0.78 : 0.28, top ? 0.85 : 0.32, top ? 0.62 : 0.24); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // normal menghadap atas biar rumput gak belang gelap-terang
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
}

// Mahkota sawit: 12 pelepah yang melengkung ke bawah
function palmCrownGeometry() {
  const pos = [];
  const SEG = 5, L = 3.4;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + (k % 2) * 0.2;
    const lift = k % 2 ? 0.9 : 1.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const sx = -dz, sz = dx;
    const pt = (t, side) => {
      const w = (0.42 * (1 - t) + 0.06) * side;
      return [dx * L * t + sx * w, lift * t - 2.4 * t * t, dz * L * t + sz * w];
    };
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG, t1 = (s + 1) / SEG;
      const a0 = pt(t0, -1), b0 = pt(t0, 1), a1 = pt(t1, -1), b1 = pt(t1, 1);
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Papan tulisan dari canvas
function makeSign(lines, { w = 3.2, h = 1.4, bg = '#f2efe6', fg = '#1d1a16', accent = '#c23b22', postH = 1.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = accent;
  g.fillRect(0, 0, c.width, 16);
  g.fillRect(0, c.height - 16, c.width, 16);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = (c.height - 40) / lines.length;
  lines.forEach((ln, i) => {
    g.font = `${i === 0 ? 800 : 600} ${Math.min(52, lh * 0.62)}px Inter, Arial, sans-serif`;
    g.fillText(ln, c.width / 2, 20 + lh * (i + 0.5), c.width - 30);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [
    ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0x5a4632 })),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x5a4632 }),
  ]);
  board.position.y = postH + h / 2;
  board.castShadow = true;
  grp.add(board);
  for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, postH + h, 0.12), new THREE.MeshStandardMaterial({ color: 0x4a3828 }));
    post.position.set(sx, (postH + h) / 2, -0.08);
    post.castShadow = true;
    grp.add(post);
  }
  return grp;
}

// ---------- Warna ----------
const C = {
  scorched: new THREE.Color(0x2a1a10),
  ash: new THREE.Color(0x1f1c1a),
  bank: new THREE.Color(0x8a7550),
  road: new THREE.Color(0x9a7a52),
  burn: new THREE.Color(0x7a3510),
  charcoal: new THREE.Color(0x141110),
};
const FLOOR = {
  [TYPE.FOREST]: new THREE.Color(0x6b6234),
  [TYPE.PEAT]: new THREE.Color(0x4a3524),
  [TYPE.CLEAR]: new THREE.Color(0x7d8a40),
  [TYPE.ROAD]: new THREE.Color(0x7d8a40),
  [TYPE.RIVER]: new THREE.Color(0x7d8a40),
  [TYPE.SAWIT]: new THREE.Color(0x8a7f5a),
  [TYPE.SCAR]: new THREE.Color(0x2c2826),
};

const WET = new THREE.Color(0x1f2e2c);

function classify(x, z) {
  if (riverDist(x, z) < RIVER_HALF + 1.6) return TYPE.RIVER;
  if (x < SAWIT_X) return TYPE.SAWIT;
  if (poskoDist(x, z) < POSKO.r || courtDist(x, z) < COURT.r || ceremonyDist(x, z) < CEREMONY.r) return TYPE.CLEAR;
  if (roadDist(x, z) < ROAD_HALF + 1.6) return TYPE.ROAD;
  if (inScar(x, z)) return TYPE.SCAR;
  if (inPeat(x, z)) return TYPE.PEAT;
  if (inGlade(x, z)) return TYPE.CLEAR;
  return TYPE.FOREST;
}

const tmpColor = new THREE.Color();
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.tiles = [];
    this.burntTiles = [];
    this.dirty = new Set();

    for (let zi = 0; zi < N; zi++) {
      for (let xi = 0; xi < N; xi++) {
        const cx = -HALF + (xi + 0.5) * T;
        const cz = -HALF + (zi + 0.5) * T;
        const type = classify(cx, cz);
        this.tiles.push({
          xi, zi, cx, cz, type,
          burnable: type === TYPE.FOREST || type === TYPE.PEAT,
          state: STATE.FOREST,
          heat: 0, full: 0, visHeat: 0, emitF: 0, emitS: 0,
          parts: [],
          colliders: [],
        });
      }
    }
    this.forestTotal = this.tiles.filter((t) => t.burnable).length;

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildWater();
    this.buildVegetation();
    if (!LOW) this.buildShafts();
    this.buildPosko();
    this.buildConcessionBorder();
    this.buildWells();
  }

  tile(xi, zi) {
    if (xi < 0 || zi < 0 || xi >= N || zi >= N) return null;
    return this.tiles[zi * N + xi];
  }
  tileAt(x, z) {
    return this.tile(Math.floor((x + HALF) / T), Math.floor((z + HALF) / T));
  }
  neighbors(t) {
    return [this.tile(t.xi + 1, t.zi), this.tile(t.xi - 1, t.zi), this.tile(t.xi, t.zi + 1), this.tile(t.xi, t.zi - 1)].filter(Boolean);
  }
  inRiver(x, z) {
    return riverDist(x, z) < RIVER_HALF + 0.3;
  }
  canRefill(x, z) {
    return this.inRiver(x, z) || Math.hypot(x - TANK.x, z - TANK.z) < 3.4 ||
      canalDist(x, z) < CANAL_HALF + 1.2 || WELLS.some((w) => Math.hypot(x - w.x, z - w.z) < 2.8);
  }
  nearestBurnable(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.tiles) {
      if (!t.burnable || t.state !== STATE.FOREST) continue;
      const d = Math.hypot(t.cx - x, t.cz - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  addCollider(x, z, r) {
    const t = this.tileAt(x, z);
    if (t) t.colliders.push({ x, z, r });
  }

  // ---------- Langit ----------
  buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color(0x4f9fd8) },
      horizon: { value: new THREE.Color(0xcfe6dc) },
      sunDir: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() },
      sunColor: { value: new THREE.Color(0xfff0d0) },
      cloud: { value: new THREE.Color(0xffffff) },
      cloudAmt: { value: 1 },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 cloud; uniform float cloudAmt; uniform float time; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 c = mix(horizon, top, pow(h, 0.5));
          float s = max(dot(d, sunDir), 0.0);
          // awan tipis yang jalan pelan
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(time * 0.006, time * 0.002);
            float cl = smoothstep(0.48, 0.8, fbm(uv)) * smoothstep(0.0, 0.3, d.y) * cloudAmt;
            vec3 cc = cloud * (0.85 + 0.25 * fbm(uv * 2.0 + 3.0)) + sunColor * pow(s, 6.0) * 0.4;
            c = mix(c, cc, cl * 0.85);
          }
          c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
          if (d.y < 0.0) c = horizon;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(190, 32, 16), mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.baseSky = {
      top: new THREE.Color(0x4f9fd8),
      horizon: new THREE.Color(0xcfe6dc),
      smokeTop: new THREE.Color(0x6b4a2e),
      smokeHorizon: new THREE.Color(0xd98a45),
      rainTop: new THREE.Color(0x56606a),
      rainHorizon: new THREE.Color(0x9aa7a8),
    };
    this.scene.fog = new THREE.FogExp2(this.skyUniforms.horizon.value.clone(), 0.01);
  }

  // ---------- Cahaya ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a4a22, 1.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    const s = this.sun.shadow.camera;
    s.left = -40; s.right = 40; s.top = 40; s.bottom = -40; s.near = 1; s.far = 170;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
  }

  // ---------- Tanah ----------
  buildGround() {
    const size = W + EXT * 2;
    const seg = Math.round(size / 1.3);
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundHeight(x, z));
      const bank = smoothstep(RIVER_HALF + 3.0, RIVER_HALF + 0.5, riverDist(x, z));
      const road = smoothstep(ROAD_HALF + 0.9, ROAD_HALF - 0.4, roadDist(x, z));
      tmpColor.setRGB(1, 1, 1).lerp(C.bank, bank);
      // jalan: warna tanah merah-coklat, ditimpa lewat vertex color (texture petak dibuat putih di jalan)
      tmpColor.lerp(C.road.clone().multiplyScalar(1.6), road * 0.85);
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();

    // Warna dasar per petak (berubah saat terbakar)
    this.groundData = new Uint8Array(N * N * 4);
    this.groundTex = new THREE.DataTexture(this.groundData, N, N);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.magFilter = THREE.LinearFilter;
    this.groundTex.minFilter = THREE.LinearFilter;
    // UV tanah lebih lebar dari area petak, jadi texture di-offset biar pas.
    const rep = size / W;
    this.groundTex.repeat.set(rep, rep);
    this.groundTex.offset.set(-EXT / W, -EXT / W);
    this.groundTex.wrapS = this.groundTex.wrapT = THREE.ClampToEdgeWrapping;
    for (const t of this.tiles) this.paintGround(t);

    const detail = groundTextures();
    detail.normal.repeat.set(size / 3.2, size / 3.2);
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTex, vertexColors: true, roughness: 1, normalMap: detail.normal, normalScale: new THREE.Vector2(0.9, 0.9) });
    // Serasah daun & tanah ditimpa di atas warna petak (pakai posisi dunia, diulang 2 ukuran biar gak kelihatan pola)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail.map };
      sh.vertexShader = 'varying vec2 vGW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D uDetail;\nvarying vec2 vGW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec3 dA = texture2D(uDetail, vGW * 0.31).rgb;
        vec3 dB = texture2D(uDetail, vGW * 0.083 + 0.37).rgb;
        vec3 dd = mix(dA, dB, 0.4);
        dd = mix(vec3(dot(dd, vec3(0.333))), dd, 0.55); // kurangi kuningnya
        diffuseColor.rgb *= dd * 3.3;`);
    };
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  paintGround(t) {
    const r = rng(t.xi * 131 + t.zi * 7)();
    if (t.cleared) tmpColor.set(0x8a5530);
    else if (t.logged) tmpColor.set(0x6a5232);
    else if (t.state === STATE.BURNT) tmpColor.copy(C.ash);
    else {
      tmpColor.copy(FLOOR[t.type]).offsetHSL((r - 0.5) * 0.03, 0, (r - 0.5) * 0.05);
      if (t.wet) tmpColor.lerp(WET, 0.55); // gambut basah habis kanal disekat
      tmpColor.lerp(C.scorched, t.heat * 0.7);
    }
    tmpColor.convertLinearToSRGB();
    const row = N - 1 - t.zi;
    const i = (row * N + t.xi) * 4;
    this.groundData[i] = tmpColor.r * 255;
    this.groundData[i + 1] = tmpColor.g * 255;
    this.groundData[i + 2] = tmpColor.b * 255;
    this.groundData[i + 3] = 255;
    if (this.groundTex) this.groundTex.needsUpdate = true;
  }

  // ---------- Air ----------
  buildWater() {
    this.waterN = waterNormal();
    this.waterN.repeat.set(70, 70);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x17403c, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.9,
      normalMap: this.waterN, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 5,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(W + EXT * 2, W + EXT * 2), mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // ---------- Vegetasi ----------
  buildVegetation() {
    const r = rng(1337);
    const groups = { trunk: [], canopy: [], bush: [], fern: [], grass: [], palmTrunk: [], palmCrown: [] };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const add = (group, tile, x, y, z, sx, sy, sz, color, rotY = r() * Math.PI * 2) => {
      q.setFromAxisAngle(up, rotY);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      groups[group].push({ tile, matrix: m.clone(), color });
    };
    const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
    // Titik yang aman buat pohon: gak di jalan, sungai, atau posko
    const clearOf = (x, z, pad = 0) =>
      roadDist(x, z) > ROAD_HALF + 1.4 + pad && riverDist(x, z) > RIVER_HALF + 1.6 + pad && poskoDist(x, z) > POSKO.r + pad &&
      canalDist(x, z) > CANAL_HALF + 0.8 + pad && WELLS.every((w) => Math.hypot(x - w.x, z - w.z) > 3 + pad) && courtDist(x, z) > COURT.r + pad &&
      ceremonyDist(x, z) > CEREMONY.r + pad;

    const tallTree = (tile, x, z, collide = true) => {
      const gy = groundHeight(x, z);
      const h = 11 + r() * 7;
      const s = 0.45 + r() * 0.35;
      add('trunk', tile, x, gy, z, s, h, s, hsl(0.07 + r() * 0.03, 0.14 + r() * 0.08, 0.3 + r() * 0.12));
      if (collide && tile) tile.colliders.push({ x, z, r: 0.6 * s });
      // mahkota: 4–5 gumpalan daun lebar di puncak + 1–2 dahan rendah
      const n = tile ? 4 + Math.floor(r() * 2) : 2; // pohon latar (di luar area main) lebih sederhana
      for (let b = 0; b < n; b++) {
        const w = (tile ? 2.3 : 3.2) + r() * 1.5;
        const a = r() * Math.PI * 2, d = b === 0 ? 0 : 1.8 + r() * 1.6;
        add('canopy', tile,
          x + Math.cos(a) * d, gy + h + (r() - 0.35) * 2, z + Math.sin(a) * d,
          w, w * (0.55 + r() * 0.2), w * (0.85 + r() * 0.3),
          hsl(0.22 + r() * 0.08, 0.45 + r() * 0.2, 0.26 + r() * 0.1));
      }
      if (r() < 0.7) {
        const w = 1.4 + r() * 0.8, a = r() * Math.PI * 2;
        add('canopy', tile, x + Math.cos(a) * 1.6, gy + h * (0.55 + r() * 0.2), z + Math.sin(a) * 1.6,
          w, w * 0.6, w, hsl(0.24 + r() * 0.06, 0.45, 0.24 + r() * 0.08));
      }
    };
    // Pohon lapisan tengah (4–8 m): daunnya pas sejajar kamera, bikin hutan kerasa rimbun
    const midTree = (tile, x, z) => {
      const gy = groundHeight(x, z);
      const h = 4 + r() * 4;
      add('trunk', tile, x, gy, z, 0.28 + r() * 0.1, h, 0.28 + r() * 0.1, hsl(0.08, 0.15, 0.3 + r() * 0.1));
      const w = 1.6 + r() * 1.0;
      add('canopy', tile, x, gy + h, z, w, w * 0.75, w, hsl(0.25 + r() * 0.07, 0.5 + r() * 0.15, 0.27 + r() * 0.1));
      if (r() < 0.6) add('canopy', tile, x + (r() - 0.5) * 1.6, gy + h * 0.7, z + (r() - 0.5) * 1.6, w * 0.7, w * 0.5, w * 0.7, hsl(0.27, 0.5, 0.25 + r() * 0.08));
    };
    const fern = (tile, x, z, dry = false) => {
      if (LOW && r() < 0.5) return;
      const s = 0.7 + r() * 0.7;
      add('fern', tile, x, groundHeight(x, z), z, s, s * (0.8 + r() * 0.4), s,
        dry ? hsl(0.12 + r() * 0.04, 0.35, 0.3) : hsl(0.25 + r() * 0.06, 0.5, 0.3 + r() * 0.1));
    };
    const smallTree = (tile, x, z, dry = false) => {
      const gy = groundHeight(x, z);
      const h = 1.8 + r() * 1.6;
      add('trunk', tile, x, gy, z, 0.22, h, 0.22, hsl(0.08, 0.18, 0.36));
      const w = 0.9 + r() * 0.6;
      add('canopy', tile, x, gy + h + 0.2, z, w, w * 0.8, w,
        dry ? hsl(0.12 + r() * 0.03, 0.3, 0.2) : hsl(0.3 + r() * 0.04, 0.55, 0.2 + r() * 0.06));
    };
    const grass = (tile, x, z, color, s = 0.8 + r() * 0.8) => {
      if (LOW && r() < 0.5) return;
      add('grass', tile, x, groundHeight(x, z), z, s, s * (0.8 + r() * 0.6), s, color);
    };
    const bush = (tile, x, z, color) => {
      const w = 0.7 + r() * 0.7;
      add('bush', tile, x, groundHeight(x, z) + w * 0.4, z, w, w * 0.75, w, color);
    };
    const inTile = (t) => [t.cx + (r() - 0.5) * T * 0.95, t.cz + (r() - 0.5) * T * 0.95];

    for (const t of this.tiles) {
      // kepadatan hutan bervariasi biar ada bagian rapat & renggang
      const dens = 0.5 + 0.5 * Math.sin(t.cx * 0.07) * Math.cos(t.cz * 0.06 + 1);
      switch (t.type) {
        case TYPE.FOREST: {
          const tall = dens > 0.65 ? 2 : dens < 0.22 ? 0 : 1;
          for (let k = 0; k < tall; k++) {
            const [x, z] = inTile(t);
            if (clearOf(x, z, 1)) tallTree(t, x, z);
          }
          if (r() < 0.35 + (tall === 0 ? 0.3 : 0)) {
            const [x, z] = inTile(t);
            if (clearOf(x, z)) smallTree(t, x, z);
          }
          if (r() < 0.45 + (tall === 0 ? 0.25 : 0)) {
            const [x, z] = inTile(t);
            if (clearOf(x, z, 0.5)) midTree(t, x, z);
          }
          for (let k = 0; k < 3; k++) {
            const [x, z] = inTile(t);
            if (clearOf(x, z, -0.5)) fern(t, x, z);
          }
          for (let k = 0; k < 2; k++) {
            const [x, z] = inTile(t);
            if (clearOf(x, z)) bush(t, x, z, hsl(0.26 + r() * 0.08, 0.55, 0.2 + r() * 0.08));
          }
          for (let k = 0; k < 9; k++) {
            const [x, z] = inTile(t);
            if (clearOf(x, z, -1)) grass(t, x, z, hsl(0.22 + r() * 0.06, 0.5, 0.26 + r() * 0.1));
          }
          break;
        }
        case TYPE.PEAT: {
          // gambut: semak pakis, rumput kering, pohon kecil jarang
          if (r() < 0.1) { const [x, z] = inTile(t); if (clearOf(x, z)) smallTree(t, x, z, true); }
          if (r() < 0.6) { const [x, z] = inTile(t); if (clearOf(x, z)) bush(t, x, z, hsl(0.11 + r() * 0.05, 0.35, 0.16 + r() * 0.05)); }
          if (r() < 0.8) { const [x, z] = inTile(t); if (clearOf(x, z)) fern(t, x, z, r() < 0.6); }
          for (let k = 0; k < 11; k++) { const [x, z] = inTile(t); if (clearOf(x, z, -1)) grass(t, x, z, hsl(0.1 + r() * 0.05, 0.45, 0.3 + r() * 0.08)); }
          break;
        }
        case TYPE.CLEAR: {
          for (let k = 0; k < 12; k++) {
            const [x, z] = inTile(t);
            if (poskoDist(x, z) > 7 && courtDist(x, z) > 8 && ceremonyDist(x, z) > 4 && roadDist(x, z) > ROAD_HALF) grass(t, x, z, hsl(0.24 + r() * 0.05, 0.5, 0.33 + r() * 0.08));
          }
          if (r() < 0.25) { const [x, z] = inTile(t); if (poskoDist(x, z) > 9) bush(t, x, z, hsl(0.27, 0.5, 0.24)); }
          break;
        }
        case TYPE.ROAD:
        case TYPE.RIVER: {
          for (let k = 0; k < 5; k++) {
            const [x, z] = inTile(t);
            if (roadDist(x, z) > ROAD_HALF + 0.4 && riverDist(x, z) > RIVER_HALF + 1.2 && poskoDist(x, z) > 7)
              grass(t, x, z, hsl(0.23, 0.5, 0.32), 1 + r() * 0.6);
          }
          break;
        }
        case TYPE.SCAR: {
          // bekas kebakaran tahun lalu: tunggul gosong
          if (r() < 0.6) {
            const [x, z] = inTile(t);
            add('trunk', null, x, groundHeight(x, z), z, 0.5, 0.8 + r() * 2.5, 0.5, C.charcoal);
          }
          break;
        }
      }
    }

    // Hutan latar di luar area main (gak bisa terbakar, cuma pemandangan)
    for (let x = -HALF - EXT + 3; x < HALF + EXT - 3; x += 6.5) {
      for (let z = -HALF - EXT + 3; z < HALF + EXT - 3; z += 6.5) {
        const px = x + (r() - 0.5) * 4, pz = z + (r() - 0.5) * 4;
        if (Math.abs(px) < HALF + 2 && Math.abs(pz) < HALF + 2) continue;
        if (px < SAWIT_X || riverDist(px, pz) < RIVER_HALF + 2 || roadDist(px, pz) < ROAD_HALF + 2) continue;
        tallTree(null, px, pz, false);
      }
    }

    // Kebun sawit konsesi: baris-baris lurus yang seragam
    for (let x = SAWIT_X - 4; x > -HALF - EXT; x -= 7.5) {
      let row = 0;
      for (let z = -HALF - EXT + 4; z < HALF + EXT; z += 7.5) {
        const pz = z + (row++ % 2) * 0.01 + ((Math.round(x) % 2) * 3.75);
        const gy = groundHeight(x, pz);
        const h = 4.5 + r() * 1.2;
        add('palmTrunk', null, x, gy, pz, 0.55, h, 0.55, hsl(0.08, 0.25, 0.22));
        add('palmCrown', null, x, gy + h, pz, 1, 1, 1, hsl(0.2 + r() * 0.02, 0.35, 0.28));
      }
    }

    const bark = barkTextures();
    const leafTex = leafClusterTexture();
    const leafMat = (wind) => enhance(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), wind);
    const defs = {
      trunk: [trunkGeometry(), enhance(new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }), 0), true],
      canopy: [leafClusterGeometry(LOW ? 16 : 24, 11), leafMat(0.035), true],
      bush: [leafClusterGeometry(18, 23, 0.8), leafMat(0.05), true],
      fern: [fernGeometry(), enhance(new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }), 0.12), false],
      grass: [grassGeometry(), enhance(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }), 0.25), false],
      palmTrunk: [new THREE.CylinderGeometry(0.4, 0.5, 1, 7, 1).translate(0, 0.5, 0), enhance(new THREE.MeshStandardMaterial({ roughness: 1 }), 0), true],
      palmCrown: [palmCrownGeometry(), enhance(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), 0.03), true],
    };

    // Tiap jenis tanaman dipecah per kotak area (±43 m). Kotak yang di luar
    // pandangan kamera (atau di luar area bayangan) gak digambar sama sekali.
    this.meshes = {};
    this.chunks = {};
    const CH = 6, span = W + EXT * 2;
    const pos = new THREE.Vector3();
    for (const [key, list] of Object.entries(groups)) {
      const [geo, mat, cast] = defs[key];
      const buckets = new Map();
      for (const it of list) {
        pos.setFromMatrixPosition(it.matrix);
        const cx = clamp(Math.floor(((pos.x + span / 2) / span) * CH), 0, CH - 1);
        const cz = clamp(Math.floor(((pos.z + span / 2) / span) * CH), 0, CH - 1);
        const k = cz * CH + cx;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(it);
      }
      this.chunks[key] = [];
      for (const items of buckets.values()) {
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        items.forEach((it, i) => {
          mesh.setMatrixAt(i, it.matrix);
          mesh.setColorAt(i, it.color);
          if (it.tile) it.tile.parts.push({ key, mesh, i, base: it.color });
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.chunks[key].push(mesh);
        this.scene.add(mesh);
      }
      // dipakai adegan ending buat ambil geometri & material
      this.meshes[key] = this.chunks[key][0] || new THREE.InstancedMesh(geo, mat, 1);
    }
    this.instanceCount = Object.values(groups).reduce((a, l) => a + l.length, 0);
  }

  // ---------- Sinar matahari tembus kanopi ----------
  // Bidang tipis bersilang, condong ke arah matahari, warnanya ditambahkan (additive).
  buildShafts() {
    const r = rng(404);
    const sunDir = this.skyUniforms.sunDir.value;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir);
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const cross = geo.clone().rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const a = geo.attributes, b = cross.attributes;
    merged.setAttribute('position', new THREE.Float32BufferAttribute([...a.position.array, ...b.position.array], 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute([...a.uv.array, ...b.uv.array], 2));
    merged.setIndex([...geo.index.array, ...cross.index.array.map((i) => i + a.position.count)]);
    const mat = new THREE.MeshBasicMaterial({
      map: shaftTexture(), color: 0xffe2a8, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const forest = this.tiles.filter((t) => t.type === TYPE.FOREST);
    const n = 46;
    const mesh = new THREE.InstancedMesh(merged, mat, n);
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = forest[Math.floor(r() * forest.length)];
      p.set(t.cx + (r() - 0.5) * T, groundHeight(t.cx, t.cz) - 0.5, t.cz + (r() - 0.5) * T);
      s.set(1.2 + r() * 2.2, 20 + r() * 8, 1.2 + r() * 2.2);
      const qi = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI));
      m.compose(p, qi, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.shafts = mesh;
  }

  // ---------- Posko darurat ----------
  buildPosko() {
    const grp = new THREE.Group();
    const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const place = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
      return mesh;
    };
    const { x: px, z: pz } = POSKO;
    const gy = groundHeight(px, pz);

    // Tenda terpal oranye
    const tent = place(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 6, 3, 1), tentMaterial()), px - 5, gy + 1.6, pz - 1);
    tent.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // prisma segitiga, puncaknya ke atas, memanjang di sumbu x
    tent.scale.set(1, 1, 0.75);
    this.addCollider(px - 6.5, pz - 1, 2.6);
    this.addCollider(px - 3.5, pz - 1, 2.6);

    // Tandon air biru di atas penyangga
    place(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 20), tandonMaterial()), TANK.x, gy + 2.3, TANK.z);
    for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]])
      place(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), mat(0x666666, 0.5)), TANK.x + ox, gy + 0.6, TANK.z + oz);
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), mat(0x222222)), TANK.x + 1.4, gy + 0.9, TANK.z).rotation.z = Math.PI / 2;
    this.addCollider(TANK.x, TANK.z, 1.5);

    // Tiang bendera merah putih
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), mat(0xdddddd, 0.3)), px - 8, gy + 3.5, pz + 7);
    const fc = document.createElement('canvas');
    fc.width = 64; fc.height = 42;
    const fg = fc.getContext('2d');
    fg.fillStyle = '#d61f26'; fg.fillRect(0, 0, 64, 21);
    fg.fillStyle = '#ffffff'; fg.fillRect(0, 21, 64, 21);
    const ft = new THREE.CanvasTexture(fc);
    ft.colorSpace = THREE.SRGBColorSpace;
    this.flag = place(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2, 8, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide })), px - 7.05, gy + 6.3, pz + 7);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();
    this.addCollider(px - 8, pz + 7, 0.3);

    // Peti logistik
    for (const [ox, oz, s] of [[-1, 4, 1], [0.2, 4.4, 0.8], [-0.4, 4.2, 0.7]])
      place(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMaterial()), px + ox - 6, gy + s / 2 + (s < 0.75 ? 0.8 : 0), pz + oz - 1);

    // Papan nama posko
    const sign = makeSign(['POSKO DARURAT', 'PENANGANAN KARHUTLA'], { w: 3.4, h: 1.3 });
    sign.position.set(px + 4, gy, pz + 2);
    sign.rotation.y = -0.5;
    grp.add(sign);

    this.scene.add(grp);
  }

  // ---------- Sumur bor ----------
  buildWells() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f86c9, roughness: 0.4 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.5 });
    for (const w of WELLS) {
      const g = new THREE.Group();
      const gy = groundHeight(w.x, w.z);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.5, 18), concrete);
      ring.position.y = 0.25;
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshStandardMaterial({ color: 0x2c6f6a, roughness: 0.1 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.42;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), blue);
      pipe.position.set(0.9, 0.65, 0);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45), red);
      pump.position.set(1.3, 0.23, 0.5);
      for (const o of [ring, water, pipe, pump]) { o.castShadow = true; o.receiveShadow = true; g.add(o); }
      const sign = makeSign(['SUMUR BOR', 'Sumber air pemadam'], { w: 1.6, h: 0.7, postH: 0.9, accent: '#2f86c9' });
      sign.position.set(-1.2, 0, -0.6);
      sign.rotation.y = 0.4;
      g.add(sign);
      g.position.set(w.x, gy, w.z);
      this.scene.add(g);
      this.addCollider(w.x, w.z, 0.8);
    }
  }

  // ---------- Pagar & papan batas konsesi ----------
  buildConcessionBorder() {
    const posts = [];
    for (let z = -HALF - EXT; z < HALF + EXT; z += 5) {
      if (riverDist(SAWIT_X, z) < RIVER_HALF + 1) continue;
      posts.push(z);
    }
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), new THREE.MeshStandardMaterial({ color: 0x9a9184 }), posts.length);
    const m = new THREE.Matrix4();
    posts.forEach((z, i) => {
      m.makeTranslation(SAWIT_X, groundHeight(SAWIT_X, z) + 0.75, z);
      postMesh.setMatrixAt(i, m);
    });
    postMesh.castShadow = true;
    this.scene.add(postMesh);
    for (const y of [0.6, 1.2]) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, W + EXT * 2), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }));
      wire.position.set(SAWIT_X, y, 0);
      this.scene.add(wire);
    }

    const sign = makeSign(['BATAS KONSESI', 'PT LAHAN SIAP TANAM KILAT', 'Dilarang masuk tanpa izin*', '*izin bisa diatur'], {
      w: 4, h: 2.2, bg: '#f4e9c8', accent: '#2f6b3a',
    });
    sign.position.set(SAWIT_X + 1.5, groundHeight(SAWIT_X + 1.5, 10), 10);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
  }

  // ---------- Visual saat terbakar ----------
  setBurnVisual(t, heat) {
    if (Math.abs(heat - t.visHeat) < 0.04) return;
    t.visHeat = heat;
    for (const part of t.parts) {
      const target = part.key === 'trunk' ? C.charcoal : C.burn;
      tmpColor.copy(part.base).lerp(target, heat * (part.key === 'trunk' ? 0.5 : 0.85));
      part.mesh.setColorAt(part.i, tmpColor);
      this.dirty.add(part.mesh);
    }
    this.paintGround(t);
  }

  restore(t) {
    t.visHeat = 0;
    for (const part of t.parts) {
      part.mesh.setColorAt(part.i, part.base);
      this.dirty.add(part.mesh);
    }
    this.paintGround(t);
  }

  setBurnt(t) {
    t.state = STATE.BURNT;
    t.heat = 0;
    this.burntTiles.push(t);
    for (const part of t.parts) {
      const mesh = part.mesh;
      if (part.key === 'trunk') {
        mesh.setColorAt(part.i, C.charcoal);
        this.dirty.add(mesh);
      } else {
        mesh.setMatrixAt(part.i, zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.paintGround(t);
  }

  // Petak diratakan bulldozer: semua tanaman hilang, tanah merah terbuka.
  setCleared(t) {
    if (!t || !t.burnable || t.state === STATE.BURNT) return false;
    t.state = STATE.BURNT;
    t.heat = 0;
    t.cleared = true;
    for (const part of t.parts) {
      part.mesh.setMatrixAt(part.i, zeroMatrix);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    t.colliders.length = 0;
    this.paintGround(t);
    return true;
  }

  // Petak ditebang: pohon jadi tunggul, daun hilang. Dihitung hutan yang hilang.
  setLogged(t) {
    if (!t || t.state !== STATE.FOREST) return;
    t.state = STATE.BURNT;
    t.logged = true;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const part of t.parts) {
      const mesh = part.mesh;
      if (part.key === 'trunk') {
        mesh.getMatrixAt(part.i, m);
        m.decompose(p, q, s);
        s.y = 0.7;
        m.compose(p, q, s);
        mesh.setMatrixAt(part.i, m);
      } else if (part.key !== 'grass') {
        mesh.setMatrixAt(part.i, zeroMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    t.colliders.length = 0;
    this.paintGround(t);
  }

  // Dorong keluar dari pohon/bangunan. Kalau vel dikasih, gerakan ke arah pohon dibuang
  // dan diubah jadi meluncur ke samping, biar gak nyangkut. Balikin arah dorongan (atau null).
  collide(pos, radius, vel = null) {
    const t = this.tileAt(pos.x, pos.z);
    let hit = null;
    if (t) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = this.tile(t.xi + dx, t.zi + dz);
          if (!n) continue;
          for (const c of n.colliders) {
            const ox = pos.x - c.x, oz = pos.z - c.z;
            const d = Math.hypot(ox, oz);
            const min = c.r + radius;
            if (d < min && d > 0.0001) {
              const nx = ox / d, nz = oz / d;
              pos.x = c.x + nx * min;
              pos.z = c.z + nz * min;
              hit = hit ? { x: hit.x + nx, z: hit.z + nz } : { x: nx, z: nz };
              if (vel) {
                const vn = vel.x * nx + vel.z * nz;
                if (vn < 0) {
                  vel.x -= nx * vn; vel.z -= nz * vn;
                  // nabrak lurus: kasih dorongan ke samping biar otomatis muter
                  const tx = -nz, tz = nx;
                  const vt = vel.x * tx + vel.z * tz;
                  const side = vt === 0 ? (Math.sin(c.x * 12.9 + c.z * 78.2) > 0 ? 1 : -1) : Math.sign(vt);
                  const push = Math.max(0, -vn * 0.9 - Math.abs(vt));
                  vel.x += tx * side * push; vel.z += tz * side * push;
                }
              }
            }
          }
        }
      }
    }
    pos.x = clamp(pos.x, -HALF + 1, HALF - 1);
    pos.z = clamp(pos.z, -HALF + 1, HALF - 1);
    if (hit) { const l = Math.hypot(hit.x, hit.z) || 1; hit.x /= l; hit.z /= l; }
    return hit;
  }

  // Pohon terdekat di sekitar titik (buat bantuan belok motor)
  obstacleNear(x, z, range) {
    const t = this.tileAt(x, z);
    if (!t) return null;
    let best = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.tile(t.xi + dx, t.zi + dz);
        if (!n) continue;
        for (const c of n.colliders) {
          const d = Math.hypot(x - c.x, z - c.z) - c.r;
          if (d < range && d < bd) { bd = d; best = c; }
        }
      }
    }
    return best;
  }

  setViewLine(camPos, targetPos) {
    shared.uCam.value.copy(camPos);
    shared.uTarget.value.copy(targetPos);
  }

  // smoke: 0 (cerah) .. 1 (asap pekat), rain: 0..1
  updateAtmosphere(dt, time, smoke, rain) {
    shared.uTime.value = time;
    for (const mesh of this.dirty) mesh.instanceColor.needsUpdate = true;
    this.dirty.clear();

    // Bendera berkibar
    if (this.flag) {
      const a = this.flag.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const bx = this.flagBase[i * 3];
        const k = (bx + 0.9) / 1.8;
        a.setZ(i, Math.sin(time * 5 + bx * 3) * 0.15 * k);
      }
      a.needsUpdate = true;
    }

    const b = this.baseSky;
    this.skyUniforms.top.value.copy(b.top).lerp(b.smokeTop, smoke).lerp(b.rainTop, rain);
    const hor = this.skyUniforms.horizon.value.copy(b.horizon).lerp(b.smokeHorizon, smoke).lerp(b.rainHorizon, rain);
    this.scene.fog.color.copy(hor);
    this.scene.fog.density = 0.009 + smoke * 0.026 + rain * 0.01;
    this.sun.color.setHSL(0.1 - smoke * 0.04, 0.6 + smoke * 0.3, 0.85 - smoke * 0.2);
    this.sun.intensity = (3.2 - smoke * 1.4) * (1 - rain * 0.6);
    this.hemi.intensity = 1.5 - smoke * 0.3;
    this.skyUniforms.sunColor.value.setHSL(0.1 - smoke * 0.05, 0.9, 0.85 - smoke * 0.25).multiplyScalar(1 - rain);
    this.skyUniforms.time.value = time;
    if (this.waterN) this.waterN.offset.set(time * 0.004, time * 0.011); // arus sungai
    this.skyUniforms.cloud.value.setRGB(1, 0.98, 0.95).lerp(tmpColor.set(0x8a6a4a), smoke).lerp(tmpColor.set(0x6a7076), rain);
    this.skyUniforms.cloudAmt.value = 1 + rain * 0.8;
    // sinar matahari tembus kanopi: makin kelihatan di asap tipis (jadi oranye), hilang pas hujan
    if (this.shafts) {
      const m = this.shafts.material;
      m.opacity = (0.11 + smoke * 0.1) * (1 - rain) * (1 - Math.max(0, smoke - 0.7) * 2.5);
      m.color.setHSL(0.12 - smoke * 0.06, 0.6 + smoke * 0.3, 0.75);
    }
  }
}
