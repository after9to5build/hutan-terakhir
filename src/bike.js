// Motor trail: kendaraan cepat buat ngejar titik api & pelaku.
// Fisika arkade sederhana, bukan simulasi.
import * as THREE from 'three';
import { clamp, TYPE } from './config.js';
import { groundHeight, WATER_Y } from './world.js';
import { roadDist, ROAD_HALF } from './map.js';
import { loadModel, placeModel } from './models.js';
import { makeJerrycan } from './props.js';

// Kecepatan maksimal (m/detik) per jenis permukaan
const MAX_SPEED = {
  [TYPE.CLEAR]: 15,
  [TYPE.ROAD]: 15,
  [TYPE.FOREST]: 11,
  [TYPE.PEAT]: 9,
  [TYPE.SAWIT]: 13,
  [TYPE.SCAR]: 12,
  [TYPE.RIVER]: 12,
};
const ROAD_SPEED = 21;
const REVERSE_SPEED = 6.5; // kecepatan mundur maksimal

function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#fff';
  g.font = '800 30px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBike() {
  const g = new THREE.Group();
  const mat = (color, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const add = (geo, m, x, y, z, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const orange = mat(0xe8661c, 0.35);
  const black = mat(0x151515, 0.6);
  const steel = mat(0xb8b8b8, 0.3, 0.8);

  add(new THREE.BoxGeometry(0.28, 0.32, 1.0), orange, 0, 0.78, 0.05); // badan
  add(new THREE.BoxGeometry(0.34, 0.22, 0.42), orange, 0, 0.98, 0.32); // tangki
  add(new THREE.BoxGeometry(0.3, 0.1, 0.75), black, 0, 1.0, -0.25); // jok
  add(new THREE.BoxGeometry(0.22, 0.3, 0.5), steel, 0, 0.5, 0.05); // mesin
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), steel, 0.18, 0.62, -0.45).rotation.x = Math.PI / 2 - 0.3; // knalpot
  const fork = add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), steel, 0, 0.82, 0.68);
  fork.rotation.x = -0.35;
  const bar = add(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 8), black, 0, 1.24, 0.55);
  bar.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.3, 0.05, 0.4), orange, 0, 0.82, 0.85); // spakbor depan
  // Jeriken air cadangan di boncengan
  const jer = mat(0x2f86c9, 0.4);
  for (const x of [-0.24, 0.24]) add(new THREE.BoxGeometry(0.2, 0.34, 0.3), jer, x, 1.05, -0.55);
  add(new THREE.BoxGeometry(0.6, 0.04, 0.4), steel, 0, 0.87, -0.55);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: plateTexture('RI 1') }));
  plate.position.set(0, 0.78, -0.48);
  plate.rotation.y = Math.PI;
  g.add(plate);

  const wheels = [0.72, -0.62].map((z) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.4, z);
    g.add(pivot);
    const tire = add(new THREE.TorusGeometry(0.31, 0.1, 8, 18), black, 0, 0, 0, pivot);
    tire.rotation.y = Math.PI / 2;
    const hub = add(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), steel, 0, 0, 0, pivot);
    hub.rotation.z = Math.PI / 2;
    return pivot;
  });
  const jerikens = g.children.filter((o) => o.material === jer);
  return { group: g, wheels, jerikens, plate };
}

// Ganti badan placeholder dengan model Meshy, sisain jeriken air cadangan & plat nomor
function useMeshyBike(b) {
  const model = placeModel('motor', { length: 2.1 });
  if (!model) return;
  const keep = new Set([b.plate]);
  for (const o of [...b.group.children]) if (!keep.has(o)) b.group.remove(o);
  b.group.add(model);
  // Dua jeriken air biru bergaya cat (props.js) diiket di boncengan, gantiin kotak biru polos
  const rack = new THREE.Group();
  rack.position.set(0, 0.84, -0.66);
  for (const x of [-0.08, 0.08]) {
    const j = makeJerrycan(0x2f6fb3);
    j.scale.setScalar(0.9);
    j.rotation.y = Math.PI / 2; // sisi lebar searah motor
    j.position.set(x * 0.85, 0.135, 0);
    rack.add(j);
  }
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  for (const z of [-0.07, 0.07]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.035), strapMat); // tali karet pengikat
    strap.position.set(0, 0.285, z * 0.85);
    strap.castShadow = true;
    rack.add(strap);
  }
  b.group.add(rack);
  // plat di spakbor belakang
  b.plate.position.set(0, 0.72, -1.02);
  b.wheels.length = 0; // roda nyatu sama model, gak diputar
}

