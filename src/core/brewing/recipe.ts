import type { StrainId } from '../content/strains';
import { STRAINS } from '../content/strains';
import { boil, ferment, mash } from './profile';

/**
 * Un brassin : la recette que le joueur compose une fois, nomme et sauvegarde.
 * Toute la ligne de production l'applique jusqu'à ce que le joueur en change (production en pause).
 */
export interface Recipe {
  id: number;
  name: string;
  grainKg: number;
  mashTemp: number;
  hopsItems: number;
  strain: StrainId;
  gardeDays: number;
}

export type RecipeChoices = Omit<Recipe, 'id' | 'name'>;

export const DEFAULT_CHOICES: RecipeChoices = { grainKg: 5, mashTemp: 66, hopsItems: 1, strain: 'ale_us', gardeDays: 3 };

/** Réglages fixes de la ligne (le joueur ne choisit que l'essentiel). */
export const FIXED = {
  waterL: 24, // eau d'empâtage fixe : la quantité de malt règle donc la force
  mashTimeMin: 60,
  boilTimeMin: 60,
  hopsGramsPerItem: 50,
};

export const fermentTempFor = (strain: StrainId) => (STRAINS[strain].tempMin + STRAINS[strain].tempMax) / 2;

export interface Prediction {
  abv: number;
  ibu: number;
  fruity: number;
  quality: number;
  /** Volume de bière obtenu par brassin (L). */
  liters: number;
}

/** Ce que donnera la recette (affiché pendant la création du brassin). */
export function predict(c: RecipeChoices): Prediction {
  const m = mash({ grainKg: c.grainKg, waterL: FIXED.waterL, mashTemp: c.mashTemp, mashTimeMin: FIXED.mashTimeMin });
  const b = boil({ og: m.og, volume: m.volume, hopsGrams: c.hopsItems * FIXED.hopsGramsPerItem, boilMin: FIXED.boilTimeMin });
  const f = ferment({ og: b.og, fermentability: m.fermentability, strain: c.strain, temp: fermentTempFor(c.strain), gardeDays: c.gardeDays });
  return { abv: f.abv, ibu: b.ibu, fruity: f.fruity, quality: m.quality * b.quality * f.quality, liters: b.volume * 0.95 };
}

/** Description courte du style obtenu, pour le joueur. */
export function styleLabel(p: Prediction): string {
  const strength = p.abv < 4.5 ? 'légère' : p.abv < 6 ? 'classique' : 'forte';
  const bitter = p.ibu < 25 ? 'douce' : p.ibu < 50 ? 'équilibrée' : 'très amère';
  const fruit = p.fruity > 0.45 ? ', fruitée' : '';
  return `Bière ${strength}, ${bitter}${fruit}`;
}
