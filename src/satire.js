// Lapisan satir: telepon "titipan investor", Bom Solusi Cepat,
// drone pencitraan, satgas yang selalu telat, dan blitz kamera.
import * as THREE from 'three';
import { STATE } from './config.js';
import { groundHeight } from './world.js';
import { makeLabel } from './dozer.js';
import { makeChar, aimBone } from './characters.js';

const $ = (id) => document.getElementById(id);

// Isi telepon. Terima = dapat bantuan, tapi ada harganya.
const CALLS = {
  tangki: {
    caller: 'Humas PT Lahan Siap Tanam Kilat',
    text: '"Ada titipan kecil, Pak. Anggap CSR."',
    offer: '🎁 Tangki jumbo. Syarat: satu bulldozer kami boleh masuk.',
    yes: '🎁 Tangki jumbo diterima. Di kejauhan, mesin bulldozer nyala.',
    no: '📵 Ditolak. "Baik, Pak… kami catat."',
  },
  bom: {
    caller: 'Nomor tak dikenal',
    text: '"Pembakar bikin repot? Sekali lempar, beres."',
    offer: '💣 Bom Solusi Cepat. Efek samping: "tidak ada".',
    yes: '💥 Pelaku tumbang. Hutannya… ikut.',
    no: '📵 Ditolak. "Penawaran sekali seumur jabatan, Pak."',
  },
  motor: {
    caller: 'Staf Khusus Investasi',
    text: '"Investor kasih motor turbo, Pak. Gratis."',
    offer: '🏍️ Motor turbo. Syarat: satu bulldozer berizin lagi.',
    yes: '🏍️ Turbo aktif. Bulldozer berizin menyusul.',
    no: '📵 Ditolak. "Investornya gampang baper, Pak."',
  },
};

function buildDrone() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.4 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), dark));
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), dark);
    arm.position.set(x * 0.6, 0, z * 0.6);
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 16), new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.35 }));
    rotor.position.set(x, 0.08, z);
    g.add(rotor);
  }
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  rec.position.set(0, 0, 0.27);
  g.add(rec);
  const tag = makeLabel(['TV NASIONAL', 'LIVE'], { w: 0.9, h: 0.35, bg: '#c4161c' });
  tag.position.set(0, 0.35, 0);
  g.add(tag);
  g.userData.rec = rec;
  g.userData.tag = tag;
  return g;
}

function buildOfficer() {
  const g = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f3a });
  const skin = new THREE.MeshStandardMaterial({ color: 0xa8744f });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
  add(new THREE.CapsuleGeometry(0.11, 0.62, 4, 8), pants, -0.12, 0.48, 0);
  add(new THREE.CapsuleGeometry(0.11, 0.62, 4, 8), pants, 0.12, 0.48, 0);
  add(new THREE.CapsuleGeometry(0.26, 0.48, 6, 10), uni, 0, 1.3, 0);
  add(new THREE.SphereGeometry(0.19, 12, 10), skin, 0, 1.9, 0);
  add(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x1d2a4a }), 0, 2.06, 0);
  return g;
}

export class Satire {
  constructor(ctx) {
    this.ctx = ctx; // { scene, hud, input, player, bike, fire, enemies, dozers, world, game }
    this.calls = [
      { at: 58, id: 'tangki' },
      { at: 104, id: 'bom' },
      { at: 138, id: 'motor' },
    ];
    this.callIdx = 0;
    this.phone = null;
    this.drones = [{ at: 46 }, { at: 124 }];
    this.droneIdx = 0;
    this.drone = null;
    this.satgasCooldown = 25;
    this.satgas = [];
    this.blitzCd = 0;
    this.shoutCd = 0;
    this.bubble = null;
    this.recent = null; // kejadian terakhir buat milih jargon: { key, t }
    this.el = {
      phone: $('phone'), caller: $('phoneCaller'), text: $('phoneText'), offer: $('phoneOffer'),
      yesKey: $('phoneYesKey'), noKey: $('phoneNoKey'), flash: $('flash'), shout: $('shout'),
    };
  }

  get phoneOpen() {
    return !!this.phone;
  }

