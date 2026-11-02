import { DEFAULT_CHOICES } from '../brewing/recipe';
import { World } from '../world';

/**
 * Brasserie de référence, utilisée par les tests d'intégration (et réutilisable comme carte de démo).
 *
 *   y0:  [Malt]→[Conv]→[Moulin]→[Conv]→[Empât.]→[Tuyau]→[Ébull.]→[Refr.]→[Refr.]→[Ferm.]→[Tuyau]→[Embout.]→[Stand]
 *   y1:                          [Eau ] [  2x2 ]         [ 2x2 ]                  [2x2 ]          [ 2x2   ] [2x2 ]
 *   y2:                                                  [Houbl]                  [Lev.]          [Bout.]
 */
export function buildReferenceBrewery(opts: { coolers?: boolean; money?: number } = {}): World {
  const w = new World({ money: 1e9, tutorial: false }); // construction gratuite, le budget est fixé à la fin
  w.expand();
  w.expand();
  const place = (...args: Parameters<World['place']>) => {
    const r = w.place(...args);
    if (!r.ok) throw new Error(`placement ${args[0]} @${args[1]},${args[2]} : ${r.reason}`);
    return r.id!;
  };
  place('supplier', 0, 0);
  place('conveyor', 1, 0, 0);
  place('mill', 2, 0);
  place('conveyor', 3, 0, 0);
  place('water_tap', 3, 1);
  place('mash_tun', 4, 0);
  place('conduit', 6, 0, 0);
  place('kettle', 7, 0);
  const hops = place('supplier', 7, 2);
  w.setParam(hops, 'item', 'hops');
  w.setParam(hops, 'interval', 5);
  const coolerType = opts.coolers === false ? 'conduit' : 'cooler';
  place(coolerType, 9, 0, 0);
  place(coolerType, 10, 0, 0);
  place('fermenter', 11, 0);
  const yeast = place('supplier', 11, 2);
  w.setParam(yeast, 'item', 'yeast');
  w.setParam(yeast, 'interval', 10);
  place('conduit', 13, 0, 0);
  place('bottler', 14, 0);
  const bottles = place('supplier', 14, 2);
  w.setParam(bottles, 'item', 'bottle');
  place('stand', 16, 0);
  w.createRecipe('Blonde de référence', DEFAULT_CHOICES);
  w.money = opts.money ?? 1e6;
  return w;
}

export const runSeconds = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) w.step();
};
