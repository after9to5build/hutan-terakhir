// Barang kecil (Gelombang 4) dibikin lewat kode, gak pakai Meshy (lihat ASET-MESHY.md bagian E).
// Bentuk dari geometri sederhana + tekstur "gambar tangan" procedural: tepi digelapin,
// bintik kotor, goresan kuas. Biar gayanya nyambung sama model Meshy yang hand-painted.
import * as THREE from 'three';

// ---------- Kuas tekstur ----------
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// Kanvas berisi warna dasar + goresan kuas halus + bintik kotor + tepi gelap.
// `draw(g, w, h)` buat nambah detail khusus (tulisan, garis, motif).
function paint({ base, size = 256, edge = 0.35, dirt = 0.25, strokes = 0.12, seed = 7, draw }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  const col = new THREE.Color(base);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, size, size);
  // goresan kuas: sapuan terang-gelap tipis
  for (let i = 0; i < 70; i++) {
    const k = r() < 0.5 ? 1 + strokes : 1 - strokes;
    const sc = col.clone().multiplyScalar(k);
    g.strokeStyle = `#${sc.getHexString()}`;
    g.globalAlpha = 0.35;
    g.lineWidth = 2 + r() * size * 0.04;
    g.beginPath();
    const x = r() * size, y = r() * size;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * size * 0.4, y + (r() - 0.5) * size * 0.1, x + (r() - 0.5) * size * 0.6, y + (r() - 0.5) * size * 0.15);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (draw) draw(g, size, size, r);
  // bintik kotor / lumpur
  for (let i = 0; i < 260 * dirt; i++) {
    g.fillStyle = `rgba(40,28,16,${0.08 + r() * 0.18})`;
    const s = 1 + r() * size * 0.03;
    g.beginPath();
    g.arc(r() * size, r() * size, s, 0, Math.PI * 2);
    g.fill();
  }
  // tepi gelap (kesan bayangan sudut, cocok buat kotak)
  if (edge > 0) {
    const grad = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(20,12,6,${edge})`);
      gr.addColorStop(1, 'rgba(20,12,6,0)');
      return gr;
    };
    const e = size * 0.14;
    g.fillStyle = grad(0, 0, e, 0); g.fillRect(0, 0, e, size);
    g.fillStyle = grad(size, 0, size - e, 0); g.fillRect(size - e, 0, e, size);
    g.fillStyle = grad(0, 0, 0, e); g.fillRect(0, 0, size, e);
    g.fillStyle = grad(0, size, 0, size - e); g.fillRect(0, size - e, size, e);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const matCache = {};
// Material dengan tekstur hasil `paint`, di-cache per kunci biar gak bikin kanvas berkali-kali
function painted(key, opts, { rough = 0.75, metal = 0 } = {}) {
  if (!matCache[key]) {
    matCache[key] = new THREE.MeshStandardMaterial({ map: paint(opts), roughness: rough, metalness: metal });
  }
  return matCache[key];
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const label = (text, color, font = 'bold') => (g, w, h) => {
  g.fillStyle = color;
  g.font = `${font} ${Math.round(h * 0.17)}px Inter, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
};

// ---------- Barang ----------

// Jeriken bensin merah (dibawa tikus pembakar). Ukuran ±0.24 × 0.32 × 0.13, titik nol di tengah.
export function makeJerrycan(color = 0xc0281c) {
  const g = new THREE.Group();
  const red = painted(`jer${color}`, {
    base: color, dirt: 0.5, seed: 3,
    draw: (c, w, h) => {
      // motif X timbul khas jeriken
      c.strokeStyle = 'rgba(255,190,170,0.35)';
      c.lineWidth = w * 0.05;
      c.beginPath(); c.moveTo(w * 0.2, h * 0.2); c.lineTo(w * 0.8, h * 0.8); c.moveTo(w * 0.8, h * 0.2); c.lineTo(w * 0.2, h * 0.8); c.stroke();
      c.strokeStyle = 'rgba(60,10,6,0.4)';
      c.lineWidth = w * 0.02;
      c.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76);
    },
  }, { rough: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.6 });
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.13), red));
  // gagang tiga lubang di atas
  for (const x of [-0.07, 0, 0.07]) g.add(mesh(new THREE.BoxGeometry(0.035, 0.05, 0.05), red, x, 0.175, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.025, 0.05), red, 0, 0.21, 0));
  // corong
  const sp = mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.08, 8), dark, 0.09, 0.18, 0.03);
  sp.rotation.z = -0.5;
  g.add(sp);
  return g;
}

