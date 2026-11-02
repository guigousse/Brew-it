import { GASTON_RECIPE } from './brewing/model';
import { Game, simulateOffline } from './game';
import { DEFAULT_LABEL } from './label';
import { DISTRIBUTORS } from './market';
import { MemoryStorage, SaveManager } from './save';
import { STATION_ORDER } from './stations';

const run = (g: Game, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) g.step();
};
const runUntil = (g: Game, cond: () => boolean, max = 3000) => {
  for (let i = 0; i < max * 20 && !cond(); i++) g.step();
};
/** Partie avec une première bière gardée dans la gamme. */
const withBeer = (money = 250) => {
  const g = new Game();
  g.money = money;
  g.brew();
  runUntil(g, () => !!g.tastable);
  g.keepTrial('Blonde', DEFAULT_LABEL);
  return g;
};

describe('jeu', () => {
  it('démarre avec la recette de Gaston, 250 €, le bar du coin et de la verrerie (lots de 5 L)', () => {
    const g = new Game();
    expect(g.recipe).toEqual(GASTON_RECIPE);
    expect(g.signed).toEqual(['bar']);
    expect(g.batchLiters).toBe(5);
    expect(g.rangeSlots).toBe(1);
  });

  it('un brassin traverse les 7 appareils ; à la première bouteille, on peut goûter', () => {
    const g = new Game();
    const money = g.money;
    expect(g.brew().ok).toBe(true);
    expect(g.money).toBeLessThan(money);
    const stages: number[] = [];
    g.events.on((e) => e.type === 'stage' && stages.push(e.stage));
    runUntil(g, () => !!g.tastable);
    expect(g.time).toBeLessThan(180); // premier brassin accéléré par Gaston
    expect(stages).toEqual([1, 2, 3, 4, 5, 6]);
    const b = g.tastable!;
    expect(b.bottles).toBe(15);
    expect(b.elapsed).toBeLessThan(b.duration / 5); // dès la première bouteille
    expect(b.tasting!.quality).toBeGreaterThan(0.85);
  });

  it('un essai ne remplit qu\'une bouteille puis attend la dégustation ; recommencer le jette', () => {
    const g = new Game();
    g.brew();
    run(g, 600);
    const b = g.batchAt('bottling')!;
    expect(g.tastable).toBe(b);
    expect(b.elapsed).toBeCloseTo(b.duration / b.bottles!); // une seule bouteille remplie
    expect(g.discardTrial().ok).toBe(true);
    expect(g.batchAt('bottling')).toBeUndefined();
  });

  it('garder l\'essai relance l\'embouteillage : toutes ses bouteilles vont au stock', () => {
    const g = new Game();
    g.brew();
    run(g, 600);
    expect(g.keepTrial('Blonde', DEFAULT_LABEL).ok).toBe(true);
    run(g, 60);
    expect(g.beers[0]!.stock + g.beers[0]!.sold).toBe(15);
    expect(g.batchAt('bottling')).toBeUndefined();
  });

  it('moulin occupé : le brassin attend son tour, avant le brassage continu', () => {
    const g = withBeer(1e4);
    g.autoBrew = true;
    g.step();
    expect(g.batchAt('mill')!.beerId).toBe(g.beers[0]!.id);
    g.setParam('hopsAroma', 80);
    expect(g.brew().ok).toBe(false);
    expect(g.queueBrew().ok).toBe(true);
    runUntil(g, () => !g.queued);
    expect(g.batchAt('mill')!.beerId).toBeNull(); // l'essai est passé en priorité
  });

  it('le bar achète 1 bouteille par minute', () => {
    const g = withBeer();
    const sold = g.beers[0]!.sold;
    const money = g.money;
    run(g, 180);
    expect(g.beers[0]!.sold - sold).toBeGreaterThanOrEqual(3);
    expect(g.beers[0]!.sold - sold).toBeLessThanOrEqual(5);
    expect(g.money).toBeGreaterThan(money);
  });

  it('les distributeurs commandent par lots : il faut assez de stock d\'une même bière', () => {
    const g = withBeer();
    runUntil(g, () => g.batches.length === 0);
    g.signed = ['epicerie'];
    g.beers[0]!.stock = 5;
    g.beers[0]!.sold = 0;
    run(g, 600);
    expect(g.beers[0]!.sold).toBe(0); // commande de 6, seulement 5 en stock
    g.beers[0]!.stock = 12;
    run(g, 1);
    expect(g.beers[0]!.sold).toBe(12); // deux commandes de 6 en attente partent d'un coup
  });

  it('plus de bières qui plaisent, plus de commandes ; la négociation augmente le volume', () => {
    const g = withBeer(1e6);
    const one = g.orderRate('bar');
    g.buySlot();
    g.beers.push({ ...g.beers[0]!, id: 999, name: 'Deux' });
    expect(g.orderRate('bar')).toBeCloseTo(one * 1.25);
    const c1 = g.dealCost('bar')!;
    expect(g.negotiate('bar').ok).toBe(true);
    expect(g.dealCost('bar')!).toBeGreaterThan(c1);
    expect(g.orderRate('bar')).toBeCloseTo(one * 1.25 * 1.4);
    for (let i = 0; i < 4; i++) g.negotiate('bar');
    expect(g.dealCost('bar')).toBeNull();
    expect(g.negotiate('bar').ok).toBe(false);
  });

  it('la gamme s\'agrandit en achetant des places, de plus en plus chères', () => {
    const g = withBeer(1e7);
    g.setParam('hopsAroma', 60);
    expect(g.selectedBeer).toBeNull(); // réglages modifiés : on brasse un essai
    runUntil(g, () => g.canBrew().ok);
    g.brew();
    runUntil(g, () => !!g.tastable);
    expect(g.keepTrial('B', DEFAULT_LABEL).ok).toBe(false);
    const c2 = g.nextSlotCost!;
    const money = g.money;
    expect(g.buySlot().ok).toBe(true);
    expect(g.money).toBe(money - c2);
    expect(g.keepTrial('B', DEFAULT_LABEL).ok).toBe(true);
    const c3 = g.nextSlotCost!;
    g.buySlot();
    const c4 = g.nextSlotCost!;
    expect(c3).toBeGreaterThan(c2);
    expect(c4 - c3).toBeGreaterThan(c3 - c2); // la hausse s'accélère
  });

  it('le stockage se remplit ; plein, il bloque l\'embouteillage jusqu\'à l\'agrandissement', () => {
    const g = withBeer(1e4);
    g.signed = []; // personne n'achète
    g.beers[0]!.stock = 110;
    expect(g.storageCap).toBe(120);
    g.loadBeer(g.beers[0]!.id);
    g.brew();
    runUntil(g, () => g.bottlingBlocked);
    expect(g.stored).toBe(120);
    const done = g.batchesDone;
    expect(g.upgradeStorage().ok).toBe(true);
    g.step();
    expect(g.bottlingBlocked).toBe(false);
    expect(g.batchesDone).toBe(done + 1);
  });

  it('une bière imbuvable ne peut pas entrer dans la gamme', () => {
    const g = new Game();
    g.setParam('pitchTemp', 55);
    g.brew();
    runUntil(g, () => !!g.tastable);
    expect(g.keepTrial('Ratée', DEFAULT_LABEL).ok).toBe(false);
  });

  it('5 niveaux : on améliore même pendant un brassin ; le plus petit appareil fixe le volume', () => {
    const g = new Game();
    g.money = 1e9;
    g.brew();
    expect(g.upgrade('mill').ok).toBe(true); // appareil occupé : pas besoin d'attendre
    expect(g.batchLiters).toBe(5);
    for (const lv of [20, 60, 200, 600]) {
      for (const id of STATION_ORDER) g.upgrade(id);
      if (lv === 20) g.upgrade('mill'); // déjà un niveau d'avance
      expect(g.batchLiters).toBe(Math.min(lv, 600));
    }
    expect(g.upgrade('mill').ok).toBe(false); // niveau 5 = maximum
  });

  it('plus d\'argent ni de stock : Gaston avance les ingrédients', () => {
    const g = new Game();
    g.money = 0;
    expect(g.broke).toBe(true);
    expect(g.brew().ok).toBe(true);
    expect(g.money).toBe(0);
  });

  it('brassage continu : toute la gamme tourne, la bière la moins en stock d\'abord', () => {
    const g = withBeer(1e4);
    g.buySlot();
    g.beers.push({ ...g.beers[0]!, id: 999, name: 'Deux', stock: 0, sold: 0 });
    g.beers[0]!.stock = 50;
    g.autoBrew = true;
    g.step();
    expect(g.batchAt('mill')!.beerId).toBe(999);
    run(g, 1500);
    expect(g.batchesDone).toBeGreaterThanOrEqual(3);
  });

  it('production hors-ligne : les gains attendent la récolte, la sauvegarde les garde', async () => {
    const g = withBeer(1e4);
    g.autoBrew = true;
    const money = g.money;
    const report = simulateOffline(g, 3600)!;
    expect(report.sold).toBeGreaterThan(40);
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

  it('les anciennes sauvegardes (3 niveaux) passent aux niveaux 2 à 4', () => {
    const g = new Game();
    const old = { ...g.toJSON(), version: 3, stations: { ...g.stations, mill: { level: 3 } } };
    delete (old as { deals?: unknown }).deals;
    const loaded = Game.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(loaded.level('mill')).toBe(4);
    expect(loaded.level('mash')).toBe(2);
    expect(loaded.deals).toEqual({});
  });

  it('la brasserie prend le niveau de son appareil le moins avancé et ouvre de nouveaux distributeurs', () => {
    const g = new Game();
    g.money = 1e9;
    g.totalSold = 1e7;
    const levels: number[] = [];
    g.events.on((e) => e.type === 'breweryLevel' && levels.push(e.level));
    expect(g.breweryLevel).toBe(1);
    expect(g.sign('caviste').ok).toBe(false); // il faut le niveau 2
    for (const id of STATION_ORDER.slice(0, 6)) g.upgrade(id);
    expect(g.breweryLevel).toBe(1); // l'embouteillage est encore au niveau 1
    g.upgrade('bottling');
    expect(g.breweryLevel).toBe(2);
    expect(g.breweryName).toBe('Garage');
    expect(levels).toEqual([2]);
    expect(g.sign('caviste').ok).toBe(true);
    expect(g.distributorOpen('restaurant')).toBe(false);
  });

  it('chaque distributeur a une commande que le stockage maximal peut contenir', () => {
    for (const d of DISTRIBUTORS) expect(d.order).toBeLessThanOrEqual(600 * 12);
  });
});
