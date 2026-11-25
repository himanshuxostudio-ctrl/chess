/**
 * Procedural battlefield audio built entirely with the Web Audio API — no audio files to
 * license or download. Four mix buses (music, environment, combat, ui) feed a master gain.
 */
import type { AmbienceProfile } from '../three/arena/themes';
import { useSettings } from '../config/settings';

export type Sfx =
  | 'select'
  | 'ui'
  | 'step'
  | 'armor'
  | 'gallop'
  | 'wheels'
  | 'swing'
  | 'clash'
  | 'shield'
  | 'thud'
  | 'fall'
  | 'chant'
  | 'check'
  | 'checkmate'
  | 'illegal'
  | 'promote'
  | 'turn'
  | 'draw';

type Bus = 'music' | 'environment' | 'combat' | 'ui';

class SoundEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses!: Record<Bus, GainNode>;
  noise!: AudioBuffer;
  ambientNodes: AudioNode[] = [];
  drumTimer: number | null = null;
  ambientOn = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const mk = () => {
        const g = this.ctx!.createGain();
        g.connect(this.master);
        return g;
      };
      this.buses = { music: mk(), environment: mk(), combat: mk(), ui: mk() };
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      useSettings.subscribe(() => this.applyVolumes());
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = useSettings.getState();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.soundOn ? s.volumes.master : 0, t, 0.05);
    (Object.keys(this.buses) as Bus[]).forEach((b) => this.buses[b].gain.setTargetAtTime(s.volumes[b], t, 0.05));
  }

  // ---------- primitives ----------
  private noiseBurst(bus: Bus, at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.buses[bus]);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.05);
  }
  private tone(bus: Bus, at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', endFreq?: number, attack = 0.005) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.buses[bus]);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  /** Brass-like horn: detuned saws through a swelling low-pass. */
  private horn(bus: Bus, at: number, dur: number, freq: number, gain: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, at);
    f.frequency.linearRampToValueAtTime(1800, at + 0.15);
    f.frequency.linearRampToValueAtTime(900, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.08);
    g.gain.setValueAtTime(gain, at + dur - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    f.connect(g).connect(this.buses[bus]);
    for (const det of [-6, 0, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      const vib = c.createOscillator();
      vib.frequency.value = 5;
      const vg = c.createGain();
      vg.gain.value = 4;
      vib.connect(vg).connect(o.detune);
      o.connect(f);
      o.start(at);
      vib.start(at);
      o.stop(at + dur + 0.05);
      vib.stop(at + dur + 0.05);
    }
  }
  private drum(bus: Bus, at: number, gain: number, freq = 70) {
    this.tone(bus, at, 0.5, freq * 1.6, gain, 'sine', freq * 0.6);
    this.noiseBurst(bus, at, 0.12, 900, 0.8, gain * 0.25, 'lowpass');
  }

  play(name: Sfx, delay = 0) {
    if (!this.ctx || !useSettings.getState().soundOn) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    switch (name) {
      case 'select':
        this.tone('ui', t, 0.12, 660, 0.15, 'triangle', 880);
        this.noiseBurst('ui', t, 0.05, 4000, 4, 0.05);
        break;
      case 'ui':
        this.tone('ui', t, 0.08, 520, 0.12, 'triangle');
        break;
      case 'turn':
        this.drum('ui', t, 0.5, 60);
        this.drum('ui', t + 0.22, 0.35, 60);
        break;
      case 'illegal':
        this.tone('ui', t, 0.18, 180, 0.2, 'square', 120);
        break;
      case 'step':
        this.noiseBurst('combat', t, 0.09, 300, 1.2, 0.25, 'lowpass');
        break;
      case 'armor':
        for (let i = 0; i < 3; i++) this.tone('combat', t + i * 0.03, 0.15, 2400 + Math.random() * 1800, 0.03, 'square');
        this.noiseBurst('combat', t, 0.1, 6000, 3, 0.05);
        break;
      case 'gallop':
        for (let i = 0; i < 3; i++) this.noiseBurst('combat', t + i * 0.09, 0.07, 220, 1, 0.35, 'lowpass');
        break;
      case 'wheels':
        this.noiseBurst('combat', t, 0.6, 140, 0.7, 0.3, 'lowpass');
        break;
      case 'swing':
        this.noiseBurst('combat', t, 0.22, 1800, 1.5, 0.22);
        break;
      case 'clash':
        // inharmonic metal partials + bright noise
        for (const f of [1870, 2630, 3410, 4790]) this.tone('combat', t, 0.6 + Math.random() * 0.3, f, 0.05, 'sine');
        this.noiseBurst('combat', t, 0.18, 5000, 1.2, 0.35, 'highpass');
        break;
      case 'shield':
        this.tone('combat', t, 0.25, 140, 0.45, 'sine', 70);
        this.noiseBurst('combat', t, 0.15, 900, 1.5, 0.3);
        break;
      case 'thud':
        this.tone('combat', t, 0.3, 110, 0.5, 'sine', 45);
        break;
      case 'fall':
        this.noiseBurst('combat', t, 0.5, 250, 0.7, 0.4, 'lowpass');
        this.play('armor', delay + 0.05);
        break;
      case 'chant':
        this.tone('combat', t, 0.9, 220, 0.08, 'triangle', undefined, 0.2);
        this.tone('combat', t, 0.9, 330, 0.06, 'triangle', undefined, 0.2);
        break;
      case 'promote':
        this.horn('combat', t, 0.5, 392, 0.12);
        this.horn('combat', t + 0.25, 0.8, 523, 0.12);
        break;
      case 'check':
        this.horn('combat', t, 0.9, 147, 0.18);
        this.horn('combat', t + 0.05, 0.85, 220, 0.12);
        break;
      case 'checkmate':
        for (let i = 0; i < 8; i++) this.drum('combat', t + i * 0.11, 0.3 + i * 0.05, 55);
        this.horn('combat', t + 0.9, 1.8, 110, 0.2);
        this.horn('combat', t + 0.9, 1.8, 165, 0.14);
        this.victoryMusic(t + 1.4);
        break;
      case 'draw':
        this.horn('combat', t, 1.2, 196, 0.14);
        this.horn('combat', t + 0.1, 1.2, 233, 0.1);
        break;
    }
  }

  /** Short modal (Dorian) fanfare. */
  victoryMusic(at: number) {
    const D = 146.83;
    const ratios = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 16 / 9, 2];
    const melody: [number, number][] = [
      [0, 0.4], [4, 0.4], [7, 0.8], [5, 0.4], [4, 0.4], [3, 0.4], [4, 1.2],
    ];
    let tt = at;
    for (const [deg, dur] of melody) {
      this.horn('music', tt, dur * 0.95, D * 2 * ratios[deg % 8] * (deg >= 8 ? 2 : 1), 0.12);
      this.drum('music', tt, 0.25, 65);
      tt += dur;
    }
    this.horn('music', tt, 2, D, 0.12);
    this.horn('music', tt, 2, D * 1.5, 0.08);
  }

  /** Ambience of the current battlefield (see src/three/arena/themes.ts). */
  ambience: AmbienceProfile = { wind: 500, windGain: 0.18, drone: 0, droneGain: 0, drums: 'distant', crackle: 0.3 };
  crackleTimer: number | null = null;

  /** Switch ambience (battlefield changed); restarts the loop if it is playing. */
  setAmbience(p: AmbienceProfile) {
    this.ambience = p;
    if (this.ambientOn) {
      this.stopAmbient();
      this.startAmbient();
    }
  }

  /** Wind, optional drone, fire crackle and drums, shaped by the battlefield's ambience profile. */
  startAmbient() {
    if (!this.ctx || this.ambientOn) return;
    this.ambientOn = true;
    const c = this.ctx;
    const a = this.ambience;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = a.wind;
    f.Q.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = a.wind * 0.6;
    lfo.connect(lg).connect(f.frequency);
    const g = c.createGain();
    g.gain.value = a.windGain;
    const gl = c.createOscillator();
    gl.frequency.value = 0.11;
    const glg = c.createGain();
    glg.gain.value = a.windGain * 0.45;
    gl.connect(glg).connect(g.gain);
    src.connect(f).connect(g).connect(this.buses.environment);
    src.start();
    lfo.start();
    gl.start();
    this.ambientNodes = [src, lfo, gl];
    if (a.drone > 0) {
      // low, slowly beating drone (two detuned oscillators)
      const dg = c.createGain();
      dg.gain.value = a.droneGain;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      dg.connect(lp).connect(this.buses.music);
      for (const det of [0, 0.7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = a.drone + det;
        o.connect(dg);
        o.start();
        this.ambientNodes.push(o);
      }
    }
    if (a.crackle > 0) {
      const crack = () => {
        if (!this.ctx || !this.ambientOn) return;
        const t = this.ctx.currentTime;
        const n = this.ctx.createBufferSource();
        n.buffer = this.noise;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        const cg = this.ctx.createGain();
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(0.05 * a.crackle, t + 0.005);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        n.connect(hp).connect(cg).connect(this.buses.environment);
        n.start(t, Math.random(), 0.08);
        this.crackleTimer = window.setTimeout(crack, 120 + Math.random() * 900 / a.crackle);
      };
      this.crackleTimer = window.setTimeout(crack, 400);
    }
    if (a.drums !== 'none') {
      const war = a.drums === 'war';
      const beat = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const phrase: readonly (readonly [number, number])[] = war
          ? [[0, 0.16], [0.35, 0.12], [0.7, 0.18], [1.4, 0.14], [1.75, 0.2]]
          : [[0, 0.14], [0.45, 0.1], [0.9, 0.16]];
        for (const [o, v] of phrase) this.drum('music', t + o, v, war ? 56 : 50);
        this.drumTimer = window.setTimeout(beat, (war ? 4500 : 6000) + Math.random() * 5000);
      };
      this.drumTimer = window.setTimeout(beat, 2500);
    }
  }
  stopAmbient() {
    this.ambientOn = false;
    for (const n of this.ambientNodes) (n as AudioScheduledSourceNode).stop?.();
    this.ambientNodes = [];
    if (this.drumTimer) clearTimeout(this.drumTimer);
    if (this.crackleTimer) clearTimeout(this.crackleTimer);
  }
}

export const sound = new SoundEngine();
