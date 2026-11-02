import { GASTON_RECIPE } from './brewing/model';
import { Game, simulateOffline } from './game';
import { DEFAULT_LABEL } from './label';
import { BAR, kegSpace, PARTY } from './market';
import { COMPUTERS, WHOLESALE_PRICE, drawOrder, FIRST_ORDER_S, openTypes, ORDER_LIFE_MAX_S, type Order } from './orders';
import { Rng } from './rng';
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
  it('démarre avec la recette de Gaston, 250 €, un petit bar et de la verrerie (lots de 5 L)', () => {
    const g = new Game();
    expect(g.recipe).toEqual(GASTON_RECIPE);
    expect(g.orders).toEqual([]);
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
    // la verrerie du niveau 1 est imprécise : un lot peut être raté, on recommence
    for (let k = 0; k < 5 && !beer.kegs.length; k++) {
      g.planBrew(beer.id, 'keg');
      g.step();
      runUntil(g, () => g.batches.length === 0);
    }
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

  it('une commande arrive au tableau ; remplie, elle est payée le montant annoncé', () => {
    const g = withBeer(1e4);
    run(g, FIRST_ORDER_S + 1);
    expect(g.orders.length).toBe(1);
    const o = g.orders[0]!;
    // première commande : quelques bouteilles ou un fût, jamais une palette
    expect(o.kind === 'keg' ? o.qty : o.qty / 24).toBeLessThanOrEqual(2);
    const order: Order = { ...o, kind: 'classic', qty: 12, want: undefined, mix: undefined, minQuality: 0.3, reward: 50 };
    g.orders = [order];
    const beer = g.beers[0]!;
    beer.stock = 11;
    expect(g.fulfill(order.id, [beer.id]).ok).toBe(false); // il manque une bouteille
    beer.stock = 20;
    const money = g.money;
    expect(g.fulfill(order.id, g.autoPick(order)).ok).toBe(true);
    expect(g.money).toBe(money + 50);
    expect(beer.stock).toBe(8);
    expect(g.orders.length).toBe(0);
  });

  it('peu de commandes : une toutes les 30 à 60 min, tant que le tableau a de la place ; elles expirent', () => {
    const g = withBeer(1e4);
    run(g, 3600);
    expect(g.orders.length).toBeLessThanOrEqual(2);
    simulateOffline(g, 4 * 3600);
    expect(g.orders.length).toBe(COMPUTERS[0]!.slots); // le tableau est plein : plus rien n'arrive
    const first = g.orders[0]!;
    simulateOffline(g, ORDER_LIFE_MAX_S);
    expect(g.orders.some((o) => o.id === first.id)).toBe(false);
  });

  it('style recherché, assortiment, fûts : chaque commande a ses exigences', () => {
    const g = withBeer(1e4);
    const beer = g.beers[0]!;
    beer.stock = 100;
    beer.tasting = { ...beer.tasting, quality: 0.9, abv: 4.5 };
    const base = { id: 1, type: 'bistrot', client: 'Le Zinc', minQuality: 0.3, reward: 100, received: 0, expires: 1e9 };
    g.orders = [{ ...base, kind: 'style', qty: 12, want: 'strong' }];
    expect(g.suitable(g.orders[0]!)).toEqual([]); // 4,5 % : pas une bière forte
    g.orders = [{ ...base, kind: 'style', qty: 12, want: 'light' }];
    expect(g.fulfill(1, [beer.id]).ok).toBe(true);
    g.orders = [{ ...base, kind: 'mix', qty: 24, mix: 2 }];
    expect(g.fulfill(1, [beer.id]).ok).toBe(false); // une seule bière
    g.buySlot();
    g.beers.push({ ...beer, id: 999, name: 'Deux', stock: 30 });
    expect(g.fulfill(1, [beer.id, 999]).ok).toBe(true);
    expect(g.beers[1]!.stock).toBe(18);
    g.orders = [{ ...base, kind: 'keg', qty: 2 }];
    beer.kegs = [20];
    expect(g.fulfill(1, [beer.id]).ok).toBe(false);
    beer.kegs = [20, 20, 20];
    expect(g.fulfill(1, [beer.id]).ok).toBe(true);
    expect(beer.kegs).toEqual([20]);
  });

  it('de nouveaux clients avec le niveau de la brasserie et la popularité ; des commandes à la mesure de la brasserie', () => {
    expect(openTypes(1, 0).map((c) => c.id)).toEqual(['particulier', 'bistrot']);
    expect(openTypes(5, 1).length).toBeGreaterThan(8);
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const o1 = drawOrder(i, { rng, time: 0, breweryLevel: 1, brand: 0.3, beers: 2, storageCap: 120, kegLiters: 5, trends: [] });
      if (o1.kind !== 'keg') expect(o1.qty).toBeLessThanOrEqual(30);
      const o5 = drawOrder(i, { rng, time: 0, breweryLevel: 5, brand: 1, beers: 8, storageCap: 4000 * 12, kegLiters: 50, trends: [] });
      if (o5.kind !== 'keg') expect(o5.qty).toBeLessThanOrEqual(4000 * 12 * 0.75);
      expect(o5.reward).toBeGreaterThan(0);
    }
  });

  it('le grossiste reprend les bouteilles à tout moment, à petit prix ; il écoule seul le surplus', () => {
    const g = withBeer(0);
    g.autoWholesale = false;
    const beer = g.beers[0]!;
    beer.stock = 50;
    const r = g.sellWholesale(beer.id, 30);
    expect(r.ok).toBe(true);
    expect(beer.stock).toBe(20);
    expect(r.amount! / 30).toBeLessThanOrEqual(WHOLESALE_PRICE * 1.4); // une commande paie environ le double
    expect(g.money).toBeCloseTo(r.amount!);
    g.autoWholesale = true;
    beer.stock = 100; // plus de la moitié du stockage (120)
    g.step(1);
    expect(beer.stock).toBe(60);
  });

  it('une fête : 50 fois plus de clients pendant 30 min, les fûts vides sont rebranchés avec ceux du stockage', () => {
    const g = withBeer(1e4);
    const beer = g.beers[0]!;
    beer.pop = 0.5;
    beer.kegs = [20, 20, 20, 20, 20];
    const normal = g.barRate;
    expect(g.startParty().ok).toBe(true);
    expect(g.taps[0]!.glasses).toBe(20); // un fût est branché d'office
    expect(g.barRate).toBeCloseTo(normal * PARTY.mult);
    run(g, 30 * 60 + 1);
    expect(beer.kegs.length).toBe(0); // la fête a vidé tous les fûts prévus
    expect(g.partying).toBe(false);
    expect(g.startParty().ok).toBe(false); // il faut attendre avant la suivante
    simulateOffline(g, PARTY.cooldown);
    expect(g.startParty().ok).toBe(true);
  });

  it('la décoration attire du monde ; une campagne de pub rend la gamme plus populaire', () => {
    const g = withBeer(1e6);
    const beer = g.beers[0]!;
    beer.kegs = [20];
    g.swapKeg(0, beer.id);
    beer.pop = 0.2;
    const before = g.barRate;
    expect(g.buyDecor('jukebox').ok).toBe(true);
    expect(g.buyDecor('jukebox').ok).toBe(false);
    expect(g.barRate).toBeCloseTo(before * 1.15);
    expect(g.advertise().ok).toBe(true);
    expect(beer.pop).toBeCloseTo(0.3);
    expect(g.advertise().ok).toBe(false); // une seule campagne à la fois
  });

  it('améliorer l\'ordinateur ajoute une place au tableau des commandes', () => {
    const g = withBeer(1e6);
    expect(g.boardSlots).toBe(2);
    expect(g.upgradeComputer().ok).toBe(true);
    expect(g.boardSlots).toBe(3);
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
    g.autoWholesale = false; // personne n'achète
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

  it('5 niveaux : on améliore même pendant un brassin ; chaque appareil amélioré grossit déjà les brassins', () => {
    const g = new Game();
    g.money = 1e9;
    g.brew();
    expect(g.upgrade('mill').ok).toBe(true); // appareil occupé : pas besoin d'attendre
    expect(g.batchLiters).toBe(7); // 5 L + 1/7 du palier suivant (20 L)
    for (const id of STATION_ORDER.slice(1)) g.upgrade(id);
    expect(g.batchLiters).toBe(20); // les 7 au niveau 2
    for (const lv of [60, 200, 600]) {
      for (const id of STATION_ORDER) g.upgrade(id);
      expect(g.batchLiters).toBe(lv);
    }
    expect(g.upgrade('mill').ok).toBe(false); // niveau 5 = maximum
  });

  it('des cuves en parallèle : plusieurs brassins fermentent en même temps', () => {
    const g = withBeer(1e6);
    runUntil(g, () => g.batches.length === 0);
    expect(g.tankCount('fermenter')).toBe(1);
    expect(g.tankCost('mill')).toBeNull();
    const cost = g.tankCost('fermenter')!;
    expect(g.addTank('fermenter').ok).toBe(true);
    expect(g.tankCost('fermenter')!).toBeGreaterThan(cost);
    g.addTank('conditioning');
    const solo = new Game().productionRate(g.recipe);
    expect(g.productionRate(g.recipe)).toBeGreaterThan(solo * 1.5);
    g.autoBrew = true;
    runUntil(g, () => g.batchesAt('fermenter').length === 2, 3000);
    expect(g.batchesAt('fermenter').length).toBe(2);
    for (let i = 0; i < 5; i++) g.addTank('fermenter');
    expect(g.tankCount('fermenter')).toBe(4); // 4 cuves au plus
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
    const loaded = Game.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(loaded.level('mill')).toBe(4);
    expect(loaded.level('mash')).toBe(2);
  });

  it('sauvegardes v4 : le bar du coin devient la pièce Bar ; les contrats laissent place au tableau de commandes', () => {
    const g = withBeer();
    const old = { ...g.toJSON(), version: 4, signed: ['bar', 'epicerie'], deals: { bar: 2 }, demand: { bar: 0.5 } } as Record<string, unknown>;
    for (const k of ['barLevel', 'taps', 'orders', 'orderTimer', 'trends', 'plan']) delete old[k];
    old.beers = (old.beers as Record<string, unknown>[]).map(({ kegs: _k, pop: _p, ...b }) => b);
    const loaded = Game.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(loaded.taps).toEqual([{ beerId: null, glasses: 0, capacity: 0 }]);
    expect(loaded.beers[0]!.kegs).toEqual([]);
    expect(loaded.beers[0]!.pop).toBeGreaterThan(0);
    expect(loaded.orders).toEqual([]);
    run(loaded, FIRST_ORDER_S + 1);
    expect(loaded.orders.length).toBe(1);
  });

  it('la brasserie prend le niveau de son appareil le moins avancé et ouvre de nouveaux clients', () => {
    const g = new Game();
    g.money = 1e9;
    g.totalSold = 1e7;
    const levels: number[] = [];
    g.events.on((e) => e.type === 'breweryLevel' && levels.push(e.level));
    expect(g.breweryLevel).toBe(1);
    expect(openTypes(g.breweryLevel, 1).some((c) => c.id === 'caviste')).toBe(false); // il faut le niveau 2
    for (const id of STATION_ORDER.slice(0, 6)) g.upgrade(id);
    expect(g.breweryLevel).toBe(1); // l'embouteillage est encore au niveau 1
    g.upgrade('bottling');
    expect(g.breweryLevel).toBe(2);
    expect(g.breweryName).toBe('Garage');
    expect(levels).toEqual([2]);
    expect(openTypes(g.breweryLevel, 1).some((c) => c.id === 'caviste')).toBe(true);
  });
});
