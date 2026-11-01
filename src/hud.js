import { N, T, STATE, TYPE } from './config.js';
import { POSKO, CEREMONY, CIRCUIT_START } from './map.js';

const TYPE_COLOR = {
  [TYPE.FOREST]: '#3f7a35',
  [TYPE.PEAT]: '#6b5a2e',
  [TYPE.CLEAR]: '#7f9a4a',
  [TYPE.ROAD]: '#a3845a',
  [TYPE.RIVER]: '#2f7f9a',
  [TYPE.SAWIT]: '#8f8a5c',
  [TYPE.SCAR]: '#3a3532',
};

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      forestPct: $('forestPct'),
      forestBar: $('forestBar'),
      fireCount: $('fireCount'),
      savedCount: $('savedCount'),
      days: $('days'),
      waterBar: $('waterBar'),
      waterHint: $('waterHint'),
      toasts: $('toasts'),
      mission: $('mission'),
      prompt: $('prompt'),
      promptKey: $('promptKey'),
      promptText: $('promptText'),
      reserve: $('bikeReserve'),
      support: $('support'),
      gadget: $('gadget'),
    };
    this.map = $('minimap');
    this.ctx = this.map.getContext('2d');
    this.mapT = 0;
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  toast(text, kind = '', ms = 3800) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    // maks 2; peringatan pelaku (warn) dibuang paling akhir
    while (this.el.toasts.children.length > 2) {
      const kids = [...this.el.toasts.children];
      (kids.find((k) => !k.classList.contains('warn')) || kids[0]).remove(); // notif biasa dibuang duluan
    }
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 700);
  }

  setGadget(html) {
    if (this._gadget !== html) { this._gadget = html; this.el.gadget.innerHTML = html; }
  }

  setMission(html) {
    if (this._mission !== html) { this._mission = html; this.el.mission.innerHTML = html; }
  }

  // checklist berkedip pas ada langkah yang beres
  flashMission() {
    const m = this.el.mission;
    m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash');
  }

  setSupport(html) {
    if (this._support !== html) { this._support = html; this.el.support.innerHTML = html; }
  }

  setPrompt(key, text) {
    const p = this.el.prompt;
    if (!key) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    this.el.promptKey.textContent = key;
    this.el.promptText.textContent = text;
  }

  update({ forestRatio, fires, saved, days, water, inWater, caught = 0, evidence = 0, reserve = null, fromBike = false }) {
    this.el.reserve.textContent = reserve === null ? '' : `🏍️ Jeriken motor: ${reserve}%`;
    const pct = Math.round(forestRatio * 100);
    this.el.forestPct.textContent = `${pct}%`;
    this.el.forestBar.style.width = `${pct}%`;
    this.el.forestBar.style.background = forestRatio < 0.5 ? 'var(--danger)' : 'var(--forest)';
    this.el.fireCount.textContent = fires;
    this.el.savedCount.textContent = saved;
    this.el.days.textContent = days;
    this.el.waterBar.style.width = `${Math.min(100, water)}%`;
    this.el.waterHint.textContent = fromBike ? 'Mengisi dari jeriken motor…' : inWater && water < 100 ? 'Mengisi air…' : water <= 0 ? 'Air habis! Ikuti penanda 💧' : '';
  }

  drawMinimap(dt, world, player, camYaw, extras = {}) {
    this.mapT -= dt;
    if (this.mapT > 0) return;
    this.mapT = 0.05;
    const c = this.ctx;
    const size = this.map.width;
    const s = size / N;
    c.clearRect(0, 0, size, size);
    const flick = Math.random() * 0.3;
    for (const t of world.tiles) {
      let col;
      if (t.state === STATE.BURNT) col = t.cleared ? '#9a5a30' : t.logged ? '#7a6040' : '#2a2522';
      else if (t.state === STATE.BURNING) col = `rgb(255, ${Math.round(140 - t.heat * 90 + flick * 60)}, 40)`;
      else col = t.wet ? '#2f4c48' : TYPE_COLOR[t.type];
      c.fillStyle = col;
      c.fillRect(t.xi * s, t.zi * s, s + 0.5, s + 0.5);
    }
    const W = N * T, half = W / 2;
    const toMap = (v) => ((v + half) / W) * size;
    // Wahana: panggung peresmian & garis start sirkuit
    c.font = '12px sans-serif';
    c.fillText('🎀', toMap(CEREMONY.x) - 7, toMap(CEREMONY.z) + 5);
    c.fillText('🏁', toMap(CIRCUIT_START[0]) - 7, toMap(CIRCUIT_START[1]) + 5);
    // Posko
    c.fillStyle = '#f2efe6';
    c.fillRect(toMap(POSKO.x) - 4, toMap(POSKO.z) - 4, 8, 8);
    c.strokeStyle = '#c23b22';
    c.lineWidth = 2;
    c.strokeRect(toMap(POSKO.x) - 4, toMap(POSKO.z) - 4, 8, 8);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    for (const w of extras.incoming || []) {
      c.strokeStyle = `rgba(255, 60, 60, ${0.4 + pulse * 0.6})`;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(toMap(w.x), toMap(w.z), 8 + pulse * 5, 0, Math.PI * 2); c.stroke();
    }
    for (const e of extras.enemies || []) {
      const x = toMap(e.pos.x), z = toMap(e.pos.z);
      c.strokeStyle = `rgba(255, 60, 60, ${0.3 + pulse * 0.7})`;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, z, 9 + pulse * 4, 0, Math.PI * 2); c.stroke();
      c.fillStyle = e.state === 'stunned' ? '#7ee06a' : '#ff3c3c';
      c.beginPath(); c.arc(x, z, 5.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    }
    // titik sekat kanal yang belum dibangun
    if (extras.kopdes) { // KOPDES: kotak merah-putih
      const kx = toMap(extras.kopdes.x), kz = toMap(extras.kopdes.z);
      c.fillStyle = '#ffffff'; c.fillRect(kx - 4, kz - 4, 8, 8);
      c.fillStyle = '#d61f26'; c.fillRect(kx - 4, kz - 4, 8, 4);
    }
    for (const d of extras.dams || []) {
      c.fillStyle = '#f2c12e';
      c.fillRect(toMap(d.x) - 3.5, toMap(d.z) - 3.5, 7, 7);
      c.strokeStyle = '#1b1408'; c.lineWidth = 1.5;
      c.strokeRect(toMap(d.x) - 3.5, toMap(d.z) - 3.5, 7, 7);
    }
    for (const v of extras.volunteers || []) {
      c.fillStyle = '#5fd47a';
      c.beginPath(); c.arc(toMap(v.pos.x), toMap(v.pos.z), 3.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
    }
    for (const d of extras.dozers || []) {
      const s = d.boss ? 8 : 6;
      c.fillStyle = d.golden ? '#ffd060' : '#f2b822';
      c.fillRect(toMap(d.pos.x) - s, toMap(d.pos.z) - s * 0.7, s * 2, s * 1.4);
      c.strokeStyle = '#1b1208'; c.lineWidth = 1.5;
      c.strokeRect(toMap(d.pos.x) - s, toMap(d.pos.z) - s * 0.7, s * 2, s * 1.4);
    }
    // Radar bantuan: rute damkar + lingkaran target, helikopter + arah terbang
    const tr = extras.truck;
    if (tr) {
      if (['going', 'stuck', 'spray'].includes(tr.state) && tr.dest) {
        c.setLineDash([3, 3]);
        c.strokeStyle = 'rgba(255, 70, 70, 0.9)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(toMap(tr.pos.x), toMap(tr.pos.z));
        for (const [x, z] of tr.path) c.lineTo(toMap(x), toMap(z));
        c.stroke();
        c.setLineDash([]);
        c.strokeStyle = `rgba(255, 70, 70, ${0.5 + pulse * 0.5})`;
        c.beginPath(); c.arc(toMap(tr.dest.x), toMap(tr.dest.z), (22 / (N * T)) * size, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#ff3030';
      c.fillRect(toMap(tr.pos.x) - 4, toMap(tr.pos.z) - 4, 8, 8);
      c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(toMap(tr.pos.x) - 4, toMap(tr.pos.z) - 4, 8, 8);
    }
    const hl = extras.heli;
    if (hl && hl.state !== 'idle') {
      const hx = toMap(hl.pos.x), hz = toMap(hl.pos.z);
      if (hl.target && (hl.state === 'inbound' || hl.state === 'drop')) {
        c.setLineDash([3, 3]);
        c.strokeStyle = 'rgba(79, 182, 232, 0.9)';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(hx, hz); c.lineTo(toMap(hl.target.x), toMap(hl.target.z)); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = `rgba(79, 182, 232, ${0.5 + pulse * 0.5})`;
        c.beginPath(); c.arc(toMap(hl.target.x), toMap(hl.target.z), (15 / (N * T)) * size, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#4fb6e8';
      c.beginPath(); c.arc(hx, hz, 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    }
    if (extras.bike && !extras.bike.rider) {
      c.fillStyle = '#e8661c';
      c.fillRect(toMap(extras.bike.pos.x) - 3, toMap(extras.bike.pos.z) - 3, 6, 6);
    }
    // Pemain + arah kamera
    const px = toMap(player.pos.x);
    const pz = toMap(player.pos.z);
    c.save();
    c.translate(px, pz);
    c.rotate(-camYaw);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 34, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    c.fill();
    c.restore();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(px, pz, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#111';
    c.lineWidth = 1.5;
    c.stroke();
  }
}
