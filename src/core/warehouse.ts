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
  { name: 'Coin du garage', crates: 10, cost: 0 },
  { name: 'Cave voûtée', crates: 30, cost: 500 },
  { name: 'Chambre froide', crates: 80, cost: 30000 },
  { name: 'Entrepôt', crates: 200, cost: 200000 },
  { name: 'Plateforme logistique', crates: 600, cost: 1200000 },
];

/**
 * Prix d'une nouvelle place dans la gamme, selon le nombre de places déjà possédées.
 * La 2e est abordable, puis le prix grimpe de plus en plus vite.
 */
export const SLOT_COSTS: readonly number[] = [150, 8000, 50000, 200000, 600000, 3000000, 8000000];
export const MAX_RANGE = SLOT_COSTS.length + 1;

export function slotCost(owned: number): number | null {
  return SLOT_COSTS[owned - 1] ?? null;
}
