/**
 * Brew It Idle (prototype) : la brasserie version jeu incrémental.
 *
 * Dix activités, de la cuve du garage à la brasserie orbitale. Chacune produit en cycles : on la touche pour
 * lancer un cycle, il rapporte à la fin. Un maître brasseur l'automatise. Acheter des exemplaires multiplie
 * les gains ; aux paliers (25, 50, 100…), le cycle va deux fois plus vite. Les améliorations multiplient les
 * gains. Repartir de zéro lègue des levures mères : chacune donne +2 % de gains, pour toujours.
 *
 * Tout est pur (pas de DOM) : testable, et simulable (`npm run idle-balance`).
 */

export interface BizDef {
  id: string;
  name: string;
  /** Prix du premier exemplaire. */
  cost: number;
  /** Chaque exemplaire coûte `rate` fois le précédent. */
  rate: number;
  /** Durée d'un cycle (s), avant les paliers. */
  time: number;
  /** Gain d'un exemplaire par cycle. */
  rev: number;
  /** Prix du maître brasseur qui automatise l'activité. */
  manager: number;
  /** Le maître brasseur. */
  managerName: string;
}

export const BIZ: readonly BizDef[] = [
  { id: 'garage', name: 'Cuve du garage', cost: 4, rate: 1.07, time: 0.8, rev: 1, manager: 1_000, managerName: 'Gaston' },
  { id: 'market', name: 'Fûts au marché', cost: 60, rate: 1.15, time: 3, rev: 60, manager: 15_000, managerName: 'Lucie la maraîchère' },
  { id: 'bistro', name: 'Comptoir de bistrot', cost: 720, rate: 1.14, time: 6, rev: 540, manager: 100_000, managerName: 'Lulu du Zinc' },
  { id: 'micro', name: 'Microbrasserie', cost: 8_640, rate: 1.13, time: 12, rev: 4_320, manager: 500_000, managerName: 'Inès la brasseuse' },
  { id: 'pub', name: 'Brewpub', cost: 103_680, rate: 1.12, time: 24, rev: 51_840, manager: 1.2e6, managerName: 'Paddy' },
  { id: 'festival', name: 'Festival de la bière', cost: 1.24e6, rate: 1.11, time: 96, rev: 622_000, manager: 1e7, managerName: 'Rocky du Rock en Fût' },
  { id: 'factory', name: 'Usine d\'embouteillage', cost: 1.49e7, rate: 1.10, time: 384, rev: 7.46e6, manager: 1.1e8, managerName: 'Madame Capsule' },
  { id: 'chain', name: 'Chaîne de bars', cost: 1.79e8, rate: 1.09, time: 1_536, rev: 8.96e7, manager: 5.5e8, managerName: 'Monsieur Franchise' },
  { id: 'export', name: 'Export mondial', cost: 2.15e9, rate: 1.08, time: 6_144, rev: 1.07e9, manager: 1e10, managerName: 'Kenji l\'importateur' },
  { id: 'orbital', name: 'Brasserie orbitale', cost: 2.58e10, rate: 1.07, time: 36_864, rev: 2.95e10, manager: 1e11, managerName: 'Robot B-33R' },
];

/** Paliers d'exemplaires : chacun rend le cycle deux fois plus rapide. */
export const MILESTONES = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
/** Quand toutes les activités atteignent un palier, tous les gains sont multipliés par 2. */
export const ALL_MILESTONES = [25, 50, 100, 200, 300, 400] as const;

export interface UpgradeDef {
  id: string;
  /** Activité concernée (indice), ou -1 pour toutes. */
  biz: number;
  mult: number;
  cost: number;
  name: string;
}

/** Les améliorations : recettes et matériel, ×3 sur une activité ou sur toutes. */
export const UPGRADES: readonly UpgradeDef[] = (() => {
  const out: UpgradeDef[] = [];
  const names = [
    ['Houblon frais', 'Fûts inox', 'Pompe à bière', 'Cuves inox', 'Carte des bières', 'Scène principale', 'Ligne automatique', 'Franchise', 'Conteneurs frigo', 'Gravité zéro'],
    ['Levure sélectionnée', 'Stand décoré', 'Happy hour', 'Fermentation maîtrisée', 'Quiz du mardi', 'Tête d\'affiche', 'Robots étiqueteurs', 'Enseigne lumineuse', 'Accords d\'export', 'Houblon lunaire'],
    ['Recette secrète', 'Marché de Noël', 'Terrasse', 'Médaille d\'or', 'Brasseur star', 'Festival mondial', 'Usine 24 h/24', 'Bars partout', 'Marque mondiale', 'Colonie martienne'],
  ];
  // trois vagues : chaque activité ×3, puis toutes ×3
  const wave = [1e3, 1e6, 1e10];
  for (let w = 0; w < 3; w++) {
    BIZ.forEach((b, i) => out.push({ id: `u${w}-${b.id}`, biz: i, mult: 3, cost: b.cost * wave[w]! * (1 + i), name: names[w]![i]! }));
    out.push({ id: `u${w}-all`, biz: -1, mult: 3, cost: BIZ[9]!.cost * wave[w]! * 20, name: ['Label qualité', 'Bière de l\'année', 'Légende du houblon'][w]! });
  }
  return out.sort((a, b) => a.cost - b.cost);
})();

