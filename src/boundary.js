// Batas area main: tiang + pita kuning "BATAS KAWASAN" di sekeliling peta,
// plus papan petunjuk balik. Biar pemain gak kira macet pas mentok di pinggir.
import * as THREE from 'three';
import { HALF, LOW } from './config.js';
import { groundHeight } from './world.js';
import { makeLabel } from './dozer.js';

const EDGE = HALF - 0.5; // pemain berhenti di HALF - 1, jadi pita pas di depannya
const STEP = 5; // jarak antar tiang
const TAPE_Y = [0.7, 1.05];

function tapeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c12e';
  g.fillRect(0, 0, 512, 48);
  g.fillStyle = '#1b1408';
  g.fillRect(0, 0, 512, 5);
  g.fillRect(0, 43, 512, 5);
  g.font = '800 26px Inter, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('BATAS KAWASAN  ✕  BATAS KAWASAN  ✕', 10, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Titik-titik tiang keliling peta (searah jarum jam), plus arah "ke dalam" tiap sisi
function perimeter() {
  const sides = [
    { from: [-EDGE, -EDGE], dir: [1, 0], inward: [0, 1] },
    { from: [EDGE, -EDGE], dir: [0, 1], inward: [-1, 0] },
    { from: [EDGE, EDGE], dir: [-1, 0], inward: [0, -1] },
    { from: [-EDGE, EDGE], dir: [0, -1], inward: [1, 0] },
  ];
  const len = EDGE * 2;
  const n = Math.round(len / STEP);
  return sides.map((s) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      pts.push([s.from[0] + s.dir[0] * t, s.from[1] + s.dir[1] * t]);
    }
    return { ...s, pts };
  });
}

export function buildBoundary(scene) {
  const group = new THREE.Group();
  const sides = perimeter();

  // Tiang
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6).translate(0, 0.65, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
  const total = sides.reduce((a, s) => a + s.pts.length, 0);
  const posts = new THREE.InstancedMesh(postGeo, postMat, total);
  const m = new THREE.Matrix4();
  let k = 0;
  for (const s of sides) {
    for (const [x, z] of s.pts) {
      m.makeTranslation(x, groundHeight(x, z) - 0.1, z);
      posts.setMatrixAt(k++, m);
    }
  }
  posts.castShadow = !LOW;
  posts.computeBoundingSphere();
  group.add(posts);

  // Pita: satu geometri buat semua segmen, ngikutin naik-turun tanah
  const verts = [], uvs = [], idx = [];
  const W = 0.13;
  for (const s of sides) {
    let u = 0;
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [x0, z0] = s.pts[i], [x1, z1] = s.pts[i + 1];
      const g0 = groundHeight(x0, z0), g1 = groundHeight(x1, z1);
      const du = Math.hypot(x1 - x0, z1 - z0) / 4.5;
      for (const y of TAPE_Y) {
        const b = verts.length / 3;
        const sag = 0.06; // agak melengkung di tengah biar kayak pita beneran
        const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, gm = (g0 + g1) / 2 - sag;
        verts.push(
          x0, g0 + y - W / 2, z0, x0, g0 + y + W / 2, z0,
          xm, gm + y - W / 2, zm, xm, gm + y + W / 2, zm,
          x1, g1 + y - W / 2, z1, x1, g1 + y + W / 2, z1,
        );
        uvs.push(u, 0, u, 1, u + du / 2, 0, u + du / 2, 1, u + du, 0, u + du, 1);
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3, b + 2, b + 4, b + 3, b + 3, b + 4, b + 5);
      }
      u += du;
    }
  }
  const tapeGeo = new THREE.BufferGeometry();
  tapeGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  tapeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  tapeGeo.setIndex(idx);
  tapeGeo.computeVertexNormals();
  const tex = tapeTexture();
  // sedikit nyala sendiri biar tetap kebaca pas asap tebal
  const tape = new THREE.Mesh(tapeGeo, new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.6, side: THREE.DoubleSide,
  }));
  group.add(tape);

  // Papan petunjuk menghadap ke dalam
  const signTpl = makeLabel(['BATAS KAWASAN', '↩ Balik ke hutan'], { w: 2.6, h: 1.0, bg: '#f2c12e', fg: '#1b1408', border: '#1b1408' });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6).translate(0, 1.2, 0);
  for (const s of sides) {
    for (const t of [-48, -16, 16, 48]) {
      // posisi di sepanjang sisi, digeser dikit ke dalam
      const along = s.dir[0] !== 0 ? [t, s.from[1]] : [s.from[0], t];
      const x = along[0] + s.inward[0] * 0.4, z = along[1] + s.inward[1] * 0.4;
      const gy = groundHeight(x, z);
      const pole = new THREE.Mesh(poleGeo, postMat);
      pole.position.set(x, gy - 0.1, z);
      const sign = signTpl.clone();
      sign.position.set(x, gy + 2.0, z);
      sign.rotation.y = Math.atan2(s.inward[0], s.inward[1]);
      group.add(pole, sign);
    }
  }

  scene.add(group);
  return group;
}

// Jarak ke pinggir terdekat (meter). Dipakai HUD buat peringatan.
export function edgeDistance(x, z) {
  return HALF - 1 - Math.max(Math.abs(x), Math.abs(z));
}
