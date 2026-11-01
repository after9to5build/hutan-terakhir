// Input gabungan: keyboard + mouse + controller (Gamepad API).
// Game otomatis pindah "mode" ke perangkat yang terakhir dipakai,
// dan petunjuk tombol di layar ikut berubah.

const DEAD = 0.18; // zona mati stik analog
const LOOK_SPEED = 2.6; // radian/detik saat stik kanan didorong penuh

// Indeks tombol "standard mapping" (sama untuk Xbox & PlayStation)
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const LABELS = {
  keyboard: { spray: 'SPASI', sprint: 'Shift', action: 'E', map: 'M', confirm: 'Enter', back: 'Esc', callBike: 'B', gas: 'W', brake: 'S', blitz: 'Q', heli: 'H', shout: 'T', gadgetPrev: 'Z', gadgetNext: 'C' },
  xbox: { spray: 'RT', sprint: 'LT', action: 'A', map: 'Y', confirm: 'A', back: 'B', callBike: 'D-pad ↓', gas: 'RT', brake: 'LT', blitz: 'X', heli: 'RB', shout: 'RB', gadgetPrev: '◀', gadgetNext: '▶' },
  playstation: { spray: 'R2', sprint: 'L2', action: '✕', map: '△', confirm: '✕', back: '○', callBike: 'D-pad ↓', gas: 'R2', brake: 'L2', blitz: '□', heli: 'R1', shout: 'R1', gadgetPrev: '◀', gadgetNext: '▶' },
};

function deadzone(v) {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * ((a - DEAD) / (1 - DEAD));
}

