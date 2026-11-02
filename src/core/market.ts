import type { Tasting } from './brewing/model';
import { DRINKABLE_MIN } from './brewing/model';

/** Distributeurs : chacun achète en continu les bières de ta gamme qui lui plaisent. */
export interface Distributor {
  id: string;
  name: string;
  description: string;
  /** Bouteilles achetées par minute de jeu (pour une seule bière qui lui plaît). */
  rate: number;
  /** Taille d'une commande : il faut ce nombre de bouteilles d'une même bière en stock pour qu'elle parte. */
  order: number;
  /** Prix de base d'une bouteille (avant qualité). */
  price: number;
  /** Qualité minimale acceptée. */
  minQuality: number;
  /** Niveau de brasserie nécessaire (tous les appareils à ce niveau au moins). */
  level: number;
  /** Bouteilles vendues au total pour pouvoir le signer. */
  unlockSold: number;
  /** Prix de la signature du contrat. */
  fee: number;
  /** Préférence de style (bonus de prix), en texte et en règle. */
  likes?: { label: string; test: (t: Tasting) => boolean };
}

export const DISTRIBUTORS: readonly Distributor[] = [
  { id: 'bar', name: 'Bar du coin', description: 'Le bistrot du quartier : prend tout ce qui est buvable, bouteille par bouteille.', level: 1, rate: 1, order: 1, price: 2.5, minQuality: DRINKABLE_MIN, unlockSold: 0, fee: 0 },
  { id: 'epicerie', name: 'Épicerie fine', description: 'Veut des bières bien faites, paie mieux. Commande par demi-caisse.', level: 1, rate: 2, order: 6, price: 3.6, minQuality: 0.55, unlockSold: 60, fee: 200 },
  {
    id: 'caviste', name: 'Caviste', description: 'Amateur de houblon : adore les bières aromatiques. Commande par caisse.', level: 2, rate: 4, order: 12, price: 5, minQuality: 0.7, unlockSold: 8000, fee: 25000,
    likes: { label: 'Bières très aromatiques', test: (t) => t.aroma >= 0.5 },
  },
  {
    id: 'restaurant', name: 'Restaurant', description: 'Cherche des bières limpides et légères pour accompagner les plats.', level: 3, rate: 8, order: 24, price: 4.2, minQuality: 0.6, unlockSold: 60000, fee: 120000,
    likes: { label: 'Bières limpides et légères', test: (t) => t.clarity >= 0.75 && t.abv <= 5.5 },
  },
  {
    id: 'festival', name: 'Festival', description: 'Des milliers de festivaliers assoiffés : ils aiment ce qui tape.', level: 3, rate: 18, order: 60, price: 3.2, minQuality: 0.45, unlockSold: 150000, fee: 350000,
    likes: { label: 'Bières fortes', test: (t) => t.abv >= 6.5 },
  },
  { id: 'supermarche', name: 'Supermarché', description: 'Énormes volumes, petits prix. Commande par palette de 240.', level: 4, rate: 45, order: 240, price: 2.2, minQuality: 0.45, unlockSold: 600000, fee: 900000 },
  {
    id: 'export', name: 'Export', description: 'Clients étrangers exigeants : qualité irréprochable, conteneurs de 480 bouteilles.', level: 5, rate: 110, order: 480, price: 3.6, minQuality: 0.8, unlockSold: 2500000, fee: 4000000,
    likes: { label: 'Bières excellentes', test: (t) => t.quality >= 0.9 },
  },
];

/** Négociation des contrats : chaque niveau augmente les commandes de 40 %. */
export const MAX_DEAL = 5;
export const DEAL_BONUS = 0.4;
const DEAL_COST = [0.25, 0.5, 0.9, 1.5, 2.5] as const;
/** Prix pour négocier le niveau suivant du contrat (à partir de `level`). */
export function dealCost(d: Distributor, level: number): number | null {
  const m = DEAL_COST[level];
  return m == null ? null : Math.round(Math.max(150, d.fee) * m);
}

/** Bonus de commandes par bière supplémentaire de la gamme qui plaît au distributeur. */
export const VARIETY = 0.25;
export const variety = (beers: number) => (beers <= 0 ? 0 : 1 + VARIETY * (beers - 1));

/** Prix payé par un distributeur pour une bouteille de cette bière. */
export function bottlePrice(d: Distributor, t: Tasting): number {
  const like = d.likes?.test(t) ? 1.3 : 1;
  return d.price * (0.6 + 0.8 * t.quality) * like;
}
