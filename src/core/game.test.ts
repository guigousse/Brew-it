import { GASTON_RECIPE } from './brewing/model';
import { Game, simulateOffline } from './game';
import { MemoryStorage, SaveManager } from './save';

const run = (g: Game, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) g.step();
};
const runUntil = (g: Game, cond: () => boolean, max = 1200) => {
  for (let i = 0; i < max * 20 && !cond(); i++) g.step();
};

describe('jeu', () => {
  it('démarre avec la recette de Gaston, 250 € et le bar du coin', () => {
    const g = new Game();
    expect(g.recipe).toEqual(GASTON_RECIPE);
    expect(g.signed).toEqual(['bar']);
    expect(g.batchLiters).toBe(20);
    expect(g.rangeSlots).toBe(1);
  });

  it('un brassin traverse les 7 appareils de haut en bas puis se déguste', () => {
    const g = new Game();
    const money = g.money;
    expect(g.brew().ok).toBe(true);
    expect(g.money).toBeLessThan(money);
    const stages: number[] = [];
    g.events.on((e) => e.type === 'stage' && stages.push(e.stage));
    runUntil(g, () => g.pending.length > 0);
    expect(stages).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.pending[0]!.bottles).toBe(60);
    expect(g.pending[0]!.tasting.quality).toBeGreaterThan(0.85);
  });

  it('chaque appareil traite un lot à la fois : les brassins s\'enchaînent', () => {
    const g = new Game();
    g.money = 1e4;
    g.brew();
    expect(g.brew().ok).toBe(false); // moulin occupé
    run(g, 10);
    expect(g.brew().ok).toBe(true);
    expect(g.batches.length).toBe(2);
  });

  it('ajouter l\'essai à la gamme, puis le bar achète les bouteilles', () => {
    const g = new Game();
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    expect(g.addToRange('Blonde de Gaston').ok).toBe(true);
    expect(g.selectedBeer).toBe(g.beers[0]!.id);
    const money = g.money;
    run(g, 60);
    expect(g.beers[0]!.sold).toBeGreaterThan(8);
    expect(g.money).toBeGreaterThan(money);
  });

  it('la gamme est limitée par le nombre de distributeurs signés', () => {
    const g = new Game();
    g.money = 1e5;
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    g.addToRange('A');
    g.setParam('hopsAroma', 60);
    expect(g.selectedBeer).toBeNull(); // réglages modifiés : on brasse un essai
    run(g, 10);
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    expect(g.addToRange('B').ok).toBe(false);
    g.totalSold = 200;
    expect(g.sign('epicerie').ok).toBe(true);
    expect(g.addToRange('B').ok).toBe(true);
  });

  it('une bière imbuvable ne peut pas entrer dans la gamme', () => {
    const g = new Game();
    g.setParam('pitchTemp', 55);
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    expect(g.addToRange('Ratée').ok).toBe(false);
  });

  it('améliorer un appareil : plus gros lots quand tous suivent, plus de précision', () => {
    const g = new Game();
    g.money = 1e5;
    expect(g.upgrade('mash').ok).toBe(true);
    expect(g.batchLiters).toBe(20); // les autres appareils limitent encore
    for (const id of ['mill', 'boil', 'cooler', 'fermenter', 'conditioning', 'bottling'] as const) g.upgrade(id);
    expect(g.batchLiters).toBe(60);
  });

  it('brassage automatique d\'une bière de la gamme', () => {
    const g = new Game();
    g.money = 1e4;
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    g.addToRange('Blonde');
    g.autoBrew = true;
    run(g, 400);
    expect(g.batchesDone).toBeGreaterThan(2);
    expect(g.beers[0]!.stock + g.beers[0]!.sold).toBeGreaterThan(120);
  });

  it('production hors-ligne : les gains attendent la récolte, la sauvegarde les garde', async () => {
    const g = new Game();
    g.money = 1e4;
    g.brew();
    runUntil(g, () => g.pending.length > 0);
    g.addToRange('Blonde');
    g.autoBrew = true;
    const money = g.money;
    const report = simulateOffline(g, 3600)!;
    expect(report.sold).toBeGreaterThan(100);
    expect(report.earned).toBeGreaterThan(0);
    expect(g.money).toBeLessThanOrEqual(money);
    const store = new SaveManager(new MemoryStorage());
    await store.save(g, 0);
    const loaded = (await store.load(1000))!.game;
    expect(loaded.offline!.earned).toBeCloseTo(report.earned);
    const before = loaded.money;
    loaded.collectOffline();
    expect(loaded.money).toBeCloseTo(before + report.earned);
  });
});
