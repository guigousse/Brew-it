import type { Recipe } from './brewing/model';
import { tl } from '../i18n';

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
export const BREWERY_NAMES = [tl('Labo d\'alchimiste'), tl('Garage'), tl('Microbrasserie'), tl('Usine'), tl('Labo du futur')] as const;
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
export const TIER_COST = [0, 0, 1, 34, 340, 1700] as const;

export function upgradeCost(id: StationId, toLevel: number): number {
  return STATIONS[id].baseCost * (TIER_COST[toLevel] ?? Infinity);
}

/**
 * Chaque appareil a 5 paliers (les 5 machines : de la verrerie d'alchimiste au labo du futur) de 5 niveaux chacun,
 * puis des niveaux sans fin. Les 4 niveaux intermédiaires d'un palier rendent la machine plus rapide (+5 % chacun)
 * et plus précise (elle se rapproche de la précision du palier suivant) ; passer au palier suivant change la machine,
 * son volume et son dessin. Après le niveau 25, chaque niveau donne +3 % de cadence et coûte 1,6 fois le précédent.
 */
export const STEPS_PER_TIER = 5;
/** Vitesse en plus par niveau intermédiaire. */
export const STEP_SPEED = 0.05;
/** Cadence en plus par niveau au-delà du 25e. */
export const EXTRA_SPEED = 0.03;
/** Prix de chaque niveau intermédiaire (2 à 5 du palier), en part du prix du palier suivant. */
export const STEP_SHARE = [0.02, 0.03, 0.04, 0.06] as const;
/** Au dernier palier, il n'y a plus de machine suivante : ses niveaux se paient comme si elle coûtait 4 fois le palier 5. */
const LAST_TIER_REF = TIER_COST[5] * 4;
/** Les niveaux au-delà du 25e : le premier coûte autant que le dernier niveau du palier 5, puis ×1,6 à chaque fois. */
export const EXTRA_GROWTH = 1.6;

/** État d'un appareil : son palier (1 à 5), son niveau dans le palier (0 à 4) et ses niveaux au-delà du 25e. */
export interface StationState {
  level: number;
  step?: number;
  extra?: number;
}

/** Numéro de niveau affiché (1 à 25, puis 26, 27…). */
export const levelNumber = (s: StationState) => (s.level - 1) * STEPS_PER_TIER + (s.step ?? 0) + 1 + (s.extra ?? 0);

/** Arrondi à deux chiffres significatifs (prix lisibles). */
const round2 = (v: number) => {
  if (v < 100) return Math.max(1, Math.round(v));
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
};

/** Prix du prochain niveau d'un appareil (pour une seule cuve). */
export function nextLevelCost(id: StationId, s: StationState): number {
  const base = STATIONS[id].baseCost;
  const step = s.step ?? 0;
  const ref = s.level < MAX_LEVEL ? TIER_COST[s.level + 1]! : LAST_TIER_REF;
  // au premier palier, la machine suivante ne coûte presque rien : ses niveaux se paient comme si elle valait 5 fois plus
  if (step < STEPS_PER_TIER - 1) return round2(base * Math.max(5, ref) * STEP_SHARE[step]!);
  if (s.level < MAX_LEVEL) return base * ref; // la machine suivante
  return round2(base * ref * STEP_SHARE[STEPS_PER_TIER - 2]! * Math.pow(EXTRA_GROWTH, (s.extra ?? 0) + 1));
}

/** Vitesse de l'appareil due à ses niveaux (1 = début du palier). */
export const levelSpeed = (s: StationState) => (1 + STEP_SPEED * (s.step ?? 0)) * Math.pow(1 + EXTRA_SPEED, s.extra ?? 0);

/** Précision « fractionnaire » : chaque niveau du palier rapproche de la précision du palier suivant. */
export const precisionLevel = (s: StationState) => Math.min(MAX_LEVEL, s.level + (s.step ?? 0) / STEPS_PER_TIER);

/** Secondes de jeu pour une « journée » de fermentation ou de garde. */
export const DAY_S = 30;

