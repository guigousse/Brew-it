import { ITEMS } from './items';
import { STRAINS } from './strains';

/** Métadonnées des curseurs de réglage exposés au joueur (l'UI se génère à partir de ceci). */
export type ParamMeta =
  | { kind: 'range'; label: string; min: number; max: number; step: number; unit: string }
  | { kind: 'select'; label: string; options: readonly { value: string; label: string }[] };

const opts = <T extends Record<string, { name: string }>>(o: T) =>
  Object.entries(o).map(([value, v]) => ({ value, label: v.name }));

export const PARAMS: Record<string, ParamMeta> = {
  // empâtage
  grainKg: { kind: 'range', label: 'Malt', min: 2, max: 15, step: 1, unit: 'kg' },
  waterL: { kind: 'range', label: 'Eau', min: 8, max: 50, step: 1, unit: 'L' },
  mashTemp: { kind: 'range', label: 'Température d\'empâtage', min: 58, max: 78, step: 0.5, unit: '°C' },
  mashTime: { kind: 'range', label: 'Durée d\'empâtage', min: 20, max: 120, step: 5, unit: 'min' },
  // ébullition
  volume: { kind: 'range', label: 'Volume par lot', min: 5, max: 50, step: 1, unit: 'L' },
  hopsItems: { kind: 'range', label: 'Houblon', min: 0, max: 8, step: 1, unit: '× 50 g' },
  boilTime: { kind: 'range', label: 'Durée d\'ébullition', min: 15, max: 120, step: 5, unit: 'min' },
  // fermentation
  strain: { kind: 'select', label: 'Souche de levure', options: opts(STRAINS) },
  temp: { kind: 'range', label: 'Température', min: 4, max: 35, step: 0.5, unit: '°C' },
  gardeDays: { kind: 'range', label: 'Temps de garde', min: 0, max: 30, step: 1, unit: 'j' },
  // transport / divers
  targetTemp: { kind: 'range', label: 'Consigne de sortie', min: 2, max: 40, step: 1, unit: '°C' },
  rate: { kind: 'range', label: 'Débit', min: 1, max: 10, step: 0.5, unit: 'L/s' },
  item: { kind: 'select', label: 'Produit livré', options: opts(ITEMS).filter((o) => !['crushed_malt', 'beer_bottle'].includes(o.value)) },
  interval: { kind: 'range', label: 'Intervalle', min: 0.5, max: 20, step: 0.5, unit: 's' },
  basePrice: { kind: 'range', label: 'Prix de base', min: 2, max: 12, step: 0.5, unit: '€' },
};
