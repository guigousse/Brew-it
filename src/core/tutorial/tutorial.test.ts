import { DEFAULT_CHOICES, type RecipeChoices } from '../brewing/recipe';
import { STARTER_BUILDINGS } from '../content/progression';
import { ingredientNeeds } from '../ingredients';
import { fromJSON, toJSON } from '../save/serialize';
import { simulateOffline } from '../sim/loop';
import { World } from '../world';
import { TUTORIAL_REWARD, TUTORIAL_STEPS } from './steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from './tutorial';

/** Un joueur attentif garde ses réserves remplies. */
function restock(w: World) {
  if (!w.tutorial.signals.includes('stock:malt')) return;
  for (const [item, pack] of [['malt', 'malt5'], ['hops', 'hops1'], ['yeast', 'yeast1'], ['bottle', 'bottle12']] as const) {
    if ((w.stock[item] ?? 0) < 4) w.buyPack(pack);
  }
}

/** Joue l'étape en cours comme le ferait un joueur. Renvoie false si elle attend la simulation. */
function act(w: World, choices: RecipeChoices = DEFAULT_CHOICES): boolean {
  const step = currentStep(w)!;
  for (const t of step.places ?? []) w.place(t.type, t.x, t.y, 0);
  if (step.signal === 'recipe:created') w.createRecipe('Blonde de Gaston', choices, { validated: true });
  else if (step.signal === 'stock:malt') w.buyPack('malt5');
  else if (step.id === 'stock_rest') ['hops1', 'yeast1', 'bottle12'].forEach((p) => w.buyPack(p));
  else if (step.signal) w.signal(step.signal);
  restock(w);
  if (step.ack) w.signal(`ack:${step.id}`);
  return !step.until;
}

/** Joue tout le tutoriel ; rachète ce qui manque si besoin (comme un joueur attentif). */
function playTutorial(w: World, choices?: RecipeChoices, maxSeconds = 900): number {
  let t = 0;
  while (!w.tutorial.done && t < maxSeconds) {
    if (!act(w, choices)) {
      w.step();
      t += 1 / 20;
    }
  }
  return t;
}

