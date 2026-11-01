import { World } from '../world';
import { Grid } from './grid';

describe('Grid', () => {
  it('refuse le placement hors de la zone déverrouillée et sur une case occupée', () => {
    const g = new Grid(20, 20, 5, 5);
    expect(g.canPlace(0, 0, 2)).toBe(true);
    expect(g.canPlace(4, 4, 2)).toBe(false); // déborde
    g.fill(7, 0, 0, 2);
    expect(g.get(1, 1)).toBe(7);
    expect(g.canPlace(1, 1, 1)).toBe(false);
    g.clear(0, 0, 2);
    expect(g.canPlace(1, 1, 1)).toBe(true);
  });

  it('agrandit la carte sans déplacer les bâtiments existants', () => {
    const w = new World({ tutorial: false, money: 1e6 });
    const r = w.place('tank', 0, 0);
    expect(w.place('conduit', 12, 0).ok).toBe(false);
    expect(w.expand().ok).toBe(true);
    expect(w.place('conduit', 12, 0).ok).toBe(true);
    expect(r.ok && w.at(1, 1)?.id).toBe(r.ok && r.id);
  });

  it('calcule les voisins uniques d’un bâtiment multi-cases', () => {
    const w = new World({ tutorial: false, money: 1e6 });
    const tank = w.place('tank', 1, 1); // occupe (1..2, 1..2)
    w.place('conduit', 3, 1);
    w.place('conduit', 3, 2);
    w.place('conduit', 0, 1);
    if (!tank.ok) throw new Error();
    const ns = w.neighbors(w.buildings.get(tank.id!)!);
    expect(ns.map((n) => n.dir).sort()).toEqual([0, 0, 2]);
  });

  it('débite le coût et rembourse partiellement', () => {
    const w = new World({ tutorial: false, money: 100 });
    const r = w.place('supplier', 0, 0);
    expect(w.money).toBe(0);
    expect(w.place('conveyor', 1, 0)).toMatchObject({ ok: false, reason: 'Fonds insuffisants' });
    w.remove(r.ok ? r.id! : -1);
    expect(w.money).toBe(75);
  });
});