// Gergaji mesin oranye (dibawa tikus penebang). Bilah ngadep +z.
export function makeChainsaw() {
  const g = new THREE.Group();
  const orange = painted('saw', {
    base: 0xe8661c, dirt: 0.45, seed: 11,
    draw: (c, w, h) => {
      c.fillStyle = 'rgba(30,30,30,0.85)';
      c.fillRect(0, h * 0.62, w, h * 0.12); // garis hitam di badan
    },
  }, { rough: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
  const bar = painted('sawbar', {
    base: 0xb9bcc0, edge: 0, dirt: 0.15, strokes: 0.05, seed: 12,
    draw: (c, w, h) => {
      // rantai: gigi-gigi gelap di pinggir bilah
      c.fillStyle = '#2a2a2a';
      for (let x = 0; x < w; x += w / 16) { c.fillRect(x, 0, w / 24, h * 0.14); c.fillRect(x, h * 0.86, w / 24, h * 0.14); }
    },
  }, { rough: 0.35, metal: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(0.18, 0.2, 0.32), orange));
  const handleTop = mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14, Math.PI), black, 0, 0.1, 0.02);
  handleTop.rotation.y = Math.PI / 2;
  g.add(handleTop);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), black, 0, -0.02, -0.22)); // gagang belakang
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.09, 0.62), bar, 0, -0.01, 0.46));
  const tip = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), bar, 0, -0.01, 0.77);
  tip.rotation.z = Math.PI / 2;
  g.add(tip);
  return g;
}

// Ember plastik dengan gagang besi. Titik nol di tengah ember.
export function makeBucket(color = 0x2c7fc0, scale = 1) {
  const g = new THREE.Group();
  const key = `ember${color}`;
  const plastic = painted(key, { base: color, edge: 0.15, dirt: 0.35, seed: color % 97 }, { rough: 0.5 });
  plastic.side = THREE.DoubleSide;
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 0.7 });
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.28, 16, 1, true), plastic));
  g.add(mesh(new THREE.CircleGeometry(0.13, 16).rotateX(-Math.PI / 2), plastic, 0, -0.139, 0));
  const rim = mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 20), plastic, 0, 0.14, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const water = mesh(new THREE.CircleGeometry(0.155, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5aa0c8, roughness: 0.1, metalness: 0.1 }), 0, 0.09, 0);
  g.add(water);
  const handle = mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 16, Math.PI), metal, 0, 0.14, 0);
  g.add(handle);
  g.scale.setScalar(scale);
  return g;
}

// Karung pasir goni. Geometri & material dipakai bareng (sekat kanal butuh banyak).
const sackGeo = new THREE.SphereGeometry(0.32, 12, 8).scale(1.3, 0.55, 0.8);
export function sackMaterial() {
  return painted('karung', {
    base: 0xc9b083, edge: 0, dirt: 0.6, strokes: 0.08, seed: 21,
    draw: (c, w, h) => {
      // anyaman goni
      c.strokeStyle = 'rgba(90,70,40,0.35)';
      c.lineWidth = 1.5;
      for (let i = 0; i < w; i += 6) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); }
      c.strokeStyle = 'rgba(255,240,200,0.18)';
      for (let i = 0; i < h; i += 6) { c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
    },
  }, { rough: 1 });
}
export function makeSandbag() {
  const g = new THREE.Group();
  g.add(mesh(sackGeo, sackMaterial()));
  // ujung karung yang diikat
  const tie = mesh(new THREE.ConeGeometry(0.08, 0.14, 8), sackMaterial(), 0.44, 0.02, 0);
  tie.rotation.z = -Math.PI / 2;
  g.add(tie);
  return g;
}

// Patok kayu (sekat kanal)
export function woodMaterial() {
  return painted('kayu', {
    base: 0x7a5a38, edge: 0.2, dirt: 0.4, seed: 31,
    draw: (c, w, h, r) => {
      // serat kayu memanjang
      c.strokeStyle = 'rgba(40,24,10,0.35)';
      for (let i = 0; i < 18; i++) {
        c.lineWidth = 1 + r() * 2;
        const x = r() * w;
        c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 8, h * 0.3, x - 8, h * 0.7, x + 4, h); c.stroke();
      }
    },
  }, { rough: 0.9 });
}

