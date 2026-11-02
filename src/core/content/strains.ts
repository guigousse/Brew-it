/** Souches de levure : plage de température idéale, atténuation, fruité et tolérance à l'alcool. */
export interface Strain {
  name: string;
  description: string;
  attenuation: number; // atténuation apparente de référence (0..1) pour un moût de fermentescibilité 0.75
  tempMin: number;
  tempMax: number;
  esterFactor: number; // fruité maximal produit en haut de plage (0..1)
  baseDays: number; // durée de fermentation primaire au milieu de la plage
  /** Degré d'alcool au-delà duquel la levure abandonne (%). */
  tolerance: number;
  /** Garde minimale pour que les arômes de jeunesse (pomme verte, beurre) disparaissent (jours). */
  gardeNeeded: number;
}

export const STRAINS = {
  ale_us: { name: 'Ale américaine', description: 'Nette et neutre. À l\'aise entre 16 et 22 °C.', attenuation: 0.77, tempMin: 16, tempMax: 22, esterFactor: 0.25, baseDays: 5, tolerance: 11, gardeNeeded: 3 },
  ale_uk: { name: 'Ale anglaise', description: 'Ronde et fruitée. Aime 17 à 22 °C.', attenuation: 0.7, tempMin: 17, tempMax: 22, esterFactor: 0.55, baseDays: 5, tolerance: 9, gardeNeeded: 3 },
  saison: { name: 'Saison', description: 'Épicée, très sèche. Supporte la chaleur : 20 à 32 °C.', attenuation: 0.88, tempMin: 20, tempMax: 32, esterFactor: 0.8, baseDays: 7, tolerance: 12, gardeNeeded: 3 },
  lager: { name: 'Lager', description: 'Fraîche et limpide. Travaille au froid, 9 à 14 °C, et demande une longue garde.', attenuation: 0.8, tempMin: 9, tempMax: 14, esterFactor: 0.1, baseDays: 10, tolerance: 9, gardeNeeded: 14 },
} as const satisfies Record<string, Strain>;

export type StrainId = keyof typeof STRAINS;
/** Au-delà, la levure meurt à l'ensemencement : lot perdu. */
export const YEAST_DEATH_TEMP = 35;
