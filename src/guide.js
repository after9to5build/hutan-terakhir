// Pemandu pemain: penanda tujuan di layar, kompas, teks tujuan,
// dan Peta Titik Panas (layar penuh, game di-pause).
import * as THREE from 'three';
import { N, T, HALF, STATE, TYPE } from './config.js';
import { POSKO, TANK, RIVER_HALF, WELLS, COURT, riverCenterX, canalPoint } from './map.js';

const $ = (id) => document.getElementById(id);
const tmp = new THREE.Vector3();

const MAP_COLOR = {
  [TYPE.FOREST]: '#1f4a2a',
  [TYPE.PEAT]: '#4a3d22',
  [TYPE.CLEAR]: '#3d5a2a',
  [TYPE.ROAD]: '#7a6342',
  [TYPE.RIVER]: '#1d4f66',
  [TYPE.SAWIT]: '#55553a',
  [TYPE.SCAR]: '#2a2624',
};

export class Guide {
  constructor(camera, world, fire, enemies, input, dozers) {
    this.dozers = dozers;
    this.camera = camera;
    this.world = world;
    this.fire = fire;
    this.enemies = enemies;
    this.input = input;
    this.clusters = [];
    this.clusterT = 0;
    this.chosen = null; // target yang dipilih lewat peta
    this.objective = null;
    this.mapOpen = false;
    this.mapSel = 0;
    this.compassT = 0;

    this.el = {
      marker: $('marker'),
      markerIcon: $('markerIcon'),
      markerDist: $('markerDist'),
      markerArrow: $('markerArrow'),
      compass: $('compassTrack'),
      objective: $('objective'),
      map: $('hotmap'),
      mapCanvas: $('hotmapCanvas'),
      mapInfo: $('hotmapInfo'),
      mapHint: $('hotmapHint'),
    };
    this.mctx = this.el.mapCanvas.getContext('2d');
    this.threatBox = $('threats');
    this.incoming = []; // pelaku yang sebentar lagi masuk (dari main)
    this.threatEls = [];
  }

