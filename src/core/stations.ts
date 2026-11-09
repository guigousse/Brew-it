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

export const MAX_LEVEL = 5;
/** La brasserie prend le niveau de son appareil le moins avancé : son décor change et de nouveaux clients s'ouvrent. */
export const BREWERY_NAMES = ['Labo d\'alchimiste', 'Garage', 'Microbrasserie', 'Usine', 'Labo du futur'] as const;
type Five<T> = readonly [T, T, T, T, T];

export interface StationDef {
  id: StationId;
  /** Nom de l'étape du procédé. */
  step: string;
  /** Nom de l'appareil à chaque niveau : verrerie d'alchimiste → garage → pro → industriel → labo futuriste. */
  names: Five<string>;
  /** Ce qui se passe à cette étape, en une phrase. */
  description: string;
  knobs: readonly KnobDef[];
  /** L'étape comporte le choix de la levure. */
  strain?: boolean;
  /** Ce qu'apporte chaque niveau (affiché dans la fiche d'amélioration). */
  perks: Five<string>;
  /** Prix de base de l'appareil, multiplié par TIER_COST pour chaque niveau. */
  baseCost: number;
}

/** Volume de lot (L) que chaque niveau d'appareil peut traiter : le plus petit fixe la taille du brassin. */
export const CAPACITY = [0, 5, 20, 60, 200, 600] as const;
/** Imprécision des températures (± °C) selon le niveau. */
export { TEMP_SPREAD as PRECISION, DOSE_SPREAD } from './brewing/execution';
/** Multiplicateur de durée selon le niveau. */
export const SPEED = [0, 1.2, 1, 0.8, 0.6, 0.4] as const;
/** Secondes par bouteille à l'embouteillage selon le niveau (de la pipette aux robots). */
export const BOTTLE_S = [0, 0.7, 0.5, 0.25, 0.08, 0.02] as const;
/** Risque d'infection au refroidissement selon le niveau du refroidisseur. */
export const INFECTION = [0, 0.1, 0.06, 0.02, 0, 0] as const;
/** Pénalité d'oxydation selon le niveau de l'embouteillage. */
export const OXIDATION = [0, 0.08, 0.05, 0.02, 0, 0] as const;
/** Multiplicateur de prix pour passer au niveau n (index = niveau visé). */
export const TIER_COST = [0, 0, 1, 40, 400, 2000] as const;

export function upgradeCost(id: StationId, toLevel: number): number {
  return STATIONS[id].baseCost * (TIER_COST[toLevel] ?? Infinity);
}

/** Secondes de jeu pour une « journée » de fermentation ou de garde. */
export const DAY_S = 30;

