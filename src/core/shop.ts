/**
 * Ce qui s'achète en dehors des améliorations : les boosts (temporaires), le personnel (contrats de 8 h),
 * le mobilier du bar (définitif) et les déblocages de l'éditeur d'étiquettes (définitifs).
 * Données pures : les effets sont appliqués par la partie (game.ts).
 */
import type { StationId } from './stations';
import { tl } from '../i18n';

// ------------------------------------------------------------------ diamants (monnaie premium)

/**
 * Les diamants bleus : la monnaie premium. Ils paient les boosts et quelques cosmétiques d'étiquette.
 * On en gagne en jouant (au départ, à chaque commande livrée selon sa difficulté, à chaque niveau de la brasserie) ;
 * l'achat avec de l'argent réel viendra plus tard.
 */
export const GEMS = {
  start: 25,
  /** En atteignant chaque niveau de la brasserie (indice = niveau atteint). */
  breweryLevel: [0, 0, 15, 25, 40, 60] as readonly number[],
} as const;

// ------------------------------------------------------------------ boutique de diamants

/**
 * Packs de diamants, achetés avec de l'argent réel (App Store). Environ 100 diamants par euro : un jour de partie
 * gagné vaut environ 200 diamants (voir BALANCE.md, « Économie des diamants »). Les prix affichés viennent de l'App
 * Store (dans la devise du joueur) ; `price` n'est qu'une valeur de repli. Le pack de démarrage ne s'achète qu'une fois.
 */
export type GemPackId = 'starter' | 'handful' | 'purse' | 'chest' | 'trunk';
export interface GemPack {
  id: GemPackId;
  /** Identifiant du produit consommable dans App Store Connect. */
  productId: string;
  name: string;
  gems: number;
  price: string;
  /** Une seule fois par partie. */
  once?: boolean;
  /** Ruban affiché sur la carte. */
  tag?: string;
}
export const GEM_PACKS: readonly GemPack[] = [
  { id: 'starter', productId: 'com.guigousse.brewit.gems.starter', name: tl('Pack de démarrage'), gems: 500, price: '1,99 €', once: true, tag: tl('Une seule fois') },
  { id: 'handful', productId: 'com.guigousse.brewit.gems.80', name: tl('Poignée de diamants'), gems: 80, price: '0,99 €' },
  { id: 'purse', productId: 'com.guigousse.brewit.gems.450', name: tl('Bourse de diamants'), gems: 450, price: '4,99 €' },
  { id: 'chest', productId: 'com.guigousse.brewit.gems.1000', name: tl('Coffre de diamants'), gems: 1000, price: '9,99 €', tag: tl('Populaire') },
  { id: 'trunk', productId: 'com.guigousse.brewit.gems.2200', name: tl('Malle de diamants'), gems: 2200, price: '19,99 €', tag: tl('Meilleure affaire') },
];
export const gemPackById = (id: string) => GEM_PACKS.find((p) => p.id === id);
export const gemPackByProduct = (productId: string) => GEM_PACKS.find((p) => p.productId === productId);

// ------------------------------------------------------------------ boosts

/** Un boost occupe un « poste » : un seul effet actif par poste, que l'on peut prolonger. */
export type BoostChannel = 'brew' | 'yeast' | 'bar' | 'wholesale';
export type BoostId = 'rush' | 'cadence' | 'fullSpeed' | 'nightShift' | 'yeast' | 'happyHour' | 'buzz' | 'prospect' | 'broker' | 'openGate';

export interface BoostDef {
  id: BoostId;
  /** Poste occupé (aucun : effet immédiat, comme la prospection). */
  channel?: BoostChannel;
  name: string;
  text: string;
  /** Multiplicateur (cadence des machines, clients au bar, prix du grossiste). */
  mult: number;
  minutes: number;
  /** Prix des verres pendant le boost (happy hour). */
  priceMult?: number;
  /** Prix en diamants : fixe, et dégressif avec la durée (quatre fois 15 min coûtent plus qu'une heure). */
  gems: number;
}

/** Les postes, dans l'ordre du magasin ; « null » réunit les coups ponctuels. */
export const BOOST_POSTS: readonly { id: BoostChannel | null; name: string; text: string }[] = [
  { id: 'brew', name: tl('Machines'), text: tl('Toutes les machines tournent plus vite. Le temps du jeu, lui, ne change pas.') },
  { id: 'yeast', name: tl('Fermentation'), text: tl('Fermentation et garde : là où les brassins attendent le plus.') },
  { id: 'bar', name: tl('Clients du bar'), text: tl('Plus de monde au comptoir.') },
  { id: 'wholesale', name: tl('Grossiste'), text: tl('Le grossiste paie plus cher, ou garde son plein prix toute la journée.') },
  { id: null, name: tl('Coups ponctuels'), text: tl('Un effet immédiat.') },
];

