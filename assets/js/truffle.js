// TrufflePoint — a black Périgord truffle as a moonlit still life.
//
// One truffle rests on dark slate under a cold moon. On hover it is cut: the top half lifts
// and tilts back to show the gleba — near-black flesh marbled with fine white veins.
//
// Surface: an icosphere displaced on the GPU. Big low-frequency lobes and a crease give the
// potato-like mass; flat-topped polygonal warts come from 3D Worley noise (F2 − F1); normals
// are rebuilt per pixel by finite differences of the same height field. The underside is
// flattened around the y pole so it sits on the slate as it turns about y.
//
// The cut: both halves are the same mesh clipped by a plane (one keeps each side). The cut
// faces are capped with the stencil technique (back faces +1, front faces −1, cap where the
// count is non-zero), so each cap matches the irregular outline exactly. Both caps sample
// the vein field at the same truffle-local points, so the two faces mirror each other the
// way a real cut does. Closed, the unclipped mesh is drawn instead: no seam.
//
// initTruffle(canvas, ctx) -> { dispose(), pause(), resume() }

import * as THREE from 'three';

const DPR_CAP = 1.75;
const FOV = 26;

// Shared with neon.js so the two tiles read as a pair.
const WORD = 'TRUFFLEPOINT';
const FONT = '300 26px "JetBrains Mono", ui-monospace, monospace';
const TEXT_Y = 0.865;
const TRACK = 13;

/* ── GLSL ──────────────────────────────────────────────────── */

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

// x = F1, y = F2, z = id of the nearest cell
vec3 worley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  float F1 = 8.0, F2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    vec3 r = g + 0.12 + 0.76 * o - f;
    float d = dot(r, r);
    if (d < F1) { F2 = F1; F1 = d; id = o.x; }
    else if (d < F2) { F2 = d; }
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}

uniform float uSeed;
uniform float uWartFreq;
uniform float uWartAmp;

float lobes(vec3 p) {
  vec3 s = vec3(uSeed, uSeed * 0.37, uSeed * 1.71);
  float h = 0.17 * snoise(p * 0.75 + s)
          + 0.07 * snoise(p * 1.6 + s.zxy)
          + 0.025 * snoise(p * 3.2 + s.yzx);
  // one deep crease where the fruiting body folded as it grew
  float c = snoise(p * 0.65 + s.yxz * 1.3 + 4.0);
  h -= 0.11 * (1.0 - smoothstep(0.0, 0.16, abs(c))) * smoothstep(-0.2, 0.5, snoise(p * 0.5 + 9.0));
  // resting face: lobes die out toward the -y pole, which is flattened a little
  float under = smoothstep(-0.72, -0.98, p.y);
  return mix(h, -0.06, under);
}

