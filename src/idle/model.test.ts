import { describe, expect, it } from 'vitest';
import { BIZ, buy, costOf, cycleTime, fmt, fromJSON, hire, maxAffordable, newState, offline, payout, prestige, start, tick, yeastGain, yeastFor, buyUpgrade, UPGRADES } from './model';

describe('prototype idle', () => {
  it('on démarre avec une cuve : la toucher brasse, le cycle rapporte', () => {
    const s = newState();
    expect(s.owned[0]).toBe(1);
    expect(tick(s, 5)).toBe(0); // rien sans toucher
    expect(start(s, 0)).toBe(true);
    expect(start(s, 0)).toBe(false); // déjà en cours
    tick(s, BIZ[0]!.time);
    expect(s.money).toBe(payout(s, 0));
    expect(s.progress[0]).toBe(-1); // sans maître brasseur, ça s'arrête
  });

  it('acheter coûte de plus en plus, et Max achète tout ce qu\'on peut', () => {
    const s = newState();
    s.money = 1000;
    const c1 = costOf(s, 0, 1);
    expect(buy(s, 0, 1)).toBe(true);
    expect(costOf(s, 0, 1)).toBeCloseTo(c1 * BIZ[0]!.rate);
    const n = maxAffordable(s, 0);
    expect(costOf(s, 0, n)).toBeLessThanOrEqual(s.money);
    expect(costOf(s, 0, n + 1)).toBeGreaterThan(s.money);
  });

  it('les paliers doublent la vitesse', () => {
    const s = newState();
    s.owned[0] = 24;
    const t = cycleTime(s, 0);
    s.owned[0] = 25;
    expect(cycleTime(s, 0)).toBeCloseTo(t / 2);
  });

  it('un maître brasseur fait tourner l\'activité, même pendant l\'absence', () => {
    const s = newState();
    s.money = BIZ[0]!.manager;
    expect(hire(s, 0)).toBe(true);
    const per = payout(s, 0) / cycleTime(s, 0);
    expect(offline(s, 3600)).toBeCloseTo(per * 3600, -1);
  });

  it('les améliorations triplent les gains', () => {
    const s = newState();
    const before = payout(s, 0);
    const u = UPGRADES.find((x) => x.biz === 0)!;
    s.money = u.cost;
    expect(buyUpgrade(s, u.id)).toBe(true);
    expect(payout(s, 0)).toBeCloseTo(before * 3);
  });

  it('repartir de zéro lègue des levures mères, qui augmentent les gains', () => {
    const s = newState();
    s.allTime = 1e10;
    expect(yeastGain(s)).toBe(yeastFor(1e10));
    const base = payout(newState(), 0);
    const got = prestige(s);
    expect(got).toBe(10);
    expect(s.money).toBe(0);
    expect(s.owned[0]).toBe(1);
    expect(payout(s, 0)).toBeCloseTo(base * 1.2);
    expect(yeastGain(s)).toBe(0);
  });

  it('une sauvegarde se recharge, même incomplète', () => {
    const s = fromJSON({ money: 5, owned: [3] });
    expect(s.money).toBe(5);
    expect(s.owned).toHaveLength(BIZ.length);
    expect(s.owned[0]).toBe(3);
    expect(s.owned[1]).toBe(0);
  });

  it('les grands nombres se lisent', () => {
    expect(fmt(950)).toBe('950');
    expect(fmt(3.4e6)).toBe('3,40 millions');
    expect(fmt(1.2e9)).toBe('1,20 milliard');
  });
});
