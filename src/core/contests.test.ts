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
  b.tasting = { ...b.tasting, quality: 0.95 };
  b.week.fill(150_000 / 28); // très vendue cette semaine : 2,5 ★ de ventes
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

  it('les trois concours tournent en parallèle dès la microbrasserie, chacun avec sa catégorie et ses rivaux', () => {
    const { g } = setup(3);
    until(g, () => g.contests.every((c) => !!c), 6 * 3600);
    expect(g.contests.map((c) => c!.tier)).toEqual([0, 1, 2]);
    // chacun à son rythme : il se ferme au bout de 12 h, puis une nouvelle session s'ouvre
    const first = g.contestOf(0)!;
    until(g, () => g.contestOf(0) !== first, CONTEST_OPEN_S + 9 * 3600);
    expect(g.contestOf(0)).not.toBe(first);
  });

  it('hiérarchie : le national demande une médaille au régional, l\'international une médaille au national', () => {
    const { g, b } = setup(5);
    until(g, () => g.contests.every((c) => !!c), 6 * 3600);
    for (const t of [1, 2] as const) g.contestOf(t)!.cat = TRENDS.find((x) => x.test(b.tasting))!.id;
    const ok = (t: 0 | 1 | 2) => g.contestChecks(t, b).every((x) => x.ok);
    expect(g.contestChecks(1, b)[0]!.ok).toBe(false);
    expect(ok(1)).toBe(false);
    expect(g.enterContest(1, b.id).ok).toBe(false);
    b.medals = [{ tier: 0, metal: 0, cat: 'ipa', score: 15 }]; // un bronze régional suffit
    expect(g.contestChecks(1, b)[0]!.ok).toBe(true);
    expect(g.contestChecks(2, b)[0]!.ok).toBe(false); // pas encore de médaille nationale
    b.medals.push({ tier: 1, metal: 1, cat: 'ipa', score: 17.5 });
    expect(g.contestChecks(2, b)[0]!.ok).toBe(true);
  });

  it('inscription : catégorie, étoiles, bouteilles et droit d\'entrée', () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contestOf(0));
    const c = g.contestOf(0)!;
    const cat = TRENDS.find((t) => t.id === c.cat)!;
    if (!cat.test(b.tasting)) {
      expect(g.enterContest(0, b.id).ok).toBe(false);
      c.cat = TRENDS.find((t) => t.test(b.tasting))!.id;
    }
    b.week.fill(0);
    g.step(); // qualité seule : 2,25 ★ (+ ½ par tendance), il en faut 3
    if (g.popBreakdown(b).total < 2.75) expect(g.enterContest(0, b.id).ok).toBe(false);
    b.week.fill(150_000 / 28);
    g.step();
    const money = g.money;
    const stock = b.stock;
    expect(g.enterContest(0, b.id).ok).toBe(true);
    expect(g.money).toBe(money - contestFee(0, 3));
    expect(b.stock).toBe(stock - CONTEST_BOTTLES);
    expect(g.enterContest(0, b.id).ok).toBe(false); // une seule bière par concours
  });

  it('le jury goûte dès l\'inscription ; battre les rivaux donne une médaille, une cocarde et son bonus de vente', () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contestOf(0));
    const c = g.contestOf(0)!;
    c.cat = TRENDS.find((t) => t.test(b.tasting))!.id;
    c.rivals = [{ name: 'A', score: 18 }, { name: 'B', score: 17 }, { name: 'C', score: 16 }];
    b.tasting = { ...b.tasting, quality: 0.875 }; // 17,5/20 : devant B et C
    const gems = g.gems;
    expect(g.enterContest(0, b.id).ok).toBe(true);
    // pas d'attente : le jury goûte tout de suite et le concours se clôt
    expect(g.contestResults).toHaveLength(1);
    expect(g.contestOf(0)).toBeNull();
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

  it('popularité exigée : 60, 80 puis 90 points (l\'international n\'exige pas 100)', () => {
    const { g, b } = setup(5);
    until(g, () => !!g.contestOf(2), 10 * 86400);
    const c = g.contestOf(2)!;
    c.cat = TRENDS.find((t) => t.test(b.tasting))!.id;
    b.medals = [{ tier: 1, metal: 0, cat: 'ipa', score: 17 }]; // qualifiée par le national
    b.tasting = { ...b.tasting, quality: 0.9 }; // 40 points de qualité
    b.week.fill(150_000 / 28); // 50 points de ventes
    g.step();
    expect(g.popBreakdown(b).total * 20).toBeGreaterThanOrEqual(90);
    expect(g.contestChecks(2, b).every((x) => x.ok)).toBe(true);
    expect(g.contestChecks(2, b)[2]!.text).toContain('90');
  });

  it('les parties d\'avant les trois concours gardent leur concours en cours', () => {
    const { g } = setup(3);
    until(g, () => !!g.contestOf(0));
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const old = json.contests[0];
    delete json.contests;
    delete json.contestNexts;
    json.contest = old;
    json.contestNext = 0;
    const back = Game.fromJSON(json);
    expect(back.contestOf(0)).toEqual(old);
    expect(back.contestOf(1)).toBeNull();
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

  it('popularité expliquée : qualité, tendances, ventes sur 7 jours, et le palier suivant', () => {
    const { g, b } = setup(2);
    b.week.fill(0);
    b.week[b.week.length - 1] = 2_000;
    g.step();
    const p = g.popBreakdown(b);
    expect(p.liters).toBeCloseTo(2_000, 0);
    expect(p.next).toEqual({ liters: 10_000, stars: 1.5 });
    expect(b.pop).toBeCloseTo(p.total / 5, 5);
  });

  it('le concours en cours, l\'inscription et les médailles se sauvegardent', async () => {
    const { g, b } = setup(3);
    until(g, () => !!g.contest);
    b.medals = [{ tier: 0, metal: 2, cat: 'ipa', score: 17 }];
    const saves = new SaveManager(new MemoryStorage());
    await saves.save(g);
    const back = (await saves.load())!.game;
    expect(back.contests).toEqual(g.contests);
    expect(back.contestNexts).toEqual(g.contestNexts);
    expect(back.beers[0]!.medals).toEqual(b.medals);
  });
});
