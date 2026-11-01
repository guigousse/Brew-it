/**
 * Paliers d'agrandissement de la carte. La grille est allouée à la taille max dès le départ ;
 * on ne fait que déverrouiller un rectangle ancré en (0,0) → les coordonnées des bâtiments restent stables.
 */
export interface ExpansionStage {
  name: string;
  width: number;
  height: number;
  cost: number;
}

export const EXPANSIONS: readonly ExpansionStage[] = [
  { name: 'Garage', width: 10, height: 7, cost: 0 },
  { name: 'Arrière-cour', width: 16, height: 11, cost: 2_500 },
  { name: 'Entrepôt', width: 24, height: 16, cost: 15_000 },
  { name: 'Micro-brasserie', width: 36, height: 24, cost: 80_000 },
  { name: 'Usine', width: 56, height: 36, cost: 400_000 },
];

export const MAX_MAP_WIDTH = EXPANSIONS[EXPANSIONS.length - 1]!.width;
export const MAX_MAP_HEIGHT = EXPANSIONS[EXPANSIONS.length - 1]!.height;
