import type { Tasting } from './brewing/model';
import { DRINKABLE_MIN } from './brewing/model';

/** Distributeurs : chacun achète en continu les bières de ta gamme qui lui plaisent. */
export interface Distributor {
  id: string;
  name: string;
  description: string;
  /** Bouteilles achetées par minute de jeu. */
  rate: number;
  /** Prix de base d'une bouteille (avant qualité). */
  price: number;
  /** Qualité minimale acceptée. */
  minQuality: number;
  /** Bouteilles vendues au total pour pouvoir le signer. */
  unlockSold: number;
  /** Prix de la signature du contrat. */
  fee: number;
  /** Préférence de style (bonus de prix), en texte et en règle. */
  likes?: { label: string; test: (t: Tasting) => boolean };
}

export const DISTRIBUTORS: readonly Distributor[] = [
  { id: 'bar', name: 'Bar du coin', description: 'Le bistrot du quartier : prend tout ce qui est buvable.', rate: 12, price: 2.5, minQuality: DRINKABLE_MIN, unlockSold: 0, fee: 0 },
  {
    id: 'epicerie', name: 'Épicerie fine', description: 'Veut des bières bien faites, paie mieux.', rate: 10, price: 3.6, minQuality: 0.55, unlockSold: 150, fee: 300,
  },
  {
    id: 'caviste', name: 'Caviste', description: 'Amateur de houblon : adore les bières aromatiques.', rate: 8, price: 5, minQuality: 0.7, unlockSold: 500, fee: 1200,
    likes: { label: 'Bières très aromatiques', test: (t) => t.aroma >= 0.5 },
  },
  {
    id: 'restaurant', name: 'Restaurant', description: 'Cherche des bières limpides et légères pour accompagner les plats.', rate: 18, price: 4, minQuality: 0.6, unlockSold: 1500, fee: 2500,
    likes: { label: 'Bières limpides et légères', test: (t) => t.clarity >= 0.75 && t.abv <= 5.5 },
  },
  { id: 'supermarche', name: 'Supermarché', description: 'Énormes volumes, petits prix.', rate: 90, price: 1.8, minQuality: 0.45, unlockSold: 4000, fee: 6000 },
  {
    id: 'export', name: 'Export', description: 'Clients étrangers exigeants : qualité irréprochable.', rate: 150, price: 3.4, minQuality: 0.8, unlockSold: 15000, fee: 20000,
    likes: { label: 'Bières fortes et excellentes', test: (t) => t.abv >= 6.5 && t.quality >= 0.85 },
  },
];

/** Prix payé par un distributeur pour une bouteille de cette bière. */
export function bottlePrice(d: Distributor, t: Tasting): number {
  const like = d.likes?.test(t) ? 1.3 : 1;
  return d.price * (0.6 + 0.8 * t.quality) * like;
}
