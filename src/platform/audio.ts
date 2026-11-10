/**
 * Bruitages du jeu (Web Audio). Les fichiers viennent de Broc (`public/sounds/`) ; les petits sons d'interface
 * (clic, bulle, notification, erreur, arpège) sont synthétisés.
 *
 * iOS (WKWebView) : un AudioContext naît « suspended » et ne démarre que dans un geste ; après une interruption
 * (appel, passage en arrière-plan) il peut rester « suspended », passer « interrupted » (état WebKit hors spec)
 * ou même « closed ». On le réveille donc au premier geste et au retour au premier plan, et on le rebâtit
 * quand il est mort.
 */

export type SoundFile =
  | 'cash' | 'levelUp' | 'upgrade' | 'repair' | 'break' | 'paper' | 'newspaper'
  | 'doorOpen' | 'carillon' | 'crate' | 'gem' | 'recharge' | 'crowd';

export type SynthSound = 'click' | 'pop' | 'notif' | 'error' | 'pickup';

export type Sound = SoundFile | SynthSound;

const FILES: Record<SoundFile, { file: string; volume?: number; fadeAfter?: number }> = {
  cash: { file: 'cash.mp3' },
  levelUp: { file: 'level-up.mp3' },
  upgrade: { file: 'upgrade.mp3', volume: 0.8 },
  repair: { file: 'repair.mp3', volume: 0.8 },
  break: { file: 'break.mp3', volume: 0.8 },
  paper: { file: 'paper.mp3' },
  newspaper: { file: 'newspaper.mp3' },
  doorOpen: { file: 'door-open.mp3', volume: 0.8 },
  carillon: { file: 'carillon-bazar.mp3', volume: 0.7 },
  crate: { file: 'coffre-ferme.mp3', volume: 0.7 },
  gem: { file: 'jeton-bazar.mp3', volume: 0.8 },
  recharge: { file: 'recharge.m4a', volume: 0.6 },
  // la foule qui s'anime au lancement d'un événement du bar : quelques secondes de la boucle, en fondu
  crowd: { file: 'crowd.mp3', volume: 0.6, fadeAfter: 3.5 },
};

/** Pas deux fois le même son dans cet intervalle (ms) : évite les rafales (plusieurs commandes à la fois…). */
const MIN_GAP_MS = 80;
/** Réveils sans effet avant de rebâtir le contexte, et délai minimal entre deux reconstructions. */
const RESUMES_BEFORE_REBUILD = 3;
const REBUILD_MIN_MS = 3000;

export interface AudioPrefs {
  /** 0 à 100. */
  volume: number;
  effects: boolean;
}

const PREFS_KEY = 'brewit:audio:v1';
const DEFAULT_PREFS: AudioPrefs = { volume: 70, effects: true };

type WindowAudio = Window & { webkitAudioContext?: typeof AudioContext };