  // Gabungkan petak terbakar yang bersebelahan jadi satu "titik api"
  updateClusters() {
    const seen = new Set();
    const out = [];
    for (const t of this.fire.burning) {
      if (seen.has(t)) continue;
      const stack = [t];
      seen.add(t);
      let sx = 0, sz = 0, n = 0, heat = 0;
      while (stack.length) {
        const c = stack.pop();
        sx += c.cx; sz += c.cz; n++; heat += c.heat;
        for (const nb of this.world.neighbors(c)) {
          if (nb.state === STATE.BURNING && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
        }
      }
      out.push({ kind: 'fire', x: sx / n, z: sz / n, size: n, heat });
    }
    this.clusters = out;
  }

  // Semua target yang bisa dipilih: titik api + pelaku aktif
  targets(player) {
    const list = this.clusters.map((c) => ({ ...c }));
    for (const e of this.enemies.active()) list.push({ kind: 'enemy', x: e.pos.x, z: e.pos.z, enemy: e, size: 1 });
    for (const d of this.dozers.active()) list.push({ kind: 'dozer', x: d.pos.x, z: d.pos.z, dozer: d, size: 1 });
    for (const t of list) t.dist = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
    return list.sort((a, b) => a.dist - b.dist);
  }

  // Sumber air terdekat: sumur bor, kanal, sungai, tandon posko, atau jeriken motor
  refillPoint(player) {
    const { x, z } = player.pos;
    const cp = canalPoint(x, z);
    const list = [
      { x: TANK.x, z: TANK.z, label: 'Isi air di tandon posko' },
      { x: riverCenterX(z) - RIVER_HALF + 1, z, label: 'Isi air di sungai' },
      { x: cp.x, z: cp.z, label: 'Isi air di kanal' },
      ...WELLS.map((w) => ({ x: w.x, z: w.z, label: 'Isi air di sumur bor' })),
    ];
    if (this.bike && !this.bike.rider && this.bike.reserve > 30) list.push({ x: this.bike.pos.x, z: this.bike.pos.z, label: 'Isi air dari jeriken motor' });
    let best = null, bd = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  chosenValid() {
    const c = this.chosen;
    if (!c) return false;
    if (c.kind === 'enemy') return this.enemies.active().includes(c.enemy);
    if (c.kind === 'dozer') return this.dozers.active().includes(c.dozer);
    return this.clusters.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 12);
  }

  pickObjective(player, riding) {
    if (!riding && player.water < 15) {
      const r = this.refillPoint(player);
      return { kind: 'water', x: r.x, z: r.z, label: r.label, icon: '💧' };
    }
    // Bukti cukup: arahkan ke pengadilan
    if (this.courtGoal && this.courtGoal()) {
      return { kind: 'court', x: COURT.x, z: COURT.z - 5, label: 'Bawa bukti ke Pengadilan', icon: '⚖️' };
    }
    if (this.chosen && !this.chosenValid()) this.chosen = null;
    let t = null;
    if (this.chosen) {
      if (this.chosen.kind === 'enemy') t = { ...this.chosen, x: this.chosen.enemy.pos.x, z: this.chosen.enemy.pos.z };
      else if (this.chosen.kind === 'dozer') t = { ...this.chosen, x: this.chosen.dozer.pos.x, z: this.chosen.dozer.pos.z };
      else t = this.clusters.reduce((best, k) => {
        const d = Math.hypot(k.x - this.chosen.x, k.z - this.chosen.z);
        return !best || d < best.d ? { ...k, d } : best;
      }, null);
    } else {
      // Pelaku diprioritaskan: api datang dari mereka
      const list = this.targets(player);
      t = list.reduce((best, k) => {
        const score = k.dist * (k.kind === 'enemy' ? 0.3 : k.kind === 'dozer' ? 0.6 : 1);
        return !best || score < best.score ? { ...k, score } : best;
      }, null);
      // Belum ada pelaku tapi ada yang mau masuk: cegat di titik masuknya
      if (!list.some((k) => k.kind === 'enemy') && this.incoming.length) {
        const w = this.incoming[0];
        return { kind: 'enemy', x: w.x, z: w.z, label: `Cegat ${w.label.toLowerCase()} (${Math.ceil(w.eta)} dtk)`, icon: '⚠️' };
      }
    }
    if (!t) {
      // lagi sepi: arahkan ke titik sekat kanal yang belum dibangun
      const dam = this.dams && this.dams.remaining().sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
      if (dam) return { kind: 'dam', x: dam.x, z: dam.z, label: 'Sekat kanal: gambut basah, susah dibakar', icon: '🚧' };
      return null;
    }
    if (t.kind === 'dozer') {
      return { kind: 'dozer', x: t.x, z: t.z, label: t.dozer.golden ? 'Bulldozer berizin (kebal segel)' : 'Segel bulldozer', icon: '🚜' };
    }
    if (t.kind === 'enemy') {
      const name = t.enemy.kind === 'logger' ? 'penebang' : 'pembakar';
      const verb = t.enemy.state === 'stunned' ? 'Jaring' : 'Tangkap';
      return { kind: 'enemy', x: t.x, z: t.z, label: `${verb} ${name}`, icon: '🐀' };
    }
    return { kind: 'fire', x: t.x, z: t.z, label: t.size > 3 ? 'Padamkan kobaran besar' : 'Padamkan api', icon: '🔥' };
  }

  update(dt, player, camYaw, riding) {
    this.clusterT -= dt;
    if (this.clusterT <= 0) {
      this.clusterT = 0.25;
      this.updateClusters();
    }
    this.objective = this.pickObjective(player, riding);
    this.drawMarker(player);
    this.drawThreats(player);
    this.compassT -= dt;
    if (this.compassT <= 0) {
      this.compassT = 0.05;
      this.drawCompass(player, camYaw);
    }
  }

  drawMarker(player) {
    const o = this.objective;
    const el = this.el;
    if (!o) {
      el.marker.classList.add('hidden');
      el.objective.textContent = '✅ Aman, buat sementara. Patroli sambil nunggu api berikutnya.';
      return;
    }
    const dist = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
    el.objective.textContent = `${o.icon} ${o.label} · ${Math.round(dist)} m`;
    el.marker.classList.remove('hidden');
    el.marker.dataset.kind = o.kind;
    el.markerIcon.textContent = o.icon;
    el.markerDist.textContent = `${Math.round(dist)} m`;

    tmp.set(o.x, player.pos.y + 3, o.z).project(this.camera);
    let x = tmp.x, y = tmp.y;
    const behind = tmp.z > 1;
    if (behind) { x = -x; y = -y; }
    // area aman: jauhi panel di pojok layar
    const mx = 0.68, myTop = 0.58, myBot = 0.42;
    const off = behind || Math.abs(x) > mx || y > myTop || y < -myBot;
    if (off) {
      const m = Math.max(Math.abs(x) / mx, y >= 0 ? y / myTop : -y / myBot);
      x /= m; y /= m;
      if (behind && y > -myBot * 0.98) y = -myBot; // di belakang: tempel ke bawah layar
    }
    const sx = ((x + 1) / 2) * window.innerWidth;
    const sy = ((1 - y) / 2) * window.innerHeight;
    el.marker.style.transform = `translate(${sx}px, ${sy}px)`;
    el.markerArrow.style.display = off ? 'block' : 'none';
    if (off) el.markerArrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
  }

  // Penanda di layar buat SETIAP pelaku & bulldozer (maks 6 terdekat)
  drawThreats(player) {
    const list = [];
    for (const e of this.enemies.active()) {
      const name = e.kind === 'logger' ? 'Penebang' : 'Pembakar';
      const doing = { act: e.kind === 'logger' ? 'lagi nebang!' : 'lagi bakar!', flee: 'kabur!', alert: 'kabur!', lured: 'ke MBG', approach: 'jalan' }[e.state] || '';
      const label = e.state === 'stunned' && e.dizzy ? `${name} PUSING! Jaring!` : e.state === 'stunned' ? `${name} jatuh! Jaring!` : `${name} · ${doing}`;
      list.push({ x: e.pos.x, z: e.pos.z, icon: e.state === 'stunned' ? '💫' : '🐀', label, cls: e.state === 'stunned' ? 'dizzy' : 'enemy' });
    }
    for (const d of this.dozers.active()) {
      list.push({ x: d.pos.x, z: d.pos.z, icon: '🚜', label: d.boss ? 'MEGA Bulldozer' : d.golden ? 'Bulldozer berizin' : 'Bulldozer', cls: d.golden ? 'gold' : 'dozer' });
    }
    for (const w of this.incoming) list.push({ x: w.x, z: w.z, icon: '⚠️', label: `${w.label} masuk ${Math.ceil(w.eta)} dtk`, cls: 'incoming' });
    for (const t of list) t.dist = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
    list.sort((a, b) => a.dist - b.dist);
    const shown = list.slice(0, 7);
    // Bantuan yang lagi jalan selalu ditampilkan (biru/merah)
    const tr = this.truck;
    if (tr && tr.state !== 'idle') {
      const st = { going: `menuju · tiba ±${Math.ceil(tr.eta)} dtk`, stuck: `NYANGKUT · ±${Math.ceil(tr.eta)} dtk`, spray: 'menyemprot!', returning: 'pulang isi air' }[tr.state];
      shown.unshift({ x: tr.pos.x, z: tr.pos.z, icon: '🚒', label: `Damkar ${st}`, cls: 'ally-red', dist: Math.hypot(tr.pos.x - player.pos.x, tr.pos.z - player.pos.z) });
    }
    const vc = this.volunteers && this.volunteers.crew;
    if (vc) {
      shown.unshift({ x: vc.x, z: vc.z, icon: '🧑‍🤝‍🧑', label: 'Relawan nyiram', cls: 'ally-green', dist: Math.hypot(vc.x - player.pos.x, vc.z - player.pos.z) });
    }
    const hl = this.heli;
    if (hl && hl.state !== 'idle') {
      const st = { inbound: `menuju · tiba ±${Math.ceil(hl.eta)} dtk`, drop: 'MENYIRAM!', outbound: 'kembali' }[hl.state];
      shown.unshift({ x: hl.pos.x, z: hl.pos.z, icon: '🚁', label: `Helikopter ${st}`, cls: 'ally-blue', dist: Math.hypot(hl.pos.x - player.pos.x, hl.pos.z - player.pos.z), h: hl.pos.y });
    }
    while (this.threatEls.length < shown.length) {
      const el = document.createElement('div');
      el.className = 'tmark';
      el.innerHTML = '<span class="arr">➤</span><span class="ic"></span><span class="lb"></span>';
      this.threatBox.appendChild(el);
      this.threatEls.push(el);
    }
    const rects = [...document.querySelectorAll('#hud .panel.tl, #hud .panel.tr')].map((p) => p.getBoundingClientRect());
    this.threatEls.forEach((el, i) => {
      const t = shown[i];
      if (!t) { el.style.display = 'none'; return; }
      el.style.display = 'flex';
      el.dataset.kind = t.cls;
      el.children[1].textContent = t.icon;
      el.children[2].textContent = `${t.label} · ${Math.round(t.dist)} m`;
      tmp.set(t.x, t.h ?? player.pos.y + 2.6, t.z).project(this.camera);
      let x = tmp.x, y = tmp.y;
      const behind = tmp.z > 1;
      if (behind) { x = -x; y = -y; }
      // area aman: jauhi panel di pojok layar
      // atas boleh lebih tinggi, bawah dibatasi biar gak nabrak minimap & notifikasi
      const mx = 0.68, myTop = 0.62, myBot = 0.42;
      const my = y >= 0 ? myTop : myBot;
      const off = behind || Math.abs(x) > mx || y > myTop || y < -myBot;
      if (off) {
        const m = Math.max(Math.abs(x) / mx, y >= 0 ? y / myTop : -y / myBot);
        x /= m; y /= m;
        if (behind && y > -myBot * 0.98) y = -myBot;
      }
      void my;
      let px = ((x + 1) / 2) * window.innerWidth, py = ((1 - y) / 2) * window.innerHeight;
      // jangan numpuk di atas panel pojok (checklist & panel bantuan): geser ke sampingnya
      for (const r of rects) {
        if (px > r.left - 10 && px < r.right + 10 && py > r.top - 10 && py < r.bottom + 10) {
          px = r.left < window.innerWidth / 2 ? r.right + 12 : r.left - 12;
        }
      }
      el.style.transform = `translate(${px}px, ${py}px)`;
      el.classList.toggle('off', off);
      el.classList.toggle('right', px > window.innerWidth * 0.65); // label dibalik ke kiri biar gak kepotong layar
      el.children[0].style.transform = off ? `rotate(${Math.atan2(-y, x)}rad)` : '';
    });
  }

  drawCompass(player, camYaw) {
    // arah pandang kamera
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const SPAN = (75 * Math.PI) / 180;
    const items = [];
    const rel = (dx, dz) => Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    // U = utara = -z (atas peta)
    for (const [lbl, dx, dz] of [['U', 0, -1], ['T', 1, 0], ['S', 0, 1], ['B', -1, 0], ['', 0.7, -0.7], ['', 0.7, 0.7], ['', -0.7, 0.7], ['', -0.7, -0.7]]) {
      items.push({ a: -rel(dx, dz), html: lbl ? `<b>${lbl}</b>` : '<i>·</i>', cls: 'card' });
    }
    const near = () => true; // kompas nampilin semua ancaman di peta
    for (const c of this.clusters) if (near(c.x, c.z)) items.push({ a: -rel(c.x - player.pos.x, c.z - player.pos.z), html: '🔥', cls: 'poi' });
    for (const e of this.enemies.active()) if (near(e.pos.x, e.pos.z)) items.push({ a: -rel(e.pos.x - player.pos.x, e.pos.z - player.pos.z), html: '🐀', cls: 'poi' });
    for (const w of this.incoming) items.push({ a: -rel(w.x - player.pos.x, w.z - player.pos.z), html: '⚠️', cls: 'poi' });
    for (const d of this.dozers.active()) if (near(d.pos.x, d.pos.z)) items.push({ a: -rel(d.pos.x - player.pos.x, d.pos.z - player.pos.z), html: '🚜', cls: 'poi' });
    items.push({ a: -rel(POSKO.x - player.pos.x, POSKO.z - player.pos.z), html: '⛺', cls: 'poi' });
    if (this.dams) for (const d of this.dams.remaining()) items.push({ a: -rel(d.x - player.pos.x, d.z - player.pos.z), html: '🚧', cls: 'poi' });
    if (this.courtGoal && this.courtGoal()) items.push({ a: -rel(COURT.x - player.pos.x, COURT.z - player.pos.z), html: '⚖️', cls: 'poi' });
    if (this.truck && this.truck.state !== 'idle' && near(this.truck.pos.x, this.truck.pos.z))
      items.push({ a: -rel(this.truck.pos.x - player.pos.x, this.truck.pos.z - player.pos.z), html: '🚒', cls: 'poi' });
    if (this.objective) items.push({ a: -rel(this.objective.x - player.pos.x, this.objective.z - player.pos.z), html: '▼', cls: 'target' });

    const w = this.el.compass.clientWidth || 420;
    this.el.compass.innerHTML = items
      .filter((it) => Math.abs(it.a) < SPAN)
      .map((it) => `<span class="${it.cls}" style="left:${(w / 2 - (it.a / SPAN) * (w / 2)).toFixed(1)}px">${it.html}</span>`)
      .join('');
  }

  // ---------- Peta Titik Panas ----------
  openMap(player) {
    this.mapOpen = true;
    this.updateClusters();
    this.mapList = this.targets(player);
    this.mapSel = 0;
    if (this.chosen) {
      const i = this.mapList.findIndex((t) => Math.hypot(t.x - this.chosen.x, t.z - this.chosen.z) < 12);
      if (i >= 0) this.mapSel = i;
    }
    this.el.map.classList.remove('hidden');
    $('hotmapHelp').innerHTML = this.helpText();
    this.renderList();
    const l = (n) => this.input.label(n);
    this.el.mapHint.textContent =
      this.input.scheme === 'keyboard'
        ? `◀ ▶ ▲ ▼ ganti target · Enter tandai · Q kirim damkar${this.heli && this.heli.enabled ? ' · H panggil helikopter' : ''} · M/Esc tutup`
        : `D-pad / stik kiri ganti target · ${l('confirm')} tandai · ${l('blitz')} kirim damkar${this.heli && this.heli.enabled ? ` · ${l('heli')} panggil helikopter` : ''} · ${l('back')} tutup`;
  }

  // Pesan gagal kirim bantuan: muncul di bawah peta (kelihatan walau game ke-pause)
  mapFail(text) {
    if (this.sfx) this.sfx.error();
    const box = $('hotmapList');
    box.dataset.note = text;
    box.classList.add('note');
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => box.classList.remove('note'), 2500);
  }

