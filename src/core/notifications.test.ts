import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL } from './label';
import { Game, TUTO_DONE } from './game';
import { forecast, NOTIF, outOfQuietHours, schedule, type NotifCategory, type PlannedNotif } from './notifications';

const ALL: Record<NotifCategory, boolean> = { brewery: true, orders: true, contests: true, reminders: true };
/** Un mardi à 10 h, heure locale. */
const NOON = new Date(2026, 10, 17, 10, 0, 0).getTime();
const H = 3600_000;

const run = (g: Game, s: number) => { for (let t = 0; t < s; t += 0.5) g.step(0.5); };
const started = (money = 1e6) => {
  const g = new Game();
  g.money = money;
  g.brew();
  for (let i = 0; i < 20000 && !g.tastable; i++) g.step(0.5);
  g.keepTrial('Blonde', DEFAULT_LABEL);
  g.tips = TUTO_DONE;
  return g;
};
const notif = (kind: PlannedNotif['kind'], at: number, priority: number, category: NotifCategory = 'brewery', deadline?: number): PlannedNotif =>
  ({ kind, category, at, priority, title: 'Brew It', body: kind, deadline });

describe('notifications', () => {
  it('rien pendant la visite guidée', () => {
    const g = new Game();
    expect(forecast(g, NOON)).toEqual([]);
  });

  it('le plafond des 8 h et les rappels à 1 et 3 jours', () => {
    const g = started();
    const list = forecast(g, NOON);
    expect(list.find((n) => n.kind === 'cap')?.at).toBe(NOON + 8 * H);
    expect(list.find((n) => n.kind === 'remind1')?.at).toBe(NOON + 24 * H);
    expect(list.find((n) => n.kind === 'remind3')?.at).toBe(NOON + 72 * H);
    expect(list.find((n) => n.kind === 'remind1')?.body).toContain('Blonde');
  });

  it('le livreur prévient 30 min avant la fin de sa tournée, sans parler de diamants', () => {
    const g = started();
    g.staffUntil.courier = g.time + 3 * 3600;
    const n = forecast(g, NOON).find((x) => x.kind === 'courier')!;
    expect(n.at).toBe(NOON + 2.5 * H);
    expect(n.body).not.toContain('💎');
  });

  it('un essai lancé avant de partir : prévenir quand il est prêt à goûter', () => {
    const g = started();
    g.selectedBeer = null; // un nouvel essai, pas la Blonde
    expect(g.brew().ok).toBe(true);
    expect(g.tastable).toBeUndefined();
    const n = forecast(g, NOON).find((x) => x.kind === 'taste');
    expect(n).toBeDefined();
    expect(n!.at).toBeGreaterThan(NOON);
  });

  it('un événement du bar prévient quand son propre repos est fini et que des fûts attendent', () => {
    const g = started();
    for (const id of ['plants', 'darts', 'posters', 'tv'] as const) expect(g.buyDecor(id).ok).toBe(true);
    expect(g.startEvent('foot').ok).toBe(true);
    run(g, 90 * 60 + 2);
    g.beers[0]!.kegs = Array(200).fill(5);
    // la soirée foot se repose, mais le tournoi de fléchettes est libre : rien à annoncer pour lui
    const n = forecast(g, NOON).find((x) => x.kind === 'eventReady')!;
    expect(n.body).toContain('Soirée foot');
    expect(n.at).toBeCloseTo(NOON + (g.eventReadyTime('foot') - g.time) * 1000, -4);
  });

  it('heures calmes : rien de 22 h à 8 h, la notification attend le matin', () => {
    const at = new Date(2026, 10, 17, 23, 30).getTime();
    expect(outOfQuietHours(at)).toBe(new Date(2026, 10, 18, 8, 0).getTime());
    const early = new Date(2026, 10, 18, 6, 0).getTime();
    expect(outOfQuietHours(early)).toBe(new Date(2026, 10, 18, 8, 0).getTime());
    expect(outOfQuietHours(NOON)).toBe(NOON);
  });

  it('une notification urgente qui tomberait après son échéance, à cause de la nuit, est abandonnée', () => {
    const night = new Date(2026, 10, 17, 23, 0).getTime();
    const out = schedule([notif('urgentOrder', night, 70, 'orders', night + 2 * H)], ALL, NOON);
    expect(out).toEqual([]);
  });

  it('au moins 2 h entre deux notifications : la plus importante l\'emporte', () => {
    const out = schedule([notif('eventReady', NOON + H, 50), notif('taste', NOON + 1.5 * H, 80), notif('cap', NOON + 8 * H, 100)], ALL, NOON);
    expect(out.map((n) => n.kind)).toEqual(['taste', 'cap']);
  });

  it('4 notifications au plus par absence, plus les rappels', () => {
    const list = [0, 1, 2, 3, 4, 5].map((i) => notif('boardFull', NOON + (i * 2 + 0.5) * H, 60 - i, 'orders'));
    list.push(notif('remind1', NOON + 24 * H, 10, 'reminders'));
    const out = schedule(list, ALL, NOON);
    expect(out.filter((n) => n.category !== 'reminders')).toHaveLength(NOTIF.max);
    expect(out.some((n) => n.kind === 'remind1')).toBe(true);
  });

  it('une catégorie coupée dans les options ne notifie plus', () => {
    const out = schedule([notif('contestOpen', NOON + H, 75, 'contests'), notif('cap', NOON + 8 * H, 100)], { ...ALL, contests: false }, NOON);
    expect(out.map((n) => n.kind)).toEqual(['cap']);
  });
});