function padTypeFromId(id) {
  const s = id.toLowerCase();
  if (s.includes('xbox') || s.includes('045e')) return 'xbox';
  if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation') || s.includes('wireless controller'))
    return 'playstation';
  return 'xbox'; // Xbox & controller generik pakai label Xbox
}

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.device = 'keyboard';
    this.padType = 'xbox';
    this.padName = '';
    this.onDeviceChange = null;

    this.move = { x: 0, y: 0 }; // x = kanan, y = maju
    this.lookDelta = { yaw: 0, pitch: 0 };
    this.spray = false;
    this.sprint = false;
    this.rt = 0; // pelatuk analog (gas motor)
    this.lt = 0; // pelatuk analog (rem motor)

    this.prevPad = [];
    this.pressed = new Set(); // tombol yang baru ditekan di frame ini
    this.mouse = { dx: 0, dy: 0, dragging: false };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.queueKey(e.code);
      this.keys.add(e.code);
      this.setDevice('keyboard');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      this.mouse.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => (this.mouse.dragging = false));
    canvas.addEventListener('pointermove', (e) => {
      if (!this.mouse.dragging) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
      this.setDevice('keyboard');
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.padName = e.gamepad.id;
      this.padType = padTypeFromId(e.gamepad.id);
      this.setDevice('gamepad', true);
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.padName = '';
      this.setDevice('keyboard', true);
    });

    this.keyQueue = [];
  }

  queueKey(code) {
    const map = {
      Enter: 'confirm', NumpadEnter: 'confirm',
      KeyE: 'action', KeyM: 'map', Escape: 'back', KeyQ: 'blitz', KeyB: 'callBike', KeyH: 'heli', KeyT: 'shout', KeyZ: 'gadgetPrev', KeyC: 'gadgetNext',
      ArrowLeft: 'prev', KeyA: 'prev', ArrowRight: 'next', KeyD: 'next',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    };
    if (map[code]) this.keyQueue.push(map[code]);
  }

  setDevice(device, force = false) {
    if (this.device === device && !force) return;
    this.device = device;
    if (this.onDeviceChange) this.onDeviceChange(this);
  }

  get scheme() {
    return this.device === 'gamepad' ? this.padType : 'keyboard';
  }

  label(name) {
    return LABELS[this.scheme][name];
  }

  justPressed(name) {
    return this.pressed.has(name);
  }

  activePad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Dipanggil sekali tiap frame
  poll(dt) {
    this.pressed.clear();
    for (const k of this.keyQueue) this.pressed.add(k);
    this.keyQueue.length = 0;

    // Keyboard
    const k = (c) => this.keys.has(c);
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let spray = k('Space');
    let sprint = k('ShiftLeft') || k('ShiftRight');
    let actionHeld = k('KeyE');
    let yaw = -this.mouse.dx * 0.006;
    let pitch = this.mouse.dy * 0.004;
    this.mouse.dx = this.mouse.dy = 0;

    // Controller
    const pad = this.activePad();
    this.rt = this.lt = 0;
    if (pad) {
      if (!this.padName) {
        this.padName = pad.id;
        this.padType = padTypeFromId(pad.id);
      }
      const b = (i) => (pad.buttons[i] ? pad.buttons[i].value > 0.4 || pad.buttons[i].pressed : false);
      const lx = deadzone(pad.axes[0] || 0), ly = deadzone(pad.axes[1] || 0);
      const rx = deadzone(pad.axes[2] || 0), ry = deadzone(pad.axes[3] || 0);

      const now = pad.buttons.map((_, i) => b(i));
      const any = now.some(Boolean) || lx || ly || rx || ry;
      if (any) this.setDevice('gamepad');

      const edge = (i) => now[i] && !this.prevPad[i];
      if (edge(BTN.A)) { this.pressed.add('confirm'); this.pressed.add('action'); }
      if (edge(BTN.B)) this.pressed.add('back');
      if (edge(BTN.X)) this.pressed.add('blitz');
      if (edge(BTN.Y)) this.pressed.add('map');
      if (edge(BTN.START)) { this.pressed.add('start'); this.pressed.add('confirm'); }
      if (edge(BTN.RB)) this.pressed.add('shout');

      // D-pad: tombol standar (12–15), atau "hat" di axis 9 buat controller non-standar
      let dUp = b(BTN.UP), dDown = b(BTN.DOWN), dLeft = b(BTN.LEFT), dRight = b(BTN.RIGHT);
      if (pad.mapping !== 'standard' && pad.axes.length > 9) {
        const h = pad.axes[9];
        if (h >= -1.05 && h <= 1.05) { // netral biasanya ±1.28
          const k = Math.round((h + 1) / (2 / 7)); // 0 atas, 2 kanan, 4 bawah, 6 kiri
          dUp = dUp || k === 0 || k === 1 || k === 7;
          dRight = dRight || (k >= 1 && k <= 3);
          dDown = dDown || (k >= 3 && k <= 5);
          dLeft = dLeft || (k >= 5 && k <= 7);
        }
      }
      const dirs = { up: dUp, down: dDown, left: dLeft, right: dRight };
      const prevDir = this.prevDir || {};
      if (dirs.down && !prevDir.down) { this.pressed.add('callBike'); this.pressed.add('down'); }
      if (dirs.up && !prevDir.up) this.pressed.add('up');
      if (dirs.left && !prevDir.left) { this.pressed.add('prev'); this.pressed.add('gadgetPrev'); }
      if (dirs.right && !prevDir.right) { this.pressed.add('next'); this.pressed.add('gadgetNext'); }
      this.prevDir = dirs;
      this.debug = {
        id: pad.id,
        mapping: pad.mapping || '(non-standar)',
        pressed: now.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
        axes: pad.axes.map((a, i) => (Math.abs(a) > 0.3 && Math.abs(a) < 1.2 ? `${i}:${a.toFixed(2)}` : null)).filter(Boolean),
        dirs,
      };

      // stik kiri disentil ke 4 arah juga bisa milih di Peta Titik Panas
      const fx = lx > 0.7 ? 1 : lx < -0.7 ? -1 : 0;
      const fy = ly > 0.7 ? 1 : ly < -0.7 ? -1 : 0;
      if (fx && fx !== this.prevFlick) this.pressed.add(fx > 0 ? 'next' : 'prev');
      if (fy && fy !== this.prevFlickY) this.pressed.add(fy > 0 ? 'down' : 'up');
      this.prevFlick = fx;
      this.prevFlickY = fy;
      this.rt = pad.buttons[BTN.RT] ? pad.buttons[BTN.RT].value : 0;
      this.lt = pad.buttons[BTN.LT] ? pad.buttons[BTN.LT].value : 0;
      this.prevPad = now;

      // Stik kiri: atas = maju (axis Y negatif)
      if (lx || ly) { mx = lx; my = -ly; }
      if (dUp) my = 1;
      spray = spray || b(BTN.RT);
      sprint = sprint || b(BTN.LT) || b(BTN.LB);
      actionHeld = actionHeld || b(BTN.A);
      yaw += -rx * LOOK_SPEED * dt;
      pitch += ry * LOOK_SPEED * 0.6 * dt;
    }

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx;
    this.move.y = my;
    this.spray = spray;
    this.sprint = sprint;
    this.actionHeld = actionHeld;
    this.lookDelta.yaw = yaw;
    this.lookDelta.pitch = pitch;
  }

  hint() {
    if (this.scheme === 'keyboard') return 'WASD jalan · Shift lari · Spasi siram · E aksi · Q gadget (Z/C ganti) · T teriak · M peta · B motor · Seret mouse kamera';
    const l = LABELS[this.scheme];
    return `Stik kiri jalan · ${l.sprint} lari · ${l.spray} siram · ${l.action} aksi · ${l.blitz} gadget (D-pad ◀▶ ganti) · ${l.shout} teriak · ${l.map} peta · ${l.callBike} motor`;
  }
}

// Objek input kosong (dipakai saat di menu)
export const IDLE = { move: { x: 0, y: 0 }, spray: false, sprint: false };
