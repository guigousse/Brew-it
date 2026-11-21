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
  b.week.fill(150_000 / 28); // très vendue : la marque est connue
  g.autoWholesale = false; // les tests remplissent le stock bien au-delà du stockage : pas de déstockage
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
    b.tasting = { ...b.tasting, quality: 0.95 };
    expect(g.partnerLock(games)).not.toBeNull(); // pas de médaille internationale
    b.medals = [{ tier: 2, metal: 0, cat: 'ipa', score: 18.5 }];
    expect(g.partnerLock(games)).toBeNull();
    b.week.fill(0);
    expect(g.partnerLock(games)).not.toBeNull(); // marque trop faible sans ventes
  });

  it('paliers de popularité : la marque doit être assez connue, la pub en cours ne compte pas', () => {
    const { g, b } = setup(3);
    b.week.fill(0); // qualité seule : 37,5 points (+10 par tendance)
    const rock = partnerById('rock')!;
    if (g.brandBase * 100 < 50) {
      expect(g.partnerLock(rock)).toContain('50');
      g.advertise('flyers'); // +10 points tant qu'elle dure, sans effet sur les paliers
      expect(g.partnerLock(rock)).not.toBeNull();
    }
    b.week.fill(10_000 / 28); // 30 points de ventes
    expect(g.partnerLock(rock)).toBeNull();
    expect(g.partnerChecks(rock).every((c) => c.ok)).toBe(true);
  });

  it('signer coûte le prix du contrat et demande une bière officielle assez bonne ; un seul partenariat à la fois', () => {
    const { g, b } = setup(3);
    const money = g.money;
    expect(g.signPartner('rock', 999).ok).toBe(false); // pas de bière
    expect(g.signPartner('rock', b.id).ok).toBe(true);
    expect(g.money).toBe(money - partnerById('rock')!.fee);
    expect(g.partners[0]!.beerId).toBe(b.id);
    expect(g.signPartner('foot', b.id).ok).toBe(false); // une seule place à la microbrasserie
    expect(g.signPartner('rock', b.id).ok).toBe(false); // déjà en cours
  });

  it('plusieurs contrats en parallèle : 2 à l\'usine, 3 au labo du futur ; les jauges se remplissent dans l\'ordre de signature', () => {
    const { g, b } = setup(4);
    expect(g.partnerSlots).toBe(2);
    b.stock = 0;
    expect(g.signPartner('rock', b.id).ok).toBe(true);
    expect(g.signPartner('foot', b.id).ok).toBe(true);
    expect(g.signPartner('rugby', b.id).ok).toBe(false); // plus de place
    b.stock = Math.ceil(10_000 / 0.33); // de quoi remplir le premier (9 000 L), pas le second
    g.step(1);
    expect(g.partners[0]!.deliveries).toBe(1); // le premier signé est servi d'abord
    expect(g.partners[1]!.deliveries).toBe(0);
    // la bière officielle des deux contrats cumule leur visibilité
    expect(g.partnerVisibility(b)).toBe(partnerById('rock')!.visibility + partnerById('foot')!.visibility);
    for (const id of STATION_ORDER) g.stations[id] = { level: 5 };
    expect(g.partnerSlots).toBe(3);
    expect(g.signPartner('rugby', b.id).ok).toBe(true);
  });

  it('la jauge se remplit toute seule depuis le stock, chaque litre payé tout de suite ; pleine, la livraison part seule ; puis le lendemain', () => {
    const { g, b } = setup(3);
    const p = partnerById('rock')!;
    b.stock = Math.ceil(5_000 / 0.33); // 5 000 L : un peu plus de la moitié d'une livraison
    g.signPartner('rock', b.id);
    const money = g.money;
    g.step(1);
    const ship = g.partners[0]!;
    const gauge = g.partnerGauge(ship);
    expect(gauge).toBeGreaterThan(4_999);
    expect(b.stock).toBe(0);
    expect(g.money - money).toBeCloseTo(gauge * (wholesalePrice(b.tasting) / 0.33) * p.pay, 3); // payé tout de suite
    expect(ship.deliveries).toBe(0);
    // le stock arrive : la jauge se remplit, la livraison part toute seule
    const delivered: number[] = [];
    g.events.on((e) => e.type === 'partnerDelivered' && delivered.push(e.deliveries));
    b.stock = 100_000;
    g.step(60);
    expect(delivered).toEqual([1]);
    expect(ship.deliveries).toBe(1);
    expect(g.partnerGauge(ship)).toBe(0);
    expect(g.partnerWait(ship)).toBeGreaterThan(0);
    // pas avant le lendemain
    g.step(3600);
    expect(g.partnerGauge(ship)).toBe(0);
    g.step(86400);
    g.step(60);
    expect(ship.deliveries).toBe(2);
  });

  it('la bière officielle part d\'abord, puis les autres assez bonnes ; les fûts comptent', () => {
    const { g, b } = setup(3);
    const other = JSON.parse(JSON.stringify(b));
    other.id = 99;
    other.name = 'Autre';
    g.beers.push(other);
    b.stock = 0;
    b.kegs = [200, 200]; // 2 × 50 L
    other.stock = 100_000;
    g.signPartner('foot', b.id);
    g.step(1);
    expect(b.kegs).toHaveLength(0);
    expect(other.stock).toBeLessThan(100_000);
    // une bière trop faible ne part pas
    const weak = g.beers.find((x) => x.id === 99)!;
    weak.tasting = { ...weak.tasting, quality: 0.65 };
    weak.stock = 5000;
    g.step(86400 + 60);
    expect(weak.stock).toBe(5000);
  });

  it('la bière officielle gagne de la visibilité tant que le contrat dure ; les livraisons comptent pour la popularité', () => {
    const { g, b } = setup(3);
    b.week.fill(0);
    g.step();
    const before = g.popBreakdown(b).total;
    b.stock = 30_000;
    expect(g.signPartner('rugby', b.id).ok).toBe(true); // marque à 30 / 100 suffit
    g.step(1);
    const parts = g.popBreakdown(b);
    expect(parts.partner * 20).toBe(partnerById('rugby')!.visibility);
    expect(parts.total).toBeGreaterThan(before);
    expect(g.weekLiters(b)).toBeGreaterThan(0); // les litres partis comptent dans les ventes de la semaine
  });

  it('7 livraisons remplissent le contrat : prime en diamants', () => {
    const { g, b } = setup(3);
    const p = partnerById('rock')!;
    g.signPartner('rock', b.id);
    const ends: { gems: number; days: number }[] = [];
    g.events.on((e) => e.type === 'partnerEnd' && ends.push(e));
    for (let d = 0; d < PARTNER_DAYS; d++) {
      b.stock = 100_000;
      g.step(60);
      g.step(86400);
    }
    expect(g.partners).toHaveLength(0);
    expect(g.partnersDone.rock).toBe(1);
    expect(ends).toEqual([expect.objectContaining({ days: PARTNER_DAYS, gems: p.gems })]);
  });

  it('le partenariat en cours se sauvegarde', async () => {
    const { g, b } = setup(3);
    b.stock = 1000;
    g.signPartner('rock', b.id);
    g.step(1);
    expect(g.partners[0]!.gauge.length).toBeGreaterThan(0);
    const saves = new SaveManager(new MemoryStorage());
    await saves.save(g);
    const back = (await saves.load())!.game;
    expect(back.partners).toEqual(g.partners);
    expect(PARTNERS.length).toBe(6);
  });
});
