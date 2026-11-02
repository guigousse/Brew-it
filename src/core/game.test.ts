import { GASTON_RECIPE } from './brewing/model';
import { Game, simulateOffline } from './game';
import { DEFAULT_LABEL } from './label';
import { BAR, CLIENTS, kegSpace, MAX_PENDING, ORDER_LIFE_S } from './market';
import { popTarget, TREND_COUNT, TRENDS } from './trends';
import { MemoryStorage, SaveManager } from './save';
import { STATION_ORDER } from './stations';
import { STORAGE } from './warehouse';

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
    expect(g.signed).toEqual([]);
    expect(g.barLevel).toBe(1);
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

  it('un brassin programmé en fûts remplit des fûts de 5 L rangés au stockage', () => {
    const g = withBeer(1e4);
    runUntil(g, () => g.batches.length === 0);
    const beer = g.beers[0]!;
    const stock = beer.stock;
    expect(g.planBrew(beer.id, 'keg').ok).toBe(true);
    g.step();
    expect(g.plan).toEqual([]);
    expect(g.batchAt('mill')!.format).toBe('keg');
    runUntil(g, () => g.batches.length === 0);
    expect(beer.kegs).toEqual([20]); // lot de 5 L = 1 fût de 20 verres
    expect(beer.stock).toBe(stock);
    expect(g.stored).toBe(stock + kegSpace(20)); // environ une caisse
  });

  it('les brassins programmés passent avant le brassage continu, dans l\'ordre', () => {
    const g = withBeer(1e4);
    runUntil(g, () => g.batches.length === 0);
    g.autoBrew = true;
    g.planBrew(g.beers[0]!.id, 'keg');
    g.planBrew(g.beers[0]!.id, 'bottle');
    g.step();
    expect(g.batchAt('mill')!.format).toBe('keg');
    expect(g.plan.length).toBe(1);
  });

  it('le bar sert des verres tirés du fût branché, 1 client toutes les 10 min au début ; il faut changer le fût vide', () => {
    const g = withBeer(1e4);
    const beer = g.beers[0]!;
    expect(g.barServing).toBe(false);
    expect(g.swapKeg(0, beer.id).ok).toBe(false); // aucun fût plein
    beer.kegs = [20, 40];
    expect(g.swapKeg(0, beer.id).ok).toBe(true);
    expect(beer.kegs).toEqual([20]); // le plus gros fût est branché
    expect(g.taps[0]).toEqual({ beerId: beer.id, glasses: 40, capacity: 40 });
    beer.pop = 0;
    expect(g.barRate).toBeCloseTo(0.1, 1);
    const money = g.money;
    run(g, 3600); // 1 h
    const served = 40 - g.taps[0]!.glasses;
    expect(served).toBeGreaterThanOrEqual(5);
    expect(served).toBeLessThanOrEqual(10);
    expect(g.money).toBeGreaterThan(money);
    expect(beer.pop).toBeGreaterThan(0); // chaque verre fait connaître la bière
    g.taps[0]!.glasses = 1;
    run(g, 3600);
    expect(g.taps[0]!.glasses).toBe(0);
    expect(g.barServing).toBe(false); // le fût est vide : il faut le changer à la main
  });

  it('la popularité fait venir du monde ; elle s\'érode sans ventes', () => {
    const g = withBeer(1e4);
    const beer = g.beers[0]!;
    beer.kegs = [20];
    g.swapKeg(0, beer.id);
    beer.pop = 0;
    const low = g.barRate;
    beer.pop = 1;
    expect(g.brand).toBeCloseTo(1);
    expect(g.barRate).toBeCloseTo(low * 10);
    g.taps[0]!.glasses = 0;
    simulateOffline(g, 8 * 3600);
    expect(beer.pop).toBeLessThan(0.95);
    expect(beer.pop).toBeGreaterThan(0.8);
  });

  it('trois tendances à la fois, qui changent avec le temps ; une bière dans la tendance vise plus haut', () => {
    const g = withBeer(1e4);
    expect(g.trends.length).toBe(TREND_COUNT);
    const first = g.trends.map((t) => t.id);
    simulateOffline(g, 8 * 3600);
    simulateOffline(g, 8 * 3600);
    expect(g.trends.length).toBe(TREND_COUNT);
    expect(g.trends.map((t) => t.id)).not.toEqual(first);
    const t = g.beers[0]!.tasting;
    const def = TRENDS.find((d) => d.test(t))!;
    expect(popTarget(t, [{ id: def.id, until: 1e9 }])).toBeGreaterThan(popTarget(t, []));
  });

  it('agrandir le bar ajoute des tireuses', () => {
    const g = withBeer(1e6);
    expect(g.taps.length).toBe(1);
    expect(g.upgradeBar().ok).toBe(true);
    expect(g.taps.length).toBe(BAR[1]!.taps);
  });

  it('un client sous contrat envoie des commandes ; remplies, elles sont payées aussitôt', () => {
    const g = withBeer(1e4);
    g.totalSold = 100;
    expect(g.sign('epicerie').ok).toBe(true);
    run(g, 30);
    expect(g.orders.length).toBe(1);
    const o = g.orders[0]!;
    expect(o.qty).toBe(g.orderSize('epicerie'));
    const beer = g.beers[0]!;
    beer.stock = o.qty - 1;
    expect(g.fulfill(o.id, [beer.id]).ok).toBe(false); // il manque une bouteille
    beer.stock = o.qty + 10;
    const q = g.quote(o, [beer.id]);
    expect(q.filled).toBe(o.qty);
    const money = g.money;
    const r = g.fulfill(o.id, [beer.id]);
    expect(r.ok).toBe(true);
    expect(g.money).toBeCloseTo(money + q.amount);
    expect(beer.stock).toBe(10);
    expect(g.orders.length).toBe(0);
  });

  it('les commandes s\'accumulent (3 par client au plus) puis expirent', () => {
    const g = withBeer(1e4);
    g.totalSold = 100;
    g.sign('epicerie');
    simulateOffline(g, 3 * 3600);
    expect(g.orders.length).toBe(MAX_PENDING);
    const first = g.orders[0]!;
    simulateOffline(g, ORDER_LIFE_S);
    expect(g.orders.some((o) => o.id === first.id)).toBe(false);
    expect(g.orders.length).toBeGreaterThan(0);
  });

  it('une commande exigeant un style refuse les bières qui ne le respectent pas', () => {
    const g = withBeer(1e9);
    g.totalSold = 1e7;
    for (let i = 0; i < 4; i++) for (const id of STATION_ORDER) g.upgrade(id);
    g.sign('caviste');
    const beer = g.beers[0]!;
    beer.stock = 1000;
    beer.tasting = { ...beer.tasting, quality: 0.9, aroma: 0.1 };
    g.orders = [{ id: 1, client: 'caviste', qty: 12, like: true, received: 0, expires: 1e9 }];
    expect(g.suitable(g.orders[0]!)).toEqual([]);
    beer.tasting = { ...beer.tasting, aroma: 0.8 };
    expect(g.fulfill(1, [beer.id]).ok).toBe(true);
  });

  it('la négociation agrandit les commandes', () => {
    const g = withBeer(1e6);
    g.totalSold = 100;
    g.sign('epicerie');
    g.storageLevel = 5; // les commandes ne dépassent jamais les 3/4 du stockage
    const one = g.orderSize('epicerie');
    const c1 = g.dealCost('epicerie')!;
    expect(g.negotiate('epicerie').ok).toBe(true);
    expect(g.dealCost('epicerie')!).toBeGreaterThan(c1);
    expect(g.orderSize('epicerie')).toBeGreaterThan(one * 1.2); // +40 %, arrondi à la demi-caisse
    for (let i = 0; i < 4; i++) g.negotiate('epicerie');
    expect(g.dealCost('epicerie')).toBeNull();
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
    runUntil(g, () => g.batches.length === 0);
    g.beers[0]!.kegs = [60];
    g.swapKeg(0, g.beers[0]!.id);
    g.beers[0]!.pop = 1;
    const money = g.money;
    const report = simulateOffline(g, 3600)!;
    expect(report.sold).toBeGreaterThan(50); // 1 client/min pour une marque au sommet
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

  it('sauvegardes v4 : le bar du coin devient la pièce Bar, les autres contrats restent', () => {
    const g = withBeer();
    const old = { ...g.toJSON(), version: 4, signed: ['bar', 'epicerie'], deals: { bar: 2 }, demand: { bar: 0.5 } } as Record<string, unknown>;
    for (const k of ['barLevel', 'taps', 'orders', 'orderTimers', 'trends', 'plan']) delete old[k];
    old.beers = (old.beers as Record<string, unknown>[]).map(({ kegs: _k, pop: _p, ...b }) => b);
    const loaded = Game.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(loaded.signed).toEqual(['epicerie']);
    expect(loaded.deals).toEqual({});
    expect(loaded.taps).toEqual([{ beerId: null, glasses: 0, capacity: 0 }]);
    expect(loaded.beers[0]!.kegs).toEqual([]);
    expect(loaded.beers[0]!.pop).toBeGreaterThan(0);
    expect(loaded.orders).toEqual([]);
    run(loaded, 30);
    expect(loaded.orders.length).toBe(1);
  });

  it('la brasserie prend le niveau de son appareil le moins avancé et ouvre de nouveaux clients', () => {
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
    expect(g.clientOpen('restaurant')).toBe(false);
  });

  it('chaque commande, même négociée au maximum, tient dans le stockage maximal', () => {
    const g = new Game();
    for (const c of CLIENTS) {
      g.deals[c.id] = 5;
      expect(g.orderSize(c.id)).toBeLessThanOrEqual(STORAGE[STORAGE.length - 1]!.crates * 12);
    }
  });
});
