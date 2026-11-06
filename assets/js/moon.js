// The moon. A shader-lit sphere wearing NASA/USGS lunar maps.
//
//   getMoonPhase(date)      -> { age, fraction, illumination, name }
//   initMoon(canvas, ctx)   -> Promise<{ dispose() }>
//
// Shading is a Lunar-Lambert BRDF (McEwen 1991) with a Hapke-style opposition surge,
// normal mapped from LOLA topography, with short horizon-marched shadows so crater rims
// throw long shadows near the terminator. Night side gets a faint earthshine.
//
// Debug hook: ?phase=0.25 (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter).

import * as THREE from 'three';

const SYNODIC = 29.530588853;
const EPOCH_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const TAU = Math.PI * 2;
const IMG = new URL('../img/moon/', import.meta.url);

/* ── Phase ──────────────────────────────────────────────────── */

export function getMoonPhase(date = new Date()) {
  const days = (date.getTime() - EPOCH_NEW_MOON) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const fraction = age / SYNODIC;
  return describePhase(fraction);
}

function describePhase(fraction) {
  const f = ((fraction % 1) + 1) % 1;
  const illumination = (1 - Math.cos(TAU * f)) / 2;
  const w = 1 / SYNODIC; // ~one day either side of the principal phases
  let name;
  if (f < w || f > 1 - w) name = 'New Moon';
  else if (f < 0.25 - w) name = 'Waxing Crescent';
  else if (f <= 0.25 + w) name = 'First Quarter';
  else if (f < 0.5 - w) name = 'Waxing Gibbous';
  else if (f <= 0.5 + w) name = 'Full Moon';
  else if (f < 0.75 - w) name = 'Waning Gibbous';
  else if (f <= 0.75 + w) name = 'Last Quarter';
  else name = 'Waning Crescent';
  return { age: f * SYNODIC, fraction: f, illumination, name };
}

