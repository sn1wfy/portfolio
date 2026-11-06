// 252,000 lines as sky. One star per hundred lines, one constellation per language.
// 2D canvas, seeded so the sky is the same every night.
//
// initStars(canvas, tipEl, ctx) -> { dispose(), pause(), resume() }

const TOTAL_STARS = 2520;

// Grey value = star temperature. No hue anywhere.
//   grey   core grey (0-255)       size   radius multiplier
//   soft   halo spread (sprite)    tw     twinkle depth, sp twinkle speed (rad/s)
const LANGS = [
  { name: 'C#',         lines: 99003, pct: '39.3', grey: 255, size: 1.00, soft: 0.55, tw: 0.18, sp: 0.7, galaxy: true },
  { name: 'Razor',      lines: 44286, pct: '17.6', grey: 226, size: 0.95, soft: 0.70, tw: 0.22, sp: 0.9 },
  { name: 'CSS',        lines: 40902, pct: '16.3', grey: 188, size: 0.92, soft: 0.95, tw: 0.38, sp: 1.6 },
  { name: 'JavaScript', lines: 20944, pct: '8.3',  grey: 212, size: 0.88, soft: 0.60, tw: 0.42, sp: 2.3 },
  { name: 'HTML',       lines: 15921, pct: '6.3',  grey: 168, size: 0.90, soft: 1.00, tw: 0.25, sp: 1.1 },
  { name: 'Python',     lines: 15821, pct: '6.3',  grey: 238, size: 0.82, soft: 0.65, tw: 0.30, sp: 1.3 },
  { name: 'C++',        lines: 8022,  pct: '3.2',  grey: 250, size: 1.12, soft: 0.35, tw: 0.12, sp: 0.5 },
  { name: 'Shell · TypeScript · SQL · C · EJS', short: 'the rest', lines: 6835, pct: '2.7', grey: 150, size: 0.80, soft: 0.85, tw: 0.35, sp: 1.8 },
];

