import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { STATE, TYPE, LOSE_RATIO, clamp, GFX, LOW } from './config.js';
import { World, groundHeight } from './world.js';
import { Fire } from './fire.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { POSKO } from './map.js';
import { Input, IDLE } from './input.js';
import { Bike } from './bike.js';
import { Enemies, ENTRIES as ENEMY_ENTRIES } from './enemies.js';
import { Birds } from './birds.js';
import { buildBoundary, edgeDistance } from './boundary.js';
import { Dams } from './canals.js';
import { Volunteers } from './volunteers.js';
import { Guide } from './guide.js';
import { Dozers, ENTRIES as DOZER_ENTRIES } from './dozer.js';
import { Satire } from './satire.js';
import { FireTruck, REACH } from './firetruck.js';
import { Gadgets } from './gadgets.js';
import { Heli } from './heli.js';
import { Court, EVIDENCE_NEEDED } from './court.js';
import { decideEnding, stageEnding, sawitTakeover, ENDINGS, FACTS, raporTitle } from './endings.js';
import { Sfx } from './audio.js';
import { Wahana } from './wahana.js';
import { Kopdes } from './kopdes.js';
import { MISSION, phaseAt, starsFor } from './levels.js';
import { loadProgress } from './characters.js';

// Satu misi utuh dengan 3 babak
const LEVEL = MISSION;

// ---------- Renderer & efek ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const MAX_PR = Math.min(window.devicePixelRatio, LOW ? 1 : 1.5);
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 210); // di atas 200 m udah ketutup kabut

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.55, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Color grading: kontras, saturasi, warna hangat/asap, vignette (di akhir, setelah tone mapping)
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.12 }, uContrast: { value: 1.08 }, uTint: { value: new THREE.Vector3(1.02, 1.0, 0.96) },
    uVignette: { value: 0.32 }, uLift: { value: 0.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette, uLift; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uTint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5 + uLift;
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(q * vec2(1.1, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
});
composer.addPass(grade);

// ---------- Dunia ----------
const world = new World(scene);
const fire = new Fire(world, scene);
const player = new Player(scene);
// Mulai di posko, menghadap ke utara (arah jalan utama)
player.pos.set(POSKO.x + 1, 0, POSKO.z - 10);
player.facing = Math.PI;
const bike = new Bike(scene, POSKO.x + 5, POSKO.z - 6, Math.PI); // motor trail parkir di posko
const enemies = new Enemies(scene, world, fire);
const birds = new Birds(scene);
buildBoundary(scene);
const dozers = new Dozers(scene, world, fire);
const dams = new Dams(scene, world, fire);
const volunteers = new Volunteers(scene, world, fire, LEVEL.volunteers || []);
const truck = new FireTruck(scene, world, fire);
truck.locked = !LEVEL.truck;
const heli = new Heli(scene, fire);
if (LEVEL.heli) {
  heli.enabled = true; // tanpa batas jatah
}

// Zona target bantuan: lingkaran di tanah + tiang cahaya, kelihatan dari jauh
function makeZone(color, r) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.7, r, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, fog: false })
  );
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 45, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  beam.position.y = 22;
  g.add(ring, fill, beam);
  g.visible = false;
  scene.add(g);
  return { g, ring, beam };
}
const truckZone = makeZone(0xff3030, REACH);
const heliZone = makeZone(0x4fb6e8, 15);
function updateZones(time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  const tz = ['going', 'stuck', 'spray'].includes(truck.state) && truck.dest;
  truckZone.g.visible = !!tz;
  if (tz) {
    truckZone.g.position.set(truck.dest.x, groundHeight(truck.dest.x, truck.dest.z) + 0.35, truck.dest.z);
    truckZone.ring.material.opacity = 0.4 + pulse * 0.5;
  }
  const hz = heli.state === 'inbound' || heli.state === 'drop';
  heliZone.g.visible = hz;
  if (hz) {
    heliZone.g.position.set(heli.target.x, groundHeight(heli.target.x, heli.target.z) + 0.35, heli.target.z);
    heliZone.ring.material.opacity = 0.4 + pulse * 0.5;
  }
}
const court = new Court(scene, world);

const hud = new Hud();
// Suara sementara buatan kode. Browser baru izinkan suara setelah klik/tombol pertama.
const sfx = new Sfx();
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sfx.unlock());

// Pantulan langit buat air
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = world.sky.clone();
envSky.scale.setScalar(0.1); // PMREM cuma render sampai jarak 100
envScene.add(envSky);
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
scene.environmentIntensity = 0.35;

function particleScale() {
  const h = renderer.domElement.height;
  return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
const particleSystems = () => [...fire.systems, player.spray];
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  for (const p of particleSystems()) p.uniforms.uScale.value = particleScale();
}
window.addEventListener('resize', onResize);
onResize();

// ---------- Input (keyboard + controller) ----------
const input = new Input(canvas);
let camYaw = 0;
let camPitch = 0.45;

// Petunjuk tombol di layar ikut perangkat yang lagi dipakai
function refreshHints() {
  const hint = input.hint();
  document.getElementById('controlsHint').textContent = hint;
  document.getElementById('menuHint').textContent = hint;
  const pad = document.getElementById('padStatus');
  if (input.device === 'gamepad') {
    pad.textContent = `🎮 Controller ${input.padType === 'playstation' ? 'PlayStation' : 'Xbox'} terhubung. Tekan ${input.label('confirm')} buat mulai.`;
    pad.classList.add('on');
  } else {
    pad.textContent = '🎮 Pakai controller? Colok, terus tekan tombol apa aja.';
    pad.classList.remove('on');
  }
  document.getElementById('againHint').textContent = `atau tekan ${input.label('confirm')}`;
}
input.onDeviceChange = refreshHints;
refreshHints();
const guide = new Guide(camera, world, fire, enemies, input, dozers);
guide.truck = truck;
guide.bike = bike;
guide.heli = heli;
guide.dams = dams;
guide.volunteers = volunteers;
guide.sfx = sfx;
guide.courtGoal = () => LEVEL.court && !dozers.permitRevoked && game.evidence.length >= EVIDENCE_NEEDED;
const satire = new Satire({ scene, hud, input, player, bike, fire, enemies, dozers, world, sfx, get game() { return game; } });
satire.calls = LEVEL.calls;
const gadgets = new Gadgets({ scene, player, enemies, hud, sfx, satire });
// Wahana satir (panggung peresmian + sirkuit motor). Gak masuk misi; api tetap jalan selama main.
const kopdes = new Kopdes(scene, world, { hud });
guide.kopdes = kopdes; // ikon 🏪 di kompas
const wahana = new Wahana(scene, { hud, sfx, player, bike, fire, satire, pop: (...a) => pop(...a), get game() { return game; } });
satire.drones = LEVEL.drones;

// ---------- Kamera third-person ----------
const camTarget = player.pos.clone();
let camDist = 9.5;
let heliLookW = 0; // 0..1, seberapa jauh kamera dongak ke heli
let lookIdle = 0;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Resolusi otomatis: kalau rata-rata di bawah ±40 FPS selama 3 detik, resolusi diturunin sedikit
const perf = { t: 0, frames: 0, sum: 0 };
function autoResolution(dt) {
  if (document.hidden || !(game.state === 'play' || game.state === 'rain')) { perf.t = perf.frames = perf.sum = 0; return; }
  perf.t += dt; perf.frames++; perf.sum += dt;
  if (perf.t < 3) return;
  const avg = perf.sum / perf.frames;
  perf.t = perf.frames = perf.sum = 0;
  if (avg > 1 / 40 && pixelRatio > 0.6) {
    pixelRatio = Math.max(0.6, +(pixelRatio - 0.15).toFixed(2));
    onResize();
  } else if (avg < 1 / 57 && pixelRatio < MAX_PR) {
    pixelRatio = Math.min(MAX_PR, +(pixelRatio + 0.1).toFixed(2));
    onResize();
  }
}

