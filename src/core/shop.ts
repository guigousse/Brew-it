/**
 * Ce qui s'achète en dehors des améliorations : les boosts (temporaires), le personnel (contrats de 8 h),
 * le mobilier du bar (définitif) et les déblocages de l'éditeur d'étiquettes (définitifs).
 * Données pures : les effets sont appliqués par la partie (game.ts).
 */
import type { StationId } from './stations';

// ------------------------------------------------------------------ boosts

/** Un boost occupe un « canal » : un seul boost actif par canal, que l'on peut prolonger. */
export type BoostChannel = 'brew' | 'yeast' | 'bar' | 'wholesale';
export type BoostGroup = 'brew' | 'bar' | 'general';
export type BoostId = 'rush' | 'cadence' | 'fullSpeed' | 'nightShift' | 'yeast' | 'happyHour' | 'buzz' | 'ad' | 'prospect' | 'broker';

export interface BoostDef {
  id: BoostId;
  group: BoostGroup;
  /** Canal occupé (aucun : effet immédiat ou géré à part, comme la campagne de pub). */
  channel?: BoostChannel;
  name: string;
  text: string;
  /** Multiplicateur (cadence des machines, clients au bar, prix du grossiste). */
  mult: number;
  minutes: number;
  /** Prix des verres pendant le boost (happy hour). */
  priceMult?: number;
}

export const BOOST_GROUPS: readonly { id: BoostGroup; name: string; text: string }[] = [
  { id: 'brew', name: 'Brasserie', text: 'Les machines tournent plus vite. Le temps du jeu, lui, ne change pas.' },
  { id: 'bar', name: 'Bar', text: 'Plus de monde au comptoir.' },
  { id: 'general', name: 'Généraux', text: 'Commandes, réputation et grossiste.' },
];

export const BOOSTS: readonly BoostDef[] = [
  { id: 'rush', group: 'brew', channel: 'brew', name: 'Coup de feu', text: 'Toutes les machines ×2 pendant 15 min.', mult: 2, minutes: 15 },
  { id: 'cadence', group: 'brew', channel: 'brew', name: 'Cadence ×2', text: 'Toutes les machines ×2 pendant 1 h.', mult: 2, minutes: 60 },
  { id: 'fullSpeed', group: 'brew', channel: 'brew', name: 'Plein régime', text: 'Toutes les machines ×3 pendant 30 min.', mult: 3, minutes: 30 },
  { id: 'nightShift', group: 'brew', channel: 'brew', name: 'Équipe de nuit', text: 'Toutes les machines ×2 pendant 4 h : idéal avant de partir.', mult: 2, minutes: 240 },
  { id: 'yeast', group: 'brew', channel: 'yeast', name: 'Levure express', text: 'Fermentation et garde ×3 pendant 1 h : là où les brassins attendent le plus.', mult: 3, minutes: 60 },
  { id: 'happyHour', group: 'bar', channel: 'bar', name: 'Happy hour', text: 'Deux fois plus de clients pendant 1 h, mais les verres 20 % moins chers : de quoi écouler des fûts.', mult: 2, minutes: 60, priceMult: 0.8 },
  { id: 'buzz', group: 'bar', channel: 'bar', name: 'Bouche-à-oreille', text: '50 % de clients en plus pendant 4 h.', mult: 1.5, minutes: 240 },
  { id: 'ad', group: 'general', name: 'Campagne de pub', text: 'Toute la gamme gagne en popularité, et les commandes arrivent deux fois plus souvent pendant 6 h.', mult: 2, minutes: 360 },
  { id: 'prospect', group: 'general', name: 'Prospection', text: 'Une nouvelle commande arrive tout de suite (s\'il reste une place au tableau).', mult: 1, minutes: 0 },
  { id: 'broker', group: 'general', channel: 'wholesale', name: 'Grossiste généreux', text: 'Le grossiste paie 50 % de plus pendant 2 h.', mult: 1.5, minutes: 120 },
];
export const boostById = (id: string) => BOOSTS.find((b) => b.id === id);

/** Un boost se prolonge jusqu'à 24 h d'avance. */
export const BOOST_MAX_AHEAD = 24 * 3600;
/** Part de ce que rapporte un boost qu'il coûte : toujours rentable, si l'on écoule ce qu'il produit. */
export const BOOST_PRICE_SHARE = 0.4;
/** Prix plancher d'un boost, selon le niveau de la brasserie. */
export const BOOST_MIN_COST = [15, 60, 400, 2500, 15000] as const;

