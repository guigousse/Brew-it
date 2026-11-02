/**
 * Exécution d'une étape par un appareil : ce qu'il fait réellement de tes réglages.
 * Du matériel rudimentaire mesure mal (températures qui dérivent, doses approximatives, mouture irrégulière)
 * et laisse des petits défauts ; au niveau 5, la précision est moléculaire.
 */
import type { StationId } from '../stations';
import type { Actual, Recipe } from './model';

/** Dérive maximale des températures (± °C) selon le niveau de l'appareil. */
export const TEMP_SPREAD = [0, 4.5, 2.5, 1, 0.3, 0.02] as const;
/** Erreur maximale sur les doses de malt, de houblon et de sucre (fraction). */
export const DOSE_SPREAD = [0, 0.3, 0.14, 0.06, 0.02, 0] as const;
/** Irrégularité de la mouture (± crans). */
export const CRUSH_SPREAD = [0, 2.5, 1.2, 0.5, 0.2, 0] as const;
/** Petits défauts du matériel à chaque étape (pénalité maximale de qualité). */
export const ROUGH = [0, 0.022, 0.017, 0.015, 0.006, 0] as const;

/** Écart aléatoire « en cloche » (triangulaire) dans [-spread, spread] : les gros écarts sont plus rares. */
const bell = (rand: () => number, spread: number) => (rand() + rand() - 1) * spread;

/**
 * Ce que l'appareil `id` (de niveau `level`) fait réellement de la recette, ajouté à `a`.
 * `exact` : aucune imprécision (premier brassin guidé par Gaston).
 */
export function executeStep(id: StationId, r: Recipe, level: number, rand: () => number, a: Partial<Actual>, exact = false): void {
  const t = exact ? 0 : TEMP_SPREAD[level] ?? 0;
  const d = exact ? 0 : DOSE_SPREAD[level] ?? 0;
  // « Bon ou mauvais jour » : tiré une fois par brassin, il rend les petits défauts plus ou moins marqués partout.
  if (a.luck == null) a.luck = rand();
  a.rough = (a.rough ?? 0) + (exact ? 0 : (ROUGH[level] ?? 0) * 2 * a.luck * (0.75 + 0.5 * rand()));
  switch (id) {
    case 'mill':
      a.grainKg = Math.max(0.5, r.grainKg * (1 + bell(rand, d)));
      a.crush = Math.min(10, Math.max(1, Math.round(r.crush + bell(rand, exact ? 0 : CRUSH_SPREAD[level] ?? 0))));
      break;
    case 'mash':
      a.mashTemp = r.mashTemp + bell(rand, t);
      break;
    case 'boil':
      a.hopsBitter = Math.max(0, r.hopsBitter * (1 + bell(rand, d)));
      a.hopsAroma = Math.max(0, r.hopsAroma * (1 + bell(rand, d)));
      break;
    case 'cooler':
      a.pitchTemp = r.pitchTemp + bell(rand, t);
      a.infectionRoll = exact ? 1 : rand();
      break;
    case 'fermenter':
      a.fermentTemp = r.fermentTemp + bell(rand, t);
      break;
    case 'conditioning':
      a.gardeTemp = r.gardeTemp + bell(rand, t);
      break;
    case 'bottling':
      a.priming = Math.max(0, r.priming * (1 + bell(rand, d)));
      break;
  }
}

/** Exécute toute la recette d'un coup (simulations, tests). */
export function executeAll(r: Recipe, levels: Record<StationId, number>, rand: () => number): Actual {
  const a: Partial<Actual> = {};
  for (const id of ['mill', 'mash', 'boil', 'cooler', 'fermenter', 'conditioning', 'bottling'] as const) executeStep(id, r, levels[id], rand, a);
  return a as Actual;
}