function debugFraction() {
  try {
    const v = new URLSearchParams(location.search).get('phase');
    if (v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? ((n % 1) + 1) % 1 : null;
  } catch { return null; }
}

// Sun direction (world space, camera looks down -Z, +X right, +Y up).
// fraction 0.25 -> lit from the right (waxing, northern-hemisphere view).
// Near new moon, clamp so a thin crescent + earthshine always remains.
function sunDirection(fraction) {
  let th = TAU * fraction;
  const minTh = Math.acos(1 - 2 * 0.085);   // keep >= ~8.5% lit
  const maxTh = TAU - minTh;
  const minFull = 3 * Math.PI / 180;        // keep a sliver of shading at the limb at full
  if (th < minTh) th = minTh;
  if (th > maxTh) th = maxTh;
  if (Math.abs(th - Math.PI) < minFull) th = Math.PI + (th >= Math.PI ? minFull : -minFull);
  const v = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
  // A small tilt of the terminator reads more natural than a perfect vertical.
  v.applyAxisAngle(new THREE.Vector3(0, 0, 1), (Math.sin(th) >= 0 ? 1 : -1) * 0.16);
  return { dir: v.normalize(), illum: (1 - Math.cos(th)) / 2, phaseAngle: Math.PI - th };
}

/* ── Shaders ───────────────────────────────────────────────── */

// Relief texture packs: R,G = tangent-space normal XY (east, north) ; B = height (8-bit).
const HEIGHT_LO = -9200, HEIGHT_HI = 10900, MOON_R = 1737400;
const H_ZERO = (0 - HEIGHT_LO) / (HEIGHT_HI - HEIGHT_LO);
const H_SPAN = (HEIGHT_HI - HEIGHT_LO) / MOON_R; // one unit of B in moon radii

const COMMON = /* glsl */`
  #define PI 3.141592653589793
  vec2 sphUV(vec3 p) {
    return vec2(0.5 + atan(p.x, p.z) / (2.0 * PI), 0.5 + asin(clamp(p.y, -1.0, 1.0)) / PI);
  }
`;

const moonVert = /* glsl */`
  ${COMMON}
  uniform sampler2D uRelief;
  uniform float uDisp;
  varying vec3 vObj;
  void main() {
    vec3 p = normalize(position);
    float h = textureLod(uRelief, sphUV(p), 1.5).b;
    vec3 pos = p * (1.0 + (h - ${H_ZERO.toFixed(5)}) * uDisp);
    vObj = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const moonFrag = /* glsl */`
  ${COMMON}
  uniform sampler2D uAlbedoLo;
  uniform sampler2D uAlbedoHi;
  uniform sampler2D uRelief;
  uniform float uHiMix;
  uniform float uReliefAmt;
  uniform mat3 uRot;          // object -> world rotation
  uniform vec3 uSun;          // world-space direction to the sun
  uniform float uPhase;       // phase angle (radians), 0 = full
  uniform float uExposure;
  uniform float uEarthshine;
  uniform float uNormalStrength;
  uniform float uShadowExag;
  uniform float uDim;
  varying vec3 vObj;

  const int STEPS = ${'${STEPS}'};

  float hMap(vec2 uv, float lod) { return textureLod(uRelief, uv, lod).b; }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec3 p = normalize(vObj);
    vec2 uv = sphUV(p);
    // seam-safe gradients for the atan() wrap
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5); dy.x -= floor(dy.x + 0.5);

    float aLo = texture(uAlbedoLo, uv).r;
    float aHi = textureGrad(uAlbedoHi, uv, dx, dy).r;
    float albedo = mix(aLo, aHi, uHiMix);

    vec3 rel = textureGrad(uRelief, uv, dx, dy).rgb;

    // tangent frame on the sphere (object space)
    vec3 E = cross(vec3(0.0, 1.0, 0.0), p);
    E = length(E) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(E);
    vec3 Nn = cross(p, E);

    vec2 nxy = (rel.rg * 2.0 - 1.0) * uNormalStrength * uReliefAmt;
    vec3 nT = normalize(vec3(nxy, 1.0));
    vec3 nObj = normalize(E * nT.x + Nn * nT.y + p * nT.z);

    vec3 nW = normalize(uRot * nObj);
    vec3 gW = normalize(uRot * p);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(uSun);

    float mu0g = dot(gW, L);          // geometric incidence (terminator)
    float mu0 = dot(nW, L);
    float mu = max(dot(nW, V), 0.0);
    float muG = max(dot(gW, V), 0.0);

    // Lunar-Lambert, McEwen (1991): L(alpha) polynomial, alpha in degrees.
    float a = degrees(uPhase);
    float Lp = clamp(1.0 - 0.019 * a + 2.42e-4 * a * a - 1.46e-6 * a * a * a, 0.0, 1.0);
    float i0 = max(mu0, 0.0);
    float ll = 2.0 * Lp * i0 / (i0 + max(mu, 0.02) + 1e-4) + (1.0 - Lp) * i0;

    // Hapke opposition surge: B(a) = 1 + B0 / (1 + tan(a/2)/h)
    float surge = 1.0 + 0.55 / (1.0 + tan(uPhase * 0.5) / 0.06);

    // Soft terminator: the sun is a 0.5 deg disc, plus a little atmospheric-free penumbra blur.
    float term = smoothstep(-0.035, 0.03, mu0g);

    // Horizon-marched shadows (only matter when the sun is low over the local horizon).
    float shadow = 1.0;
    vec3 Lo = transpose(uRot) * L;
    vec3 Lt = vec3(dot(Lo, E), dot(Lo, Nn), dot(Lo, p));
    float lh = length(Lt.xy);
    if (uReliefAmt > 0.0 && mu0g > -0.06 && Lt.z < 0.42 && lh > 1e-4) {
      vec2 d2 = Lt.xy / lh;
      float slope = Lt.z / lh;
      float cl = max(cos(asin(clamp(p.y, -1.0, 1.0))), 0.06);
      float h0 = (rel.b - ${H_ZERO.toFixed(5)}) * ${H_SPAN.toFixed(6)} * uShadowExag;
      float occ = -1.0;
      for (int i = 1; i <= STEPS; i++) {
        float s = float(i) / float(STEPS);
        float t = 0.075 * s * s + 0.0025 * s;                // distance along surface, in radii
        vec2 o = vec2(d2.x * t / (2.0 * PI * cl), d2.y * t / PI);
        float hs = (hMap(uv + o, 0.0 + 2.0 * s) - ${H_ZERO.toFixed(5)}) * ${H_SPAN.toFixed(6)} * uShadowExag;
        // terrain above the sun ray, including the sphere's curvature falling away
        occ = max(occ, (hs - h0) - t * slope - 0.5 * t * t);
      }
      float soft = 0.0009 + 0.004 * clamp(slope, 0.0, 1.0);
      float sh = 1.0 - smoothstep(-soft * 0.25, soft, occ);
      shadow = mix(sh, 1.0, smoothstep(0.30, 0.42, Lt.z)) ;
      shadow = mix(1.0, shadow, uReliefAmt * smoothstep(0.04, 0.22, muG));
    }

    float sunlit = albedo * ll * surge * term * shadow;

    // Earthshine: Earth is (nearly) at the viewer, so it lights the disc face-on.
    float es = albedo * (Lp * 2.0 * muG / (2.0 * muG + 1e-3) * 0.5 + (1.0 - Lp) * muG) * 0.55 + albedo * 0.45 * muG;
    float night = 1.0 - smoothstep(-0.25, 0.08, mu0g);
    vec3 earthshine = vec3(0.86, 0.90, 0.97) * es * uEarthshine * night;

    vec3 col = vec3(0.985, 0.99, 1.0) * sunlit * uExposure + earthshine;
    col = aces(col);
    // limb: a hair of softening so the silhouette sits into the halo
    col *= mix(0.86, 1.0, smoothstep(0.0, 0.18, muG));
    col = toSRGB(col) * uDim;
    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const haloVert = /* glsl */`
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFrag = /* glsl */`
  uniform float uIntensity;
  uniform vec2 uLitDir;     // screen-space direction to lit limb
  uniform float uLitBias;   // 0 = round halo, 1 = strongly lit-side
  varying vec2 vP;          // in moon radii
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float r = length(vP);
    if (r < 0.985) discard;
    float d = max(r - 1.0, 0.0);
    float g = 0.34 * exp(-d * 9.0) + 0.13 * exp(-d * 2.6) + 0.05 * exp(-d * 0.75);
    vec2 dir = vP / max(r, 1e-4);
    float side = clamp(dot(dir, uLitDir) * 0.5 + 0.5, 0.0, 1.0);
    g *= mix(1.0, 0.04 + 1.3 * pow(side, 2.2), uLitBias);
    g *= smoothstep(0.985, 1.01, r);
    g *= 1.0 - smoothstep(4.2, 5.0, r);
    vec3 c = vec3(0.80, 0.83, 0.88) * g * uIntensity;
    c += (hash(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
  }
`;

const starVert = /* glsl */`
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  void main() {
    float tw = 0.65 + 0.35 * sin(uTime * (0.25 + aSeed * 0.5) + aSeed * 40.0);
    vA = (0.25 + aSeed * 0.5) * tw;
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const starFrag = /* glsl */`
  uniform float uFade;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vec3(0.82, 0.85, 0.9) * a * vA * uFade, 1.0);
  }
`;

/* ── Fallback (no WebGL) ───────────────────────────────────── */

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

function initFallback(canvas, ctx, fraction) {
  const g = canvas.getContext('2d');
  if (!g) return { dispose() {} };
  const { illum } = sunDirection(fraction);
  const waxing = fraction < 0.5;
  let raf = 0;
  const draw = () => {
    raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, h);
    const lay = layout(w, h, ctx);
    const { cx, cy, R, dim } = lay;
    const halo = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 2.4);
    halo.addColorStop(0, `rgba(200,206,214,${0.09 * dim * (0.35 + 0.65 * illum)})`);
    halo.addColorStop(1, 'rgba(200,206,214,0)');
    g.fillStyle = halo; g.fillRect(0, 0, w, h);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = `rgba(22,23,26,${dim})`; g.fill();
    // lit part: limb half-circle + elliptical terminator
    const k = 1 - 2 * illum; // terminator x-scale (1 at new, -1 at full)
    g.save();
    g.translate(cx, cy);
    if (!waxing) g.scale(-1, 1);
    g.beginPath();
    g.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    const lit = g.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.1, 0, 0, R);
    lit.addColorStop(0, `rgba(214,216,220,${dim})`);
    lit.addColorStop(1, `rgba(168,171,176,${dim})`);
    g.fillStyle = lit; g.fill();
    g.restore();
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(draw); };
  draw();
  addEventListener('resize', req);
  addEventListener('scroll', req, { passive: true });
  return { dispose() { removeEventListener('resize', req); removeEventListener('scroll', req); cancelAnimationFrame(raf); } };
}

