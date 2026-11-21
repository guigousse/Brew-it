import { tl } from '../i18n';
/** Bouteilles par caisse (comme les cartons de la ligne d'embouteillage). */
export const CRATE = 12;

export interface StorageLevel {
  name: string;
  /** Capacité en caisses. */
  crates: number;
  /** Prix pour atteindre ce niveau (0 pour le premier). */
  cost: number;
}

/** Niveaux du stockage : les caisses s'y empilent jusqu'à ce qu'il soit plein. */
export const STORAGE: readonly StorageLevel[] = [
  { name: tl('Coin du garage'), crates: 10, cost: 0 },
  { name: tl('Cave voûtée'), crates: 60, cost: 250 },
  { name: tl('Chambre froide'), crates: 400, cost: 8000 },
  { name: tl('Entrepôt'), crates: 2500, cost: 120000 },
  { name: tl('Plateforme logistique'), crates: 12000, cost: 800000 },
];

/**
 * Agrandissements intermédiaires, sur le principe des machines : jusqu'à 4 par palier du stockage, chacun +15 % de
 * capacité ; au dernier palier, sans fin. Passer au palier suivant repart de sa capacité de base (bien plus grande).
 */
export const STORAGE_STEPS = 4;
export const STORAGE_STEP_GAIN = 1.15;
/** Prix d'un agrandissement intermédiaire : une part du prix du palier suivant. */
export const STORAGE_STEP_SHARE = [0.05, 0.08, 0.12, 0.18] as const;
/** Au dernier palier : 200 000 € le premier, puis ×1,6 à chaque fois. */
export const STORAGE_EXTRA = { base: 200_000, growth: 1.6 } as const;

/** Capacité en caisses d'un palier et de ses agrandissements. */
export const storageCrates = (level: number, step: number) =>
  Math.round(STORAGE[level - 1]!.crates * Math.pow(STORAGE_STEP_GAIN, step));

/** Prix du prochain agrandissement intermédiaire (null : il faut passer au palier suivant). */
export function storageStepCost(level: number, step: number): number | null {
  const next = STORAGE[level];
  if (!next) return Math.round(STORAGE_EXTRA.base * Math.pow(STORAGE_EXTRA.growth, step) / 1000) * 1000;
  if (step >= STORAGE_STEPS) return null;
  return Math.max(10, Math.round((next.cost * STORAGE_STEP_SHARE[step]!) / 10) * 10);
}

/**
 * Prix d'une nouvelle place dans la gamme, selon le nombre de places déjà possédées.
 * La 2e est abordable, puis le prix grimpe de plus en plus vite.
 */
export const SLOT_COSTS: readonly number[] = [150, 8000, 50000, 200000, 600000, 1500000, 3000000];
export const MAX_RANGE = SLOT_COSTS.length + 1;

export function slotCost(owned: number): number | null {
  return SLOT_COSTS[owned - 1] ?? null;
}