describe('tutoriel', () => {
  it('démarre sur l’introduction, avec une palette vide et rien de constructible', () => {
    const w = new World();
    expect(currentStep(w)!.id).toBe('intro');
    expect(tutorialPalette(w)).toEqual([]);
    expect(w.place('mill', 1, 2).ok).toBe(false);
  });

  it('n’autorise que la construction demandée, à l’endroit demandé, gratuitement', () => {
    const w = new World();
    w.signal('ack:intro');
    expect(tutorialPalette(w)).toEqual(['mill']);
    expect(w.place('mill', 4, 4).ok).toBe(false);
    const money = w.money;
    const r = w.place('mill', 1, 2);
    expect(r.ok).toBe(true);
    expect(w.money).toBe(money);
    expect(currentStep(w)!.id).toBe('mash_tun');
    expect(w.remove(r.id!).ok).toBe(false);
    expect(w.move(r.id!, 0, 0).ok).toBe(false);
  });

  it('impose l’orientation prévue du tapis avec virage, quel que soit le sens du geste', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'conveyor') act(w);
    const a = w.place('conveyor', 7, 4, 0);
    const b = w.place('conveyor', 6, 4, 2);
    expect(w.buildings.get(a.id!)!.rot).toBe(2);
    expect(w.buildings.get(b.id!)!.rot).toBe(1);
  });

  it('rien ne démarre tant que le brassin n’est pas composé', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'recipe') act(w);
    expect(ingredientNeeds(w)).toEqual([]); // pas d'icône « + » sans brassin
    const mash = w.list.find((b) => b.type === 'mash_tun_mini')!;
    mash.itemsIn!.push(...Array.from({ length: 6 }, () => ({ item: 'crushed_malt' as const, batch: null })));
    for (let i = 0; i < 20 * 20; i++) w.step();
    expect(mash.machine!.phase).toBe('filling');
    act(w); // compose le brassin
    w.step();
    expect(mash.machine!.phase).toBe('heating');
  });

  it('les machines puisent seules dans le stock ; un stock vide les arrête et les signale', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'stock_malt') act(w);
    expect(w.buyPack('malt5').ok).toBe(true);
    for (let i = 0; i < 10; i++) w.step();
    expect(w.stock.malt ?? 0).toBe(0); // le concasseur a pris ses 5 kg
    const kettle = w.list.find((b) => b.type === 'kettle_mini')!;
    expect(kettle.starved).toBe('hops'); // pas de houblon en stock
    expect(w.buyPack('hops1').ok).toBe(true);
    for (let i = 0; i < 10; i++) w.step();
    expect(kettle.starved ?? null).toBeNull();
    expect(kettle.itemsIn!.length).toBeGreaterThan(0);
  });

  it('la réserve a une capacité, améliorable', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    expect(w.stockCap('malt')).toBe(20);
    expect(w.buyPack('malt25').ok).toBe(false); // ne rentre pas
    expect(w.upgradeStock('malt').ok).toBe(true);
    expect(w.stockCap('malt')).toBe(60);
    expect(w.buyPack('malt25').ok).toBe(true);
  });

  it('se termine par la livraison de la première caisse, en moins de 6 minutes de jeu', () => {
    const w = new World();
    const lost: string[] = [];
    w.events.on((e) => e.type === 'batchLost' && lost.push(e.reason));
    const seconds = playTutorial(w);
    expect(w.tutorial.done).toBe(true);
    expect(lost).toEqual([]);
    expect(seconds).toBeLessThan(360);
    expect(w.stats.crates).toBe(1);
    expect(w.firstBeer!.name).toBe('Blonde de Gaston');
    expect(w.firstBeer!.abv).toBeGreaterThan(4);
    expect(w.unlocked).toEqual(expect.arrayContaining([...STARTER_BUILDINGS]));
    expect(w.money).toBeGreaterThan(TUTORIAL_REWARD);
  });

  it('les choix du brassin changent vraiment la bière', () => {
    const brew = (choices: RecipeChoices) => {
      const w = new World();
      playTutorial(w, choices);
      return w.firstBeer!;
    };
    const light = brew({ ...DEFAULT_CHOICES, grainKg: 4, hopsGrams: 20 });
    const strong = brew({ ...DEFAULT_CHOICES, grainKg: 6, hopsGrams: 80 });
    expect(light.abv).toBeGreaterThan(3);
    expect(light.abv).toBeLessThan(4.8);
    expect(strong.abv).toBeGreaterThan(light.abv + 1.5);
    expect(strong.ibu).toBeGreaterThan(light.ibu * 2);
  });

  it('chaque étape a un texte non vide, y compris les textes dynamiques', () => {
    const w = new World();
    for (const s of TUTORIAL_STEPS) expect(stepText(w, s).length).toBeGreaterThan(10);
  });

  it('survit à une sauvegarde en plein milieu', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'stock_rest') act(w);
    const loaded = fromJSON(toJSON(w));
    expect(currentStep(loaded)!.id).toBe('stock_rest');
    expect(loaded.tutorial.signals).toContain('stock:malt');
    expect(loaded.activeRecipe!.name).toBe('Blonde de Gaston');
    expect(playTutorial(loaded)).toBeLessThan(360);
  });

  it('peut être passé', () => {
    const w = new World();
    skipTutorial(w);
    expect(w.tutorial.done).toBe(true);
    expect(w.place('mill', 0, 0).ok).toBe(true);
  });
});

