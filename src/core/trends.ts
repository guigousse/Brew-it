import type { Tasting } from './brewing/model';
import { clamp01 } from './math';

/**
 * Tendances du moment : ce que les buveurs recherchent (un style ou un caractère).
 * Une bière dans la tendance gagne plus vite en popularité et se vend mieux au bar.
 * Elles changent au fil du temps et s'affichent dans l'onglet « Tendances » de l'ordinateur.
 */
export interface TrendDef {
  id: string;
  /** Phrase affichée sur l'ordinateur. */
  text: string;
  /** Ce qui est recherché, en court (puce sur les bières). */
  short: string;
  test: (t: Tasting) => boolean;
}

export const TRENDS: readonly TrendDef[] = [
  { id: 'ipa', text: 'Les IPA ont la cote', short: 'IPA', test: (t) => t.style === 'IPA' || t.style === 'Double IPA' },
  { id: 'lager', text: 'Tout le monde veut une lager bien fraîche', short: 'Lager', test: (t) => t.style === 'Lager' || t.style === 'Bock' },
  { id: 'saison', text: 'La saison revient à la mode', short: 'Saison', test: (t) => t.style === 'Saison' },
  { id: 'blonde', text: 'Retour aux classiques : la blonde', short: 'Blonde', test: (t) => t.style === 'Blonde' },
  { id: 'paleale', text: 'Les Pale Ale font parler d\'elles', short: 'Pale Ale', test: (t) => t.style === 'Pale Ale' },
  { id: 'abbaye', text: 'Les bières d\'abbaye fortes séduisent', short: 'Triple / Forte', test: (t) => t.style === 'Triple' || t.style === 'Forte' },
  { id: 'fruity', text: 'On cherche des bières fruitées', short: 'Fruitée', test: (t) => t.style === 'Ale fruitée' || t.style === 'Saison' },
  { id: 'light', text: 'On boit léger : moins de 5 %', short: '< 5 %', test: (t) => t.abv < 5 },
  { id: 'strong', text: 'Les bières qui tapent : 7 % et plus', short: '≥ 7 %', test: (t) => t.abv >= 7 },
  { id: 'bitter', text: 'L\'amertume est en vogue', short: 'Amère', test: (t) => t.ibu >= 40 },
  { id: 'soft', text: 'Les bières douces, peu amères', short: 'Douce', test: (t) => t.ibu < 20 },
  { id: 'aroma', text: 'Il faut du nez : bières aromatiques', short: 'Aromatique', test: (t) => t.aroma >= 0.5 },
  { id: 'clear', text: 'Bières limpides comme du cristal', short: 'Limpide', test: (t) => t.clarity >= 0.8 },
  { id: 'dark', text: 'Les ambrées et cuivrées reviennent', short: 'Ambrée', test: (t) => t.color !== 'Blonde' },
];

export interface Trend {
  id: string;
  /** Fin de la tendance (s de jeu). */
  until: number;
}

/** Tendances actives en même temps. */
export const TREND_COUNT = 3;
/** Durée d'une tendance (s de jeu) : de 8 à 16 h. */
export const TREND_MIN_S = 8 * 3600;
export const TREND_MAX_S = 16 * 3600;

export const trendById = (id: string) => TRENDS.find((t) => t.id === id);

/** Tendances que suit une bière. */
export function trendsOf(t: Tasting, active: readonly Trend[]): TrendDef[] {
  return active.map((a) => trendById(a.id)).filter((d): d is TrendDef => !!d && d.test(t));
}

/** Facteur de tendance d'une bière : +30 % par tendance suivie. */
export const trendFactor = (t: Tasting, active: readonly Trend[]) => 1 + 0.3 * trendsOf(t, active).length;

// ------------------------------------------------------------------ popularité

/**
 * Popularité visée par une bière qui se boit : elle dépend fortement de sa qualité (une bière simplement
 * « Bonne » plafonne vers 2 à 3 étoiles), un peu des tendances, et ne dépasse jamais ce que permet la notoriété
 * de la brasserie (`cap`, selon son niveau). Chaque verre ou bouteille vendu en rapproche la bière ; sans ventes, elle s'érode.
 */
export function popTarget(t: Tasting, active: readonly Trend[], cap = 1): number {
  const q = clamp01((t.quality - 0.3) / 0.7);
  return Math.min(cap, clamp01(Math.pow(q, 1.6) * (1 + 0.1 * trendsOf(t, active).length)));
}
/** Notoriété maximale selon le niveau de la brasserie : un labo de garage ne peut pas être célèbre dans le monde entier. */
export const POP_CAP = [0.3, 0.5, 0.6, 0.8, 1] as const;
/** Rapprochement de la cible par verre servi au bar (le bouche-à-oreille). */
export const POP_PER_GLASS = 0.004;
/** … par bouteille livrée sur commande (moins visible). */
export const POP_PER_BOTTLE = 0.0002;
/** Érosion de la popularité : elle perd la moitié de sa valeur en 2 jours de jeu sans aucune vente. */
export const POP_DECAY = Math.LN2 / (2 * 86400);

/** Rapproche une popularité de sa cible pour `units` ventes de poids `k`. */
export function gainPop(pop: number, target: number, units: number, k: number): number {
  if (target <= pop) return pop;
  return target - (target - pop) * Math.pow(1 - k, units);
}

/**
 * Popularité de la marque : moyenne de la gamme pondérée par la popularité de chaque bière
 * (une nouvelle bière inconnue ne fait pas chuter la marque).
 */
export function brandPopularity(pops: readonly number[]): number {
  const sum = pops.reduce((s, p) => s + p, 0);
  if (sum <= 0) return 0;
  return pops.reduce((s, p) => s + p * p, 0) / sum;
}

/** En étoiles, pour l'affichage (0 à 5). */
export const stars = (p: number) => Math.round(clamp01(p) * 10) / 2;