/** Levures mères : chacune donne +2 % de gains. */
export const YEAST_BONUS = 0.02;
/** Levures mères gagnées (au total) selon les gains de toutes les parties. */
export const yeastFor = (allTime: number) => Math.floor(Math.sqrt(allTime / 1e8));

export interface IdleState {
  money: number;
  /** Gains de la partie en cours (depuis le dernier départ à zéro). */
  earned: number;
  /** Gains de toutes les parties. */
  allTime: number;
  /** Levures mères acquises. */
  yeast: number;
  owned: number[];
  /** Avancement du cycle en cours (s) ; -1 : à l'arrêt. */
  progress: number[];
  managers: boolean[];
  upgrades: string[];
  /** Départs à zéro faits. */
  resets: number;
  /** Étape de l'accompagnement de Gaston. */
  tip: number;
}

export function newState(): IdleState {
  return {
    money: 0, earned: 0, allTime: 0, yeast: 0,
    owned: BIZ.map((_, i) => (i === 0 ? 1 : 0)),
    progress: BIZ.map(() => -1),
    managers: BIZ.map(() => false),
    upgrades: [], resets: 0, tip: 0,
  };
}

/** Paliers atteints par une activité. */
export const milestonesOf = (n: number) => MILESTONES.filter((m) => n >= m).length;
/** Le prochain palier (ou null). */
export const nextMilestone = (n: number) => MILESTONES.find((m) => n < m) ?? null;

/** Durée effective d'un cycle. */
export function cycleTime(s: IdleState, i: number): number {
  return BIZ[i]!.time / 2 ** milestonesOf(s.owned[i]!);
}

/** Multiplicateur des gains d'une activité : améliorations, paliers communs, levures mères. */
export function multiplier(s: IdleState, i: number): number {
  let m = 1;
  for (const u of UPGRADES) if ((u.biz === i || u.biz === -1) && s.upgrades.includes(u.id)) m *= u.mult;
  const minOwned = Math.min(...s.owned);
  m *= 2 ** ALL_MILESTONES.filter((x) => minOwned >= x).length;
  return m * (1 + s.yeast * YEAST_BONUS);
}

/** Gain d'un cycle complet. */
export const payout = (s: IdleState, i: number) => BIZ[i]!.rev * s.owned[i]! * multiplier(s, i);
/** Gain par seconde (si l'activité tourne en continu). */
export const perSecond = (s: IdleState, i: number) => (s.owned[i]! > 0 ? payout(s, i) / cycleTime(s, i) : 0);
export const totalPerSecond = (s: IdleState) => BIZ.reduce((t, _, i) => t + (s.managers[i] ? perSecond(s, i) : 0), 0);

/** Prix de n exemplaires de plus. */
export function costOf(s: IdleState, i: number, n: number): number {
  const b = BIZ[i]!;
  return b.cost * b.rate ** s.owned[i]! * (b.rate ** n - 1) / (b.rate - 1);
}

/** Le plus grand nombre d'exemplaires qu'on peut s'offrir. */
export function maxAffordable(s: IdleState, i: number): number {
  const b = BIZ[i]!;
  const first = b.cost * b.rate ** s.owned[i]!;
  if (s.money < first) return 0;
  return Math.floor(Math.log((s.money * (b.rate - 1)) / first + 1) / Math.log(b.rate));
}

/** Combien acheter selon le mode (1, 10, 100, ou « jusqu'au prochain palier » / max avec 0). */
export function buyCount(s: IdleState, i: number, mode: number | 'max' | 'next'): number {
  if (mode === 'max') return Math.max(1, maxAffordable(s, i));
  if (mode === 'next') return Math.max(1, (nextMilestone(s.owned[i]!) ?? s.owned[i]! + 1) - s.owned[i]!);
  return mode;
}

export function buy(s: IdleState, i: number, n: number): boolean {
  if (n <= 0) return false;
  const c = costOf(s, i, n);
  if (s.money < c) return false;
  s.money -= c;
  s.owned[i]! += n;
  return true;
}

/** Lance un cycle (une activité sans maître brasseur se touche pour produire). */
export function start(s: IdleState, i: number): boolean {
  if (s.owned[i]! <= 0 || s.progress[i]! >= 0) return false;
  s.progress[i] = 0;
  return true;
}

