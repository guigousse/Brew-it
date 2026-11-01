import { STARTER_BUILDINGS } from '../content/progression';
import { fromJSON, toJSON } from '../save/serialize';
import { World } from '../world';
import { TUTORIAL_REWARD, TUTORIAL_STEPS } from './steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from './tutorial';

/** Joue l'étape en cours comme le ferait un joueur. Renvoie false si elle attend la simulation. */
function act(w: World): boolean {
  const step = currentStep(w)!;
  for (const t of step.places ?? []) w.place(t.type, t.x, t.y, 0);
  if (step.signal) w.signal(step.signal);
  if (step.ack) w.signal(`ack:${step.id}`);
  return !step.until;
}

function playTutorial(w: World, maxSeconds = 900): number {
  let t = 0;
  while (!w.tutorial.done && t < maxSeconds) {
    if (!act(w)) {
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
    expect(w.place('supplier', 0, 1).ok).toBe(false);
  });

  it('n’autorise que la construction demandée, à l’endroit demandé, gratuitement', () => {
    const w = new World();
    w.signal('ack:intro');
    expect(tutorialPalette(w)).toEqual(['supplier']);
    expect(w.place('supplier', 4, 4).ok).toBe(false);
    expect(w.place('conveyor', 0, 1).ok).toBe(false);
    const money = w.money;
    const r = w.place('supplier', 0, 1);
    expect(r.ok).toBe(true);
    expect(w.money).toBe(money);
    expect(w.buildings.get(r.id!)!.params.item).toBe('malt');
    expect(currentStep(w)!.id).toBe('conveyor');
    expect(w.remove(r.id!).ok).toBe(false);
  });

  it('impose l’orientation prévue, quel que soit le sens du geste', () => {
    const w = new World();
    w.signal('ack:intro');
    w.place('supplier', 0, 1);
    const r = w.place('conveyor', 1, 1, 2); // geste vers la gauche
    expect(w.buildings.get(r.id!)!.rot).toBe(0);
  });

  it('l’empâtage attend les choix du joueur avant de démarrer', () => {
    const w = new World();
    while (currentStep(w)!.id !== 'open_mash') act(w);
    for (let i = 0; i < 20 * 30; i++) w.step(); // ingrédients largement arrivés
    const mash = w.list.find((b) => b.type === 'mash_tun')!;
    expect(mash.machine!.phase).toBe('filling');
    w.signal('open:mash_tun');
    w.signal('choice:grainKg');
    w.signal('choice:mashTemp');
    w.step();
    expect(mash.machine!.phase).toBe('heating');
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
    expect(w.firstBeer!.abv).toBeGreaterThan(4);
    expect(w.unlocked).toEqual(expect.arrayContaining([...STARTER_BUILDINGS]));
    expect(w.money).toBeGreaterThan(TUTORIAL_REWARD);
  });

  it('les choix du joueur changent vraiment la bière', () => {
    const brew = (grain: number, hops: number) => {
      const w = new World();
      while (!w.tutorial.done) {
        const step = currentStep(w)!;
        if (step.id === 'choose_grain') w.list.filter((b) => b.type === 'mash_tun').forEach((b) => w.setParam(b.id, 'grainKg', grain));
        if (step.id === 'choose_hops') w.list.filter((b) => b.type === 'kettle').forEach((b) => w.setParam(b.id, 'hopsItems', hops));
        if (!act(w)) w.step();
      }
      return w.firstBeer!;
    };
    const light = brew(4, 1);
    const strong = brew(6, 4);
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
    while (currentStep(w)!.id !== 'kettle') act(w);
    const loaded = fromJSON(toJSON(w));
    expect(currentStep(loaded)!.id).toBe('kettle');
    expect(loaded.tutorial.done).toBe(false);
    expect(playTutorial(loaded)).toBeLessThan(360);
  });

  it('peut être passé', () => {
    const w = new World();
    skipTutorial(w);
    expect(w.tutorial.done).toBe(true);
    expect(w.place('supplier', 0, 0).ok).toBe(true);
  });
});
