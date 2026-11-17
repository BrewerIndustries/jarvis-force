/* Jarvis Force: synthesised audio. No sound files. Effects and music are generated with WebAudio,
   so the game stays a dependency-free static site.

   Music is a procedurally composed military-band march: brass melody and horn harmony over an
   oom-pah tuba, offbeat brass stabs, a snare corps with ruffs and phrase-end rolls, bass drum and
   crash cymbals. Each mission seeds its own tune (key by sector), bosses get a faster minor-key
   battle march, and the menus get a slow anthem. Scheduling uses the usual lookahead clock. */

const SND = (() => {
  let ctx = null, master, sfxBus, musBus, verbIn, noiseBuf, unlocked = false;
  const OPT_KEY = 'jarvisforce.audio';
  let opts = { music: true, sfx: true };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY)) || {}); } catch (e) {}
  const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) {} };
  const MUS_VOL = .36, SFX_VOL = .5;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = .9;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = opts.sfx ? SFX_VOL : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(master);
    // a small hall: noise impulse with an exponential tail
    const len = Math.floor(ctx.sampleRate * 2.2), imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const verb = ctx.createConvolver(); verb.buffer = imp;
    verbIn = ctx.createGain(); verbIn.gain.value = .28;
    verbIn.connect(verb).connect(musBus);
    const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function catchUp() { if (want && live() && (!song || song.id !== want.id)) startSong(); }
  function unlock() {
    const c = ensure(); if (!c) return;
    if (!unlocked) unlocked = true;
    if (c.state === 'suspended') c.resume().then(catchUp); else catchUp();
  }
  const live = () => ctx && unlocked && ctx.state === 'running';
  const lastT = {};
  function throttle(k, ms) { const n = performance.now(); if (n - (lastT[k] || 0) < ms) return false; lastT[k] = n; return true; }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const pc12 = n => ((n % 12) + 12) % 12;

  // ---------- primitives
  function tone(freq, dur, { type = 'sine', gain = .2, sweepTo = null, delay = 0, at = null, bus = sfxBus, attack = .006 } = {}) {
    if (!live()) return;
    const t = at ?? ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + .03);
  }
  function noise(dur, { gain = .25, filter = 'lowpass', freq = 900, q = 1, sweepTo = null, delay = 0, at = null, bus = sfxBus, attack = .003 } = {}) {
    if (!live()) return;
    const t = at ?? ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = dur > .9; f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(bus); s.start(t, s.loop ? Math.random() * .5 : Math.random() * Math.max(0, .95 - dur)); s.stop(t + dur + .03);
  }

  // ---------- band instruments (scheduled at absolute times)
  function brass(m, t, dur, vel = 1, bright = 1) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.4, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 7 * bright * (.6 + vel * .4)), t + .05);
    lp.frequency.exponentialRampToValueAtTime(Math.min(4500, f * 3.6 * bright), t + .25);
    const peak = .085 * vel;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .028);
    g.gain.setValueAtTime(peak * .8, t + Math.max(.05, dur - .06)); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      if (dur > .45) { // gentle vibrato on held notes
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + .4);
        lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + .1);
      }
      o.connect(lp); o.start(t); o.stop(t + dur + .1);
    }
    lp.connect(g); g.connect(musBus); g.connect(verbIn);
  }
  function tuba(m, t, dur, vel = 1) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 5, t); lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + .15);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16 * vel, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    for (const [type, k] of [['sawtooth', 1], ['triangle', .5]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * k; o.connect(lp); o.start(t); o.stop(t + dur + .05); }
    lp.connect(g); g.connect(musBus);
  }
  function picc(m, t, dur, vel = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = hz(m);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.value = 6; lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + .1);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05 * vel, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(musBus); g.connect(verbIn); o.start(t); o.stop(t + dur + .05);
  }
  function snare(t, vel = 1) {
    noise(.16, { at: t, gain: .16 * vel, filter: 'highpass', freq: 1800, bus: musBus });
    noise(.09, { at: t, gain: .1 * vel, filter: 'bandpass', freq: 3800, q: .8, bus: musBus });
    tone(190, .07, { at: t, type: 'triangle', gain: .09 * vel, sweepTo: 140, bus: musBus });
  }
  function kick(t, vel = 1) {
    tone(105, .32, { at: t, gain: .32 * vel, sweepTo: 42, bus: musBus });
    noise(.06, { at: t, gain: .06 * vel, freq: 600, bus: musBus });
  }
  function crash(t, vel = 1) { noise(1.6, { at: t, gain: .07 * vel, filter: 'highpass', freq: 5200, bus: musBus }); noise(.5, { at: t, gain: .05 * vel, filter: 'bandpass', freq: 9000, bus: verbIn }); }
  function timp(m, t, vel = 1) { tone(hz(m), .9, { at: t, gain: .22 * vel, sweepTo: hz(m) * .97, bus: musBus }); tone(hz(m) * 1.5, .5, { at: t, gain: .06 * vel, bus: musBus }); noise(.08, { at: t, gain: .05 * vel, freq: 400, bus: musBus }); }

  // ---------- composer
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const CH = { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2], vi: [9, 0, 4], ii: [2, 5, 9], i: [0, 3, 7], iv: [5, 8, 0], VI: [8, 0, 3], III: [3, 7, 10] };
  const MODES = {
    menu:    { bpm: 76, minor: false, A: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], B: ['IV', 'I', 'vi', 'V', 'IV', 'I', 'V', 'I'], long: true },
    mission: { bpm: 116, minor: false, A: ['I', 'I', 'IV', 'V', 'I', 'IV', 'V', 'I'], B: ['IV', 'IV', 'I', 'vi', 'ii', 'V', 'I', 'V'] },
    rush:    { bpm: 128, minor: false, A: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], B: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'V'] },
    boss:    { bpm: 134, minor: true, A: ['i', 'i', 'VI', 'V', 'i', 'iv', 'V', 'i'], B: ['VI', 'VI', 'III', 'V', 'iv', 'VI', 'V', 'V'] },
  };
  const RHY = [[4, 4, 4, 4], [3, 1, 4, 4, 4], [3, 1, 3, 1, 4, 4], [6, 2, 4, 4], [4, 2, 2, 4, 4], [2, 2, 2, 2, 4, 4], [8, 4, 4], [4, 4, 8], [3, 1, 3, 1, 8]];
  const RHY_LONG = [[8, 8], [8, 4, 4], [12, 4], [4, 4, 8], [6, 2, 8]];
  const CAD = [[4, 4, 8], [3, 1, 4, 8], [8, 8]];

  function compose(mode, seed, key) {
    const M = MODES[mode], R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
    const scale = M.minor ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 4, 5, 7, 9, 11];
    const tonic = 72 + key, lo = tonic - 6, hi = tonic + 16;
    const bars = [...M.A, ...M.B], N = bars.length * 16, ev = Array.from({ length: N }, () => []);
    const inScale = m => scale.includes(((m - tonic) % 12 + 12) % 12);
    const chordTones = (c, near) => { const out = []; for (let m = lo; m <= hi; m++) if (CH[c].includes(((m - tonic) % 12 + 12) % 12)) out.push(m); return out; };
    let prev = tonic + 4;
    const phraseMel = {}; // A melody is written once and reused, so the tune is memorable
    function writeBar(b, c) {
      const pb = b % 8, sect = b < 8 ? 'A' : 'B';
      let rh, notes = [];
      const cad = pb === 3 || pb === 7;
      if (sect === 'A' && pb === 0 && mode !== 'menu') { // bugle-call opening: sol sol do mi sol
        rh = [3, 1, 4, 4, 4]; notes = [tonic - 5, tonic - 5, tonic, tonic + (M.minor ? 3 : 4), tonic + 7];
      } else {
        rh = cad ? pick(CAD) : M.long ? pick(RHY_LONG) : pick(RHY);
        const ct = chordTones(c);
        for (let i = 0; i < rh.length; i++) {
          const last = i === rh.length - 1;
          let m;
          if (last && pb === 7 && sect === 'A') m = ct.filter(x => (x - tonic) % 12 === 0).sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0];
          else if (rh[i] >= 3 || i === 0) {
            const cand = ct.filter(x => x !== prev && Math.abs(x - prev) <= 9);
            cand.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
            m = cand[Math.min(cand.length - 1, Math.floor(Math.pow(R(), 1.6) * Math.min(4, cand.length)))] ?? prev;
          } else { // passing note: one scale step toward somewhere sensible
            let dir = R() < .5 ? 1 : -1; if (prev > hi - 3) dir = -1; if (prev < lo + 3) dir = 1;
            m = prev + dir; while (!inScale(m)) m += dir;
          }
          notes.push(m); prev = m;
        }
      }
      return { rh, notes };
    }
    for (let b = 0; b < bars.length; b++) {
      const c = bars[b], base = b * 16, pb = b % 8;
      const key8 = (b < 8 ? 'A' : 'B') + pb;
      const bar = phraseMel[key8] || (phraseMel[key8] = writeBar(b, c));
      // melody + harmony
      let s = 0;
      bar.rh.forEach((d, i) => {
        const m = bar.notes[i];
        ev[base + s].push({ k: 'mel', m, d, v: s === 0 ? 1 : .85 });
        if (d >= 4) { const h = chordTones(c).filter(x => x <= m - 3).pop(); if (h) ev[base + s].push({ k: 'hor', m: h - 0, d }); }
        s += d;
      });
      let bassM = 36 + pc12(CH[c][0] + key); if (bassM > 45) bassM -= 12;
      const fifth = bassM + 7 > 50 ? bassM - 5 : bassM + 7;
      if (M.long) { // anthem: sustained bass and horn chord
        ev[base].push({ k: 'tuba', m: bassM, d: 16 });
        for (const pc of CH[c]) ev[base].push({ k: 'pad', m: 55 + pc12(pc + key - 7), d: 16 });
        if (pb === 0) ev[base].push({ k: 'timp', m: bassM + 12 });
        if (pb === 7) for (let k = 8; k < 16; k += 2) ev[base + k].push({ k: 'timp', m: bassM + 12, v: .4 + k * .04 });
      } else {
        ev[base].push({ k: 'tuba', m: bassM, d: 4 }); ev[base + 8].push({ k: 'tuba', m: fifth, d: 4 });
        if (mode === 'boss') { ev[base + 4].push({ k: 'tuba', m: bassM, d: 3 }); ev[base + 12].push({ k: 'tuba', m: fifth, d: 3 }); }
        for (const st of [4, 12]) ev[base + st].push({ k: 'stab', c, d: 1.5 });
        // percussion
        ev[base].push({ k: 'kick' }); ev[base + 8].push({ k: 'kick', v: .8 });
        if (mode === 'boss') { ev[base + 4].push({ k: 'kick', v: .6 }); ev[base + 12].push({ k: 'kick', v: .6 }); ev[base].push({ k: 'timp', m: bassM + 12, v: .7 }); }
        if (pb === 7) for (let k = 0; k < 16; k++) ev[base + k].push({ k: 'snare', v: .3 + k * .045 }); // roll into the next phrase
        else for (const [k, v] of pick([[[4, 1], [12, 1]], [[4, 1], [10, .45], [12, 1]], [[2, .4], [4, 1], [12, 1], [14, .4]], [[4, 1], [6, .35], [7, .45], [12, 1]]])) ev[base + k].push({ k: 'snare', v });
        if (pb === 0) ev[base].push({ k: 'crash' });
      }
    }
    return { bpm: M.bpm, ev, N, key, tonic, minor: M.minor };
  }

  // ---------- music transport
  let song = null, step = 0, nextT = 0, loopN = 0, timer = null, want = null, fadeTimer = null;
  function playStep(e, t, sd) {
    const v = e.v ?? 1;
    switch (e.k) {
      case 'mel': brass(e.m, t, e.d * sd * .92, v, 1.1); if (loopN % 2 === 1 && song.picc) picc(e.m + 12, t, e.d * sd * .9, v); break;
      case 'hor': brass(e.m, t, e.d * sd * .9, .55, .7); break;
      case 'pad': brass(e.m, t, e.d * sd, .45, .55); break;
      case 'tuba': tuba(e.m, t, Math.min(e.d * sd * .8, 1.6), v); break;
      case 'stab': for (const pc of CH[e.c]) brass(55 + pc12(pc + song.key - 7), t, e.d * sd, .38, .8); break;
      case 'snare': snare(t, v); break;
      case 'kick': kick(t, v); break;
      case 'crash': crash(t, v); break;
      case 'timp': timp(e.m, t, v); break;
    }
  }
  function tick() {
    if (!live() || !song) return;
    const sd = 60 / song.bpm / 4;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + .05; // we fell behind (tab throttled): skip ahead
    while (nextT < ctx.currentTime + .18) {
      for (const e of song.ev[step]) playStep(e, nextT, sd);
      step = (step + 1) % song.N; if (!step) loopN++;
      nextT += sd;
    }
  }
  function ramp(v, s = .4) { if (!ctx) return; const g = musBus.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + s); }
  let ducked = false;
  const musTarget = () => opts.music ? (ducked ? MUS_VOL * .3 : MUS_VOL) : 0;
  function startSong() {
    if (!want || !live()) return;
    song = compose(want.mode, want.seed, want.key); song.id = want.id; song.picc = want.mode !== 'boss';
    step = 0; loopN = 0; nextT = ctx.currentTime + .08;
    clearInterval(timer); timer = setInterval(tick, 30); tick();
    ramp(musTarget(), .3);
  }
  function music(mode, seed = 1, key = 0) {
    const id = mode + ':' + seed + ':' + key;
    if (want && want.id === id) return;
    want = { mode, seed, key, id };
    if (!live()) return;
    clearTimeout(fadeTimer);
    if (song) { ramp(0, .45); fadeTimer = setTimeout(startSong, 480); } else startSong();
  }
  function stopMusic() { want = null; clearTimeout(fadeTimer); if (!ctx) return; ramp(0, .5); fadeTimer = setTimeout(() => { clearInterval(timer); song = null; }, 520); }
  function duck(on) { ducked = on; if (song) ramp(musTarget(), .25); }
  document.addEventListener('visibilitychange', () => { if (!ctx || !unlocked) return; document.hidden ? ctx.suspend() : ctx.resume().then(catchUp); });

  // a short brass phrase outside the march (jingles)
  function phrase(notes, sd = .13, vel = 1) {
    if (!live() || !opts.sfx) return;
    let t = ctx.currentTime + .05;
    for (const [m, d, chord] of notes) {
      if (m) { brass(m, t, d * sd, vel, 1.1); if (chord) for (const c of chord) brass(c, t, d * sd, .5, .8); }
      t += d * sd;
    }
  }

  return {
    unlock, music, stopMusic, duck,
    get opts() { return opts; },
    get debug() { return { ctx: ctx && ctx.state, unlocked, song: song && song.id, step, loopN, want: want && want.id }; },
    compose,
    toggle(k) { opts[k] = !opts[k]; saveOpts(); unlock(); if (ctx) { sfxBus.gain.value = opts.sfx ? SFX_VOL : 0; ramp(musTarget(), .2); } return opts[k]; },

    // weapons
    shot() { if (throttle('shot', 85)) { tone(1250, .05, { type: 'square', gain: .018, sweepTo: 700 }); noise(.03, { gain: .02, filter: 'highpass', freq: 4000 }); } },
    missile() { if (throttle('mis', 120)) noise(.32, { gain: .06, filter: 'bandpass', freq: 700, sweepTo: 2600, q: 1.5 }); },
    laser() { tone(220, .5, { type: 'sawtooth', gain: .05, sweepTo: 880 }); tone(330, 1.6, { type: 'square', gain: .02, sweepTo: 300, delay: .4 }); },
    flak() { if (throttle('flak', 200)) { noise(.12, { gain: .1, freq: 1800, sweepTo: 400 }); tone(160, .1, { type: 'triangle', gain: .08, sweepTo: 70 }); } },
    zap() { if (throttle('zap', 90)) { noise(.1, { gain: .06, filter: 'bandpass', freq: 5000, q: 3 }); tone(1800, .08, { type: 'sawtooth', gain: .025, sweepTo: 600 }); } },
    // impacts
    hit() { if (throttle('hit', 55)) tone(320 + Math.random() * 120, .04, { type: 'square', gain: .02, sweepTo: 180 }); },
    boom(r = 20) {
      if (!throttle('boom', 45)) return;
      const k = Math.min(1.6, r / 25);
      noise(.25 + k * .2, { gain: .12 + k * .06, freq: 1400, sweepTo: 120 });
      tone(110, .25 + k * .15, { gain: .12 + k * .08, sweepTo: 38 });
    },
    bigBoom() {
      noise(1.4, { gain: .32, freq: 1600, sweepTo: 60 }); tone(90, 1.1, { gain: .3, sweepTo: 26 }); tone(55, 1.4, { gain: .22, sweepTo: 22, delay: .05 });
      for (let i = 1; i < 5; i++) noise(.4, { gain: .12, freq: 1200, sweepTo: 150, delay: i * .14 });
    },
    hurt() { noise(.22, { gain: .18, freq: 900, sweepTo: 200 }); tone(140, .2, { type: 'square', gain: .07, sweepTo: 60 }); },
    shield() { if (throttle('shd', 70)) tone(1500, .14, { type: 'sine', gain: .07, sweepTo: 2400 }); },
    barrier() { tone(880, .3, { type: 'triangle', gain: .1, sweepTo: 1760 }); tone(1320, .3, { type: 'triangle', gain: .06, delay: .05 }); },
    revive() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, { type: 'triangle', gain: .09, delay: i * .07 })); },
    emp() { tone(70, 1.1, { type: 'sawtooth', gain: .12, sweepTo: 900 }); noise(1, { gain: .2, filter: 'bandpass', freq: 300, sweepTo: 5000, q: .7 }); tone(40, .9, { gain: .3, sweepTo: 25 }); },
    // pickups
    star(combo = 0) { if (throttle('star', 32)) tone(Math.min(2200, 880 + combo * 22) * (1 + Math.random() * .02), .07, { type: 'triangle', gain: .05 }); },
    heal() { tone(660, .12, { type: 'sine', gain: .1 }); tone(990, .2, { type: 'sine', gain: .09, delay: .08 }); },
    rescue() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, { type: 'triangle', gain: .08, delay: i * .06 })); },
    part() { phrase([[67, 1], [72, 1], [76, 1], [79, 3, [72, 76]]], .09, .9); },
    cache() { tone(1047, .1, { type: 'square', gain: .04 }); tone(1568, .25, { type: 'square', gain: .04, delay: .07 }); },
    // threats and the storm
    warn() { for (let i = 0; i < 3; i++) { tone(660, .22, { type: 'square', gain: .05, delay: i * .5 }); tone(495, .22, { type: 'square', gain: .05, delay: i * .5 + .25 }); } },
    aim() { if (throttle('aim', 150)) tone(1900, .07, { type: 'square', gain: .025 }); },
    mine() { if (throttle('mine', 120)) [0, .12, .24].forEach(d => tone(2200, .04, { type: 'square', gain: .025, delay: d })); },
    charge() { if (throttle('chg', 200)) tone(300, .9, { type: 'sawtooth', gain: .035, sweepTo: 1300 }); },
    strike() { noise(.12, { gain: .3, filter: 'highpass', freq: 2500 }); noise(1.2, { gain: .22, freq: 700, sweepTo: 60, delay: .03 }); tone(60, .7, { gain: .2, sweepTo: 30 }); },
    thunder() { const d = .15 + Math.random() * .9; noise(.08, { gain: .12, filter: 'highpass', freq: 3000 }); noise(2.4, { gain: .2, freq: 380, sweepTo: 50, delay: d, attack: .12 }); tone(45, 1.8, { gain: .12, sweepTo: 28, delay: d }); },
    // UI and results
    click() { if (throttle('clk', 40)) tone(720, .045, { type: 'square', gain: .03 }); },
    buy() { tone(1319, .08, { type: 'square', gain: .04 }); tone(1760, .2, { type: 'square', gain: .04, delay: .07 }); },
    win() { phrase([[67, 1], [67, 1], [67, 1], [72, 3, [64, 67]], [0, 1], [71, 1], [72, 1], [76, 1], [79, 6, [72, 76]]], .12); },
    lose() { phrase([[67, 3], [65, 3], [63, 3], [60, 8, [55, 51]]], .16, .7); },
  };
})();
