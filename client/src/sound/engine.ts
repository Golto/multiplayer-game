// Sound design : synthèse en direct de la palette « Goutte » (palette-goutte.json) avec Web Audio.
//
// Chaque jeton décrit des notes (fréquence, décalage, durée, gain). La matière « goutte » est un
// chirp sinusoïdal qui monte vers la note (`rise_to`) : on part de f / depth et on glisse jusqu'à f
// pendant `timeRatio` de la durée, comme une goutte qui tombe dans l'eau. Le caractère (grain,
// poids, brillance, tenue, niveau) règle le bruit d'attaque, la sous-octave, le filtre et la queue.

import palette from "./palette-goutte.json";

interface Note {
  frequencyHz: number;
  offsetMs: number;
  durationMs: number;
  gain: number;
}

interface Token {
  tokenId: string;
  behaviour: string;
  variation: number;
  notes: Note[];
}

export type SoundId =
  | "button.tap"
  | "button.primary"
  | "button.secondary"
  | "button.hover"
  | "button.blocked"
  | "press.commit"
  | "press.abort"
  | "slider.tick"
  | "slider.limit"
  | "stepper.increment"
  | "stepper.decrement"
  | "carousel.next"
  | "nav.forward"
  | "nav.back"
  | "nav.tab"
  | "disclosure.expand"
  | "disclosure.collapse"
  | "modal.open"
  | "modal.close"
  | "tooltip.show"
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
  | "drag.drop"
  | "refresh.release"
  | "system.start"
  | "system.ready"
  | "system.lock"
  | "system.unlock"
  | "system.offline";

const TOKENS = new Map<string, Token>();
for (const category of Object.values(palette.categories)) {
  for (const token of category.tokens) TOKENS.set(token.tokenId, token as Token);
}

const voice = palette.material.voice;
const character = palette.character;
const MUTE_KEY = "rumeurs.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();
const lastPlayed = new Map<string, number>();

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

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.55 * character.level;
  // La brillance règle un passe-bas global.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900 + character.brightness * 9000;
  tone.Q.value = 0.4;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  master.connect(tone).connect(limiter).connect(ctx.destination);

  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  return ctx;
}

/** Les navigateurs exigent un geste de l'utilisateur avant de jouer du son. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

function playNote(c: AudioContext, out: AudioNode, note: Note, start: number, detune: number): void {
  const f = note.frequencyHz * 2 ** (detune / 1200);
  const dur = note.durationMs / 1000;
  const peak = note.gain;

  // Corps : sinus qui glisse jusqu'à la note.
  const osc = c.createOscillator();
  osc.type = voice.waveform as OscillatorType;
  const glide = Math.max(0.008, dur * voice.timeRatio);
  osc.frequency.setValueAtTime(f / voice.depth, start);
  osc.frequency.exponentialRampToValueAtTime(f, start + glide);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  // La tenue allonge la queue sans dépasser la durée du jeton.
  env.gain.setTargetAtTime(0.0001, start + glide, dur * (0.12 + 0.22 * character.hold));
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.25);

  // Poids : une sous-octave discrète.
  if (character.weight > 0) {
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(f / 2 / voice.depth, start);
    sub.frequency.exponentialRampToValueAtTime(f / 2, start + glide);
    const subEnv = c.createGain();
    subEnv.gain.setValueAtTime(0.0001, start);
    subEnv.gain.exponentialRampToValueAtTime(peak * character.weight * 0.6, start + 0.01);
    subEnv.gain.setTargetAtTime(0.0001, start + glide, dur * 0.15);
    sub.connect(subEnv).connect(out);
    sub.start(start);
    sub.stop(start + dur + 0.2);
  }

  // Grain : un souffle bref à l'attaque, filtré autour de la note.
  if (character.grain > 0 && noise) {
    const src = c.createBufferSource();
    src.buffer = noise;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = f * 3;
    band.Q.value = 2.5;
    const g = c.createGain();
    g.gain.value = peak * character.grain * 0.5;
    src.connect(band).connect(g).connect(out);
    src.start(start);
  }
}

/** Joue un jeton de la palette. Les jetons répétables varient légèrement à chaque fois. */
export function play(id: SoundId, opts: { pitch?: number } = {}): void {
  if (muted) return;
  const token = TOKENS.get(id);
  const c = audio();
  if (!token || !c || !master || c.state !== "running") return;

  // Évite les rafales du même son (deux clics simultanés, plusieurs états reçus d'un coup).
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? 0) < 45) return;
  lastPlayed.set(id, now);

  const variation = token.behaviour === "repeatable" ? (Math.random() * 2 - 1) * token.variation * 60 : 0;
  const detune = variation + (opts.pitch ?? 0) * 100;
  const start = c.currentTime + 0.005;
  for (const note of token.notes) playNote(c, master, note, start + note.offsetMs / 1000, detune);
}