/* ── Layout (shared by GL + fallback) ──────────────────────── */

function layout(w, h, ctx) {
  const mobile = w < 820 || ctx.isMobile;
  const railOffset = mobile ? 0 : 38;
  const baseR = mobile ? Math.min(w * 0.35, h * 0.27) : Math.min(w, h) * 0.255;
  const s = Math.min(Math.max((window.scrollY || 0) / Math.max(h, 1), 0), 1);
  const e = 1 - (1 - s) * (1 - s); // ease-out
  const scale = 1 - 0.45 * e;
  // Hero: centre ~42% from the top, but always clear of the title block (bottom ~38% of the hero).
  const heroCy = Math.min(h * 0.42, h * 0.615 - baseR);
  const cy = heroCy + (h * 0.24 - heroCy) * e;
  // Once you leave the hero, the moon slides into the empty right side so it never sits behind a headline.
  const heroCx = w / 2 + railOffset;
  const restCx = mobile ? heroCx : w * 0.8;
  const out = {
    cx: heroCx + (restCx - heroCx) * e,
    cy,
    R: baseR * scale,
    dim: 1 - (mobile ? 0.65 : 0.5) * e,
    scroll: e,
    mobile,
  };
  window.__moon = { x: out.cx, y: out.cy, r: out.R }; // crows.js reads this to fly across the disc
  return out;
}

