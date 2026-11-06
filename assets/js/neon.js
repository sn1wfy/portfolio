// BackMaster — the wolf-and-moon emblem as a cold-white neon sign on a dark brick wall.
//
// Everything is drawn with Canvas 2D. Expensive layers (wall, glow halos, light spill,
// hardware) are rendered once per size into offscreen canvases; a frame is just a
// handful of additive drawImage calls weighted by each tube's current brightness.
// The loop only runs while something is changing (power-on, a flicker, hover easing).
//
// initNeon(containerEl, ctx) -> { dispose() }

const DPR_CAP = 1.5;

// Emblem placement inside the square tile, as fractions of the tile size.
const EMBLEM = { size: 0.62, cx: 0.5, top: 0.105 };
const TEXT_Y = 0.865;           // baseline of the small BACKMASTER lettering

// Tube colour: 6500K white, the faintest blue-grey cast. Effectively silver.
const TUBE = '#8a9097';
const CORE = '#fbfcfd';
const HALO = 'rgba(206, 212, 220, 1)';

// Where the wolf tube lives (emblem units, 0..1000): everything else is moon.
function wolfRegion(c) {
  c.beginPath();
  c.rect(250, 220, 750, 780);
  c.clip();
  c.beginPath();
  c.arc(500, 500, 455, 0, Math.PI * 2);
  c.clip();
}

// Standoff targets (emblem units); each is snapped onto the nearest tube pixel.
const GROUPS = ['moon', 'wolf', 'text'];

const STANDOFFS = [
  [26, 520], [190, 150], [520, 10], [880, 140], [140, 852],
  [650, 118], [400, 625], [690, 535], [470, 255],
];
// Tube ends that disappear into an electrode housing: [x, y] in emblem units.
const ELECTRODES = [[402, 196], [849, 745], [312, 990]];

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h ?? w));
  return c;
}