export const STATIONS: Record<StationId, StationDef> = {
  mill: {
    id: 'mill', step: 'Concassage', names: ['Mortier et pilon', 'Moulin à main', 'Moulin à rouleaux', 'Broyeur industriel', 'Broyeur laser'],
    description: 'On casse les grains de malt pour libérer l\'amidon. La quantité de malt fait la force de la bière.',
    knobs: [
      { key: 'grainKg', label: 'Malt', min: 1, max: 10, step: 0.5, unit: 'kg' },
      { key: 'crush', label: 'Finesse', min: 1, max: 10, step: 1, unit: '/10' },
    ],
    perks: ['5 L · précision 40 %', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 %', '600 L · précision 100 %'],
    baseCost: 60,
  },
  mash: {
    id: 'mash', step: 'Empâtage', names: ['Ballon sur bec Bunsen', 'Marmite isotherme', 'Cuve inox chauffée', 'Cuve d\'empâtage pro', 'Bioréacteur enzymatique'],
    description: 'Le malt infuse dans l\'eau chaude : ses enzymes changent l\'amidon en sucre.',
    knobs: [
      { key: 'mashTemp', label: 'Température', min: 45, max: 85, step: 1, unit: '°C' },
      { key: 'mashTime', label: 'Durée', min: 10, max: 120, step: 5, unit: 'min' },
    ],
    perks: ['5 L · précision 40 %', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 %', '600 L · précision 100 %'],
    baseCost: 80,
  },
  boil: {
    id: 'boil', step: 'Ébullition', names: ['Alambic de cuivre', 'Marmite sur gaz', 'Chaudière inox', 'Cuve d\'ébullition à vapeur', 'Bouilloire à induction'],
    description: 'Le moût bout avec le houblon : au début pour l\'amertume, à la fin pour les arômes.',
    knobs: [
      { key: 'hopsBitter', label: 'Houblon amer', min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'hopsAroma', label: 'Houblon arôme', min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'boilTime', label: 'Durée', min: 5, max: 120, step: 5, unit: 'min' },
    ],
    perks: ['5 L · précision 40 %', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 %', '600 L · précision 100 %'],
    baseCost: 80,
  },
  cooler: {
    id: 'cooler', step: 'Refroidissement', names: ['Réfrigérant en verre', 'Serpentin', 'Échangeur à plaques', 'Échangeur double étage', 'Cryo-échangeur'],
    description: 'Il faut refroidir le moût avant d\'ajouter la levure : au-dessus de 35 °C, elle meurt.',
    knobs: [{ key: 'pitchTemp', label: 'Température de sortie', min: 5, max: 60, step: 1, unit: '°C' }],
    perks: ['5 L · précision 40 % · infection 10 %', '20 L · précision 65 % · infection 6 %', '60 L · précision 85 % · infection 2 %', '200 L · précision 95 % · sans infection', '600 L · précision 100 %'],
    baseCost: 70,
  },
  fermenter: {
    id: 'fermenter', step: 'Fermentation', names: ['Grande fiole', 'Seau de fermentation', 'Fermenteur conique', 'Fermenteur régulé', 'Bioréacteur piloté'],
    description: 'La levure mange le sucre et fabrique l\'alcool et les bulles. Chaque souche a sa température idéale.',
    strain: true,
    knobs: [
      { key: 'fermentTemp', label: 'Température', min: 4, max: 36, step: 1, unit: '°C' },
      { key: 'fermentDays', label: 'Durée', min: 1, max: 30, step: 1, unit: 'j' },
    ],
    perks: ['5 L · précision 40 %', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 %', '600 L · précision 100 %'],
    baseCost: 100,
  },
  conditioning: {
    id: 'conditioning', step: 'Garde', names: ['Bocal à bouchon', 'Dame-jeanne', 'Cuve de garde', 'Cuve de garde réfrigérée', 'Cuve de stase'],
    description: 'La bière se repose et s\'affine. Au froid, elle devient limpide.',
    knobs: [
      { key: 'gardeTemp', label: 'Température', min: 0, max: 20, step: 1, unit: '°C' },
      { key: 'gardeDays', label: 'Durée', min: 0, max: 30, step: 1, unit: 'j' },
    ],
    perks: ['5 L · précision 40 %', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 % · plus limpide', '600 L · précision 100 % · limpidité parfaite'],
    baseCost: 90,
  },
  bottling: {
    id: 'bottling', step: 'Embouteillage', names: ['Entonnoir et pipette', 'Canne d\'embouteillage', 'Tireuse 4 becs', 'Ligne automatique', 'Ligne robotisée'],
    description: 'On met en bouteille avec un peu de sucre : la levure le transforme en bulles.',
    knobs: [{ key: 'priming', label: 'Sucre', min: 0, max: 16, step: 0.5, unit: 'g/L' }],
    perks: ['5 L · précision 40 % · oxydation', '20 L · précision 65 %', '60 L · précision 85 %', '200 L · précision 95 % · sans oxydation', '600 L · précision 100 %'],
    baseCost: 70,
  },
};

/** Durée de traitement d'une étape (s de jeu) pour une recette, selon le niveau de l'appareil. */
export function stationDuration(id: StationId, r: Recipe, level: number, liters: number): number {
  const base: Record<StationId, number> = {
    mill: 10,
    mash: r.mashTime * 0.5,
    boil: r.boilTime * 0.5,
    cooler: 15,
    fermenter: r.fermentDays * DAY_S,
    conditioning: Math.max(5, r.gardeDays * DAY_S * 0.5),
    bottling: (liters / 0.33) * (BOTTLE_S[level] ?? 0.5),
  };
  return id === 'bottling' ? base[id] : base[id] * (SPEED[level] ?? 1);
}
