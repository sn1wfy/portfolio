// Night sounds: procedural wind + the occasional distant crow.
//
// Contract: createAmbient() -> { start(): Promise, stop(), get playing() }
// start() must be called from a user gesture (it creates / resumes the AudioContext).
// Every caw also fires window 'crow:caw' { detail: { pan } } so crows.js can react on that side.

const AUDIO = new URL('../audio/', import.meta.url);
const CAWS = ['caw-1.mp3', 'caw-2.mp3', 'caw-3.mp3'];

const rand = (a, b) => a + Math.random() * (b - a);

const WIND_LEVEL = 0.16;   // master-relative; it should sit under everything
const CAW_LEVEL = 0.55;
const FADE_IN = 2.0;
const FADE_OUT = 1.0;

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    // gently pinked noise (Paul Kellet's economy filter): wind is not white
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    // crossfade the loop seam
    const f = Math.min(2048, len >> 4);
    for (let i = 0; i < f; i++) {
      const t = i / f;
      d[i] = d[i] * t + d[len - f + i] * (1 - t);
    }
  }
  return buf;
}

function impulse(ac, seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  const pre = Math.floor(ac.sampleRate * 0.025);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = pre; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), decay);
    }
  }
  return buf;
}

function makePanner(ac, pan) {
  if (ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    return p;
  }
  const p = ac.createPanner();
  p.panningModel = 'equalpower';
  p.setPosition(pan, 0, 1 - Math.abs(pan));
  return p;
}

