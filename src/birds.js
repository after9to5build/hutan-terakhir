// Burung: kawanan yang muter di atas hutan, burung kabur pas pohon dibakar,
// dan sesekali enggang (burung khas Kalimantan) lewat. Murni hiasan, ringan.
import * as THREE from 'three';
import { HALF } from './config.js';

const dark = new THREE.MeshStandardMaterial({ color: 0x1f1c19, roughness: 0.85 });
const white = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.8 });
const beak = new THREE.MeshStandardMaterial({ color: 0xe8901c, roughness: 0.5, emissive: 0x401800 });
const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6);
const wingGeo = new THREE.BoxGeometry(0.8, 0.025, 0.3).translate(0.4, 0, 0);
const tailGeo = new THREE.BoxGeometry(0.18, 0.02, 0.3);
const beakGeo = new THREE.ConeGeometry(0.06, 0.32, 6).rotateX(Math.PI / 2);

function makeBird(hornbill = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, dark);
  body.scale.set(1, 0.85, 2.3);
  g.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.03, 0);
    pivot.scale.x = s;
    pivot.add(new THREE.Mesh(wingGeo, dark));
    if (hornbill) {
      // ujung sayap putih
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.3), white);
      tip.position.x = 0.7;
      pivot.add(tip);
    }
    g.add(pivot);
    wings.push(pivot);
  }
  const tail = new THREE.Mesh(tailGeo, hornbill ? white : dark);
  tail.position.z = -0.42;
  g.add(tail);
  if (hornbill) {
    const b = new THREE.Mesh(beakGeo, beak); // paruh + cula oranye
    b.position.set(0, 0.02, 0.48);
    g.add(b);
    const casque = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.22), beak);
    casque.position.set(0, 0.11, 0.36);
    g.add(casque);
    g.scale.setScalar(2.4);
  }
  return { g, wings, phase: Math.random() * 10, glide: 0 };
}

export class Birds {
  constructor(scene) {
    this.scene = scene;
    this.flocks = [];
    this.hornbillT = 12 + Math.random() * 10;
    // 3 kawanan yang muter pelan di atas hutan
    for (const [x, z] of [[-20, -10], [30, -30], [-40, 30]]) {
      this.addFlock({ mode: 'circle', n: 6 + Math.floor(Math.random() * 4), x, z, y: 26 + Math.random() * 8 });
    }
  }

  addFlock({ mode, n, x, z, y, dir = 0, hornbill = false }) {
    const f = {
      mode, x, z, y, dir, t: 0,
      angle: Math.random() * Math.PI * 2,
      radius: 14 + Math.random() * 10,
      speed: mode === 'flee' ? 11 : mode === 'cross' ? 8 : 0.18 + Math.random() * 0.1,
      birds: [],
    };
    for (let i = 0; i < n; i++) {
      const b = makeBird(hornbill);
      // formasi longgar
      b.off = new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 7);
      if (mode === 'flee') b.off.multiplyScalar(0.4);
      b.g.position.set(x + b.off.x, y + b.off.y, z + b.off.z);
      this.scene.add(b.g);
      f.birds.push(b);
    }
    this.flocks.push(f);
    return f;
  }

  // Pohon dibakar: burung di sekitarnya kabur beterbangan
  scare(x, z, groundY = 0) {
    if (this.flocks.filter((f) => f.mode === 'flee').length >= 4) return;
    this.addFlock({ mode: 'flee', n: 4 + Math.floor(Math.random() * 4), x, z, y: groundY + 6, dir: Math.random() * Math.PI * 2 });
  }

  update(dt, time) {
    // Enggang sesekali melintas
    this.hornbillT -= dt;
    if (this.hornbillT <= 0) {
      this.hornbillT = 35 + Math.random() * 25;
      const a = Math.random() * Math.PI * 2;
      const r = HALF + 10;
      this.addFlock({ mode: 'cross', n: 1 + Math.floor(Math.random() * 2), hornbill: true, x: Math.cos(a) * r, z: Math.sin(a) * r, y: 20 + Math.random() * 6, dir: Math.atan2(-Math.cos(a), -Math.sin(a)) + (Math.random() - 0.5) * 0.6 });
    }

    for (const f of this.flocks) {
      f.t += dt;
      let cx, cy, cz, heading;
      if (f.mode === 'circle') {
        f.angle += f.speed * dt;
        // pusat kawanan geser pelan biar gak kelihatan muter di tempat
        f.x += Math.sin(time * 0.05 + f.radius) * dt * 0.8;
        cx = f.x + Math.cos(f.angle) * f.radius;
        cz = f.z + Math.sin(f.angle) * f.radius;
        cy = f.y + Math.sin(time * 0.3 + f.radius) * 1.5;
        heading = Math.atan2(-Math.sin(f.angle), Math.cos(f.angle)); // arah singgung lingkaran
      } else {
        // terbang lurus; yang kabur sambil naik
        f.x += Math.sin(f.dir) * f.speed * dt;
        f.z += Math.cos(f.dir) * f.speed * dt;
        if (f.mode === 'flee') f.y += dt * Math.max(0, 5 - f.t * 1.2);
        cx = f.x; cz = f.z; cy = f.y;
        heading = f.dir;
        if (Math.abs(f.x) > HALF + 30 || Math.abs(f.z) > HALF + 30 || f.t > 40) f.dead = true;
      }
      const flapFast = f.mode === 'flee' ? 22 : 13;
      for (const b of f.birds) {
        b.g.position.set(cx + b.off.x, cy + b.off.y, cz + b.off.z);
        b.g.rotation.set(0, heading, 0);
        // kepak, sesekali melayang
        b.glide -= dt;
        if (b.glide < -3 && Math.random() < dt * 0.4) b.glide = 1 + Math.random() * 1.5;
        const flap = f.mode !== 'flee' && b.glide > 0 ? 0.15 : Math.sin(time * (f.birds[0].g.scale.x > 1 ? 6 : flapFast) + b.phase) * 0.75;
        b.wings[0].rotation.z = -flap; // sayap kiri dicerminkan
        b.wings[1].rotation.z = flap;
      }
    }
    for (const f of this.flocks) if (f.dead) for (const b of f.birds) this.scene.remove(b.g);
    this.flocks = this.flocks.filter((f) => !f.dead);
  }
}
