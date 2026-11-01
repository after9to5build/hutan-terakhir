// Suara SEMENTARA buatan kode (Web Audio), tanpa file audio.
// Nanti tinggal diganti rekaman/aset suara asli di Fase 4.
// Gak ada suara manusia asli di sini: "orasi" teriak cuma gumaman sintetis.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Browser baru izinkan suara setelah ada klik/tombol pertama
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  // ---------- Bahan dasar ----------
  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    // pengaman: kalau banyak suara bunyi barengan, ditekan halus, bukan pecah
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -8;
    lim.knee.value = 6;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.25;
    this.master.connect(lim).connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Suara yang terus jalan; volumenya diatur tiap frame
    this.loops = {
      wind: this.noiseLoop('lowpass', 450, 0.7),
      insects: this.noiseLoop('bandpass', 5200, 9, 17),
      fire: this.noiseLoop('lowpass', 900, 0.8),
      spray: this.noiseLoop('bandpass', 1900, 0.9),
      rain: this.noiseLoop('highpass', 1200, 0.5),
      heli: this.heliLoop(),
      motor: this.oscLoop('sawtooth', 50, 900),
      dozer: this.oscLoop('sawtooth', 48, 260),
      drone: this.oscLoop('sawtooth', 190, 1400, 3),
      siren: this.sirenLoop(),
    };
    this.birdT = 1;
    this.crackleT = 0;
    this.loadVoice();
  }

  // Rekaman di public/audio/ (suara user sendiri, bukan tokoh asli; dirapihin pakai tools/rapihin-suara.py).
  // Kalau file-nya gak ada, teriak balik ke suara sintetis.
  async loadVoice() {
    const load = async (f) => {
      try {
        const r = await fetch(f);
        if (!r.ok || !(r.headers.get('content-type') || '').startsWith('audio')) return null;
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { return null; }
    };
    this.hidupBuf = await load('audio/teriak-hidup.m4a'); // "HIDUP EVALUASIII!"
    this.fahBuf = await load('audio/fahhh.m4a'); // efek "fahhh" antiklimaks
  }

  // Putar buffer di detik `at`; `toa` = dikasih warna suara toa/megafon (pita sempit + sedikit pecah)
  playBuf(buf, at, { vol = 1, toa = false } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    let node = src;
    if (toa) {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2200; pk.gain.value = 5; pk.Q.value = 0.9;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      const sh = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      sh.curve = curve;
      node.connect(hp).connect(pk).connect(lp).connect(sh);
      node = sh;
    }
    const g = c.createGain();
    g.gain.value = vol;
    node.connect(g).connect(this.master);
    src.start(c.currentTime + at);
    return buf.duration;
  }

  // Teriak: toa nguing → "HIDUP EVALUASIII!" → "fahhh". Balikin lama total (detik) buat jeda sahutan kerumunan.
  teriak() {
    if (!this.ok()) return 0.8;
    this.tone(2300, 0, 0.25, { vol: 0.04, attack: 0.18 }); // toa nguing
    let t = 0.2;
    if (this.hidupBuf) t += this.playBuf(this.hidupBuf, t, { vol: 1.15, toa: true });
    else { this.hidupSynth(t); t += 0.6; }
    if (this.fahBuf) t += this.playBuf(this.fahBuf, t + 0.05, { vol: 0.4 }) + 0.05; // pelan aja (permintaan user)
    else { this.faah(t + 0.05); t += 1.0; }
    return t;
  }

  noiseLoop(type, freq, q, amRate = 0) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f);
    let out = f;
    if (amRate) {
      // volume naik-turun pelan (serangga, heli)
      const am = c.createGain();
      am.gain.value = 0.5;
      const lfo = c.createOscillator();
      lfo.frequency.value = amRate;
      const depth = c.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain);
      lfo.start();
      f.connect(am);
      out = am;
    }
    out.connect(g).connect(this.master);
    src.start();
    return { g, f };
  }

  oscLoop(type, freq, cutoff, detune = 0) {
    const c = this.ctx;
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.type = type;
    o2.type = 'triangle'; // dulu kotak: kedengeran "bzzzt" kasar
    o1.frequency.value = freq;
    o2.frequency.value = freq * 0.5 + detune;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.master);
    o1.start();
    o2.start();
    return { g, f, o1, o2 };
  }

  // Helikopter: suara baling-baling dibikin sekali jadi rekaman 2 detik yang diputar ulang.
  // Tiap bilah lewat = hembusan "wump" yang naik cepat lalu meluruh halus (bukan dinyala-matiin kasar,
  // itu yang dulu bunyi kayak speaker rusak) + dentum bass + desis baling-baling ekor.
  // Volume diatur lewat setLoop('heli'); makin jauh makin redam (filter `dist`, diatur di update()).
  makeHeliBuffer() {
    const c = this.ctx, sr = c.sampleRate, dur = 2, n = sr * dur;
    const buf = c.createBuffer(1, n, sr);
    const fade = Math.floor(sr * 0.08); // ekor 0,08 dtk dicampur ke awal biar sambungan putaran gak "klik"
    const d = new Float32Array(n + fade);
    const rate = 12.5; // bilah lewat per detik (pas 25 kali per putaran rekaman, jadi sambungannya mulus)
    const coef = (f) => 1 - Math.exp((-2 * Math.PI * f) / sr);
    const aLo = coef(380), aMid = coef(1400);
    let lo1 = 0, lo2 = 0, mid = 0, peak = 0;
    for (let i = 0; i < n + fade; i++) {
      const t = i / sr;
      const k = Math.floor(t * rate);
      const ph = t * rate - k; // 0..1 dalam satu tebasan bilah
      const w = Math.random() * 2 - 1;
      lo1 += (w - lo1) * aLo;
      lo2 += (lo1 - lo2) * aLo;
      mid += (w - mid) * aMid;
      const accent = 0.82 + 0.18 * Math.sin(k * 2.39); // tiap tebasan beda dikit, biar gak kayak mesin
      const env = Math.exp(-ph * 5.5) * (1 - Math.exp(-ph * 60)); // naik cepat tanpa "klik", turun halus
      const wump = lo2 * 4.2 * (0.25 + env * accent);
      const thump = Math.sin(2 * Math.PI * 58 * (ph / rate)) * Math.exp(-ph * 7) * 0.55 * accent;
      const tailAm = 0.5 + 0.5 * Math.sin(2 * Math.PI * 45 * t);
      const tail = (mid - lo1) * tailAm * tailAm * 0.22;
      d[i] = wump + thump + tail;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < fade; i++) { const x = i / fade; d[i] = d[i] * x + d[n + i] * (1 - x); }
    const out = buf.getChannelData(0);
    for (let i = 0; i < n; i++) out[i] = d[i] * (0.9 / peak);
    return buf;
  }

  heliLoop() {
    const c = this.ctx;
    const g = c.createGain(); // volume utama (jarak)
    g.gain.value = 0;
    const dist = c.createBiquadFilter(); // makin jauh, suara tinggi makin hilang
    dist.type = 'lowpass';
    dist.frequency.value = 900;
    dist.Q.value = 0.5;
    dist.connect(g).connect(this.master);
    const src = c.createBufferSource();
    src.buffer = this.makeHeliBuffer();
    src.loop = true;
    src.connect(dist);
    // dengung turbin: nada lembut + getar pelan, jauh di belakang
    const whine = c.createOscillator();
    whine.frequency.value = 1180;
    const vib = c.createOscillator();
    vib.frequency.value = 0.35;
    const vibD = c.createGain();
    vibD.gain.value = 9;
    vib.connect(vibD).connect(whine.frequency);
    const whineG = c.createGain();
    whineG.gain.value = 0.012;
    whine.connect(whineG).connect(dist);
    src.start(); whine.start(); vib.start();
    return { g, dist, src };
  }

  sirenLoop() {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 800;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.6;
    const depth = c.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(o.frequency);
    const g = c.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    o.start();
    lfo.start();
    return { g };
  }

  setLoop(name, vol, smooth = 0.15) {
    const l = this.loops[name];
    l.g.gain.setTargetAtTime(vol, this.ctx.currentTime, smooth);
    return l;
  }

  // Nada pendek (oscilator) mulai `start` detik dari sekarang
  tone(freq, start, dur, { type = 'sine', vol = 0.2, to = null, attack = 0.005 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // Semburan noise tersaring (desis, ledakan, tepuk tangan)
  burst(start, dur, { type = 'highpass', freq = 1500, vol = 0.2, q = 0.7, to = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + start;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  ok() {
    return this.enabled && this.ready;
  }

  // ---------- Efek sekali bunyi ----------
  alarm() { if (!this.ok()) return; for (let i = 0; i < 2; i++) { this.tone(880, i * 0.3, 0.12, { type: 'square', vol: 0.07 }); this.tone(660, i * 0.3 + 0.14, 0.12, { type: 'square', vol: 0.07 }); } }
  error() { if (!this.ok()) return; this.tone(160, 0, 0.3, { type: 'square', vol: 0.08 }); this.tone(120, 0.15, 0.3, { type: 'square', vol: 0.08 }); }
  stamp() { if (!this.ok()) return; this.tone(140, 0, 0.18, { vol: 0.5, to: 45 }); this.burst(0, 0.08, { type: 'lowpass', freq: 600, vol: 0.4 }); }
  cuffs() { if (!this.ok()) return; this.tone(2600, 0, 0.03, { type: 'square', vol: 0.08 }); this.tone(3300, 0.12, 0.03, { type: 'square', vol: 0.08 }); }
  shutter() { if (!this.ok()) return; this.burst(0, 0.03, { freq: 3000, vol: 0.25 }); this.burst(0.07, 0.04, { freq: 2200, vol: 0.2 }); }
  combo(n) {
    if (!this.ok()) return;
    const f = 520 * Math.pow(1.12, Math.min(n, 8)); // makin tinggi tiap combo
    this.tone(f, 0, 0.09, { type: 'triangle', vol: 0.1 });
    this.tone(f * 1.5, 0.08, 0.16, { type: 'triangle', vol: 0.1 });
  }
  chime() { if (!this.ok()) return; [880, 1108, 1318].forEach((f, i) => this.tone(f, i * 0.09, 0.5, { vol: 0.09 })); }
  dingdong() { if (!this.ok()) return; this.tone(784, 0, 0.7, { vol: 0.12 }); this.tone(622, 0.45, 0.9, { vol: 0.12 }); }
  whistle() { if (!this.ok()) return; const o = this.tone(2700, 0, 1.3, { vol: 0.08 }); const l = this.ctx.createOscillator(); l.frequency.value = 22; const d = this.ctx.createGain(); d.gain.value = 60; l.connect(d).connect(o.frequency); l.start(); l.stop(this.ctx.currentTime + 1.4); }
  gavel() { if (!this.ok()) return; [0, 0.38, 0.76].forEach((s) => { this.tone(320, s, 0.12, { vol: 0.35, to: 110 }); this.burst(s, 0.05, { type: 'lowpass', freq: 900, vol: 0.3 }); }); }
  explosion() { if (!this.ok()) return; this.burst(0, 1.6, { type: 'lowpass', freq: 2500, to: 80, vol: 0.9 }); this.tone(70, 0, 1.2, { vol: 0.6, to: 30 }); }
  splash() { if (!this.ok()) return; this.burst(0, 1.4, { type: 'bandpass', freq: 900, to: 300, vol: 0.5 }); }
  phoneAnswer(accept) { if (!this.ok()) return; accept ? this.chime() : this.tone(400, 0, 0.15, { type: 'square', vol: 0.06, to: 200 }); }
  win() { if (!this.ok()) return; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * 0.15, 0.6, { type: 'triangle', vol: 0.12 })); }
  lose() { if (!this.ok()) return; [392, 330, 262, 196].forEach((f, i) => this.tone(f, i * 0.22, 0.7, { type: 'triangle', vol: 0.12 })); }

  // Telepon berdering terus sampai ringStop()
  ringStart() {
    if (!this.ok() || this.ringTimer) return;
    const ring = () => { for (let i = 0; i < 2; i++) { this.tone(480, i * 0.5, 0.4, { vol: 0.06 }); this.tone(620, i * 0.5, 0.4, { vol: 0.06 }); } };
    ring();
    this.ringTimer = setInterval(ring, 2000);
  }
  ringStop() { clearInterval(this.ringTimer); this.ringTimer = null; }

  applause(dur = 3) {
    if (!this.ok()) return;
    const n = Math.round(dur * 35);
    for (let i = 0; i < n; i++) this.burst(Math.random() * dur, 0.03 + Math.random() * 0.03, { freq: 1200 + Math.random() * 1800, vol: 0.06 + Math.random() * 0.06 });
  }

  // "Orasi" sintetis: gumaman suku kata + "IIIII" panjang + sorakan (bukan suara manusia asli)
  shout(syllables = 4) {
    if (!this.ok()) return;
    const c = this.ctx;
    this.tone(2300, 0, 0.35, { vol: 0.05, attack: 0.25 }); // toa nguing
    let t = 0.3;
    const voice = (at, dur, pitch, formant, toPitch) => {
      const s = c.currentTime + at;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(pitch, s);
      if (toPitch) o.frequency.linearRampToValueAtTime(toPitch, s + dur);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = formant;
      f.Q.value = 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      g.gain.setValueAtTime(0.35, s + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(s);
      o.stop(s + dur + 0.05);
    };
    for (let i = 0; i < syllables; i++) {
      const d = 0.09 + Math.random() * 0.08;
      voice(t, d, 150 + Math.random() * 70, 700 + Math.random() * 700);
      t += d + 0.03;
    }
    voice(t + 0.05, 1.0, 190, 2600, 260); // "IIIII"
    for (let i = 0; i < 20; i++) this.burst(t + 0.5 + Math.random() * 1.2, 0.05, { type: 'bandpass', freq: 800 + Math.random() * 900, vol: 0.05 });
    this.burst(t + 0.4, 1.6, { type: 'bandpass', freq: 1100, q: 0.5, vol: 0.12 }); // sorakan kerumunan
  }

  // Teriak "HIDUP!" pakai text-to-speech generik bawaan browser (cadangan lama; teriak sekarang pakai teriak())
  hidup() {
    if (!this.ok()) return;
    this.tone(2300, 0, 0.3, { vol: 0.05, attack: 0.22 }); // toa nguing
    const synth = window.speechSynthesis;
    let spoken = false;
    if (synth && window.SpeechSynthesisUtterance) {
      try {
        const u = new SpeechSynthesisUtterance('Hidup!');
        u.lang = 'id-ID';
        const v = synth.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('id'));
        if (v) u.voice = v;
        u.pitch = 0.4;
        u.rate = 0.85;
        u.volume = 1;
        setTimeout(() => synth.speak(u), 280);
        spoken = true;
      } catch (e) { spoken = false; }
    }
    if (!spoken) this.hidupSynth(0.3);
    for (let i = 0; i < 14; i++) this.burst(0.9 + Math.random() * 0.9, 0.05, { type: 'bandpass', freq: 800 + Math.random() * 900, vol: 0.05 });
    this.burst(0.85, 1.2, { type: 'bandpass', freq: 1100, q: 0.5, vol: 0.1 });
  }

  // "HI-DUP" sintetis: "hi" tinggi (vokal i), "dup" rendah & diputus
  hidupSynth(start = 0) {
    const c = this.ctx;
    const syl = (at, dur, pitch, formant, toPitch) => {
      const t = c.currentTime + at;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.linearRampToValueAtTime(toPitch, t + dur);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = formant;
      f.Q.value = 5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.setValueAtTime(0.4, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    this.burst(start, 0.06, { type: 'highpass', freq: 2500, vol: 0.12 }); // "h"
    syl(start + 0.04, 0.22, 170, 2400, 190); // "hi"
    syl(start + 0.3, 0.16, 150, 700, 120); // "dup"
    this.burst(start + 0.46, 0.03, { type: 'lowpass', freq: 400, vol: 0.2 }); // "p"
  }

  // Kerumunan relawan nyahut "HIDUUUP!": makin sering teriak, makin banyak suara
  crowdHidup(level = 1, start = 0) {
    if (!this.ok()) return;
    const c = this.ctx;
    const voices = Math.min(3 + level, 12);
    for (let v = 0; v < voices; v++) {
      const at = start + Math.random() * 0.12;
      const base = 130 + Math.random() * 120;
      const say = (t0, dur, p0, p1, formant, vol) => {
        const t = c.currentTime + t0;
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(p0, t);
        o.frequency.linearRampToValueAtTime(p1, t + dur);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = formant;
        f.Q.value = 4;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
        g.gain.setValueAtTime(vol, t + dur * 0.75);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g).connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.05);
      };
      const vol = 0.09 / Math.sqrt(voices) * 2.2;
      say(at, 0.18, base * 1.15, base * 1.2, 2300 + Math.random() * 300, vol); // "hi"
      say(at + 0.2, 0.7, base, base * 0.92, 750 + Math.random() * 200, vol); // "duuup"
    }
    // tepuk tangan & sorakan, makin rame tiap level
    const claps = Math.min(10 + level * 4, 60);
    for (let i = 0; i < claps; i++) this.burst(start + 0.9 + Math.random() * 1.4, 0.03 + Math.random() * 0.03, { freq: 1200 + Math.random() * 1800, vol: 0.05 + Math.random() * 0.05 });
    this.burst(start + 0.8, 1.4, { type: 'bandpass', freq: 1000, q: 0.5, vol: Math.min(0.06 + level * 0.01, 0.16) });
  }

  // Klakson damkar dua nada
  horn() { if (!this.ok()) return; for (let i = 0; i < 2; i++) { this.tone(440, i * 0.45, 0.35, { type: 'square', vol: 0.07 }); this.tone(554, i * 0.45, 0.35, { type: 'square', vol: 0.06 }); } }
  // Bunyi radio HT: "kssht" + bip
  radio() { if (!this.ok()) return; this.burst(0, 0.25, { type: 'bandpass', freq: 2500, q: 0.6, vol: 0.12 }); this.tone(1800, 0.28, 0.08, { type: 'square', vol: 0.05 }); this.tone(1800, 0.42, 0.08, { type: 'square', vol: 0.05 }); }
  // Lemparan: desis udara
  // Ganti alat: "klik-klak" mekanis + denting kecil
  weaponSwap() {
    if (!this.ok()) return;
    this.burst(0, 0.02, { type: 'highpass', freq: 3200, vol: 0.35 });
    this.tone(1900, 0, 0.03, { type: 'square', vol: 0.06, to: 1200 });
    this.burst(0.07, 0.03, { type: 'bandpass', freq: 1400, q: 2, vol: 0.4 });
    this.tone(700, 0.07, 0.06, { type: 'triangle', vol: 0.12, to: 380 });
    this.tone(2600, 0.12, 0.12, { type: 'sine', vol: 0.05 });
  }
  whoosh() { if (!this.ok()) return; this.burst(0, 0.35, { type: 'bandpass', freq: 600, to: 2400, q: 1.2, vol: 0.18 }); }
  // Jaring kena: "sret" + tali tegang
  net() { if (!this.ok()) return; this.burst(0, 0.15, { type: 'highpass', freq: 2500, vol: 0.2 }); this.tone(320, 0.05, 0.25, { type: 'triangle', vol: 0.12, to: 180 }); }
  // Kertas amplop dibuka + "boing" kaget
  paper() { if (!this.ok()) return; for (let i = 0; i < 4; i++) this.burst(i * 0.06, 0.05, { freq: 3500, vol: 0.08 }); this.tone(500, 0.3, 0.4, { vol: 0.12, to: 180 }); }
  // Nyam-nyam
  munch() { if (!this.ok()) return; for (let i = 0; i < 5; i++) this.burst(i * 0.22, 0.08, { type: 'lowpass', freq: 700, vol: 0.12 }); }

  // Kentut sintetis: nada rendah bergetar yang turun
  fart(start = 0) {
    if (!this.ok()) return;
    const c = this.ctx;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.7);
    const wob = c.createOscillator();
    wob.frequency.value = 28;
    const wd = c.createGain();
    wd.gain.value = 35;
    wob.connect(wd).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    g.gain.setValueAtTime(0.45, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); wob.start(t);
    o.stop(t + 0.8); wob.stop(t + 0.8);
    this.burst(start, 0.6, { type: 'lowpass', freq: 300, vol: 0.15 });
  }

  // "Faaah" sintetis: helaan napas kecewa yang nadanya turun
  faah(start = 0) {
    if (!this.ok()) return;
    this.burst(start, 0.12, { type: 'highpass', freq: 3000, vol: 0.12 }); // "f"
    const c = this.ctx;
    const t = c.currentTime + start + 0.08;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.9);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900; // vokal "a"
    f.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.05);
  }

  // Teriak gagal: toa nguing, "HIDUP OOWI-", lalu antiklimaks
  shoutFlop() {
    if (!this.ok()) return;
    this.tone(2300, 0, 0.35, { vol: 0.05, attack: 0.25 });
    Math.random() < 0.5 ? this.fart(0.55) : this.faah(0.55);
  }

  // ---------- Dipanggil tiap frame ----------
  // s: { life, fire, spraying, riding, bikeSpeed, throttle, rain, siren, heli, dozer, drone } (0..1)
  update(dt, s) {
    if (!this.ok()) return;
    this.setLoop('wind', 0.05 + s.fire * 0.04);
    this.setLoop('insects', 0.02 * s.life);
    this.setLoop('fire', Math.min(0.35, s.fire * 0.3));
    this.setLoop('spray', s.spraying ? 0.1 : 0, 0.05);
    this.setLoop('rain', s.rain * 0.12, 0.5);
    const h = this.setLoop('heli', s.heli * 0.5, 0.3);
    h.dist.frequency.setTargetAtTime(500 + s.heli * s.heli * 5500, this.ctx.currentTime, 0.3);
    h.src.playbackRate.setTargetAtTime(0.97 + s.heli * 0.06, this.ctx.currentTime, 0.5); // dikit lebih tinggi pas dekat
    this.setLoop('siren', s.siren * 0.05);
    this.setLoop('dozer', s.dozer * 0.12);
    this.setLoop('drone', s.drone * 0.03);
    const m = this.setLoop('motor', s.riding ? 0.05 + s.throttle * 0.05 : 0, 0.1);
    const f = 45 + s.bikeSpeed * 5;
    m.o1.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
    m.o2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.1);
    m.f.frequency.setTargetAtTime(450 + s.bikeSpeed * 35 + s.throttle * 300, this.ctx.currentTime, 0.1); // makin ngegas makin "terbuka"

    // Burung: makin sedikit kalau hutan habis & berasap
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 0.8 + Math.random() * 3;
      if (Math.random() < s.life) {
        const base = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, i * 0.13, 0.1, { vol: 0.035 * s.life, to: base * (1.2 + Math.random() * 0.3) });
      }
    }
    // Kresek api
    this.crackleT -= dt;
    if (s.fire > 0.05 && this.crackleT <= 0) {
      this.crackleT = 0.02 + Math.random() * (0.25 / (s.fire + 0.1));
      this.burst(0, 0.015 + Math.random() * 0.02, { freq: 1500 + Math.random() * 2500, vol: 0.1 * Math.min(1, s.fire * 1.5) });
    }
  }
}