export const BOOSTS: readonly BoostDef[] = [
  { id: 'rush', channel: 'brew', name: tl('Coup de feu'), text: tl('Machines 2× plus vite · 30 min'), mult: 2, minutes: 30, gems: 3 },
  { id: 'cadence', channel: 'brew', name: tl('Cadence ×2'), text: tl('Machines 2× plus vite · 2 h'), mult: 2, minutes: 120, gems: 10 },
  { id: 'nightShift', channel: 'brew', name: tl('Équipe de nuit'), text: tl('Machines 2× plus vite · 8 h'), mult: 2, minutes: 480, gems: 30 },
  { id: 'fullSpeed', channel: 'brew', name: tl('Plein régime'), text: tl('Machines 3× plus vite · 1 h'), mult: 3, minutes: 60, gems: 12 },
  { id: 'yeast', channel: 'yeast', name: tl('Levure express'), text: tl('Cuves 3× plus vite · 2 h'), mult: 3, minutes: 120, gems: 8 },
  { id: 'happyHour', channel: 'bar', name: tl('Happy hour'), text: tl('Clients ×2, verres −20 % · 2 h'), mult: 2, minutes: 120, priceMult: 0.8, gems: 6 },
  { id: 'buzz', channel: 'bar', name: tl('Bouche-à-oreille'), text: tl('50 % de clients en plus · 8 h'), mult: 1.5, minutes: 480, gems: 15 },
  { id: 'broker', channel: 'wholesale', name: tl('Grossiste généreux'), text: tl('Le grossiste paie +50 % · 4 h'), mult: 1.5, minutes: 240, gems: 8 },
  { id: 'openGate', channel: 'wholesale', name: tl('Grossiste au prix fort'), text: tl('Le grossiste paie plein prix toute la journée · 4 h'), mult: 1, minutes: 240, gems: 50 },
  { id: 'prospect', name: tl('Prospection'), text: tl('Une commande arrive tout de suite'), mult: 1, minutes: 0, gems: 3 },
];
export const boostById = (id: string) => BOOSTS.find((b) => b.id === id);

/** Deux boosts au même effet (même poste, même multiplicateur) se prolongent l'un l'autre. */
export const sameEffect = (a: BoostDef, b: BoostDef) => a.channel === b.channel && a.mult === b.mult && (a.priceMult ?? 1) === (b.priceMult ?? 1);

/** Un boost se prolonge jusqu'à 24 h d'avance. */
export const BOOST_MAX_AHEAD = 24 * 3600;

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
  { id: 'barman', name: tl('Barman'), role: tl('Au bar'), text: tl('Rebranche les fûts vides avec ceux du stockage, même pendant ton absence.') },
  { id: 'courier', name: tl('Livreur'), role: tl('Aux commandes'), text: tl('Envoie les commandes que ton stock peut remplir, même pendant ton absence.') },
  { id: 'apprentice', name: tl('Apprenti brasseur'), role: tl('À l\'atelier'), text: tl('Quand la file est vide, il reprogramme ton dernier brassin : la brasserie ne s\'arrête pas.') },
];
export const staffById = (id: string) => STAFF.find((s) => s.id === id);
/** Un contrat dure 8 h, et se prolonge jusqu'à 24 h d'avance. */
export const STAFF_CONTRACT = { duration: 8 * 3600, maxAhead: 24 * 3600 } as const;
/** Postes de personnel, selon le niveau de la brasserie. */
export const STAFF_SLOTS = [1, 1, 2, 2, 3] as const;
/** Le barman et le livreur se paient en diamants, quel que soit le niveau : 3 💎 et 4 💎 les 8 h. */
export const BARMAN_GEMS = 3;
export const COURIER_GEMS = 4;
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
  { id: 'plants', name: tl('Plantes vertes'), text: tl('Au bout du comptoir. Ta gamme se fait connaître 20 % plus vite au bar.'), cost: 400, pop: 1.2 },
  { id: 'posters', name: tl('Affiches encadrées'), text: tl('Au mur. 5 % de clients en plus.'), cost: 2500, clients: 1.05 },
  { id: 'neon', name: tl('Enseigne lumineuse'), text: tl('Elle attire les passants : 15 % de clients en plus.'), cost: 12000, clients: 1.15 },
  { id: 'benches', name: tl('Banquettes'), text: tl('Deux places de plus, et 10 % de clients en plus.'), cost: 90000, clients: 1.1, seats: 2 },
  { id: 'jukebox', name: tl('Juke-box'), text: tl('Les clients s\'attardent : les verres se vendent 10 % plus cher.'), cost: 200000, price: 1.1 },
];
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);

