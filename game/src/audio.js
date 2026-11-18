// Procedural WebAudio: no audio files. Engine hum, siren, gunshots, footsteps,
// UI clicks, a synthwave music loop and mission stingers — all synthesized.
export function createAudio() {
  let ctx = null, master = null, musicGain = null, engineNodes = null, sirenNodes = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: two detuned saws through a lowpass.
      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 500;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 110;
      const o2g = ctx.createGain(); o2g.gain.value = 0.4;
      o1.connect(filter); o2.connect(o2g); o2g.connect(filter);
      filter.connect(engGain); engGain.connect(master);
      o1.start(); o2.start();
      engineNodes = { o1, o2, engGain, filter };
      // Siren: a square wave whose frequency alternates via LFO.
      const sirGain = ctx.createGain(); sirGain.gain.value = 0;
      const sir = ctx.createOscillator(); sir.type = 'triangle'; sir.frequency.value = 750;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
      lfo.connect(lfoGain); lfoGain.connect(sir.frequency);
      sir.connect(sirGain); sirGain.connect(master);
      sir.start(); lfo.start();
      sirenNodes = { sirGain };
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseHit(dur, vol, filterFreq) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  // Chord pad + bass + hats, Am F C G at 100 BPM, scheduled in 8th-note steps.
  const CHORDS = [
    [220.0, 261.6, 329.6], [174.6, 220.0, 261.6],
    [261.6, 329.6, 392.0], [196.0, 246.9, 293.7],
  ];
  const BASS = [55, 43.65, 65.41, 49];
  function musicStep() {
    if (!ctx || muted) return;
    const chord = CHORDS[Math.floor(step / 8) % 4];
    if (step % 8 === 0) {
      for (const f of chord) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
        const g = ctx.createGain();
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
        o.connect(fl); fl.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 2.4);
      }
      blip(BASS[Math.floor(step / 8) % 4], 0.5, 'sine', 0.22);
    }
    if (step % 2 === 1) noiseHit(0.03, 0.05, 6000); // hat
    if (step % 4 === 0) blip(120, 0.12, 'sine', 0.3); // kick
    step = (step + 1) % 32;
  }
  function startMusic() {
    if (musicTimer) return;
    musicTimer = setInterval(musicStep, 300);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setEngine(ratio, moving) {
      if (!engineNodes || !ctx) return;
      const t = ctx.currentTime;
      engineNodes.o1.frequency.setTargetAtTime(45 + ratio * 130, t, 0.08);
      engineNodes.o2.frequency.setTargetAtTime(90 + ratio * 260, t, 0.08);
      engineNodes.engGain.gain.setTargetAtTime(moving ? 0.06 + ratio * 0.08 : 0.02, t, 0.1);
      engineNodes.filter.frequency.setTargetAtTime(400 + ratio * 1400, t, 0.1);
    },
    siren(on) {
      if (!sirenNodes || !ctx) return;
      sirenNodes.sirGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    shot(distant) { noiseHit(0.14, distant ? 0.12 : 0.4, distant ? 1200 : 3500); blip(160, 0.08, 'square', distant ? 0.05 : 0.18); },
    thud() { noiseHit(0.1, 0.3, 300); },
    door() { noiseHit(0.08, 0.2, 800); blip(90, 0.08, 'sine', 0.25); },
    alarm() { blip(880, 0.15, 'square', 0.12); blip(660, 0.15, 'square', 0.12, 0.16); },
    swing() { noiseHit(0.07, 0.15, 2000); },
    hit() { noiseHit(0.08, 0.25, 900); blip(200, 0.06, 'triangle', 0.2); },
    click() { blip(1200, 0.04, 'square', 0.06); },
    reload() { blip(500, 0.05, 'square', 0.1); blip(700, 0.05, 'square', 0.1, 0.12); },
    explosion() { noiseHit(0.9, 0.6, 500); blip(60, 0.7, 'sine', 0.5); },
    missionComplete() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.16, i * 0.11)); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