export function createAmbient() {
  let ac = null;
  let master = null, reverb = null, reverbIn = null;
  let playing = false;
  let gen = 0;                   // invalidates timers from a previous start()
  let wind = null;               // { sources, timers }
  let cawTimer = 0, stopTimer = 0;
  let caws = null;               // Promise<AudioBuffer[]>

  function ensureGraph() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio unavailable');
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    // shared "open air" reverb: long, dark tail
    reverb = ac.createConvolver();
    reverb.buffer = impulse(ac, 3.2, 2.6);
    const verbTone = ac.createBiquadFilter();
    verbTone.type = 'lowpass';
    verbTone.frequency.value = 3200;
    const verbGain = ac.createGain();
    verbGain.gain.value = 0.55;
    reverbIn = ac.createGain();
    reverbIn.connect(reverb).connect(verbTone).connect(verbGain).connect(master);
  }

  function loadCaws() {
    if (caws) return caws;
    caws = Promise.all(CAWS.map(async (name) => {
      const res = await fetch(new URL(name, AUDIO));
      if (!res.ok) throw new Error(`ambient: ${name} ${res.status}`);
      const data = await res.arrayBuffer();
      return new Promise((ok, fail) => ac.decodeAudioData(data, ok, fail));
    })).catch((err) => {
      console.warn('[ambient] caws unavailable:', err);
      return [];
    });
    return caws;
  }

  /* ── wind ────────────────────────────────────────────────── */
  function startWind(myGen) {
    const t = ac.currentTime;
    const noise = noiseBuffer(ac, 6);
    const out = ac.createGain();
    out.gain.value = WIND_LEVEL;
    out.connect(master);
    out.connect(reverbIn);

    // body: low, breathy rush
    const body = ac.createBufferSource();
    body.buffer = noise; body.loop = true;
    const bodyLP = ac.createBiquadFilter();
    bodyLP.type = 'lowpass'; bodyLP.frequency.value = 420; bodyLP.Q.value = 0.4;
    const bodyGain = ac.createGain(); bodyGain.gain.value = 0.55;
    body.connect(bodyLP).connect(bodyGain).connect(out);

    // edge: a thin moving band that whistles faintly in the gusts
    const edge = ac.createBufferSource();
    edge.buffer = noise; edge.loop = true; edge.playbackRate.value = 0.93;
    const edgeBP = ac.createBiquadFilter();
    edgeBP.type = 'bandpass'; edgeBP.frequency.value = 520; edgeBP.Q.value = 2.2;
    const edgeGain = ac.createGain(); edgeGain.gain.value = 0.18;
    edge.connect(edgeBP).connect(edgeGain).connect(out);

    // slow LFO wandering the band
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoAmt = ac.createGain(); lfoAmt.gain.value = 140;
    lfo.connect(lfoAmt).connect(edgeBP.frequency);

    body.start(t, rand(0, 5));
    edge.start(t, rand(0, 5));
    lfo.start(t);

    const timers = [];
    // gusts: random swells with long time constants, never periodic
    const gust = (g) => {
      if (g !== gen || !playing) return;
      const now = ac.currentTime;
      const strength = Math.random() < 0.25 ? rand(0.9, 1.35) : rand(0.35, 0.8);
      const tau = rand(1.2, 3.2);
      bodyGain.gain.setTargetAtTime(0.35 + strength * 0.5, now, tau);
      bodyLP.frequency.setTargetAtTime(260 + strength * 520, now, tau);
      edgeGain.gain.setTargetAtTime(0.06 + strength * strength * 0.22, now, tau * 1.1);
      edgeBP.frequency.setTargetAtTime(380 + strength * 520, now, tau * 1.3);
      timers.push(setTimeout(gust, rand(2.5, 7.5) * 1000, g));
    };
    gust(myGen);

    wind = { sources: [body, edge, lfo], out, timers, gust };
  }

  function stopWind() {
    if (!wind) return;
    wind.timers.forEach(clearTimeout);
    for (const s of wind.sources) { try { s.stop(); } catch (_) { /* already stopped */ } }
    try { wind.out.disconnect(); } catch (_) { /* fine */ }
    wind = null;
  }

  /* ── caws ────────────────────────────────────────────────── */
  async function caw(myGen) {
    const bufs = await loadCaws();
    if (myGen !== gen || !playing || !bufs.length) return;
    const buf = bufs[(Math.random() * bufs.length) | 0];
    const now = ac.currentTime + 0.05;
    const pan = rand(-0.85, 0.85);
    const distance = Math.random();            // 0 near .. 1 far

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rand(0.93, 1.05);

    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200 - distance * 2800;   // distance eats the highs

    const g = ac.createGain();
    g.gain.value = CAW_LEVEL * (1 - distance * 0.6);

    const p = makePanner(ac, pan);
    const send = ac.createGain();
    send.gain.value = 0.35 + distance * 0.45;        // further = wetter

    src.connect(tone).connect(g).connect(p).connect(master);
    p.connect(send).connect(reverbIn);

    // the long recording sometimes plays as just a call or two
    let offset = 0, dur;
    if (buf.duration > 1.6 && Math.random() < 0.5) {
      offset = Math.random() < 0.5 ? 0 : buf.duration * 0.48;
      dur = buf.duration * 0.5;
    }
    src.start(now, offset, dur);
    src.onended = () => { try { p.disconnect(); send.disconnect(); } catch (_) { /* fine */ } };

    window.dispatchEvent(new CustomEvent('crow:caw', { detail: { pan } }));
  }

  function scheduleCaw(myGen, first) {
    clearTimeout(cawTimer);
    const delay = first ? rand(5, 11) : rand(12, 40);
    cawTimer = setTimeout(() => {
      if (myGen !== gen || !playing) return;
      caw(myGen);
      scheduleCaw(myGen, false);
    }, delay * 1000);
  }

  /* ── public ─────────────────────────────────────────────── */
  async function start() {
    if (playing) return;
    ensureGraph();
    playing = true;
    const myGen = ++gen;
    clearTimeout(stopTimer);
    if (ac.state === 'suspended') await ac.resume();
    if (myGen !== gen) return;

    // restarted mid-fade: keep the same air moving, just wake the gusts for this generation
    if (wind) { wind.timers.forEach(clearTimeout); wind.timers.length = 0; wind.gust(myGen); }
    else startWind(myGen);
    loadCaws();

    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(1, t + FADE_IN);

    scheduleCaw(myGen, true);
  }

  function stop() {
    if (!playing || !ac) return;
    playing = false;
    const myGen = ++gen;
    clearTimeout(cawTimer);
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + FADE_OUT);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      if (myGen !== gen) return;      // restarted during the fade
      stopWind();
      ac.suspend().catch(() => {});
    }, (FADE_OUT + 0.15) * 1000);
  }

  return {
    start,
    stop,
    get playing() { return playing; },
  };
}
