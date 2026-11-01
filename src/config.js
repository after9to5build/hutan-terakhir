// Ukuran dunia: N×N petak, tiap petak T meter.
export const N = 40;
export const T = 4;
export const W = N * T;
export const HALF = W / 2;

export const STATE = { FOREST: 0, BURNING: 1, BURNT: 2 };

// Jenis petak. Cuma FOREST & PEAT yang bisa terbakar.
export const TYPE = { FOREST: 0, PEAT: 1, CLEAR: 2, ROAD: 3, RIVER: 4, SAWIT: 5, SCAR: 6 };

export const GAME_TIME = 180; // detik untuk satu musim kemarau
export const DAYS = 30; // ditampilkan sebagai "hari menuju hujan"
export const LOSE_RATIO = 0.4; // kalah kalau hutan tersisa di bawah ini

export function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Setelan grafis: 'tinggi' (default) atau 'rendah'. Disimpan di browser.
export const GFX = (() => {
  try { return localStorage.getItem('ht-gfx') === 'rendah' ? 'rendah' : 'tinggi'; } catch { return 'tinggi'; }
})();
export const LOW = GFX === 'rendah';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
