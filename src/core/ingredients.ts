import { countItems, type Building } from './building';
import { BUILDINGS, kindOf, type BuildingDef } from './content/buildings';
import { hopsFor, yeastFor } from './systems/machines';
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

const MIN_BOTTLES = 12; // une caisse
const scale = (b: Building) => (BUILDINGS[b.type] as BuildingDef).batchScale ?? 1;

function missingFor(world: World, b: Building): { item: ItemId; missing: number } | null {
  const r = world.activeRecipe;
  if (!r || !b.machine) return null;
  const items = b.itemsIn ?? [];
  switch (kindOf(b.type)) {
    case 'mill': {
      // Le concasseur alimente la cuve d'empâtage voisine : il faut assez de malt pour le prochain empâtage.
      const mashes = world.neighbors(b).filter((n) => kindOf(n.b.type) === 'mash_tun');
      if (!mashes.length) return null;
      const want = mashes.reduce((s, n) => s + r.grainKg * scale(n.b), 0);
      const inPipeline =
        countItems(items, 'malt') + countItems(b.itemsOut ?? [], 'crushed_malt') +
        mashes.reduce((s, n) => s + countItems(n.b.itemsIn ?? [], 'crushed_malt'), 0);
      return { item: 'malt', missing: Math.max(0, want - inPipeline) };
    }
    case 'mash_tun': {
      // Sans concasseur à côté, on achète du malt déjà concassé.
      if (world.neighbors(b).some((n) => kindOf(n.b.type) === 'mill')) return null;
      if (b.machine.phase !== 'filling' && b.machine.phase !== 'idle') return null;
      return { item: 'crushed_malt', missing: Math.max(0, r.grainKg * scale(b) - countItems(items, 'crushed_malt')) };
    }
    case 'kettle': {
      // Volume attendu : le moût présent, sinon un lot de la taille de la cuve.
      const liters = b.fluidIn?.amount || 19 * scale(b);
      return { item: 'hops', missing: Math.max(0, hopsFor(r.hopsItems, liters) - countItems(items, 'hops')) };
    }
    case 'fermenter': {
      const liters = b.fluidIn?.amount || 19 * scale(b);
      return { item: 'yeast', missing: Math.max(0, yeastFor(liters) - countItems(items, 'yeast')) };
    }
    case 'bottler': {
      const cap = (BUILDINGS[b.type] as BuildingDef).itemsIn!.capacity;
      const want = Math.min(cap, Math.max(MIN_BOTTLES, Math.ceil((b.fluidIn?.amount ?? 0) / BOTTLE_LITERS)));
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