  update(dt, elapsed, time) {
    const { game } = this.ctx;
    const c = this.calls[this.callIdx];
    if (c && elapsed >= c.at && !this.phone) { this.openCall(c.id); this.callIdx++; }

    const dr = this.drones[this.droneIdx];
    if (dr && elapsed >= dr.at && !this.drone) { this.spawnDrone(); this.droneIdx++; }
    if (this.drone) this.updateDrone(dt, time);

    this.satgasCooldown -= dt;
    for (const s of this.satgas) {
      // apel: berdiri ngadep pemain (spanduk di belakang) sambil hormat
      for (const ch of s.crew || []) {
        ch.mixer.update(dt);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.group.quaternion);
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const head = ch.bones.Head.getWorldPosition(new THREE.Vector3());
        const elbowDir = right.clone().multiplyScalar(0.8).addScaledVector(fwd, 0.6).normalize();
        aimBone(ch.bones.RightArm, ch.bones.RightForeArm, elbowDir);
        const hand = ch.bones.RightForeArm.getWorldPosition(new THREE.Vector3());
        const toHead = head.add(new THREE.Vector3(0, 0.12, 0)).addScaledVector(fwd, 0.12).sub(hand).normalize();
        aimBone(ch.bones.RightForeArm, ch.bones.RightHand, toHead);
      }
      s.t -= dt;
      if (s.t <= 0) this.ctx.scene.remove(s.group);
    }
    this.satgas = this.satgas.filter((s) => s.t > 0);
    this.blitzCd = Math.max(0, this.blitzCd - dt);
    this.shoutCd = Math.max(0, this.shoutCd - dt);
    if (this.recent) { this.recent.t -= dt; if (this.recent.t <= 0) this.recent = null; }
    void game;
  }

  // ---------- Telepon ----------
  openCall(id) {
    const call = CALLS[id];
    this.phone = { id, call };
    const el = this.el;
    el.caller.textContent = call.caller;
    el.text.textContent = call.text;
    el.offer.textContent = call.offer;
    el.yesKey.textContent = this.ctx.input.label('confirm');
    el.noKey.textContent = this.ctx.input.label('back');
    el.phone.classList.remove('hidden');
    if (this.ctx.sfx) this.ctx.sfx.ringStart();
  }

  // Dipanggil tiap frame saat telepon terbuka (game di-pause)
  updatePhone() {
    const inp = this.ctx.input;
    if (inp.justPressed('confirm')) this.answer(true);
    else if (inp.justPressed('back')) this.answer(false);
  }

  answer(accept) {
    const { id, call } = this.phone;
    const { hud, game, player, bike, dozers } = this.ctx;
    this.phone = null;
    this.el.phone.classList.add('hidden');
    if (this.ctx.sfx) { this.ctx.sfx.ringStop(); this.ctx.sfx.phoneAnswer(accept); }
    game.integrity += accept ? -1 : 1;
    game.choices.push({ id, accept });
    hud.toast(accept ? call.yes : call.no, accept ? '' : 'good', 6000);
    if (!accept) return;
    if (id === 'tangki') {
      player.tankMax = 160;
      player.water = 160;
      setTimeout(() => dozers.spawn(true, 0), 5000);
    } else if (id === 'motor') {
      bike.turbo = 1.3;
      setTimeout(() => dozers.spawn(true, 2), 5000);
    } else if (id === 'bom') {
      this.dropBomb();
    }
  }

  // ---------- Bom Solusi Cepat ----------
  dropBomb() {
    const { enemies, player, fire, world } = this.ctx;
    const act = enemies.active();
    let cx, cz;
    if (act.length) {
      const e = act.reduce((a, b) => (Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z) < Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) ? a : b));
      cx = e.pos.x; cz = e.pos.z;
    } else {
      const f = player.forward();
      cx = player.pos.x + f.x * 25; cz = player.pos.z + f.z * 25;
    }
    for (const e of act) if (Math.hypot(e.pos.x - cx, e.pos.z - cz) < 35) enemies.stun(e, 7);
    for (const t of world.tiles) {
      if (t.burnable && t.state === STATE.FOREST && Math.hypot(t.cx - cx, t.cz - cz) < 14) fire.ignite(t, 0.55);
    }
    // ledakan
    const gy = groundHeight(cx, cz);
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 10;
      fire.flames.spawn(cx, gy + 1, cz, Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s, 0.8 + Math.random() * 0.6, 4, 1, [4, 1.8, 0.4], [2, 0.3, 0.05], 1);
    }
    for (let i = 0; i < 40; i++) {
      fire.smoke.spawn(cx + (Math.random() - 0.5) * 8, gy + 2, cz + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3, 6, 4, 16, [0.08, 0.07, 0.07], [0.35, 0.33, 0.32], 0.7);
    }
    this.flash(0.9);
    this.note('solusi');
    if (this.ctx.sfx) this.ctx.sfx.explosion();
  }

  // ---------- Drone pencitraan ----------
  spawnDrone() {
    const { scene, player, hud } = this.ctx;
    const g = buildDrone();
    g.position.set(player.pos.x + 40, 25, player.pos.z + 40);
    scene.add(g);
    this.drone = { group: g, t: 0, life: 20, onCam: 0 };
    hud.toast('📸 Drone TV datang. Nyiram di depan kamera, skor pencitraan dobel.', 'satire', 4000);
  }

  updateDrone(dt, time) {
    const d = this.drone;
    const { player, game, hud, fire, scene } = this.ctx;
    d.t += dt;
    const f = player.forward();
    const leaving = d.t > d.life;
    const target = leaving
      ? new THREE.Vector3(player.pos.x - 60, 30, player.pos.z - 60)
      : new THREE.Vector3(player.pos.x + f.x * 4 + f.z * 2, player.pos.y + 4.5 + Math.sin(time * 2) * 0.3, player.pos.z + f.z * 4 - f.x * 2);
    d.group.position.lerp(target, 1 - Math.exp(-dt * (leaving ? 0.6 : 1.8)));
    d.group.lookAt(player.pos.x, player.pos.y + 1.5, player.pos.z);
    d.group.userData.rec.visible = Math.sin(time * 8) > 0;
    const close = d.group.position.distanceTo(player.pos) < 14;
    this.recording = !leaving && close;
    if (this.recording && player.spraying) { d.onCam += dt; game.citra += dt; }
    if (leaving && d.group.position.distanceTo(player.pos) > 55) {
      scene.remove(d.group);
      this.drone = null;
      this.recording = false;
      const fires = fire.burning.size;
      hud.toast(`📺 Tayang: "Presiden Turun Langsung!"${fires ? ` ${fires} petak masih menyala.` : ''}`, 'satire', 4500);
    }
  }

  // ---------- Satgas telat ----------
  // Dipanggil saat satu titik api benar-benar padam
  onAreaClear(x, z) {
    const { game, scene, hud } = this.ctx;
    if (this.satgasCooldown > 0 || game.elapsed < 25) return;
    this.satgasCooldown = 55;
    setTimeout(() => {
      const grp = new THREE.Group();
      const gy = groundHeight(x, z);
      const crew = [];
      for (let i = 0; i < 6; i++) {
        // Model Meshy satgas (ASET-MESHY.md #10) kalau udah kemuat; diam pinjam dari presiden
        const ch = makeChar('satgas', { height: 2.0, clips: { idle: ['presiden', 'Idle_9'] } });
        const o = ch ? ch.group : buildOfficer();
        o.position.set((i % 3) * 1.1 - 1.1, 0, Math.floor(i / 3) * 1.2);
        grp.add(o);
        if (ch) {
          ch.play('idle', 0);
          ch.mixer.setTime(Math.random() * 2); // biar gak gerak barengan kayak robot
          crew.push(ch);
        }
      }
      const banner = makeLabel(['APEL SIAGA KARHUTLA', 'Satgas Gabungan'], { w: 4, h: 1.1, bg: '#1d2a4a', fg: '#ffd060' });
      banner.position.set(0, 3.2, -1.2);
      grp.add(banner);
      grp.position.set(x, gy, z);
      scene.add(grp);
      this.satgas.push({ group: grp, t: 18, crew });
      hud.toast('🚁 Satgas tiba. Apinya udah padam. Apel dulu.', 'satire', 4000);
      this.note('koordinasi', 18);
      if (this.ctx.sfx) this.ctx.sfx.whistle();
    }, 3500);
  }

  // ---------- Blitz kamera wartawan ----------
  blitz() {
    const { enemies, player, hud } = this.ctx;
    if (this.blitzCd > 0) {
      hud.toast(`📸 Blitz ngecas (${Math.ceil(this.blitzCd)} dtk).`, '', 1500);
      return;
    }
    this.blitzCd = 10;
    this.flash(0.7);
    if (this.ctx.sfx) this.ctx.sfx.shutter();
    const hit = enemies.flash(player.pos, player.forward(), 10);
    if (hit) hud.toast(`📸 ${hit} pelaku silau!`, 'good', 2500);
  }

  // ---------- Teriak ----------
  note(key, t = 8) {
    this.recent = { key, t };
  }

  // Jargon tetap: satu teriakan khas yang diulang-ulang
  pickShout() {
    return 'HIDUP OOWIII'; // tanpa tanda seru (permintaan user: ganggu visual tulisan)
  }

  // Teriak: lucu, bikin pelaku bengong, tapi ngisi meter pencitraan
  shout() {
    if (this.shoutCd > 0) return;
    const { game, enemies, player, sfx } = this.ctx;
    this.shoutCd = 3.5; // sepanjang suara teriak + fahhh, biar gak numpuk kalau dipencet terus
    const line = this.pickShout();
    this.bubble = { t: 2.6 };
    const el = this.el.shout;
    el.textContent = line;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth; // ulang animasi
    el.classList.add('pop');
    // toa nguing → suara "HIDUP" (rekaman user kalau ada) → kerumunan relawan nyahut "HIDUUUP!" (makin heboh)
    if (sfx) { const d = sfx.teriak(); sfx.crowdHidup((game.shouts || 0) + 1, d + 0.25); }
    player.boostT = 3;
    player.shoutT = 1.7; // gerakan angkat tangan
    enemies.startle(player.pos, 10, 1.3);
    game.citra += this.recording ? 2 : 1;
    game.shouts = (game.shouts || 0) + 1;
  }

  // Gelembung teks ngikutin kepala Pak Presiden
  updateBubble(dt, camera, player) {
    if (!this.bubble) return;
    this.bubble.t -= dt;
    const el = this.el.shout;
    if (this.bubble.t <= 0) { this.bubble = null; el.classList.add('hidden'); return; }
    const v = player.pos.clone();
    v.y += 3.1;
    v.project(camera);
    el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  }

  flash(strength) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.opacity = String(strength);
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.6s ease-out';
      f.style.opacity = '0';
    });
  }
}
