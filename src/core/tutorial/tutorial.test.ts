import { DEFAULT_CHOICES, type RecipeChoices } from '../brewing/recipe';
import { STARTER_BUILDINGS } from '../content/progression';
import { ingredientNeeds } from '../ingredients';
import { fromJSON, toJSON } from '../save/serialize';
import { World } from '../world';
import { TUTORIAL_REWARD, TUTORIAL_STEPS } from './steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from './tutorial';

/** Joue l'étape en cours comme le ferait un joueur. Renvoie false si elle attend la simulation. */
function act(w: World, choices: RecipeChoices = DEFAULT_CHOICES): boolean {
  const step = currentStep(w)!;
  for (const t of step.places ?? []) w.place(t.type, t.x, t.y, 0);
  if (step.signal === 'recipe:created') w.createRecipe('Blonde de Gaston', choices);
  else if (step.signal === 'stock:malt') w.buyPack('malt5');
  else if (step.signal?.startsWith('load:') || step.id === 'load_rest') {
    for (const n of ingredientNeeds(w)) w.loadMissing(n.buildingId);
  } else if (step.signal) w.signal(step.signal);
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

  it('le « + » charge depuis le stock, et achète seulement le complément', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'stock_malt') act(w);
    const needs = ingredientNeeds(w);
    expect(needs.map((n) => n.item).sort()).toEqual(['bottle', 'hops', 'malt', 'yeast']);
    expect(w.buyPack('malt5').ok).toBe(true);
    expect(w.stock.malt).toBe(5);
    const malt = needs.find((n) => n.item === 'malt')!;
    const money = w.money;
    const r = w.loadMissing(malt.buildingId);
    expect(r).toMatchObject({ ok: true, qty: 5, fromStock: 5, cost: 0 });
    expect(w.money).toBe(money);
    expect(w.stock.malt).toBe(0);
    // Sans stock : le complément est acheté au prix unitaire.
    const hops = ingredientNeeds(w).find((n) => n.item === 'hops')!;
    const r2 = w.loadMissing(hops.buildingId);
    expect(r2.fromStock).toBe(0);
    expect(w.money).toBeCloseTo(money - hops.total);
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
    const light = brew({ ...DEFAULT_CHOICES, grainKg: 4, hopsItems: 1 });
    const strong = brew({ ...DEFAULT_CHOICES, grainKg: 6, hopsItems: 4 });
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
    while (currentStep(w)!.id !== 'load_malt') act(w);
    const loaded = fromJSON(toJSON(w));
    expect(currentStep(loaded)!.id).toBe('load_malt');
    expect(loaded.stock.malt).toBe(5);
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
      w.createRecipe('Test', DEFAULT_CHOICES);
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
    const a = w.createRecipe('Blonde', DEFAULT_CHOICES);
    expect(w.createRecipe('IPA', { ...DEFAULT_CHOICES, hopsItems: 4 }).ok).toBe(false); // production en marche
    w.setProduction(false);
    const b = w.createRecipe('IPA', { ...DEFAULT_CHOICES, hopsItems: 4 });
    expect(w.activeRecipe!.name).toBe('IPA');
    w.setProduction(false);
    expect(w.selectRecipe(a.id!).ok).toBe(true);
    expect(w.activeRecipe!.name).toBe('Blonde');
    expect(w.recipes.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(w.setProduction(true).ok).toBe(true);
    expect(w.selectRecipe(b.id!).ok).toBe(false);
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