// ---------- Efek aksi: freeze sesaat, slow-mo, layar goyang, tulisan besar ----------
const fx = { stop: 0, slow: 0, slowScale: 1, shake: 0 };
const hitStop = (s) => { fx.stop = Math.max(fx.stop, s); };
const slowMo = (s, scale = 0.3) => { fx.slow = Math.max(fx.slow, s); fx.slowScale = scale; };
const shake = (a) => { fx.shake = Math.max(fx.shake, a); };
let popTimer = 0;
function pop(text, sub = '', cls = '') {
  const el = $('pop');
  el.className = cls;
  el.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(popTimer);
  popTimer = setTimeout(() => el.classList.remove('show'), cls.includes('big') ? 2200 : 1300);
}
// Combo: nangkep beruntun dalam 14 detik
const combo = { n: 0, t: 0, best: 0 };

function updateCamera(dt) {
  camYaw += input.lookDelta.yaw;
  camPitch = clamp(camPitch + input.lookDelta.pitch, 0.08, 0.85);
  // Naik motor: kamera agak jauh & otomatis balik ke belakang motor
  lookIdle = Math.abs(input.lookDelta.yaw) > 1e-4 ? 0 : lookIdle + dt;
  if (bike.rider && lookIdle > 0.8 && Math.abs(bike.speed) > 2) {
    camYaw += wrap(bike.heading + Math.PI - camYaw) * Math.min(1, dt * 2.5);
  }
  // Jalan kaki: kamera pelan-pelan muter ke belakang Pak Presiden ngikutin arah lari
  // (gaya action PS2). Gak aktif pas lagi ngintip pakai stik kanan, lagi nyiram,
  // atau lagi jalan mundur ke arah kamera.
  const spd = Math.hypot(player.vel.x, player.vel.z);
  if (!bike.rider && (game.state === 'play' || game.state === 'rain') && lookIdle > 0.5 && spd > 1.5 && !player.spraying && input.move.y > -0.3) {
    const follow = 2.2 * clamp(spd / 7, 0, 1.4) * Math.min(1, Math.abs(input.move.x) + 0.35);
    camYaw += wrap(player.facing + Math.PI - camYaw) * Math.min(1, dt * follow);
  }
  camDist += ((bike.rider ? 12.5 : 9.5) - camDist) * Math.min(1, dt * 3);
  camTarget.lerp(player.pos, 1 - Math.exp(-dt * 8));
  const look = camTarget.clone().add(new THREE.Vector3(0, 1.7, 0));
  const off = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch)
  ).multiplyScalar(camDist);
  camera.position.copy(look).add(off);
  camera.position.y = Math.max(camera.position.y, groundHeight(camera.position.x, camera.position.z) + 0.6);
  // Heli lagi nyiram di dekat pemain: kamera pelan-pelan dongak ke arah heli biar kelihatan, lalu balik
  const heliNear = heli.group.visible && heli.state === 'drop' && Math.hypot(heli.pos.x - player.pos.x, heli.pos.z - player.pos.z) < 45;
  heliLookW += ((heliNear ? 1 : 0) - heliLookW) * Math.min(1, dt * (heliNear ? 1.6 : 0.9));
  if (heliLookW > 0.01) look.lerp(heli.pos.clone().add(new THREE.Vector3(0, -2.5, 0)), heliLookW * 0.68);
  camera.lookAt(look);
  if (fx.shake > 0) {
    const a = fx.shake * fx.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    camera.position.z += (Math.random() - 0.5) * a;
  }
  world.setViewLine(camera.position, player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));

  world.sky.position.copy(camera.position);
  const sunDir = world.skyUniforms.sunDir.value;
  world.sun.position.copy(camTarget).addScaledVector(sunDir, 70);
  world.sun.target.position.copy(camTarget);
}

// ---------- Peringatan batas peta ----------
// Deket pinggir: muncul "Batas kawasan" + panah yang nunjuk balik ke tengah hutan.
const edgeEl = document.getElementById('edgeWarn');
const edgeArrow = document.getElementById('edgeArrow');
function updateEdgeWarn() {
  const p = player.pos;
  const d = edgeDistance(p.x, p.z);
  const show = (game.state === 'play' || game.state === 'rain') && d < 6;
  edgeEl.classList.toggle('show', show);
  edgeEl.classList.toggle('hit', show && d < 0.3);
  if (!show) return;
  // arah ke tengah peta, diubah ke arah layar (atas = depan kamera)
  const dx = -p.x, dz = -p.z;
  const fwd = -dx * Math.sin(camYaw) - dz * Math.cos(camYaw);
  const right = dx * Math.cos(camYaw) - dz * Math.sin(camYaw);
  edgeArrow.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
}