// x = height, y = F2-F1 (0 at crevices), z = cell id, w = facet ramp 0..1
vec4 surf(vec3 p) {
  vec3 W = worley(p * uWartFreq);
  float w = W.y - W.x;
  // truncated pyramid: straight facets up from a narrow crevice, a near-flat crown
  float side = clamp(w / 0.62, 0.0, 1.0);
  float apex = side * (1.12 - 0.12 * side);                 // straight facets, apex just softened
  float hw = apex * (0.75 + 0.5 * fract(W.z * 17.31));
  float grain = snoise(p * 38.0) * 0.6 + snoise(p * 83.0) * 0.4;
  float h = lobes(p) + uWartAmp * hw + 0.0035 * grain * side;
  return vec4(h, w, W.z, side);
}
`;

const VERT = /* glsl */ `
${NOISE}
#include <clipping_planes_pars_vertex>
varying vec3 vDir;
varying vec3 vViewPos;
void main() {
  vec3 d = normalize(position);
  vec3 p = d * (1.0 + surf(d).x);
  vDir = d;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`;

const SKIN_FRAG = /* glsl */ `
${NOISE}
#include <clipping_planes_pars_fragment>
uniform mat3 normalMatrix;
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform vec3 uFillDir;
varying vec3 vDir;
varying vec3 vViewPos;

const float PI = 3.14159265;

void main() {
  #include <clipping_planes_fragment>
  vec3 d = normalize(vDir);
  vec3 up = abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, d));
  vec3 B = cross(d, T);
  float e = 0.004;
  vec4 s0 = surf(d);
  vec3 dT = normalize(d + T * e);
  vec3 dB = normalize(d + B * e);
  vec3 P0 = d * (1.0 + s0.x);
  vec3 nObj = normalize(cross(dT * (1.0 + surf(dT).x) - P0, dB * (1.0 + surf(dB).x) - P0));
  vec3 N = normalize(normalMatrix * nObj);
  vec3 Nm = normalize(normalMatrix * d);            // the lump's own form, no warts
  vec3 V = normalize(-vViewPos);
  if (dot(N, V) < 0.0) N = normalize(N + V * (0.02 - dot(N, V)));

  float w = s0.y, side = s0.w, cell = s0.z;

  // cavity: crevices between warts near-black; the crease and low hollows darker too
  float ao = mix(0.22, 1.0, smoothstep(0.0, 0.22, w));
  ao *= mix(0.55, 1.0, smoothstep(-0.16, 0.06, s0.x));

  // deep brown-black, near greyscale, each wart a little different
  float drift = fract(cell * 53.7);
  vec3 albedo = vec3(0.027, 0.024, 0.022) * (0.8 + 0.4 * drift);
  albedo *= 0.9 + 0.2 * smoothstep(-0.4, 0.6, snoise(d * 9.0));

  vec3 Lk = normalize(uKeyDir), Lr = normalize(uRimDir), Lf = normalize(uFillDir);

  // matte, dry skin: wrapped diffuse, gated by the macro form so it shades as one mass
  float visK = smoothstep(-0.35, 0.6, dot(Nm, Lk));
  float difK = max((dot(N, Lk) + 0.25) / 1.5625, 0.0);
  vec3 moon = vec3(0.86, 0.885, 0.92);
  vec3 col = albedo * difK * visK * moon * 1.7;
  col += albedo * max(dot(N, Lf), 0.0) * smoothstep(-0.3, 0.5, dot(Nm, Lf)) * 0.35;

  // the faintest sheen on the facets: broad, low lobe, no glitter
  vec3 H = normalize(Lk + V);
  float a = 0.62 * 0.62;
  float NoH = max(dot(N, H), 0.0);
  float dd = NoH * NoH * (a * a - 1.0) + 1.0;
  float spec = (a * a) / (PI * dd * dd) * 0.03 * max(dot(N, Lk), 0.0);
  col += moon * spec * visK * smoothstep(0.1, 0.6, side);

  // moonlight rim from up-left behind, broken up by the warts
  float rimMask = pow(1.0 - max(dot(Nm, V), 0.0), 2.2) * smoothstep(-0.1, 0.7, dot(Nm, Lr));
  float facet = smoothstep(-0.1, 0.8, dot(N, normalize(Lr + V)));
  col += moon * rimMask * facet * 0.11;

  col += albedo * 0.16 * (0.6 + 0.4 * N.y);          // sky
  col *= ao;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const STENCIL_FRAG = /* glsl */ `
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(0.0);
}
`;

// The cut face. Position comes in the piece's frame; uToTruffle maps it into the truffle's
// own (spinning) frame so both caps sample the same flesh.
const CAP_VERT = /* glsl */ `
uniform mat4 uToTruffle;
varying vec3 vQ;
varying vec3 vViewPos;
varying vec3 vN;
void main() {
  vQ = (uToTruffle * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const CAP_FRAG = /* glsl */ `
${NOISE}
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform float uOpen;
varying vec3 vQ;
varying vec3 vViewPos;
varying vec3 vN;

const float PI = 3.14159265;

