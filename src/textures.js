// Tekstur buatan kode (canvas): daun, pakis, kulit kayu, serasah tanah.
// Gak perlu download file. Warnanya sengaja agak abu-abu terang,
// biar warna per pohon (instance color) yang nentuin hijau/gosongnya.
import * as THREE from 'three';
import { rng } from './config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Normal map dari gambar abu-abu (terang = tinggi)
function normalFrom(c, strength = 2.5) {
  const { width: w, height: h } = c;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const [o, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => {
    const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / 765;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return toTex(o, { srgb: false, repeat: true });
}

// Gambar sesuatu di posisi (x, y) + salinan di sisi seberang, biar teksturnya nyambung kalau diulang
function wrapDraw(size, x, y, pad, fn) {
  for (const ox of [0, -size, size]) {
    for (const oy of [0, -size, size]) {
      const px = x + ox, py = y + oy;
      if (px < -pad || px > size + pad || py < -pad || py > size + pad) continue;
      fn(px, py);
    }
  }
}

function leaf(g, x, y, len, wid, rot, fill, vein, shade = false) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, len * 0.45, 0, len);
  g.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  g.fillStyle = fill;
  g.fill();
  if (shade) {
    // gaya cat: separuh daun (sisi kanan tulang daun) lebih gelap, tepi kiri kena cahaya
    g.save();
    g.clip();
    g.fillStyle = 'rgba(10,25,5,0.28)';
    g.fillRect(0, -len, wid * 2, len * 3);
    g.restore();
    g.strokeStyle = 'rgba(255,255,220,0.22)';
    g.lineWidth = Math.max(1, wid * 0.1);
    g.beginPath();
    g.moveTo(0, len * 0.05);
    g.quadraticCurveTo(-wid * 0.92, len * 0.45, 0, len * 0.95);
    g.stroke();
  }
  if (vein) {
    g.strokeStyle = vein;
    g.lineWidth = Math.max(1, wid * 0.12);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, len * 0.92);
    g.stroke();
  }
  g.restore();
}

// Gumpalan daun (buat mahkota pohon & semak)
export function leafClusterTexture() {
  const S = 512, r = rng(77);
  const [c, g] = canvas(S, S);
  for (let i = 0; i < 200; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.4;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const len = 46 + r() * 50;
    const l = 48 + r() * 42 - (d / S) * 18; // tengah lebih gelap (bayangan dalam)
    leaf(g, x, y, len, len * 0.36, r() * Math.PI * 2,
      `hsl(${66 + r() * 40}, ${22 + r() * 26}%, ${l}%)`, `hsla(80, 20%, ${l + 14}%, 0.55)`, true);
  }
  const t = toTex(c);
  t.premultiplyAlpha = false;
  return t;
}

// Daun pakis (satu pelepah, berdiri vertikal)
export function fernTexture() {
  const Wd = 256, Ht = 512, r = rng(31);
  const [c, g] = canvas(Wd, Ht);
  const cx = Wd / 2;
  g.strokeStyle = 'hsl(85, 25%, 40%)';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx, Ht); g.lineTo(cx, 12); g.stroke();
  for (let y = Ht - 30; y > 20; y -= 15) {
    const t = 1 - y / Ht; // 0 bawah, 1 ujung
    const len = (Wd * 0.48) * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.55) * (0.85 + r() * 0.15);
    for (const s of [-1, 1]) {
      const l = 50 + r() * 30;
      leaf(g, cx, y, len, 11 + (1 - t) * 6, s * (Math.PI / 2 + 0.35) + Math.PI, `hsl(${80 + r() * 20}, ${25 + r() * 15}%, ${l}%)`, `hsla(80, 20%, ${l + 12}%, 0.5)`, true);
    }
  }
  return toTex(c);
}

