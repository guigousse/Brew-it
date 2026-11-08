/**
 * La radio du bureau : une petite musique 8-bit composée en direct (Web Audio, aucun fichier son).
 * Chaque « morceau » tire une tonalité, un tempo, une grille d'accords et une mélodie en phrases A A B A ;
 * basse, accords en contretemps, mélodie et une batterie légère. Un nouveau morceau toutes les 32 mesures.
 *
 * Toucher la radio ouvre son interface : lecture / pause, morceau suivant, volume. Le choix est gardé sur l'appareil.
 * Allumée, elle reprend au premier toucher après le lancement (iOS n'autorise le son qu'après un geste), et se tait
 * quand l'appli passe en arrière-plan.
 */

const KEY = 'brewit:radio';
const VOL_KEY = 'brewit:radio-volume';

/** on : la musique joue ; volume de 0 à 1 ; title : le morceau en cours. */
export const radio = { on: false, volume: 0.7, title: '' };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pulse: PeriodicWave | null = null;
let noise: AudioBuffer | null = null;
let timer: number | null = null;
let nextTime = 0;
let step = 0;
let song: Song | null = null;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Petit générateur pseudo-aléatoire, pour qu'un morceau garde la même mélodie à chaque reprise d'une phrase. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

interface Song {
  title: string;
  bpm: number;
  root: number;
  /** Accords : degrés de la gamme majeure (0 = I). */
  chords: number[];
  /** Mélodie : 4 phrases de 4 mesures (A A B A) ; null = silence, sinon une note MIDI par double croche. */
  phrases: (number | null)[][];
  swing: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 5, 3], [1, 4, 0, 5], [0, 2, 3, 4]];
const RHYTHMS = [
  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
];

/** Notes (MIDI) de l'accord de degré d, dans la tonalité root. */
function chordNotes(root: number, d: number): number[] {
  return [0, 2, 4].map((k) => root + MAJOR[(d + k) % 7]! + 12 * Math.floor((d + k) / 7));
}

function newSong(seed: number): Song {
  const r = rng(seed);
  const root = 60 + [0, 5, 7, 2, -3][Math.floor(r() * 5)]!;
  const chords = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)]!;
  const scale = [...MAJOR.map((s) => root + s), ...MAJOR.map((s) => root + 12 + s)];
  const phrase = (): (number | null)[] => {
    const out: (number | null)[] = [];
    let idx = 4 + Math.floor(r() * 4);
    for (let bar = 0; bar < 4; bar++) {
      const rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)]!;
      const tones = chordNotes(root, chords[bar]!).map((n) => n + 12);
      for (let i = 0; i < 16; i++) {
        if (!rhythm[i]) { out.push(null); continue; }
        // sur les temps forts, une note de l'accord ; ailleurs, on marche dans la gamme
        if (i % 4 === 0) {
          const target = tones[Math.floor(r() * 3)]!;
          idx = Math.max(0, scale.findIndex((n) => n >= target));
        } else idx = Math.max(0, Math.min(scale.length - 1, idx + [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)]!));
        out.push(scale[idx]!);
      }
    }
    // la phrase se termine sur la fondamentale
    out[60] = root + 12;
    return out;
  };
  const a = phrase();
  const b = phrase();
  const A = ['Blonde', 'Houblon', 'Mousse', 'Levure', 'Malt', 'Comptoir', 'Fût', 'Brasseur', 'Ambrée', 'Bulles'];
  const B = ['swing', 'du soir', 'en fusion', 'à la cave', 'du dimanche', 'blues', 'express', 'au clair de lune', 'pétillant', 'du bistrot'];
  const title = `${A[Math.floor(r() * A.length)]} ${B[Math.floor(r() * B.length)]}`;
  return { title, bpm: 88 + Math.floor(r() * 24), root, chords, phrases: [a, a, b, a], swing: 0.12 + r() * 0.08 };
}

