import { tl } from '../i18n';

/**
 * Ouverture progressive : les applications de l'ordinateur apparaissent une à une, au fil de la progression, chacune
 * présentée par Gaston en une phrase. Au début, on ne voit que l'essentiel (tableau de bord, messages, commandes) ; le reste arrive
 * quand il devient utile. Une application ouverte le reste pour toujours.
 */
export type FeatureId = 'trends' | 'marketing' | 'contests' | 'partners';

/** Ce que le jeu sait de la partie pour décider (sans dépendre de toute la classe Game). */
export interface FeatureState {
  tutoDone: boolean;
  ordersDone: number;
  breweryLevel: number;
  beers: number;
  /** Le premier partenaire peut être signé. */
  partnerOpen: boolean;
}

export interface FeatureDef {
  id: FeatureId;
  /** Gaston la présente en une phrase. */
  intro: string;
  when: (s: FeatureState) => boolean;
}

export const FEATURES: readonly FeatureDef[] = [
  { id: 'trends', intro: tl('Gaston : « Les Tendances : ce que les gens veulent boire en ce moment. Suis-les, ta bière gagne en popularité. »'), when: (s) => s.breweryLevel >= 2 },
  { id: 'marketing', intro: tl('Gaston : « Le Marketing : une campagne de pub fait connaître toute ta gamme et fait venir les commandes. »'), when: (s) => s.breweryLevel >= 2 && s.beers >= 2 },
  { id: 'partners', intro: tl('Gaston : « Un club veut ta bière ! Les Partenariats écoulent de gros volumes, bien payés. »'), when: (s) => s.partnerOpen },
  { id: 'contests', intro: tl('Gaston : « Les Concours sont ouverts : une médaille fait vendre ta bière plus cher. »'), when: (s) => s.breweryLevel >= 3 },
];

export const featureById = (id: string) => FEATURES.find((f) => f.id === id);
