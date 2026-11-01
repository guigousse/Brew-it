import { countItems, type Building, type ItemUnit } from '../building';
import { BUILDINGS } from '../content/buildings';
import type { World } from '../world';

/** Un bâtiment accepte-t-il cet objet venant de `source` ? (sans l'insérer) */
export function acceptsItem(world: World, target: Building, source: Building, unit: ItemUnit): boolean {
  if (target.health <= 0) return false;
  const def = BUILDINGS[target.type];
  if (target.belt && 'conveyor' in def) {
    if (world.front(target) === source) return false; // pas de retour en arrière
    const spacing = 1 / def.conveyor.capacity;
    if (target.belt.length >= def.conveyor.capacity) return false;
    const last = target.belt[target.belt.length - 1];
    return !last || last.pos >= spacing;
  }
  if (target.itemsIn && 'itemsIn' in def) {
    const accepts = def.itemsIn.accepts as readonly string[];
    return accepts.includes(unit.item) && countItems(target.itemsIn, unit.item) < def.itemsIn.capacity;
  }
  return false;
}

/** Tente de transférer un objet. Renvoie true si l'objet a été pris. */
export function offerItem(world: World, target: Building, source: Building, unit: ItemUnit): boolean {
  if (!acceptsItem(world, target, source, unit)) return false;
  if (target.belt) target.belt.push({ ...unit, pos: 0 });
  else target.itemsIn!.push({ ...unit });
  return true;
}

/**
 * Les machines « déversent » leur sortie vers un voisin (round-robin), un objet par tick.
 * Les convoyeurs ont leur propre logique (ils ne poussent que vers l'avant).
 */
export function dumpItems(world: World, b: Building): void {
  const out = b.itemsOut;
  if (!out || out.length === 0 || b.health <= 0) return;
  const neighbors = world.neighbors(b);
  const n = neighbors.length;
  for (let k = 0; k < n; k++) {
    const idx = (b.dumpIndex + k) % n;
    if (offerItem(world, neighbors[idx]!.b, b, out[0]!)) {
      out.shift();
      b.dumpIndex = (idx + 1) % n;
      return;
    }
  }
}

/** Avance les objets sur chaque convoyeur et les passe au bâtiment situé devant. */
export function updateConveyors(world: World, dt: number): void {
  for (const b of world.list) {
    const belt = b.belt;
    if (!belt || belt.length === 0 || b.health <= 0) continue;
    const def = BUILDINGS[b.type];
    if (!('conveyor' in def)) continue;
    const spacing = 1 / def.conveyor.capacity;
    const move = def.conveyor.speed * dt;
    // belt[0] est l'objet le plus avancé.
    for (let i = 0; i < belt.length; i++) {
      const limit = i === 0 ? 1 : belt[i - 1]!.pos - spacing;
      belt[i]!.pos = Math.max(belt[i]!.pos, Math.min(belt[i]!.pos + move, limit));
    }
    const head = belt[0]!;
    if (head.pos >= 1) {
      const target = world.front(b);
      if (target && offerItem(world, target, b, { item: head.item, batch: head.batch })) belt.shift();
    }
  }
}
