import { DEFAULT_LABEL } from './label';
import { Game } from './game';
import { PARTNER_DAYS, partnerById, PARTNERS } from './partners';
import { wholesalePrice } from './orders';
import { STATION_ORDER } from './stations';
import { MemoryStorage, SaveManager } from './save';

function setup(level: number) {
  const g = new Game();
  g.money = 1e8;
  g.brew();
  for (let i = 0; i < 3000 * 20 && !g.tastable; i++) g.step();
  g.keepTrial('Blonde', DEFAULT_LABEL);
  for (const id of STATION_ORDER) g.stations[id] = { level };
  const b = g.beers[0]!;
  b.tasting = { ...b.tasting, quality: 0.8 };
  return { g, b };
}

describe('partenariats', () => {
  it('chaque partenaire s\'ouvre avec la brasserie ; les Jeux mondiaux demandent aussi la marque et une médaille internationale', () => {
    const { g, b } = setup(2);
    expect(g.partnerLock(partnerById('rugby')!)).toBeNull();
    expect(g.partnerLock(partnerById('rock')!)).not.toBeNull();
    for (const id of STATION_ORDER) g.stations[id] = { level: 5 };
    expect(g.partnerLock(partnerById('festival')!)).toBeNull();
    const games = partnerById('games')!;
    b.pop = 1;
    expect(g.partnerLock(games)).not.toBeNull(); // pas de médaille internationale
    b.medals = [{ tier: 2, metal: 0, cat: 'ipa', score: 18.5 }];
    expect(g.partnerLock(games)).toBeNull();
    b.pop = 0.5;
    expect(g.partnerLock(games)).not.toBeNull(); // marque trop faible
  });

  it('signer coûte le prix du contrat ; un seul partenariat à la fois', () => {
    const { g } = setup(3);
    const money = g.money;
    expect(g.signPartner('rock').ok).toBe(true);
    expect(g.money).toBe(money - partnerById('rock')!.fee);
    expect(g.signPartner('foot').ok).toBe(false);
  });

  it('la jauge du jour : on livre au plus ce qu\'il reste, payé plus que le grossiste ; elle se recharge le lendemain', () => {
    const { g, b } = setup(3);
    const p = partnerById('rock')!;
    g.signPartner('rock');
    b.stock = 10_000; // 3 300 L
    const money = g.money;
    const r = g.deliverPartner();
    expect(r.ok).toBe(true);
    expect(r.liters!).toBeLessThanOrEqual(p.daily);
    expect(r.liters!).toBeGreaterThan(p.daily - 0.34);
    expect(g.money - money).toBeCloseTo((r.liters! / 0.33) * wholesalePrice(b.tasting) * p.pay, 3);
    expect(g.partnerLeft).toBeLessThan(0.34);
    expect(g.deliverPartner().ok).toBe(false); // tout est livré pour aujourd'hui
    g.step(86400);
    expect(g.partnerDay).toBe(1);
    expect(g.partnerLeft).toBe(p.daily);
  });

  it('les fûts comptent ; les bières trop faibles sont refusées', () => {
    const { g, b } = setup(3);
    g.signPartner('foot'); // Bonne au moins
    b.kegs = [200, 200]; // 2 × 50 L
    expect(g.deliverPartner().liters).toBe(100);
    b.tasting = { ...b.tasting, quality: 0.65 }; // Correcte : refusée
    b.kegs = [200];
    expect(g.deliverPartner().ok).toBe(false);
  });

  it('les litres livrés comptent double pour la popularité', () => {
    const { g, b } = setup(3);
    g.signPartner('rock');
    b.stock = 3000;
    const r = g.deliverPartner();
    expect(g.weekLiters(b)).toBeCloseTo(r.liters! * 2, 5);
  });

  it('toutes les journées remplies : prime en diamants ; le livreur s\'en charge pendant l\'absence', () => {
    const { g, b } = setup(3);
    const p = partnerById('rock')!;
    g.signPartner('rock');
    g.staffUntil.courier = 1e12;
    const ends: { gems: number; days: number }[] = [];
    g.events.on((e) => e.type === 'partnerEnd' && ends.push(e));
    for (let d = 0; d < PARTNER_DAYS; d++) {
      b.stock = 10_000;
      for (let t = 0; t < 86400; t += 60) g.step(60);
    }
    g.step(60);
    expect(g.partner).toBeNull();
    expect(g.partnersDone.rock).toBe(1);
    expect(ends).toEqual([expect.objectContaining({ days: PARTNER_DAYS, gems: p.gems })]);
  });

  it('une journée manquée : pas de prime', () => {
    const { g } = setup(3);
    g.signPartner('rugby');
    const gems = g.gems;
    g.step(PARTNER_DAYS * 86400 + 1);
    expect(g.partner).toBeNull();
    expect(g.partnersDone.rugby).toBeUndefined();
    expect(g.gems).toBe(gems);
  });

  it('le partenariat en cours se sauvegarde', async () => {
    const { g, b } = setup(3);
    g.signPartner('rock');
    b.stock = 1000;
    g.deliverPartner();
    const saves = new SaveManager(new MemoryStorage());
    await saves.save(g);
    const back = (await saves.load())!.game;
    expect(back.partner).toEqual(g.partner);
    expect(PARTNERS.length).toBe(6);
  });
});