class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlayed = new Map<Sound, number>();
  private failedResumes = 0;
  private resuming = false;
  private lastRebuild = 0;
  private hidden = false;
  private installed = false;
  readonly prefs: AudioPrefs = loadPrefs();

  /** À appeler une fois au démarrage : déblocage au premier geste, reprise au retour au premier plan. */
  install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;
    const unlock = () => this.ensure();
    for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!this.hidden) {
        this.failedResumes = 0;
        this.ensure();
      }
    });
    // un clic discret sous chaque bouton de l'interface
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Element | null;
      const b = t?.closest?.('button');
      if (b && !(b as HTMLButtonElement).disabled) this.play('click');
    }, { passive: true, capture: true });
  }

  setVolume(v: number): void {
    this.prefs.volume = Math.max(0, Math.min(100, Math.round(v)));
    if (this.master) this.master.gain.value = this.gain();
    savePrefs(this.prefs);
  }

  setEffects(on: boolean): void {
    this.prefs.effects = on;
    savePrefs(this.prefs);
  }

  play(s: Sound): void {
    if (!this.prefs.effects || this.prefs.volume <= 0 || this.hidden) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(s) ?? -Infinity) < MIN_GAP_MS) return;
    this.lastPlayed.set(s, now);
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (s in FILES) void this.playFile(s as SoundFile);
    else this.synth(s as SynthSound);
  }

  /** Charge les fichiers à l'avance pour qu'ils partent sans délai. */
  preload(): void {
    this.ensure();
    for (const k of Object.keys(FILES) as SoundFile[]) void this.load(FILES[k].file);
  }

  // ------------------------------------------------------------ contexte

  private gain(): number {
    // courbe douce : la moitié du curseur s'entend à peu près comme moitié moins fort
    const v = this.prefs.volume / 100;
    return v * v;
  }

  private ensure(): void {
    if (typeof window === 'undefined') return;
    if (this.ctx) {
      const st = this.ctx.state as string;
      if (st === 'running') return;
      if (st === 'closed') this.rebuild();
      else this.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as WindowAudio).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    ctx.onstatechange = () => {
      if (this.ctx !== ctx || this.hidden) return;
      const st = ctx.state as string;
      if (st === 'running') this.failedResumes = 0;
      else if (st === 'closed') this.rebuild();
    };
    this.master = ctx.createGain();
    this.master.gain.value = this.gain();
    this.master.connect(ctx.destination);
    if (ctx.state === 'suspended') this.resume();
  }

  private resume(): void {
    const ctx = this.ctx;
    if (!ctx || this.resuming) return;
    this.resuming = true;
    void Promise.resolve(ctx.resume()).then(
      () => {
        this.resuming = false;
        if (this.ctx !== ctx) return;
        if ((ctx.state as string) === 'running') this.failedResumes = 0;
        else if (++this.failedResumes >= RESUMES_BEFORE_REBUILD) this.rebuild();
      },
      () => {
        this.resuming = false;
        if (this.ctx === ctx) this.rebuild();
      },
    );
  }

  /** Jette un contexte mort (WebKit le laisse parfois « interrupted » pour de bon) et en recrée un. */
  private rebuild(): void {
    if (this.hidden) return;
    const now = Date.now();
    if (now - this.lastRebuild < REBUILD_MIN_MS) return; // WebKit plafonne le nombre de contextes vivants
    this.lastRebuild = now;
    const old = this.ctx;
    this.ctx = undefined;
    this.master = undefined;
    this.buffers.clear();
    this.loading.clear();
    this.failedResumes = 0;
    if (old) {
      old.onstatechange = null;
      if ((old.state as string) !== 'closed') void Promise.resolve(old.close()).catch(() => {});
    }
    this.ensure();
  }

  // ------------------------------------------------------------ fichiers

  private load(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const hit = this.buffers.get(file);
    if (hit) return Promise.resolve(hit);
    let p = this.loading.get(file);
    if (!p) {
      p = fetch(`${import.meta.env.BASE_URL}sounds/${file}`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => {
          if (this.ctx === ctx) this.buffers.set(file, b);
          return b;
        })
        .catch(() => null)
        .finally(() => this.loading.delete(file));
      this.loading.set(file, p);
    }
    return p;
  }

  private async playFile(s: SoundFile): Promise<void> {
    const def = FILES[s];
    const ctx = this.ctx;
    const buf = await this.load(def.file);
    if (!buf || !ctx || ctx !== this.ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = def.volume ?? 1;
    src.connect(g);
    g.connect(this.master);
    const t = ctx.currentTime;
    src.start(t);
    if (def.fadeAfter) {
      g.gain.setValueAtTime(def.volume ?? 1, t + def.fadeAfter - 1.2);
      g.gain.linearRampToValueAtTime(0, t + def.fadeAfter);
      src.stop(t + def.fadeAfter + 0.05);
    }
  }

  // ------------------------------------------------------------ synthèse

  private tone(type: OscillatorType, from: number, to: number | null, at: number, peak: number, dur: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to != null) osc.frequency.exponentialRampToValueAtTime(to, at + dur * 0.5);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private synth(s: SynthSound): void {
    const now = this.ctx!.currentTime;
    switch (s) {
      case 'click': // tic sec et discret
        return this.tone('sine', 800, null, now, 0.25, 0.03, 0.002);
      case 'pop': // une bulle qui éclate : c'est la montée de fréquence qui fait le pop
        this.tone('sine', 260, 1180, now, 0.4, 0.11, 0.006);
        return this.tone('sine', 340, 1500, now + 0.09, 0.25, 0.09, 0.006);
      case 'notif': // deux notes de cloche en quarte montante
        this.tone('sine', 784, null, now, 0.22, 0.5, 0.01);
        return this.tone('sine', 1046.5, null, now + 0.12, 0.22, 0.5, 0.01);
      case 'error': // deux notes descendantes, feutrées
        this.tone('triangle', 330, null, now, 0.22, 0.12, 0.005);
        return this.tone('triangle', 247, null, now + 0.09, 0.22, 0.18, 0.005);
      case 'pickup': // do-mi-sol puis une étincelle
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone('triangle', f, null, now + i * 0.08, 0.28, 0.22, 0.012));
        return this.tone('sine', 1046.5, null, now + 0.24, 0.22, 0.32, 0.01);
    }
  }
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null;
    const p = raw ? (JSON.parse(raw) as Partial<AudioPrefs>) : {};
    return {
      volume: typeof p.volume === 'number' ? Math.max(0, Math.min(100, p.volume)) : DEFAULT_PREFS.volume,
      effects: typeof p.effects === 'boolean' ? p.effects : DEFAULT_PREFS.effects,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(p: AudioPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : réglage gardé pour la session */
  }
}

export const sfx = new AudioManager();
