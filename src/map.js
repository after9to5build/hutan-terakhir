// Tata letak peta Level 1. Semua koordinat dalam meter.
// Ubah angka-angka di sini buat geser posko, jalan, sungai, dan gambut.
import { clamp } from './config.js';

// Posko darurat: titik awal pemain
export const POSKO = { x: -22, z: 56, r: 13 };
// Tandon air di posko (bisa isi air di sini selain di sungai)
export const TANK = { x: -14, z: 51 };

// Sirkuit motor trail (wahana): jalan tanah oval di hutan timur posko. Gak masuk misi, cuma buat main.
export const CIRCUIT = { x: 10, z: 34, rx: 16, rz: 11, n: 12 };
const r1 = (v) => Math.round(v * 10) / 10;
export const CIRCUIT_PTS = Array.from({ length: CIRCUIT.n }, (_, k) => {
  const a = (k / CIRCUIT.n) * Math.PI * 2;
  return [r1(CIRCUIT.x + CIRCUIT.rx * Math.cos(a)), r1(CIRCUIT.z + CIRCUIT.rz * Math.sin(a))];
});
export const CIRCUIT_START = CIRCUIT_PTS[3]; // ujung selatan (10, 45): garis start/finish
export const CIRCUIT_CPS = [CIRCUIT_PTS[6], CIRCUIT_PTS[9], CIRCUIT_PTS[0]]; // 3 bendera yang wajib dilewati

// Panggung peresmian (wahana): lapangan kecil di pinggir jalan ke sirkuit
export const CEREMONY = { x: -1, z: 50, r: 5.5 };
export function ceremonyDist(x, z) {
  return Math.hypot(x - CEREMONY.x, z - CEREMONY.z);
}

// Jalan tanah: tiap jalan = daftar titik [x, z]
export const ROADS = [
  [[-22, 56], [-20, 32], [-6, 6], [4, -28], [0, -80]], // jalan utama ke utara
  [[-6, 6], [22, 2], [48, -4]], // cabang timur ke sungai
  [[-20, 32], [-44, 22], [-64, 8]], // cabang barat ke batas konsesi
  [[-22, 56], [-2, 64], [14, 66]], // jalan ke pengadilan
  // jalan setapak ke tengah hutan (biar motor gak harus nembus pohon)
  [[4, -28], [-14, -40], [-28, -51], [-46, -64]], // ke gambut utara & lahan bekas terbakar
  [[-44, 22], [-46, 2], [-53, -13]], // ke gambut barat (sumur bor)
  [[22, 2], [27, -18], [21, -35]], // ke sumur bor timur laut
  [[-2, 64], CIRCUIT_START], // ke sirkuit, lewat panggung peresmian
  [...CIRCUIT_PTS, CIRCUIT_PTS[0]], // lintasan sirkuit (muter)
];

// Pengadilan Negeri: tempat menyerahkan bukti (Level 3)
export const COURT = { x: 24, z: 66, r: 10 };
export function courtDist(x, z) {
  return Math.hypot(x - COURT.x, z - COURT.z);
}
export const ROAD_HALF = 2.6;

// Sungai di sisi timur
export const RIVER_HALF = 4.5;
export function riverCenterX(z) {
  return 54 + Math.sin(z * 0.045) * 8 + Math.sin(z * 0.13 + 1.3) * 2.5;
}
export function riverDist(x, z) {
  return Math.abs(x - riverCenterX(z));
}

// Lahan gambut (api lebih cepat di sini), di barat laut
export const PEAT = { x: -38, z: -30, rx: 26, rz: 22 };
export function inPeat(x, z) {
  const dx = (x - PEAT.x) / PEAT.rx, dz = (z - PEAT.z) / PEAT.rz;
  const wobble = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.12;
  return dx * dx + dz * dz < 1 + wobble;
}

// Sumur bor: sumber air pemadam di lahan gambut (seperti di Kalimantan beneran)
export const WELLS = [
  { x: -48, z: -20 },
  { x: -30, z: -46 },
  { x: -14, z: -6 },
  { x: 24, z: -40 },
  { x: -50, z: 38 },
];

// Kanal drainase dari arah konsesi: bikin gambut kering, tapi airnya bisa dipakai
export const CANAL = [[-68, -31], [-18, -35]];
export const CANAL_HALF = 1.1;
export function canalDist(x, z) {
  const [[ax, az], [bx, bz]] = CANAL;
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}
export function canalPoint(x, z) {
  const [[ax, az], [bx, bz]] = CANAL;
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return { x: ax + vx * t, z: az + vz * t };
}

// Barat garis ini = kebun sawit konsesi
export const SAWIT_X = -68;

// Bekas kebakaran tahun lalu (pojok barat laut)
export function inScar(x, z) {
  return z < -62 + Math.sin(x * 0.2) * 3 && x < -28;
}

// Celah-celah kecil di tengah hutan biar gak sesak
export function inGlade(x, z) {
  return Math.sin(x * 0.09 + 1) * Math.sin(z * 0.11 + 2) + 0.4 * Math.sin(x * 0.23 - z * 0.19) > 1.05;
}

export function roadDist(x, z) {
  let best = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
    }
  }
  return best;
}

export function poskoDist(x, z) {
  return Math.hypot(x - POSKO.x, z - POSKO.z);
}
