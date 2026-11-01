// Sekat kanal: tutup kanal drainase biar gambut di sekitarnya basah lagi.
// Ini cara mitigasi beneran di lahan gambut. Tahan tombol aksi di tumpukan karung.
// Gambut basah: susah dinyalain, api menjalar jauh lebih lambat.
import * as THREE from 'three';
import { STATE } from './config.js';
import { groundHeight } from './world.js';
import { CANAL, CANAL_HALF } from './map.js';
import { makeLabel } from './dozer.js';
import { sackMaterial, woodMaterial } from './props.js';

const HOLD = 2.2; // detik menahan tombol
const RANGE = 3.4; // jarak dari titik sekat buat mulai bangun
export const WET_R = 16; // radius gambut yang jadi basah

const wood = woodMaterial(); // tekstur serat kayu (props.js)
const sack = sackMaterial(); // tekstur goni (props.js)
const sackGeo = new THREE.SphereGeometry(0.32, 10, 6).scale(1.3, 0.55, 0.8);
const stakeGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6);

export class Dams {
  constructor(scene, world, fire) {
    this.world = world;
    this.fire = fire;
    this.events = [];
    this.list = [];
    const [[ax, az], [bx, bz]] = CANAL;
    const dir = new THREE.Vector2(bx - ax, bz - az).normalize();
    const across = Math.atan2(dir.x, dir.y); // sumbu z lokal = arah kanal, jadi tembok (sumbu x) melintang
    for (const f of [0.2, 0.5, 0.8]) {
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const g = new THREE.Group();
      g.position.set(x, groundHeight(x, z), z);
      g.rotation.y = across;
      scene.add(g);

      // Belum dibangun: tumpukan karung di tepi + papan
      const pile = new THREE.Group();
      pile.position.set(CANAL_HALF + 1.4, groundHeight(x + 2, z) - g.position.y + 0.1, 0);
      for (const [px, py, pz] of [[-0.35, 0.15, -0.3], [0.35, 0.15, -0.3], [0, 0.15, 0.35], [0, 0.45, 0]]) {
        const s = new THREE.Mesh(sackGeo, sack);
        s.position.set(px, py, pz);
        s.castShadow = true;
        pile.add(s);
      }
      const sign = makeLabel(['SEKAT KANAL', 'Tahan buat bangun'], { w: 1.8, h: 0.75, bg: '#f2c12e', fg: '#1b1408', border: '#1b1408' });
      sign.position.set(0, 1.5, 0);
      sign.rotation.y = -across + Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), wood);
      pole.position.y = 0.6;
      pile.add(sign, pole);
      g.add(pile);

      // Udah dibangun: deretan patok + karung melintang kanal, air ketahan
      const wall = new THREE.Group();
      const span = CANAL_HALF + 1.2;
      for (let i = -span; i <= span + 0.01; i += 0.42) {
        const st = new THREE.Mesh(stakeGeo, wood);
        st.position.set(i, groundHeight(x, z) - g.position.y + 0.35, 0);
        st.castShadow = true;
        wall.add(st);
      }
      for (let i = -span + 0.3; i <= span; i += 0.75) {
        const s = new THREE.Mesh(sackGeo, sack);
        s.position.set(i, 0.95, 0.28);
        wall.add(s);
      }
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(CANAL_HALF * 2 + 0.6, 7).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2a4a48, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 })
      );
      pool.position.set(0, 0.45, 3.6); // air ketahan di sisi gambut (hulu)
      wall.add(pool);
      const done = makeLabel(['KANAL DISEKAT', 'Gambut basah ✓'], { w: 1.8, h: 0.75, bg: '#2f6b3a', fg: '#ffffff', border: '#f2c12e' });
      done.position.set(span + 0.6, 1.9, 0);
      const donePole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), wood);
      donePole.position.set(span + 0.6, 0.9, 0);
      wall.add(done, donePole);
      wall.visible = false;
      g.add(wall);

      this.list.push({ x, z, built: false, prog: 0, group: g, pile, wall });
    }
  }

  get builtCount() {
    return this.list.filter((d) => d.built).length;
  }

  // Titik sekat belum dibangun yang paling deket (dalam jangkauan)
  nearest(pos) {
    let best = null, bd = RANGE;
    for (const d of this.list) {
      if (d.built) continue;
      const dist = Math.hypot(d.x - pos.x, d.z - pos.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  remaining() {
    return this.list.filter((d) => !d.built);
  }

  update(dt, player, held, riding) {
    const d = riding ? null : this.nearest(player.pos);
    for (const o of this.list) if (o !== d && !o.built) o.prog = Math.max(0, o.prog - dt);
    if (!d) return;
    if (held) {
      d.prog += dt / HOLD;
      if (d.prog >= 1) this.build(d);
    } else d.prog = Math.max(0, d.prog - dt);
  }

  build(d) {
    d.built = true;
    d.prog = 1;
    d.pile.visible = false;
    d.wall.visible = true;
    let n = 0;
    for (const t of this.world.tiles) {
      if (!t.burnable || t.wet) continue;
      if (Math.hypot(t.cx - d.x, t.cz - d.z) > WET_R) continue;
      t.wet = true;
      n++;
      if (t.state === STATE.BURNING) this.fire.water(t, 0.35); // api di sekitar ikut melemah
      this.world.paintGround(t);
    }
    this.events.push({ type: 'built', dam: d, tiles: n });
  }
}