  // Daftar target di bawah peta; baris terpilih disorot
  renderList() {
    const box = $('hotmapList');
    if (!this.mapList.length) { box.innerHTML = ''; return; }
    box.innerHTML = this.mapList.map((t, i) => {
      const what = t.kind === 'enemy' ? `🚨 ${t.enemy.kind === 'logger' ? 'Penebang' : 'Pembakar'}`
        : t.kind === 'dozer' ? `🚜 ${t.dozer.boss ? 'Mega Bulldozer' : 'Bulldozer'}`
        : `🔥 Api ${t.size} petak`;
      return `<span class="chip${i === this.mapSel ? ' sel' : ''}">${i === this.mapSel ? '▶ ' : ''}#${i + 1} ${what} · ${Math.round(t.dist)} m</span>`;
    }).join('');
    const sel = box.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  helpText() {
    const l = (n) => this.input.label(n);
    const parts = [];
    if (this.truck && !this.truck.locked) parts.push(`🚒 <b>Damkar (${l('blitz')})</b>: jalan sendiri, nyemprot otomatis.`);
    else parts.push('🚒 <b>Damkar</b>: belum tersedia.');
    if (this.heli && this.heli.enabled) parts.push(`🚁 <b>Heli (${l('heli')})</b>: siraman gede, bisa dipanggil berkali-kali.`);
    parts.push('🐀🚜 Pelaku & bulldozer: harus Bapak datangi sendiri.');
    return parts.join('<br>');
  }

  closeMap() {
    this.mapOpen = false;
    this.el.map.classList.add('hidden');
  }

  updateMap(time, player) {
    const inp = this.input;
    const list = this.mapList;
    const before = this.mapSel;
    const moved = ['next', 'down', 'prev', 'up'].some((k) => inp.justPressed(k));
    if ((inp.justPressed('next') || inp.justPressed('down')) && list.length) this.mapSel = (this.mapSel + 1) % list.length;
    if ((inp.justPressed('prev') || inp.justPressed('up')) && list.length) this.mapSel = (this.mapSel - 1 + list.length) % list.length;
    if (moved && list.length <= 1) {
      if (this.sfx) this.sfx.tone(700, 0, 0.05, { type: 'square', vol: 0.04 });
      const help = $('hotmapList');
      help.dataset.note = list.length ? 'Baru ada 1 target di peta.' : 'Belum ada target di peta.';
      help.classList.add('note');
      clearTimeout(this.noteT);
      this.noteT = setTimeout(() => help.classList.remove('note'), 1800);
    }
    if (this.mapSel !== before) {
      if (this.sfx) this.sfx.tone(1400, 0, 0.04, { type: 'square', vol: 0.04 });
      this.renderList();
    }
    // Panggil helikopter water bombing ke titik api yang dipilih
    if ((inp.justPressed('heli') || inp.justPressed('shout')) && this.heli) {
      const t = list[this.mapSel];
      const why = !t ? 'Belum ada titik api.'
        : t.kind !== 'fire' ? 'Heli cuma bisa ke titik api 🔥.'
        : !this.heli.available ? 'Heli lagi otw / nyiram, tunggu sebentar.'
        : !this.heli.enabled ? 'Heli belum tersedia.'
        : null;
      if (why) this.mapFail(`🚁 ${why}`);
      else if (this.heli.dispatch(t.x, t.z)) { this.closeMap(); return 'heli'; }
    }
    // Kirim damkar ke titik api yang dipilih
    if (inp.justPressed('blitz') && this.truck) {
      const t = list[this.mapSel];
      const why = !t ? 'Belum ada titik api.' : t.kind !== 'fire' ? 'Damkar cuma bisa ke titik api 🔥.' : this.truck.blocked;
      if (why) this.mapFail(`🚒 ${why}`);
      else if (this.truck.dispatch(t.x, t.z)) {
        this.chosen = { kind: 'fire', x: t.x, z: t.z };
        this.closeMap();
        return 'truck';
      }
    }
    if (inp.justPressed('confirm') && list.length) {
      const t = list[this.mapSel];
      this.chosen = t.kind === 'enemy' ? { kind: 'enemy', enemy: t.enemy, x: t.x, z: t.z }
        : t.kind === 'dozer' ? { kind: 'dozer', dozer: t.dozer, x: t.x, z: t.z }
        : { kind: 'fire', x: t.x, z: t.z };
      this.closeMap();
      return 'chosen';
    }
    if (inp.justPressed('back') || inp.justPressed('map') || inp.justPressed('start')) {
      this.closeMap();
      return 'closed';
    }
    this.drawMap(time, player);
    return null;
  }

  drawMap(time, player) {
    const c = this.mctx;
    const size = this.el.mapCanvas.width;
    const s = size / N;
    const W = N * T;
    const toMap = (v) => ((v + HALF) / W) * size;
    c.fillStyle = '#0d120e';
    c.fillRect(0, 0, size, size);
    for (const t of this.world.tiles) {
      let col = MAP_COLOR[t.type];
      if (t.state === STATE.BURNT) col = t.cleared ? '#7a4424' : t.logged ? '#5a4630' : '#141210';
      c.fillStyle = col;
      c.fillRect(t.xi * s, t.zi * s, s + 0.5, s + 0.5);
    }
    // grid ala citra satelit
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let i = 0; i <= N; i += 5) {
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, size); c.stroke();
      c.beginPath(); c.moveTo(0, i * s); c.lineTo(size, i * s); c.stroke();
    }
    // petak yang lagi terbakar
    for (const t of this.fire.burning) {
      c.fillStyle = `rgba(255, ${Math.round(120 - t.heat * 80)}, 40, 0.9)`;
      c.fillRect(t.xi * s, t.zi * s, s + 0.5, s + 0.5);
    }
    // posko
    c.fillStyle = '#f2efe6';
    c.fillRect(toMap(POSKO.x) - 6, toMap(POSKO.z) - 6, 12, 12);
    c.font = '600 12px Inter, sans-serif';
    c.fillText('POSKO', toMap(POSKO.x) + 9, toMap(POSKO.z) + 4);

    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    this.mapList.forEach((t, i) => {
      const x = toMap(t.x), z = toMap(t.z);
      if (t.kind === 'fire') {
        c.strokeStyle = `rgba(255, 90, 40, ${0.4 + pulse * 0.5})`;
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, z, 8 + Math.sqrt(t.size) * 4 + pulse * 4, 0, Math.PI * 2); c.stroke();
      } else if (t.kind === 'dozer') {
        c.fillStyle = t.dozer.golden ? '#ffd060' : '#f2b822';
        c.fillRect(x - 10, z - 7, 20, 14);
        c.strokeStyle = '#1b1208';
        c.lineWidth = 2;
        c.strokeRect(x - 10, z - 7, 20, 14);
        c.fillStyle = '#fff';
        c.fillText(t.dozer.boss ? 'MEGA BULLDOZER' : 'Bulldozer', x + 14, z + 18);
      } else {
        // pelaku: lingkaran merah besar biar gampang disamperin
        c.strokeStyle = `rgba(255, 60, 60, ${0.5 + pulse * 0.5})`;
        c.lineWidth = 3;
        c.beginPath(); c.arc(x, z, 15 + pulse * 7, 0, Math.PI * 2); c.stroke();
        c.fillStyle = t.enemy.state === 'stunned' ? '#7ee06a' : '#ff3c3c';
        c.beginPath(); c.arc(x, z, 9, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
        c.font = '700 13px Inter, sans-serif';
        c.fillStyle = '#fff';
        c.fillText(`🐀 ${t.enemy.kind === 'logger' ? 'Penebang' : 'Pembakar'}`, x + 16, z + 20);
        c.font = '600 12px Inter, sans-serif';
      }
      c.fillStyle = '#fff';
      c.fillText(String(i + 1), x + 12, z - 10);
    });

