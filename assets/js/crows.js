// Crows: moonlit silhouettes crossing the night.
//
// One 2D canvas inside #crow-layer. Sprites are pre-processed silhouettes (see assets/img/crows/CREDITS.txt):
//   crow-flap.webp      25-frame side-view raven wing-beat, 144x200 cells (near birds)
//   crow-flap-far.webp  same cycle, 46x64 cells, pre-softened (distant birds)
//   crow-soar.webp      a single soaring crow seen from below (used for the slow arcs around the moon)
//
// Contract: initCrows(layerEl, { reducedMotion, isMobile }) -> { dispose() }
//
// Optional coupling:
//   window.__moon = { x, y, r } or () => ({ x, y, r })   viewport CSS px of the moon disc, if moon.js exposes it.
//   window 'crow:caw' CustomEvent { detail: { pan } }    from ambient.js; one crow on that side flinches.

const BASE = new URL('../img/crows/', import.meta.url);

const SHEET = { cells: 25, cw: 144, ch: 200 };
const FAR = { cells: 25, cw: 46, ch: 64 };
const ANCHOR_Y = 0.56; // body line inside a cell (fraction of cell height)

// The source cycle lingers on the downstroke; this order keeps the beat lively.
const CYCLE = [0, 1, 3, 5, 6, 7, 8, 9, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const GLIDE_FRAME = 8;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`crows: failed to load ${name}`));
    img.src = new URL(name, BASE).href;
  });
}

