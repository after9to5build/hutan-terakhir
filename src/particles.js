import * as THREE from 'three';

// Tekstur lembut buat partikel (api, asap, air), digambar di canvas biar gak perlu file gambar.
// Atlas 2x2 lidah api: 4 bentuk beda biar apinya gak kelihatan kayak bola
export function makeFlameAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * 128, oy = Math.floor(k / 2) * 128;
    g.save();
    g.translate(ox + 64, oy);
    g.filter = 'blur(5px)';
    const lean = (Math.random() - 0.5) * 26;
    const wob = (Math.random() - 0.5) * 14;
    // lidah api: pangkal bulat ramping, ujung meliuk tipis
    const shape = (w, top) => {
      g.beginPath();
      g.moveTo(0, 114);
      g.bezierCurveTo(-w * 1.05, 112, -w * 1.1, 86, -w * 0.55 + wob * 0.3, 66);
      g.bezierCurveTo(-w * 0.2 + wob, 46, lean - 6, top + 22, lean, top);
      g.bezierCurveTo(lean + 4, top + 20, w * 0.25 + wob, 44, w * 0.6 + wob * 0.3, 68);
      g.bezierCurveTo(w * 1.1, 88, w * 1.05, 112, 0, 114);
      g.closePath();
    };
    // lapisan luar (lembut) lalu inti terang
    let gr = g.createLinearGradient(0, 120, 0, 8);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.15, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    shape(20 + Math.random() * 6, 8 + Math.random() * 18);
    g.fill();
    gr = g.createLinearGradient(0, 118, 0, 40);
    gr.addColorStop(0, 'rgba(255,255,255,0.2)');
    gr.addColorStop(0.3, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    shape(10, 52 + Math.random() * 12);
    g.fill();
    g.restore();
  }
  return new THREE.CanvasTexture(c);
}

export function makeSoftTexture(kind = 'flame') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'smoke') {
    for (let i = 0; i < 7; i++) {
      const x = 22 + Math.random() * 20;
      const y = 22 + Math.random() * 20;
      const r = 10 + Math.random() * 9;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.65)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aVar;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vVar;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vVar = aVar;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAtlas;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vVar;
  void main() {
    vec2 uv = gl_PointCoord;
    if (uAtlas > 0.5) {
      // pilih 1 dari 4 sel atlas (atas kanvas = atas sprite)
      vec2 cell = vec2(mod(vVar, 2.0), 1.0 - floor(vVar / 2.0));
      uv = (vec2(uv.x, 1.0 - uv.y) + cell) * 0.5;
    }
    vec4 t = texture2D(uMap, uv);
    float a = t.a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
  }
`;

// Sistem partikel satu draw call (THREE.Points). Ukuran dalam satuan meter.
export class Particles {
  constructor(max, { map, additive = false, gravity = 0, drag = 0, atlas = false }) {
    this.max = max;
    this.n = 0;
    this.gravity = gravity;
    this.drag = drag;

    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a = new Float32Array(max);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.vr = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.p, 3));
    geo.setAttribute('aSize', dyn(this.size, 1));
    geo.setAttribute('aColor', dyn(this.col, 3));
    geo.setAttribute('aAlpha', dyn(this.alpha, 1));
    geo.setAttribute('aVar', dyn(this.vr, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    this.uniforms = { uMap: { value: map }, uScale: { value: 500 }, uAtlas: { value: atlas ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a, variant = Math.floor(Math.random() * 4)) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.vr[i] = variant;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
    this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
    this.a[i] = a;
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.p[t3 + k] = this.p[f3 + k];
      this.v[t3 + k] = this.v[f3 + k];
      this.c0[t3 + k] = this.c0[f3 + k];
      this.c1[t3 + k] = this.c1[f3 + k];
    }
    this.age[to] = this.age[from];
    this.vr[to] = this.vr[from];
    this.life[to] = this.life[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.a[to] = this.a[from];
  }

  update(dt) {
    const damp = Math.max(0, 1 - this.drag * dt);
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.copy(this.n - 1, i);
        this.n--;
        continue;
      }
      const t = this.age[i] / this.life[i];
      const i3 = i * 3;
      this.v[i3 + 1] += this.gravity * dt;
      this.v[i3] *= damp; this.v[i3 + 1] *= damp; this.v[i3 + 2] *= damp;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      for (let k = 0; k < 3; k++) this.col[i3 + k] = this.c0[i3 + k] + (this.c1[i3 + k] - this.c0[i3 + k]) * t;
      this.alpha[i] = this.a[i] * Math.min(1, t * 6) * (1 - t);
      i++;
    }
    for (const name of ['position', 'aSize', 'aColor', 'aAlpha', 'aVar']) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}
