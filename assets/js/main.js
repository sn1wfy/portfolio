// Boot. Every visual lives in its own module; a failure in one never takes the page down.
//
// Module contract (each module default-free, named exports only):
//   moon.js     initMoon(canvas, ctx)            -> { dispose() }   + getMoonPhase(date) -> { age, fraction, illumination, name }
//   crows.js    initCrows(layerEl, ctx)          -> { dispose() }
//   ambient.js  createAmbient()                  -> { start(): Promise, stop(), get playing() }
//   neon.js     initNeon(containerEl, ctx)       -> { dispose() }
//   truffle.js  initTruffle(canvas, ctx)         -> { dispose(), pause(), resume() }
//   stars.js    initStars(canvas, tipEl, ctx)    -> { dispose(), pause(), resume() }
//   terminal.js initTerminal(el, ctx)            -> { dispose() }
//
// ctx = { reducedMotion: boolean, isMobile: boolean }

const root = document.documentElement;
const ctx = {
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  isMobile: matchMedia('(max-width: 820px)').matches,
};

const $ = (s) => document.querySelector(s);

async function load(name, fn) {
  try {
    const mod = await import(`./${name}.js`);
    return await fn(mod);
  } catch (err) {
    console.warn(`[${name}] skipped:`, err);
    return null;
  }
}

/* ── Moon first: it is the page ─────────────────────────────── */
const moonReady = load('moon', async (m) => {
  const phase = m.getMoonPhase(new Date());
  const label = $('#moon-phase-label');
  if (label && phase) {
    label.textContent = `${phase.name} · ${Math.round(phase.illumination * 100)}% lit tonight`;
  }
  const inst = await m.initMoon($('#moon-canvas'), ctx);
  $('#moon-canvas').classList.add('is-live');
  return inst;
});

// Reveal the page once the moon has had a chance to draw (or after the fallback timer in <head>).
Promise.race([moonReady, new Promise((r) => setTimeout(r, 1200))]).then(() => root.classList.add('ready'));

/* ── Crows: drift in after the moon ─────────────────────────── */
moonReady.then(() => setTimeout(() => load('crows', (m) => m.initCrows($('#crow-layer'), ctx)), 900));

/* ── Lazy sections: only spin up WebGL / canvases when near view ── */
function whenNear(el, cb, margin = '300px') {
  if (!el) return;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); cb(); }
  }, { rootMargin: margin });
  io.observe(el);
}

function pauseOffscreen(el, inst) {
  if (!el || !inst || !inst.pause) return;
  new IntersectionObserver(([e]) => (e.isIntersecting ? inst.resume() : inst.pause())).observe(el);
}

whenNear($('#neon-wolf'), () => load('neon', (m) => m.initNeon($('#neon-wolf'), ctx)));
whenNear($('#truffle-canvas'), () => load('truffle', (m) => {
  const inst = m.initTruffle($('#truffle-canvas'), ctx);
  pauseOffscreen($('#truffle-canvas'), inst);
  return inst;
}));
whenNear($('#stars-canvas'), () => load('stars', (m) => {
  const inst = m.initStars($('#stars-canvas'), $('#stars-tip'), ctx);
  pauseOffscreen($('#stars-canvas'), inst);
  return inst;
}));
whenNear($('#term'), () => load('terminal', (m) => m.initTerminal($('#term'), ctx)));

/* ── Rail: scroll state, active section, mobile drawer ──────── */
const rail = $('#rail');
const toggle = $('#rail-toggle');

let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    rail.classList.toggle('scrolled', scrollY > 50);
    root.style.setProperty('--hero-shift', `${Math.min(scrollY * 0.25, 200)}px`);
    ticking = false;
  });
}, { passive: true });

const links = [...document.querySelectorAll('.rail-link')];
const sectionIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const id = e.target.id;
    links.forEach((l) => l.classList.toggle('active', l.dataset.section === id));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main > section').forEach((s) => sectionIO.observe(s));

function setDrawer(open) {
  rail.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
toggle.addEventListener('click', () => setDrawer(!rail.classList.contains('open')));
links.forEach((l) => l.addEventListener('click', () => setDrawer(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
document.addEventListener('click', (e) => {
  if (rail.classList.contains('open') && !rail.contains(e.target) && !toggle.contains(e.target)) setDrawer(false);
});

/* ── Night clock: Varna local time ──────────────────────────── */
const clockTime = $('#night-clock .clock-time');
const clockLine = $('#night-clock .clock-line');
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit', hour12: false });
function tick() {
  const t = fmt.format(new Date());
  const h = parseInt(t, 10);
  clockTime.textContent = t;
  clockLine.textContent =
    h < 5 ? 'Varna. Deep night. Probably still awake.' :
    h < 8 ? 'Varna. Dawn over the Black Sea.' :
    h < 12 ? 'Varna. Morning here.' :
    h < 18 ? 'Varna. Afternoon here.' :
    h < 22 ? 'Varna. Evening is falling.' :
             'Varna. It’s night here.';
}
tick();
setInterval(tick, 20_000);

/* ── Night sounds (off by default, loaded on first click) ───── */
let ambient = null;
const soundBtn = $('#sound-toggle');
soundBtn.addEventListener('click', async () => {
  if (!ambient) ambient = await load('ambient', (m) => m.createAmbient());
  if (!ambient) return;
  if (ambient.playing) { ambient.stop(); soundBtn.setAttribute('aria-pressed', 'false'); }
  else { await ambient.start(); soundBtn.setAttribute('aria-pressed', 'true'); }
});

/* ── Gentle reveal of content blocks ────────────────────────── */
const revealIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
}, { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.block .col, .interests li, .piece, .minor-work, .stack, .stars-frame, .term, .links li')
  .forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = `${(i % 6) * 60}ms`; revealIO.observe(el); });