    // pelaku yang sebentar lagi masuk
    const inside = (v) => Math.min(size - 24, Math.max(24, v)); // jangan kepotong pinggir peta
    for (const w of this.incoming) {
      const x = inside(toMap(w.x)), z = inside(toMap(w.z));
      c.strokeStyle = `rgba(255, 60, 60, ${0.5 + pulse * 0.5})`;
      c.lineWidth = 3;
      c.setLineDash([5, 4]);
      c.beginPath(); c.arc(x, z, 15 + pulse * 7, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.font = '700 13px Inter, sans-serif';
      const txt = `⚠️ ${w.label} masuk ${Math.ceil(w.eta)} dtk`;
      const tw = c.measureText(txt).width;
      const tx = x + 22 + tw > size ? x - 22 - tw : x + 22;
      c.fillStyle = 'rgba(60, 8, 8, 0.85)';
      c.fillRect(tx - 4, z - 10, tw + 8, 20);
      c.fillStyle = '#ff8a8a';
      c.fillText(txt, tx, z + 5);
      c.font = '600 12px Inter, sans-serif';
    }
    // pengadilan
    c.fillStyle = '#e8e2d0';
    c.fillRect(toMap(COURT.x) - 7, toMap(COURT.z) - 6, 14, 12);
    c.fillStyle = '#1d2a4a';
    c.fillText('⚖', toMap(COURT.x) - 5, toMap(COURT.z) + 5);
    // sumur bor
    c.fillStyle = '#4fb6e8';
    for (const w of WELLS) { c.beginPath(); c.arc(toMap(w.x), toMap(w.z), 4, 0, Math.PI * 2); c.fill(); }
    // radar damkar: rute + lingkaran target + waktu tiba
    const tr = this.truck;
    if (tr) {
      if (['going', 'stuck', 'spray'].includes(tr.state) && tr.dest) {
        c.setLineDash([6, 5]);
        c.strokeStyle = 'rgba(255, 70, 70, 0.95)';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(toMap(tr.pos.x), toMap(tr.pos.z));
        for (const [x, z] of tr.path) c.lineTo(toMap(x), toMap(z));
        c.stroke();
        c.setLineDash([]);
        c.strokeStyle = `rgba(255, 70, 70, ${0.5 + pulse * 0.5})`;
        c.beginPath(); c.arc(toMap(tr.dest.x), toMap(tr.dest.z), (22 / W) * size, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ffb0b0';
        c.fillText(tr.state === 'spray' ? 'menyemprot' : `±${Math.ceil(tr.eta)} dtk`, toMap(tr.dest.x) + 10, toMap(tr.dest.z) - 10);
      }
      c.fillStyle = '#ff3030';
      c.fillRect(toMap(tr.pos.x) - 7, toMap(tr.pos.z) - 5, 14, 10);
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(toMap(tr.pos.x) - 7, toMap(tr.pos.z) - 5, 14, 10);
      c.fillStyle = '#fff';
      c.fillText('DAMKAR', toMap(tr.pos.x) + 10, toMap(tr.pos.z) + 4);
    }
    // radar helikopter
    const hl = this.heli;
    if (hl && hl.state !== 'idle') {
      const hx = toMap(hl.pos.x), hz = toMap(hl.pos.z);
      if (hl.state === 'inbound' || hl.state === 'drop') {
        c.setLineDash([6, 5]);
        c.strokeStyle = 'rgba(79, 182, 232, 0.95)';
        c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(hx, hz); c.lineTo(toMap(hl.target.x), toMap(hl.target.z)); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = `rgba(79, 182, 232, ${0.5 + pulse * 0.5})`;
        c.beginPath(); c.arc(toMap(hl.target.x), toMap(hl.target.z), (15 / W) * size, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#4fb6e8';
      c.beginPath(); c.arc(hx, hz, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.fillText('HELI', hx + 10, hz + 4);
    }
    // pemain
    const px = toMap(player.pos.x), pz = toMap(player.pos.z);
    const sel = this.mapList[this.mapSel];
    if (sel) {
      const x = toMap(sel.x), z = toMap(sel.z);
      c.setLineDash([6, 6]);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, pz); c.lineTo(x, z); c.stroke();
      c.setLineDash([]);
      const rr = 20 + pulse * 6;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, z, rr, 0, Math.PI * 2); c.stroke();
      // tanda bidik
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        c.beginPath(); c.moveTo(x + dx * (rr + 2), z + dz * (rr + 2)); c.lineTo(x + dx * (rr + 10), z + dz * (rr + 10)); c.stroke();
      }
      const what = sel.kind === 'enemy' ? (sel.enemy.kind === 'logger' ? 'Penebang liar' : 'Pembakar lahan')
        : sel.kind === 'dozer' ? (sel.dozer.golden ? 'Bulldozer "Izin Resmi"' : 'Bulldozer konsesi')
        : `Titik api · ${sel.size} petak`;
      const tr = this.truck;
      const truckTxt = !tr ? '' : tr.locked ? ' · 🚒 Damkar belum tersedia' : ' · 🚒 Damkar siap';
      const heliTxt = this.heli && this.heli.enabled ? ` · 🚁 Heli ${this.heli.available ? 'siap' : 'lagi terbang'}` : '';
      this.el.mapInfo.innerHTML = `<b>Target ${this.mapSel + 1} dari ${this.mapList.length}</b> · ${what} · ${Math.round(sel.dist)} m dari posisi Bapak${truckTxt}${heliTxt}`;
    } else {
      this.el.mapInfo.textContent = 'Belum ada titik panas terdeteksi. Situasi (beneran) terkendali.';
    }
    c.fillStyle = '#4fb6e8';
    c.beginPath(); c.arc(px, pz, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.stroke();
  }
}
