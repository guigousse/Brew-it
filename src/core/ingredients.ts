import { countItems, type Building } from './building';
import { BOTTLE_LITERS, type ItemId } from './content/items';
import { ITEM_PRICES } from './economy/market';
import type { World } from './world';

/** Un ingrédient qui manque à une machine : affiché comme une icône « + » à toucher. */
export interface IngredientNeed {
  buildingId: number;
  item: ItemId;
  missing: number;
  unitPrice: number;
  total: number;
}

const BOTTLER_CAPACITY = 60;
const MIN_BOTTLES = 12; // une caisse

function missingFor(world: World, b: Building): { item: ItemId; missing: number } | null {
  const r = world.activeRecipe;
  if (!r || !b.machine) return null;
  const items = b.itemsIn ?? [];
  switch (b.type) {
    case 'mill': {
      // Le concasseur alimente la cuve d'empâtage voisine : il faut assez de malt pour le prochain empâtage.
      const mashes = world.neighbors(b).filter((n) => n.b.type === 'mash_tun');
      if (!mashes.length) return null;
      const inPipeline =
        countItems(items, 'malt') + countItems(b.itemsOut ?? [], 'crushed_malt') +
        mashes.reduce((s, n) => s + countItems(n.b.itemsIn ?? [], 'crushed_malt'), 0);
      return { item: 'malt', missing: Math.max(0, r.grainKg - inPipeline) };
    }
    case 'mash_tun': {
      // Sans concasseur à côté, on achète du malt déjà concassé.
      if (world.neighbors(b).some((n) => n.b.type === 'mill')) return null;
      if (b.machine.phase !== 'filling' && b.machine.phase !== 'idle') return null;
      return { item: 'crushed_malt', missing: Math.max(0, r.grainKg - countItems(items, 'crushed_malt')) };
    }
    case 'kettle':
      return { item: 'hops', missing: Math.max(0, r.hopsItems - countItems(items, 'hops')) };
    case 'fermenter':
      return { item: 'yeast', missing: Math.max(0, 1 - countItems(items, 'yeast')) };
    case 'bottler': {
      const want = Math.min(BOTTLER_CAPACITY, Math.max(MIN_BOTTLES, Math.ceil((b.fluidIn?.amount ?? 0) / BOTTLE_LITERS)));
      return { item: 'bottle', missing: Math.max(0, want - countItems(items, 'bottle')) };
    }
    default:
      return null;
  }
}

export function needOf(world: World, b: Building): IngredientNeed | null {
  const m = missingFor(world, b);
  if (!m || m.missing <= 0) return null;
  const unitPrice = ITEM_PRICES[m.item] ?? 1;
  return { buildingId: b.id, item: m.item, missing: m.missing, unitPrice, total: unitPrice * m.missing };
}

/** Tous les ingrédients manquants de la brasserie. */
export function ingredientNeeds(world: World): IngredientNeed[] {
  const out: IngredientNeed[] = [];
  for (const b of world.list) {
    const n = needOf(world, b);
    if (n) out.push(n);
  }
  return out;
}
