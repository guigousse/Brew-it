import type { FluidId } from './fluids';
import type { ItemId } from './items';

export type MachineKind = 'water_tap' | 'supplier' | 'mill' | 'mash_tun' | 'kettle' | 'fermenter' | 'bottler' | 'stand' | 'crate';
export type Category = 'transport' | 'supply' | 'brewing' | 'sales';
export type ParamValue = number | string;

export interface FluidTankDef {
  capacity: number; // L
  maxFlow: number; // L/s qui peuvent sortir de ce bâtiment
  /** true = ne pousse que vers l'avant (tuyau, pompe). false = déverse vers tous les voisins (cuves, machines). */
  directional?: boolean;
  /** Surpression ajoutée par une pompe (en ratio de remplissage). */
  pumpHead?: number;
  /** Remplissage max toléré (1 = plein). Au-delà de 1 le bâtiment s'abîme ; une pompe peut pousser jusqu'à cette valeur. */
  maxPressure?: number;
  /** Coefficient de déperdition thermique vers l'ambiante (1/s). */
  heatLoss?: number;
  /** Fluides acceptés en entrée. 'any' pour le transport ; [] pour les sources. */
  accepts: readonly FluidId[] | 'any';
}

/** Condition de déblocage dans le magasin. */
export interface Unlock {
  crates?: number;
  expansion?: number;
}

export interface BuildingDef {
  name: string;
  /** Ce que fait le bâtiment, en une phrase simple (magasin et fiche). */
  description: string;
  size: number;
  cost: number;
  category: Category;
  color: number;
  maxHealth: number;
  rotatable: boolean;
  /** Famille d'appareils : les paliers d'une même famille font le même travail. */
  family?: string;
  /** 1 = miniature (départ), 2 = professionnel, 3 = industriel. */
  tier?: number;
  /** Taille des lots : ×1 = 24 L d'eau d'empâtage (≈ 19 L de moût). */
  batchScale?: number;
  /** Multiplicateur de vitesse (chauffe et durées de traitement). */
  speed?: number;
  /** Absent = disponible dès la fin du tutoriel. */
  unlock?: Unlock;
  /** Non proposé au magasin (réservé aux scénarios / futures réserves). */
  hidden?: boolean;
  conveyor?: { speed: number; capacity: number };
  fluid?: FluidTankDef;
  fluidIn?: { capacity: number; accepts: readonly FluidId[] };
  itemsIn?: { capacity: number; accepts: readonly ItemId[] };
  itemsOut?: { capacity: number };
  /** Échangeur : capacité d'échange en L/s (méthode ε-NTU, cf. systems/fluids.ts). */
  cooler?: { capacity: number };
  machine?: MachineKind;
  defaultParams?: Record<string, ParamValue>;
}

const TRANSPORT_HP = 60;
const MACHINE_HP = 200;
const PRO: Unlock = { crates: 5 };
const INDUSTRIAL: Unlock = { crates: 20, expansion: 2 };