export class Bike {
  constructor(scene, x, z, heading) {
    const b = buildBike();
    this.group = b.group;
    this.wheels = b.wheels;
    scene.add(this.group);
    // sembunyiin motor kotak selama model Meshy dimuat; muncul lagi kalau gagal
    this.group.visible = false;
    loadModel('motor').then((g) => {
      if (g) { useMeshyBike(b); this.meshy = true; }
      this.group.visible = true;
    });
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.lean = 0;
    this.rider = false;
    this.turbo = 1; // dari telepon titipan
    this.reserveMax = 200; // jeriken cadangan = 2 tangki penuh
    this.reserve = 200;
    this.place();
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }
  right() {
    return new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading));
  }
  near(p, r = 2.6) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r;
  }
  seat() {
    return this.pos.clone().addScaledVector(this.forward(), -0.2).add(new THREE.Vector3(0, 0.62, 0));
  }

  mount() {
    this.rider = true;
  }

  dismount(player, world) {
    this.rider = false;
    this.speed = 0;
    player.pos.copy(this.pos).addScaledVector(this.right(), 1.3);
    world.collide(player.pos, player.radius);
    player.facing = this.heading;
  }

  // Isi tangki pemain dari jeriken motor (berdiri di dekat motor)
  giveWater(player, dt) {
    if (this.rider || this.reserve <= 0 || player.water >= player.tankMax || !this.near(player.pos, 3)) return false;
    const amt = Math.min(70 * dt, this.reserve, player.tankMax - player.water);
    this.reserve -= amt;
    player.water += amt;
    return true;
  }

  // Panggil motor ke samping pemain
  callTo(player, world) {
    if (this.rider) return false;
    const side = new THREE.Vector3(Math.cos(player.facing), 0, -Math.sin(player.facing));
    this.pos.copy(player.pos).addScaledVector(side, 2.2);
    world.collide(this.pos, 0.7);
    this.heading = player.facing;
    this.speed = 0;
    this.place();
    return true;
  }

  update(dt, input, world) {
    if (this.rider) {
      const throttle = Math.max(input.move.y, input.rt || 0, 0);
      const brake = Math.max(-input.move.y, input.lt || 0, 0);
      const t = world.tileAt(this.pos.x, this.pos.z);
      const tb = this.turbo * (this.boost || 1);
      let vmax = (t ? MAX_SPEED[t.type] : 12) * tb;
      if (roadDist(this.pos.x, this.pos.z) < ROAD_HALF + 0.6) vmax = ROAD_SPEED * tb;
      if (world.inRiver(this.pos.x, this.pos.z)) vmax = 4;

      // Rem/mundur: masih maju = ngerem kuat; udah (hampir) berhenti = langsung mundur
      const reversing = brake > 0.05 && brake >= throttle;
      if (reversing) this.speed -= (this.speed > 0.5 ? 26 : 12) * brake * dt;
      else if (throttle > 0.05) this.speed += (this.speed < 0 ? 26 : 13) * throttle * dt;
      else this.speed *= Math.exp(-dt * (this.speed < 0 ? 3 : 0.9));
      if (this.speed > vmax) this.speed = Math.max(vmax, this.speed - 16 * dt);
      this.speed = clamp(this.speed, -REVERSE_SPEED, ROAD_SPEED * tb);

      const sf = clamp(Math.abs(this.speed) / 5, 0, 1);
      const dir = this.speed >= 0 ? 1 : -1;
      this.heading -= input.move.x * 2.1 * sf * dir * dt;
      this.lean += (-input.move.x * 0.35 * sf - this.lean) * (1 - Math.exp(-dt * 6));
    } else {
      this.speed *= Math.exp(-dt * 4);
      this.lean *= Math.exp(-dt * 6);
    }

    // Jeriken terisi lagi kalau motor ada di sumber air
    if (world.canRefill(this.pos.x, this.pos.z)) this.reserve = Math.min(this.reserveMax, this.reserve + 70 * dt);

    // Bantuan belok: pohon tepat di depan → motor ngelak dikit sendiri
    if (this.rider && this.speed > 3) { // cuma pas maju
      const fw = this.forward();
      const look = clamp(this.speed * 0.35, 2, 5);
      const c = world.obstacleNear(this.pos.x + fw.x * look, this.pos.z + fw.z * look, 1.4);
      if (c) {
        const cx = c.x - this.pos.x, cz = c.z - this.pos.z;
        const ahead = cx * fw.x + cz * fw.z;
        if (ahead > 0) {
          const side = fw.z * cx - fw.x * cz; // >0 = pohon di kiri
          this.heading += (side > 0 ? -1 : 1) * 1.6 * dt;
        }
      }
    }

    this.pos.addScaledVector(this.forward(), this.speed * dt);
    const hit = world.collide(this.pos, 0.6);
    if (hit) {
      // nyenggol: arah motor dibelokin ngikutin pinggir pohon, nyerempet cuma ngurangin dikit
      const fw = this.forward();
      const dot = fw.x * hit.x + fw.z * hit.z; // <0 = ngarah ke pohon
      if (dot < 0 && this.speed > 0) {
        const tx = fw.x - hit.x * dot, tz = fw.z - hit.z * dot;
        if (Math.hypot(tx, tz) > 0.05) {
          let dh = Math.atan2(tx, tz) - this.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          this.heading += dh * 0.35;
        }
        // nabrak lurus = berhenti (biar bisa langsung mundur); nyerempet cuma ngurangin dikit
        this.speed *= dot < -0.8 ? 0 : 1 - 0.25 * -dot;
      }
    }
    this.place();
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.41;
  }

  place() {
    this.pos.y = Math.max(groundHeight(this.pos.x, this.pos.z), WATER_Y - 0.35);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.heading, this.lean, 'YXZ');
  }
}
