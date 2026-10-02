// Sound design : portage du moteur de soundboard-design (static/js/engine.js) pour la palette
// « Goutte » (palette-goutte.json). Les notes résolues viennent de l'export JSON ; la frappe, la
// brillance et l'attaque de chaque note, absentes de l'export, viennent du catalogue
// (note-extras.json). Les matières « goutte » et « carton » (papier assombri) reprennent les
// définitions de materials.py.
//
// Le jeu adoucit la palette d'origine : registre une quarte plus bas, moins de grain, moins de
// brillance, niveau plus bas. Tout tient dans GAME_TUNING.

import palette from "./palette-goutte.json";
import extras from "./note-extras.json";

// ---------------------------------------------------------------- réglages

const GAME_TUNING = {
  /** Transposition de tout le système (une quarte plus bas : l'harmonie est conservée). */
  register: 3 / 4,
  levelScale: 0.6,
  grainScale: 0.4,
  brightnessScale: 0.8,
};

const character = {
  grain: palette.character.grain * GAME_TUNING.grainScale,
  weight: palette.character.weight,
  brightness: palette.character.brightness * GAME_TUNING.brightnessScale,
  hold: palette.character.hold,
  level: palette.character.level * GAME_TUNING.levelScale,
};

interface Transient {
  toneHz: number;
  amount: number;
  resonance: number;
  decaySeconds: number;
}

interface ChirpVoice {
  engine: "chirp";
  waveform: OscillatorType;
  depth: number;
  timeRatio: number;
}

interface NoiseVoice {
  engine: "noise";
  filterKind: BiquadFilterType;
  centerRatio: number;
  resonance: number;
  sweep: number;
  density: number;
}

interface Material {
  voice: ChirpVoice | NoiseVoice;
  attackFactor: number;
  cutoffRatio: number;
  transient: Transient;
  gainTrim: number;
}

/** materials.py : DROPLET. */
const DROPLET: Material = {
  voice: { engine: "chirp", waveform: "sine", depth: palette.material.voice.depth, timeRatio: palette.material.voice.timeRatio },
  attackFactor: 0.7,
  cutoffRatio: 6.0,
  transient: { toneHz: 2000, amount: 0.22, resonance: 1.5, decaySeconds: 0.008 },
  gainTrim: 1.0,
};

/** materials.py : PAPER, assombri en carton (bande plus basse, moins de bruissement). */
const CARDBOARD: Material = {
  voice: { engine: "noise", filterKind: "bandpass", centerRatio: 6.0, resonance: 0.8, sweep: 0.5, density: 0.45 },
  attackFactor: 3.0,
  cutoffRatio: 8.0,
  transient: { toneHz: 1600, amount: 0.3, resonance: 0.8, decaySeconds: 0.01 },
  gainTrim: 1.1,
};

// ---------------------------------------------------------------- jetons

interface NoteSpec {
  frequencyHz: number;
  offsetMs: number;
  durationMs: number;
  gain: number;
  transient: number;
  brightness: number;
  attackSeconds: number;
}

interface Token {
  behaviour: "one_shot" | "repeatable" | "sustained";
  variation: number;
  material: Material;
  notes: NoteSpec[];
}

const TOKENS = new Map<string, Token>();
const EXTRAS = extras as Record<string, { transient: number; brightness: number; attackSeconds: number }[]>;
for (const category of Object.values(palette.categories)) {
  for (const t of category.tokens) {
    TOKENS.set(t.tokenId, {
      behaviour: t.behaviour as Token["behaviour"],
      variation: t.variation,
      material: DROPLET,
      notes: t.notes.map((n, i) => ({
        frequencyHz: n.frequencyHz,
        offsetMs: n.offsetMs,
        durationMs: n.durationMs,
        gain: n.gain,
        transient: EXTRAS[t.tokenId]?.[i]?.transient ?? 0.5,
        brightness: EXTRAS[t.tokenId]?.[i]?.brightness ?? 1,
        attackSeconds: EXTRAS[t.tokenId]?.[i]?.attackSeconds ?? 0.003,
      })),
    });
  }
}

