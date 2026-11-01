/** Souches de levure : chacune a sa plage de température idéale, son atténuation et sa production d'esters (fruité). */
export interface Strain {
  name: string;
  attenuation: number; // atténuation apparente de référence (0..1) pour un moût de fermentescibilité 0.75
  tempMin: number;
  tempMax: number;
  esterFactor: number; // fruité maximal produit en haut de plage (0..1)
  baseDays: number; // durée de fermentation primaire au milieu de la plage
}

export const STRAINS = {
  ale_us: { name: 'Ale américaine', attenuation: 0.77, tempMin: 16, tempMax: 22, esterFactor: 0.25, baseDays: 5 },
  ale_uk: { name: 'Ale anglaise', attenuation: 0.7, tempMin: 17, tempMax: 22, esterFactor: 0.55, baseDays: 5 },
  saison: { name: 'Saison', attenuation: 0.88, tempMin: 20, tempMax: 32, esterFactor: 0.8, baseDays: 7 },
  lager: { name: 'Lager', attenuation: 0.8, tempMin: 9, tempMax: 14, esterFactor: 0.1, baseDays: 10 },
} as const satisfies Record<string, Strain>;

export type StrainId = keyof typeof STRAINS;
/** Au-delà, la levure meurt à l'ensemencement : lot perdu. */
export const YEAST_DEATH_TEMP = 35;