// Amplop cokelat tebal berisi uang (satir "titipan")
export function makeEnvelope() {
  const g = new THREE.Group();
  const paper = painted('amplop', {
    base: 0xb08850, dirt: 0.2, seed: 41,
    draw: (c, w, h) => {
      // lipatan tutup segitiga
      c.strokeStyle = 'rgba(70,45,20,0.6)';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w / 2, h * 0.55); c.lineTo(w, 0); c.stroke();
      c.fillStyle = '#c23b22'; // segel merah
      c.beginPath(); c.arc(w / 2, h * 0.55, w * 0.07, 0, Math.PI * 2); c.fill();
    },
  });
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.05, 0.3), paper));
  // lembaran uang nyembul di pinggir
  const bills = painted('uang', { base: 0x5f9a5a, edge: 0.2, dirt: 0.1, seed: 42, draw: label('100.000', 'rgba(20,60,20,0.6)') });
  g.add(mesh(new THREE.BoxGeometry(0.38, 0.03, 0.24), bills, 0.05, 0.01, -0.06));
  return g;
}

// Nasi MBG (gadget jebakan): ompreng stainless bersekat, tutup kebuka setengah, tulisan MBG di tutup.
// Ukuran ±0.44 × 0.32, titik nol di dasar tengah.
export function makeRiceBox() {
  const g = new THREE.Group();
  const steel = painted('ompreng', {
    base: 0xc9cdd2, edge: 0.25, dirt: 0.05, strokes: 0.06, seed: 53,
    draw: (c, w, h, r) => {
      // goresan stainless (brushed) mendatar
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 1;
      for (let i = 0; i < 90; i++) { const y = r() * h; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (r() - 0.5) * 4); c.stroke(); }
    },
  }, { rough: 0.3, metal: 0.35 });
  // badan ompreng + bibir
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.045, 0.32), steel, 0, 0.0225, 0));
  // isi tiap sekat (dilihat dari atas): nasi, sayur, lauk, tempe, buah
  const food = (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const rice = mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), food(0xf4f1e8), 0.1, 0.045, 0.06);
  rice.scale.set(1.3, 0.55, 1);
  g.add(rice);
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.022, 0.09), food(0x4f8a3a), -0.04, 0.055, 0.075)); // sayur
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.03, 0.06), food(0x8a4a22, 0.7), -0.15, 0.06, 0.08)); // ayam
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.05), food(0xb58a4a), -0.15, 0.055, -0.07)); // tempe
  const orange = mesh(new THREE.SphereGeometry(0.03, 10, 8), food(0xf08a1c, 0.6), -0.05, 0.05, -0.07); // jeruk
  orange.scale.y = 0.45; // dipipihin biar gak nembus tutup
  g.add(orange);
  // sekat-sekat
  for (const [x, z, w, d] of [[0.02, 0, 0.012, 0.3], [-0.1, 0, 0.012, 0.3], [-0.04, 0.0, 0.24, 0.012]]) {
    g.add(mesh(new THREE.BoxGeometry(w, 0.02, d), steel, x, 0.055, z));
  }
  // tutup: digeser ke samping & agak miring, tulisan MBG di atasnya
  const lid = new THREE.Group();
  lid.position.set(0.05, 0.068, -0.15); // geser ke belakang: sekat depan (nasi, sayur, ayam) kelihatan
  lid.rotation.set(0.04, 0.08, 0);
  lid.add(mesh(new THREE.BoxGeometry(0.44, 0.012, 0.32), steel));
  const stamp = paint({
    base: 0xc9cdd2, size: 256, edge: 0.3, dirt: 0.03, strokes: 0.05, seed: 54,
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(80,85,90,0.6)'; // garis timbul tepi tutup
      c.lineWidth = 6;
      c.strokeRect(w * 0.1, h * 0.12, w * 0.8, h * 0.76);
      c.fillStyle = '#c4161c';
      c.font = `900 ${Math.round(h * 0.32)}px Inter, Arial, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('MBG', w / 2, h / 2);
    },
  });
  // label datar di atas tutup (plane, biar tulisannya pasti gak kebalik)
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.31).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stamp, roughness: 0.3, metalness: 0.35 }));
  top.position.y = 0.0065;
  lid.add(top);
  g.add(lid);
  return g;
}

// Tangki air punggung Pak Presiden (pengganti kapsul biru polos)
export function makeBackTank() {
  const g = new THREE.Group();
  // polos biru gaya cat (stiker/tulisan kegulung jelek di bentuk kapsul)
  const blue = painted('tangki', { base: 0x2f86c9, edge: 0, dirt: 0.3, strokes: 0.15, seed: 61 }, { rough: 0.4 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  g.add(mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), blue));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 }), 0, 0.38, 0));
  for (const y of [-0.12, 0.16]) {
    const band = mesh(new THREE.TorusGeometry(0.175, 0.012, 4, 20), strap, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  return g;
}

// Podium konferensi pers + 3 mikrofon (ending pencitraan). Panel depan ngadep +z, pembicara di -z.
export function makePodium() {
  const g = new THREE.Group();
  const wood = painted('podium', {
    base: 0x5a3a24, edge: 0.4, dirt: 0.05, seed: 71,
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(212,175,55,0.8)';
      c.lineWidth = w * 0.025;
      c.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76); // list emas
      c.fillStyle = 'rgba(212,175,55,0.85)';
      c.beginPath(); c.arc(w / 2, h * 0.45, w * 0.12, 0, Math.PI * 2); c.fill(); // medali generik (bukan lambang asli)
    },
  }, { rough: 0.55 });
  g.add(mesh(new THREE.BoxGeometry(1.2, 1.15, 0.6), wood, 0, 0.575, 0));
  g.add(mesh(new THREE.BoxGeometry(1.32, 0.06, 0.7), wood, 0, 1.18, 0)); // meja atas, sedikit lebih lebar
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const colors = [0xc4161c, 0x1d5fbf, 0xf2c12e]; // busa mic tiap "stasiun TV"
  [-0.25, 0, 0.25].forEach((x, i) => {
    // mic di sisi pembicara (-z), condong ke arah mulutnya
    const stem = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), black, x, 1.4, -0.12);
    stem.rotation.x = -0.4;
    g.add(stem);
    g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.9 }), x, 1.6, -0.21));
  });
  return g;
}

// Peti logistik kayu (posko)
export function crateMaterial() {
  return painted('peti', {
    base: 0x8a6a40, edge: 0.45, dirt: 0.35, seed: 81,
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(50,30,12,0.55)';
      c.lineWidth = 3;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, (h / 4) * i); c.lineTo(w, (h / 4) * i); c.stroke(); }
      c.lineWidth = w * 0.06; // palang silang
      c.beginPath(); c.moveTo(w * 0.1, h * 0.1); c.lineTo(w * 0.9, h * 0.9); c.stroke();
      c.fillStyle = 'rgba(30,30,30,0.7)';
      c.font = `bold ${Math.round(h * 0.12)}px Inter, Arial, sans-serif`;
      c.textAlign = 'center';
      c.fillText('LOGISTIK', w / 2, h * 0.3);
    },
  });
}

// Terpal tenda posko oranye
export function tentMaterial() {
  return painted('terpal', {
    base: 0xd9622b, edge: 0.1, dirt: 0.06, strokes: 0.1, seed: 91,
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(120,40,10,0.35)'; // jahitan
      c.setLineDash([6, 5]);
      c.lineWidth = 2;
      for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo((w / 5) * i, 0); c.lineTo((w / 5) * i, h); c.stroke(); }
      c.setLineDash([]);
    },
  }, { rough: 0.85 });
}

// Tandon air plastik biru (posko): garis cincin melingkar + kotor dikit di bawah
export function tandonMaterial() {
  return painted('tandon', {
    base: 0x2f86c9, edge: 0, dirt: 0.15, strokes: 0.1, seed: 101,
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(15,50,90,0.45)';
      c.lineWidth = 4;
      for (const y of [0.18, 0.4, 0.62, 0.84]) { c.beginPath(); c.moveTo(0, h * y); c.lineTo(w, h * y); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 2;
      for (const y of [0.17, 0.39, 0.61, 0.83]) { c.beginPath(); c.moveTo(0, h * y - 3); c.lineTo(w, h * y - 3); c.stroke(); }
      const grd = c.createLinearGradient(0, h * 0.75, 0, h);
      grd.addColorStop(0, 'rgba(70,50,30,0)');
      grd.addColorStop(1, 'rgba(70,50,30,0.35)'); // cipratan lumpur di bawah
      c.fillStyle = grd;
      c.fillRect(0, h * 0.75, w, h * 0.25);
    },
  }, { rough: 0.45 });
}
export { painted as paintedMat };