// Jetons propres au jeu, joués sur le carton. Les fréquences restent des degrés de la gamme.
const root = palette.tuning.rootHz;
const fifth = root * 2 ** (7 / 12);
TOKENS.set("card.hover", {
  behaviour: "repeatable",
  variation: 0.5,
  material: CARDBOARD,
  notes: [{ frequencyHz: fifth, offsetMs: 0, durationMs: 85, gain: 0.6, transient: 0.5, brightness: 0.8, attackSeconds: 0.002 }],
});
TOKENS.set("card.flip", {
  behaviour: "one_shot",
  variation: 0.2,
  material: CARDBOARD,
  notes: [
    { frequencyHz: root, offsetMs: 0, durationMs: 120, gain: 0.45, transient: 0.7, brightness: 0.9, attackSeconds: 0.002 },
    { frequencyHz: fifth, offsetMs: 90, durationMs: 150, gain: 0.5, transient: 0.9, brightness: 1, attackSeconds: 0.002 },
  ],
});

export type SoundId =
  | "button.tap"
  | "button.primary"
  | "button.secondary"
  | "button.blocked"
  | "press.commit"
  | "press.abort"
  | "slider.tick"
  | "stepper.increment"
  | "stepper.decrement"
  | "nav.forward"
  | "nav.back"
  | "nav.tab"
  | "disclosure.expand"
  | "modal.open"
  | "modal.close"
  | "toggle.on"
  | "toggle.off"
  | "checkbox.check"
  | "chip.select"
  | "chip.deselect"
  | "input.key"
  | "input.delete"
  | "input.suggestion"
  | "input.submit"
  | "feedback.success"
  | "feedback.error"
  | "feedback.warning"
  | "feedback.notification"
  | "feedback.complete"
  | "refresh.release"
  | "system.start"
  | "system.ready"
  | "system.lock"
  | "system.unlock"
  | "system.offline"
  | "card.hover"
  | "card.flip";

// ---------------------------------------------------------------- muet

const MUTE_KEY = "rumeurs.muted";
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Préférence non mémorisée, sans conséquence.
  }
}

// ---------------------------------------------------------------- tampons et courbes

const MAX_SATURATION_DRIVE = 3;
const VOICE_BUDGET = 32;
const REPEAT_INTERVAL_SECONDS = 0.035;
const NYQUIST_MARGIN = 0.45;
const LIMITER_KNEE = 0.85;
const LIMITER_CEILING = 0.98;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let whiteNoise: AudioBuffer | null = null;
let impact: AudioBuffer | null = null;
let saturation: Float32Array<ArrayBuffer> | null = null;
let activeVoices = 0;
const lastTrigger = new Map<string, number>();

function buffers(c: AudioContext): void {
  const white = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
  whiteNoise = white;

  const imp = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
  const d = imp.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const fade = 1 - i / d.length;
    d[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  impact = imp;

  // Saturation douce compensée en gain (le grain change le timbre, pas le volume).
  const size = 1024;
  const curve = new Float32Array(size);
  const drive = (Math.round(character.grain * 20) / 20) * MAX_SATURATION_DRIVE;
  for (let i = 0; i < size; i++) {
    const x = (i * 2) / size - 1;
    curve[i] = ((1 + drive) * x) / (1 + drive * Math.abs(x));
  }
  saturation = curve;
}

function limiterCurve(): Float32Array<ArrayBuffer> {
  const size = 4096;
  const headroom = LIMITER_CEILING - LIMITER_KNEE;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const m = Math.abs(x);
    curve[i] = Math.sign(x) * (m <= LIMITER_KNEE ? m : LIMITER_KNEE + headroom * Math.tanh((m - LIMITER_KNEE) / headroom));
  }
  return curve;
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const c = new Ctor();
  ctx = c;
  buffers(c);

  // Bus : niveau, compresseur doux, limiteur linéaire sous le genou (pas de réverbération : space = 0).
  bus = c.createGain();
  bus.gain.value = character.level * (1 - 0.15 * character.grain);
  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -11;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  const limiter = c.createWaveShaper();
  limiter.curve = limiterCurve();
  limiter.oversample = "4x";
  bus.connect(compressor).connect(limiter).connect(c.destination);
  return c;
}