/** Arrondi « commercial » : deux chiffres significatifs. */
export function nicePrice(v: number): number {
  if (v < 10) return Math.max(1, Math.round(v));
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

/** Machines accélérées par chaque canal de brasserie. */
export const YEAST_STAGES: readonly StationId[] = ['fermenter', 'conditioning'];

// ------------------------------------------------------------------ personnel

export type StaffId = 'barman' | 'courier' | 'apprentice';
export interface StaffDef {
  id: StaffId;
  name: string;
  role: string;
  text: string;
}
export const STAFF: readonly StaffDef[] = [
  { id: 'barman', name: 'Barman', role: 'Au bar', text: 'Rebranche les fûts vides avec ceux du stockage, même pendant ton absence.' },
  { id: 'courier', name: 'Livreur', role: 'Aux commandes', text: 'Envoie les commandes que ton stock peut remplir, même pendant ton absence.' },
  { id: 'apprentice', name: 'Apprenti brasseur', role: 'À l\'atelier', text: 'Quand la file est vide, il reprogramme ton dernier brassin : la brasserie ne s\'arrête pas.' },
];
export const staffById = (id: string) => STAFF.find((s) => s.id === id);
/** Un contrat dure 8 h, et se prolonge jusqu'à 24 h d'avance. */
export const STAFF_CONTRACT = { duration: 8 * 3600, maxAhead: 24 * 3600 } as const;
/** Postes de personnel, selon le niveau de la brasserie. */
export const STAFF_SLOTS = [1, 1, 2, 2, 3] as const;
/** Prix d'un contrat selon le niveau de la brasserie (le barman, lui, suit le niveau du bar). */
export const COURIER_COST = [40, 250, 1500, 8000, 30000] as const;
export const APPRENTICE_COST = [30, 200, 1200, 6000, 25000] as const;
/** Le livreur passe toutes les 30 s de jeu ; l'apprenti vérifie la file toutes les 5 s. */
export const COURIER_ROUND_S = 30;
export const APPRENTICE_CHECK_S = 5;

// ------------------------------------------------------------------ mobilier du bar

export type FurnitureId = 'plants' | 'posters' | 'neon' | 'benches' | 'jukebox';
export interface FurnitureDef {
  id: FurnitureId;
  name: string;
  text: string;
  cost: number;
  /** Clients en plus, prix des verres, vitesse à laquelle la gamme se fait connaître au bar. */
  clients?: number;
  price?: number;
  pop?: number;
  /** Places en plus. */
  seats?: number;
}
/** Le mobilier se débloque l'un après l'autre ; chaque meuble s'accorde au style du bar, à tous ses niveaux. */
export const FURNITURE: readonly FurnitureDef[] = [
  { id: 'plants', name: 'Plantes vertes', text: 'Au bout du comptoir. Ta gamme se fait connaître 20 % plus vite au bar.', cost: 400, pop: 1.2 },
  { id: 'posters', name: 'Affiches encadrées', text: 'Au mur. 5 % de clients en plus.', cost: 2500, clients: 1.05 },
  { id: 'neon', name: 'Enseigne lumineuse', text: 'Elle attire les passants : 15 % de clients en plus.', cost: 12000, clients: 1.15 },
  { id: 'benches', name: 'Banquettes', text: 'Deux places de plus, et 10 % de clients en plus.', cost: 50000, clients: 1.1, seats: 2 },
  { id: 'jukebox', name: 'Juke-box', text: 'Les clients s\'attardent : les verres se vendent 10 % plus cher.', cost: 200000, price: 1.1 },
];
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);

// ------------------------------------------------------------------ étiquettes

export type UnlockKind = 'bottle' | 'shape' | 'emblem' | 'pattern';
export interface LabelUnlock {
  /** `${kind}:${value}` */
  id: string;
  kind: UnlockKind;
  value: string;
  name: string;
  cost: number;
}
export const UNLOCK_KINDS: readonly { id: UnlockKind; name: string }[] = [
  { id: 'bottle', name: 'Bouteilles' },
  { id: 'shape', name: 'Formes' },
  { id: 'emblem', name: 'Logos' },
  { id: 'pattern', name: 'Motifs' },
];
const u = (kind: UnlockKind, value: string, name: string, cost: number): LabelUnlock => ({ id: `${kind}:${value}`, kind, value, name, cost });
/** Tout ce que l'éditeur d'étiquettes peut gagner : formes de bouteille, d'étiquette, logos et motifs. */
export const LABEL_UNLOCKS: readonly LabelUnlock[] = [
  u('bottle', 'longneck', 'Long col', 800),
  u('bottle', 'stubby', 'Trapue', 4000),
  u('bottle', 'swing', 'Bouchon mécanique', 20000),
  u('bottle', 'champagne', 'Champenoise', 100000),
  u('shape', 'round', 'Arrondie', 500),
  u('shape', 'arch', 'Arche', 3000),
  u('shape', 'notched', 'Coins coupés', 15000),
  u('emblem', 'leaf', 'Feuille', 300),
  u('emblem', 'bee', 'Abeille', 1500),
  u('emblem', 'sun', 'Soleil', 6000),
  u('emblem', 'fish', 'Poisson', 25000),
  u('emblem', 'castle', 'Château', 80000),
  u('emblem', 'skull', 'Crâne', 250000),
  u('pattern', 'zigzag', 'Zigzag', 400),
  u('pattern', 'scales', 'Écailles', 2500),
  u('pattern', 'herringbone', 'Chevrons', 12000),
  u('pattern', 'tartan', 'Tartan', 60000),
];
export const unlockById = (id: string) => LABEL_UNLOCKS.find((x) => x.id === id);
/** Ce qui est libre dès le début est tout ce qui n'est pas dans la liste des déblocages. */
export const isLockable = (kind: UnlockKind, value: string) => LABEL_UNLOCKS.some((x) => x.kind === kind && x.value === value);
