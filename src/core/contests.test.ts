import { DEFAULT_LABEL } from './label';
import { Game } from './game';
import { CONTEST_BOTTLES, CONTEST_FIRST_S, CONTEST_OPEN_S, COCARDE_BONUS, contestFee, drawContest, juryScore, medalBonus, placeOf } from './contests';
import { Rng } from './rng';
import { STATION_ORDER } from './stations';
import { MemoryStorage, SaveManager } from './save';
import { TRENDS } from './trends';

/** Partie de niveau donné, avec une bière excellente et populaire. */
function setup(level: number) {
  const g = new Game();
  g.money = 1e7;
  g.brew();
  for (let i = 0; i < 3000 * 20 && !g.tastable; i++) g.step();
  g.keepTrial('IPA', DEFAULT_LABEL);
  for (const id of STATION_ORDER) g.stations[id] = { level };
  const b = g.beers[0]!;
  b.stock = 100;
  b.pop = 1;
  b.tasting = { ...b.tasting, quality: 0.95 };
  return { g, b };
}
const until = (g: Game, cond: () => boolean, max = 24 * 3600) => {
  for (let t = 0; t < max && !cond(); t += 1) g.step(1);
};

describe('concours', () => {
  it('fermés avant la microbrasserie, puis un concours régional arrive vite', () => {
    const { g } = setup(2);
    until(g, () => !!g.contest, 3600);
    expect(g.contest).toBeNull();
    for (const id of STATION_ORDER) g.stations[id] = { level: 3 };
    until(g, () => !!g.contest, CONTEST_FIRST_S + 60);
    expect(g.contest?.tier).toBe(0);
    expect(g.contest?.rivals).toHaveLength(3);
    expect(g.contest!.rivals[0]!.score).toBeGreaterThanOrEqual(g.contest!.rivals[2]!.score);
  });

  it('les rivaux sont plus forts aux concours prestigieux', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      for (const r of drawContest(rng, 0, 0).rivals) expect(r.score).toBeLessThanOrEqual(17);
      for (const r of drawContest(rng, 2, 0).rivals) expect(r.score).toBeGreaterThanOrEqual(18);
    }
  });

  it('les concours ouverts se succèdent, du plus prestigieux au plus modeste', () => {
    const { g } = setup(5);
    const tiers: number[] = [];
    for (let i = 0; i < 4; i++) {
      until(g, () => !!g.contest, 48 * 3600);
      tiers.push(g.contest!.tier);
      until(g, () => !g.contest, CONTEST_OPEN_S + 10);
    }
    expect(tiers).toEqual([2, 1, 0, 2]);
  });

  it('inscription : catégorie, étoiles, bouteilles et droit d\'entrée', () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contest);
    const c = g.contest!;
    const cat = TRENDS.find((t) => t.id === c.cat)!;
    if (!cat.test(b.tasting)) {
      expect(g.enterContest(b.id).ok).toBe(false);
      c.cat = TRENDS.find((t) => t.test(b.tasting))!.id;
    }
    b.pop = 0.5; // 2,5 ★ : il en faut 3
    expect(g.enterContest(b.id).ok).toBe(false);
    b.pop = 0.6;
    const money = g.money;
    const stock = b.stock;
    expect(g.enterContest(b.id).ok).toBe(true);
    expect(g.money).toBe(money - contestFee(0, 3));
    expect(b.stock).toBe(stock - CONTEST_BOTTLES);
    expect(g.enterContest(b.id).ok).toBe(false); // une seule bière par concours
  });

  it('battre les rivaux donne une médaille, une cocarde et son bonus de vente', () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contest);
    g.contest!.cat = TRENDS.find((t) => t.test(b.tasting))!.id;
    g.contest!.rivals = [{ name: 'A', score: 18 }, { name: 'B', score: 17 }, { name: 'C', score: 16 }];
    b.tasting = { ...b.tasting, quality: 0.875 }; // 17,5/20 : devant B et C
    expect(g.enterContest(b.id).ok).toBe(true);
    const gems = g.gems;
    until(g, () => !g.contest, CONTEST_OPEN_S + 10);
    const r = g.contestResults[0]!;
    expect(r.score).toBeGreaterThanOrEqual(17.2);
    expect(r.metal).toBe(1); // argent
    expect(b.medals).toEqual([{ tier: 0, metal: 1, cat: r.cat, score: r.score }]);
    expect(g.medalBonus(b)).toBe(COCARDE_BONUS[1]);
    expect(g.gems).toBeGreaterThan(gems);
    g.seenContestResult();
    expect(g.contestResults).toEqual([]);
  });

  it('chaque rival présente sa bière : un nom, une bouteille et une étiquette tirés au hasard', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 30; i++) {
      const c = drawContest(rng, 0, 0);
      const beers = c.rivals.map((r) => r.beer);
      expect(new Set(beers).size).toBe(3);
      for (const r of c.rivals) {
        expect(r.label?.bottle).toBeDefined();
        expect(r.label?.bottle).not.toBe('gold'); // le luxe est réservé aux rivaux internationaux
      }
    }
  });

  it('places et cocardes', () => {
    const rivals = [{ name: 'A', score: 18 }, { name: 'B', score: 17 }, { name: 'C', score: 16 }];
    expect(placeOf(18.5, rivals)).toEqual({ rank: 0, metal: 2 });
    expect(placeOf(18, rivals)).toEqual({ rank: 0, metal: 2 }); // égalité : le joueur passe devant
    expect(placeOf(16.4, rivals)).toEqual({ rank: 2, metal: 0 });
    expect(placeOf(15, rivals)).toEqual({ rank: 3, metal: null });
    // la cocarde la plus prestigieuse compte : un bronze international vaut plus qu'un or régional
    expect(medalBonus([{ tier: 0, metal: 2, cat: 'ipa', score: 18 }, { tier: 2, metal: 0, cat: 'ipa', score: 19 }])).toBe(COCARDE_BONUS[6]);
    expect(medalBonus(undefined)).toBe(0);
  });

  it('le jury reste à ± 0,3 de la note du lot', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const s = juryScore(0.9, rng);
      expect(Math.abs(s - 18)).toBeLessThanOrEqual(0.31);
    }
  });

  it('une bière médaillée se vend plus cher au grossiste', () => {
    const { g, b } = setup(3);
    const sell = () => g.sellWholesale(b.id, 10).amount!;
    const plain = sell();
    b.medals = [{ tier: 2, metal: 2, cat: 'ipa', score: 19.9 }];
    expect(sell()).toBeCloseTo(plain * 1.5, 5);
  });

  it('popularité expliquée : la qualité, les tendances et le plafond de la brasserie', () => {
    const { g, b } = setup(2);
    const p = g.popBreakdown(b);
    expect(p.cap).toBe(0.5);
    expect(p.limit).toBe('cap');
    expect(p.target).toBe(0.5);
    expect(p.target).toBeCloseTo(g.popTarget(b), 10);
  });

  it('le concours en cours, l\'inscription et les médailles se sauvegardent', async () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contest);
    b.medals = [{ tier: 0, metal: 2, cat: 'ipa', score: 17 }];
    const saves = new SaveManager(new MemoryStorage());
    await saves.save(g);
    const back = (await saves.load())!.game;
    expect(back.contest).toEqual(g.contest);
    expect(back.contestNext).toBe(g.contestNext);
    expect(back.beers[0]!.medals).toEqual(b.medals);
  });
});
