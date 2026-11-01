import { MemoryStorage, SaveManager } from '../save/storage';
import { fromJSON, toJSON } from '../save/serialize';
import { simulateOffline } from '../sim/loop';
import { buildReferenceBrewery, runSeconds } from './scenarios';
import type { GameEvent } from '../events';

describe('brasserie complète (intégration)', () => {
  it('produit, embouteille et vend de la bière', () => {
    const w = buildReferenceBrewery();
    const events: GameEvent[] = [];
    w.events.on((e) => events.push(e));
    const start = w.money;
    runSeconds(w, 600);

    const sales = events.filter((e) => e.type === 'sale');
    expect(events.some((e) => e.type === 'batchLost')).toBe(false);
    expect(sales.length).toBeGreaterThan(10);
    const beer = w.batches.get(sales[0]!.type === 'sale' ? sales[0]!.batchId : null)!;
    expect(beer.abv).toBeGreaterThan(4);
    expect(beer.ibu).toBeGreaterThan(30);
    expect(beer.strain).toBe('ale_us');
    // Les ventes finissent par couvrir les achats de matières premières.
    const revenue = sales.reduce((s, e) => s + (e.type === 'sale' ? e.price : 0), 0);
    expect(revenue).toBeGreaterThan(0);
    expect(w.money).not.toBe(start);
  });

  it('sans refroidisseur, le moût bouillant tue la levure : lot perdu', () => {
    const w = buildReferenceBrewery({ coolers: false });
    const lost: string[] = [];
    w.events.on((e) => e.type === 'batchLost' && lost.push(e.reason));
    runSeconds(w, 200);
    expect(lost.length).toBeGreaterThan(0);
    expect(lost[0]).toMatch(/Levure tuée/);
  });
});

describe('sauvegarde', () => {
  it('est déterministe : une partie rechargée évolue exactement comme l’originale', () => {
    const a = buildReferenceBrewery();
    runSeconds(a, 250);
    const b = fromJSON(toJSON(a));
    runSeconds(a, 250);
    runSeconds(b, 250);
    expect(b.money).toBeCloseTo(a.money, 9);
    expect(toJSON(b, 0)).toEqual(toJSON(a, 0));
  });

  it('passe par le SaveManager et calcule le temps hors-ligne', async () => {
    const storage = new MemoryStorage();
    const mgr = new SaveManager(storage);
    const w = buildReferenceBrewery();
    runSeconds(w, 100);
    await mgr.save(w, 1_000_000);
    const loaded = await mgr.load(1_000_000 + 3_600_000);
    expect(loaded!.elapsedSeconds).toBe(3600);
    const { simulated } = simulateOffline(loaded!.world, loaded!.elapsedSeconds);
    expect(simulated).toBe(3600);
  });

  it('refuse une sauvegarde d’une version future', () => {
    expect(() => fromJSON(JSON.stringify({ version: 999, savedAt: 0, world: {} }))).toThrow(/trop récente/);
  });
});
