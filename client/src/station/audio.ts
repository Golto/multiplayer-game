// Ambiance sonore synthétisée : souffle de ventilation, bourdonnement, craquements lointains de la
// coque, pas sur le métal, portes pneumatiques, ascenseur et navette. Rien n'est enregistré.

import type * as THREE from "three";

export class StationAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listener = { x: 0, y: 0, z: 0 };
  private hum: GainNode | null = null;
  private vent: BiquadFilterNode | null = null;
  private ride: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private lift: { osc: OscillatorNode; gain: GainNode } | null = null;
  private nextCreak = 6;
  muted = false;

  /** À appeler sur un geste de l'utilisateur. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    // Bruit brun : grave et doux.
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    // Souffle de ventilation.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.vent = ctx.createBiquadFilter();
    this.vent.type = "lowpass";
    this.vent.frequency.value = 420;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.32;
    air.connect(this.vent).connect(airGain).connect(this.master);
    air.start();

    // Bourdonnement électrique, très bas.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0.035;
    for (const [f, g] of [
      [50, 1],
      [100, 0.5],
      [150, 0.18],
    ] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.hum);
      o.start();
    }
    // Lente respiration du bourdonnement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(this.hum.gain);
    lfo.start();
    this.hum.connect(this.master);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  /** Position de l'auditeur et ambiance de la zone (grande salle : plus de souffle). */
  update(dt: number, pos: THREE.Vector3, openness: number): void {
    this.listener = { x: pos.x, y: pos.y, z: pos.z };
    const ctx = this.ctx;
    if (!ctx) return;
    this.vent?.frequency.setTargetAtTime(300 + openness * 500, ctx.currentTime, 1.5);
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = 9 + Math.random() * 18;
      this.creak();
    }
  }

  /** Atténuation simple selon la distance. */
  private at(pos: { x: number; y: number; z: number }, range = 18): number {
    const dx = pos.x - this.listener.x;
    const dy = pos.y - this.listener.y;
    const dz = pos.z - this.listener.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.max(0, 1 - dist / range);
  }

  private burst(o: { gain: number; freq: number; q: number; dur: number; type?: BiquadFilterType; sweep?: number; delay?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master || o.gain <= 0.001) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.5;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.freq * o.sweep, t + o.dur);
    f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + o.dur + 0.05);
  }

  private tone(freq: number, gain: number, dur: number, delay = 0, type: OscillatorType = "sine"): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Pas : talon métallique sur caillebotis, ou plus sourd sur moquette. */
  footstep(soft: boolean, run: boolean): void {
    const v = run ? 1.3 : 1;
    if (soft) {
      this.burst({ gain: 0.12 * v, freq: 300 + Math.random() * 80, q: 1, dur: 0.12, type: "lowpass" });
    } else {
      this.burst({ gain: 0.16 * v, freq: 900 + Math.random() * 500, q: 4, dur: 0.09 });
      this.burst({ gain: 0.09 * v, freq: 2600 + Math.random() * 800, q: 8, dur: 0.05, delay: 0.015 });
    }
  }

  /** Craquement lointain de la coque : la station travaille. */
  private creak(): void {
    const g = 0.12 + Math.random() * 0.1;
    this.burst({ gain: g, freq: 140 + Math.random() * 60, q: 12, dur: 1.6, sweep: 0.6 });
    this.burst({ gain: g * 0.6, freq: 700, q: 20, dur: 0.9, sweep: 1.4, delay: 0.3 });
  }

  door(pos: THREE.Vector3, opening: boolean): void {
    const a = this.at(pos);
    this.burst({ gain: 0.3 * a, freq: opening ? 2400 : 1600, q: 0.8, dur: 0.55, type: "bandpass", sweep: opening ? 0.4 : 1.6 });
    this.burst({ gain: 0.25 * a, freq: 120, q: 2, dur: 0.35, delay: opening ? 0.45 : 0.3, type: "lowpass" });
  }

  elevatorStart(pos: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.tone(660, 0.12 * this.at(pos, 30), 0.6);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 42;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(f).connect(gain).connect(this.master);
    osc.start();
    this.lift = { osc, gain };
  }

  elevatorMove(pos: THREE.Vector3): void {
    if (this.lift && this.ctx) this.lift.gain.gain.setTargetAtTime(0.1 * this.at(pos, 25), this.ctx.currentTime, 0.2);
  }

  elevatorArrive(pos: THREE.Vector3): void {
    if (this.lift && this.ctx) {
      const { osc, gain } = this.lift;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      osc.stop(this.ctx.currentTime + 1);
      this.lift = null;
    }
    const a = this.at(pos, 30);
    this.tone(880, 0.14 * a, 0.9);
    this.tone(660, 0.12 * a, 1.2, 0.25);
  }

  tramStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    this.tone(523, 0.1, 0.5);
    this.tone(392, 0.1, 0.8, 0.3);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    osc.connect(filter);
    src.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    src.start();
    this.ride = { osc, gain, filter, src };
  }

  private clack = 0;

  tramMove(speed: number): void {
    if (!this.ride || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ride.gain.gain.setTargetAtTime(0.05 + speed * 0.25, t, 0.3);
    this.ride.osc.frequency.setTargetAtTime(45 + speed * 50, t, 0.3);
    this.ride.filter.frequency.setTargetAtTime(160 + speed * 500, t, 0.3);
    this.clack += speed * 0.04;
    if (this.clack > 1) {
      this.clack = 0;
      this.burst({ gain: 0.15 * speed, freq: 500, q: 6, dur: 0.08 });
      this.burst({ gain: 0.12 * speed, freq: 450, q: 6, dur: 0.08, delay: 0.12 });
    }
  }

  tramStop(): void {
    if (this.ride && this.ctx) {
      const { osc, gain, src } = this.ride;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      osc.stop(this.ctx.currentTime + 2);
      src.stop(this.ctx.currentTime + 2);
      this.ride = null;
    }
    this.burst({ gain: 0.25, freq: 2000, q: 0.7, dur: 0.8, sweep: 0.3 });
    this.tone(392, 0.1, 0.5, 0.4);
    this.tone(523, 0.1, 0.8, 0.7);
  }

  /** Petit bip d'interface. */
  blip(): void {
    this.tone(1320, 0.05, 0.12, 0, "square");
  }
}
