import { BatchRegistry, type BatchId } from './brewing/batches';
import { createBuilding, type Building } from './building';
import { BUILDINGS, type BuildingType, type ParamValue } from './content/buildings';
import { EXPANSIONS, MAX_MAP_HEIGHT, MAX_MAP_WIDTH } from './content/expansions';
import { DX, DY, type Dir } from './dir';
import { initialMarket, updateMarket, type MarketState } from './economy/market';
import { EventBus } from './events';
import { EMPTY, Grid } from './grid/grid';
import { Rng } from './rng';
import { updateConveyors, dumpItems } from './systems/items';
import { updateFluids } from './systems/fluids';
import { updateHeat } from './systems/heat';
import { updateMachine } from './systems/machines';

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const REFUND_RATIO = 0.75;

export interface Neighbor {
  b: Building;
  /** Direction depuis le bâtiment source vers ce voisin. */
  dir: Dir;
}

export interface WorldInit {
  money?: number;
  seed?: number;
}

export interface CommandResult {
  ok: boolean;
  id?: number;
  reason?: string;
}

/**
 * État autoritaire de la partie. Toute mutation passe par les méthodes de commande (place, remove, setParam…)
 * → l'UI ne touche jamais directement aux bâtiments, ce qui garde la simulation testable et rejouable.
 */
export class World {
  time = 0;
  tick = 0;
  money: number;
  expansion = 0;
  nextId = 1;
  readonly grid: Grid;
  readonly buildings = new Map<number, Building>();
  readonly batches = new BatchRegistry();
  readonly events = new EventBus();
  market: MarketState = initialMarket();
  rng: Rng;
  /** Ordre de mise à jour stable (ordre de création). */
  private order: Building[] = [];
  private adjCache = new Map<number, Neighbor[]>();

  constructor(init: WorldInit = {}) {
    this.money = init.money ?? 1_500;
    this.rng = new Rng(init.seed ?? 0xb33f);
    const stage = EXPANSIONS[0]!;
    this.grid = new Grid(MAX_MAP_WIDTH, MAX_MAP_HEIGHT, stage.width, stage.height);
  }

  // ------------------------------------------------------------------ requêtes

  get list(): readonly Building[] {
    return this.order;
  }

  at(x: number, y: number): Building | undefined {
    const id = this.grid.get(x, y);
    return id === EMPTY ? undefined : this.buildings.get(id);
  }

  /** Bâtiment situé juste devant `b` (selon sa rotation). Pour les bâtiments 1x1. */
  front(b: Building): Building | undefined {
    return this.at(b.x + DX[b.rot]!, b.y + DY[b.rot]!);
  }

  /** Voisins uniques touchant un des bords du bâtiment (gère les multi-cases). */
  neighbors(b: Building): Neighbor[] {
    let cached = this.adjCache.get(b.id);
    if (cached) return cached;
    const size = BUILDINGS[b.type].size;
    const seen = new Set<number>();
    cached = [];
    const probe = (x: number, y: number, dir: Dir) => {
      const id = this.grid.get(x, y);
      if (id === EMPTY || id === b.id || seen.has(id)) return;
      seen.add(id);
      cached!.push({ b: this.buildings.get(id)!, dir });
    };
    for (let i = 0; i < size; i++) {
      probe(b.x + size, b.y + i, 0);
      probe(b.x + i, b.y + size, 1);
      probe(b.x - 1, b.y + i, 2);
      probe(b.x + i, b.y - 1, 3);
    }
    this.adjCache.set(b.id, cached);
    return cached;
  }

  // ------------------------------------------------------------------ simulation

  step(dt = TICK_DT): void {
    for (const b of this.order) updateMachine(this, b, dt);
    updateConveyors(this, dt);
    for (const b of this.order) dumpItems(this, b);
    updateFluids(this, dt);
    updateHeat(this, dt);
    updateMarket(this.market, this.time, this.rng);
    this.time += dt;
    this.tick++;
    if (this.tick % (TICK_RATE * 5) === 0) this.collectBatches();
  }

  // ------------------------------------------------------------------ commandes

  place(type: BuildingType, x: number, y: number, rot: Dir = 0, opts: { free?: boolean } = {}): CommandResult {
    const def = BUILDINGS[type];
    if (!this.grid.canPlace(x, y, def.size)) return { ok: false, reason: 'Emplacement occupé ou verrouillé' };
    if (!opts.free) {
      if (this.money < def.cost) return { ok: false, reason: 'Fonds insuffisants' };
      this.money -= def.cost;
    }
    const b = createBuilding(this.nextId++, type, x, y, rot);
    this.insert(b);
    return { ok: true, id: b.id };
  }

  remove(id: number): CommandResult {
    const b = this.buildings.get(id);
    if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
    const def = BUILDINGS[b.type];
    this.grid.clear(b.x, b.y, def.size);
    this.buildings.delete(id);
    this.order = this.order.filter((o) => o !== b);
    this.money += Math.floor(def.cost * REFUND_RATIO);
    this.adjCache.clear();
    return { ok: true };
  }

  rotate(id: number): CommandResult {
    const b = this.buildings.get(id);
    if (!b || !BUILDINGS[b.type].rotatable) return { ok: false, reason: 'Non orientable' };
    b.rot = ((b.rot + 1) % 4) as Dir;
    return { ok: true };
  }

  setParam(id: number, key: string, value: ParamValue): CommandResult {
    const b = this.buildings.get(id);
    if (!b || !(key in b.params)) return { ok: false, reason: 'Paramètre inconnu' };
    if (typeof b.params[key] !== typeof value) return { ok: false, reason: 'Type invalide' };
    b.params[key] = value;
    return { ok: true };
  }

  repair(id: number): CommandResult {
    const b = this.buildings.get(id);
    if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
    const def = BUILDINGS[b.type];
    const cost = Math.ceil(def.cost * 0.3 * (1 - b.health / def.maxHealth));
    if (this.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
    this.money -= cost;
    b.health = def.maxHealth;
    return { ok: true };
  }

  expand(): CommandResult {
    const next = EXPANSIONS[this.expansion + 1];
    if (!next) return { ok: false, reason: 'Taille maximale atteinte' };
    if (this.money < next.cost) return { ok: false, reason: 'Fonds insuffisants' };
    this.money -= next.cost;
    this.expansion++;
    this.grid.unlock(next.width, next.height);
    this.events.emit({ type: 'expanded', level: this.expansion });
    return { ok: true };
  }

  // ------------------------------------------------------------------ interne

  /** Insère un bâtiment déjà construit (utilisé aussi par le chargement de sauvegarde). */
  insert(b: Building): void {
    const size = BUILDINGS[b.type].size;
    this.grid.fill(b.id, b.x, b.y, size);
    this.buildings.set(b.id, b);
    this.order.push(b);
    this.nextId = Math.max(this.nextId, b.id + 1);
    this.adjCache.clear();
  }

  referencedBatches(): Set<BatchId> {
    const refs = new Set<BatchId>();
    const add = (id: BatchId | null | undefined) => id != null && refs.add(id);
    for (const b of this.order) {
      add(b.fluid?.batch);
      add(b.fluidIn?.batch);
      add(b.machine?.batch);
      b.itemsIn?.forEach((u) => add(u.batch));
      b.itemsOut?.forEach((u) => add(u.batch));
      b.belt?.forEach((u) => add(u.batch));
    }
    return refs;
  }

  collectBatches(): void {
    this.batches.gc(this.referencedBatches());
  }
}
