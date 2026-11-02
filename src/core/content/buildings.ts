import type { FluidId } from './fluids';
import type { ItemId } from './items';

export type MachineKind =
  | 'water_tap' | 'supplier' | 'mill' | 'mash_tun' | 'kettle' | 'fermenter' | 'bottler' | 'stand' | 'crate';
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

export interface BuildingDef {
  name: string;
  /** Ce que fait le bâtiment, en une phrase simple (palette et inspecteur). */
  description: string;
  size: number;
  cost: number;
  category: Category;
  color: number;
  maxHealth: number;
  rotatable: boolean;
  /** Convoyeur : vitesse en cases/s et nombre max d'objets par case. */
  conveyor?: { speed: number; capacity: number };
  /** Réservoir principal (sortie pour les machines). */
  fluid?: FluidTankDef;
  /** Réservoir d'entrée distinct (machines de transformation). */
  fluidIn?: { capacity: number; accepts: readonly FluidId[] };
  itemsIn?: { capacity: number; accepts: readonly ItemId[] };
  itemsOut?: { capacity: number };
  /**
   * Échangeur à plaques : capacité d'échange en L/s. Le fluide qui en sort se rapproche de params.targetTemp
   * d'autant mieux que le débit est faible devant cette capacité (méthode ε-NTU, cf. systems/fluids.ts).
   */
  cooler?: { capacity: number };
  machine?: MachineKind;
  defaultParams?: Record<string, ParamValue>;
}

const TRANSPORT_HP = 60;
const MACHINE_HP = 200;

export const BUILDINGS = {
  // --- Transport -------------------------------------------------------------------------
  conveyor: {
    name: 'Convoyeur', description: 'Transporte les objets (malt, bouteilles…) dans le sens de la flèche.', size: 1, cost: 5, category: 'transport', color: 0x5b5b6e, maxHealth: TRANSPORT_HP, rotatable: true,
    conveyor: { speed: 2, capacity: 3 },
  },
  conduit: {
    name: 'Tuyau', description: 'Transporte les liquides dans le sens de la flèche.', size: 1, cost: 8, category: 'transport', color: 0x8a8fa3, maxHealth: TRANSPORT_HP, rotatable: true,
    fluid: { capacity: 10, maxFlow: 20, directional: true, maxPressure: 1.5, heatLoss: 0.01, accepts: 'any' },
  },
  pump: {
    name: 'Pompe', description: 'Pousse les liquides plus fort. Attention à la surpression !', size: 1, cost: 120, category: 'transport', color: 0x3f6fa8, maxHealth: TRANSPORT_HP, rotatable: true,
    fluid: { capacity: 10, maxFlow: 15, directional: true, pumpHead: 0.5, heatLoss: 0.01, accepts: 'any' },
  },
  cooler: {
    name: 'Refroidisseur', description: 'Refroidit le liquide qui le traverse.', size: 1, cost: 250, category: 'transport', color: 0x7ec8e3, maxHealth: TRANSPORT_HP, rotatable: true,
    fluid: { capacity: 10, maxFlow: 4, directional: true, accepts: 'any' },
    cooler: { capacity: 12 },
    defaultParams: { targetTemp: 20 },
  },
  tank: {
    name: 'Cuve tampon', description: 'Stocke un liquide en attendant la suite.', size: 2, cost: 150, category: 'transport', color: 0x6c7a89, maxHealth: MACHINE_HP, rotatable: false,
    fluid: { capacity: 200, maxFlow: 30, heatLoss: 0.002, accepts: 'any' },
  },

  // --- Approvisionnement -----------------------------------------------------------------
  water_tap: {
    name: 'Arrivée d\'eau', description: "Fournit de l'eau aux machines voisines.", size: 1, cost: 50, category: 'supply', color: 0x2d6cb5, maxHealth: MACHINE_HP, rotatable: false,
    fluid: { capacity: 20, maxFlow: 10, accepts: [] },
    machine: 'water_tap',
    defaultParams: { rate: 4, temp: 12 },
  },
  supplier: {
    name: 'Réserve automatique', description: 'Achète et livre un ingrédient automatiquement.', size: 1, cost: 100, category: 'supply', color: 0x9b6b3d, maxHealth: MACHINE_HP, rotatable: false,
    itemsOut: { capacity: 10 },
    machine: 'supplier',
    defaultParams: { item: 'malt', interval: 1 },
  },
  mill: {
    name: 'Concasseur', description: "Casse les grains de malt pour libérer l'amidon.", size: 1, cost: 200, category: 'brewing', color: 0xa0522d, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 10, accepts: ['malt'] },
    itemsOut: { capacity: 10 },
    machine: 'mill',
    defaultParams: { interval: 1 },
  },

  // --- Brassage --------------------------------------------------------------------------
  mash_tun: {
    name: 'Cuve d\'empâtage', description: "Fait infuser le malt dans l'eau chaude : l'amidon devient du sucre.", size: 2, cost: 500, category: 'brewing', color: 0xc47f2c, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 20, accepts: ['crushed_malt'] },
    fluidIn: { capacity: 60, accepts: ['water'] },
    fluid: { capacity: 60, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'mash_tun',
  },
  kettle: {
    name: 'Cuve d\'ébullition', description: 'Fait bouillir le moût avec le houblon.', size: 2, cost: 600, category: 'brewing', color: 0xb5482c, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 10, accepts: ['hops'] },
    fluidIn: { capacity: 60, accepts: ['wort'] },
    fluid: { capacity: 60, maxFlow: 10, heatLoss: 0.003, accepts: [] },
    machine: 'kettle',
  },
  fermenter: {
    name: 'Fermenteur', description: 'La levure y transforme le moût en bière.', size: 2, cost: 800, category: 'brewing', color: 0xd8d0b8, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 2, accepts: ['yeast'] },
    fluidIn: { capacity: 60, accepts: ['hopped_wort'] },
    fluid: { capacity: 60, maxFlow: 10, heatLoss: 0.002, accepts: [] },
    machine: 'fermenter',
  },
  bottler: {
    name: 'Embouteilleuse', description: 'Remplit des bouteilles avec la bière.', size: 2, cost: 700, category: 'brewing', color: 0x4f9a94, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 60, accepts: ['bottle'] },
    fluidIn: { capacity: 20, accepts: ['beer'] },
    itemsOut: { capacity: 6 },
    machine: 'bottler',
    defaultParams: { interval: 1 },
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
    name: 'Stand de rue', description: 'Vend tes bouteilles aux passants.', size: 2, cost: 300, category: 'sales', color: 0xe05a47, maxHealth: MACHINE_HP, rotatable: false,
    itemsIn: { capacity: 12, accepts: ['beer_bottle'] },
    machine: 'stand',
    defaultParams: { customersPerMin: 6, basePrice: 4 },
  },
} as const satisfies Record<string, BuildingDef>;

export type BuildingType = keyof typeof BUILDINGS;
export const getDef = (t: BuildingType): BuildingDef => BUILDINGS[t];