// Where each constellation sits. Fractions of the frame. Hand-placed, like a sky you've looked at for years.
const LAYOUT_WIDE = [
  { x: 0.37, y: 0.50, rot: -0.22 }, // C#: the galaxy
  { x: 0.74, y: 0.30, rot: 0.6 },
  { x: 0.77, y: 0.74, rot: -0.3 },
  { x: 0.11, y: 0.24, rot: 1.1 },
  { x: 0.55, y: 0.15, rot: 0.2 },
  { x: 0.09, y: 0.80, rot: -0.8 },
  { x: 0.57, y: 0.87, rot: 0.9 },
  { x: 0.935, y: 0.50, rot: 1.6 },
];
const LAYOUT_TALL = [
  { x: 0.50, y: 0.50, rot: -1.25 },
  { x: 0.24, y: 0.14, rot: 0.6 },
  { x: 0.73, y: 0.86, rot: -0.3 },
  { x: 0.80, y: 0.17, rot: 1.1 },
  { x: 0.18, y: 0.66, rot: 0.2 },
  { x: 0.25, y: 0.89, rot: -0.8 },
  { x: 0.84, y: 0.57, rot: 0.9 },
  { x: 0.15, y: 0.39, rot: 1.6 },
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One star per hundred lines; the leftover fractions (largest remainder first) round the sky up to 2,520.
function starCounts() {
  const raw = LANGS.map((l) => l.lines / 100);
  const out = raw.map(Math.floor);
  let left = TOTAL_STARS - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return out;
}

function makeSprite(grey, soft) {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  const v = `${grey},${grey},${grey}`;
  grad.addColorStop(0, `rgba(${v},1)`);
  grad.addColorStop(0.08 + 0.06 * (1 - soft), `rgba(${v},0.95)`);
  grad.addColorStop(0.18 + 0.12 * soft, `rgba(${v},${0.18 + 0.12 * soft})`);
  grad.addColorStop(0.5 + 0.2 * soft, `rgba(${v},0.035)`);
  grad.addColorStop(1, `rgba(${v},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

const injectStyle = () => {
  if (document.getElementById('stars-style')) return;
  const st = document.createElement('style');
  st.id = 'stars-style';
  st.textContent = `
    #stars-canvas:focus { outline: none; }
    #stars-canvas:focus-visible { outline: 1px solid rgba(216,219,224,.35); outline-offset: -8px; border-radius: 22px; }
    .stars-tip b { font-weight: 400; color: #fff; }
    .stars-tip span { color: #8d8d93; }
    .stars-tip.narrow { white-space: normal; }
    .stars-tip.narrow span { display: block; }
    .stars-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; }
  `;
  document.head.appendChild(st);
};

export function initStars(canvas, tipEl, ctx = {}) {
  const reduced = !!ctx.reducedMotion;
  const g = canvas.getContext('2d');
  const frame = canvas.parentElement;
  injectStyle();

  const rand = mulberry32(0x5e0f1);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /* ── Build the sky in cluster-local units (radius ≈ 1) ───────────── */
  const counts = starCounts();
  const clusters = LANGS.map((lang, ci) => {
    const n = counts[ci];
    const stars = [];
    const flat = lang.galaxy ? 0.52 : 0.62 + rand() * 0.3;
    // A few sub-clumps make each cluster feel grown, not plotted.
    const clumps = lang.galaxy ? [] : Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({
      x: gauss() * 0.32, y: gauss() * 0.32, s: 0.18 + rand() * 0.25, w: 0.4 + rand(),
    }));
    const wsum = clumps.reduce((a, c) => a + c.w, 0);

    for (let i = 0; i < n; i++) {
      let x, y;
      const pick = rand();
      if (lang.galaxy) {
        if (pick < 0.16) { // bulge
          const r = Math.abs(gauss()) * 0.11;
          const a = rand() * Math.PI * 2;
          x = Math.cos(a) * r; y = Math.sin(a) * r;
        } else if (pick < 0.40) { // the disk between the arms
          const r = Math.min(1.05, -Math.log(1 - rand() * 0.97) * 0.3);
          const a = rand() * Math.PI * 2;
          x = Math.cos(a) * r; y = Math.sin(a) * r;
        } else if (pick < 0.90) { // two log-spiral arms
          const arm = rand() < 0.5 ? 0 : Math.PI;
          const t = Math.pow(rand(), 0.9);
          const r = 0.12 + t * 0.9;
          const th = arm + Math.log(r / 0.12) * 1.25 + gauss() * 0.2;
          const sc = 0.04 + 0.075 * r;
          x = Math.cos(th) * r + gauss() * sc;
          y = Math.sin(th) * r + gauss() * sc;
        } else { // halo
          x = gauss() * 0.5; y = gauss() * 0.5;
        }
      } else if (pick < 0.82) {
        let k = rand() * wsum, c = clumps[0];
        for (const cl of clumps) { k -= cl.w; if (k <= 0) { c = cl; break; } }
        x = c.x + gauss() * c.s; y = c.y + gauss() * c.s;
      } else {
        x = gauss() * 0.6; y = gauss() * 0.6;
      }
      y *= flat;
      let mag = Math.pow(rand(), 3.4);
      if (lang.galaxy && pick < 0.4) mag *= 0.6; // the bulge is many dim suns
      stars.push({
        lx: x, ly: y, mag,
        z: 0.35 + rand() * 0.65,
        ph: rand() * Math.PI * 2,
        sp: lang.sp * (0.6 + rand() * 0.8),
        px: 0, py: 0, r: 0,
      });
    }

    // Constellation: brightest stars, spread apart, joined by a minimum spanning tree.
    const k = Math.max(4, Math.min(9, Math.round(3 + Math.sqrt(lang.lines) / 55)));
    const sorted = stars.slice().sort((a, b) => (b.mag + b.z * 0.05) - (a.mag + a.z * 0.05));
    const nodes = [];
    const minD = lang.galaxy ? 0.3 : 0.26;
    for (const s of sorted) {
      if (nodes.length >= k) break;
      if (Math.hypot(s.lx, s.ly) > 1.0) continue;
      if (nodes.every((o) => Math.hypot(o.lx - s.lx, o.ly - s.ly) > minD)) nodes.push(s);
    }
    nodes.forEach((s) => { s.mag = Math.max(s.mag, 0.82 + rand() * 0.18); s.node = true; });
    const edges = [];
    if (nodes.length > 1) {
      const inTree = new Set([0]);
      while (inTree.size < nodes.length) {
        let best = null;
        for (const i of inTree) for (let j = 0; j < nodes.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(nodes[i].lx - nodes[j].lx, nodes[i].ly - nodes[j].ly);
          if (!best || d < best.d) best = { i, j, d };
        }
        inTree.add(best.j);
        edges.push([nodes[best.i], nodes[best.j]]);
      }
    }

    return {
      ...lang, index: ci, count: n, stars, edges,
      sprite: makeSprite(lang.grey, lang.soft),
      cx: 0, cy: 0, R: 0, rot: 0,
      focus: 1, lineA: 0, draw: 0,
    };
  });

  const dust = Array.from({ length: 900 }, () => {
    const band = rand() < 0.42;
    let fx, fy;
    if (band) { // a faint milky band, falling through the galaxy
      const t = rand();
      fx = t; fy = 0.18 + t * 0.62 + gauss() * 0.09;
    } else { fx = rand(); fy = rand(); }
    return { fx, fy, a: 0.05 + Math.pow(rand(), 2) * 0.32, r: 0.25 + rand() * 0.55, z: 0.05 + rand() * 0.25, ph: rand() * 6.28, sp: 0.4 + rand() * 1.6, x: 0, y: 0 };
  });

  /* ── Layout ─────────────────────────────────────────────────────── */
  let W = 0, H = 0, dpr = 1, tallMode = false;
  function layout() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const tall = W / H < 1.05;
    tallMode = tall;
    const L = tall ? LAYOUT_TALL : LAYOUT_WIDE;
    const base = tall ? 0.36 * Math.min(W, H * 0.62) : 0.31 * Math.min(H, W * 0.56);
    clusters.forEach((c, i) => {
      c.cx = L[i].x * W; c.cy = L[i].y * H; c.rot = L[i].rot;
      c.R = Math.max(base * Math.sqrt(c.lines / LANGS[0].lines), base * 0.24) * (c.galaxy ? 1.12 : 1);
      const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
      for (const s of c.stars) {
        s.px = c.cx + (s.lx * cos - s.ly * sin) * c.R;
        s.py = c.cy + (s.lx * sin + s.ly * cos) * c.R;
        s.r = (0.32 + s.mag * 1.55) * c.size * (tall ? 0.85 : 1);
      }
    });
    for (const d of dust) { d.x = d.fx * W; d.y = d.fy * H; }
    dirty = true;
  }

  /* ── State ──────────────────────────────────────────────────────── */
  let selected = -1;          // cluster index
  let mouse = { x: 0, y: 0, in: false };
  let kb = false;             // selection came from the keyboard
  let par = { x: 0, y: 0 };   // smoothed parallax
  let raf = 0, running = false, last = 0, t = 0, dirty = true;
  let nextShot = 4 + Math.random() * 6;
  const shots = [];

  const live = document.createElement('div');
  live.className = 'stars-sr';
  live.setAttribute('aria-live', 'polite');
  frame.appendChild(live);

  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'interactive starfield');
  canvas.setAttribute('aria-label', 'Starfield: 2,520 stars, one per hundred lines of code, grouped into eight constellations by language. Use the arrow keys to move between them.');

  const fmt = (n) => n.toLocaleString('en-US');

  function showTip(x, y) {
    if (!tipEl) return;
    const c = clusters[selected];
    if (!c) { tipEl.hidden = true; return; }
    tipEl.replaceChildren();
    const b = document.createElement('b'); b.textContent = c.name;
    const narrow = W < 520;
    const s = document.createElement('span');
    s.textContent = `${narrow ? '' : '  —  '}${fmt(c.lines)} lines · ${fmt(c.count)} stars · ${c.pct}%`;
    tipEl.classList.toggle('narrow', narrow);
    tipEl.style.maxWidth = `${Math.max(160, W - 24)}px`;
    tipEl.append(b, s);
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    // .stars-tip already carries translate(14px, 14px); clamp the box inside the frame.
    const lx = Math.max(4 - 14, Math.min(x, W - tw - 14 - 8));
    const ly = Math.max(4 - 14, Math.min(y, H - th - 14 - 8));
    tipEl.style.left = `${lx}px`;
    tipEl.style.top = `${ly}px`;
  }

  function select(i, tipAt) {
    if (i !== selected) {
      if (clusters[i]) clusters[i].draw = reduced ? 1 : 0;
      selected = i;
      const c = clusters[i];
      live.textContent = c ? `${c.name}: ${fmt(c.lines)} lines, ${fmt(c.count)} stars, ${c.pct} percent of everything I write. Constellation ${i + 1} of ${clusters.length}.` : '';
      dirty = true;
    }
    if (selected < 0) { if (tipEl) tipEl.hidden = true; return; }
    if (tipAt) showTip(tipAt.x, tipAt.y);
  }

  function nearest(x, y) {
    let best = -1, bd = Infinity;
    clusters.forEach((c, i) => {
      const d = Math.hypot(x - c.cx, y - c.cy) / (c.R + 18);
      if (d < bd) { bd = d; best = i; }
    });
    return bd < 1.15 ? best : -1;
  }

  /* ── Input ──────────────────────────────────────────────────────── */
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function onMove(e) {
    if (e.pointerType === 'touch') return;
    const p = local(e);
    mouse = { ...p, in: true };
    kb = false;
    select(nearest(p.x, p.y), p);
    dirty = true;
  }
  function onLeave(e) {
    if (e.pointerType === 'touch') return;
    mouse.in = false;
    if (!kb) select(-1);
  }
  function onDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const p = local(e);
    mouse = { ...p, in: true };
    const i = nearest(p.x, p.y);
    select(i === selected ? -1 : i, p);
  }
  function onKey(e) {
    const n = clusters.length;
    let i = selected;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (selected + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = selected < 0 ? n - 1 : (selected - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else if (e.key === 'Escape') { select(-1); return; }
    else return;
    e.preventDefault();
    kb = true;
    const c = clusters[i];
    select(i, { x: c.cx + c.R * 0.35, y: c.cy - c.R * 0.15 });
  }
  function onBlur() { if (kb) { kb = false; select(-1); } }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('blur', onBlur);

  const ro = new ResizeObserver(() => { layout(); if (!running) render(0); });
  ro.observe(canvas);

  /* ── Render ─────────────────────────────────────────────────────── */
  function spawnShot() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const ang = (0.32 + Math.random() * 0.35);
    shots.push({
      x: W * (0.15 + Math.random() * 0.7), y: H * (0.04 + Math.random() * 0.35),
      vx: Math.cos(ang) * dir, vy: Math.sin(ang),
      speed: 650 + Math.random() * 450, len: 90 + Math.random() * 90,
      life: 0, dur: 0.7 + Math.random() * 0.5,
    });
  }

  function render(dt) {
    const anim = !reduced;
    const ease = anim ? 1 - Math.exp(-dt * 6) : 1;

    // parallax: stars drift a few pixels away from the cursor, deeper stars more
    const tx = anim && mouse.in ? (mouse.x / W - 0.5) * -14 : 0;
    const ty = anim && mouse.in ? (mouse.y / H - 0.5) * -10 : 0;
    par.x += (tx - par.x) * (anim ? 1 - Math.exp(-dt * 2.2) : 1);
    par.y += (ty - par.y) * (anim ? 1 - Math.exp(-dt * 2.2) : 1);
    // a very slow breathing drift, even without a cursor
    const bx = anim ? Math.sin(t * 0.05) * 3 : 0, by = anim ? Math.cos(t * 0.041) * 2 : 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // dust
    for (const d of dust) {
      const a = d.a * (anim ? 0.75 + 0.25 * Math.sin(t * d.sp + d.ph) : 1);
      g.fillStyle = `rgba(214,216,222,${a})`;
      g.fillRect(d.x + (par.x + bx) * d.z, d.y + (par.y + by) * d.z, d.r * 1.4, d.r * 1.4);
    }

    let anyFocus = selected >= 0;
    for (const c of clusters) {
      const target = !anyFocus ? 1 : c.index === selected ? 1.35 : 0.5;
      c.focus += (target - c.focus) * ease;
      const lt = c.index === selected ? 1 : 0;
      c.lineA += (lt - c.lineA) * ease;
      if (c.index === selected) c.draw = Math.min(1, c.draw + (anim ? dt / 1.1 : 1));

      // haze: a breath of light under each cluster
      const hx = c.cx + (par.x + bx) * 0.5, hy = c.cy + (par.y + by) * 0.5;
      const hz = g.createRadialGradient(hx, hy, 0, hx, hy, c.R * (c.galaxy ? 0.85 : 1.05));
      const ha = (c.galaxy ? 0.09 : 0.03) * Math.min(1.3, c.focus);
      hz.addColorStop(0, `rgba(${c.grey},${c.grey},${c.grey},${ha * (c.galaxy ? 2.2 : 1)})`);
      if (c.galaxy) hz.addColorStop(0.08, `rgba(${c.grey},${c.grey},${c.grey},${ha * 1.2})`);
      hz.addColorStop(c.galaxy ? 0.3 : 0.4, `rgba(${c.grey},${c.grey},${c.grey},${ha * 0.35})`);
      hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hz;
      g.fillRect(hx - c.R * 1.1, hy - c.R * 1.1, c.R * 2.2, c.R * 2.2);
    }

    // constellation lines
    g.lineCap = 'round';
    for (const c of clusters) {
      if (!c.edges.length) continue;
      const base = 0.07 * (anyFocus ? (c.index === selected ? 0 : 0.6) : 1);
      const a = base + c.lineA * 0.5;
      if (a < 0.004) continue;
      g.strokeStyle = `rgba(216,219,224,${a})`;
      g.lineWidth = 0.6 + c.lineA * 0.25;
      g.beginPath();
      const n = c.edges.length;
      const prog = c.index === selected ? c.draw * n : n;
      c.edges.forEach(([p, q], k) => {
        const f = c.index === selected ? Math.max(0, Math.min(1, prog - k)) : 1;
        if (f <= 0) return;
        const ox = (par.x + bx), oy = (par.y + by);
        const x1 = p.px + ox * p.z, y1 = p.py + oy * p.z;
        const x2 = q.px + ox * q.z, y2 = q.py + oy * q.z;
        // stop short of each star so the line never touches the light
        const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, gap = 5;
        g.moveTo(x1 + ux * gap, y1 + uy * gap);
        const end = gap + (L - gap * 2) * f;
        if (end > gap) g.lineTo(x1 + ux * end, y1 + uy * end);
      });
      g.stroke();
    }

    // stars
    for (const c of clusters) {
      const ox = par.x + bx, oy = par.y + by;
      const f = c.focus;
      for (const s of c.stars) {
        const tw = anim ? 1 - c.tw * 0.5 * (1 + Math.sin(t * s.sp + s.ph)) * (s.node ? 0.4 : 1) : 1 - c.tw * 0.25;
        const a = Math.min(1, (0.34 + s.mag * 0.66) * tw * f);
        const x = s.px + ox * s.z, y = s.py + oy * s.z;
        const r = s.r * (0.9 + 0.1 * f);
        if (r < 0.7) {
          g.globalAlpha = a * 0.85;
          g.fillStyle = `rgb(${c.grey},${c.grey},${c.grey})`;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        } else {
          const sz = r * (6 + c.soft * 3);
          g.globalAlpha = a;
          g.drawImage(c.sprite, x - sz / 2, y - sz / 2, sz, sz);
        }
        // the very brightest get thin diffraction spikes
        if (s.node && s.mag > 0.93 && c.size >= 0.95) {
          const sl = r * 5.5 * f;
          g.globalAlpha = a * 0.22;
          g.fillStyle = `rgb(${c.grey},${c.grey},${c.grey})`;
          g.fillRect(x - sl, y - 0.3, sl * 2, 0.6);
          g.fillRect(x - 0.3, y - sl, 0.6, sl * 2);
        }
      }
    }
    g.globalAlpha = 1;

    // labels: barely there until you look
    g.font = '400 10px "JetBrains Mono", ui-monospace, monospace';
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.textBaseline = 'middle';
    for (const c of clusters) {
      const isSel = c.index === selected;
      const a = anyFocus ? (isSel ? 0.75 : tallMode ? 0 : 0.08) : tallMode ? 0 : 0.2;
      if (a <= 0) continue;
      const label = (c.short || c.name).toUpperCase();
      const lx = c.cx + c.R * (c.galaxy ? 0.5 : 0.55) + (par.x + bx) * 0.5;
      const ly = c.cy + c.R * (c.galaxy ? 0.4 : 0.62) + (par.y + by) * 0.5;
      const right = lx + g.measureText(label).width > W - 12;
      g.textAlign = right ? 'right' : 'left';
      g.fillStyle = `rgba(216,219,224,${a})`;
      g.fillText(label, right ? Math.min(lx, W - 14) : lx, Math.min(ly, H - 14));
    }
    if ('letterSpacing' in g) g.letterSpacing = '0px';

    // shooting stars
    if (anim) {
      nextShot -= dt;
      if (nextShot <= 0) { spawnShot(); nextShot = 10 + Math.random() * 15; }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.life += dt;
        const p = s.life / s.dur;
        if (p >= 1) { shots.splice(i, 1); continue; }
        s.x += s.vx * s.speed * dt; s.y += s.vy * s.speed * dt;
        const env = Math.sin(Math.PI * p);
        const tx2 = s.x - s.vx * s.len * env, ty2 = s.y - s.vy * s.len * env;
        const gr = g.createLinearGradient(s.x, s.y, tx2, ty2);
        gr.addColorStop(0, `rgba(240,241,244,${0.75 * env})`);
        gr.addColorStop(1, 'rgba(240,241,244,0)');
        g.strokeStyle = gr;
        g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(tx2, ty2); g.stroke();
        g.globalAlpha = 0.8 * env;
        g.drawImage(clusters[0].sprite, s.x - 5, s.y - 5, 10, 10);
        g.globalAlpha = 1;
      }
    }
    dirty = false;
  }

  function settled() {
    return clusters.every((c) => {
      const target = selected < 0 ? 1 : c.index === selected ? 1.35 : 0.5;
      return Math.abs(c.focus - target) < 0.01 && Math.abs(c.lineA - (c.index === selected ? 1 : 0)) < 0.01 && (c.index !== selected || c.draw >= 1);
    });
  }

  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    t += dt;
    if (reduced && !dirty && settled()) return; // static sky: draw only when something changes
    render(dt);
  }

  function start() {
    if (running) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frameLoop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  layout();
  render(0.016);
  start();

  return {
    pause: stop,
    resume: start,
    dispose() {
      stop();
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('blur', onBlur);
      live.remove();
      if (tipEl) tipEl.hidden = true;
    },
  };
}