// Cheap deterministic hash / value noise for the wall.
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function initNeon(container, ctx = {}) {
  const reduced = !!ctx.reducedMotion;
  const params = new URLSearchParams(location.search);
  const forceHover = params.get('hover') === '1';

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(canvas);
  const g = canvas.getContext('2d');

  let path = null;            // Path2D in emblem units
  let S = 0;                  // canvas size in px
  let L = null;               // prepared layers
  let raf = 0, flickerTimer = 0, disposed = false;
  let poweredAt = -1;         // performance.now() seconds when power-on began
  let visible = false;

  // Per-tube brightness state. moon powers a hair before the wolf.
  const tubes = {
    moon: { delay: 0.0, flick: null },
    wolf: { delay: 0.34, flick: null },
    text: { delay: 0.95, flick: null },
  };
  let hover = forceHover ? 1 : 0, hoverTarget = hover;

  /* ── path ─────────────────────────────────────────────── */
  function loadPath() {
    const el = document.getElementById('wolf-path');
    const d = el && el.getAttribute('d');
    if (d) return Promise.resolve(new Path2D(d));
    return fetch(new URL('../img/wolf-moon.svg', import.meta.url))
      .then((r) => r.text())
      .then((t) => {
        const m = t.match(/\sd="([^"]+)"/);
        return m ? new Path2D(m[1]) : null;
      });
  }

  /* ── layer construction ───────────────────────────────── */
  function emblemXf(c, scale = 1) {
    const E = S * EMBLEM.size * scale;
    const x0 = (S * EMBLEM.cx - (S * EMBLEM.size) / 2) * scale;
    const y0 = S * EMBLEM.top * scale;
    c.setTransform(E / 1000, 0, 0, E / 1000, x0, y0);
    return E / 1000; // px per emblem unit
  }

  // Draw the tube silhouette (filled ink + rounded stroke so it reads as a glass tube).
  function tubeShape(c, which, lw, scale = 1) {
    c.save();
    emblemXf(c, scale);
    if (which === 'text') { c.restore(); drawText(c, lw, scale); return; }
    if (which === 'wolf') wolfRegion(c);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.fill(path, 'evenodd');
    if (lw > 0) { c.lineWidth = lw; c.stroke(path); }
    c.restore();
    if (which === 'moon') {
      // moon = everything outside the wolf region
      c.save();
      c.globalCompositeOperation = 'destination-out';
      emblemXf(c, scale);
      wolfRegion(c);
      c.fillStyle = '#000';
      c.fillRect(0, 0, 1000, 1000);
      c.restore();
    }
  }

  function shapeCanvas(which, lw, color, scale = 1) {
    const c = mk(S * scale);
    const x = c.getContext('2d');
    x.fillStyle = color; x.strokeStyle = color;
    tubeShape(x, which, lw, scale);
    return c;
  }

  // "BACKMASTER" in thin tube lettering under the emblem (units: thousandths of the tile).
  const WORD = 'BACKMASTER';
  const FONT = '300 26px "JetBrains Mono", ui-monospace, monospace';
  function drawText(c, lw, scale) {
    c.save();
    const k = (S * scale) / 1000;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.font = FONT;
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.lineWidth = Math.max(0.3, lw * 0.06);
    const track = 13;
    const widths = [...WORD].map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (WORD.length - 1);
    let x = 500 - total / 2;
    const y = 1000 * TEXT_Y;
    [...WORD].forEach((ch, i) => {
      c.fillText(ch, x, y);
      c.strokeText(ch, x, y);
      x += widths[i] + track;
    });
    c.restore();
  }

  // Blurred copy of a shape canvas using the shadow trick (works everywhere, unlike ctx.filter).
  function halo(dst, src, blurPx, color, alpha = 1) {
    const x = dst.getContext('2d');
    const off = dst.width * 3;
    x.save();
    x.globalAlpha = alpha;
    x.shadowColor = color;
    x.shadowBlur = blurPx;
    x.shadowOffsetX = off;
    x.drawImage(src, -off, 0, dst.width, dst.height);
    x.restore();
  }

  function buildWall() {
    // Albedo: painted brick, very dark, with mortar recess and concrete mottling.
    const alb = mk(S);
    const a = alb.getContext('2d');
    const bh = S / 15.5, bw = bh * 3.25, mortar = Math.max(1, bh * 0.085);
    a.fillStyle = '#4a4a4c';
    a.fillRect(0, 0, S, S);
    const rows = Math.ceil(S / bh) + 1;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5 - bw * 0.25;
      for (let cx = -1; cx < S / bw + 1; cx++) {
        const t = hash2(r, cx, 7);
        const v = 112 + t * 26 | 0;
        a.fillStyle = `rgb(${v},${v},${v + 1})`;
        const x = cx * bw + off + mortar / 2, y = r * bh + mortar / 2;
        a.fillRect(x, y, bw - mortar, bh - mortar);
        // bevel: lower edge catches less light, upper edge a touch more (light is in front & above)
        a.fillStyle = 'rgba(0,0,0,0.18)';
        a.fillRect(x, y + bh - mortar * 2.2, bw - mortar, mortar * 1.2);
        a.fillStyle = 'rgba(255,255,255,0.05)';
        a.fillRect(x, y, bw - mortar, mortar * 0.9);
      }
    }
    // Mottling + grain via a small noise tile, multiplied in.
    const N = 256;
    const nt = mk(N);
    const nx = nt.getContext('2d');
    const img = nx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const lo = vnoise(x / 22, y / 22, 3) * 0.6 + vnoise(x / 7, y / 7, 5) * 0.4;
        const gr = hash2(x, y, 11);
        let v = 150 + lo * 80 + (gr - 0.5) * 70;
        if (gr > 0.985) v -= 70;            // pits
        v = Math.max(0, Math.min(255, v));
        const i = (y * N + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    nx.putImageData(img, 0, 0);
    a.save();
    a.globalCompositeOperation = 'multiply';
    a.fillStyle = a.createPattern(nt, 'repeat');
    const sc = Math.max(1, S / 700);
    a.setTransform(sc, 0, 0, sc, 0, 0);
    a.fillRect(0, 0, S / sc, S / sc);
    a.restore();
    // Large-scale unevenness (old paint)
    a.save();
    a.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 9; i++) {
      const x = hash2(i, 1, 21) * S, y = hash2(i, 2, 21) * S, r = S * (0.15 + hash2(i, 3, 21) * 0.3);
      const gr = a.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(150,150,150,0.5)');
      gr.addColorStop(1, 'rgba(150,150,150,0)');
      a.fillStyle = gr;
      a.fillRect(0, 0, S, S);
    }
    a.restore();

    return alb;
  }

  function build() {
    const r = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    S = Math.max(64, Math.round(Math.min(r.width, r.height || r.width) * dpr));
    canvas.width = canvas.height = S;

    const px = (S * EMBLEM.size) / 1000;      // px per emblem unit
    const H = 0.5;                            // resolution of the soft layers
    const hS = Math.round(S * H);
    const alb = buildWall();

    // Base wall: albedo in near-darkness, cold moonlight from the top-left, vignette.
    const base = mk(S);
    const b = base.getContext('2d');
    b.fillStyle = '#0a0a0b';
    b.fillRect(0, 0, S, S);
    b.globalAlpha = 0.075;
    b.drawImage(alb, 0, 0);
    b.globalAlpha = 1;
    let gr = b.createRadialGradient(S * 0.1, -S * 0.1, 0, S * 0.1, -S * 0.1, S * 1.2);
    gr.addColorStop(0, 'rgba(200,204,210,0.05)');
    gr.addColorStop(1, 'rgba(200,204,210,0)');
    b.fillStyle = gr; b.fillRect(0, 0, S, S);

    const layers = { base, groups: {} };

    for (const which of GROUPS) {
      // Soft layer (half-res): light spilled onto the wall (halo × albedo).
      const shapeH = shapeCanvas(which, 12, '#fff', H);
      const lightMask = mk(hS);
      for (let i = 0; i < 2; i++) {
        halo(lightMask, shapeH, hS * 0.03, 'rgba(255,255,255,1)');
        halo(lightMask, shapeH, hS * 0.08, 'rgba(255,255,255,1)');
        halo(lightMask, shapeH, hS * 0.18, 'rgba(255,255,255,0.8)');
      }
      const spill = mk(hS);
      const sx = spill.getContext('2d');
      sx.drawImage(lightMask, 0, 0);
      // light falls on the wall: multiply by albedo, keep the light's alpha
      sx.globalCompositeOperation = 'multiply';
      sx.drawImage(alb, 0, 0, hS, hS);
      sx.globalCompositeOperation = 'destination-in';
      sx.drawImage(lightMask, 0, 0);
      sx.globalCompositeOperation = 'source-over';

      // Wide halo in the air (the "atmosphere" glow you see in photos).
      const wide = mk(hS);
      halo(wide, shapeH, hS * 0.022, HALO, 0.4);
      halo(wide, shapeH, hS * 0.05, HALO, 0.38);
      halo(wide, shapeH, hS * 0.11, HALO, 0.2);

      // Sharp layer (full res): tube body + hot core + tight halo.
      const lit = mk(S);
      const lx = lit.getContext('2d');
      const tube = shapeCanvas(which, 8.5, TUBE);
      const core = shapeCanvas(which, 0.8, CORE);
      halo(lit, tube, S * 0.011, 'rgba(215,220,226,0.5)');
      halo(lit, tube, S * 0.0035, 'rgba(232,236,240,0.3)');
      lx.drawImage(tube, 0, 0);
      halo(lit, core, S * 0.0022, 'rgba(255,255,255,0.8)');
      lx.drawImage(core, 0, 0);

      layers.groups[which] = { soft: spill, wide, lit };
    }

    // Unlit glass: what you see when the gas isn't conducting.
    const glass = shapeCanvas('all', 8.5, 'rgba(92,95,100,0.55)');
    const gx = glass.getContext('2d');
    gx.save();
    gx.globalCompositeOperation = 'source-atop';
    gx.fillStyle = 'rgba(160,164,170,0.35)';
    emblemXf(gx);
    gx.lineWidth = 2.5;
    gx.translate(-1.5, -2);
    gx.stroke(path);
    gx.restore();
    layers.glass = glass;

    buildHardware(layers, px);
    L = layers;
  }

  // Standoffs behind the tube, clips over it, electrode housings at the tube ends.
  function buildHardware(layers, px) {
    const mask = shapeCanvas('all', 8.5, '#fff');
    const md = mask.getContext('2d').getImageData(0, 0, S, S).data;
    const E = S * EMBLEM.size, x0 = S * EMBLEM.cx - E / 2, y0 = S * EMBLEM.top;
    const toPx = ([u, v]) => [x0 + (u * E) / 1000, y0 + (v * E) / 1000];
    const on = (x, y) => x >= 0 && y >= 0 && x < S && y < S && md[((y | 0) * S + (x | 0)) * 4 + 3] > 180;

    function snap(p) {
      const [tx, ty] = toPx(p);
      const R = Math.round(px * 40);
      let best = null, bd = Infinity;
      for (let dy = -R; dy <= R; dy += 1) {
        for (let dx = -R; dx <= R; dx += 1) {
          const d = dx * dx + dy * dy;
          if (d < bd && on(tx + dx, ty + dy)) { bd = d; best = [tx + dx, ty + dy]; }
        }
      }
      if (!best) return null;
      // local principal direction of the tube + centre it across its width
      const r = Math.max(4, Math.round(px * 16));
      let sx = 0, sy = 0, n = 0, sxx = 0, syy = 0, sxy = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r || !on(best[0] + dx, best[1] + dy)) continue;
          sx += dx; sy += dy; n++; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        }
      }
      const mx = sx / n, my = sy / n;
      const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      return { x: best[0] + mx, y: best[1] + my, ang };
    }

    const back = mk(S), front = mk(S);
    const bx = back.getContext('2d'), fx = front.getContext('2d');
    const sr = Math.max(2.5, S * 0.0105);

    for (const p of STANDOFFS) {
      const s = snap(p);
      if (!s) continue;
      // contact shadow on the wall
      let gr = bx.createRadialGradient(s.x + sr * 0.5, s.y + sr * 0.8, 0, s.x + sr * 0.5, s.y + sr * 0.8, sr * 2.4);
      gr.addColorStop(0, 'rgba(0,0,0,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      bx.fillStyle = gr;
      bx.fillRect(s.x - sr * 4, s.y - sr * 4, sr * 8, sr * 8);
      // the post: a small dark cylinder seen end-on
      gr = bx.createRadialGradient(s.x - sr * 0.3, s.y - sr * 0.35, sr * 0.1, s.x, s.y, sr);
      gr.addColorStop(0, '#4a4c50');
      gr.addColorStop(0.6, '#26272a');
      gr.addColorStop(1, '#151517');
      bx.fillStyle = gr;
      bx.beginPath(); bx.arc(s.x, s.y, sr, 0, Math.PI * 2); bx.fill();
      bx.strokeStyle = 'rgba(255,255,255,0.08)';
      bx.lineWidth = Math.max(0.6, S * 0.0009);
      bx.stroke();
      // clip strap across the tube
      fx.save();
      fx.translate(s.x, s.y);
      fx.rotate(s.ang + Math.PI / 2);
      const w = px * 26, t = Math.max(1.2, px * 3.4);
      fx.fillStyle = 'rgba(30,31,34,0.82)';
      fx.fillRect(-w / 2, -t / 2, w, t);
      fx.fillStyle = 'rgba(255,255,255,0.10)';
      fx.fillRect(-w / 2, -t / 2, w, t * 0.35);
      fx.restore();
    }

    for (const p of ELECTRODES) {
      const s = snap(p);
      if (!s) continue;
      // which way does the tube continue? probe along ±direction
      const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
      let a = s.ang;
      let fwd = 0, bwd = 0;
      for (let k = 6; k < 40; k += 2) {
        if (on(s.x + ca * k * px, s.y + sa * k * px)) fwd++;
        if (on(s.x - ca * k * px, s.y - sa * k * px)) bwd++;
      }
      if (fwd > bwd) a += Math.PI; // housing points away from the lit tube
      const len = px * 34, wd = px * 17;
      fx.save();
      fx.translate(s.x, s.y);
      fx.rotate(a);
      // shadow
      fx.fillStyle = 'rgba(0,0,0,0.45)';
      fx.beginPath();
      fx.roundRect(-len * 0.15 + wd * 0.15, -wd / 2 + wd * 0.3, len, wd, wd / 2);
      fx.fill();
      const lg = fx.createLinearGradient(0, -wd / 2, 0, wd / 2);
      lg.addColorStop(0, '#3b3c40');
      lg.addColorStop(0.35, '#1d1e21');
      lg.addColorStop(1, '#0e0e10');
      fx.fillStyle = lg;
      fx.beginPath();
      fx.roundRect(-len * 0.15, -wd / 2, len, wd, wd / 2);
      fx.fill();
      fx.strokeStyle = 'rgba(255,255,255,0.07)';
      fx.lineWidth = Math.max(0.6, S * 0.0009);
      fx.stroke();
      fx.restore();
    }
    layers.back = back;
    layers.front = front;
  }

  /* ── brightness over time ─────────────────────────────── */
  // Power-on: stuttering strikes before the gas holds. [t (s), level]
  const STRIKE = [
    [0, 0], [0.04, 0.6], [0.075, 0.05], [0.2, 0], [0.235, 0.85], [0.27, 0.25],
    [0.31, 0.7], [0.34, 0.05], [0.52, 0.02], [0.55, 0.92], [0.6, 0.55], [0.66, 1],
    [0.74, 0.86], [0.82, 1],
  ];
  const STRIKE_END = 0.82;

  function curve(pts, t) {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
        return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
      }
    }
    return pts[pts.length - 1][1];
  }

  function level(tb, now) {
    if (poweredAt < 0) return 0;
    if (reduced) return 1;
    const t = now - poweredAt - tb.delay;
    if (t < 0) return 0;
    let v = curve(STRIKE, t);
    if (t < STRIKE_END + 0.7) {
      // electrical hum while the tube settles: fine ripple, decaying
      const k = Math.max(0, 1 - (t - STRIKE_END) / 0.7);
      v *= 1 - 0.06 * k * (0.5 + 0.5 * Math.sin(now * 2 * Math.PI * 50)) * Math.random();
    }
    if (tb.flick) {
      const ft = now - tb.flick.t0;
      if (ft > tb.flick.pts[tb.flick.pts.length - 1][0]) tb.flick = null;
      else v *= curve(tb.flick.pts, ft);
    }
    return v;
  }

  function busy(now) {
    if (poweredAt < 0) return false;
    const settle = tubes.text.delay + STRIKE_END + 0.75;
    if (!reduced && now - poweredAt < settle) return true;
    if (GROUPS.some((k) => tubes[k].flick)) return true;
    return Math.abs(hover - hoverTarget) > 0.002;
  }

  /* ── frame ────────────────────────────────────────────── */
  let lastT = 0;
  function frame(ms) {
    raf = 0;
    if (disposed || !L) return;
    const now = ms / 1000;
    const dt = Math.min(0.1, lastT ? now - lastT : 0.016);
    lastT = now;
    hover += (hoverTarget - hover) * (1 - Math.exp(-dt * 7));
    if (Math.abs(hover - hoverTarget) < 0.002) hover = hoverTarget;

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(L.base, 0, 0);

    const lv = {};
    for (const k of GROUPS) lv[k] = level(tubes[k], now) * (k === 'text' ? 0.62 : 1);
    g.globalCompositeOperation = 'lighter';
    for (const k of GROUPS) {
      const v = lv[k];
      if (v <= 0.001) continue;
      const G = L.groups[k];
      g.globalAlpha = Math.min(1, v * (0.8 + 0.2 * hover));
      g.drawImage(G.soft, 0, 0, S, S);
      g.drawImage(G.soft, 0, 0, S, S);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(L.back, 0, 0);
    g.drawImage(L.glass, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (const k of GROUPS) {
      const v = lv[k];
      if (v <= 0.001) continue;
      const G = L.groups[k];
      g.globalAlpha = Math.min(1, v);
      g.drawImage(G.lit, 0, 0);
      g.globalAlpha = Math.min(1, v * (0.62 + 0.3 * hover));
      g.drawImage(G.wide, 0, 0, S, S);
      if (hover > 0.01) {
        // hover: the halo widens and the tube runs a touch hotter
        g.globalAlpha = Math.min(1, v * 0.2 * hover);
        g.drawImage(G.wide, -S * 0.01, -S * 0.01, S * 1.02, S * 1.02);
        g.globalAlpha = Math.min(1, v * 0.08 * hover);
        g.drawImage(G.lit, 0, 0);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(L.front, 0, 0);

    if (busy(now)) kick();
  }

  function kick() {
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  }

  /* ── behaviour ────────────────────────────────────────── */
  function powerOn() {
    if (poweredAt >= 0) return;
    poweredAt = performance.now() / 1000;
    kick();
    scheduleFlicker();
  }

  const FLICKS = [
    [[0, 1], [0.03, 0.25], [0.06, 0.95], [0.1, 0.1], [0.15, 1]],
    [[0, 1], [0.04, 0.4], [0.09, 1]],
    [[0, 1], [0.02, 0.08], [0.05, 0.08], [0.07, 0.8], [0.1, 0.3], [0.17, 1], [0.24, 0.7], [0.3, 1]],
  ];
  function scheduleFlicker() {
    if (reduced || disposed) return;
    clearTimeout(flickerTimer);
    flickerTimer = setTimeout(() => {
      if (visible && !document.hidden) {
        const k = Math.random() < 0.6 ? 'wolf' : 'moon';
        tubes[k].flick = { t0: performance.now() / 1000, pts: FLICKS[(Math.random() * FLICKS.length) | 0] };
        kick();
      }
      scheduleFlicker();
    }, 8000 + Math.random() * 12000);
  }

  const tile = container.parentElement || container;
  const onEnter = () => { hoverTarget = 1; kick(); };
  const onLeave = () => { if (!forceHover) { hoverTarget = 0; kick(); } };
  tile.addEventListener('pointerenter', onEnter);
  tile.addEventListener('pointerleave', onLeave);

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && L) powerOn();
  }, { threshold: 0.35 });

  let rzTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if (!path || disposed) return;
      const r = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      if (Math.abs(Math.round(r.width * dpr) - S) < 2) return;
      build();
      kick();
    }, 120);
  });

  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(FONT, WORD).catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();

  Promise.all([loadPath(), fontReady]).then(([p]) => {
    if (disposed || !p) return;
    path = p;
    build();
    kick();
    io.observe(container);
    ro.observe(container);
  }).catch((err) => console.warn('[neon] emblem unavailable', err));

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(flickerTimer);
      clearTimeout(rzTimer);
      io.disconnect();
      ro.disconnect();
      tile.removeEventListener('pointerenter', onEnter);
      tile.removeEventListener('pointerleave', onLeave);
      canvas.remove();
      L = null;
    },
  };
}
