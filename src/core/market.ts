import type { Tasting } from './brewing/model';
import { DRINKABLE_MIN } from './brewing/model';

/** Facteur de prix selon la qualité de la bière (de 0,6 à 1,4). */
export const qualityFactor = (t: Pick<Tasting, 'quality'>) => 0.6 + 0.8 * t.quality;

// ------------------------------------------------------------------ bar

export interface BarLevel {
  name: string;
  /** Clients par minute quand la marque est au sommet de sa popularité (10 % de ce chiffre au départ). */
  rate: number;
  /** Tireuses : un fût branché sur chacune. */
  taps: number;
  /** Places assises (décor). */
  seats: number;
  /** Multiplicateur du prix du verre. */
  priceMult: number;
  /** Prix pour atteindre ce niveau (0 pour le premier). */
  cost: number;
}

/**
 * Le bar sert des verres tirés des fûts branchés sur ses tireuses. Il commence petit et poussiéreux :
 * un client toutes les 10 minutes. L'affluence grandit avec la popularité de la marque et le niveau du bar.
 */
export const BAR: readonly BarLevel[] = [
  { name: 'Comptoir poussiéreux', rate: 1, taps: 1, seats: 2, priceMult: 1, cost: 0 },
  { name: 'Bistrot de quartier', rate: 1.5, taps: 2, seats: 4, priceMult: 1.15, cost: 400 },
  { name: 'Pub', rate: 3, taps: 3, seats: 7, priceMult: 1.3, cost: 6000 },
  { name: 'Taproom', rate: 5, taps: 5, seats: 10, priceMult: 1.5, cost: 120000 },
  { name: 'Bar du futur', rate: 10, taps: 8, seats: 12, priceMult: 1.8, cost: 1200000 },
];

/** Part de l'affluence maximale atteinte par une marque inconnue. */
export const BAR_BASE_SHARE = 0.1;
/** Prix de base d'un verre de 25 cl. */
export const GLASS_PRICE = 3;
/** Le bar sert tout ce qui est buvable. */
export const BAR_MIN_QUALITY = DRINKABLE_MIN;

/** Un verre : 25 cl. */
export const GLASS_L = 0.25;
/**
 * Taille des fûts que remplit la ligne, selon le volume des brassins (donc le matériel) :
 * 5 L au début, puis 10, 20, 30 et 50 L.
 */
export function kegLiters(batchLiters: number): number {
  const size = batchLiters >= 600 ? 50 : batchLiters >= 200 ? 30 : batchLiters >= 60 ? 20 : batchLiters >= 20 ? 10 : 5;
  return Math.min(size, batchLiters);
}
/** Verres dans un fût de cette taille. */
export const kegGlasses = (liters: number) => Math.round(liters / GLASS_L);
/** Place d'un fût plein au stockage, comptée en bouteilles de 33 cl (un fût de 5 L ≈ une caisse). */
export const kegSpace = (glasses: number) => Math.round((glasses * GLASS_L) / 0.33 * 0.8);

/** Bonus de clientèle par bière différente aux tireuses. */
export const VARIETY = 0.25;
export const variety = (beers: number) => (beers <= 0 ? 0 : 1 + VARIETY * (beers - 1));

/** Prix d'un verre servi au bar (la tendance le rend plus cher : +15 % par tendance suivie). */
export function glassPrice(level: number, t: Tasting, trends = 0): number {
  return GLASS_PRICE * qualityFactor(t) * (BAR[level - 1]?.priceMult ?? 1) * (1 + 0.15 * trends);
}

// ------------------------------------------------------------------ fêtes, publicité

/**
 * Fête au bar, le plus grand des événements : pendant 45 minutes, 60 fois plus de clients. Les fûts vides sont
 * rebranchés automatiquement avec ceux du stockage : il faut en avoir prévu d'avance. Le repos (6 h) vaut pour tous les événements.
 */
export const PARTY = { mult: 60, duration: 45 * 60, cooldown: 6 * 3600 } as const;
/** Prix de référence des événements (une soirée foot), selon le niveau du bar. */
export const PARTY_COST = [100, 1000, 10000, 80000, 600000] as const;

/**
 * Barman en renfort : pendant 8 h, il rebranche tout seul les fûts vides avec ceux du stockage (même pendant l'absence).
 * On le réembauche régulièrement ; on peut prolonger d'avance, jusqu'à 24 h. Prix selon le niveau du bar.
 */
export const BARMAN = { duration: 8 * 3600, maxAhead: 24 * 3600 } as const;
export const BARMAN_COST = [40, 300, 2500, 20000, 150000] as const;

/**
 * Objets à acheter au magasin pour débloquer les événements du bar, l'un après l'autre (chacun débloque le suivant).
 * Leur prix suit les agrandissements du bar : la cible vers le bistrot, la télé vers le pub, la boule à facettes vers la taproom.
 */
export type ShopItemId = 'disco' | 'darts' | 'tv';
export interface ShopItem {
  id: ShopItemId;
  name: string;
  text: string;
  cost: number;
}
export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'darts', name: 'Cible de fléchettes', text: 'Débloque le tournoi de fléchettes', cost: 300 },
  { id: 'tv', name: 'Télévision', text: 'Débloque la soirée foot', cost: 5000 },
  { id: 'disco', name: 'Boule à facettes', text: 'Débloque la fête : projecteurs et confettis', cost: 60000 },
];

/**
 * Événements au bar. Un seul à la fois, et un temps de repos entre deux (celui des fêtes).
 * Pendant un événement, les fûts vides sont rebranchés tout seuls avec ceux du stockage.
 * - mult : clients en plus ; priceMult : prix des verres ; popMult : vitesse à laquelle la gamme se fait connaître ;
 * - cost : multiple du prix d'une fête ; needs : l'objet à acheter d'abord.
 */
export type BarEventId = 'party' | 'foot' | 'darts';
export interface BarEvent {
  id: BarEventId;
  name: string;
  text: string;
  mult: number;
  duration: number;
  priceMult: number;
  popMult: number;
  cost: number;
  needs: ShopItemId | null;
}
export const BAR_EVENTS: readonly BarEvent[] = [
  { id: 'darts', name: 'Tournoi de fléchettes', text: '1 h : 15 fois plus de clients, et ta gamme se fait 3 fois plus vite connaître.', mult: 15, duration: 3600, priceMult: 1, popMult: 3, cost: 0.5, needs: 'darts' },
  { id: 'foot', name: 'Soirée foot', text: '1 h 30 de match : 20 fois plus de clients, et les verres 20 % plus chers.', mult: 20, duration: 90 * 60, priceMult: 1.2, popMult: 1, cost: 1, needs: 'tv' },
  { id: 'party', name: 'Fête', text: '45 min : 60 fois plus de clients, la salle est en délire.', mult: PARTY.mult, duration: PARTY.duration, priceMult: 1, popMult: 1.5, cost: 1.5, needs: 'disco' },
];
export const barEventById = (id: string) => BAR_EVENTS.find((e) => e.id === id);

/** Campagne de pub : la gamme gagne en popularité, et les commandes arrivent deux fois plus souvent pendant 6 h. */
export const AD = { pop: 0.1, duration: 6 * 3600, orderBoost: 2 } as const;
/** Prix d'une campagne selon le niveau de la brasserie. */
export const AD_COST = [150, 2500, 30000, 250000, 2000000] as const;
