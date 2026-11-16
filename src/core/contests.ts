import type { Tasting } from './brewing/model';
import { AD_REF } from './market';
import type { Rng } from './rng';
import { TRENDS, trendById } from './trends';
import { tl } from '../i18n';

/**
 * Concours de bières : régional, national puis international. Chaque concours porte sur une catégorie (un style ou
 * un caractère, les mêmes que les tendances) et affiche dès son ouverture les notes des brasseries rivales : battre
 * la 3e donne le bronze, la 2e l'argent, la 1re l'or. Le jury goûte le dernier lot de la bière inscrite.
 * Une médaille se porte en cocarde sur la bouteille et fait vendre la bière plus, et plus cher.
 */

export type ContestTier = 0 | 1 | 2;
/** 0 bronze, 1 argent, 2 or. */
export type Metal = 0 | 1 | 2;

export interface ContestTierDef {
  name: string;
  /** Étoiles de popularité exigées de la bière inscrite. */
  stars: number;
  /** Niveau de la brasserie qui ouvre ce concours. */
  level: number;
  /** Notes des rivaux (sur 20) : de la plus basse à la plus haute. */
  rivals: readonly [number, number];
  /** Droit d'inscription : part d'une journée de revenus typique (AD_REF). */
  feeShare: number;
}

export const CONTEST_TIERS: readonly ContestTierDef[] = [
  { name: tl('Concours régional'), stars: 3, level: 3, rivals: [14, 17], feeShare: 0.04 },
  { name: tl('Concours national'), stars: 4, level: 4, rivals: [16, 18.5], feeShare: 0.04 },
  { name: tl('Concours international'), stars: 5, level: 5, rivals: [18, 19.8], feeShare: 0.04 },
];

export const METALS = [tl('Bronze'), tl('Argent'), tl('Or')] as const;
export const MEDALS = [tl('Médaille de bronze'), tl('Médaille d\'argent'), tl('Médaille d\'or')] as const;

/** Bouteilles envoyées au jury. */
export const CONTEST_BOTTLES = 6;
/** Inscriptions ouvertes pendant 12 h de jeu. */
export const CONTEST_OPEN_S = 12 * 3600;
/** Puis 4 à 8 h avant le concours suivant. */
export const CONTEST_GAP_MIN_S = 4 * 3600;
export const CONTEST_GAP_MAX_S = 8 * 3600;
/** Le premier concours arrive peu après l'ouverture des concours (brasserie de niveau 3). */
export const CONTEST_FIRST_S = 10 * 60;
/** L'avis du jury varie d'au plus ± 0,3 point autour de la note du lot. */
export const JURY_SPREAD = 0.3;

const RIVAL_NAMES = [
  'Brasserie du Moulin', 'Les Trois Fûts', 'Hop & Co', 'La Mousse Dorée', 'Brasserie des Remparts', 'Le Chaudron',
  'Malterie du Val', 'Brasserie Saint-Arnoux', 'La Houblonnière', 'Les Caves Rouges', 'Brasserie de l\'Écluse', 'Le Brasseur Fou',
] as const;

export interface Rival {
  name: string;
  /** Note sur 20, au dixième. */
  score: number;
}

export interface Contest {
  tier: ContestTier;
  /** Catégorie : identifiant d'une tendance (style ou caractère). */
  cat: string;
  /** Les trois rivaux à battre, du 1er au 3e. */
  rivals: Rival[];
  /** Clôture (s de jeu). */
  closes: number;
  /** Bière inscrite et qualité du lot envoyé au jury. */
  entry?: { beerId: number; quality: number };
}

export interface ContestResult {
  tier: ContestTier;
  cat: string;
  rivals: Rival[];
  beerId: number | null;
  beerName: string;
  /** Note du jury (sur 20), si une bière était inscrite. */
  score: number | null;
  /** Place (0 = 1re) parmi les quatre, si une bière était inscrite. */
  rank: number | null;
  metal: Metal | null;
  /** Ce qui manquait à la bière pour plus de finesse (conseil de Gaston). */
  tip?: string;
}

/** Une médaille gagnée par une bière. */
export interface Medal {
  tier: ContestTier;
  metal: Metal;
  cat: string;
  /** Note du jury. */
  score: number;
}

export const contestCategory = (cat: string) => trendById(cat);
export const contestName = (c: { tier: ContestTier; cat: string }) =>
  `${CONTEST_TIERS[c.tier]!.name} · ${contestCategory(c.cat)?.short ?? c.cat}`;

/** Concours ouverts au niveau de la brasserie. */
export const openTiers = (breweryLevel: number): ContestTier[] =>
  CONTEST_TIERS.flatMap((t, i) => (breweryLevel >= t.level ? [i as ContestTier] : []));

export const contestFee = (tier: ContestTier, breweryLevel: number) =>
  Math.round(((AD_REF[breweryLevel - 1] ?? AD_REF[0]) * CONTEST_TIERS[tier]!.feeShare) / 50) * 50;

/** Tire un concours : les concours ouverts se succèdent à tour de rôle, sur une catégorie au hasard. */
export function drawContest(rng: Rng, tier: ContestTier, time: number): Contest {
  const cat = TRENDS[Math.floor(rng.next() * TRENDS.length)]!.id;
  const [lo, hi] = CONTEST_TIERS[tier]!.rivals;
  const names = [...RIVAL_NAMES];
  const rivals: Rival[] = [];
  for (let i = 0; i < 3; i++) {
    const name = names.splice(Math.floor(rng.next() * names.length), 1)[0]!;
    rivals.push({ name, score: Math.round(rng.range(lo, hi) * 10) / 10 });
  }
  rivals.sort((a, b) => b.score - a.score);
  return { tier, cat, rivals, closes: time + CONTEST_OPEN_S };
}

/** Note du jury pour un lot : sa qualité sur 20, à ± 0,3 près. */
export function juryScore(quality: number, rng: Rng): number {
  const s = quality * 20 + (rng.next() * 2 - 1) * JURY_SPREAD;
  return Math.round(Math.max(0, Math.min(20, s)) * 10) / 10;
}

/** Place parmi les rivaux (à égalité, le joueur passe devant) et médaille. */
export function placeOf(score: number, rivals: readonly Rival[]): { rank: number; metal: Metal | null } {
  const rank = rivals.filter((r) => r.score > score).length;
  return { rank, metal: rank <= 2 ? ((2 - rank) as Metal) : null };
}

/** Rang d'une cocarde, du bronze régional (0) à l'or international (8). */
export const cocardeRank = (m: Pick<Medal, 'tier' | 'metal'>) => m.tier * 3 + m.metal;

/** La plus prestigieuse des médailles d'une bière. */
export function bestMedal(medals: readonly Medal[] | undefined): Medal | null {
  let best: Medal | null = null;
  for (const m of medals ?? []) if (!best || cocardeRank(m) > cocardeRank(best)) best = m;
  return best;
}

/**
 * Bonus de notoriété d'une cocarde : les verres et les bouteilles se vendent plus cher, et la bière se vend plus
 * (clients du bar, quota du grossiste). Du bronze régional (+5 %) à l'or international (+50 %).
 */
export const COCARDE_BONUS = [0.05, 0.08, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5] as const;
export const medalBonus = (medals: readonly Medal[] | undefined) => {
  const m = bestMedal(medals);
  return m ? COCARDE_BONUS[cocardeRank(m)]! : 0;
};

/** La bière entre-t-elle dans la catégorie du concours ? */
export const inCategory = (c: Pick<Contest, 'cat'>, t: Tasting) => !!contestCategory(c.cat)?.test(t);
