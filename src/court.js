// Pengadilan Negeri: serahkan 3 bukti di sini (Level 3) buat mencabut izin konsesi.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { COURT } from './map.js';
import { makeLabel } from './dozer.js';
import { swapInModel } from './models.js';

export const EVIDENCE_NEEDED = 3;

export class Court {
  constructor(scene, world) {
    this.pos = new THREE.Vector3(COURT.x, 0, COURT.z);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.8 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.9 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x8a3a24, roughness: 0.7 });
    const add = (geo, m, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      g.add(o);
      return o;
    };
    // menghadap utara (-z), ke arah jalan dari posko
    add(new THREE.BoxGeometry(11, 0.4, 8.5), stone, 0, 0.2, 0);
    add(new THREE.BoxGeometry(11, 0.25, 1.2), stone, 0, 0.12, -4.8); // anak tangga
    add(new THREE.BoxGeometry(9, 4.6, 6), white, 0, 2.7, 0.8);
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 14), white, -3.6 + i * 1.8, 2.7, -3.2);
    add(new THREE.BoxGeometry(10, 0.5, 8), stone, 0, 5.25, 0);
    const roof = add(new THREE.CylinderGeometry(4.8, 4.8, 10, 3, 1), roofM, 0, 6.4, 0);
    roof.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    roof.scale.set(1, 1, 0.35);
    add(new THREE.BoxGeometry(1.6, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3020 }), 0, 1.7, -2.2); // pintu
    const sign = makeLabel(['PENGADILAN NEGERI', '⚖  Demi Keadilan (dan Hutan)'], { w: 6, h: 1.1, bg: '#1d2a4a', fg: '#f2efe6' });
    sign.position.set(0, 4.55, -3.6);
    sign.rotation.y = Math.PI;
    g.add(sign);

    g.position.set(COURT.x, groundHeight(COURT.x, COURT.z), COURT.z);
    scene.add(g);
    this.group = g;
    // Model Meshy (ASET-MESHY.md #9): model ngadep +z, gedung ini ngadep -z, jadi diputar 180°.
    // Papan nama tetap dari kode, dipindah jadi papan berdiri di depan tangga.
    swapInModel(g, 'pengadilan', { length: 9, rotY: Math.PI }, [sign]).then((m) => {
      if (!m) return;
      const box = m.userData.box;
      // papan di samping kiri tangga, agak serong ke arah jalan datang
      const board = new THREE.Group();
      board.position.set(-5.4, 0, box.min.z - 1.4);
      board.rotation.y = -0.35;
      g.add(board);
      board.add(sign);
      sign.position.set(0, 1.3, 0);
      for (const x of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.15), stone);
        leg.position.set(x, 0.4, 0.05);
        leg.castShadow = true;
        board.add(leg);
      }
    });
    for (const [ox, oz, r] of [[-3, 1, 3.2], [3, 1, 3.2], [0, 1, 3.2]]) world.addCollider(COURT.x + ox, COURT.z + oz, r);
    this.door = new THREE.Vector3(COURT.x, 0, COURT.z - 5.2);
  }

  near(p) {
    return Math.hypot(p.x - this.door.x, p.z - this.door.z) < 4.5;
  }
}
