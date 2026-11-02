import { GASTON_RECIPE, type Recipe } from '../src/core/brewing/model';

/** Recettes que le joueur simulé met dans sa gamme, dans l'ordre. */
export const BOT_RECIPES: Recipe[] = [
  GASTON_RECIPE,
  { ...GASTON_RECIPE, grainKg: 6, hopsBitter: 55, hopsAroma: 90 }, // IPA
  { ...GASTON_RECIPE, grainKg: 3.5, hopsBitter: 15, hopsAroma: 5, strain: 'lager', pitchTemp: 11, fermentTemp: 11, fermentDays: 12, gardeTemp: 1, gardeDays: 15 }, // lager
  { ...GASTON_RECIPE, grainKg: 7, hopsBitter: 45, hopsAroma: 20, strain: 'ale_us', fermentDays: 8, gardeDays: 6, mashTemp: 64 }, // forte
  { ...GASTON_RECIPE, strain: 'saison', fermentTemp: 26, pitchTemp: 22, fermentDays: 8 },
  { ...GASTON_RECIPE, grainKg: 5, hopsBitter: 40, hopsAroma: 30 }, // pale ale
  { ...GASTON_RECIPE, grainKg: 3, hopsBitter: 15, hopsAroma: 15 }, // session
  { ...GASTON_RECIPE, strain: 'ale_uk', fermentTemp: 20, grainKg: 5 }, // ale fruitée
];