export const STATIONS: Record<StationId, StationDef> = {
  mill: {
    id: 'mill', step: tl('Concassage'), names: [tl('Mortier et pilon'), tl('Moulin à main'), tl('Moulin à rouleaux'), tl('Broyeur industriel'), tl('Broyeur laser')],
    description: tl('On casse les grains de malt pour libérer l\'amidon. La quantité de malt fait la force de la bière.'),
    knobs: [
      { key: 'grainKg', label: tl('Malt'), min: 1, max: 10, step: 0.5, unit: 'kg' },
      { key: 'crush', label: tl('Finesse'), min: 1, max: 10, step: 1, unit: '/10' },
    ],
    perks: [tl('5 L · précision 40 %'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 %'), tl('600 L · précision 100 %')],
    baseCost: 60,
  },
  mash: {
    id: 'mash', step: tl('Empâtage'), names: [tl('Ballon sur bec Bunsen'), tl('Marmite isotherme'), tl('Cuve inox chauffée'), tl('Cuve d\'empâtage pro'), tl('Bioréacteur enzymatique')],
    description: tl('Le malt infuse dans l\'eau chaude : ses enzymes changent l\'amidon en sucre.'),
    knobs: [
      { key: 'mashTemp', label: tl('Température'), min: 45, max: 85, step: 1, unit: '°C' },
      { key: 'mashTime', label: tl('Durée'), min: 10, max: 120, step: 5, unit: 'min' },
    ],
    perks: [tl('5 L · précision 40 %'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 %'), tl('600 L · précision 100 %')],
    baseCost: 80,
  },
  boil: {
    id: 'boil', step: tl('Ébullition'), names: [tl('Alambic de cuivre'), tl('Marmite sur gaz'), tl('Chaudière inox'), tl('Cuve d\'ébullition à vapeur'), tl('Bouilloire à induction')],
    description: tl('Le moût bout avec le houblon : au début pour l\'amertume, à la fin pour les arômes.'),
    knobs: [
      { key: 'hopsBitter', label: tl('Houblon amer'), min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'hopsAroma', label: tl('Houblon arôme'), min: 0, max: 200, step: 5, unit: 'g' },
      { key: 'boilTime', label: tl('Durée'), min: 5, max: 120, step: 5, unit: 'min' },
    ],
    perks: [tl('5 L · précision 40 %'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 %'), tl('600 L · précision 100 %')],
    baseCost: 80,
  },
  cooler: {
    id: 'cooler', step: tl('Refroidissement'), names: [tl('Réfrigérant en verre'), tl('Serpentin'), tl('Échangeur à plaques'), tl('Échangeur double étage'), tl('Cryo-échangeur')],
    description: tl('Il faut refroidir le moût avant d\'ajouter la levure : au-dessus de 35 °C, elle meurt.'),
    knobs: [{ key: 'pitchTemp', label: tl('Température de sortie'), min: 5, max: 60, step: 1, unit: '°C' }],
    perks: [tl('5 L · précision 40 % · infection 10 %'), tl('20 L · précision 65 % · infection 6 %'), tl('60 L · précision 85 % · infection 2 %'), tl('200 L · précision 95 % · sans infection'), tl('600 L · précision 100 %')],
    baseCost: 70,
  },
  fermenter: {
    id: 'fermenter', step: tl('Fermentation'), names: [tl('Grande fiole'), tl('Seau de fermentation'), tl('Fermenteur conique'), tl('Fermenteur régulé'), tl('Bioréacteur piloté')],
    description: tl('La levure mange le sucre et fabrique l\'alcool et les bulles. Chaque souche a sa température idéale.'),
    strain: true,
    knobs: [
      { key: 'fermentTemp', label: tl('Température'), min: 4, max: 36, step: 1, unit: '°C' },
      { key: 'fermentDays', label: tl('Durée'), min: 1, max: 30, step: 1, unit: 'j' },
    ],
    perks: [tl('5 L · précision 40 %'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 %'), tl('600 L · précision 100 %')],
    baseCost: 100,
  },
  conditioning: {
    id: 'conditioning', step: tl('Garde'), names: [tl('Bocal à bouchon'), tl('Dame-jeanne'), tl('Cuve de garde'), tl('Cuve de garde réfrigérée'), tl('Cuve de stase')],
    description: tl('La bière se repose et s\'affine. Au froid, elle devient limpide.'),
    knobs: [
      { key: 'gardeTemp', label: tl('Température'), min: 0, max: 20, step: 1, unit: '°C' },
      { key: 'gardeDays', label: tl('Durée'), min: 0, max: 30, step: 1, unit: 'j' },
    ],
    perks: [tl('5 L · précision 40 %'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 % · plus limpide'), tl('600 L · précision 100 % · limpidité parfaite')],
    baseCost: 90,
  },
  bottling: {
    id: 'bottling', step: tl('Embouteillage'), names: [tl('Entonnoir et pipette'), tl('Canne d\'embouteillage'), tl('Tireuse 4 becs'), tl('Ligne automatique'), tl('Ligne robotisée')],
    description: tl('On met en bouteille avec un peu de sucre : la levure le transforme en bulles.'),
    knobs: [{ key: 'priming', label: tl('Sucre'), min: 0, max: 16, step: 0.5, unit: 'g/L' }],
    perks: [tl('5 L · précision 40 % · oxydation'), tl('20 L · précision 65 %'), tl('60 L · précision 85 %'), tl('200 L · précision 95 % · sans oxydation'), tl('600 L · précision 100 %')],
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
