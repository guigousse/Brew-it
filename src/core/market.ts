import type { Tasting } from './brewing/model';
import { DRINKABLE_MIN } from './brewing/model';

/** Facteur de prix selon la qualité de la bière (de 0,6 à 1,4). */
export const qualityFactor = (t: Pick<Tasting, 'quality'>) => 0.6 + 0.8 * t.quality;

// ------------------------------------------------------------------ bar

export interface BarLevel {
  name: string;
  /** Clients par minute quand la marque est au sommet de sa popularité (10 % de ce chiffre au départ). */
  rate: number;
  /** Tireuses : un fût branché sur chacune. */
  taps: number;
  /** Places assises (décor). */
  seats: number;
  /** Multiplicateur du prix du verre. */
  priceMult: number;
  /** Prix pour atteindre ce niveau (0 pour le premier). */
  cost: number;
}

/**
 * Le bar sert des verres tirés des fûts branchés sur ses tireuses. Il commence petit et poussiéreux :
 * un client toutes les 10 minutes. L'affluence grandit avec la popularité de la marque et le niveau du bar.
 */
export const BAR: readonly BarLevel[] = [
  { name: 'Comptoir poussiéreux', rate: 1, taps: 1, seats: 2, priceMult: 1, cost: 0 },
  { name: 'Bistrot de quartier', rate: 1.5, taps: 2, seats: 4, priceMult: 1.15, cost: 400 },
  { name: 'Pub', rate: 3, taps: 3, seats: 7, priceMult: 1.3, cost: 6000 },
  { name: 'Taproom', rate: 5, taps: 5, seats: 10, priceMult: 1.5, cost: 120000 },
  { name: 'Bar du futur', rate: 10, taps: 8, seats: 12, priceMult: 1.8, cost: 1200000 },
];

/** Part de l'affluence maximale atteinte par une marque inconnue. */
export const BAR_BASE_SHARE = 0.1;
/** Prix de base d'un verre de 25 cl. */
export const GLASS_PRICE = 3;
/** Le bar sert tout ce qui est buvable. */
export const BAR_MIN_QUALITY = DRINKABLE_MIN;

/** Un verre : 25 cl. */
export const GLASS_L = 0.25;
/**
 * Taille des fûts que remplit la ligne, selon le volume des brassins (donc le matériel) :
 * 5 L au début, puis 10, 20, 30 et 50 L.
 */
export function kegLiters(batchLiters: number): number {
  const size = batchLiters >= 600 ? 50 : batchLiters >= 200 ? 30 : batchLiters >= 60 ? 20 : batchLiters >= 20 ? 10 : 5;
  return Math.min(size, batchLiters);
}
/** Verres dans un fût de cette taille. */
export const kegGlasses = (liters: number) => Math.round(liters / GLASS_L);
/** Place d'un fût plein au stockage, comptée en bouteilles de 33 cl (un fût de 5 L ≈ une caisse). */
export const kegSpace = (glasses: number) => Math.round((glasses * GLASS_L) / 0.33 * 0.8);

/** Bonus de clientèle par bière différente aux tireuses. */
export const VARIETY = 0.25;
export const variety = (beers: number) => (beers <= 0 ? 0 : 1 + VARIETY * (beers - 1));

/** Prix d'un verre servi au bar (la tendance le rend plus cher : +15 % par tendance suivie). */
export function glassPrice(level: number, t: Tasting, trends = 0): number {
  return GLASS_PRICE * qualityFactor(t) * (BAR[level - 1]?.priceMult ?? 1) * (1 + 0.15 * trends);
}
