// Satu misi utuh (±7 menit) dengan 3 babak yang makin panas.
// Ubah angka di sini buat atur tingkat kesulitan. Waktu dalam detik sejak misi dimulai.
// Balance 31 Okt 2026 (user: susah dapet >50%): api alami lebih jarang, penjalaran 1.3/1.6 → 1.15/1.35,
// 2 pelaku dikurangin, pembakar cuma nyalain 3 titik (dulu 5).
// entry pelaku: 0 = batas konsesi, 1 = ujung jalan utara, 2 = bekas lahan terbakar
// entry bulldozer: 0 = batas konsesi (tengah), 1 = batas konsesi (gambut), 2 = ujung jalan utara

export const MISSION = {
  id: 1,
  name: 'Hutan Terakhir',
  kicker: 'Kalimantan · Musim Kemarau',
  duration: 420,
  days: 40,
  intro: {
    quote: '“Situasi terkendali.”',
    who: 'Juru Bicara Kementerian Urusan Asap',
    brief: [
      'Jaga hutan di atas 40% sampai hujan (±7 menit).',
      'Siram: {spray} · Jaring: {blitz} · Teriak: {shout}',
      'Buka peta ({map}) buat kirim damkar atau heli.',
      'Tikus berdasi 🐀 datang rame-rame. Tangkap 3, bawa buktinya ke Pengadilan.',
    ],
  },
  firstFire: [-13, 30],
  truck: true,
  heli: true,
  court: true,

  // Babak: tiap babak ganti tempo api, asap, dan fokus gambut
  phases: [
    { at: 0, name: 'Kemarau Mulai', ignite: { first: 999, every: 999, double: 0 }, spread: 1.0, smokeBase: 0, preferPeat: false },
    { at: 90, name: 'Gambut Menyala', quote: 'Kata Pejabat: “Gambut itu terbakar sendiri.”', ignite: { every: 70, double: 0 }, spread: 1.15, smokeBase: 0.12, preferPeat: true },
    { at: 240, name: 'Puncak Kemarau', quote: 'Kata Pejabat: “Asap ini kiriman dari negara tetangga.”', ignite: { every: 55, double: 0.1 }, spread: 1.35, smokeBase: 0.3, preferPeat: false },
  ],

  // Pelaku datang bergelombang. Waktu sama = masuk barengan dari arah beda.
  spawns: [
    // Babak 1: pemanasan, makin rame
    { at: 22, kind: 'arsonist', entry: 0 },
    { at: 42, kind: 'arsonist', entry: 2 },
    { at: 58, kind: 'arsonist', entry: 1 }, { at: 58, kind: 'logger', entry: 0 },
    { at: 78, kind: 'arsonist', entry: 0 }, { at: 78, kind: 'arsonist', entry: 2 },
    // Babak 2: gelombang 2–3 pelaku barengan
    { at: 100, kind: 'arsonist', entry: 1 }, { at: 100, kind: 'arsonist', entry: 2 },
    { at: 118, kind: 'logger', entry: 0 }, { at: 118, kind: 'arsonist', entry: 1 },
    { at: 135, kind: 'dozer', entry: 1 },
    { at: 150, kind: 'arsonist', entry: 0 }, { at: 150, kind: 'arsonist', entry: 2 },
    { at: 175, kind: 'logger', entry: 2 }, { at: 175, kind: 'arsonist', entry: 0 },
    { at: 198, kind: 'arsonist', entry: 1 }, { at: 198, kind: 'arsonist', entry: 2 },
    { at: 222, kind: 'logger', entry: 1 }, { at: 222, kind: 'arsonist', entry: 0 }, { at: 222, kind: 'arsonist', entry: 2 },
    // Babak 3: serbuan
    { at: 245, kind: 'arsonist', entry: 0 }, { at: 245, kind: 'arsonist', entry: 1 }, { at: 245, kind: 'arsonist', entry: 2 },
    { at: 265, kind: 'dozer', entry: 0 },
    { at: 275, kind: 'logger', entry: 1 }, { at: 275, kind: 'arsonist', entry: 2 },
    { at: 300, kind: 'boss', entry: 0 },
    { at: 305, kind: 'arsonist', entry: 0 }, { at: 305, kind: 'arsonist', entry: 1 },
    { at: 328, kind: 'arsonist', entry: 2 }, { at: 328, kind: 'arsonist', entry: 0 }, { at: 328, kind: 'logger', entry: 1 },
    { at: 352, kind: 'arsonist', entry: 1 }, { at: 352, kind: 'arsonist', entry: 2 },
    { at: 372, kind: 'arsonist', entry: 0 }, { at: 372, kind: 'arsonist', entry: 2 },
    { at: 395, kind: 'arsonist', entry: 2 }, { at: 395, kind: 'arsonist', entry: 0 },
  ],
  calls: [
    { at: 150, id: 'tangki' },
    { at: 285, id: 'bom' },
    { at: 340, id: 'motor' },
  ],
  drones: [{ at: 120 }, { at: 300 }],
  // Relawan warga datang ke api yang jauh dari pemain
  volunteers: [135, 225, 300, 365],
  tips: [
    { at: 10, text: (l) => `🏍️ Motor parkir di posko. ${l('action')} buat naik, jerikennya ada air.` },
    { at: 30, text: () => '🎀 Panggung peresmian & sirkuit motor udah buka di timur posko. Apinya juga.' },
    { at: 50, text: (l) => `🍱 Ganti ke Nasi MBG (${l('gadgetPrev')} ${l('gadgetNext')}) buat mancing pelaku.` },
    { at: 65, text: (l) => `🚒 Apinya jauh? Buka peta (${l('map')}), terus ${l('blitz')} kirim damkar.` },
    { at: 80, text: (l) => `🚧 Gambut barat mulai kering. Sekat kanalnya: tahan ${l('action')} di tumpukan karung.` },
    { at: 95, text: (l) => `🚁 Kobaran gede? Panggil heli dari peta pakai ${l('heli')}.` },
    { at: 115, text: (l) => `📢 Teriak (${l('shout')}) bikin lari lebih kencang.` },
  ],
  quotes: [
    { at: 4, text: 'Kata Pejabat: “Situasi terkendali.”' },
    { at: 200, text: 'Kata Pejabat: “Ribuan personel sudah turun.” (Di mana, Pak?)' },
    { at: 360, text: 'Kata Pejabat: “Udara masih wajar.” (Sambil pakai masker.)' },
    { at: 400, text: 'Kata Pejabat: “Kita tunggu hujan saja.”' },
  ],
};

// Babak yang sedang berjalan (indeks + datanya)
export function phaseAt(t) {
  let i = 0;
  MISSION.phases.forEach((p, k) => { if (t >= p.at) i = k; });
  return { idx: i, ...MISSION.phases[i] };
}

export function starsFor(ratio) {
  return ratio >= 0.8 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.4 ? 1 : 0;
}