// Kulit kayu: garis-garis vertikal + bercak lumut (diulang ke atas)
export function barkTextures() {
  const Wd = 256, Ht = 512, r = rng(5);
  const [c, g] = canvas(Wd, Ht);
  g.fillStyle = '#9a9086';
  g.fillRect(0, 0, Wd, Ht);
  for (let i = 0; i < 260; i++) {
    const x = r() * Wd, w = 2 + r() * 7, l = 30 + r() * 55;
    g.strokeStyle = `hsla(30, 12%, ${l}%, ${0.25 + r() * 0.5})`;
    g.lineWidth = w;
    g.beginPath();
    let px = x;
    g.moveTo(px, -10);
    for (let y = 0; y <= Ht + 20; y += 32) { px += (r() - 0.5) * 7; g.lineTo(px, y); }
    g.stroke();
  }
  // alur dalam yang gelap + punggung kulit kayu yang kena cahaya (gaya cat, kontras kayak model Meshy)
  for (let i = 0; i < 26; i++) {
    let px = r() * Wd;
    const w = 3 + r() * 5;
    g.lineCap = 'round';
    g.strokeStyle = `hsla(25, 25%, ${12 + r() * 8}%, ${0.55 + r() * 0.3})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(px, -10);
    const pts = [[px, -10]];
    for (let y = 0; y <= Ht + 20; y += 24) { px += (r() - 0.5) * 9; g.lineTo(px, y); pts.push([px, y]); }
    g.stroke();
    // garis terang tipis di samping alur
    g.strokeStyle = `hsla(35, 20%, ${70 + r() * 15}%, 0.35)`;
    g.lineWidth = Math.max(1, w * 0.4);
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x - w * 0.9, y) : g.moveTo(x - w * 0.9, y)));
    g.stroke();
  }
  // lumut hijau
  for (let i = 0; i < 40; i++) {
    const x = r() * Wd, y = r() * Ht, s = 8 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, `hsla(${80 + r() * 20}, 35%, 42%, 0.55)`);
    grd.addColorStop(1, 'hsla(80, 30%, 45%, 0)');
    g.fillStyle = grd;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // lumut kerak (lichen) pucat, khas batang pohon hutan tropis
  for (let i = 0; i < 22; i++) {
    const x = r() * Wd, y = r() * Ht, s = 5 + r() * 14;
    g.fillStyle = `hsla(${70 + r() * 40}, 18%, ${72 + r() * 12}%, ${0.35 + r() * 0.25})`;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = s * (0.6 + r() * 0.5);
      k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.4) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.4);
    }
    g.closePath();
    g.fill();
  }
  const map = toTex(c, { repeat: true });
  const normal = normalFrom(c, 4);
  // ke atas dicerminkan biar gak ada garis sambungan
  map.wrapT = normal.wrapT = THREE.MirroredRepeatWrapping;
  return { map, normal };
}

// Serasah lantai hutan: daun kering, ranting, tanah (bisa diulang tanpa sambungan)
export function groundTextures() {
  const S = 512, r = rng(19);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#8f8572';
  g.fillRect(0, 0, S, S);
  // bercak tanah lembap
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, s = 20 + r() * 60, l = 35 + r() * 30;
    wrapDraw(S, x, y, s, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, s);
      grd.addColorStop(0, `hsla(30, 18%, ${l}%, 0.35)`);
      grd.addColorStop(1, 'hsla(30, 18%, 50%, 0)');
      g.fillStyle = grd;
      g.fillRect(px - s, py - s, s * 2, s * 2);
    });
  }
  // daun kering berserakan
  for (let i = 0; i < 1100; i++) {
    const x = r() * S, y = r() * S, len = 10 + r() * 20, rot = r() * Math.PI * 2;
    const hue = 20 + r() * 30, l = 30 + r() * 40;
    wrapDraw(S, x, y, len, (px, py) =>
      leaf(g, px, py, len, len * 0.38, rot, `hsla(${hue}, ${25 + r() * 25}%, ${l}%, ${0.55 + r() * 0.4})`, `hsla(${hue}, 20%, ${l - 12}%, 0.5)`));
  }
  // ranting
  g.lineCap = 'round';
  for (let i = 0; i < 55; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 20 + r() * 50;
    wrapDraw(S, x, y, l, (px, py) => {
      g.strokeStyle = `hsla(25, 25%, ${22 + r() * 15}%, 0.8)`;
      g.lineWidth = 1.5 + r() * 2.5;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
    });
  }
  const map = toTex(c, { repeat: true });
  return { map, normal: normalFrom(c, 2) };
}

// Riak air (normal map) buat sungai
export function waterNormal() {
  const S = 256, r = rng(88);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) {
    const x = r() * S, y = r() * S, s = 6 + r() * 26, l = r() < 0.5 ? 40 : 75;
    wrapDraw(S, x, y, s, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, s);
      grd.addColorStop(0, `hsla(0, 0%, ${l}%, 0.35)`);
      grd.addColorStop(1, 'hsla(0, 0%, 50%, 0)');
      g.fillStyle = grd;
      g.fillRect(px - s, py - s, s * 2, s * 2);
    });
  }
  return normalFrom(c, 4);
}

// Gradasi lembut buat sinar matahari tembus kanopi
export function shaftTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  return toTex(c);
}