// a thin ridged line along the zero set of a noise field, antialiased
float vein(float n, float wid) {
  float a = abs(n);
  float fw = fwidth(a) * 0.9 + 1e-4;
  return 1.0 - smoothstep(wid - fw, wid + fw, a);
}

void main() {
  vec3 q = vQ;
  vec3 dir = normalize(q);
  float rs = 1.0 + surf(dir).x;
  float rr = length(q) / rs;                      // 1 at the skin

  // gleba marbling: two Voronoi border networks in a gently warped domain. Borders of cells
  // meander, meet and fork like the hymenial veins of a Périgord truffle; the fine network is
  // dense (a couple of dozen cells across the cut), the coarse one carries the main veins.
  vec3 p = q + vec3(uSeed);
  p += 0.15 * vec3(snoise(q * 2.2 + 1.3), snoise(q * 2.2 + 7.1), snoise(q * 2.2 + 13.7));
  p += 0.035 * vec3(snoise(q * 9.0 + 3.1), snoise(q * 9.0 + 9.4), snoise(q * 9.0 + 17.2));
  vec3 Vc = worley(p * 4.2);
  vec3 Vf = worley(p * 10.5 + 7.0);
  float ec = (Vc.y - Vc.x) / 4.2, ef = (Vf.y - Vf.x) / 10.5;   // distance to border, in truffle units
  float fwc = min(fwidth(ec), 0.01) * 0.7 + 1e-5, fwf = min(fwidth(ef), 0.01) * 0.7 + 1e-5;
  float gf = smoothstep(-0.55, 0.35, snoise(p * 3.0 + 21.0));      // fine veins fade in and out
  float vc = 1.0 - smoothstep(0.0065 - fwc, 0.0065 + fwc, ec);
  float vf = (1.0 - smoothstep(0.004 - fwf, 0.004 + fwf, ef)) * gf;
  float v = max(vc * 0.95, vf * 0.6);
  // soft paler margin around the main veins (the hymenium seen edge-on)
  float halo = (1.0 - smoothstep(0.0, 0.035, ec)) * 0.7 + (1.0 - smoothstep(0.0, 0.012, ef)) * gf * 0.3;

  // flesh: near-black, a hint of warm brown, mottled
  float mott = snoise(q * 6.0 + 3.0) * 0.5 + snoise(q * 15.0) * 0.25;
  vec3 flesh = vec3(0.034, 0.028, 0.024) * (1.0 + 0.35 * mott);
  flesh = mix(flesh, vec3(0.075, 0.064, 0.056), halo * 0.55);
  vec3 veinCol = vec3(0.40, 0.39, 0.375);
  vec3 alb = mix(flesh, veinCol, v * (1.0 - smoothstep(0.9, 0.95, rr)));

  // peridium: the thin black rind with the warts' crevices pressing in
  float rind = smoothstep(0.935, 0.96, rr);
  alb = mix(alb, vec3(0.018, 0.016, 0.015), rind);

  vec3 N = normalize(gl_FrontFacing ? vN : -vN);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uKeyDir);
  vec3 moon = vec3(0.86, 0.885, 0.92);
  float wrap = max((dot(N, L) + 0.5) / 1.5, 0.0);
  vec3 col = alb * wrap * moon * 1.2;
  col += alb * max(dot(N, normalize(uFillDir)), 0.0) * 0.4;
  col += alb * max(dot(N, V), 0.0) * 0.4;            // soft frontal fill so both faces read
  col += alb * 0.3;                                 // waxy: light scatters inside the flesh
  col += veinCol * v * 0.03 * (1.0 - rind);          // veins glow faintly, translucent

  // waxy sheen of fresh flesh
  vec3 H = normalize(L + V);
  float a = 0.38 * 0.38;
  float NoH = max(dot(N, H), 0.0);
  float dd = NoH * NoH * (a * a - 1.0) + 1.0;
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  col += moon * (a * a) / (PI * dd * dd) * F * max(dot(N, L), 0.0) * 0.05 * (1.0 - rind * 0.6);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GROUND_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const GROUND_FRAG = /* glsl */ `
${NOISE}
uniform vec3 uKeyW;         // toward the moon, world space
uniform vec3 uCam;
uniform vec2 uShadowK;      // x: contact radius, y: cast length
uniform float uOpen;
varying vec3 vW;

void main() {
  vec2 xz = vW.xz;
  float r = length(xz);

  // slate: fine grain, soft cloudy mottling, faint cleavage streaks
  float grain = snoise(vW * 22.0) * 0.5 + snoise(vW * 55.0) * 0.3;
  float cloud = snoise(vec3(xz * 0.6, 1.0)) * 0.6 + snoise(vec3(xz * 1.4, 4.0)) * 0.3;
  float streak = snoise(vec3(xz.x * 0.35 + xz.y * 1.9, xz.y * 0.2, 7.0));
  vec3 alb = vec3(0.060, 0.061, 0.064) * (1.0 + 0.28 * cloud + 0.16 * grain + 0.12 * streak);

  // moonlight pool, falling off into the dark
  vec3 L = normalize(uKeyW);
  vec2 beam = xz - (-L.xz / max(L.y, 0.2)) * 0.35;
  float pool = exp(-dot(beam * vec2(0.8, 1.25), beam * vec2(0.8, 1.25)) * 0.5);
  vec3 moon = vec3(0.86, 0.885, 0.92);
  vec3 col = alb * moon * (0.12 + 1.7 * pool) * L.y;

  // faint rough reflection of the moon off the stone, behind the truffle
  vec3 V = normalize(uCam - vW);
  vec3 H = normalize(L + V);
  float NoH = max(H.y, 0.0);
  float a = 0.42 * 0.42;
  float dd = NoH * NoH * (a * a - 1.0) + 1.0;
  float spec = (a * a) / (3.14159 * dd * dd);
  col += moon * spec * 0.008 * (0.7 + 0.3 * grain) * pool * (1.0 - smoothstep(1.5, 3.5, r));

  // contact shadow + soft cast shadow away from the moon
  float contact = exp(-r * r / (uShadowK.x * uShadowK.x));
  vec2 dirS = -normalize(L.xz);
  vec2 rel = xz - dirS * uShadowK.y * 0.55;
  vec2 relR = vec2(dot(rel, dirS), dot(rel, vec2(-dirS.y, dirS.x)));
  float castS = exp(-(relR.x * relR.x) / (uShadowK.y * uShadowK.y * 0.55) - (relR.y * relR.y) / 0.9);
  col *= (1.0 - 0.85 * contact) * (1.0 - 0.6 * castS);

  // fade into the tile
  float fade = (1.0 - smoothstep(1.2, 4.0, r)) * (1.0 - smoothstep(0.0, 3.5, -vW.z) * 0.6);
  gl_FragColor = vec4(col, fade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ── geometry: indexed icosphere ───────────────────────────── */

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      let i = cache.get(k);
      if (i !== undefined) return i;
      const va = verts[a], vb = verts[b];
      const m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
      const n = Math.hypot(m[0], m[1], m[2]);
      i = verts.push([m[0] / n, m[1] / n, m[2] / n]) - 1;
      cache.set(k, i);
      return i;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => pos.set(v, i * 3));
  const idx = verts.length > 65535 ? new Uint32Array(faces.length * 3) : new Uint16Array(faces.length * 3);
  faces.forEach((f, i) => idx.set(f, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
  return g;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── init ──────────────────────────────────────────────────── */

export function initTruffle(canvas, ctx = {}) {
  const reduced = !!ctx.reducedMotion;
  const mobile = !!ctx.isMobile;
  const params = new URLSearchParams(location.search);
  const forceHover = params.get('hover') === '1';

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const ELEV = THREE.MathUtils.degToRad(17);
  const DIST = 11.2;
  camera.position.set(0, Math.sin(ELEV) * DIST, Math.cos(ELEV) * DIST);
  camera.lookAt(0, -0.2, 0);
  camera.updateMatrixWorld();

  // Lights in view space; the camera never moves.
  const keyView = new THREE.Vector3(-0.62, 0.68, 0.38).normalize();
  const U = {
    uSeed: { value: 3.7 },
    uWartFreq: { value: 8.4 },
    uWartAmp: { value: 0.06 },
    uKeyDir: { value: keyView },
    uRimDir: { value: new THREE.Vector3(-0.7, 0.55, -0.45) },
    uFillDir: { value: new THREE.Vector3(0.8, 0.05, 0.45) },
    uOpen: { value: 0 },
  };

  const geometry = icosphere(mobile ? 5 : 7);
  const SCALE = new THREE.Vector3(1.06, 0.95, 1.0);
  const GROUND_Y = -0.94 * SCALE.y - 0.03;

  const skinMat = (planes) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: SKIN_FRAG, uniforms: U, clipping: !!planes, clippingPlanes: planes || null,
  });

  // Hierarchy: aim (cursor yaw) → body (non-uniform scale) → pieces → meshes (spin about y).
  const aim = new THREE.Group();
  const body = new THREE.Group();
  body.scale.copy(SCALE);
  aim.add(body);
  scene.add(aim);

  const full = new THREE.Mesh(geometry, skinMat(null));
  full.renderOrder = 6;
  body.add(full);

  // Cut plane in the body frame: nearly horizontal, tipped a little toward the camera so the
  // lower face reads, through a point just above the equator.
  const CUT_N = new THREE.Vector3(0.05, 1, 0.16).normalize();
  const CUT_P = new THREE.Vector3(0, 0.06, 0);
  const planeTopLocal = new THREE.Plane().setFromNormalAndCoplanarPoint(CUT_N, CUT_P);
  const planeBotLocal = planeTopLocal.clone().negate();
  const planeTop = new THREE.Plane();
  const planeBot = new THREE.Plane();

  // Hinge for the top half: at the back of the cut, so the front lifts toward the viewer.
  const HINGE = new THREE.Vector3(0, CUT_P.y - 0.02, -1.0);
  const topPivot = new THREE.Group();
  const topInner = new THREE.Group();
  topPivot.position.copy(HINGE);
  topInner.position.copy(HINGE).negate();
  topPivot.add(topInner);
  const botInner = new THREE.Group();
  body.add(botInner, topPivot);

  const capGeo = new THREE.PlaneGeometry(3.2, 3.2);
  {
    // lay the quad into the cut plane (its +z normal → CUT_N), centred on CUT_P
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), CUT_N);
    capGeo.applyQuaternion(q);
    capGeo.translate(CUT_P.x, CUT_P.y, CUT_P.z);
  }

  const disposables = [geometry, capGeo, full.material];

  function piece(parent, plane, order) {
    const mesh = new THREE.Mesh(geometry, skinMat([plane]));
    mesh.renderOrder = 6;
    parent.add(mesh);
    disposables.push(mesh.material);

    // stencil: back faces +1, front faces −1 (clipped by the same plane)
    for (const [side, op] of [[THREE.BackSide, THREE.IncrementWrapStencilOp], [THREE.FrontSide, THREE.DecrementWrapStencilOp]]) {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: STENCIL_FRAG, uniforms: U,
        clipping: true, clippingPlanes: [plane], side,
        colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: op, stencilZFail: op, stencilZPass: op,
      });
      const s = new THREE.Mesh(geometry, m);
      s.renderOrder = order;
      mesh.add(s);
      disposables.push(m);
    }

    // cap: drawn where the count is non-zero, then the stencil is reset for the next piece
    const capU = {
      ...U,
      uToTruffle: { value: new THREE.Matrix4() },
    };
    const capMat = new THREE.ShaderMaterial({
      vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, uniforms: capU, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.renderOrder = order + 0.1;
    cap.onAfterRender = (r) => r.clearStencil();
    parent.add(cap);
    disposables.push(capMat);
    return { mesh, cap, capU };
  }
  const bot = piece(botInner, planeBot, 1);
  const top = piece(topInner, planeTop, 2);

  /* ── ground ──────────────────────────────────────── */
  const groundU = {
    uKeyW: { value: new THREE.Vector3() },
    uCam: { value: camera.position.clone() },
    uShadowK: { value: new THREE.Vector2(0.95, 1.3) },
    uOpen: U.uOpen,
  };
  groundU.uKeyW.value.copy(keyView).applyQuaternion(camera.quaternion).normalize();
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: groundU, transparent: true, depthWrite: false,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  scene.add(ground);
  disposables.push(ground.geometry, groundMat);

  /* ── spores in the moon beam ─────────────────────── */
  const N_DUST = mobile ? 22 : 44;
  const dPos = new Float32Array(N_DUST * 3);
  const dSeed = new Float32Array(N_DUST);
  for (let i = 0; i < N_DUST; i++) {
    dPos.set([(Math.random() - 0.5) * 6, Math.random() * 4.5 - 1, (Math.random() - 0.5) * 4 - 0.5], i * 3);
    dSeed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uKeyW: groundU.uKeyW },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uPx; uniform vec3 uKeyW; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.03 + 0.04 * aSeed) + aSeed * 40.0;
        p.y = mod(p.y + 1.0 - t * 0.35, 4.5) - 1.0;
        p.x += sin(t * 1.3 + aSeed * 9.0) * 0.25;
        p.z += cos(t * 1.1 + aSeed * 5.0) * 0.2;
        // brightness inside the beam: a soft cylinder from the moon through the truffle
        vec3 L = normalize(uKeyW);
        vec3 c = p - L * dot(p, L);
        float beam = exp(-dot(c, c) * 0.35);
        float edge = smoothstep(-1.0, -0.4, p.y) * (1.0 - smoothstep(2.6, 3.5, p.y));
        vA = beam * edge * (0.3 + 0.7 * pow(fract(aSeed * 7.13), 2.0)) * (0.65 + 0.35 * sin(uTime * (0.6 + aSeed) + aSeed * 20.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.9 + 1.4 * fract(aSeed * 3.7)) * (14.0 / -mv.z);
      }`,
    fragmentShader: `varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float k = pow(max(1.0 - r, 0.0), 2.0) * vA * 0.5;
        gl_FragColor = vec4(vec3(0.86, 0.88, 0.92) * k, k); }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  if (!reduced) scene.add(dust);
  disposables.push(dustGeo, dustMat);

  /* ── lettering: same face, size and place as BACKMASTER, as a soft silver glow ── */
  const tile = canvas.parentElement;
  const label = document.createElement('canvas');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  tile.appendChild(label);
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(FONT, WORD).catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  function drawLabel() {
    const r = tile.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, ctx.lowPower ? 1.25 : DPR_CAP);
    const S = Math.max(1, Math.round(Math.min(r.width, r.height || r.width) * dpr));
    label.width = label.height = S;
    const c = label.getContext('2d');
    const k = S / 1000;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.font = FONT;
    c.textBaseline = 'alphabetic';
    const widths = [...WORD].map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + TRACK * (WORD.length - 1);
    const y = 1000 * TEXT_Y;
    const pass = (fill, blur, glow) => {
      c.save();
      c.fillStyle = fill;
      c.shadowColor = glow;
      c.shadowBlur = blur * k;
      let x = 500 - total / 2;
      [...WORD].forEach((ch, i) => { c.fillText(ch, x, y); x += widths[i] + TRACK; });
      c.restore();
    };
    pass('rgba(216,220,226,0.22)', 22, 'rgba(216,220,226,0.55)');
    pass('rgba(216,220,226,0.35)', 7, 'rgba(226,229,234,0.6)');
    pass('rgba(226,229,234,0.82)', 1.5, 'rgba(236,239,242,0.5)');
  }

  /* ── state & interaction ─────────────────────────── */
  let raf = 0, running = true, disposed = false, last = 0, time = 0;
  let spin = 0.9, prog = 0, target = 0, open = 0, lastReal = 0;
  const pointer = { x: 0, tx: 0 };

  function setOpen(on) {
    target = on ? 1 : 0;
    if (reduced) prog = target;
    kick();
  }
  const onMove = (e) => {
    const r = tile.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    kick();
  };
  const onEnter = (e) => { if (e.pointerType !== 'touch') setOpen(true); };
  const onLeave = (e) => {
    if (e.pointerType === 'touch' || forceHover) return;
    pointer.tx = 0;
    setOpen(false);
  };
  const onTap = (e) => { if (e.pointerType === 'touch') setOpen(target === 0); };
  tile.addEventListener('pointermove', onMove);
  tile.addEventListener('pointerenter', onEnter);
  tile.addEventListener('pointerleave', onLeave);
  tile.addEventListener('pointerup', onTap);
  if (forceHover) { target = 1; prog = 1; }

  /* ── sizing ──────────────────────────────────────── */
  let W = 0, H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === W && h === H) return;
    W = w; H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, ctx.lowPower ? 1.25 : DPR_CAP);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = dpr * (h / 700) * 2.0;
    fontReady.then(() => { if (!disposed) drawLabel(); });
    kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* ── frame ───────────────────────────────────────── */
  const inv = new THREE.Matrix4();
  function frame() {
    raf = 0;
    if (!running || disposed) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, last ? now - last : 0.016);
    const last0 = lastReal; lastReal = now;
    last = now;
    time += dt;

    // open/close: ~0.9 s eased
    if (prog !== target) {
      const step = Math.min(0.25, last0 ? now - last0 : dt) / 0.9;
      prog = target > prog ? Math.min(target, prog + step) : Math.max(target, prog - step);
    }
    open = reduced ? prog : easeInOut(prog);
    U.uOpen.value = open;

    if (!reduced) {
      // turn slowly while whole; come to rest while open so the cut faces the camera
      spin += dt * 0.12 * Math.pow(1 - open, 2);
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
      aim.rotation.y = pointer.x * 0.35 * (1 - 0.6 * open);
      dustMat.uniforms.uTime.value = time;
    }

    const isOpen = open > 0.0005;
    full.visible = !isOpen;
    botInner.visible = isOpen;
    topPivot.visible = isOpen;
    full.rotation.y = bot.mesh.rotation.y = top.mesh.rotation.y = spin;

    // the lid: lift ~0.25 r and tilt back about the hinge at the rear of the cut
    topPivot.position.set(HINGE.x, HINGE.y + 0.22 * open, HINGE.z - 0.18 * open);
    topPivot.rotation.x = -THREE.MathUtils.degToRad(46) * open;

    scene.updateMatrixWorld();
    planeBot.copy(planeBotLocal).applyMatrix4(botInner.matrixWorld);
    planeTop.copy(planeTopLocal).applyMatrix4(topInner.matrixWorld);
    bot.mesh.updateMatrix();
    inv.copy(bot.mesh.matrix).invert();
    bot.capU.uToTruffle.value.copy(inv);
    top.capU.uToTruffle.value.copy(inv);

    renderer.render(scene, camera);

    const moving = prog !== target || Math.abs(pointer.x - pointer.tx) > 0.001;
    if (!reduced || moving) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && running && !disposed) { last = 0; raf = requestAnimationFrame(frame); }
  }
  resize();
  kick();

  return {
    pause() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      if (disposed || running) return;
      running = true;
      kick();
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      tile.removeEventListener('pointermove', onMove);
      tile.removeEventListener('pointerenter', onEnter);
      tile.removeEventListener('pointerleave', onLeave);
      tile.removeEventListener('pointerup', onTap);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      label.remove();
    },
  };
}