export async function initCrows(layer, ctx = {}) {
  if (!layer) return { dispose() {} };
  const reduced = !!ctx.reducedMotion;
  const mobile = !!ctx.isMobile;

  const [flap, flapFar, soar] = await Promise.all([
    loadImage('crow-flap.webp'),
    loadImage('crow-flap-far.webp'),
    loadImage('crow-soar.webp'),
  ]);

  // Tonight's phase, so the money shot crosses the *lit* part of the disc (moon.js is already loaded).
  let phase = null;
  try { phase = (await import('./moon.js')).getMoonPhase(new Date()); } catch (_) { /* full disc assumed */ }

  const style = document.createElement('style');
  style.textContent = '#crow-layer>canvas.crows{position:absolute;inset:0;width:100%;height:100%;display:block}';
  document.head.appendChild(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'crows';
  canvas.setAttribute('aria-hidden', 'true');
  layer.appendChild(canvas);
  const g = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = layer.getBoundingClientRect();
    W = Math.max(1, r.width || innerWidth);
    H = Math.max(1, r.height || innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();

  const MAX = reduced ? 3 : mobile ? 5 : 13;
  const sizeScale = mobile ? 0.72 : 1;

  /* ── the moon (where to aim the money shot) ─────────────── */
  function moon() {
    const m = typeof window.__moon === 'function' ? window.__moon() : window.__moon;
    if (m && isFinite(m.x) && isFinite(m.y)) return { x: m.x, y: m.y, r: m.r || Math.min(W, H) * 0.17 };
    // Mirror of moon.js layout(): centred (nudged right of the rail), ~42% down in the hero,
    // easing up to ~24% and shrinking as the first screen scrolls away.
    const small = W < 820 || mobile;
    const baseR = small ? Math.min(W * 0.35, H * 0.27) : Math.min(W, H) * 0.255;
    const s = clamp((window.scrollY || 0) / H, 0, 1);
    const e = 1 - (1 - s) * (1 - s);
    const heroCy = Math.min(H * 0.42, H * 0.615 - baseR);
    return { x: W / 2 + (small ? 0 : 38), y: heroCy + (H * 0.24 - heroCy) * e, r: baseR * (1 - 0.45 * e) };
  }

  /* ── pointer ─────────────────────────────────────────────── */
  const ptr = { x: -1e4, y: -1e4, t: 0 };
  const onPointer = (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = performance.now(); };
  const onLeave = () => { ptr.x = ptr.y = -1e4; };
  if (!reduced) {
    addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('pointerleave', onLeave);
  }

  /* ── birds ───────────────────────────────────────────────── */
  const birds = [];

  // depth: 0 = far (tiny, slow, faint, soft), 1 = near (big, fast, crisp)
  function makeFlapper(depth, dir, path, opts = {}) {
    const near = depth;
    const size = (20 + Math.pow(near, 1.5) * 78) * sizeScale * rand(0.9, 1.1);  // CSS px width of the body
    const speed = (45 + near * 170) * rand(0.85, 1.15) * (reduced ? 0.4 : 1);
    return {
      kind: 'flap', depth, dir, path, size, speed,
      t: 0, len: path.len, u: 0,
      phase: Math.random(), rate: rand(2.0, 2.8) * (1.15 - near * 0.3), // beats per second
      glide: 0, nextGlide: rand(1.5, 6), alpha: 0,
      bobA: rand(3, 9) * (0.4 + near), bobF: rand(0.25, 0.6), bobP: rand(0, 6.28),
      ox: 0, oy: 0, ovx: 0, ovy: 0, startle: 0, cooldown: 0,
      angle: 0, moonLock: !!opts.moonLock, moonRef: opts.moonRef || 0,
      x: path.p0.x, y: path.p0.y, px: path.p0.x, py: path.p0.y, fresh: true,
    };
  }

  // A quadratic curve from one side of the screen to the other.
  function crossPath(dir, y0, y2, ctrlY) {
    const m = 140;
    const p0 = { x: dir > 0 ? -m : W + m, y: y0 };
    const p2 = { x: dir > 0 ? W + m : -m, y: y2 };
    const p1 = { x: W * rand(0.35, 0.65), y: ctrlY };
    // rough arc length
    let len = 0, lx = p0.x, ly = p0.y;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      const x = a * p0.x + b * p1.x + c * p2.x, y = a * p0.y + b * p1.y + c * p2.y;
      len += Math.hypot(x - lx, y - ly); lx = x; ly = y;
    }
    return { p0, p1, p2, len };
  }

  function skyY() {
    // biased toward the upper part of the screen
    const r = Math.random();
    return H * (0.05 + r * r * 0.62);
  }

  // lead > 0 starts the flock already that far along its path (used for the very first birds)
  function spawnGroup(lead = 0) {
    const room = MAX - birds.length;
    if (room <= 0) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const r = Math.random();
    let n = r < 0.42 ? 1 : r < 0.68 ? 2 : r < 0.88 ? 3 : 4;
    if (reduced) n = 1;
    n = Math.min(n, room);
    const depth = reduced ? rand(0, 0.15) : Math.pow(Math.random(), 1.1);
    const y0 = skyY();
    const y2 = clamp(y0 + rand(-0.25, 0.2) * H, H * 0.03, H * 0.8);
    const cy = (y0 + y2) / 2 + rand(-0.18, 0.18) * H;
    for (let i = 0; i < n; i++) {
      const d = clamp(depth + rand(-0.08, 0.08), 0, 1);
      const off = i === 0 ? 0 : 1;
      const dy = off * rand(-1, 1) * (18 + d * 40);
      const p = crossPath(dir, y0 + dy, y2 + dy + rand(-20, 20), cy + dy);
      const b = makeFlapper(d, dir, p);
      // followers trail the leader a little
      b.u = lead - off * (i * rand(0.035, 0.07) + rand(0, 0.02));
      b.speed *= 1 + (i ? rand(-0.06, 0.06) : 0);
      birds.push(b);
    }
  }

  // The money shot: a crow whose path crosses the moon disc.
  // eta: if given, start far enough along that the crow reaches the disc in about that many seconds
  function spawnMoonCrosser(eta = 0) {
    if (birds.length >= MAX) return;
    const mo = moon();
    if (mo.y < -mo.r || mo.y > H + mo.r) return spawnGroup();
    const dir = Math.random() < 0.5 ? 1 : -1;
    const ty = rand(-0.5, 0.5) * mo.r;
    let tx = rand(-0.15, 0.15) * mo.r;
    if (phase && phase.illumination < 0.85) {
      // centre of the lit band at this height: waxing lit from the right, waning from the left
      const half = Math.sqrt(Math.max(0, mo.r * mo.r - ty * ty));
      const side = phase.fraction < 0.5 ? 1 : -1;
      tx = side * (1 - phase.illumination) * half;
    }
    const target = { x: mo.x + tx, y: mo.y + ty };
    const y0 = clamp(target.y + rand(-0.22, 0.12) * H, H * 0.04, H * 0.85);
    const y2 = clamp(target.y + rand(-0.22, 0.12) * H, H * 0.04, H * 0.85);
    const m = 140;
    const p0 = { x: dir > 0 ? -m : W + m, y: y0 };
    const p2 = { x: dir > 0 ? W + m : -m, y: y2 };
    // choose the control point so the curve passes through the target at its midpoint
    const p1 = { x: 2 * target.x - 0.5 * (p0.x + p2.x), y: 2 * target.y - 0.5 * (p0.y + p2.y) };
    const path = { p0, p1, p2, len: Math.hypot(p2.x - p0.x, p2.y - p0.y) * 1.08 };
    const depth = reduced ? 0.1 : rand(0.35, 0.8);
    const b = makeFlapper(depth, dir, path, { moonLock: true, moonRef: mo.y });
    b.speed *= 0.85;              // linger a little as it crosses the light
    if (eta > 0) b.u = Math.max(0, 0.5 - (b.speed * eta) / path.len);
    birds.push(b);
    if (!reduced && Math.random() < 0.45 && birds.length < MAX) {   // sometimes a companion
      const c = makeFlapper(clamp(depth + rand(-0.1, 0.05), 0, 1), dir, path, { moonLock: true, moonRef: mo.y });
      c.u = b.u - rand(0.04, 0.08); c.oy = rand(-1, 1) * mo.r * 0.35; c.speed = b.speed * rand(0.96, 1.05);
      birds.push(c);
    }
  }

  // A slow soaring crow sweeping part of an ellipse around the moon, seen from below.
  function spawnCircler() {
    if (birds.length >= MAX) return;
    const mo = moon();
    if (mo.y < -mo.r * 2 || mo.y > H + mo.r) return spawnGroup();
    const rx = mo.r * rand(1.35, 2.3);
    const ry = rx * rand(0.38, 0.6);
    const cw = Math.random() < 0.5 ? 1 : -1;
    const a0 = rand(0, Math.PI * 2);
    const sweep = rand(Math.PI * 0.9, Math.PI * 1.5) * cw;
    const dur = rand(14, 22) * (reduced ? 1.6 : 1);
    birds.push({
      kind: 'soar', depth: rand(0.15, 0.5), rx, ry, a0, sweep, dur, t: 0, tilt: rand(-0.25, 0.25),
      moonRef: mo.y, size: rand(26, 42) * sizeScale, alpha: 0,
      flex: rand(0, 6.28), ox: 0, oy: 0, ovx: 0, ovy: 0, startle: 0, cooldown: 0,
      x: mo.x, y: mo.y, px: mo.x, py: mo.y, angle: 0, dir: 1, fresh: true,
    });
  }

  /* ── spawning schedule: sparse, staggered ───────────────── */
  let clock = 0;
  const queue = [];   // [{ at, fn }]
  const schedule = (delay, fn) => queue.push({ at: clock + delay, fn });

  if (reduced) {
    schedule(rand(0.6, 1.4), () => spawnGroup(rand(0.08, 0.2)));
    schedule(rand(5, 9), spawnGroup);
  } else {
    schedule(rand(0.3, 0.8), () => spawnGroup(rand(0.1, 0.25)));
    schedule(rand(1.2, 2.2), () => spawnMoonCrosser(rand(3.5, 5.5)));
    if (!mobile) schedule(rand(3.5, 6), spawnGroup);
  }
  let nextAuto = reduced ? rand(14, 22) : rand(6, 9);

  function autoSpawn() {
    if (birds.length >= MAX) { nextAuto = clock + rand(2, 4); return; }
    const r = Math.random();
    if (reduced) spawnGroup();
    else if (r < 0.22) spawnMoonCrosser();
    else if (r < 0.32) spawnCircler();
    else spawnGroup();
    nextAuto = clock + (reduced ? rand(12, 22) : rand(mobile ? 5 : 2.8, mobile ? 11 : 7.5));
  }

  /* ── caw coupling ────────────────────────────────────────── */
  const onCaw = (e) => {
    const pan = clamp(+(e.detail && e.detail.pan) || 0, -1, 1);
    const sx = (pan + 1) * 0.5 * W;
    let best = null, bd = Infinity;
    for (const b of birds) {
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) continue;
      const d = Math.abs(b.x - sx);
      if (d < bd) { bd = d; best = b; }
    }
    if (best && bd < W * 0.4) flinch(best, 0.6, 0, -1);
    else if (!reduced && birds.length < MAX) {
      // nobody there: one answers from that side
      const dir = pan < 0 ? 1 : -1;
      const y = skyY();
      birds.push(makeFlapper(rand(0.2, 0.6), dir, crossPath(dir, y, y + rand(-0.1, 0.1) * H, y - rand(0, 0.12) * H)));
    }
  };
  addEventListener('crow:caw', onCaw);

  // A startle: beat faster, kick away from (fx, fy) direction.
  function flinch(b, strength, ax, ay) {
    if (reduced) return;
    b.startle = Math.max(b.startle, strength);
    const k = (50 + b.depth * 120) * strength;
    const n = Math.hypot(ax, ay) || 1;
    b.ovx += (ax / n) * k * 0.6;
    b.ovy += (ay / n) * k - k * 0.35;   // birds bolt upward
    if (b.kind === 'flap') b.glide = 0;
  }

  /* ── update ──────────────────────────────────────────────── */
  function bez(p, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return { x: a * p.p0.x + b * p.p1.x + c * p.p2.x, y: a * p.p0.y + b * p.p1.y + c * p.p2.y };
  }

  function update(dt) {
    clock += dt;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (clock >= queue[i].at) { const q = queue.splice(i, 1)[0]; q.fn(); }
    }
    if (clock >= nextAuto) autoSpawn();

    const mo = moon();
    const ptrLive = performance.now() - ptr.t < 4000;

    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.px = b.x; b.py = b.y;
      b.alpha = Math.min(1, b.alpha + dt * 1.2);
      b.startle = Math.max(0, b.startle - dt * 0.55);
      b.cooldown = Math.max(0, b.cooldown - dt);

      // offset spring: veer, then settle on the new line (no snapping back)
      b.ox += b.ovx * dt; b.oy += b.ovy * dt;
      const damp = Math.exp(-dt * 1.6);
      b.ovx *= damp; b.ovy *= damp;

      if (b.kind === 'flap') {
        const hurry = 1 + b.startle * 0.9;
        b.u += (b.speed * hurry * dt) / b.len;
        if (b.u > 1.02) { birds.splice(i, 1); continue; }
        const p = bez(b.path, clamp(b.u, -0.2, 1.05));
        const shift = b.moonLock ? mo.y - b.moonRef : 0;
        const tb = clock * b.bobF * 6.283 + b.bobP;
        b.x = p.x + b.ox;
        b.y = p.y + shift + b.oy + Math.sin(tb) * b.bobA;
        if (b.fresh) { b.px = b.x; b.py = b.y; b.fresh = false; }

        // wing-beat: climbing beats harder, descending invites gliding
        const vy = (b.y - b.py) / Math.max(dt, 1e-3);
        const climb = clamp(-vy / (b.speed * 0.6 + 1), -1, 1);
        if (b.glide > 0) {
          b.glide -= dt;
          b.oy += dt * (6 + b.depth * 10);          // glides sink gently
          if (b.startle > 0.2 || climb > 0.55) b.glide = 0;
        } else {
          const rate = b.rate * (1 + Math.max(0, climb) * 0.7 + b.startle * 1.4);
          const before = b.phase;
          b.phase = (b.phase + rate * dt) % 1;
          b.nextGlide -= dt;
          // enter a glide as the wings pass level
          const gp = CYCLE.indexOf(GLIDE_FRAME) / CYCLE.length;
          const crossed = before < gp && b.phase >= gp;
          if (crossed && b.nextGlide <= 0 && b.startle < 0.1) {
            b.glide = rand(0.6, 1.8) * (climb < -0.15 ? 1.5 : 1);
            b.nextGlide = rand(2.5, 8);
          }
        }
        b.angle = clamp(Math.atan2(vy * 0.55, b.speed) * 0.8, -0.38, 0.38) * b.dir;
      } else {
        // soaring circler
        b.t += dt;
        if (b.t > b.dur) { birds.splice(i, 1); continue; }
        const k = b.t / b.dur;
        const a = b.a0 + b.sweep * k;
        const ca = Math.cos(a), sa = Math.sin(a);
        const shift = mo.y - b.moonRef;
        const ex = ca * b.rx, ey = sa * b.ry;
        const ct = Math.cos(b.tilt), st = Math.sin(b.tilt);
        b.x = mo.x + ex * ct - ey * st + b.ox;
        b.y = b.moonRef + shift + ex * st + ey * ct + b.oy;
        // fade at both ends of the sweep: it drifts out of the dark and back into it
        const edge = Math.min(k, 1 - k) * b.dur;
        b.alpha = clamp(edge / 2.2, 0, 1);
        if (b.fresh) { b.px = b.x; b.py = b.y; b.fresh = false; }
        const vx = b.x - b.px, vy2 = b.y - b.py;
        b.dir = vx >= 0 ? 1 : -1;
        b.angle = clamp(Math.atan2(vy2, Math.abs(vx) + 1e-3), -0.9, 0.9) * b.dir;
        b.flex += dt * (0.9 + b.startle * 6);
      }

      // cursor: birds passing close to the pointer startle and veer away
      if (ptrLive && b.cooldown <= 0) {
        const dx = b.x - ptr.x, dy = b.y - ptr.y;
        const R = 70 + b.size * 1.4;
        if (dx * dx + dy * dy < R * R) {
          flinch(b, 1, dx, dy);
          b.cooldown = 1.2;
        }
      }
    }
  }

  /* ── draw ────────────────────────────────────────────────── */
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!birds.length) return;
    birds.sort((a, b) => a.depth - b.depth);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';

    for (const b of birds) {
      const s = dpr;
      if (b.kind === 'flap') {
        const useFar = b.size < 34;
        const sh = useFar ? FAR : SHEET;
        const img = useFar ? flapFar : flap;
        const frame = b.glide > 0 ? GLIDE_FRAME : CYCLE[(b.phase * CYCLE.length) | 0];
        const w = b.size, h = w * (sh.ch / sh.cw);
        const cos = Math.cos(b.angle) * s, sin = Math.sin(b.angle) * s;
        g.setTransform(cos * b.dir, sin * b.dir, -sin, cos, b.x * s, b.y * s);
        g.globalAlpha = b.alpha * (0.72 + b.depth * 0.28);
        g.drawImage(img, frame * sh.cw, 0, sh.cw, sh.ch, -w / 2, -h * ANCHOR_Y, w, h);
      } else {
        const w = b.size, h = w * (soar.height / soar.width);
        const flex = 0.9 + 0.1 * Math.sin(b.flex);          // wings breathing on the air
        const cos = Math.cos(b.angle) * s, sin = Math.sin(b.angle) * s;
        g.setTransform(cos * b.dir, sin * b.dir, -sin * flex, cos * flex, b.x * s, b.y * s);
        g.globalAlpha = b.alpha * (0.8 + b.depth * 0.2);
        g.drawImage(soar, -w / 2, -h / 2, w, h);
      }
    }
    g.globalAlpha = 1;
  }

  /* ── loop ────────────────────────────────────────────────── */
  let raf = 0, last = 0, running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
  }
  function start() {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  let rzT = 0;
  const onResize = () => { clearTimeout(rzT); rzT = setTimeout(resize, 120); };
  addEventListener('resize', onResize);

  start();

  return {
    dispose() {
      stop();
      clearTimeout(rzT);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerleave', onLeave);
      removeEventListener('crow:caw', onCaw);
      canvas.remove();
      style.remove();
      birds.length = 0;
    },
  };
}
