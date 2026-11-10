import { GASTON_RECIPE } from './brewing/model';
import { BAR_MESSAGE, BAR_MESSAGE_MAX, Game, simulateOffline } from './game';
import { DEFAULT_LABEL } from './label';
import { AD_EXTEND, adCost, ADS, BAR, kegSpace, PARTY } from './market';
import { COMPUTERS, WHOLESALE_PRICE, drawOrder, orderGems, FIRST_ORDER_S, openTypes, ORDER_LIFE_MAX_S, STARTER_MAX_BOTTLES, fits, type Order } from './orders';
import { Rng } from './rng';
import { popTarget, TREND_COUNT, TRENDS } from './trends';
import { MemoryStorage, SaveManager } from './save';
import { GEMS } from './shop';
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
    g.storageLevel = 3; // assez de place pour toute la file
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

  it('le premier brassin, guidé par Gaston, n\'a aucun défaut (pas même l\'oxydation du matériel de départ)', () => {
    const g = withBeer();
    expect(g.beers[0]!.tasting.defects).toEqual([]);
  });

  it('les 3 premières commandes se livrent avec la blonde du tutoriel', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      const o = drawOrder(seed, { rng, time: 0, breweryLevel: 1, brand: 0, beers: 1, storageCap: 120, kegLiters: 5, trends: [], starter: true });
      expect(o.kind).toBe('classic');
      expect(o.want).toBeUndefined();
      expect(o.qty).toBeLessThanOrEqual(STARTER_MAX_BOTTLES);
      expect(o.minQuality).toBeLessThanOrEqual(0.45);
    }
    const g = withBeer();
    runUntil(g, () => g.orders.length >= 2, 4 * 3600);
    for (const o of g.orders) expect(g.beers.some((b) => fits(o, b.tasting))).toBe(true);
  });

  it('pendant un boost de production, le grossiste suit la cadence (sinon produire plus ne rapporterait rien)', () => {
    const g = withBeer(0);
    const beer = g.beers[0]!;
    const base = g.wholesaleQuota(beer);
    g.gems = 100;
    expect(g.buyBoost('cadence').ok).toBe(true);
    expect(g.wholesaleQuota(beer)).toBe(base * 2);
    g.boosts = {};
    expect(g.buyBoost('yeast').ok).toBe(true);
    expect(g.wholesaleQuota(beer)).toBe(Math.round(base * 1.5));
  });

  it('le grossiste sans limite reprend tout pendant 4 h, une fois par jour', () => {
    const g = withBeer(0);
    const beer = g.beers[0]!;
    g.gems = 200;
    expect(Number.isFinite(g.wholesaleQuota(beer))).toBe(true);
    expect(g.buyBoost('openGate').ok).toBe(true);
    expect(g.wholesaleQuota(beer)).toBe(Infinity);
    beer.stock = 5000;
    expect(g.wholesaleSellable(beer, 'bottle')).toBe(5000);
    expect(g.buyBoost('openGate').ok).toBe(false); // une fois par jour
    g.time += 4 * 3600 + 1;
    expect(Number.isFinite(g.wholesaleQuota(beer))).toBe(true);
    expect(g.boostBlocked('openGate')).toMatch(/une fois par jour/i);
  });

  it('le grossiste reprend bouteilles et fûts, à petit prix, dans la limite d\'un quota par bière en litres', () => {
    const g = withBeer(0);
    g.autoWholesale = false;
    const beer = g.beers[0]!;
    beer.pop = 0;
    expect(g.wholesaleQuota(beer)).toBe(20); // lots de 5 L : 4 brassins par jour pour une bière inconnue
    beer.stock = 100;
    const r = g.sellWholesale(beer.id, 30);
    expect(r.ok).toBe(true);
    expect(beer.stock).toBe(70);
    expect(r.amount! / 30).toBeLessThanOrEqual(WHOLESALE_PRICE * 1.4); // une commande paie environ le double
    expect(g.money).toBeCloseTo(r.amount!);
    expect(beer.wsToday).toBeCloseTo(30 * 0.33);
    // le reste du quota : 10,1 L, soit 30 bouteilles de plus
    expect(g.sellWholesale(beer.id, 100).sold).toBe(30);
    expect(g.sellWholesale(beer.id, 1)).toEqual({ ok: false, reason: 'Quota du grossiste atteint pour aujourd\'hui' });
    // les fûts remplissent le même quota, au même prix au litre
    beer.wsToday = 0;
    beer.kegs = [20, 20, 20, 20, 20]; // fûts de 5 L
    const k = g.sellWholesale(beer.id, 9, 'keg');
    expect(k.sold).toBe(4); // 20 L
    expect(beer.kegs).toHaveLength(1);
    expect(k.amount!).toBeCloseTo((20 / 0.33) * (r.amount! / 30));
    expect(g.wholesaleLiters).toBeCloseTo(60 * 0.33 + 20);
    // une bière populaire : un quota plus grand
    beer.pop = 0.5;
    expect(g.wholesaleQuota(beer)).toBe(70);
  });

  it('le quota du grossiste se recharge à minuit, heure locale', () => {
    const g = withBeer(0);
    const beer = g.beers[0]!;
    g.wall = new Date(2026, 10, 8, 23, 59, 0).getTime();
    g.step(1);
    beer.wsToday = 15;
    g.step(30);
    expect(beer.wsToday).toBe(15); // toujours le même jour
    g.step(40);
    expect(beer.wsToday).toBe(0); // minuit est passé
    const back = Game.fromJSON(JSON.parse(JSON.stringify(g)));
    expect(back.wall).toBe(g.wall);
    expect(back.quotaDay).toBe(g.quotaDay);
  });

  it('vente automatique : seulement quand le stockage plein bloque la production, et dans la limite du quota', () => {
    const g = withBeer(1e5);
    runUntil(g, () => g.batches.length === 0);
    const beer = g.beers[0]!;
    beer.pop = 0;
    beer.stock = 100; // plus de la moitié du stockage (120) : on n'y touche pas
    g.step(1);
    expect(beer.stock).toBe(100);
    // la file attend de la place : le grossiste reprend de quoi faire partir le brassin
    beer.stock = 120;
    g.plan = [{ beerId: beer.id, format: 'bottle', count: 1 }];
    expect(g.storageShortfall).toBe(15);
    g.step(1);
    expect(beer.stock).toBe(105);
    // quota épuisé : plus rien ne part, la file attend
    beer.stock = 120;
    beer.wsToday = g.wholesaleQuota(beer);
    g.plan = [{ beerId: beer.id, format: 'bottle', count: 1 }];
    g.step(1);
    expect(beer.stock).toBe(120);
    // les fûts aussi, quand il n'y a plus de bouteilles
    beer.wsToday = 0;
    beer.stock = 0;
    beer.kegs = Array(10).fill(20); // 10 fûts de 5 L, 12 places chacun
    g.plan = [{ beerId: beer.id, format: 'bottle', count: 1 }];
    g.step(1);
    expect(beer.kegs).toHaveLength(8); // 15 places : 2 fûts
  });

  it('le volume vendu se compte en litres : verres de 25 cl, bouteilles et fûts', () => {
    const g = withBeer(0);
    g.autoWholesale = false;
    const beer = g.beers[0]!;
    beer.stock = 10;
    const before = g.totalLiters;
    g.sellWholesale(beer.id, 10);
    expect(g.totalLiters - before).toBeCloseTo(3.3);
    expect(beer.liters).toBeCloseTo(3.3);
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
    expect(g.startParty().ok).toBe(false); // il faut d'abord la boule à facettes
    expect(g.buyItem('disco').ok).toBe(false); // la décoration s'achète dans l'ordre
    g.money = 1e6;
    for (const id of ['plants', 'darts', 'posters', 'tv', 'neon', 'disco'] as const) expect(g.buyDecor(id).ok).toBe(true);
    const normal = g.barRate;
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
    expect(g.buyItem('tv').ok).toBe(false); // les plantes et la cible d'abord
    expect(g.nextDecor?.id).toBe('plants');
    expect(g.buyDecor('plants').ok).toBe(true);
    expect(g.nextDecor?.id).toBe('darts'); // meubles et objets d'événement alternent
    expect(g.buyItem('darts').ok).toBe(true);
    expect(g.buyItem('darts').ok).toBe(false); // déjà achetée
    expect(g.buyDecor('posters').ok).toBe(true);
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

  it('une campagne de pub rend la gamme plus populaire ; une seule à la fois', () => {
    const g = withBeer(1e6);
    const beer = g.beers[0]!;
    beer.pop = 0.2;
    expect(g.advertise('flyers').ok).toBe(true);
    expect(beer.pop).toBeCloseTo(0.25);
    expect(g.ad?.id).toBe('flyers');
    expect(g.advertise('flyers').ok).toBe(false); // une seule campagne à la fois
  });

  it('chaque ordinateur débloque une campagne plus chère et plus forte', () => {
    const g = withBeer(1e9);
    expect(ADS.map((a) => g.adUnlocked(a.id))).toEqual([true, false, false, false, false]);
    expect(g.advertise('radio').ok).toBe(false);
    for (let i = 0; i < 4; i++) expect(g.upgradeComputer().ok).toBe(true);
    expect(ADS.every((a) => g.adUnlocked(a.id))).toBe(true);
    const costs = ADS.map((a) => g.adCost(a.id));
    expect([...costs].sort((a, b) => a - b)).toEqual(costs); // de plus en plus chères
    expect(adCost(ADS[0]!, 3)).toBe(3600); // au niveau 3 de la brasserie, les affiches coûtent 4 % d'une journée de 90 k€
    // la radio remplit tous les emplacements libres tout de suite, et ses commandes sont mieux payées
    g.orders = [];
    expect(g.advertise('radio').ok).toBe(true);
    run(g, 5);
    expect(g.orders.length).toBe(g.boardSlots);
  });

  it('la pub télé fait venir une commande de prestige ; une campagne se prolonge en diamants', () => {
    const g = withBeer(1e9);
    for (let i = 0; i < 3; i++) g.upgradeComputer();
    g.beers[0]!.tasting.quality = 0.95;
    g.orders = [];
    g.gems = 7;
    expect(g.advertise('tv').ok).toBe(true);
    run(g, 5);
    expect(g.orders.filter((o) => o.kind === 'prestige').length).toBe(1);
    const until = g.adUntil;
    expect(g.extendAd().ok).toBe(true);
    expect(g.adUntil).toBe(until + AD_EXTEND.hours * 3600);
    expect(g.gems).toBe(7 - AD_EXTEND.gems);
    expect(g.extendAd().ok).toBe(false); // plus assez de diamants
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

  it('programmer : pas plus que le stockage n\'en peut recevoir, plus ce que le grossiste reprend encore aujourd\'hui', () => {
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
    g.plan = [];
    const auto = g.planLimit('bottle');
    expect(auto).toBeLessThan(g.planRoom);
    g.autoWholesale = false;
    expect(g.planLimit('bottle')).toBeLessThan(auto); // sans vente automatique, le quota restant ne compte pas
    g.autoWholesale = true;
    g.beers[0]!.wsToday = g.wholesaleQuota(g.beers[0]!);
    expect(g.planLimit('bottle')).toBe(Math.floor((g.storageCap - g.stored) / 15)); // quota épuisé : la place libre seule
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
    fast.gems = 100;
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

  it('un boost au même effet se prolonge, un autre effet du même poste attend', () => {
    const g = withBeer(1e7);
    g.gems = 200;
    expect(g.buyBoost('rush').ok).toBe(true);
    const until = g.boostOf('brew')!.until;
    expect(g.buyBoost('rush').ok).toBe(true);
    expect(g.boostOf('brew')!.until).toBe(until + 30 * 60);
    // même effet (×2) : la cadence prolonge le coup de feu
    expect(g.buyBoost('cadence').ok).toBe(true);
    expect(g.boostOf('brew')!.until).toBe(until + 150 * 60);
    // effet différent (×3) : il attend
    expect(g.buyBoost('fullSpeed').ok).toBe(false);
    expect(g.boostBlocked('fullSpeed')).toContain('Coup de feu');
    // la levure express a son propre poste
    expect(g.buyBoost('yeast').ok).toBe(true);
    expect(g.stageMult('fermenter')).toBe(6);
    expect(g.stageMult('mill')).toBe(2);
  });

  it('se paie en diamants, à prix fixe et dégressif avec la durée', () => {
    const g = withBeer(1e6);
    const money = g.money;
    g.gems = 2;
    expect(g.buyBoost('rush').ok).toBe(false);
    g.gems = 100;
    expect(g.buyBoost('rush').ok).toBe(true);
    expect(g.gems).toBe(100 - g.boostCost('rush'));
    expect(g.money).toBe(money);
    // quatre fois 15 min coûtent plus qu'une heure, quatre heures moins que quatre fois une heure
    expect(4 * g.boostCost('rush')).toBeGreaterThan(g.boostCost('cadence'));
    expect(4 * g.boostCost('cadence')).toBeGreaterThan(g.boostCost('nightShift'));
  });

  it('happy hour : deux fois plus de clients, des verres moins chers ; le grossiste généreux paie plus', () => {
    const g = withBeer(1e6);
    g.gems = 100;
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
    g.gems = 100;
    expect(g.buyBoost('prospect').ok).toBe(true);
    expect(g.orders.length).toBe(1);
  });
});

describe('diamants', () => {
  it('on en gagne au départ, par commande livrée et par niveau de la brasserie', () => {
    const g = withBeer(1e7);
    expect(g.gems).toBe(GEMS.start);
    g.beers[0]!.stock = 500;
    g.orders = [{ ...drawOrder(998, { rng: new Rng(3), time: g.time, breweryLevel: 1, brand: 0, beers: 1, storageCap: g.storageCap, kegLiters: 5, trends: [] }), kind: 'classic', qty: 12, minQuality: 0, tip: true } as Order];
    expect(g.fulfill(998, [g.beers[0]!.id]).ok).toBe(true);
    expect(g.gems).toBe(GEMS.start + 1); // commande classique avec pourboire
    for (const id of STATION_ORDER) g.upgrade(id);
    expect(g.breweryLevel).toBe(2);
    expect(g.gems).toBe(GEMS.start + 1 + GEMS.breweryLevel[2]!);
  });

  it('les commandes difficiles portent des diamants ; les simples, parfois un pourboire affiché dès l\'arrivée', () => {
    expect(orderGems({ kind: 'classic', minQuality: 0.3 })).toBe(0);
    expect(orderGems({ kind: 'classic', minQuality: 0.3, tip: true })).toBe(1);
    expect(orderGems({ kind: 'classic', minQuality: 0.7 })).toBe(1); // client exigeant
    expect(orderGems({ kind: 'style', minQuality: 0.3 })).toBe(1);
    expect(orderGems({ kind: 'urgent', minQuality: 0.3 })).toBe(2);
    expect(orderGems({ kind: 'prestige', minQuality: 0.85 })).toBe(3);
    // environ une commande simple sur trois porte un pourboire ; les commandes de démarrage, toutes
    const rng = new Rng(11);
    let tips = 0, simple = 0;
    for (let i = 0; i < 600; i++) {
      const o = drawOrder(i, { rng, time: 0, breweryLevel: 1, brand: 0, beers: 1, storageCap: 120, kegLiters: 5, trends: [] });
      if (o.kind === 'classic' || o.kind === 'keg') { simple++; if (o.tip) tips++; }
    }
    expect(tips / simple).toBeGreaterThan(0.22);
    expect(tips / simple).toBeLessThan(0.38);
    expect(drawOrder(1, { rng, time: 0, breweryLevel: 1, brand: 0, beers: 1, storageCap: 120, kegLiters: 5, trends: [], starter: true }).tip).toBe(true);
  });

  it('une ancienne sauvegarde reçoit les diamants du départ', () => {
    const g = withBeer(1e6);
    const raw = JSON.parse(JSON.stringify(g.toJSON()));
    delete raw.gems;
    expect(Game.fromJSON(raw).gems).toBe(GEMS.start);
  });

  it('les capsules d\'une sauvegarde deviennent des diamants', () => {
    const raw = JSON.parse(JSON.stringify(withBeer(1e6).toJSON()));
    delete raw.gems;
    raw.caps = 42;
    const g = Game.fromJSON(raw);
    expect(g.gems).toBe(42);
    expect((g as unknown as { caps?: number }).caps).toBeUndefined();
  });
});

describe('emplacements du tableau des commandes', () => {
  it('chaque emplacement a son délai ; envoyer ou refuser relance celui de son emplacement', () => {
    const g = withBeer(1e6);
    run(g, 200); // la première lettre arrive après 3 min
    expect(g.orders.length).toBe(1);
    expect(g.orders.length + g.slotWaits.length).toBe(g.boardSlots);
    const o = g.orders[0]!;
    expect(g.declineOrder(o.id).ok).toBe(true);
    expect(g.orders.length).toBe(0);
    expect(g.slotWaits.length).toBe(g.boardSlots);
    // l'emplacement libéré attend 30 à 60 min (un peu moins avec une marque connue)
    expect(Math.max(...g.slotWaits)).toBeGreaterThan(20 * 60);
    expect(Math.max(...g.slotWaits)).toBeLessThanOrEqual(75 * 60);
  });

  it('une place gagnée reçoit vite sa première lettre ; la prospection remplit tout de suite', () => {
    const g = withBeer(1e7);
    run(g, 200);
    g.upgradeComputer();
    run(g, 1);
    expect(g.orders.length + g.slotWaits.length).toBe(g.boardSlots);
    expect(Math.min(...g.slotWaits)).toBeLessThanOrEqual(3 * 60);
    const n = g.orders.length;
    g.gems = 100;
    expect(g.buyBoost('prospect').ok).toBe(true);
    expect(g.orders.length).toBe(n + 1);
  });

  it('une ancienne sauvegarde (un seul minuteur) reçoit ses emplacements', () => {
    const raw = JSON.parse(JSON.stringify(withBeer(1e6).toJSON()));
    delete raw.orderWaits;
    raw.orderTimer = 90;
    raw.orders = [];
    const g = Game.fromJSON(raw);
    expect(g.slotWaits[0]).toBe(90);
    expect(g.slotWaits.length).toBe(g.boardSlots);
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
    for (const id of ['plants', 'darts', 'posters', 'tv', 'neon', 'disco', 'benches', 'jukebox'] as const) expect(g.buyDecor(id).ok).toBe(true);
    expect(g.nextDecor).toBeUndefined();
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
    // les cosmétiques premium se paient en diamants
    g.gems = 7;
    expect(g.buyUnlock('emblem:skull').ok).toBe(false);
    g.gems = 100;
    expect(g.buyUnlock('emblem:skull').ok).toBe(true);
    expect(g.gems).toBe(50);
    g.buyBoost('cadence');
    g.hire('courier');
    const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(back.isUnlocked('emblem', 'bee')).toBe(true);
    expect(back.gems).toBe(40);
    expect(back.boostMult('brew')).toBe(2);
    expect(back.staffOn('courier')).toBe(true);
  });
});

describe('panneau lumineux du bar', () => {
  it('garde le message choisi (nettoyé, limité), le message par défaut si vide, et le sauvegarde', () => {
    const g = new Game();
    expect(g.barMessage).toBe(BAR_MESSAGE);
    g.setBarMessage('  Happy   hour à 18 h  ');
    expect(g.barMessage).toBe('Happy hour à 18 h');
    g.setBarMessage('x'.repeat(80));
    expect(g.barMessage).toHaveLength(BAR_MESSAGE_MAX);
    g.setBarMessage('   ');
    expect(g.barMessage).toBe(BAR_MESSAGE);
    g.setBarMessage('Santé !');
    expect(Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON()))).barMessage).toBe('Santé !');
  });
});