describe('matériel et paliers', () => {
  it('le matériel pro se débloque après 5 caisses livrées', () => {
    const w = new World({ tutorial: false });
    expect(w.unlocked).toContain('mash_tun_mini');
    expect(w.unlocked).not.toContain('mash_tun');
    w.stats.crates = 5;
    w.checkUnlocks();
    expect(w.unlocked).toEqual(expect.arrayContaining(['mash_tun', 'kettle', 'fermenter', 'bottler', 'mill_2', 'cooler_2', 'stand']));
  });

  it('le matériel industriel demande 20 caisses et l\'Entrepôt', () => {
    const w = new World({ tutorial: false, money: 1e6 });
    w.stats.crates = 20;
    w.checkUnlocks();
    expect(w.unlocked).not.toContain('mash_tun_3');
    w.expand();
    w.expand();
    expect(w.unlocked).toEqual(expect.arrayContaining(['mill_3', 'mash_tun_3', 'kettle_3', 'cooler_3', 'fermenter_3', 'bottler_3']));
  });

  it('cuves pro et industrielles : lots ×2 et ×4', () => {
    const run = (mash: 'mash_tun_mini' | 'mash_tun' | 'mash_tun_3') => {
      const w = new World({ tutorial: false, money: 1e5 });
      w.place('mill', 0, 0);
      const m = w.place(mash, 1, 0);
      w.place('water_tap', 1, { mash_tun_mini: 1, mash_tun: 2, mash_tun_3: 3 }[mash]);
      w.createRecipe('Test', DEFAULT_CHOICES, { validated: true });
      for (const n of ingredientNeeds(w)) w.loadMissing(n.buildingId);
      for (let i = 0; i < 20 * 120; i++) w.step();
      return w.buildings.get(m.id!)!.fluid!.amount;
    };
    const mini = run('mash_tun_mini');
    const pro = run('mash_tun');
    const indus = run('mash_tun_3');
    expect(mini).toBeGreaterThan(15);
    expect(pro).toBeCloseTo(mini * 2, 0);
    expect(indus).toBeCloseTo(mini * 4, 0);
  });
});

describe('brassins et production', () => {
  it('pause, changement de brassin, reprise', () => {
    const w = new World({ tutorial: false });
    const a = w.createRecipe('Blonde', DEFAULT_CHOICES, { validated: true });
    expect(w.createRecipe('IPA', { ...DEFAULT_CHOICES, hopsGrams: 120 }).ok).toBe(false); // production en marche
    w.setProduction(false);
    const b = w.createRecipe('IPA', { ...DEFAULT_CHOICES, hopsGrams: 120 });
    expect(w.activeRecipe!.name).toBe('IPA');
    w.setProduction(false);
    expect(w.selectRecipe(a.id!).ok).toBe(true);
    expect(w.activeRecipe!.name).toBe('Blonde');
    expect(w.recipes.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(w.setProduction(true).ok).toBe(true);
    expect(w.selectRecipe(b.id!).ok).toBe(false);
  });

  it('un brassin créé à partir d\'un autre garde son propre id et son nom', () => {
    const w = new World({ tutorial: false });
    w.createRecipe('Blonde', DEFAULT_CHOICES, { validated: true });
    w.setProduction(false);
    w.createRecipe('Essai', { ...w.recipes[0]!, mashTemp: 70 });
    expect(w.recipes.map((r) => [r.id, r.name])).toEqual([[1, 'Blonde'], [2, 'Essai']]);
    expect(w.activeRecipe!.name).toBe('Essai');
    expect((w.activeRecipe as unknown as Record<string, unknown>).tasting).toBeUndefined();
  });

  it('déplace un bâtiment avec son contenu', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    const r = w.place('tank', 0, 0);
    const tank = w.buildings.get(r.id!)!;
    tank.fluid = { fluid: 'water', amount: 50, temp: 12, batch: null };
    expect(w.move(r.id!, 1, 0).ok).toBe(true); // chevauche sa propre position : autorisé
    expect(w.at(0, 0)).toBeUndefined();
    expect(w.at(2, 1)!.id).toBe(r.id);
    expect(tank.fluid.amount).toBe(50);
    w.place('mill', 5, 5);
    expect(w.move(r.id!, 4, 4).ok).toBe(false);
    expect(w.at(1, 0)!.id).toBe(r.id);
  });
});

