// Sound (plan §3.6, §9). Everything is synthesized with the Web Audio API: no audio files, no
// licenses to track, a few KB of code. These are placeholders in the right places and at the right
// moments; recorded or CC0 sounds can replace any of them later behind the same names.
//
// One shared AudioContext, created on the first user gesture (autoplay rules everywhere, iOS
// especially). Suspended whenever the game is paused or hidden.

import type { SimEvent } from "../sim/types.ts";

export type Sfx =
  | "cricket" | "possum" | "squirrel" | "crow" | "rat"
  | "sprinkler" | "broomNeighbor" | "yardDog" | "motionLight" | "chew"
  | "shoo" | "pile" | "win" | "yawn" | "tap" | "buy";

export type Theme = "menu" | "alley" | "backyards" | "culdesac" | "stripmall";

const MIN_GAP: Partial<Record<Sfx, number>> = { cricket: 0.07, shoo: 0.06, pile: 0.08, sprinkler: 0.3 };
const MAX_VOICES = 14;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<Sfx, number>();
  private voices = 0;
  private music: Music | null = null;
  private wantTheme: Theme | null = null;
  private volumes = { music: 0.7, sfx: 1 };
  private paused = false;

  constructor() {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
  }

  setVolumes(music: number, sfx: number) {
    this.volumes = { music, sfx };
    if (this.musicGain) this.musicGain.gain.value = music * 0.35;
    if (this.sfxGain) this.sfxGain.gain.value = sfx * 0.6;
  }

  /** Pause or resume all sound (app backgrounded, pause menu open). */
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  theme(theme: Theme) {
    this.wantTheme = theme;
    if (!this.ctx) return; // starts once the first gesture creates the context
    if (this.music?.theme === theme) return;
    this.music?.stop();
    this.music = new Music(this.ctx, this.musicGain!, theme);
  }

  /** Map sim events to sounds. */
  onEvents(events: SimEvent[], defenseIdAt: (index: number) => string) {
    for (const e of events) {
      if (e.type === "unitSent") this.play(e.unit);
      else if (e.type === "defenseFired") this.play(defenseIdAt(e.index) as Sfx);
      else if (e.type === "unitShooed") this.play("shoo");
      else if (e.type === "pileHit") this.play("pile");
      else if (e.type === "defenseChewed") this.play("chew");
      else if (e.type === "levelWon") this.play("win");
      else if (e.type === "nightEnded") this.play("yawn");
    }
  }

  play(name: Sfx) {
    if (!this.ctx || this.paused || this.volumes.sfx === 0 || this.voices >= MAX_VOICES) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < (MIN_GAP[name] ?? 0.03)) return;
    this.lastPlayed.set(name, now);
    const out = this.sfxGain!;
    const voice = (dur: number) => {
      this.voices++;
      setTimeout(() => this.voices--, dur * 1000 + 50);
    };
    const c = this.ctx;
    switch (name) {
      case "cricket": // two quick chirps
        for (const t of [0, 0.06]) tone(c, out, { type: "sine", f0: 3600, f1: 4400, at: now + t, dur: 0.045, vol: 0.18 });
        return voice(0.12);
      case "possum":
        tone(c, out, { type: "triangle", f0: 230, f1: 170, at: now, dur: 0.22, vol: 0.4 });
        return voice(0.22);
      case "squirrel": // chitter
        for (let i = 0; i < 3; i++) tone(c, out, { type: "square", f0: 1700, f1: 1500, at: now + i * 0.045, dur: 0.03, vol: 0.06 });
        return voice(0.15);
      case "crow":
        tone(c, out, { type: "sawtooth", f0: 620, f1: 420, at: now, dur: 0.18, vol: 0.12, lowpass: 1600 });
        return voice(0.18);
      case "rat":
        tone(c, out, { type: "sine", f0: 2400, f1: 3100, at: now, dur: 0.07, vol: 0.15 });
        return voice(0.07);
      case "sprinkler":
        this.hiss(out, now, 0.3, 5200, 0.12);
        return voice(0.3);
      case "broomNeighbor":
        this.hiss(out, now, 0.18, 1400, 0.25, 3200);
        return voice(0.18);
      case "yardDog": // "boof"
        tone(c, out, { type: "sine", f0: 170, f1: 110, at: now, dur: 0.16, vol: 0.6 });
        this.hiss(out, now, 0.08, 500, 0.2);
        return voice(0.16);
      case "motionLight":
        tone(c, out, { type: "square", f0: 1200, f1: 1200, at: now, dur: 0.015, vol: 0.12 });
        tone(c, out, { type: "sine", f0: 120, f1: 120, at: now + 0.02, dur: 0.5, vol: 0.08 });
        return voice(0.5);
      case "chew":
        for (let i = 0; i < 4; i++) this.hiss(out, now + i * 0.06, 0.04, 2500, 0.2);
        return voice(0.25);
      case "shoo": // boing
        tone(c, out, { type: "sine", f0: 280, f1: 720, at: now, dur: 0.22, vol: 0.22, wobble: 18 });
        return voice(0.22);
      case "pile": // crunch
        this.hiss(out, now, 0.12, 900, 0.35);
        tone(c, out, { type: "triangle", f0: 140, f1: 90, at: now, dur: 0.1, vol: 0.25 });
        return voice(0.12);
      case "win": // a little arpeggio
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(c, out, { type: "triangle", f0: f, f1: f, at: now + i * 0.11, dur: i === 3 ? 0.5 : 0.16, vol: 0.3 }),
        );
        return voice(0.9);
      case "yawn":
        tone(c, out, { type: "sine", f0: 520, f1: 210, at: now, dur: 1.1, vol: 0.25, wobble: 4 });
        return voice(1.1);
      case "tap":
        tone(c, out, { type: "sine", f0: 900, f1: 700, at: now, dur: 0.05, vol: 0.12 });
        return voice(0.05);
      case "buy":
        [784, 1175].forEach((f, i) => tone(c, out, { type: "triangle", f0: f, f1: f, at: now + i * 0.08, dur: 0.14, vol: 0.25 }));
        return voice(0.3);
    }
  }

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    // Respect the iOS silent switch where Safari lets us (16.4+).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
    this.ctx = new AC();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain.connect(this.ctx.destination);
    this.setVolumes(this.volumes.music, this.volumes.sfx);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < len; i++) data[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    if (this.paused) void this.ctx.suspend();
    if (this.wantTheme) this.theme(this.wantTheme);
  }

  private hiss(out: AudioNode, at: number, dur: number, freq: number, vol: number, sweepTo?: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}

interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1: number;
  at: number;
  dur: number;
  vol: number;
  lowpass?: number;
  wobble?: number; // vibrato rate in Hz
}

function tone(c: AudioContext, out: AudioNode, o: ToneOpts) {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, o.at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), o.at + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.exponentialRampToValueAtTime(o.vol, o.at + Math.min(0.01, o.dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lowpass;
    node = node.connect(f);
  }
  if (o.wobble) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = o.wobble;
    depth.gain.value = o.f0 * 0.04;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(o.at);
    lfo.stop(o.at + o.dur);
  }
  node.connect(g).connect(out);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.02);
}

// ---------------------------------------------------------------- music

// Picture-book loops: a plucked "ukulele" on chord tones, a soft bass, a glockenspiel melody that
// wanders over the chord. One progression and tempo per area. Scheduled a little ahead of time.
const THEMES: Record<Theme, { bpm: number; chords: number[][]; root: number }> = {
  menu: { bpm: 84, root: 60, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]] },
  alley: { bpm: 92, root: 57, chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]] },
  backyards: { bpm: 100, root: 62, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]] },
  culdesac: { bpm: 96, root: 65, chords: [[0, 4, 7], [2, 5, 9], [5, 9, 12], [7, 11, 14]] },
  stripmall: { bpm: 108, root: 55, chords: [[0, 4, 7], [10, 14, 17], [5, 9, 12], [7, 11, 14]] },
};

class Music {
  private timer: number;
  private next: number;
  private step = 0;
  private seed = 7;
  private ctx: AudioContext;
  private out: GainNode;
  readonly theme: Theme;

  constructor(ctx: AudioContext, out: GainNode, theme: Theme) {
    this.ctx = ctx;
    this.out = out;
    this.theme = theme;
    this.next = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  stop() {
    clearInterval(this.timer);
  }

  private schedule() {
    const t = THEMES[this.theme];
    const eighth = 60 / t.bpm / 2;
    while (this.next < this.ctx.currentTime + 0.4) {
      const bar = Math.floor(this.step / 8) % t.chords.length;
      const chord = t.chords[bar]!;
      const beat = this.step % 8;
      const at = this.next;
      const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
      if (beat === 0 || beat === 4) pluck(this.ctx, this.out, midi(t.root - 12 + chord[0]!), at, eighth * 3.5, 0.28, "sine");
      // ukulele strum pattern: down, down-up, up-down-up
      if ([0, 2, 3, 5, 6, 7].includes(beat)) pluck(this.ctx, this.out, midi(t.root + chord[beat % 3]!), at, eighth * 1.6, 0.09, "triangle");
      // glockenspiel: a sparse wandering melody on chord tones
      this.seed = (this.seed * 16807) % 2147483647;
      if (beat % 2 === 0 && this.seed % 3 === 0) {
        const n = chord[this.seed % chord.length]! + 12 + (this.seed % 5 === 0 ? 12 : 0);
        pluck(this.ctx, this.out, midi(t.root + n), at, eighth * 2, 0.06, "sine");
      }
      this.next += eighth;
      this.step++;
    }
  }
}

function pluck(c: AudioContext, out: AudioNode, f: number, at: number, dur: number, vol: number, type: OscillatorType) {
  tone(c, out, { type, f0: f, f1: f * 0.998, at, dur, vol });
}
