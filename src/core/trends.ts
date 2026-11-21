import type { Tasting } from './brewing/model';
import { clamp01 } from './math';
import { tl } from '../i18n';

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
  { id: 'ipa', text: tl('Les IPA ont la cote'), short: tl('IPA'), test: (t) => t.style === 'IPA' || t.style === 'Double IPA' },
  { id: 'lager', text: tl('Tout le monde veut une lager bien fraîche'), short: tl('Lager'), test: (t) => t.style === 'Lager' || t.style === 'Bock' },
  { id: 'saison', text: tl('La saison revient à la mode'), short: tl('Saison'), test: (t) => t.style === 'Saison' },
  { id: 'blonde', text: tl('Retour aux classiques : la blonde'), short: tl('Blonde'), test: (t) => t.style === 'Blonde' },
  { id: 'paleale', text: tl('Les Pale Ale font parler d\'elles'), short: tl('Pale Ale'), test: (t) => t.style === 'Pale Ale' },
  { id: 'abbaye', text: tl('Les bières d\'abbaye fortes séduisent'), short: tl('Triple / Forte'), test: (t) => t.style === 'Triple' || t.style === 'Forte' },
  { id: 'fruity', text: tl('On cherche des bières fruitées'), short: tl('Fruitée'), test: (t) => t.style === 'Ale fruitée' || t.style === 'Saison' },
  { id: 'light', text: tl('On boit léger : moins de 5 %'), short: '< 5 %', test: (t) => t.abv < 5 },
  { id: 'strong', text: tl('Les bières qui tapent : 7 % et plus'), short: '≥ 7 %', test: (t) => t.abv >= 7 },
  { id: 'bitter', text: tl('L\'amertume est en vogue'), short: tl('Amère'), test: (t) => t.ibu >= 40 },
  { id: 'soft', text: tl('Les bières douces, peu amères'), short: tl('Douce'), test: (t) => t.ibu < 20 },
  { id: 'aroma', text: tl('Il faut du nez : bières aromatiques'), short: tl('Aromatique'), test: (t) => t.aroma >= 0.5 },
  { id: 'clear', text: tl('Bières limpides comme du cristal'), short: tl('Limpide'), test: (t) => t.clarity >= 0.8 },
  { id: 'dark', text: tl('Les ambrées et cuivrées reviennent'), short: tl('Ambrée'), test: (t) => t.color !== 'Blonde' },
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
 * Popularité d'une bière, en étoiles (0 à 5), la somme de trois parts lisibles :
 * - **la qualité** : jusqu'à 2,5 ★ (Correcte ½ ★, Bonne 1¼ ★, Excellente 2 ★, parfaite 2,5 ★) ;
 * - **les tendances** : +½ ★ par tendance suivie ;
 * - **les ventes des 7 derniers jours** (bar, commandes, grossiste, en litres) : jusqu'à 2,5 ★, par paliers
 *   (`SALES_STEPS`) calés sur ce que vend une bière à chaque stade de la partie.
 * Une campagne de pub ajoute ses étoiles tant qu'elle dure. Le total ne dépasse pas 5 ★.
 */
export const QUALITY_STARS_MAX = 2.5;
export const SALES_STARS_MAX = 2.5;
export const TREND_STARS = 0.5;

/** Étoiles de la qualité : rien sous 0,5 (Médiocre), 2,5 ★ pour une bière parfaite. */
export const qualityStars = (quality: number) => clamp01((quality - 0.5) / 0.5) * QUALITY_STARS_MAX;

/**
 * Paliers des ventes sur 7 jours glissants (litres) : chacun donne ½ ★ de plus. Mesure du joueur simulé :
 * 20 L la première semaine, 3 000 à 15 000 L à la microbrasserie, 20 000 à 40 000 L à l'usine,
 * jusqu'à 150 000 L par bière en fin de partie. Entre deux paliers, les étoiles montent en douceur.
 */
export const SALES_STEPS: readonly { liters: number; stars: number }[] = [
  { liters: 100, stars: 0.5 },
  { liters: 1_000, stars: 1 },
  { liters: 10_000, stars: 1.5 },
  { liters: 50_000, stars: 2 },
  { liters: 150_000, stars: 2.5 },
];
/** En dessous de ce volume, une bière n'est pas encore connue. */
const SALES_FLOOR_L = 10;

export function salesStars(liters: number): number {
  if (liters <= SALES_FLOOR_L) return 0;
  let lo = { liters: SALES_FLOOR_L, stars: 0 };
  for (const step of SALES_STEPS) {
    if (liters < step.liters) return lo.stars + (step.stars - lo.stars) * (Math.log(liters / lo.liters) / Math.log(step.liters / lo.liters));
    lo = step;
  }
  return SALES_STARS_MAX;
}

/** Litres sur 7 jours qu'il faut pour cette part « ventes » (l'inverse de salesStars). */
export function litersForSales(stars: number): number {
  if (stars <= 0) return 0;
  let lo = SALES_FLOOR_L;
  let hi = SALES_STEPS[SALES_STEPS.length - 1]!.liters;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (salesStars(mid) < stars) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Le prochain palier de ventes, ou null au sommet. */
export const nextSalesStep = (liters: number) => SALES_STEPS.find((s) => liters < s.liters) ?? null;

/** Les ventes se comptent par tranches de 6 h, sur 7 jours glissants. */
export const SALES_SLOT_S = 6 * 3600;
export const SALES_SLOTS = 28;

export interface PopParts {
  quality: number;
  trends: number;
  /** Tendances suivies. */
  trendCount: number;
  sales: number;
  /** Litres vendus sur 7 jours. */
  liters: number;
  /** Bonus de la campagne de pub en cours. */
  ad: number;
  /** Visibilité de la bière officielle d'un partenariat. */
  partner: number;
  /** Total, plafonné à 5 ★. */
  total: number;
}

export function popParts(t: Tasting, active: readonly Trend[], liters: number, ad = 0, partner = 0): PopParts {
  const quality = qualityStars(t.quality);
  const trendCount = trendsOf(t, active).length;
  const trends = trendCount * TREND_STARS;
  const sales = salesStars(liters);
  return { quality, trends, trendCount, sales, liters, ad, partner, total: Math.min(5, quality + trends + sales + ad + partner) };
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

/** Score de popularité sur 100 (le chiffre de la fiche). */
export const popScore = (p: number) => Math.round(clamp01(p) * 100);
/** En étoiles (0 à 5, par demi-étoile) : une demi-étoile tous les 10 points, arrondie vers le bas (4 ★ = 80 points). */
export const stars = (p: number) => Math.floor(popScore(p) / 10) / 2;