/** Les navigateurs exigent un geste de l'utilisateur avant de jouer du son. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

// ---------------------------------------------------------------- voix

interface Resolved {
  material: Material;
  frequency: number;
  duration: number;
  gain: number;
  transient: number;
  brightness: number;
  attack: number;
  time: number;
}

function decay(p: AudioParam, time: number, attack: number, peak: number, duration: number): void {
  p.setValueAtTime(0.0001, time);
  p.exponentialRampToValueAtTime(Math.max(0.002, peak), time + attack);
  p.exponentialRampToValueAtTime(0.0001, time + duration);
}

function chirp(c: AudioContext, target: AudioNode, s: Resolved, voice: ChirpVoice): void {
  const sweep = Math.max(0.008, s.duration * voice.timeRatio);
  const ceiling = c.sampleRate * NYQUIST_MARGIN;
  const env = c.createGain();
  decay(env.gain, s.time, s.attack, s.gain, s.duration);
  env.connect(target);
  const osc = c.createOscillator();
  osc.type = voice.waveform;
  // rise_to : la goutte arrive sur la note au lieu d'en partir.
  osc.frequency.setValueAtTime(Math.min(s.frequency / voice.depth, ceiling), s.time);
  osc.frequency.exponentialRampToValueAtTime(Math.min(s.frequency, ceiling), s.time + sweep);
  osc.connect(env);
  osc.start(s.time);
  osc.stop(s.time + s.duration + 0.05);
}

function noise(c: AudioContext, target: AudioNode, s: Resolved, voice: NoiseVoice): void {
  const src = c.createBufferSource();
  src.buffer = whiteNoise;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = voice.filterKind;
  const centre = clamp(s.frequency * voice.centerRatio * s.brightness, 120, 16000);
  filter.Q.value = voice.resonance + character.grain * 1.5;
  filter.frequency.setValueAtTime(centre, s.time);
  filter.frequency.exponentialRampToValueAtTime(clamp(centre * voice.sweep, 120, 16000), s.time + s.duration);
  const env = c.createGain();
  decay(env.gain, s.time, s.attack, s.gain * 0.9, s.duration);

  if (voice.density > 0) {
    // Un bruit lent module le gain : le souffle devient un froissement irrégulier.
    const flutter = c.createBufferSource();
    flutter.buffer = whiteNoise;
    flutter.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 28;
    const depth = c.createGain();
    depth.gain.value = s.gain * voice.density * 0.5;
    flutter.connect(lp).connect(depth).connect(env.gain);
    flutter.start(s.time);
    flutter.stop(s.time + s.duration + 0.05);
  }
  src.connect(filter).connect(env).connect(target);
  src.start(s.time);
  src.stop(s.time + s.duration + 0.05);
}

function scheduleNote(c: AudioContext, destination: AudioNode, s: Resolved): void {
  const { material } = s;
  const shelf = c.createBiquadFilter();
  shelf.type = "lowshelf";
  shelf.frequency.value = 190;
  shelf.gain.value = character.weight * 7;
  shelf.connect(destination);

  let entry: AudioNode = shelf;
  if (character.grain > 0.02 && saturation) {
    const shaper = c.createWaveShaper();
    shaper.curve = saturation;
    shaper.oversample = "2x";
    const drive = character.grain * MAX_SATURATION_DRIVE;
    const makeup = c.createGain();
    makeup.gain.value = (1 + 0.5 * drive) / (1 + drive);
    shaper.connect(makeup).connect(shelf);
    entry = shaper;
  }

  // Passe-bas relatif à la note, qui se referme pendant qu'elle sonne.
  const lowpass = c.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.7 + character.grain * 1.4;
  const cutoff = clamp(s.frequency * material.cutoffRatio * s.brightness * (1 - 0.28 * character.weight), 170, 17000);
  lowpass.frequency.setValueAtTime(cutoff, s.time);
  lowpass.frequency.exponentialRampToValueAtTime(Math.max(130, cutoff * 0.3), s.time + s.duration);
  lowpass.connect(entry);

  const trim = c.createGain();
  trim.gain.value = material.gainTrim;
  trim.connect(lowpass);

  if (material.voice.engine === "chirp") chirp(c, trim, s, material.voice);
  else noise(c, trim, s, material.voice);

  if (character.weight > 0.02) {
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(s.frequency / 2, s.time);
    const env = c.createGain();
    decay(env.gain, s.time, Math.max(s.attack, 0.006), s.gain * character.weight * 0.6, s.duration);
    sub.connect(env).connect(trim);
    sub.start(s.time);
    sub.stop(s.time + s.duration + 0.05);
  }

  const amount = s.transient * material.transient.amount * (1 + character.grain * 1.1);
  if (amount > 0.01 && impact) {
    const src = c.createBufferSource();
    src.buffer = impact;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = clamp(material.transient.toneHz * s.brightness * (1 - 0.45 * character.weight), 200, 13000);
    band.Q.value = material.transient.resonance + character.grain * 1.2;
    const g = c.createGain();
    const d = material.transient.decaySeconds * (1 + character.grain * 0.8) * (1 + character.weight * 0.5);
    g.gain.setValueAtTime(0.0001, s.time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, 0.2 * amount * s.gain), s.time + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, s.time + d);
    src.connect(band).connect(g).connect(entry);
    src.start(s.time);
    src.stop(s.time + d + 0.03);
  }
}

// ---------------------------------------------------------------- lecture

/** Joue un jeton. `pitch` décale en demi-tons (compte à rebours). */
export function play(id: SoundId, opts: { pitch?: number; gain?: number } = {}): void {
  if (muted) return;
  const token = TOKENS.get(id);
  const c = audio();
  if (!token || !c || !bus || c.state !== "running") return;

  const now = c.currentTime;
  if (token.behaviour === "repeatable") {
    if (now - (lastTrigger.get(id) ?? -1) < REPEAT_INTERVAL_SECONDS) return;
  } else if (now - (lastTrigger.get(id) ?? -1) < 0.06) {
    return; // Plusieurs états reçus d'un coup ne doivent pas doubler un son.
  }
  lastTrigger.set(id, now);
  if (activeVoices > VOICE_BUDGET) return;

  const start = now + 0.015;
  const pitch = GAME_TUNING.register * 2 ** ((opts.pitch ?? 0) / 12);
  for (const n of token.notes) {
    const detune = 1 + (Math.random() - 0.5) * token.variation * 0.03;
    const gainRatio = 1 + (Math.random() - 0.5) * token.variation * 0.25;
    const duration = Math.max(0.04, n.durationMs / 1000);
    const attack = clamp(
      n.attackSeconds * token.material.attackFactor * (1 + character.weight * 2.6) * (1 - character.grain * 0.3),
      0.0015,
      duration * 0.5,
    );
    scheduleNote(c, bus, {
      material: token.material,
      frequency: n.frequencyHz * pitch * detune,
      duration,
      gain: clamp(n.gain * gainRatio * (opts.gain ?? 1), 0.005, 1),
      transient: n.transient,
      brightness: n.brightness * character.brightness,
      attack,
      time: start + n.offsetMs / 1000,
    });
  }
  activeVoices += token.notes.length;
  const length = Math.max(...token.notes.map((n) => n.offsetMs + n.durationMs)) + 400;
  setTimeout(() => (activeVoices = Math.max(0, activeVoices - token.notes.length)), length);
}