function setup(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(lp).connect(ctx.destination);
  // onde « pulse » à 25 %, le son des vieilles consoles
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  pulse = ctx.createPeriodicWave(real, imag);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function tone(type: OscillatorType | 'pulse', freq: number, t: number, dur: number, vol: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  if (type === 'pulse' && pulse) o.setPeriodicWave(pulse);
  else o.type = type === 'pulse' ? 'square' : type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(kind: 'kick' | 'snare' | 'hat', t: number): void {
  if (!ctx || !master) return;
  const g = ctx.createGain();
  g.connect(master);
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.18);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = kind === 'hat' ? 'highpass' : 'bandpass';
  f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const dur = kind === 'hat' ? 0.04 : 0.12;
  g.gain.setValueAtTime(kind === 'hat' ? 0.06 : 0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Joue la double croche `step` à l'instant t. */
function play(t: number): void {
  if (!song) return;
  const s16 = 60 / song.bpm / 4;
  const i = step % 16;
  const bar = Math.floor(step / 16);
  const chord = chordNotes(song.root, song.chords[bar % 4]!);
  // basse
  if (i === 0 || i === 6 || i === 8 || i === 14) tone('triangle', midi(chord[0]! - 24 + (i === 6 ? 12 : 0)), t, s16 * (i === 0 || i === 8 ? 2.5 : 1.5), 0.32);
  // accords en contretemps
  if (i === 4 || i === 12) for (const n of chord) tone('square', midi(n), t, s16 * 1.6, 0.035);
  // mélodie
  const note = song.phrases[Math.floor(bar / 4) % 4]![(bar % 4) * 16 + i];
  if (note != null) tone('pulse', midi(note), t, s16 * 1.8, 0.07);
  // batterie
  if (i === 0 || i === 8 || (i === 10 && bar % 2)) drum('kick', t);
  if (i === 4 || i === 12) drum('snare', t);
  if (i % 2 === 0) drum('hat', t);
}

function tick(): void {
  if (!ctx || !song) return;
  while (nextTime < ctx.currentTime + 0.15) {
    const s16 = 60 / song.bpm / 4;
    const swung = step % 2 ? s16 * song.swing : 0;
    play(nextTime + swung);
    nextTime += s16;
    step++;
    if (step >= 16 * 32) {
      step = 0;
      song = newSong(Math.floor(Math.random() * 1e9));
      radio.title = song.title;
    }
  }
}

/** Gain général pour le volume choisi (courbe douce : l'oreille entend en logarithme). */
const level = () => 0.7 * radio.volume ** 2;

function start(): void {
  setup();
  if (!ctx || !master) return;
  void ctx.resume();
  song ??= newSong(Math.floor(Math.random() * 1e9));
  radio.title = song.title;
  nextTime = ctx.currentTime + 0.05;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(level(), ctx.currentTime + 0.6);
  if (timer == null) timer = window.setInterval(tick, 25);
}

function stop(): void {
  if (timer != null) window.clearInterval(timer);
  timer = null;
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    const c = ctx;
    setTimeout(() => { if (!radio.on) void c.suspend(); }, 400);
  }
}

function remember(): void {
  try {
    localStorage.setItem(KEY, radio.on ? '1' : '0');
    localStorage.setItem(VOL_KEY, String(radio.volume));
  } catch { /* stockage indisponible */ }
}

/** Lecture ou pause (à appeler depuis un toucher). */
export function setPlaying(on: boolean): void {
  radio.on = on;
  remember();
  if (on) start();
  else stop();
}

/** Morceau suivant (et la lecture reprend). */
export function nextSong(): void {
  song = newSong(Math.floor(Math.random() * 1e9));
  radio.title = song.title;
  step = 0;
  if (ctx) nextTime = ctx.currentTime + 0.05;
  setPlaying(true);
}

/** Volume, de 0 à 1. */
export function setVolume(v: number): void {
  radio.volume = Math.max(0, Math.min(1, v));
  remember();
  if (ctx && master && radio.on) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05);
  }
}

/** Au lancement : reprend le choix gardé ; le son démarre au premier toucher. Se tait en arrière-plan. */
export function initRadio(): void {
  try {
    radio.on = localStorage.getItem(KEY) === '1';
    const v = Number(localStorage.getItem(VOL_KEY));
    if (localStorage.getItem(VOL_KEY) != null && Number.isFinite(v)) radio.volume = Math.max(0, Math.min(1, v));
  } catch { radio.on = false; }
  song = newSong(Math.floor(Math.random() * 1e9));
  radio.title = song.title;
  const kick = () => {
    window.removeEventListener('pointerdown', kick);
    if (!radio.on) return;
    if (timer == null) start();
    else void ctx?.resume();
  };
  window.addEventListener('pointerdown', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (radio.on) {
      // iOS : le contexte audio reprend au premier toucher qui suit
      start();
      window.addEventListener('pointerdown', kick);
    }
  });
}
