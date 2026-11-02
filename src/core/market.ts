import type { Tasting } from './brewing/model';
import { DRINKABLE_MIN } from './brewing/model';

/**
 * Clients : sous contrat, ils envoient ponctuellement des commandes (des missions) sur l'ordinateur du stockage.
 * On remplit une commande avec les bières du stock qui conviennent, on l'envoie, et on est payé aussitôt.
 */
export interface Client {
  id: string;
  name: string;
  description: string;
  /** Débit de référence (bouteilles par minute de jeu) : fixe la taille de ses commandes. */
  rate: number;
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
  /** Préférence de style : certaines commandes l'exigent, et paient mieux. */
  likes?: { label: string; test: (t: Tasting) => boolean };
}

export const CLIENTS: readonly Client[] = [
  { id: 'epicerie', name: 'Épicerie fine', description: 'Veut des bières bien faites, paie bien.', level: 1, rate: 2, price: 3.6, minQuality: 0.55, unlockSold: 40, fee: 150 },
  {
    id: 'caviste', name: 'Caviste', description: 'Amateur de houblon : adore les bières aromatiques.', level: 2, rate: 4, price: 5, minQuality: 0.7, unlockSold: 6000, fee: 25000,
    likes: { label: 'Bières très aromatiques', test: (t) => t.aroma >= 0.5 },
  },
  {
    id: 'restaurant', name: 'Restaurant', description: 'Cherche des bières limpides et légères pour accompagner les plats.', level: 3, rate: 8, price: 4.2, minQuality: 0.6, unlockSold: 50000, fee: 120000,
    likes: { label: 'Bières limpides et légères', test: (t) => t.clarity >= 0.75 && t.abv <= 5.5 },
  },
  {
    id: 'festival', name: 'Festival', description: 'Des milliers de festivaliers assoiffés : ils aiment ce qui tape.', level: 3, rate: 18, price: 3.2, minQuality: 0.45, unlockSold: 120000, fee: 350000,
    likes: { label: 'Bières fortes', test: (t) => t.abv >= 6.5 },
  },
  { id: 'supermarche', name: 'Supermarché', description: 'Énormes volumes, petits prix.', level: 4, rate: 45, price: 2.2, minQuality: 0.45, unlockSold: 500000, fee: 900000 },
  {
    id: 'export', name: 'Export', description: 'Clients étrangers exigeants : qualité irréprochable, conteneurs entiers.', level: 5, rate: 110, price: 3.6, minQuality: 0.8, unlockSold: 2000000, fee: 3000000,
    likes: { label: 'Bières excellentes', test: (t) => t.quality >= 0.9 },
  },
];

// ------------------------------------------------------------------ commandes

/** Une commande couvre ce nombre de minutes du débit du client. */
export const ORDER_MINUTES = 45;
/** Délai moyen (s de jeu) entre deux commandes d'un même client. */
export const ORDER_GAP_S = 6 * 60;
/** Commandes en attente au plus par client (elles s'accumulent pendant l'absence). */
export const MAX_PENDING = 3;
/** Durée de validité d'une commande (s de jeu). */
export const ORDER_LIFE_S = 4 * 3600;
/** Une commande paie mieux que le bar : c'est une livraison groupée. */
export const ORDER_PREMIUM = 1.4;
/** Bonus d'une commande qui exige le style préféré du client. */
export const LIKE_BONUS = 1.3;
/** Part des commandes qui exigent le style préféré (pour les clients qui en ont un). */
export const LIKE_CHANCE = 0.4;

/** Négociation des contrats : chaque niveau agrandit les commandes de 40 % et améliore le prix de 10 %. */
export const MAX_DEAL = 5;
export const DEAL_BONUS = 0.4;
export const DEAL_PRICE = 0.1;
const DEAL_COST = [0.25, 0.5, 0.9, 1.5, 2.5] as const;
/** Prix pour négocier le niveau suivant du contrat (à partir de `level`). */
export function dealCost(c: Client, level: number): number | null {
  const m = DEAL_COST[level];
  return m == null ? null : Math.round(Math.max(150, c.fee) * m);
}

/** Facteur de prix selon la qualité de la bière (de 0,6 à 1,4). */
export const qualityFactor = (t: Pick<Tasting, 'quality'>) => 0.6 + 0.8 * t.quality;

/** La bière convient-elle à la commande (qualité minimale, style exigé) ? */
export function suits(c: Client, t: Tasting, wantsLike: boolean): boolean {
  if (t.quality < c.minQuality) return false;
  return !wantsLike || !!c.likes?.test(t);
}

// ------------------------------------------------------------------ bar

export interface BarLevel {
  name: string;
  /** Bouteilles servies par minute avec une seule bière à la carte. */
  rate: number;
  /** Bières à la carte au plus (tireuses). */
  taps: number;
  /** Places assises (décor). */
  seats: number;
  /** Multiplicateur du prix de vente. */
  priceMult: number;
  /** Prix pour atteindre ce niveau (0 pour le premier). */
  cost: number;
}

/** Le bar vend en continu, même appli fermée. Il commence petit et poussiéreux. */
export const BAR: readonly BarLevel[] = [
  { name: 'Comptoir poussiéreux', rate: 1, taps: 1, seats: 2, priceMult: 1, cost: 0 },
  { name: 'Bistrot de quartier', rate: 5, taps: 2, seats: 4, priceMult: 1.15, cost: 400 },
  { name: 'Pub', rate: 20, taps: 3, seats: 7, priceMult: 1.3, cost: 6000 },
  { name: 'Taproom', rate: 90, taps: 5, seats: 10, priceMult: 1.5, cost: 120000 },
  { name: 'Bar du futur', rate: 450, taps: 8, seats: 12, priceMult: 1.8, cost: 1200000 },
];

/** Prix de base d'une bouteille servie au bar. */
export const BAR_PRICE = 2.5;
/** Le bar sert tout ce qui est buvable. */
export const BAR_MIN_QUALITY = DRINKABLE_MIN;

/** Bonus de clientèle par bière supplémentaire à la carte. */
export const VARIETY = 0.25;
export const variety = (beers: number) => (beers <= 0 ? 0 : 1 + VARIETY * (beers - 1));

/** Prix d'une bouteille servie au bar. */
export function barPrice(level: number, t: Tasting): number {
  return BAR_PRICE * qualityFactor(t) * (BAR[level - 1]?.priceMult ?? 1);
}
