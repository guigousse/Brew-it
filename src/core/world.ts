import { BatchRegistry, type BatchId, type BatchProfile } from './brewing/batches';
import { createBuilding, type Building } from './building';
import { BUILDINGS, type BuildingType, type ParamValue } from './content/buildings';
import { EXPANSIONS, MAX_MAP_HEIGHT, MAX_MAP_WIDTH } from './content/expansions';
import { EXPANSION_UNLOCKS, STARTER_BUILDINGS } from './content/progression';
import { tutorialAllowsStart, tutorialPlacement, tutorialUpdate, type TutorialState } from './tutorial/tutorial';
import type { MachineKind } from './content/buildings';
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
  /** Démarre la partie avec le tutoriel (défaut : true). false = tout le contenu de départ débloqué. */
  tutorial?: boolean;
}

export interface Stats {
  brews: number;
  fermentations: number;
  bottles: number;
  crates: number;
  earned: number;
}

export const STARTING_MONEY = 300;

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
  stats: Stats = { brews: 0, fermentations: 0, bottles: 0, crates: 0, earned: 0 };
  tutorial: TutorialState;
  /** Bâtiments proposés dans la palette (le contenu se débloque progressivement). */
  unlocked: BuildingType[];
  /** Profil de la toute première bière livrée (affiché à la fin du tutoriel). */
  firstBeer: BatchProfile | null = null;
  /** Ordre de mise à jour stable (ordre de création). */
  private order: Building[] = [];
  private adjCache = new Map<number, Neighbor[]>();

  constructor(init: WorldInit = {}) {
    this.money = init.money ?? STARTING_MONEY;
    this.rng = new Rng(init.seed ?? 0xb33f);
    const withTutorial = init.tutorial ?? true;
    this.tutorial = { step: 0, done: !withTutorial, signals: [] };
    this.unlocked = withTutorial ? [] : [...STARTER_BUILDINGS];
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
    if (!this.tutorial.done) tutorialUpdate(this);
    this.time += dt;
    this.tick++;
    if (this.tick % (TICK_RATE * 5) === 0) this.collectBatches();
  }

  // ------------------------------------------------------------------ commandes

  /** Vérifie une construction sans l'effectuer (utilisé aussi pour l'aperçu fantôme). */
  checkPlace(type: BuildingType, x: number, y: number): CommandResult & { cost: number } {
    const def = BUILDINGS[type];
    if (!this.tutorial.done) {
      const target = tutorialPlacement(this, type, x, y);
      if (!target) return { ok: false, reason: 'Suis les indications de Gaston', cost: 0 };
      if (!this.grid.canPlace(x, y, def.size)) return { ok: false, reason: 'Emplacement occupé', cost: 0 };
      return { ok: true, cost: 0 }; // constructions offertes pendant le tutoriel
    }
    if (!this.grid.canPlace(x, y, def.size)) return { ok: false, reason: 'Emplacement occupé ou verrouillé', cost: def.cost };
    if (this.money < def.cost) return { ok: false, reason: 'Fonds insuffisants', cost: def.cost };
    return { ok: true, cost: def.cost };
  }

  place(type: BuildingType, x: number, y: number, rot: Dir = 0, opts: { free?: boolean } = {}): CommandResult {
    const check = this.checkPlace(type, x, y);
    if (!check.ok && !(opts.free && this.tutorial.done && this.grid.canPlace(x, y, BUILDINGS[type].size))) return check;
    const target = this.tutorial.done ? undefined : tutorialPlacement(this, type, x, y);
    if (!opts.free) this.money -= check.cost;
    const b = createBuilding(this.nextId++, type, x, y, target?.rot ?? rot);
    if (target?.params) Object.assign(b.params, target.params);
    this.insert(b);
    if (!this.tutorial.done) tutorialUpdate(this);
    return { ok: true, id: b.id };
  }

  /** Signal envoyé par l'interface (ex. « le joueur a ouvert la cuve ») pour le tutoriel. */
  signal(name: string): void {
    if (this.tutorial.done || this.tutorial.signals.includes(name)) return;
    this.tutorial.signals.push(name);
    tutorialUpdate(this);
  }

  /** Pendant le tutoriel, une machine attend que le joueur ait fait ses choix avant de lancer son premier lot. */
  canStart(kind: MachineKind): boolean {
    return this.tutorial.done || tutorialAllowsStart(this, kind);
  }

  unlock(types: readonly BuildingType[]): void {
    const fresh = types.filter((t) => !this.unlocked.includes(t));
    if (!fresh.length) return;
    this.unlocked.push(...fresh);
    this.events.emit({ type: 'unlocked', buildings: fresh });
  }

  earn(amount: number): void {
    this.money += amount;
    this.stats.earned += amount;
  }

  remove(id: number): CommandResult {
    if (!this.tutorial.done) return { ok: false, reason: 'Impossible pendant le tutoriel' };
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
    if (!this.tutorial.done) return { ok: false, reason: 'Termine d\'abord le tutoriel' };
    const next = EXPANSIONS[this.expansion + 1];
    if (!next) return { ok: false, reason: 'Taille maximale atteinte' };
    if (this.money < next.cost) return { ok: false, reason: 'Fonds insuffisants' };
    this.money -= next.cost;
    this.expansion++;
    this.grid.unlock(next.width, next.height);
    this.events.emit({ type: 'expanded', level: this.expansion });
    this.unlock(EXPANSION_UNLOCKS[this.expansion] ?? []);
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
