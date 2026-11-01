import { countItems } from '../building';
import { World } from '../world';

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) w.step();
};

describe('convoyeurs', () => {
  it('acheminent la livraison jusqu’au concasseur qui produit du malt concassé', () => {
    const w = new World({ money: 1e4 });
    w.place('supplier', 0, 0);
    w.place('conveyor', 1, 0, 0);
    w.place('conveyor', 2, 0, 0);
    w.place('conveyor', 3, 0, 0);
    const mill = w.place('mill', 4, 0);
    run(w, 10);
    const m = w.buildings.get(mill.ok ? mill.id! : -1)!;
    expect(countItems(m.itemsOut!, 'crushed_malt')).toBeGreaterThan(3);
  });

  it('respectent l’espacement et la capacité', () => {
    const w = new World({ money: 1e4 });
    w.place('supplier', 0, 0);
    const c = w.place('conveyor', 1, 0, 0); // ne mène nulle part : se remplit
    run(w, 10);
    const belt = w.buildings.get(c.ok ? c.id! : -1)!.belt!;
    expect(belt.length).toBe(3);
    for (let i = 1; i < belt.length; i++) expect(belt[i - 1]!.pos - belt[i]!.pos).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
  });

  it('ne remontent pas un convoyeur orienté vers la source', () => {
    const w = new World({ money: 1e4 });
    w.place('supplier', 1, 0);
    const c = w.place('conveyor', 0, 0, 0); // pointe vers la livraison
    run(w, 3);
    expect(w.buildings.get(c.ok ? c.id! : -1)!.belt!.length).toBe(0);
  });
});