export const BUILDINGS = {
  // --- Liaisons ----------------------------------------------------------------------------
  conduit: {
    name: 'Tuyau', description: 'Relie deux appareils : le liquide coule dans le sens de la flèche.',
    size: 1, cost: 8, category: 'transport', color: 0x8d98a6, maxHealth: TRANSPORT_HP, rotatable: true,
    fluid: { capacity: 10, maxFlow: 20, directional: true, maxPressure: 1.5, heatLoss: 0.01, accepts: 'any' },
  },
  conveyor: {
    name: 'Tapis roulant', description: 'Transporte les objets (malt, bouteilles…) dans le sens de la flèche.',
    size: 1, cost: 5, category: 'transport', color: 0x5b5b6e, maxHealth: TRANSPORT_HP, rotatable: true,
    conveyor: { speed: 2, capacity: 3 },
  },
  pump: {
    name: 'Pompe', description: 'Pousse le liquide plus fort et plus loin. Attention à la surpression !',
    size: 1, cost: 120, category: 'transport', color: 0x3f6fa8, maxHealth: TRANSPORT_HP, rotatable: true, unlock: { expansion: 1 },
    fluid: { capacity: 10, maxFlow: 15, directional: true, pumpHead: 0.5, heatLoss: 0.01, accepts: 'any' },
  },
  tank: {
    name: 'Cuve tampon', description: 'Stocke un liquide en attendant l\'étape suivante.',
    size: 2, cost: 150, category: 'transport', color: 0x6c7a89, maxHealth: MACHINE_HP, rotatable: false, unlock: { expansion: 1 },
    fluid: { capacity: 200, maxFlow: 30, heatLoss: 0.002, accepts: 'any' },
  },

  // --- Eau et réserves -----------------------------------------------------------------------
  water_tap: {
    name: 'Robinet d\'eau', description: 'L\'eau du réseau, à 12 °C. Branche un tuyau dessus.',
    size: 1, cost: 50, category: 'supply', color: 0x2d6cb5, maxHealth: MACHINE_HP, rotatable: false,
    fluid: { capacity: 20, maxFlow: 10, accepts: [] },
    machine: 'water_tap',
    defaultParams: { rate: 4, temp: 12 },
  },
  supplier: {
    name: 'Réserve automatique', description: 'Livre un ingrédient automatiquement.',
    size: 1, cost: 100, category: 'supply', color: 0x9b6b3d, maxHealth: MACHINE_HP, rotatable: false, hidden: true,
    itemsOut: { capacity: 10 },
    machine: 'supplier',
    defaultParams: { item: 'malt', interval: 1 },
  },

  // --- Brassage : versions miniatures (départ) ----------------------------------------------
  mill: {
    name: 'Mini-concasseur', description: 'Moulin à manivelle : casse les grains de malt pour libérer l\'amidon.',
    size: 1, cost: 80, category: 'brewing', color: 0xa0522d, maxHealth: MACHINE_HP, rotatable: false, family: 'mill', tier: 1, speed: 1,
    itemsIn: { capacity: 15, accepts: ['malt'] },
    itemsOut: { capacity: 15 },
    machine: 'mill',
    defaultParams: { interval: 1 },
  },
  mash_tun_mini: {
    name: 'Marmite d\'empâtage', description: 'Fait infuser le malt dans l\'eau chaude : l\'amidon devient du sucre. Lots de 25 L.',
    size: 1, cost: 150, category: 'brewing', color: 0xc47f2c, maxHealth: MACHINE_HP, rotatable: false, family: 'mash_tun', tier: 1, batchScale: 1, speed: 1,
    itemsIn: { capacity: 20, accepts: ['crushed_malt'] },
    fluidIn: { capacity: 40, accepts: ['water'] },
    fluid: { capacity: 40, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'mash_tun',
  },
  kettle_mini: {
    name: 'Marmite d\'ébullition', description: 'Fait bouillir le moût sur le gaz avec le houblon. Lots de 25 L.',
    size: 1, cost: 180, category: 'brewing', color: 0xb5482c, maxHealth: MACHINE_HP, rotatable: false, family: 'kettle', tier: 1, batchScale: 1, speed: 1,
    itemsIn: { capacity: 10, accepts: ['hops'] },
    fluidIn: { capacity: 40, accepts: ['wort'] },
    fluid: { capacity: 40, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'kettle',
  },
  cooler: {
    name: 'Serpentin refroidisseur', description: 'Refroidit le moût qui le traverse. Lent mais efficace.',
    size: 1, cost: 100, category: 'brewing', color: 0x7ec8e3, maxHealth: TRANSPORT_HP, rotatable: true, family: 'cooler', tier: 1,
    fluid: { capacity: 10, maxFlow: 2, directional: true, accepts: 'any' },
    cooler: { capacity: 8 },
    defaultParams: { targetTemp: 20 },
  },
  fermenter_mini: {
    name: 'Dame-jeanne', description: 'Bonbonne en verre de 25 L : la levure y transforme le moût en bière.',
    size: 1, cost: 120, category: 'brewing', color: 0xd8d0b8, maxHealth: MACHINE_HP, rotatable: false, family: 'fermenter', tier: 1, batchScale: 1, speed: 1,
    itemsIn: { capacity: 2, accepts: ['yeast'] },
    fluidIn: { capacity: 30, accepts: ['hopped_wort'] },
    fluid: { capacity: 30, maxFlow: 10, heatLoss: 0.002, accepts: [] },
    machine: 'fermenter',
  },
  bottler_mini: {
    name: 'Embouteilleuse manuelle', description: 'Remplit et capsule les bouteilles une par une.',
    size: 1, cost: 120, category: 'brewing', color: 0x4f9a94, maxHealth: MACHINE_HP, rotatable: false, family: 'bottler', tier: 1, speed: 1,
    itemsIn: { capacity: 60, accepts: ['bottle'] },
    fluidIn: { capacity: 30, accepts: ['beer'] },
    itemsOut: { capacity: 6 },
    machine: 'bottler',
    defaultParams: { interval: 1.2 },
  },

  // --- Brassage : versions pro (à débloquer) -------------------------------------------------
  mill_2: {
    name: 'Moulin à rouleaux', description: 'Moulin électrique : concasse deux fois et demie plus vite.',
    size: 1, cost: 400, category: 'brewing', color: 0x8a6a4a, maxHealth: MACHINE_HP, rotatable: false, family: 'mill', tier: 2, speed: 2.5, unlock: PRO,
    itemsIn: { capacity: 30, accepts: ['malt'] },
    itemsOut: { capacity: 30 },
    machine: 'mill',
    defaultParams: { interval: 0.4 },
  },
  mash_tun: {
    name: 'Cuve d\'empâtage 50 L', description: 'Cuve inox chauffée : lots deux fois plus gros, chauffe plus rapide.',
    size: 2, cost: 900, category: 'brewing', color: 0xc47f2c, maxHealth: MACHINE_HP, rotatable: false, family: 'mash_tun', tier: 2, batchScale: 2, speed: 1.3, unlock: PRO,
    itemsIn: { capacity: 30, accepts: ['crushed_malt'] },
    fluidIn: { capacity: 60, accepts: ['water'] },
    fluid: { capacity: 60, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'mash_tun',
  },
  kettle: {
    name: 'Cuve d\'ébullition 50 L', description: 'Brûleur puissant : lots de 50 L, ébullition plus rapide.',
    size: 2, cost: 1000, category: 'brewing', color: 0xb5482c, maxHealth: MACHINE_HP, rotatable: false, family: 'kettle', tier: 2, batchScale: 2, speed: 1.3, unlock: PRO,
    itemsIn: { capacity: 20, accepts: ['hops'] },
    fluidIn: { capacity: 80, accepts: ['wort'] },
    fluid: { capacity: 80, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'kettle',
  },
  cooler_2: {
    name: 'Échangeur à plaques', description: 'Refroidit trois fois plus de moût à la seconde.',
    size: 1, cost: 450, category: 'brewing', color: 0x7ec8e3, maxHealth: TRANSPORT_HP, rotatable: true, family: 'cooler', tier: 2, unlock: PRO,
    fluid: { capacity: 10, maxFlow: 6, directional: true, accepts: 'any' },
    cooler: { capacity: 24 },
    defaultParams: { targetTemp: 20 },
  },
  fermenter: {
    name: 'Fermenteur conique 60 L', description: 'Cuve inox régulée : grands lots, fermentation plus rapide.',
    size: 2, cost: 1200, category: 'brewing', color: 0xd8d0b8, maxHealth: MACHINE_HP, rotatable: false, family: 'fermenter', tier: 2, batchScale: 2, speed: 1.3, unlock: PRO,
    itemsIn: { capacity: 6, accepts: ['yeast'] },
    fluidIn: { capacity: 80, accepts: ['hopped_wort'] },
    fluid: { capacity: 80, maxFlow: 10, heatLoss: 0.002, accepts: [] },
    machine: 'fermenter',
  },
  bottler: {
    name: 'Embouteilleuse semi-auto', description: 'Carrousel à 6 becs : trois fois plus rapide.',
    size: 2, cost: 900, category: 'brewing', color: 0x4f9a94, maxHealth: MACHINE_HP, rotatable: false, family: 'bottler', tier: 2, speed: 3, unlock: PRO,
    itemsIn: { capacity: 120, accepts: ['bottle'] },
    fluidIn: { capacity: 40, accepts: ['beer'] },
    itemsOut: { capacity: 12 },
    machine: 'bottler',
    defaultParams: { interval: 0.4 },
  },

  // --- Brassage : versions industrielles (à débloquer) ---------------------------------------
  mill_3: {
    name: 'Broyeur industriel', description: 'Broyeur à moteur avec trémie : alimente les plus grosses cuves.',
    size: 2, cost: 2500, category: 'brewing', color: 0x6c7a89, maxHealth: MACHINE_HP, rotatable: false, family: 'mill', tier: 3, speed: 6, unlock: INDUSTRIAL,
    itemsIn: { capacity: 60, accepts: ['malt'] },
    itemsOut: { capacity: 60 },
    machine: 'mill',
    defaultParams: { interval: 0.15 },
  },
  mash_tun_3: {
    name: 'Cuve d\'empâtage 100 L', description: 'Cuve industrielle à agitateur : lots quatre fois plus gros.',
    size: 3, cost: 6000, category: 'brewing', color: 0xc47f2c, maxHealth: MACHINE_HP * 2, rotatable: false, family: 'mash_tun', tier: 3, batchScale: 4, speed: 1.6, unlock: INDUSTRIAL,
    itemsIn: { capacity: 40, accepts: ['crushed_malt'] },
    fluidIn: { capacity: 120, accepts: ['water'] },
    fluid: { capacity: 120, maxFlow: 20, heatLoss: 0.002, accepts: [] },
    machine: 'mash_tun',
  },
  kettle_3: {
    name: 'Cuve d\'ébullition 100 L', description: 'Chaudière vapeur : lots de 100 L, ébullition rapide.',
    size: 3, cost: 6500, category: 'brewing', color: 0xb5482c, maxHealth: MACHINE_HP * 2, rotatable: false, family: 'kettle', tier: 3, batchScale: 4, speed: 1.6, unlock: INDUSTRIAL,
    itemsIn: { capacity: 40, accepts: ['hops'] },
    fluidIn: { capacity: 160, accepts: ['wort'] },
    fluid: { capacity: 160, maxFlow: 20, heatLoss: 0.002, accepts: [] },
    machine: 'kettle',
  },
  cooler_3: {
    name: 'Échangeur industriel', description: 'Refroidit de gros débits sans broncher.',
    size: 1, cost: 1800, category: 'brewing', color: 0x5aa2e8, maxHealth: TRANSPORT_HP * 2, rotatable: true, family: 'cooler', tier: 3, unlock: INDUSTRIAL,
    fluid: { capacity: 15, maxFlow: 15, directional: true, accepts: 'any' },
    cooler: { capacity: 60 },
    defaultParams: { targetTemp: 20 },
  },
  fermenter_3: {
    name: 'Fermenteur industriel 120 L', description: 'Grande cuve cylindro-conique régulée : énormes lots, fermentation rapide.',
    size: 3, cost: 8000, category: 'brewing', color: 0xd8d0b8, maxHealth: MACHINE_HP * 2, rotatable: false, family: 'fermenter', tier: 3, batchScale: 4, speed: 1.6, unlock: INDUSTRIAL,
    itemsIn: { capacity: 10, accepts: ['yeast'] },
    fluidIn: { capacity: 160, accepts: ['hopped_wort'] },
    fluid: { capacity: 160, maxFlow: 20, heatLoss: 0.002, accepts: [] },
    machine: 'fermenter',
  },
  bottler_3: {
    name: 'Ligne d\'embouteillage', description: 'Remplisseuse et capsuleuse automatiques : dix fois plus rapide.',
    size: 3, cost: 7000, category: 'brewing', color: 0x4f9a94, maxHealth: MACHINE_HP * 2, rotatable: false, family: 'bottler', tier: 3, speed: 10, unlock: INDUSTRIAL,
    itemsIn: { capacity: 240, accepts: ['bottle'] },
    fluidIn: { capacity: 80, accepts: ['beer'] },
    itemsOut: { capacity: 24 },
    machine: 'bottler',
    defaultParams: { interval: 0.12 },
  },

  // --- Vente -----------------------------------------------------------------------------
  crate: {
    name: 'Caisse de livraison', description: 'Part livrer le bar du coin dès qu\'elle contient 12 bouteilles.',
    size: 1, cost: 150, category: 'sales', color: 0xa8743c, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 12, accepts: ['beer_bottle'] },
    machine: 'crate',
    defaultParams: { basePrice: 3 },
  },
  stand: {
    name: 'Stand de rue', description: 'Vend tes bouteilles aux passants, un peu plus cher qu\'au bar.',
    size: 2, cost: 300, category: 'sales', color: 0xe05a47, maxHealth: MACHINE_HP, rotatable: false, unlock: { crates: 2 },
    itemsIn: { capacity: 12, accepts: ['beer_bottle'] },
    machine: 'stand',
    defaultParams: { customersPerMin: 6, basePrice: 4 },
  },
} as const satisfies Record<string, BuildingDef>;

export type BuildingType = keyof typeof BUILDINGS;
export const getDef = (t: BuildingType): BuildingDef => BUILDINGS[t];
/** Type de machine d'un bâtiment (les paliers d'une famille partagent le même comportement). */
export const kindOf = (t: BuildingType): MachineKind | undefined => (BUILDINGS[t] as BuildingDef).machine;
export const isKind = (t: BuildingType, k: MachineKind) => kindOf(t) === k;
