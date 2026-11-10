/**
 * Ce qui s'achète en dehors des améliorations : les boosts (temporaires), le personnel (contrats de 8 h),
 * le mobilier du bar (définitif) et les déblocages de l'éditeur d'étiquettes (définitifs).
 * Données pures : les effets sont appliqués par la partie (game.ts).
 */
import type { StationId } from './stations';

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
  /** Une seule fois par jour (le jour du quota du grossiste, qui se recharge à minuit). */
  daily?: boolean;
}

/** Les postes, dans l'ordre du magasin ; « null » réunit les coups ponctuels. */
export const BOOST_POSTS: readonly { id: BoostChannel | null; name: string; text: string }[] = [
  { id: 'brew', name: 'Machines', text: 'Toutes les machines tournent plus vite. Le temps du jeu, lui, ne change pas.' },
  { id: 'yeast', name: 'Fermentation', text: 'Fermentation et garde : là où les brassins attendent le plus.' },
  { id: 'bar', name: 'Clients du bar', text: 'Plus de monde au comptoir.' },
  { id: 'wholesale', name: 'Grossiste', text: 'Le grossiste paie plus cher, ou reprend tout sans limite.' },
  { id: null, name: 'Coups ponctuels', text: 'Un effet immédiat.' },
];

export const BOOSTS: readonly BoostDef[] = [
  { id: 'rush', channel: 'brew', name: 'Coup de feu', text: 'Machines 2× plus vite · 30 min', mult: 2, minutes: 30, gems: 3 },
  { id: 'cadence', channel: 'brew', name: 'Cadence ×2', text: 'Machines 2× plus vite · 2 h', mult: 2, minutes: 120, gems: 10 },
  { id: 'nightShift', channel: 'brew', name: 'Équipe de nuit', text: 'Machines 2× plus vite · 8 h', mult: 2, minutes: 480, gems: 30 },
  { id: 'fullSpeed', channel: 'brew', name: 'Plein régime', text: 'Machines 3× plus vite · 1 h', mult: 3, minutes: 60, gems: 12 },
  { id: 'yeast', channel: 'yeast', name: 'Levure express', text: 'Cuves 3× plus vite · 2 h', mult: 3, minutes: 120, gems: 8 },
  { id: 'happyHour', channel: 'bar', name: 'Happy hour', text: 'Clients ×2, verres −20 % · 2 h', mult: 2, minutes: 120, priceMult: 0.8, gems: 6 },
  { id: 'buzz', channel: 'bar', name: 'Bouche-à-oreille', text: '50 % de clients en plus · 8 h', mult: 1.5, minutes: 480, gems: 15 },
  { id: 'broker', channel: 'wholesale', name: 'Grossiste généreux', text: 'Le grossiste paie +50 % · 4 h', mult: 1.5, minutes: 240, gems: 8 },
  { id: 'openGate', channel: 'wholesale', name: 'Grossiste sans limite', text: 'Reprend tout · 4 h · 1×/jour', mult: 1, minutes: 240, gems: 50, daily: true },
  { id: 'prospect', name: 'Prospection', text: 'Une commande arrive tout de suite', mult: 1, minutes: 0, gems: 3 },
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
  { id: 'benches', name: 'Banquettes', text: 'Deux places de plus, et 10 % de clients en plus.', cost: 90000, clients: 1.1, seats: 2 },
  { id: 'jukebox', name: 'Juke-box', text: 'Les clients s\'attardent : les verres se vendent 10 % plus cher.', cost: 200000, price: 1.1 },
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
  { id: 'bottle', name: 'Bouteilles' },
  { id: 'shape', name: 'Formes' },
  { id: 'emblem', name: 'Logos' },
  { id: 'pattern', name: 'Motifs' },
];
const u = (kind: UnlockKind, value: string, name: string, cost: number): LabelUnlock => ({ id: `${kind}:${value}`, kind, value, name, cost });
/** Un cosmétique premium : il ne s'achète qu'en diamants. */
const p = (kind: UnlockKind, value: string, name: string, gems: number): LabelUnlock => ({ id: `${kind}:${value}`, kind, value, name, cost: 0, gems });
/** Tout ce que l'éditeur d'étiquettes peut gagner : formes de bouteille, d'étiquette, logos et motifs (quelques-uns en diamants). */
export const LABEL_UNLOCKS: readonly LabelUnlock[] = [
  u('bottle', 'longneck', 'Long col', 800),
  u('bottle', 'stubby', 'Trapue', 4000),
  u('bottle', 'swing', 'Bouchon mécanique', 20000),
  p('bottle', 'champagne', 'Champenoise', 40),
  u('shape', 'round', 'Arrondie', 500),
  u('shape', 'arch', 'Arche', 3000),
  u('shape', 'notched', 'Coins coupés', 15000),
  u('emblem', 'leaf', 'Feuille', 300),
  u('emblem', 'bee', 'Abeille', 1500),
  u('emblem', 'sun', 'Soleil', 6000),
  u('emblem', 'fish', 'Poisson', 25000),
  p('emblem', 'castle', 'Château', 30),
  p('emblem', 'skull', 'Crâne', 50),
  u('pattern', 'zigzag', 'Zigzag', 400),
  u('pattern', 'scales', 'Écailles', 2500),
  u('pattern', 'herringbone', 'Chevrons', 12000),
  p('pattern', 'tartan', 'Tartan', 30),
];
export const unlockById = (id: string) => LABEL_UNLOCKS.find((x) => x.id === id);
/** Ce qui est libre dès le début est tout ce qui n'est pas dans la liste des déblocages. */
export const isLockable = (kind: UnlockKind, value: string) => LABEL_UNLOCKS.some((x) => x.kind === kind && x.value === value);