// ---------- Hujan ----------
const RAIN_N = 1800;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({ color: 0xbfd4e0, transparent: true, opacity: 0, depthWrite: false })
);
rain.frustumCulled = false;
scene.add(rain);
for (let i = 0; i < RAIN_N; i++) resetDrop(i, true);
function resetDrop(i, anyY) {
  const x = camera.position.x + (Math.random() - 0.5) * 60;
  const z = camera.position.z + (Math.random() - 0.5) * 60;
  const y = camera.position.y + (anyY ? Math.random() * 30 - 8 : 22);
  rainPos.set([x, y, z, x + 0.1, y - 0.9, z], i * 6);
}
function updateRain(dt, amount) {
  rain.material.opacity = amount * 0.55;
  if (amount <= 0) return;
  for (let i = 0; i < RAIN_N; i++) {
    const k = i * 6;
    rainPos[k + 1] -= 32 * dt;
    rainPos[k + 4] -= 32 * dt;
    if (rainPos[k + 4] < camera.position.y - 10) resetDrop(i, false);
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ---------- Alur permainan ----------
const game = {
  state: 'menu', // menu | intro | play | rain | result | end
  elapsed: 0,
  nextIgnite: LEVEL.phases[0].ignite.first,
  phaseIdx: 0,
  saved: 0,
  evidence: [],
  paused: false,
  integrity: 0, // naik kalau nolak titipan, turun kalau nerima
  choices: [],
  citra: 0, // detik nyiram di depan kamera drone
  spawns: LEVEL.spawns.map((s) => ({ ...s })), // salinan: pelaku yang lolos ditambah lagi ke sini
  spawnIdx: 0,
  tips: LEVEL.tips,
  tipIdx: 0,
  rain: 0,
  rainT: 0,
  satire: LEVEL.quotes,
  satireIdx: 0,
  win: false,
  shouts: 0,
  smokeLevel: 0,
  bossSealed: false,
  missionDone: {}, // langkah checklist yang udah beres
  bossSpawned: false,
};

function forestRatio() {
  let alive = 0;
  for (const t of world.tiles) if (t.burnable && t.state !== STATE.BURNT) alive++;
  return alive / world.forestTotal;
}

function igniteRandom(minDist) {
  const candidates = [];
  for (const t of world.tiles) {
    if (!t.burnable || t.state !== STATE.FOREST) continue;
    if (Math.hypot(t.cx - player.pos.x, t.cz - player.pos.z) <= minDist) continue;
    candidates.push(t);
    if (phaseAt(game.elapsed).preferPeat && t.type === TYPE.PEAT) candidates.push(t, t); // gambut 3x lebih sering
  }
  if (!candidates.length) return false;
  const t = candidates[Math.floor(Math.random() * candidates.length)];
  if (fire.ignite(t, 0.2)) { birds.scare(t.cx, t.cz); return true; }
  return false;
}

const $ = (id) => document.getElementById(id);
// Tombol mulai baru aktif setelah model presiden siap, biar pemain gak masuk ke game
// yang tokoh utamanya belum kelihatan (kejadian di koneksi lambat).
let heroLoaded = false;
{
  const btn = $('startBtn');
  const label = btn.textContent;
  btn.disabled = true;
  const tick = setInterval(() => {
    btn.textContent = `Memuat… ${Math.min(99, Math.round(loadProgress('presiden') * 100))}%`;
  }, 150);
  player.ready.then(() => {
    clearInterval(tick);
    heroLoaded = true;
    btn.disabled = false;
    btn.textContent = label;
  });
}
// Menu utama → layar pembuka misi
function startGame() {
  if (game.state !== 'menu' || !heroLoaded) return;
  $('menu').classList.add('hidden');
  showIntro();
}
$('startBtn').addEventListener('click', startGame);
// Setelan grafis: ganti lalu muat ulang (jumlah tanaman ditentukan saat dunia dibuat)
$('gfxBtn').textContent = `⚙️ Grafis: ${GFX === 'rendah' ? 'Rendah' : 'Tinggi'}`;
$('gfxBtn').addEventListener('click', () => {
  try { localStorage.setItem('ht-gfx', GFX === 'rendah' ? 'tinggi' : 'rendah'); } catch { /* gak bisa simpan: abaikan */ }
  location.reload();
});
// Panel cek controller (diagnosa tombol & D-pad)
$('padTestBtn').addEventListener('click', () => { if (game.state === 'menu') { game.state = 'padtest'; $('menu').classList.add('hidden'); $('padtest').classList.remove('hidden'); } });
$('padTestClose').addEventListener('click', closePadTest);
function closePadTest() {
  game.state = 'menu';
  $('padtest').classList.add('hidden');
  $('menu').classList.remove('hidden');
}
function updatePadTest() {
  const d = input.debug;
  if (!d) return;
  $('padInfo').textContent = `Kebaca: ${input.padType === 'playstation' ? 'PlayStation' : 'Xbox / generik'}`;
  for (const [k, id] of [['up', 'dU'], ['down', 'dD'], ['left', 'dL'], ['right', 'dR']]) $(id).classList.toggle('on', !!d.dirs[k]);
  $('padRaw').textContent = `${d.id} · mapping: ${d.mapping} · tombol ditekan: [${d.pressed.join(', ')}] · axis: [${d.axes.join(', ')}]`;
}
$('againBtn').addEventListener('click', () => { location.href = location.pathname; });

// Layar pembuka level: kutipan pejabat + briefing singkat
function fillTemplate(text) {
  return text.replace(/\{(\w+)\}/g, (_, k) => input.label(k));
}
function showIntro() {
  game.state = 'intro';
  $('introKicker').textContent = LEVEL.kicker;
  $('introTitle').textContent = LEVEL.name;
  $('introQuote').textContent = LEVEL.intro.quote;
  $('introWho').textContent = `— ${LEVEL.intro.who}`;
  $('introBrief').innerHTML = LEVEL.intro.brief.map((b) => `<li>${fillTemplate(b)}</li>`).join('');
  $('introCarry').textContent = '';
  $('introHint').textContent = `Tekan ${input.label('confirm')} buat mulai`;
  $('intro').classList.remove('hidden');
}
function beginLevel() {
  if (game.state !== 'intro') return;
  sfx.unlock();
  setTimeout(() => {
    if (!sfx.ready) hud.toast('🔇 Suara mati? Klik layar sekali.', '', 5000);
  }, 1500);
  $('intro').classList.add('hidden');
  hud.show(true);
  game.state = 'play';
  // Api pertama sengaja muncul dekat jalur biar pemain langsung punya tujuan
  fire.ignite(world.nearestBurnable(...LEVEL.firstFire), 0.35);
  hud.toast(`🔥 Ada api! Ikuti penanda, tahan ${input.label('spray')} buat siram.`, '', 5000);
  showPhase(phaseAt(0));
}

// Banner pergantian babak
function showPhase(ph) {
  const el = $('phaseBanner');
  el.innerHTML = `<small>BABAK ${ph.idx + 1}</small>${ph.name}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (ph.quote) setTimeout(() => { hud.toast(ph.quote, 'satire', 4500); sfx.dingdong(); }, 1500);
}
$('introBtn').addEventListener('click', beginLevel);
$('resultNext').addEventListener('click', () => resultChoice(true));
$('resultRetry').addEventListener('click', () => resultChoice(false));
function resultChoice() {
  if (game.state !== 'result') return;
  location.reload();
}

function sprayFire(dt) {
  if (!player.spraying) return;
  const fw = player.forward().clone();
  const reach = 9;
  for (const t of world.tiles) {
    if (t.state !== STATE.BURNING) continue;
    const dx = t.cx - player.pos.x, dz = t.cz - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 2) continue;
    const facingDot = d < 2.5 ? 1 : (dx * fw.x + dz * fw.z) / d;
    if (facingDot < 0.75) continue;
    if (fire.water(t, dt * 1.3 * (1.15 - d / (reach + 4)))) {
      game.saved++;
      const stillBurning = [...fire.burning].some((b) => Math.hypot(b.cx - t.cx, b.cz - t.cz) < 12);
      if (!stillBurning) satire.onAreaClear(t.cx, t.cz);
      if (game.saved === 1) hud.toast(`✅ Padam! Tekan ${input.label('map')} buat buka peta.`, 'good', 4000);
    }
  }
  enemies.sprayHit(player.pos, fw, reach, dt);
}

// Checklist misi: 4 langkah, ditampilkan di panel kiri atas
// Kapan Mega Bulldozer datang (buat teks checklist)
function bossEta() {
  const sp = game.spawns.find((s, i) => i >= game.spawnIdx && s.kind === 'boss');
  if (!sp) return 'belum muncul';
  const secs = Math.max(0, Math.ceil(sp.at - game.elapsed));
  return secs <= 60 ? `datang ${secs} dtk` : `datang ±${Math.round(secs / 60)} mnt`;
}
function missionSteps(days) {
  const n = game.evidence.length, revoked = dozers.permitRevoked;
  const boss = dozers.list.find((d) => d.boss);
  return [
    { id: 'catch', text: `Tangkap 3 pelaku (${Math.min(n, EVIDENCE_NEEDED)}/${EVIDENCE_NEEDED})`, done: n >= EVIDENCE_NEEDED || revoked },
    { id: 'court', text: 'Serahkan bukti ke Pengadilan', done: revoked, next: '⚖️ Bawa 3 bukti ke Pengadilan (selatan posko).' },
    { id: 'boss', text: game.bossSealed ? 'Segel Mega Bulldozer' : !boss ? `Segel Mega Bulldozer (${bossEta()})` : revoked ? 'Segel Mega Bulldozer!' : 'Segel Mega Bulldozer (cabut izin dulu)',
      sub: !boss && !game.bossSealed ? 'Sambil nunggu: tangkap pelaku 🐀' : '',
      done: game.bossSealed,
      next: boss ? `🚜👑 Segel Mega Bulldozer! Tahan ${input.label('action')} di dekatnya.`
        : revoked ? `🚜👑 Perusahaan gak terima putusan. Mega Bulldozer datang ±${BOSS_AFTER_VERDICT} dtk lagi.`
        : '🚜👑 Tunggu Mega Bulldozer, lalu segel.' },
    { id: 'rain', text: `Bertahan sampai hujan · ${days} hari`, sub: 'Hutan 40% menang · 50% ending terbaik 🏆', done: game.state === 'rain' || game.state === 'result' || game.state === 'ending',
      next: game.bossSealed ? '🌧️ Bulldozer udah berhenti datang. Tinggal jaga hutan sampai hujan.' : '🌧️ Tinggal satu lagi: jaga hutan di atas 40% sampai hujan.' },
  ];
}
function updateMission(days) {
  const steps = missionSteps(days);
  const now = steps.findIndex((s) => !s.done);
  // langkah baru beres: kasih tahu langkah berikutnya
  for (const s of steps) {
    if (!s.done || game.missionDone[s.id]) continue;
    game.missionDone[s.id] = true;
    hud.flashMission();
    const nx = steps[now];
    if (s.id !== 'catch' && nx && nx.next) setTimeout(() => hud.toast(`✅ Beres! Berikutnya: ${nx.next.replace(/^\S+ /, '')}`, 'warn', 6000), 1800);
  }
  hud.setMission('<div class="label">Misi</div>' + steps.map((s, i) => {
    const cls = s.done ? 'done' : i === now ? 'now' : '';
    const ck = s.done ? '✓' : i === now ? '▶' : '○';
    const sub = s.sub && !s.done && (i === now || s.id === 'rain') ? `<small>${s.sub}</small>` : '';
    return `<div class="step ${cls}"><span class="ck">${ck}</span><span>${s.text}${sub}</span></div>`;
  }).join(''));
}

const MAX_ACTIVE = 7; // pelaku manusia yang boleh di peta bareng
const KIND_NAME = { arsonist: 'Pembakar', logger: 'Penebang', dozer: 'Bulldozer', boss: 'MEGA BULLDOZER' };
const entryOf = (w) => (w.kind === 'dozer' || w.kind === 'boss' ? DOZER_ENTRIES : ENEMY_ENTRIES)[w.entry ?? 0];

// Pesan dari pelaku (dibakar, kabur, ditangkap, bukti)
function handleEnemyEvents() {
  for (const ev of enemies.events) {
    const who = ev.enemy && ev.enemy.kind === 'logger' ? 'Penebang' : 'Pembakar';
    switch (ev.type) {
      case 'spawn':
        if (ev.first) hud.toast(`⚠️ ${who} datang! Tekan ${input.label('blitz')} buat lempar jaring.`, '', 4500);
        break;
      case 'flee': if (ev.enemy.state === 'alert') hud.toast(`❗ ${who} kabur! Jaring sekarang!`); break;
      case 'done': hud.toast(`💸 ${who} beres bakar, pulang terima bayaran.`, 'satire', 3500); break;
      case 'fizzle': if (!game.fizzled) { game.fizzled = true; hud.toast('🚧 Gambutnya basah, pembakar gagal nyalain!', 'good', 3500); } break;
      case 'stunned': if (ev.first) hud.toast(`💦 ${who} jatuh! Tekan ${input.label('action')}.`, 'good'); break;
      case 'arrested': {
        sfx.cuffs();
        hitStop(0.09);
        shake(0.7);
        combo.n = combo.t > 0 ? combo.n + 1 : 1;
        combo.t = 14;
        combo.best = Math.max(combo.best, combo.n);
        if (combo.n >= 2) {
          pop(`COMBO x${combo.n}!`, combo.n >= 3 ? '🔥 Tikusnya panik!' : '+ lari kencang 2 dtk', 'combo');
          sfx.combo(combo.n);
          player.boostT = Math.max(player.boostT || 0, 2); // hadiah combo: ngebut sebentar
        } else pop(ev.enemy.how === 'jaring' ? '🕸️ KEJARING!' : '🔗 DIBORGOL!');
        break;
      }
      case 'evidence': {
        game.evidence.push(ev.name);
        sfx.chime();
        const n = game.evidence.length;
        if (n === EVIDENCE_NEEDED && !dozers.permitRevoked) hud.toast(`⚖️ Bukti cukup (${n}/${EVIDENCE_NEEDED})! Bawa ke Pengadilan, selatan posko.`, 'warn', 6000);
        else if (n < EVIDENCE_NEEDED) hud.toast(`📁 Bukti ${n}/${EVIDENCE_NEEDED}: ${ev.name}`, 'satire', 4000);
        break;
      }
      case 'escaped': {
        if (ev.enemy.done) break; // udah beres tugas, gak balik
        // kabur karena ketahuan = balik lagi nanti dari arah lain
        game.spawns.push({ at: game.elapsed + 25, kind: ev.enemy.kind, entry: Math.floor(Math.random() * ENEMY_ENTRIES.length) });
        game.spawns.sort((a, b) => a.at - b.at);
        hud.toast(`😤 ${who} lolos… bakal balik lagi.`);
        break;
      }
      case 'ignite': birds.scare(ev.enemy.pos.x, ev.enemy.pos.z, ev.enemy.pos.y); if (ev.enemy.acts === 0) hud.toast(`🔥 ${who} mulai bakar! Ikuti penanda 🐀.`, 'warn', 4000); break;
      case 'logged': break;
      case 'nasi': {
        sfx.munch();
        const resp = ['Sudah dievaluasi.', 'Kasusnya sedikit.', 'Itu oknum dapur.'][Math.floor(Math.random() * 3)];
        sfx.alarm();
        hud.toast(`💫 ${who} pusing abis makan MBG! Datang & jaring.`, 'good', 4500);
        if (Math.random() < 0.5) setTimeout(() => hud.toast(`🎙️ Pejabat: "${resp}"`, 'satire', 3000), 1800);
        break;
      }
    }
  }
  enemies.events.length = 0;
}

function handleTruckEvents() {
  for (const ev of truck.events) {
    switch (ev.type) {
      case 'dispatched':
        sfx.horn(); sfx.radio();
        hud.toast(`🚒 Damkar OTW! Tiba ±${Math.ceil(truck.eta)} dtk.${ev.far ? ' Apinya jauh dari jalan.' : ''}`, 'good', 3500);
        break;
      case 'stuck': sfx.error(); hud.toast('🚒 Damkar nyangkut. Dana jalannya kepake buat baliho.', 'satire', 4500); break;
      case 'unstuck': hud.toast('🚒 Damkar jalan lagi.', '', 2500); break;
      case 'arrived': sfx.horn(); hud.toast('🚒 Damkar tiba, nyemprot!', 'good', 2500); break;
      case 'done':
        game.saved += ev.saved;
        hud.toast(`🚒 ${ev.saved} petak padam. Damkar pulang isi air.`, 'good', 3500);
        break;
      case 'back': hud.toast('🚒 Damkar siap lagi.', '', 2500); break;
    }
  }
  truck.events.length = 0;
}

function handleHeliEvents() {
  for (const ev of heli.events) {
    switch (ev.type) {
      case 'dispatched':
        sfx.radio();
        hud.toast(`🚁 Heli OTW! Tiba ±${Math.ceil(heli.eta)} dtk.`, 'good', 3500);
        break;
      case 'recharged': sfx.chime(); hud.toast(`🚁 Jatah heli +1 (${ev.uses}×).`, 'good', 2500); break;
      case 'impact': sfx.splash(); break; // bunyi pas air nyentuh tanah
      case 'dropped':
        game.saved += ev.saved;
        hud.toast(`🚁 BYURR! ${ev.saved} petak padam. Kru sibuk foto udara.`, 'good', 3500);
        break;
    }
  }
  heli.events.length = 0;
}

// Serahkan bukti di pengadilan
const BOSS_AFTER_VERDICT = 40; // detik dari putusan sampai Mega Bulldozer datang
// Batalkan 1 dari tiap `every` kiriman pelaku berikutnya (bulldozer & boss gak ikut)
function thinSpawns(every) {
  let k = 0;
  game.spawns = game.spawns.filter((sp, i) => i < game.spawnIdx || sp.kind === 'boss' || sp.kind === 'dozer' || (k++ % every) !== every - 1);
}

function submitEvidence() {
  if (!LEVEL.court) { hud.toast('⚖️ Sidang belum dibuka.', 'satire', 3000); return; }
  if (dozers.permitRevoked) { hud.toast('⚖️ Izin udah dicabut. Perusahaan ajukan PK. (Tentu.)', 'satire', 3500); return; }
  const n = game.evidence.length;
  if (n < EVIDENCE_NEEDED) {
    hud.toast(`⚖️ Bukti kurang (${n}/${EVIDENCE_NEEDED}). Sidang ditunda.`, '', 3500);
    sfx.gavel();
    return;
  }
  dozers.revokePermits();
  game.permitRevoked = true;
  sfx.gavel();
  satire.flash(0.5);
  // perusahaan kehilangan izin: kiriman pelaku berikutnya berkurang (1 dari 3 batal)
  thinSpawns(3);
  // perusahaan gak terima putusan: Mega Bulldozer dikirim lebih cepat
  const boss = game.spawns.find((sp, i) => i >= game.spawnIdx && sp.kind === 'boss');
  if (boss && boss.at > game.elapsed + BOSS_AFTER_VERDICT) {
    boss.at = game.elapsed + BOSS_AFTER_VERDICT;
    boss.warned = false;
    game.spawns.sort((a, b) => a.at - b.at);
  }
  slowMo(1.4, 0.25);
  shake(1);
  pop('⚖️ PALU DIKETUK!', 'Izin PT Lahan Siap Tanam Kilat dicabut', 'big');
  hud.toast('⚖️ Izin dicabut. Kiriman pelaku berkurang!', 'good', 5000);
}

function handleDozerEvents() {
  const a = input.label('action');
  for (const ev of dozers.events) {
    const d = ev.dozer;
    switch (ev.type) {
      case 'spawn':
        hud.toast(d.boss
          ? `🚜👑 MEGA BULLDOZER datang! ${dozers.permitRevoked ? `Tahan ${a} buat segel!` : 'Kebal sampai izinnya dicabut.'}`
          : d.golden
          ? '🚜✨ Bulldozer IZIN RESMI datang. Kebal segel.'
          : `🚜 Bulldozer datang! Tahan ${a} buat segel.`, '', 4500);
        break;
      case 'sealed':
        sfx.stamp();
        satire.note('regulasi');
        if (d.boss) {
          game.bossSealed = true;
          // hadiah: bulldozer biasa berhenti datang, pelaku berkurang lagi
          game.spawns = game.spawns.filter((sp, i) => i < game.spawnIdx || sp.kind !== 'dozer');
          thinSpawns(3);
          slowMo(1.6, 0.22);
          shake(1.2);
          pop('🛑 MEGA BULLDOZER DISEGEL!', 'Direksinya "berobat ke luar negeri"', 'big');
        }
        else { hitStop(0.12); shake(0.8); pop('🛑 DISEGEL!', 'Operatornya telepon "atasan"'); }
        break;
      case 'immune': sfx.error(); hud.toast(LEVEL.court
        ? `🤷 "Izinnya lengkap, Pak." Butuh ${EVIDENCE_NEEDED} bukti (punya ${game.evidence.length}).`
        : '🤷 "Izinnya lengkap, Pak. Bapak yang tanda tangan."', 'satire', 4000); break;
      case 'quota': hud.toast('🚜 "Kuota 40 hektar tercapai, Pak." Berhenti… sementara.', 'satire', 4000); break;
    }
  }
  dozers.events.length = 0;
}

// Sekat kanal
const DAM_LINES = [
  'Sekat kanal itu murah dan ampuh. Sayang gak ada pita buat digunting.',
  'Kata Pejabat: "Sekat kanal masih tahap kajian." (Kajiannya juga lagi dikaji.)',
  'Gambut basah susah dibakar. Investor kecewa.',
];
function handleDamEvents() {
  for (const ev of dams.events) {
    if (ev.type !== 'built') continue;
    const n = dams.builtCount;
    sfx.stamp();
    hitStop(0.1);
    shake(0.6);
    pop('🚧 KANAL DISEKAT!', n === dams.list.length ? 'Semua kanal beres. Gambut barat basah!' : `Gambut basah lagi · ${n}/${dams.list.length}`);
    setTimeout(() => { hud.toast(DAM_LINES[(n - 1) % DAM_LINES.length], 'satire', 4500); sfx.dingdong(); }, 1400);
  }
  dams.events.length = 0;
}

// Relawan warga
const MPA_LINES = [
  'Warga udah duluan pakai ember. Satgas masih apel.',
  'Relawan gak dibayar. Baliho satgas dibayar.',
  'Kata Pejabat: "Partisipasi masyarakat luar biasa." (Ember beli sendiri.)',
];
let mpaCount = 0;
function handleVolunteerEvents() {
  for (const ev of volunteers.events) {
    if (ev.type === 'arrive') {
      const dist = Math.round(Math.hypot(ev.x - player.pos.x, ev.z - player.pos.z));
      hud.toast(`🧑‍🤝‍🧑 Relawan warga bawa ember ke api ${dist} m dari sini.`, 'good', 4500);
      const line = MPA_LINES[mpaCount++ % MPA_LINES.length];
      setTimeout(() => hud.toast(line, 'satire', 4500), 2500);
    } else if (ev.type === 'leave' && ev.reason !== 'rain') {
      hud.toast(ev.saved > 0 ? `🧑‍🤝‍🧑 Relawan padamin ${ev.saved} api. Pulang tanpa liputan.` : '🧑‍🤝‍🧑 Relawan pulang. Besok kerja.', 'satire', 4000);
    }
  }
  volunteers.events.length = 0;
}

// Tombol aksi: borgol > segel (tahan) > naik/turun motor
function handleActions() {
  if (input.justPressed('map')) { guide.openMap(player); game.paused = true; return; }
  if (input.justPressed('action')) {
    if (bike.rider) { bike.dismount(player, world); }
    else {
      const e = enemies.arrestable(player.pos);
      if (e) enemies.arrest(e);
      else if (dozers.nearest(player.pos)) { /* segel: ditahan, diurus Dozers */ }
      else if (dams.nearest(player.pos)) { /* sekat kanal: ditahan, diurus Dams */ }
      else if (court.near(player.pos)) submitEvidence();
      else if (wahana.use(player.pos)) { /* gunting pita */ }
      else if (bike.near(player.pos)) bike.mount();
    }
  }
  if (input.justPressed('blitz') && !bike.rider) gadgets.use();
  if (input.justPressed('gadgetPrev')) gadgets.cycle(-1);
  if (input.justPressed('gadgetNext')) gadgets.cycle(1);
  if (input.justPressed('shout')) satire.shout();
  if (input.justPressed('callBike') && !bike.rider) {
    if (bike.callTo(player, world)) hud.toast('🏍️ Motor datang.', '', 2000);
  }
}

function updatePrompt() {
  if (game.state !== 'play' && game.state !== 'rain') return hud.setPrompt(null);
  const a = input.label('action');
  if (bike.rider) return hud.setPrompt(a, `Turun dari motor · ${input.label('brake')} tahan = mundur`);
  if (enemies.arrestable(player.pos)) return hud.setPrompt(a, 'Borgol');
  const d = dozers.nearest(player.pos);
  if (d) return hud.setPrompt(a, dozers.isImmune(d) ? 'Kebal segel (Izin Resmi)' : d.seal > 0 ? `Menyegel… ${Math.round(d.seal * 100)}%` : 'Tahan buat SEGEL');
  const dm = dams.nearest(player.pos);
  if (dm) return hud.setPrompt(a, dm.prog > 0 ? `Menyekat kanal… ${Math.round(dm.prog * 100)}%` : 'Tahan buat SEKAT KANAL');
  if (court.near(player.pos)) {
    if (dozers.permitRevoked) return hud.setPrompt(a, 'Izin udah dicabut');
    return hud.setPrompt(a, `Serahkan bukti (${game.evidence.length}/${EVIDENCE_NEEDED})`);
  }
  const wp = wahana.prompt(player.pos);
  if (wp) return hud.setPrompt(a, wp);
  if (bike.near(player.pos)) return hud.setPrompt(a, 'Naik motor');
  hud.setPrompt(null);
}

let endShown = false;
// Rapor Presiden: kartu ringkas bergelar satir, enak di-screenshot
function renderRapor(el, win) {
  const ratio = forestRatio();
  const taken = game.choices.filter((c) => c.accept).length;
  const R = raporTitle({ win, ratio, caught: enemies.stats.caught, taken, citra: game.citra, boss: game.bossSealed, shouts: game.shouts, ceremonies: game.ceremonies || 0, laps: game.laps || 0 });
  const stars = win ? starsFor(ratio) : 0;
  const stat = (ic, v, l) => `<div class="rs"><span>${ic}</span><b>${v}</b><small>${l}</small></div>`;
  el.innerHTML = `
    <div class="rp-head">RAPOR PRESIDEN · HUTAN TERAKHIR</div>
    <div class="rp-emoji">${R.e}</div>
    <div class="rp-title">${R.t}</div>
    <div class="rp-desc">${R.d}</div>
    <div class="rp-stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>
    <div class="rp-grid">
      ${stat('🌳', `${Math.round(ratio * 100)}%`, 'hutan tersisa')}
      ${stat('🐀', enemies.stats.caught, 'tikus ditangkap')}
      ${stat('🔥', game.saved, 'api dipadamkan')}
      ${stat('⚡', combo.best >= 2 ? `x${combo.best}` : '–', 'combo terbaik')}
      ${stat('📞', `${game.choices.length - taken}/${game.choices.length}`, 'titipan ditolak')}
      ${stat(game.bossSealed ? '🛑' : '🚜', game.bossSealed ? 'Disegel' : 'Lolos', 'Mega Bulldozer')}
    </div>
    <div class="rp-foot">Kalimantan · Musim Kemarau · #HutanTerakhir</div>`;
}

function endGame(win) {
  game.state = 'result';
  game.win = win;
  win ? sfx.win() : sfx.lose();
  const ratio = forestRatio();
  const taken = game.choices.filter((c) => c.accept).length;

  // Menang: adegan ending, lalu layar akhir + fakta
  if (win) {
    const id = decideEnding({ taken, boss: game.bossSealed, ratio, citra: game.citra });
    playEnding(id, ratio, taken);
    return;
  }

  // Kalah: hutan di bawah 40% → sawit langsung tumbuh di mana-mana, baru layar kalah
  game.state = 'losing';
  hud.show(false);
  game.endingSmoke = 0.08; // asap ditipisin biar barisan sawit kelihatan
  game.cine = { focus: new THREE.Vector3(-10, 0, 0), radius: 50, height: 42, speed: 0.08, angle: camYaw, update: sawitTakeover({ scene, world, fire }) };
  const cap = $('caption');
  const say = (t, at) => setTimeout(() => { cap.textContent = t; cap.classList.remove('hidden'); cap.style.animation = 'none'; void cap.offsetWidth; cap.style.animation = ''; }, at);
  say('🌴 Belum dingin abunya…', 600);
  say('…bibit sawit udah ditanam.', 2800);
  say('Izin "pemulihan lahan" keluar dalam sehari.', 5000);
  setTimeout(() => sfx.applause(3), 4800);
  setTimeout(() => { cap.classList.add('hidden'); game.state = 'result'; showLose(); }, 7500);
}

function showLose() {
  $('resultKicker').textContent = `Kebakaran gak terkendali · ${phaseAt(game.elapsed).name}`;
  $('resultTitle').textContent = 'Lahan Siap Tanam';
  $('resultStars').innerHTML = '';
  $('resultText').textContent = 'Belum dingin abunya, sawit udah ditanam.';
  $('resultStats').textContent = `Bertahan ${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')} · ${game.saved} api padam · ${enemies.stats.caught} pelaku ditangkap`;
  renderRapor($('resultRapor'), false);
  $('resultRapor').classList.remove('hidden');
  $('resultNext').classList.add('hidden');
  $('resultRetry').className = '';
  $('resultRetry').textContent = 'Coba lagi';
  $('resultHint').textContent = `${input.label('confirm')} coba lagi`;
  $('result').classList.remove('hidden');
  endShown = true;
}

// Adegan ending: kamera sinematik ±7 detik, lalu layar akhir
function playEnding(id, ratio, taken) {
  game.state = 'ending';
  game.ending = id;
  hud.show(false);
  const cine = stageEnding(id, { scene, world, fire, player, game });
  if (id === 'pencitraan') { sfx.applause(6); for (let i = 0; i < 8; i++) setTimeout(() => sfx.shutter(), 400 + Math.random() * 5000); }
  else if (id === 'sawit') sfx.applause(2.5);
  else sfx.chime();
  game.cine = { ...cine, angle: cine.angle ?? camYaw };
  const E = ENDINGS[id];
  const stars = starsFor(ratio);
  $('endKicker').textContent = E.kicker;
  $('endTitle').textContent = E.title;
  $('endText').textContent = E.text;
  $('endScore').textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · Hutan tersisa ${Math.round(ratio * 100)}%`;
  // angka utama udah ada di Rapor; di sini sisanya aja
  const chips = [
    `📁 ${game.evidence.length} bukti`,
    game.permitRevoked ? '⚖️ Izin dicabut' : '⚖️ Izin tetap berlaku',
    `📸 Skor pencitraan ${Math.round(game.citra)}`,
    `📢 ${game.shouts} teriakan`,
  ];
  $('endChoices').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');
  renderRapor($('endRapor'), true);
  $('endFacts').innerHTML = FACTS.map((f) => `<p class="fact">${f.text} <a href="${f.url}" target="_blank" rel="noopener">${f.src} ↗</a></p>`).join('');
  $('endOther').textContent = E.other;
  setTimeout(() => { $('end').classList.remove('hidden'); game.state = 'end'; endShown = true; }, 7000);
}

// Tombol petunjuk TERIAK di pinggir kanan: kedip pas siap, redup + hitung mundur pas jeda
const shoutHintEl = document.getElementById('shoutHint');
function updateShoutHint() {
  const cd = satire.shoutCd || 0;
  $('shoutKey').textContent = input.label('shout');
  shoutHintEl.classList.toggle('cd', cd > 0);
  $('shoutSub').textContent = cd > 0 ? `${Math.ceil(cd)} dtk` : 'biar semangat';
}

function updateGame(dt) {
  if (game.state === 'play') {
    game.elapsed += dt;
    const ph = phaseAt(game.elapsed);
    if (ph.idx !== game.phaseIdx) { game.phaseIdx = ph.idx; showPhase(ph); game.nextIgnite = ph.ignite.every * 0.6; }
    const ig = ph.ignite;

    game.nextIgnite -= dt;
    if (game.nextIgnite <= 0) {
      const count = Math.random() < ig.double ? 2 : 1;
      let lit = 0;
      for (let i = 0; i < count; i++) if (igniteRandom(25)) lit++;
      if (lit) { hud.toast(`🔥 ${lit > 1 ? '2 api baru' : 'Api baru'}! Cek peta.`); sfx.alarm(); }
      game.nextIgnite = ig.every + Math.random() * 4;
    }

    // Peringatan 8 detik sebelum pelaku masuk
    const fresh = [];
    for (let i = game.spawnIdx; i < game.spawns.length; i++) {
      const w = game.spawns[i];
      if (w.warned || w.at - game.elapsed > 8) continue;
      w.warned = true;
      fresh.push(w);
    }
    const bossW = fresh.findIndex((w) => w.kind === 'boss');
    if (bossW >= 0) {
      const w = fresh.splice(bossW, 1)[0];
      hud.toast(`⚠️ MEGA BULLDOZER masuk ${Math.max(1, Math.ceil(w.at - game.elapsed))} dtk lagi dari ${entryOf(w).name}!`, 'warn', 6000);
      sfx.alarm();
    }
    if (fresh.length) {
      const secs = Math.max(1, Math.ceil(fresh[0].at - game.elapsed));
      const dirs = new Set(fresh.map((w) => entryOf(w).name)).size;
      hud.toast(fresh.length === 1
        ? `⚠️ ${KIND_NAME[fresh[0].kind]} masuk ${secs} dtk lagi dari ${entryOf(fresh[0]).name}!`
        : `⚠️ ${fresh.length} pelaku masuk ${secs} dtk lagi${dirs > 1 ? ` dari ${dirs} arah` : ''}!`, 'warn', 5000);
      sfx.alarm();
    }
    guide.incoming = game.spawns.slice(game.spawnIdx)
      .filter((w) => w.warned && w.at > game.elapsed)
      .map((w) => ({ ...entryOf(w), kind: w.kind, label: KIND_NAME[w.kind], eta: w.at - game.elapsed }));

    while (game.spawnIdx < game.spawns.length && game.elapsed >= game.spawns[game.spawnIdx].at) {
      const sp = game.spawns[game.spawnIdx];
      const human = sp.kind === 'arsonist' || sp.kind === 'logger';
      if (human && enemies.active().length >= MAX_ACTIVE) {
        // kepenuhan: tunda sebentar
        sp.at = game.elapsed + 6;
        game.spawns.sort((a, b) => a.at - b.at);
        break;
      }
      if (sp.kind === 'dozer') dozers.spawn(false, sp.entry);
      else if (sp.kind === 'boss') { dozers.spawn(true, sp.entry, true); game.bossSpawned = true; }
      else {
        const e = enemies.spawn(sp.kind, sp.entry);
        if (e) enemies.events.push({ type: 'spawn', enemy: e, first: game.spawnIdx === 0 });
      }
      game.spawnIdx++;
    }
    const tip = game.tips[game.tipIdx];
    if (tip && game.elapsed >= tip.at) {
      hud.toast(tip.text((k) => input.label(k)), 'good', 7000);
      game.tipIdx++;
    }
    fire.spreadMult = ph.spread;

    const s = game.satire[game.satireIdx];
    if (s && game.elapsed >= s.at) {
      hud.toast(s.text, 'satire', 5500);
      sfx.dingdong();
      game.satireIdx++;
    }

    sprayFire(dt);

    if (forestRatio() < LOSE_RATIO) endGame(false);
    else if (game.elapsed >= LEVEL.duration) {
      game.state = 'rain';
      game.rainT = 0;
      for (const e of enemies.active()) enemies.flee(e);
      hud.toast('🌧️ Hujan turun. Yang madamin tetap hujan.', 'good', 4500);
    }
  } else if (game.state === 'rain') {
    game.rainT += dt;
    game.rain = Math.min(1, game.rain + dt * 0.5);
    for (const t of [...fire.burning]) fire.water(t, dt * 0.35);
    sprayFire(dt);
    if (game.rainT > 7) endGame(true);
  }
}

// Booster SEMANGAT: lencana di layar, motor ikut ngebut, debu di kaki
const boostEl = document.getElementById('boost');
const boostBar = document.getElementById('boostBar');
function updateBoost(dt) {
  const on = player.boostT > 0 && (game.state === 'play' || game.state === 'rain');
  boostEl.classList.toggle('hidden', !on);
  bike.boost = on ? 1.25 : 1;
  if (!on) return;
  boostBar.style.width = `${(player.boostT / 3) * 100}%`;
  const p = bike.rider ? bike.pos : player.pos;
  if (Math.random() < dt * 30) {
    fire.smoke.spawn(p.x + (Math.random() - 0.5), groundHeight(p.x, p.z) + 0.3, p.z + (Math.random() - 0.5),
      (Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5, 0.9, 0.6, 2.2, [0.55, 0.48, 0.36], [0.6, 0.55, 0.45], 0.4);
  }
}

// Status bantuan di pojok kanan atas
function supportText() {
  const m = input.label('map'), x = input.label('blitz');
  const T = {
    idle: `<b>Siap</b> · ${m} → ${x}`,
    going: `<b>Menuju lokasi</b> · ±${Math.ceil(truck.eta)} dtk`, stuck: `<b>Nyangkut!</b> · ±${Math.ceil(truck.eta)} dtk`,
    spray: '<b>Menyemprot</b> · bisa dialihkan', returning: '<b>Siap</b> · lagi pulang',
  };
  const lines = [`🚒 Damkar: ${truck.locked ? 'belum tersedia' : T[truck.state]}`];
  if (LEVEL.heli) {
    const st = heli.state === 'inbound' ? `<b>Terbang</b> · ±${Math.ceil(heli.eta)} dtk` : heli.state === 'drop' ? '<b>Menyiram!</b>' : `<b>Siap</b> · ${m} → ${input.label('heli')}`;
    lines.push(`🚁 Helikopter: ${st}`);
  }
  if (volunteers.crew) lines.push(`🧑‍🤝‍🧑 Relawan: <b>nyiram</b> · ${volunteers.active.filter((v) => v.state !== 'home').length} orang`);
  const act = enemies.active()
    .map((e) => ({ e, d: Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) }))
    .sort((a, b) => a.d - b.d);
  for (const { e, d } of act.slice(0, 3)) {
    const what = e.state === 'stunned' ? 'jaring!' : e.state === 'act' ? 'bakar' : e.state === 'flee' || e.state === 'alert' ? 'kabur' : 'jalan';
    lines.push(`🐀 <b>${e.kind === 'logger' ? 'Penebang' : 'Pembakar'}</b> · ${Math.round(d)} m · ${what}`);
  }
  if (act.length > 3) lines.push(`🐀 +${act.length - 3} lagi`);
  const dz = dozers.active().length;
  if (dz) lines.push(`🚜 ${dz} bulldozer`);
  for (const w of guide.incoming) lines.push(`⚠️ ${w.label} masuk ${Math.ceil(w.eta)} dtk`);
  return lines.join('<br>');
}

// Volume suara latar dari keadaan dunia
const near = (p, r) => (p ? Math.max(0, 1 - Math.hypot(p.x - player.pos.x, p.z - player.pos.z) / r) : 0);
function updateAudio(dt) {
  let fireLvl = 0;
  for (const t of fire.burning) {
    const d = Math.hypot(t.cx - player.pos.x, t.cz - player.pos.z);
    if (d < 35) fireLvl += t.heat * (1 - d / 35);
  }
  const dozer = dozers.active().reduce((m, d) => Math.max(m, near(d.pos, 45)), 0);
  sfx.update(dt, {
    life: clamp(forestRatio() * (1 - smoke * 1.2), 0, 1),
    fire: clamp(fireLvl / 3, 0, 1),
    spraying: player.spraying,
    riding: bike.rider,
    bikeSpeed: Math.abs(bike.speed),
    throttle: bike.rider ? Math.max(input.move.y, input.rt || 0, 0) : 0,
    rain: game.rain,
    siren: truck.state === 'going' || truck.state === 'returning' ? Math.max(0.25, near(truck.pos, 90)) : 0,
    heli: heli.state === 'idle' ? 0 : Math.max(0.12, near(heli.pos, 170)), // kedengeran dari jauh, makin kencang makin dekat
    dozer,
    drone: satire.drone ? near(satire.drone.group.position, 30) : 0,
  });
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let smoke = 0;
function frame() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  // freeze sesaat / slow-mo cuma memperlambat dunia, bukan input
  let dt = rawDt;
  if (fx.stop > 0) { fx.stop -= rawDt; dt = rawDt * 0.03; }
  else if (fx.slow > 0) { fx.slow -= rawDt; dt = rawDt * fx.slowScale; }
  fx.shake = Math.max(0, fx.shake - rawDt * 2.2);
  autoResolution(rawDt);
  if (combo.t > 0) { combo.t -= dt; if (combo.t <= 0) combo.n = 0; }
  const time = clock.elapsedTime;

  input.poll(rawDt);
  birds.update(dt, time);
  updateEdgeWarn();
  if (input.pressed.size) sfx.unlock();
  if (game.state === 'padtest') { updatePadTest(); if (input.justPressed('back')) closePadTest(); }
  else if (game.state === 'menu' && input.justPressed('confirm')) startGame();
  else if (game.state === 'intro' && input.justPressed('confirm')) beginLevel();
  else if (game.state === 'result' && endShown) {
    if (input.justPressed('confirm') || input.justPressed('back')) resultChoice();
  } else if (game.state === 'end' && endShown && input.justPressed('confirm')) { location.href = location.pathname; }

  const playing = game.state === 'play' || game.state === 'rain';
  if (game.paused) {
    // Peta Titik Panas terbuka: dunia berhenti
    if (guide.updateMap(time, player)) game.paused = false;
  } else if (satire.phoneOpen) {
    // Telepon titipan: dunia berhenti sampai pemain memilih
    satire.updatePhone();
  } else {
    if (playing) handleActions();
    if (bike.rider) {
      bike.update(dt, input, world);
      player.rideOn(bike, dt);
    } else {
      player.update(dt, playing ? input : IDLE, camYaw, world);
      bike.update(dt, IDLE, world);
      player.fromBike = playing && bike.giveWater(player, dt);
    }
    updateGame(dt);
    if (playing || ['result', 'ending', 'end', 'losing'].includes(game.state)) {
      fire.update(dt, player.pos);
      enemies.update(dt, player, bike);
      handleEnemyEvents();
      dozers.update(dt, player, input.actionHeld, bike.rider);
      dozers.push(player.pos);
      dozers.push(bike.pos, 1);
      handleDozerEvents();
      dams.update(dt, player, playing && input.actionHeld, bike.rider);
      handleDamEvents();
      volunteers.update(dt, game.elapsed, player, game.state === 'play');
      handleVolunteerEvents();
      truck.update(dt, time);
      handleTruckEvents();
      heli.update(dt);
      handleHeliEvents();
      gadgets.update(dt);
      wahana.update(dt, game.state === 'play' || game.state === 'rain');
      kopdes.update(dt, player, game.state === 'play');
      if (game.state === 'play') satire.update(dt, game.elapsed, time);
    }
  }
  updatePrompt();
  satire.updateBubble(dt, camera, player);
  updateZones(time);
  updateBoost(dt);
  if (playing) hud.setGadget(gadgets.label((k) => input.label(k)));
  updateShoutHint();
  if (playing) hud.setSupport(supportText());

  const burningHeat = [...fire.burning].reduce((a, t) => a + t.heat, 0);
  const targetSmoke = game.endingSmoke !== undefined ? game.endingSmoke
    : clamp(phaseAt(game.elapsed).smokeBase + burningHeat / 14 + (1 - forestRatio()) * 0.8, 0, 1) * (1 - game.rain);
  smoke += (targetSmoke - smoke) * (1 - Math.exp(-dt * 0.8));
  game.smokeLevel = smoke;
  updateAudio(dt);
  world.updateAtmosphere(dt, time, smoke, game.rain);
  // grading ikut suasana: asap = hangat-oranye & agak pudar, hujan = dingin & kalem
  {
    const u = grade.uniforms, rn = game.rain;
    u.uSat.value = 1.12 - smoke * 0.12 - rn * 0.25;
    u.uContrast.value = 1.08 - rn * 0.06;
    u.uTint.value.set(1.02 + smoke * 0.06 - rn * 0.04, 1.0 - smoke * 0.02, 0.96 - smoke * 0.1 + rn * 0.05);
    u.uVignette.value = 0.32 + smoke * 0.15;
  }
  if (['ending', 'losing'].includes(game.state) || (['end', 'result'].includes(game.state) && game.cine)) game.rain = Math.max(0, game.rain - dt * 0.4);
  updateRain(dt, game.rain);
  if (game.cine) {
    const c = game.cine;
    if (c.update) c.update(dt);
    c.angle += dt * c.speed;
    camera.position.set(c.focus.x + Math.sin(c.angle) * c.radius, c.focus.y + c.height, c.focus.z + Math.cos(c.angle) * c.radius);
    camera.lookAt(c.focus);
    world.setViewLine(camera.position, c.focus);
    world.sky.position.copy(camera.position);
    world.sun.position.copy(c.focus).addScaledVector(world.skyUniforms.sunDir.value, 70);
    world.sun.target.position.copy(c.focus);
    if (c.flashes && game.state === 'ending' && Math.random() < dt * 2.5) satire.flash(0.25); // jepretan wartawan
  } else updateCamera(dt);

  if (['menu', 'intro', 'padtest'].includes(game.state)) camYaw += dt * 0.05; // kamera muter pelan di menu

  const left = Math.max(0, LEVEL.duration - game.elapsed);
  hud.update({
    forestRatio: forestRatio(),
    fires: fire.burning.size,
    saved: game.saved,
    days: Math.ceil((left / LEVEL.duration) * LEVEL.days),
    water: Math.round((player.water / player.tankMax) * 100),
    inWater: player.inWater,
    reserve: bike.rider || bike.near(player.pos, 6) ? Math.round((bike.reserve / bike.reserveMax) * 100) : null,
    fromBike: !!player.fromBike,
  });
  updateMission(Math.ceil((left / LEVEL.duration) * LEVEL.days));
  if (playing) {
    guide.update(dt, player, camYaw, bike.rider);
    hud.drawMinimap(dt, world, player, camYaw, { enemies: enemies.active(), bike, dozers: dozers.active(), truck, heli, incoming: guide.incoming, dams: dams.remaining(), volunteers: volunteers.active, kopdes: kopdes.pos });
  }

  composer.render();
  if (wahana.snapPending) wahana.takeSnap(renderer.domElement); // foto dokumentasi peresmian
  requestAnimationFrame(frame);
}
frame();

// Buat debug di console: window.game
window.game = {
  game, world, fire, player, bike, enemies, birds, renderer, composer, guide, input, dozers, satire, truck, LEVEL, endGame, heli, court, playEnding, sfx, gadgets, dams, volunteers, wahana, kopdes,
  cam: (yaw, pitch) => { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; },
  camInfo: () => ({ yaw: camYaw, pitch: camPitch }),
};
