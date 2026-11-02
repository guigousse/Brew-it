import type { StrainId } from '../content/strains';
import { boil, ferment, mash, qualityFrom, type Defect } from './profile';

/**
 * Un brassin : la recette que le joueur règle avec les molettes, nomme et sauvegarde.
 * Un nouveau brassin passe d'abord par une fournée d'essai et une dégustation avant la production.
 */
export interface RecipeChoices {
  /** Malt par lot de 25 L (kg). */
  grainKg: number;
  mashTemp: number;
  mashTime: number;
  /** Houblon par lot de 25 L (g). */
  hopsGrams: number;
  boilTime: number;
  strain: StrainId;
  fermentTemp: number;
  gardeDays: number;
}

export interface Tasting {
  abv: number;
  ibu: number;
  og: number;
  fruity: number;
  quality: number;
  defects: Defect[];
}

export interface Recipe extends RecipeChoices {
  id: number;
  name: string;
  /** 'test' : fournée d'essai à faire / en cours ; 'validated' : production autorisée. */
  status: 'test' | 'validated';
  /** La fournée d'essai a été lancée (une seule à la fois). */
  testStarted?: boolean;
  tasting?: Tasting;
}

/** La recette de Gaston, imposée pendant le tutoriel : une blonde simple et réussie. */
export const GASTON_RECIPE: RecipeChoices = {
  grainKg: 5, mashTemp: 66, mashTime: 60, hopsGrams: 30, boilTime: 60, strain: 'ale_us', fermentTemp: 19, gardeDays: 3,
};
export const DEFAULT_CHOICES = GASTON_RECIPE;

/** Réglages fixes de la ligne. */
export const FIXED = {
  waterL: 24, // eau d'empâtage pour un lot de 25 L
  hopsGramsPerItem: 10,
};

/** Bornes des molettes. */
export const RANGES: Record<Exclude<keyof RecipeChoices, 'strain'>, { min: number; max: number; step: number; unit: string; label: string }> = {
  grainKg: { min: 1, max: 10, step: 0.5, unit: 'kg', label: 'Malt' },
  mashTemp: { min: 45, max: 85, step: 1, unit: '°C', label: 'Température' },
  mashTime: { min: 10, max: 120, step: 5, unit: 'min', label: 'Durée' },
  hopsGrams: { min: 0, max: 300, step: 5, unit: 'g', label: 'Houblon' },
  boilTime: { min: 5, max: 120, step: 5, unit: 'min', label: 'Durée' },
  fermentTemp: { min: 4, max: 36, step: 1, unit: '°C', label: 'Température' },
  gardeDays: { min: 0, max: 30, step: 1, unit: 'j', label: 'Garde' },
};

/** Simulation complète d'un lot (sert aux tests ; le jeu, lui, ne montre jamais de prévision). */
export function simulate(c: RecipeChoices): Tasting {
  const m = mash({ grainKg: c.grainKg, waterL: FIXED.waterL, mashTemp: c.mashTemp, mashTimeMin: c.mashTime });
  const b = boil({ og: m.og, volume: m.volume, hopsGrams: c.hopsGrams, boilMin: c.boilTime });
  const f = ferment({ og: b.og, fermentability: m.fermentability, ibu: b.ibu, strain: c.strain, temp: c.fermentTemp, gardeDays: c.gardeDays });
  const defects = [...m.defects, ...b.defects, ...f.defects];
  return { abv: f.abv, ibu: b.ibu, og: b.og, fruity: f.fruity, quality: qualityFrom(defects), defects };
}
