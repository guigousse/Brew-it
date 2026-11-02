import type { Recipe } from './brewing/model';

export type StationId = 'mill' | 'mash' | 'boil' | 'cooler' | 'fermenter' | 'conditioning' | 'bottling';
export const STATION_ORDER: readonly StationId[] = ['mill', 'mash', 'boil', 'cooler', 'fermenter', 'conditioning', 'bottling'];

export type KnobKey = Exclude<keyof Recipe, 'strain'>;

export interface KnobDef {
  key: KnobKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface StationDef {
  id: StationId;
  /** Nom de l'étape du procédé. */
  step: string;
  /** Nom de l'appareil à chaque niveau. */
  names: readonly [string, string, string];
  /** Ce qui se passe à cette étape, en une phrase. */
  description: string;
  knobs: readonly KnobDef[];
  /** L'étape comporte le choix de la levure. */
  strain?: boolean;
  /** Ce qu'apporte chaque niveau (affiché dans la fiche d'amélioration). */
  perks: readonly [string, string, string];
  /** Prix pour passer aux niveaux 2 et 3. */
  upgradeCost: readonly [number, number];
}

/** Volume de lot (L) que chaque niveau d'appareil peut traiter : le plus petit fixe la taille du brassin. */
export const CAPACITY = [0, 20, 60, 200] as const;
/** Imprécision des températures (± °C) selon le niveau. */
export const PRECISION = [0, 2, 0.8, 0.2] as const;
/** Multiplicateur de durée selon le niveau. */
export const SPEED = [0, 1, 0.75, 0.5] as const;

export const STATIONS: Record<StationId, StationDef> = {
  mill: {
    id: 'mill', step: 'Concassage', names: ['Moulin à main', 'Moulin à rouleaux', 'Broyeur industriel'],
    description: 'On casse les grains de malt pour libérer l\'amidon. La quantité de malt fait la force de la bière.',
    knobs: [
      { key: 'grainKg', label: 'Malt', min: 1, max: 10, step: 0.5, unit: 'kg' },
      { key: 'crush', label: 'Finesse', min: 1, max: 10, step: 1, unit: '/10' },
    ],
    perks: ['Lots de 20 L', 'Lots de 60 L, plus rapide', 'Lots de 200 L, mouture régulière (moins d\'astringence)'],
    upgradeCost: [400, 2500],
  },
  mash: {
    id: 'mash', step: 'Empâtage', names: ['Marmite isotherme', 'Cuve inox chauffée', 'Cuve d\'empâtage pro'],
    description: 'Le malt infuse dans l\'eau chaude : ses enzymes changent l\'amidon en sucre.',
    knobs: [
      { key: 'mashTemp', label: 'Température', min: 45, max: 85, step: 1, unit: '°C' },
      { key: 'mashTime', label: 'Durée', min: 10, max: 120, step: 5, unit: 'min' },
    ],
    perks: ['Température ± 2 °C', 'Température ± 0,8 °C, lots de 60 L', 'Température ± 0,2 °C, lots de 200 L'],
    upgradeCost: [600, 3500],
  },
  boil: {
    id: 'boil', step: 'Ébullition', names: ['Marmite sur gaz', 'Chaudière inox', 'Cuve d\'ébullition à vapeur'],
    description: 'Le moût bout avec le houblon : au début pour l\'amertume, à la fin pour les arômes.',
    knobs: [
      { key: 'hopsBitter', label: 'Houblon amer', min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'hopsAroma', label: 'Houblon arôme', min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'boilTime', label: 'Durée', min: 5, max: 120, step: 5, unit: 'min' },
    ],
    perks: ['Ébullition douce', 'Ébullition vigoureuse : moins de goût de maïs cuit, lots de 60 L', 'Vapeur : lots de 200 L, deux fois plus rapide'],
    upgradeCost: [600, 3500],
  },
  cooler: {
    id: 'cooler', step: 'Refroidissement', names: ['Serpentin', 'Échangeur à plaques', 'Échangeur double étage'],
    description: 'Il faut refroidir le moût avant d\'ajouter la levure : au-dessus de 35 °C, elle meurt.',
    knobs: [{ key: 'pitchTemp', label: 'Température de sortie', min: 5, max: 60, step: 1, unit: '°C' }],
    perks: ['Lent : risque d\'infection 12 %', 'Rapide : risque 4 %, lots de 60 L', 'Instantané : aucun risque, lots de 200 L'],
    upgradeCost: [500, 3000],
  },
  fermenter: {
    id: 'fermenter', step: 'Fermentation', names: ['Seau de fermentation', 'Fermenteur conique', 'Fermenteur régulé'],
    description: 'La levure mange le sucre et fabrique l\'alcool et les bulles. Chaque souche a sa température idéale.',
    strain: true,
    knobs: [
      { key: 'fermentTemp', label: 'Température', min: 4, max: 36, step: 1, unit: '°C' },
      { key: 'fermentDays', label: 'Durée', min: 1, max: 30, step: 1, unit: 'j' },
    ],
    perks: ['Température ± 2 °C', 'Température ± 0,8 °C, lots de 60 L', 'Régulé ± 0,2 °C, lots de 200 L'],
    upgradeCost: [800, 5000],
  },
  conditioning: {
    id: 'conditioning', step: 'Garde', names: ['Dame-jeanne', 'Cuve de garde', 'Cuve de garde réfrigérée'],
    description: 'La bière se repose et s\'affine. Au froid, elle devient limpide.',
    knobs: [
      { key: 'gardeTemp', label: 'Température', min: 0, max: 20, step: 1, unit: '°C' },
      { key: 'gardeDays', label: 'Durée', min: 0, max: 30, step: 1, unit: 'j' },
    ],
    perks: ['Température ± 2 °C', 'Température ± 0,8 °C, lots de 60 L', 'Garde à froid : bière plus limpide, lots de 200 L'],
    upgradeCost: [700, 4000],
  },
  bottling: {
    id: 'bottling', step: 'Embouteillage', names: ['Canne d\'embouteillage', 'Tireuse 4 becs', 'Ligne automatique'],
    description: 'On met en bouteille avec un peu de sucre : la levure le transforme en bulles.',
    knobs: [{ key: 'priming', label: 'Sucre', min: 0, max: 16, step: 0.5, unit: 'g/L' }],
    perks: ['Lent, léger goût d\'oxydation', 'Plus rapide, moins d\'oxydation, lots de 60 L', 'Ligne automatique : aucune oxydation, lots de 200 L'],
    upgradeCost: [500, 3000],
  },
};

/** Durée de traitement d'une étape (s de jeu) pour une recette, selon le niveau de l'appareil. */
export function stationDuration(id: StationId, r: Recipe, level: number, liters: number): number {
  const base: Record<StationId, number> = {
    mill: 8,
    mash: r.mashTime * 0.4,
    boil: r.boilTime * 0.4,
    cooler: 12,
    fermenter: r.fermentDays * 12,
    conditioning: Math.max(4, r.gardeDays * 10),
    bottling: (liters / 0.33) * 0.6,
  };
  return base[id] * (SPEED[level] ?? 1);
}
