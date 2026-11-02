import { BatchRegistry, type BatchProfile } from '../brewing/batches';
import type { Building } from '../building';
import type { BuildingType } from '../content/buildings';
import type { TutorialState } from '../tutorial/tutorial';
import type { Recipe } from '../brewing/recipe';
import { EXPANSIONS } from '../content/expansions';
import type { MarketState } from '../economy/market';
import { World } from '../world';
import { migrate } from './migrations';

export const SAVE_VERSION = 3;

/** Format de sauvegarde : JSON pur, versionné. Toute évolution du format = une migration dans migrations.ts. */
export interface SaveFile {
  version: number;
  /** Horodatage réel (ms epoch) — sert au calcul de la production hors-ligne. */
  savedAt: number;
  world: {
    time: number;
    tick: number;
    money: number;
    expansion: number;
    nextId: number;
    rngState: number;
    market: MarketState;
    batches: { next: number; batches: Record<number, BatchProfile> };
    buildings: Building[];
    stats: World['stats'];
    tutorial: TutorialState;
    unlocked: BuildingType[];
    firstBeer: BatchProfile | null;
    recipes: Recipe[];
    production: World['production'];
  };
}

export function serialize(world: World, now = Date.now()): SaveFile {
  world.collectBatches();
  return structuredClone({
    version: SAVE_VERSION,
    savedAt: now,
    world: {
      time: world.time,
      tick: world.tick,
      money: world.money,
      expansion: world.expansion,
      nextId: world.nextId,
      rngState: world.rng.state,
      market: world.market,
      batches: { next: world.batches.next, batches: world.batches.batches },
      buildings: [...world.list],
      stats: world.stats,
      tutorial: world.tutorial,
      unlocked: world.unlocked,
      firstBeer: world.firstBeer,
      recipes: world.recipes,
      production: world.production,
    },
  });
}

export function deserialize(raw: unknown): World {
  const save = migrate(raw);
  const s = save.world;
  const world = new World({ money: s.money, tutorial: false });
  world.time = s.time;
  world.tick = s.tick;
  world.rng.state = s.rngState;
  world.market = s.market;
  world.stats = s.stats;
  world.tutorial = s.tutorial;
  world.unlocked = s.unlocked;
  world.firstBeer = s.firstBeer;
  world.recipes = s.recipes;
  world.production = s.production;
  const reg = new BatchRegistry(s.batches.next, s.batches.batches);
  Object.assign(world.batches, reg);
  for (let i = 1; i <= s.expansion; i++) {
    const e = EXPANSIONS[i];
    if (e) world.grid.unlock(e.width, e.height);
  }
  world.expansion = s.expansion;
  for (const b of s.buildings) world.insert(b);
  world.nextId = Math.max(world.nextId, s.nextId);
  return world;
}

export const toJSON = (world: World, now?: number): string => JSON.stringify(serialize(world, now));
export const fromJSON = (json: string): World => deserialize(JSON.parse(json));
