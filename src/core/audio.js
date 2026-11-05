// Todo o som é sintetizado na hora: música adaptativa, efeitos e o rugido do Cramunhão.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // pentatônica menor estendida
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.intensity = 0.3; this.stepN = 0; this.running = false; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5;
    this.master.connect(comp).connect(c.destination);
    // reverb de floresta: cauda de ruído filtrada
    const len = c.sampleRate * 2.2;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.25;
        d[i] = lp * Math.pow(1 - i / len, 3);
      }
    }
    this.rev = c.createConvolver();
    this.rev.buffer = ir;
    const rg = c.createGain();
    rg.gain.value = 0.35;
    this.rev.connect(rg).connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.nextT = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(type, f, t, d, peak, dest = this.master, o = {}) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? d));
    const g = c.createGain();
    this.env(g, t, o.a ?? 0.005, peak, d);
    if (o.lp) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = o.lp;
      osc.connect(fl).connect(g);
    } else osc.connect(g);
    g.connect(dest);
    if (o.rev) { const rs = c.createGain(); rs.gain.value = o.rev; g.connect(rs).connect(this.rev); }
    osc.start(t); osc.stop(t + (o.a ?? 0.005) + d + 0.03);
  }

  noise(t, d, peak, o = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + d);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    this.env(g, t, o.a ?? 0.004, peak, d);
    s.connect(f).connect(g).connect(o.dest ?? this.master);
    if (o.rev) { const rs = c.createGain(); rs.gain.value = o.rev; g.connect(rs).connect(this.rev); }
    s.start(t, Math.random()); s.stop(t + d + 0.1);
  }

  /* ---- ambiente: vento, grilos e o rosnado grave que sobe com a proximidade ---- */
  startAmbience() {
    const c = this.ctx;
    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuf; wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lg = c.createGain(); lg.gain.value = 180;
    lfo.connect(lg).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start(); lfo.start();

    const growl = c.createOscillator();
    growl.type = 'sawtooth'; growl.frequency.value = 42;
    const g2 = c.createOscillator();
    g2.type = 'sawtooth'; g2.frequency.value = 44.7;
    const gf = c.createBiquadFilter();
    gf.type = 'lowpass'; gf.frequency.value = 180; gf.Q.value = 3;
    this.growlG = c.createGain(); this.growlG.gain.value = 0;
    const trem = c.createOscillator(); trem.frequency.value = 7;
    const tg = c.createGain(); tg.gain.value = 60;
    trem.connect(tg).connect(gf.frequency);
    growl.connect(gf); g2.connect(gf); gf.connect(this.growlG).connect(this.master);
    growl.start(); g2.start(); trem.start();
  }

  /** fear 0..1 */
  setFear(f) {
    if (!this.ctx) return;
    this.intensity = f;
    this.growlG.gain.setTargetAtTime(f * f * 0.42, this.ctx.currentTime, 0.2);
  }

  /* ---- música por sequenciador: compasso de perseguição folk ---- */
  setRunning(on) { this.running = on; this.stepN = 0; }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.18) {
      const bpm = this.running ? 138 + this.intensity * 26 : 72;
      const dur = 60 / bpm / 2;
      this.step(this.stepN, this.nextT, dur);
      this.stepN = (this.stepN + 1) % 64;
      this.nextT += dur;
    }
  }

  step(n, t, dur) {
    const m = this.music;
    const bar = Math.floor(n / 16);
    const roots = [45, 45, 43, 41];
    const root = roots[bar % 4];
    if (!this.running) {
      // título: kalimba esparsa e misteriosa
      if (n % 6 === 0) {
        const note = 69 + SCALE[Math.floor(Math.random() * 6)];
        this.tone('triangle', midi(note), t, 1.1, 0.09, m, { rev: 0.9 });
      }
      if (n % 32 === 0) this.tone('sine', midi(33), t, 3.0, 0.14, m, { a: 0.8 });
      return;
    }
    // tambor: bumbo sincopado
    const kick = [0, 3, 6, 8, 11, 14];
    if (kick.includes(n % 16)) {
      this.tone('sine', 120, t, 0.16, n % 8 === 0 ? 0.55 : 0.34, m, { to: 40, glide: 0.1 });
    }
    // chocalho
    if (n % 2 === 1 || this.intensity > 0.5) this.noise(t, 0.03, 0.05 + this.intensity * 0.04, { type: 'highpass', f: 6500, dest: m });
    // aro
    if (n % 8 === 4) this.noise(t, 0.09, 0.2, { f: 1800, q: 2, dest: m, rev: 0.3 });
    // baixo pizzicato
    const bassP = [0, 0, 12, 0, 7, 0, 10, 12];
    if (n % 2 === 0) this.tone('triangle', midi(root + bassP[(n / 2) % 8]), t, 0.2, 0.3, m, { lp: 900 });
    // ostinato de corda dedilhada
    const ost = [0, 7, 12, 15, 12, 7, 10, 7];
    this.tone('sawtooth', midi(root + 24 + ost[n % 8]), t, 0.11, 0.05, m, { lp: 1400 + this.intensity * 1500, rev: 0.25 });
    // melodia de ocarina em frases, entra quando esquenta
    const mel = [12, -1, 15, 17, 19, -1, 17, 15, 12, -1, 10, 12, 7, -1, -1, -1];
    const me = mel[n % 16];
    if (bar % 2 === 1 && me >= 0) this.tone('sine', midi(root + 24 + me), t, dur * 1.8, 0.11, m, { a: 0.02, rev: 0.6 });
  }

  /* ---- efeitos ---- */
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  step_(side) {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.05, 0.05, { type: 'lowpass', f: 700 + side * 100 });
    this.tone('sine', 130 + side * 12, t, 0.05, 0.05);
  }
  jump() { if (!this.ctx) return; const t = this.now(); this.tone('sine', 290, t, 0.2, 0.2, undefined, { to: 720, glide: 0.14 }); this.tone('triangle', 580, t, 0.12, 0.05, undefined, { to: 1200 }); }
  bigJump() { if (!this.ctx) return; const t = this.now(); this.tone('sine', 190, t, 0.45, 0.32, undefined, { to: 1050, glide: 0.34 }); this.tone('square', 95, t, 0.1, 0.08); }
  land() { if (!this.ctx) return; const t = this.now(); this.tone('sine', 150, t, 0.09, 0.26, undefined, { to: 60 }); this.noise(t, 0.08, 0.1, { type: 'lowpass', f: 900 }); }
  slide() { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.55, 0.15, { f: 1900, to: 600, q: 0.8, a: 0.03 }); }
  whoosh() { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.14, 0.09, { f: 700, to: 1800, q: 1.4 }); }
  coin(combo) {
    if (!this.ctx) return;
    const t = this.now();
    const f = midi(76 + SCALE[combo % SCALE.length]);
    this.tone('triangle', f, t, 0.18, 0.13, undefined, { rev: 0.5 });
    this.tone('sine', f * 2, t, 0.1, 0.05);
  }
  hit() {
    if (!this.ctx) return;
    const t = this.now();
    this.tone('sawtooth', 180, t, 0.25, 0.3, undefined, { to: 45, lp: 700 });
    this.noise(t, 0.2, 0.34, { type: 'lowpass', f: 1600, to: 200 });
    // "ai!" do gnomo: formante agudo
    this.tone('square', 760, t + 0.03, 0.14, 0.07, undefined, { to: 460, lp: 2200 });
  }
  thud(k = 1) {
    if (!this.ctx) return;
    const t = this.now();
    this.tone('sine', 72, t, 0.3, 0.5 * k, undefined, { to: 28 });
    this.noise(t, 0.12, 0.2 * k, { type: 'lowpass', f: 300 });
  }
  flash() {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.8, 0.4, { f: 400, to: 7000, q: 0.7, a: 0.08, rev: 0.9 });
    [76, 79, 84, 88, 91].forEach((n, i) => this.tone('triangle', midi(n), t + i * 0.035, 0.7, 0.1, undefined, { rev: 1 }));
    this.tone('sine', 110, t, 0.8, 0.4, undefined, { to: 440 });
  }
  roar(k = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now(), d = 1.5 * k;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.8 * k, t + 0.14);
    out.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const ws = c.createWaveShaper();
    const cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; cv[i] = Math.tanh(x * 5); }
    ws.curve = cv;
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    f1.type = 'bandpass'; f1.Q.value = 3; f1.frequency.setValueAtTime(320, t); f1.frequency.linearRampToValueAtTime(760, t + 0.3); f1.frequency.linearRampToValueAtTime(260, t + d);
    f2.type = 'bandpass'; f2.Q.value = 5; f2.frequency.setValueAtTime(900, t); f2.frequency.linearRampToValueAtTime(1500, t + 0.3); f2.frequency.linearRampToValueAtTime(600, t + d);
    ws.connect(f1).connect(out); ws.connect(f2).connect(out);
    const fm = c.createOscillator(); fm.frequency.value = 37;
    const fg = c.createGain(); fg.gain.value = 38;
    fm.connect(fg);
    for (const det of [62, 64.5, 93, 31]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(det * 0.9, t);
      o.frequency.linearRampToValueAtTime(det * 1.3, t + 0.3);
      o.frequency.linearRampToValueAtTime(det * 0.65, t + d);
      fg.connect(o.frequency);
      o.connect(ws);
      o.start(t); o.stop(t + d + 0.05);
    }
    fm.start(t); fm.stop(t + d + 0.05);
    this.noise(t, d, 0.3 * k, { f: 900, to: 300, q: 0.7, a: 0.12 });
    out.connect(this.master);
    const rg = c.createGain(); rg.gain.value = 0.5;
    out.connect(rg).connect(this.rev);
  }
  gulp() {
    if (!this.ctx) return;
    const t = this.now();
    this.tone('sine', 320, t, 0.22, 0.4, undefined, { to: 80 });
    this.noise(t + 0.24, 0.5, 0.15, { type: 'lowpass', f: 300, a: 0.1 });
    this.tone('sawtooth', 70, t + 0.75, 0.5, 0.2, undefined, { to: 44, lp: 400 }); // arroto
  }
  boulder() { if (!this.ctx) return; const t = this.now(); this.noise(t, 1.0, 0.13, { f: 300, to: 1200, q: 1.5, a: 0.4 }); }
}