/* ── Main ──────────────────────────────────────────────────── */

function loadTexture(url, srgb) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      resolve(t);
    }, undefined, reject);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function initMoon(canvas, ctx = {}) {
  ctx = { reducedMotion: false, isMobile: false, ...ctx };
  const dbg = debugFraction();
  const fraction = dbg ?? getMoonPhase(new Date()).fraction;

  if (!canvas) return { dispose() {} };
  if (!webglAvailable()) return initFallback(canvas, ctx, fraction);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('[moon] WebGL failed, using 2D fallback', err);
    return initFallback(canvas, ctx, fraction);
  }
  renderer.setClearColor(0x0b0b0c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace; // our shaders write display-referred values directly

  const mobileGPU = ctx.isMobile || innerWidth < 820;
  const dprCap = mobileGPU ? 1.5 : 1.75;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  camera.position.set(0, 0, 3000);

  // Placeholder relief: flat normal, mean height.
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, Math.round(H_ZERO * 255), 255]), 1, 1);
  flat.needsUpdate = true;
  const grey = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255]), 1, 1);
  grey.colorSpace = THREE.SRGBColorSpace; grey.needsUpdate = true;

  const sun = sunDirection(fraction);

  /* moon */
  const seg = mobileGPU ? [160, 80] : [256, 128];
  const geo = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const uniforms = {
    uAlbedoLo: { value: grey },
    uAlbedoHi: { value: grey },
    uRelief: { value: flat },
    uHiMix: { value: 0 },
    uReliefAmt: { value: 0 },
    uRot: { value: new THREE.Matrix3() },
    uSun: { value: sun.dir.clone() },
    uPhase: { value: Math.max(sun.phaseAngle, 0) },
    uExposure: { value: 1 },
    uEarthshine: { value: 0 },
    uNormalStrength: { value: 1.25 },
    uShadowExag: { value: 1.6 },
    uDisp: { value: H_SPAN * 1.4 },
    uDim: { value: 1 },
  };
  const phaseDeg = Math.abs(sun.phaseAngle) * 180 / Math.PI;
  // Exposure: full moon is ~10x the quarter in reality; compress that so every phase reads well.
  const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  uniforms.uExposure.value = 0.72 + 1.8 * sstep(0, 90, phaseDeg) + 4.2 * sstep(90, 150, phaseDeg);
  uniforms.uPhase.value = Math.abs(sun.phaseAngle);
  uniforms.uEarthshine.value = 0.026 * (0.25 + 0.75 * (1 - sun.illum));

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: moonVert,
    fragmentShader: moonFrag.replace('${STEPS}', mobileGPU ? '10' : '16'),
  });
  const moon = new THREE.Mesh(geo, mat);
  scene.add(moon);

  /* halo */
  const haloGeo = new THREE.PlaneGeometry(10, 10);
  const litDir2 = new THREE.Vector2(sun.dir.x, sun.dir.y);
  if (litDir2.lengthSq() < 1e-6) litDir2.set(1, 0);
  litDir2.normalize();
  const haloU = {
    uIntensity: { value: 0.35 + 0.65 * sun.illum },
    uLitDir: { value: litDir2 },
    uLitBias: { value: Math.min(1, Math.pow(1 - sun.illum, 0.7) * 1.1) },
  };
  const halo = new THREE.Mesh(haloGeo, new THREE.ShaderMaterial({
    uniforms: haloU, vertexShader: haloVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.position.z = -2000;
  scene.add(halo);

  /* stars */
  const nStars = mobileGPU ? 46 : 90;
  const sp = new Float32Array(nStars * 3), ss = new Float32Array(nStars), sd = new Float32Array(nStars);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < nStars; i++) {
    sp[i * 3] = rnd(); sp[i * 3 + 1] = rnd(); sp[i * 3 + 2] = -2500;
    const r = rnd();
    ss[i] = 1.4 + r * r * 2.2;
    sd[i] = rnd();
  }
  const starGeo = new THREE.BufferGeometry();
  const starPos = new THREE.BufferAttribute(new Float32Array(nStars * 3), 3);
  starGeo.setAttribute('position', starPos);
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const starU = { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 } };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: starU, vertexShader: starVert, fragmentShader: starFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  /* sizing */
  let W = 0, H = 0;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = -h;
    camera.updateProjectionMatrix();
    starU.uPx.value = dpr;
    for (let i = 0; i < nStars; i++) {
      starPos.array[i * 3] = sp[i * 3] * w;
      starPos.array[i * 3 + 1] = -sp[i * 3 + 1] * h * 0.92;
      starPos.array[i * 3 + 2] = -2500;
    }
    starPos.needsUpdate = true;
  }

  /* motion state */
  const reduced = !!ctx.reducedMotion;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const MAX_TILT = 6 * Math.PI / 180;
  const onPointer = (e) => {
    tilt.tx = ((e.clientX / innerWidth) * 2 - 1) * MAX_TILT;
    tilt.ty = ((e.clientY / innerHeight) * 2 - 1) * MAX_TILT;
  };
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    tilt.tx = Math.max(-1, Math.min(1, e.gamma / 30)) * MAX_TILT;
    tilt.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * MAX_TILT;
  };
  if (!reduced) {
    addEventListener('pointermove', onPointer, { passive: true });
    // Only where no permission prompt is needed (iOS requires a user gesture; we don't ask).
    if (mobileGPU && typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission !== 'function') {
      addEventListener('deviceorientation', onOrient, { passive: true });
    }
  }

  const rotE = new THREE.Euler(0, 0, 0, 'YXZ');
  const t0 = performance.now();
  let last = t0;
  let hiReady = false, relReady = false;
  const rotM = new THREE.Matrix4();

  function frame(now) {
    resize();
    const t = (now - t0) / 1000;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const lay = layout(W, H, ctx);

    // orientation: fixed pleasing angle + libration wobble + cursor tilt
    let ry = 0.02, rx = -0.035;
    if (!reduced) {
      const k = 1 - Math.exp(-dt * 2.2);
      tilt.x += (tilt.tx - tilt.x) * k;
      tilt.y += (tilt.ty - tilt.y) * k;
      ry += 0.030 * Math.sin(t * 0.071) + 0.012 * Math.sin(t * 0.163 + 1.3) + tilt.x;
      rx += 0.022 * Math.sin(t * 0.053 + 0.6) + tilt.y;
    }
    rotE.set(rx, ry, 0.0);
    moon.rotation.copy(rotE);
    moon.position.set(lay.cx, -lay.cy, 0);
    moon.scale.setScalar(lay.R);
    moon.updateMatrixWorld();
    uniforms.uRot.value.setFromMatrix4(rotM.makeRotationFromEuler(rotE));

    halo.position.set(lay.cx, -lay.cy, -2000);
    halo.scale.setScalar(lay.R);

    // texture crossfades (low-res -> 4k albedo, flat -> relief)
    const fade = reduced ? 1 : dt / 0.7;
    if (hiReady && uniforms.uHiMix.value < 1) uniforms.uHiMix.value = Math.min(1, uniforms.uHiMix.value + fade);
    if (relReady && uniforms.uReliefAmt.value < 1) uniforms.uReliefAmt.value = Math.min(1, uniforms.uReliefAmt.value + fade);

    uniforms.uDim.value = lay.dim;
    haloU.uIntensity.value = (0.35 + 0.65 * sun.illum) * (0.55 + 0.45 * lay.dim);
    starU.uTime.value = reduced ? 0 : t;
    starU.uFade.value = 1 - 0.35 * lay.scroll;

    renderer.render(scene, camera);
  }

  /* loop */
  let raf = 0, disposed = false;
  const loop = (now) => {
    raf = 0;
    if (disposed || document.hidden) return;
    frame(now);
    if (!reduced) raf = requestAnimationFrame(loop);
  };
  // Reduced motion renders on demand (scroll / resize / texture arrival) only.
  const kick = () => {
    if (disposed || document.hidden || raf) return;
    raf = requestAnimationFrame(loop);
  };
  const onVis = () => { if (!document.hidden) kick(); };
  const onScroll = () => { if (reduced) kick(); };
  const onResize = () => kick();
  document.addEventListener('visibilitychange', onVis);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);

  /* textures: tiny map first, then the big ones */
  const lo = loadTexture(new URL('moon-albedo-lo.jpg', IMG).href, true)
    .then((t) => { uniforms.uAlbedoLo.value = t; if (uniforms.uAlbedoHi.value === grey) uniforms.uAlbedoHi.value = t; return t; })
    .catch(() => null);
  const hi = loadTexture(new URL('moon-albedo-4k.jpg', IMG).href, true)
    .then((t) => { t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; })
    .catch(() => null);
  const rel = loadTexture(new URL('moon-relief-2k.jpg', IMG).href, false)
    .then((t) => { t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); return t; })
    .catch(() => null);

  const applyHi = (t) => { if (t && !disposed) { uniforms.uAlbedoHi.value = t; hiReady = true; kick(); } };
  const applyRel = (t) => { if (t && !disposed) { uniforms.uRelief.value = t; relReady = true; kick(); } };

  // Give the full-resolution maps a moment so the first reveal is already sharp.
  await Promise.race([lo, wait(2500)]);
  const both = Promise.all([hi, rel]);
  const gotBoth = await Promise.race([both.then(() => true), wait(mobileGPU ? 700 : 900).then(() => false)]);
  if (gotBoth) {
    const [h, r] = await both;
    if (h) { uniforms.uAlbedoHi.value = h; uniforms.uHiMix.value = 1; hiReady = true; }
    if (r) { uniforms.uRelief.value = r; uniforms.uReliefAmt.value = 1; relReady = true; }
  } else {
    hi.then(applyHi);
    rel.then(applyRel);
  }
  if (disposed) return { dispose() {} };
  try { renderer.compile(scene, camera); } catch { /* compile lazily on render */ }
  last = performance.now();
  frame(last);
  if (!reduced) kick();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onPointer);
      removeEventListener('deviceorientation', onOrient);
      geo.dispose(); haloGeo.dispose(); starGeo.dispose();
      mat.dispose(); halo.material.dispose(); stars.material.dispose();
      for (const k of ['uAlbedoLo', 'uAlbedoHi', 'uRelief']) uniforms[k].value?.dispose?.();
      flat.dispose(); grey.dispose();
      renderer.dispose();
    },
  };
}