/**
 * La décoration du bar, au magasin : un seul rayon, où les meubles alternent avec les objets qui débloquent
 * un événement (cible, télé, boule à facettes). Chaque achat débloque le suivant.
 */
export const DECOR_ORDER = ['plants', 'darts', 'posters', 'tv', 'neon', 'disco', 'benches', 'jukebox'] as const;
export type DecorId = (typeof DECOR_ORDER)[number];

// ------------------------------------------------------------------ étiquettes

export type UnlockKind = 'bottle' | 'shape' | 'emblem' | 'pattern';
export interface LabelUnlock {
  /** `${kind}:${value}` */
  id: string;
  kind: UnlockKind;
  value: string;
  name: string;
  /** Prix en argent (0 pour un cosmétique premium). */
  cost: number;
  /** Prix en diamants : les cosmétiques premium. */
  gems?: number;
}
export const UNLOCK_KINDS: readonly { id: UnlockKind; name: string }[] = [
  { id: 'bottle', name: tl('Bouteilles') },
  { id: 'shape', name: tl('Formes') },
  { id: 'emblem', name: tl('Logos') },
  { id: 'pattern', name: tl('Motifs') },
];
const u = (kind: UnlockKind, value: string, name: string, cost: number): LabelUnlock => ({ id: `${kind}:${value}`, kind, value, name, cost });
/** Les cosmétiques de luxe (bouteille d'or, diamant en relief, fleurs de lys d'or) : 500 diamants pièce. */
export const LUXURY_GEMS = 500;
/** Un cosmétique premium : il ne s'achète qu'en diamants. */
const p = (kind: UnlockKind, value: string, name: string, gems: number): LabelUnlock => ({ id: `${kind}:${value}`, kind, value, name, cost: 0, gems });
/** Tout ce que l'éditeur d'étiquettes peut gagner : formes de bouteille, d'étiquette, logos et motifs (quelques-uns en diamants). */
export const LABEL_UNLOCKS: readonly LabelUnlock[] = [
  u('bottle', 'longneck', tl('Long col'), 800),
  u('bottle', 'stubby', tl('Trapue'), 4000),
  u('bottle', 'swing', tl('Bouchon mécanique'), 20000),
  p('bottle', 'champagne', tl('Champenoise'), 40),
  p('bottle', 'gold', tl('Bouteille d\'or'), LUXURY_GEMS),
  u('shape', 'round', tl('Arrondie'), 500),
  u('shape', 'arch', tl('Arche'), 3000),
  u('shape', 'notched', tl('Coins coupés'), 15000),
  p('shape', 'baroque', tl('Cartouche baroque'), LUXURY_GEMS),
  u('emblem', 'leaf', tl('Feuille'), 300),
  u('emblem', 'bee', tl('Abeille'), 1500),
  u('emblem', 'sun', tl('Soleil'), 6000),
  u('emblem', 'fish', tl('Poisson'), 25000),
  p('emblem', 'castle', tl('Château'), 30),
  p('emblem', 'skull', tl('Crâne'), 50),
  p('emblem', 'gem', tl('Diamant'), LUXURY_GEMS),
  u('pattern', 'zigzag', tl('Zigzag'), 400),
  u('pattern', 'scales', tl('Écailles'), 2500),
  u('pattern', 'herringbone', tl('Chevrons'), 12000),
  p('pattern', 'tartan', tl('Tartan'), 30),
  p('pattern', 'artdeco', tl('Art déco'), LUXURY_GEMS),
];
export const unlockById = (id: string) => LABEL_UNLOCKS.find((x) => x.id === id);
/** Ce qui est libre dès le début est tout ce qui n'est pas dans la liste des déblocages. */
export const isLockable = (kind: UnlockKind, value: string) => LABEL_UNLOCKS.some((x) => x.kind === kind && x.value === value);
