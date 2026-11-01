// "Tikus berdasi": kepala tikus + dasi, dipakai buat pelaku & investor.
// Simbol koruptor yang udah umum di Indonesia, sengaja kartun biar jelas fiktif.
import * as THREE from 'three';

const fur = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9 });
const furDark = new THREE.MeshStandardMaterial({ color: 0x6e6964, roughness: 0.9 });
const pink = new THREE.MeshStandardMaterial({ color: 0xe8a0a0, roughness: 0.6 });
const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.3 });
const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });

function add(group, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

// Kepala tikus menghadap +z, pusatnya di (0, y, 0)
export function addRatHead(group, y = 1.9) {
  const head = add(group, new THREE.SphereGeometry(0.22, 18, 14), fur, 0, y, 0);
  head.scale.set(1, 0.95, 1.1);
  const snout = add(group, new THREE.ConeGeometry(0.15, 0.32, 14), fur, 0, y - 0.04, 0.27);
  snout.rotation.x = Math.PI / 2;
  add(group, new THREE.SphereGeometry(0.045, 10, 8), pink, 0, y - 0.04, 0.44); // hidung
  for (const s of [-1, 1]) {
    // telinga bundar
    const ear = add(group, new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), furDark, s * 0.15, y + 0.2, -0.02);
    ear.rotation.x = Math.PI / 2;
    const inner = add(group, new THREE.CylinderGeometry(0.075, 0.075, 0.032, 16), pink, s * 0.15, y + 0.2, 0.0);
    inner.rotation.x = Math.PI / 2;
    add(group, new THREE.SphereGeometry(0.035, 8, 8), black, s * 0.09, y + 0.06, 0.18); // mata
    // kumis
    for (const k of [-1, 1]) {
      const w = add(group, new THREE.BoxGeometry(0.22, 0.006, 0.006), black, s * 0.13, y - 0.03 + k * 0.02, 0.36);
      w.rotation.z = s * k * 0.15;
    }
  }
  // gigi depan
  add(group, new THREE.BoxGeometry(0.05, 0.05, 0.015), white, 0, y - 0.12, 0.38);
}

// Kerah putih + dasi di dada (dada sekitar ketinggian y)
export function addTie(group, y = 1.45, color = 0xc4161c) {
  const tieMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  add(group, new THREE.BoxGeometry(0.22, 0.06, 0.05), white, 0, y + 0.18, 0.24); // kerah
  add(group, new THREE.BoxGeometry(0.07, 0.06, 0.04), tieMat, 0, y + 0.13, 0.27); // simpul
  const blade = add(group, new THREE.ConeGeometry(0.07, 0.38, 4), tieMat, 0, y - 0.07, 0.27);
  blade.rotation.z = Math.PI; // ujung lancip ke bawah
  blade.scale.z = 0.35;
}

// Ekor tikus panjang di belakang pinggang
export function addTail(group, y = 0.95) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y, -0.22),
    new THREE.Vector3(0.05, y - 0.25, -0.5),
    new THREE.Vector3(-0.1, y - 0.7, -0.75),
    new THREE.Vector3(0.12, y - 0.85, -1.05),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), pink);
  tail.castShadow = true;
  group.add(tail);
}
