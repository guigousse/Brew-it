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

  it('moulin occupé : le brassin attend son tour, avant les brassins programmés', () => {
    const g = withBeer(1e4);
    g.planBrew(g.beers[0]!.id, 'bottle', 2);
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

  it('les brassins programmés partent dans l\'ordre', () => {
    const g = withBeer(1e4);
    runUntil(g, () => g.batches.length === 0);
    g.planBrew(g.beers[0]!.id, 'keg');
    g.planBrew(g.beers[0]!.id, 'bottle');
    g.step();
    expect(g.batchAt('mill')!.format).toBe('keg');
    expect(g.plan).toEqual([{ beerId: g.beers[0]!.id, format: 'bottle', count: 1 }]);
  });

  it('lancement anticipé : un brassin ne part que s\'il ne devra attendre devant aucun appareil, sans perdre de cadence', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    g.planBrew(g.beers[0]!.id, 'bottle', 6);
    let blocked = 0;
    const t0 = g.time;
    for (let i = 0; i < 20 * 4000 && (g.planned > 0 || g.batches.length > 0); i++) {
      g.step();
      blocked += g.batches.filter((b) => b.waiting && b.stage < STATION_ORDER.length - 1).length;
    }
    expect(g.planned).toBe(0);
    expect(blocked).toBe(0); // aucun appareil n'a gardé un brassin fini en attendant le suivant
    // la cadence reste celle du goulot : 6 brassins en à peine plus de 6 passages dans l'appareil le plus lent
    const slowest = (15 / g.productionRate(g.beers[0]!.recipe)) * 60;
    expect(g.time - t0).toBeLessThan(slowest * 6 + 600);
  });

  it('la file de brassins : des groupes bière × format × nombre, limités selon le niveau de la brasserie', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    const id = g.beers[0]!.id;
    expect(g.planCap).toBe(50);
    expect(g.planBrew(id, 'bottle', 3).ok).toBe(true);
    expect(g.planBrew(id, 'bottle', 2).ok).toBe(true); // s'ajoute au même groupe
    expect(g.planBrew(id, 'keg', 4).ok).toBe(true);
    expect(g.plan).toEqual([{ beerId: id, format: 'bottle', count: 5 }, { beerId: id, format: 'keg', count: 4 }]);
    expect(g.planned).toBe(9);
    expect(g.planBrew(id, 'bottle', 42).ok).toBe(false); // 51 > 50
    g.setPlanCount(0, 99);
    expect(g.plan[0]!.count).toBe(46); // plafonné à la place restante dans la file
    g.movePlan(1, -1);
    expect(g.plan[0]!.format).toBe('keg');
    g.step();
    expect(g.batchAt('mill')!.format).toBe('keg');
    expect(g.plan[0]!.count).toBe(3);
    g.setPlanCount(0, 0);
    expect(g.plan).toEqual([{ beerId: id, format: 'bottle', count: 46 }]);
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

  it('le tableau de bord garde les ventes minute par minute, par source, sur la dernière heure', () => {
    const g = withBeer(0);
    g.autoWholesale = false;
    const beer = g.beers[0]!;
    beer.stock = 50;
    const start = g.wholesaleRevenue;
    const r = g.sellWholesale(beer.id, 10);
    expect(g.wholesaleRevenue - start).toBeCloseTo(r.amount!);
    const now = g.salesMinutes();
    expect(now).toHaveLength(60);
    expect(now[59]!.wholesale).toBeCloseTo(r.amount!);
    // une heure plus tard, la vente est sortie de la fenêtre (mais reste dans les totaux)
    g.time += 3600;
    expect(g.revenueLastHour).toBe(0);
    g.sellWholesale(beer.id, 5);
    expect(g.salesHistory.every((m) => m.m > Math.floor(g.time / 60) - 60)).toBe(true);
    const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
    expect(back.wholesaleRevenue).toBeCloseTo(g.wholesaleRevenue);
    expect(back.salesMinutes()[59]!.wholesale).toBeGreaterThan(0);
  });

  it('une fête : 60 fois plus de clients pendant 45 min, les fûts vides sont rebranchés avec ceux du stockage', () => {
    const g = withBeer(1e4);
    const beer = g.beers[0]!;
    beer.pop = 0.5;
    beer.kegs = [20, 20, 20, 20, 20];
    const normal = g.barRate;
    expect(g.startParty().ok).toBe(false); // il faut d'abord la boule à facettes
    expect(g.buyItem('disco').ok).toBe(false); // les objets s'achètent dans l'ordre
    g.money = 1e6;
    for (const id of ['darts', 'tv', 'disco'] as const) expect(g.buyItem(id).ok).toBe(true);
    expect(g.startParty().ok).toBe(true);
    expect(g.taps[0]!.glasses).toBe(20); // un fût est branché d'office
    expect(g.barRate).toBeCloseTo(normal * PARTY.mult);
    run(g, PARTY.duration + 1);
    expect(beer.kegs.length).toBe(0); // la fête a vidé tous les fûts prévus
    expect(g.partying).toBe(false);
    expect(g.startParty().ok).toBe(false); // il faut attendre avant la suivante
    simulateOffline(g, PARTY.cooldown);
    expect(g.startParty().ok).toBe(true);
  });

  it('événements du bar : la soirée foot et le tournoi de fléchettes se débloquent au magasin', () => {
    const g = withBeer(1e5);
    expect(g.startEvent('foot').ok).toBe(false); // pas de télé
    expect(g.buyItem('tv').ok).toBe(false); // la cible d'abord
    expect(g.nextItem?.id).toBe('darts');
    expect(g.buyItem('darts').ok).toBe(true);
    expect(g.buyItem('darts').ok).toBe(false); // déjà achetée
    expect(g.buyItem('tv').ok).toBe(true);
    expect(g.nextItem?.id).toBe('disco');
    const money = g.money;
    expect(g.startEvent('foot').ok).toBe(true);
    expect(money - g.money).toBe(g.eventCost('foot'));
    expect(g.partying).toBe(true);
    expect(g.barEvent.id).toBe('foot');
    expect(g.startEvent('party').ok).toBe(false); // un seul à la fois, puis le repos
    const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
    expect(back.owns('tv')).toBe(true);
    expect(back.eventId).toBe('foot');
  });

  it('barman en renfort : 8 h à rebrancher les fûts tout seul, à renouveler', () => {
    const g = withBeer(1e5);
    const beer = g.beers[0]!;
    beer.kegs = [20, 20, 20];
    expect(g.hireBarman().ok).toBe(true);
    expect(g.barmanOn).toBe(true);
    expect(g.taps[0]!.glasses).toBe(20); // il branche un fût d'office
    g.taps[0]!.glasses = 0;
    g.step();
    expect(g.taps[0]!.glasses).toBeGreaterThan(0); // et rebranche le suivant
    expect(g.hireBarman().ok).toBe(true); // prolongé : 16 h
    expect(g.hireBarman().ok).toBe(true); // 24 h
    expect(g.hireBarman().ok).toBe(false); // pas plus de 24 h d'avance
    g.time += 24 * 3600 + 1;
    expect(g.barmanOn).toBe(false);
  });

  it('une campagne de pub rend la gamme plus populaire', () => {
    const g = withBeer(1e6);
    const beer = g.beers[0]!;
    beer.pop = 0.2;
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
    g.planBrew(g.beers[0]!.id, 'bottle', 3);
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

  it('prévision : le temps restant de la file, brassin par brassin, sans toucher à la partie', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    expect(g.forecast()).toEqual({ ends: [], total: 0, done: true, blocked: null });
    const id = g.beers[0]!.id;
    g.planBrew(id, 'bottle', 3);
    const before = JSON.stringify(g.toJSON());
    const f = g.forecast();
    expect(JSON.stringify(g.toJSON())).toBe(before); // la partie n'a pas bougé
    expect(f.done).toBe(true);
    expect(f.ends).toHaveLength(3);
    expect(f.ends[0]!).toBeLessThan(f.ends[2]!);
    // en jouant pour de vrai, la file est finie à peu près à l'heure annoncée
    const t0 = g.time;
    runUntil(g, () => g.planned === 0 && g.batches.length === 0, 20000);
    expect(Math.abs(g.time - t0 - f.total)).toBeLessThan(f.total * 0.1 + 5);
    // avec 2 brassins de plus en fin de file, c'est plus long
    expect(g.forecast({ beerId: id, format: 'bottle', count: 2 }).ends).toHaveLength(2);
  });

  it('programmer : pas plus de fûts que le stockage n\'en peut recevoir ; les bouteilles, si le grossiste écoule le surplus', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    const id = g.beers[0]!.id;
    const kegs = g.planLimit('keg');
    expect(kegs).toBeGreaterThan(0);
    expect(kegs).toBeLessThan(g.planCap);
    expect(g.planBrew(id, 'keg', kegs + 1).ok).toBe(false);
    expect(g.planBrew(id, 'keg', kegs).ok).toBe(true);
    expect(g.planLimit('keg')).toBe(0);
    g.setPlanCount(0, 999);
    expect(g.plan[0]!.count).toBe(kegs); // on ne peut pas dépasser la place en ajustant
    expect(g.planLimit('bottle')).toBe(g.planRoom); // le grossiste écoule les bouteilles
    g.autoWholesale = false;
    expect(g.planLimit('bottle')).toBeLessThan(g.planRoom);
  });

    it('prévision : une file de fûts qui remplit le stockage est annoncée bloquée, sans tourner 24 h', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    // 40 fûts (programmés avant la limite, ou le stockage s'est rempli entre-temps) : il n'en tient qu'une dizaine
    g.plan = [{ beerId: g.beers[0]!.id, format: 'keg', count: 40 }];
    const t = performance.now();
    const f = g.forecast();
    expect(f.done).toBe(false);
    expect(f.blocked).toBe('storage');
    expect(f.ends.length).toBeGreaterThan(0);
    expect(f.ends.length).toBeLessThan(40);
    expect(performance.now() - t).toBeLessThan(2000);
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

describe('boosts', () => {
  it('cadence ×2 : les machines finissent leur étape deux fois plus vite', () => {
    const slow = withBeer(1e6);
    const fast = withBeer(1e6);
    expect(fast.buyBoost('cadence').ok).toBe(true);
    slow.planBrew(slow.beers[0]!.id, 'bottle', 1);
    fast.planBrew(fast.beers[0]!.id, 'bottle', 1);
    run(slow, 120);
    run(fast, 120);
    const at = (g: Game) => Math.max(...g.batches.map((b) => b.stage * 1e6 + b.elapsed));
    expect(at(fast)).toBeGreaterThan(at(slow));
    expect(fast.boostMult('brew')).toBe(2);
    expect(fast.stageMult('fermenter')).toBe(2);
  });

  it('un même boost se prolonge, un autre du même canal attend', () => {
    const g = withBeer(1e7);
    expect(g.buyBoost('rush').ok).toBe(true);
    const until = g.boostOf('brew')!.until;
    expect(g.buyBoost('rush').ok).toBe(true);
    expect(g.boostOf('brew')!.until).toBe(until + 15 * 60);
    expect(g.buyBoost('cadence').ok).toBe(false);
    // la levure express a son propre canal
    expect(g.buyBoost('yeast').ok).toBe(true);
    expect(g.stageMult('fermenter')).toBe(6);
    expect(g.stageMult('mill')).toBe(2);
  });

  it('son prix suit la production, sans descendre sous le plancher', () => {
    const g = withBeer(1e6);
    const cost = g.boostCost('cadence');
    expect(cost).toBeGreaterThanOrEqual(15);
    expect(g.boostCost('nightShift')).toBeGreaterThan(cost);
    expect(g.boostCost('ad')).toBe(g.adCost);
  });

  it('happy hour : deux fois plus de clients, des verres moins chers ; le grossiste généreux paie plus', () => {
    const g = withBeer(1e6);
    const rate = g.barRate;
    g.buyBoost('happyHour');
    expect(g.barRate).toBeCloseTo(rate * 2);
    expect(g.barPriceMult).toBeCloseTo(0.8);
    g.beers[0]!.stock = 10;
    const before = g.money;
    g.sellWholesale(g.beers[0]!.id, 1);
    const normal = g.money - before;
    g.buyBoost('broker');
    const mid = g.money;
    g.sellWholesale(g.beers[0]!.id, 1);
    expect(g.money - mid).toBeCloseTo(normal * 1.5);
  });

  it('prospection : une commande arrive tout de suite', () => {
    const g = withBeer(1e6);
    g.orders = [];
    expect(g.buyBoost('prospect').ok).toBe(true);
    expect(g.orders.length).toBe(1);
  });
});

describe('personnel', () => {
  it('les postes dépendent du niveau de la brasserie', () => {
    const g = withBeer(1e6);
    expect(g.staffSlots).toBe(1);
    expect(g.hire('courier').ok).toBe(true);
    expect(g.hire('apprentice').ok).toBe(false); // un seul poste au niveau 1
    expect(g.hire('courier').ok).toBe(true); // prolonger reste possible
    for (const id of STATION_ORDER) g.stations[id] = { level: 3 };
    expect(g.staffSlots).toBe(2);
    expect(g.hire('apprentice').ok).toBe(true);
  });

  it('le livreur envoie les commandes remplissables', () => {
    const g = withBeer(1e6);
    g.beers[0]!.stock = 500;
    g.orders = [{ ...drawOrder(999, { rng: new Rng(3), time: g.time, breweryLevel: 1, brand: 0, beers: 1, storageCap: g.storageCap, kegLiters: 5, trends: [] }), kind: 'classic', qty: 12, minQuality: 0 } as Order];
    expect(g.readyOrders.length).toBe(1);
    g.hire('courier');
    run(g, 40);
    expect(g.orders.find((o) => o.id === 999)).toBeUndefined();
  });

  it("l'apprenti reprogramme le dernier brassin quand la file est vide", () => {
    const g = withBeer(1e6);
    g.planBrew(g.beers[0]!.id, 'bottle', 1);
    g.plan = [];
    g.hire('apprentice');
    run(g, 10);
    expect(g.planned + g.batches.length).toBeGreaterThan(0);
  });
});

describe('mobilier et étiquettes', () => {
  it('le mobilier se débloque dans l\'ordre et agit sur le bar', () => {
    const g = withBeer(1e7);
    expect(g.buyFurniture('neon').ok).toBe(false);
    const rate = g.barRate;
    for (const id of ['plants', 'posters', 'neon', 'benches', 'jukebox'] as const) expect(g.buyFurniture(id).ok).toBe(true);
    expect(g.barRate).toBeCloseTo(rate * 1.05 * 1.15 * 1.1);
    expect(g.barSeats).toBe(g.bar.seats + 2);
    expect(g.barPriceMult).toBeCloseTo(1.1);
  });

  it('les déblocages d\'étiquettes s\'achètent et sont sauvegardés', () => {
    const g = withBeer(1e6);
    expect(g.isUnlocked('emblem', 'hop')).toBe(true);
    expect(g.isUnlocked('emblem', 'bee')).toBe(false);
    expect(g.buyUnlock('emblem:bee').ok).toBe(true);
    expect(g.isUnlocked('emblem', 'bee')).toBe(true);
    g.buyBoost('cadence');
    g.hire('courier');
    const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(back.isUnlocked('emblem', 'bee')).toBe(true);
    expect(back.boostMult('brew')).toBe(2);
    expect(back.staffOn('courier')).toBe(true);
  });
});
