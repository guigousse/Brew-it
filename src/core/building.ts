import type { BatchId } from './brewing/batches';
import { BUILDINGS, type BuildingType, type ParamValue } from './content/buildings';
import { AMBIENT_TEMP, type FluidId } from './content/fluids';
import type { ItemId } from './content/items';
import type { Dir } from './dir';

export interface FluidTank {
  fluid: FluidId | null;
  amount: number;
  temp: number;
  batch: BatchId | null;
}

export interface ItemUnit {
  item: ItemId;
  batch: BatchId | null;
}

export interface BeltItem extends ItemUnit {
  /** Position sur la case, 0 = entrée, 1 = sortie. */
  pos: number;
}

export type MachinePhase = 'idle' | 'filling' | 'heating' | 'processing' | 'blocked' | 'failed';

export interface MachineState {
  phase: MachinePhase;
  timer: number;
  /** Durée totale de la phase courante (pour la barre de progression UI). */
  duration: number;
  batch: BatchId | null;
  /** Température du contenu en cours de traitement (cuves chauffées). */
  temp?: number;
  /** Réglages figés au lancement du lot : bouger un curseur n'affecte que le lot suivant. */
  data?: Record<string, number | string>;
}

/** Indicateurs d'alerte affichés au-dessus des machines (bitmask). */
export const Alert = {
  None: 0,
  NoInput: 1 << 0,
  OutputBlocked: 1 << 1,
  Overheat: 1 << 2,
  Overpressure: 1 << 3,
  Broken: 1 << 4,
  MixedFluids: 1 << 5,
  BatchLost: 1 << 6,
  NoMoney: 1 << 7,
} as const;

/**
 * Instance de bâtiment : données pures (sérialisables en JSON telles quelles).
 * Les comportements vivent dans les systèmes (`systems/*`), pas ici.
 */
export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  rot: Dir;
  health: number;
  params: Record<string, ParamValue>;
  alerts: number;
  /** Index tournant pour répartir les sorties entre voisins. */
  dumpIndex: number;
  fluid?: FluidTank;
  fluidIn?: FluidTank;
  itemsIn?: ItemUnit[];
  itemsOut?: ItemUnit[];
  belt?: BeltItem[];
  machine?: MachineState;
}

export const emptyTank = (temp = AMBIENT_TEMP): FluidTank => ({ fluid: null, amount: 0, temp, batch: null });

export function createBuilding(id: number, type: BuildingType, x: number, y: number, rot: Dir): Building {
  const def = BUILDINGS[type];
  const b: Building = {
    id, type, x, y,
    rot: def.rotatable ? rot : 0,
    health: def.maxHealth,
    params: { ...('defaultParams' in def ? def.defaultParams : {}) },
    alerts: Alert.None,
    dumpIndex: 0,
  };
  if ('fluid' in def) b.fluid = emptyTank();
  if ('fluidIn' in def) b.fluidIn = emptyTank();
  if ('itemsIn' in def) b.itemsIn = [];
  if ('itemsOut' in def) b.itemsOut = [];
  if ('conveyor' in def) b.belt = [];
  if ('machine' in def) b.machine = { phase: 'idle', timer: 0, duration: 0, batch: null };
  return b;
}

export const num = (b: Building, key: string): number => Number(b.params[key] ?? 0);
export const countItems = (list: readonly ItemUnit[], item: ItemId): number => {
  let n = 0;
  for (const u of list) if (u.item === item) n++;
  return n;
};
/** Retire `n` objets du type donné ; renvoie les unités retirées. */
export const takeItems = (list: ItemUnit[], item: ItemId, n: number): ItemUnit[] => {
  const out: ItemUnit[] = [];
  for (let i = 0; i < list.length && out.length < n; ) {
    if (list[i]!.item === item) out.push(list.splice(i, 1)[0]!);
    else i++;
  }
  return out;
};