describe('fournée d\'essai et dégustation', () => {
  const line = (choices: RecipeChoices) => {
    const w = new World({ tutorial: false, money: 1e5 });
    // ligne miniature raccordée comme dans le tutoriel
    const put = (t: Parameters<World['place']>[0], x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => w.place(t, x, y, rot);
    put('mill', 1, 2); put('mash_tun_mini', 2, 2); put('water_tap', 2, 0); put('conduit', 2, 1, 1);
    put('conduit', 3, 2); put('conduit', 4, 2); put('kettle_mini', 5, 2); put('cooler', 6, 2); put('conduit', 7, 2);
    put('fermenter_mini', 8, 2); put('conduit', 8, 3, 1); put('bottler_mini', 8, 4);
    put('conveyor', 7, 4, 2); put('conveyor', 6, 4, 1); put('crate', 6, 5);
    w.createRecipe('Essai', choices);
    return w;
  };
  const runUntil = (w: World, cond: () => boolean, max = 900) => {
    for (let i = 0; i < max * 20 && !cond(); i++) {
      w.step();
      if (i % 20 === 0) for (const p of ['malt5', 'hops1', 'yeast1', 'bottle12']) w.buyPack(p);
    }
  };

  it('un nouveau brassin brasse un seul lot, puis présente la dégustation et met en pause', () => {
    const w = line(DEFAULT_CHOICES);
    expect(w.activeRecipe!.status).toBe('test');
    let tastings = 0;
    w.events.on((e) => e.type === 'tasting' && tastings++);
    runUntil(w, () => !!w.tasting);
    expect(tastings).toBe(1);
    expect(w.production.running).toBe(false);
    expect(w.activeRecipe!.tasting!.quality).toBeGreaterThan(0.85);
    expect(w.stats.brews).toBe(1); // un seul lot d'essai
    expect(w.stats.bottles).toBe(0); // la bière attend la décision
    expect(w.validateRecipe().ok).toBe(true);
    expect(w.activeRecipe!.status).toBe('validated');
    runUntil(w, () => w.stats.crates >= 1, 300);
    expect(w.stats.crates).toBeGreaterThanOrEqual(1);
  });

  it('une recette ratée est imbuvable : impossible de la produire, on peut la jeter', () => {
    const w = line({ ...DEFAULT_CHOICES, mashTemp: 82 });
    runUntil(w, () => !!w.tasting);
    expect(w.activeRecipe!.tasting!.quality).toBeLessThan(0.3);
    expect(w.validateRecipe().ok).toBe(false);
    expect(w.discardTest().ok).toBe(true);
    expect(w.tasting).toBeNull();
    expect(w.list.find((b) => b.type === 'fermenter_mini')!.machine!.phase).toBe('filling');
    expect(w.recipes[0]!.tasting).toBeDefined(); // le résultat reste consultable
  });
});

describe('production hors-ligne', () => {
  it('la brasserie tourne pendant l\'absence ; les gains attendent la récolte', () => {
    const w = new World({ tutorial: false, money: 1e5 });
    const put = (t: Parameters<World['place']>[0], x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => w.place(t, x, y, rot);
    put('mill', 1, 2); put('mash_tun_mini', 2, 2); put('water_tap', 2, 0); put('conduit', 2, 1, 1);
    put('conduit', 3, 2); put('conduit', 4, 2); put('kettle_mini', 5, 2); put('cooler', 6, 2); put('conduit', 7, 2);
    put('fermenter_mini', 8, 2); put('conduit', 8, 3, 1); put('bottler_mini', 8, 4);
    put('conveyor', 7, 4, 2); put('conveyor', 6, 4, 1); put('crate', 6, 5);
    w.createRecipe('Blonde', DEFAULT_CHOICES, { validated: true });
    for (const it of ['malt', 'hops', 'yeast', 'bottle'] as const) for (let i = 0; i < 4; i++) w.upgradeStock(it);
    for (let i = 0; i < 40; i++) ['malt25', 'hops5', 'yeast5', 'bottle48'].forEach((p) => w.buyPack(p));
    const money = w.money;
    const report = simulateOffline(w, 3600)!;
    expect(report.seconds).toBe(3600);
    expect(report.crates).toBeGreaterThan(5);
    expect(report.earned).toBeGreaterThan(0);
    expect(report.used.malt).toBeGreaterThan(20);
    expect(w.money).toBe(money); // pas encore récolté
    const saved = fromJSON(toJSON(w));
    expect(saved.offline!.earned).toBeCloseTo(report.earned);
    expect(saved.collectOffline()).toBeCloseTo(report.earned);
    expect(saved.money).toBeCloseTo(money + report.earned);
    expect(saved.offline).toBeNull();
  });

  it('sans ingrédients, rien ne se produit hors-ligne', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    w.place('mill', 1, 2); w.place('mash_tun_mini', 2, 2); w.place('water_tap', 2, 1);
    w.createRecipe('Blonde', DEFAULT_CHOICES, { validated: true });
    const r = simulateOffline(w, 1800)!;
    expect(r.brews).toBe(0);
    expect(r.earned).toBe(0);
  });
});