export function hire(s: IdleState, i: number): boolean {
  const b = BIZ[i]!;
  if (s.managers[i] || s.owned[i]! <= 0 || s.money < b.manager) return false;
  s.money -= b.manager;
  s.managers[i] = true;
  if (s.progress[i]! < 0) s.progress[i] = 0;
  return true;
}

export function buyUpgrade(s: IdleState, id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || s.upgrades.includes(id) || s.money < u.cost) return false;
  s.money -= u.cost;
  s.upgrades.push(id);
  return true;
}

function earn(s: IdleState, v: number): void {
  s.money += v;
  s.earned += v;
  s.allTime += v;
}

/** Fait avancer le temps : les cycles finis rapportent ; ceux des maîtres brasseurs repartent seuls. */
export function tick(s: IdleState, dt: number): number {
  let gained = 0;
  BIZ.forEach((_, i) => {
    if (s.progress[i]! < 0 || s.owned[i]! <= 0) return;
    const t = cycleTime(s, i);
    s.progress[i]! += dt;
    if (s.progress[i]! < t) return;
    if (s.managers[i]) {
      const n = Math.floor(s.progress[i]! / t);
      s.progress[i]! -= n * t;
      gained += payout(s, i) * n;
    } else {
      gained += payout(s, i);
      s.progress[i] = -1;
    }
  });
  if (gained) earn(s, gained);
  return gained;
}

/**
 * L'absence : les activités des maîtres brasseurs tournent (sans plafond), un cycle lancé à la main se termine.
 * Les gains attendent dans la bourse, renvoyés ici.
 */
export function offline(s: IdleState, seconds: number): number {
  if (seconds < 5) return 0;
  let gained = 0;
  BIZ.forEach((_, i) => {
    if (s.owned[i]! <= 0 || s.progress[i]! < 0) return;
    const t = cycleTime(s, i);
    const total = s.progress[i]! + seconds;
    if (s.managers[i]) {
      const n = Math.floor(total / t);
      gained += payout(s, i) * n;
      s.progress[i] = total - n * t;
    } else if (total >= t) {
      gained += payout(s, i);
      s.progress[i] = -1;
    } else s.progress[i] = total;
  });
  s.earned += gained;
  s.allTime += gained;
  return gained;
}

/** Levures mères qu'un départ à zéro ferait gagner maintenant. */
export const yeastGain = (s: IdleState) => Math.max(0, yeastFor(s.allTime) - s.yeast);

/** Repartir de zéro : on garde les levures mères (et leurs +2 % chacune). */
export function prestige(s: IdleState): number {
  const gain = yeastGain(s);
  if (gain <= 0) return 0;
  const keep = { yeast: s.yeast + gain, allTime: s.allTime, resets: s.resets + 1, tip: s.tip };
  Object.assign(s, newState(), keep);
  return gain;
}

/** Charge une sauvegarde, en complétant ce qui manquerait. */
export function fromJSON(raw: unknown): IdleState {
  const base = newState();
  const s = { ...base, ...(raw as Partial<IdleState>) };
  for (const k of ['owned', 'progress', 'managers'] as const) {
    const arr = (s[k] as unknown[]) ?? [];
    (s as unknown as Record<string, unknown[]>)[k] = BIZ.map((_, i) => arr[i] ?? (base[k] as unknown[])[i]);
  }
  return s;
}

// ------------------------------------------------------------------ nombres

const NAMES = ['', '', 'million', 'milliard', 'billion', 'billiard', 'trillion', 'trilliard', 'quadrillion', 'quadrilliard', 'quintillion', 'quintilliard',
  'sextillion', 'sextilliard', 'septillion', 'septilliard', 'octillion', 'octilliard', 'nonillion', 'nonilliard', 'décillion', 'décilliard'];

/** Montant lisible : 1 234, 12,5 k, 3,40 millions, 1,2 milliard… puis notation scientifique. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  const n = Math.max(0, v);
  if (n < 1e3) return n < 10 && n % 1 ? n.toFixed(1).replace('.', ',') : String(Math.floor(n));
  if (n < 1e6) return Math.floor(n).toLocaleString('fr-FR');
  const e = Math.floor(Math.log10(n) / 3);
  const name = NAMES[e];
  const x = n / 10 ** (e * 3);
  const num = x.toLocaleString('fr-FR', { minimumFractionDigits: x < 100 ? 2 : 1, maximumFractionDigits: x < 100 ? 2 : 1 });
  if (!name) return n.toExponential(2).replace('.', ',');
  return `${num} ${name}${x >= 2 ? 's' : ''}`;
}

/** Durée courte : 0,8 s, 12 s, 4 min, 2 h 15. */
export function dur(sec: number): string {
  if (sec < 1) return `${sec.toFixed(1).replace('.', ',')} s`;
  if (sec < 60) return `${Math.ceil(sec)} s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h < 24 ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.floor(h / 24)} j ${h % 24} h`;
}
