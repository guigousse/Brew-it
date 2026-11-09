/**
 * Rentabilité des campagnes de pub et des événements du bar, niveau par niveau.
 * 1. SNAP=/tmp/snaps npm run balance 45   (garde l'état de la partie simulée à chaque niveau)
 * 2. npm run roi /tmp/snaps ev  (événements : 6 fûts par tireuse, puis cave vide)
 *    npm run roi /tmp/snaps ad  (pubs)
 * Chaque variante rejoue 24 h (H=…) à partir du même état, en moyenne sur N tirages (N=…), en livrant toutes les 30 min.
 */
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game';
import { ADS, BAR_EVENTS, kegLiters, type AdId, type BarEventId } from '../src/core/market';

const dir = process.argv[2]!;
const H = Number(process.env.H ?? 24) * 3600;
const N = Number(process.env.N ?? 10);
type Act = { kind: 'none' } | { kind: 'ad'; id: AdId } | { kind: 'ev'; id: BarEventId };

function play(snap: unknown, act: Act, seed: number, kegsPerTap: number) {
  const g = Game.fromJSON(JSON.parse(JSON.stringify(snap)));
  g.rng.state = (seed * 2654435761) >>> 0;
  g.money += 1e10;
  g.computerLevel = 5;
  const kl = kegLiters(g.batchLiters);
  for (const b of g.beers) b.kegs = [];
  const best = [...g.beers].sort((a, b) => b.pop - a.pop);
  for (let i = 0; i < g.taps.length * kegsPerTap; i++) best[i % best.length]!.kegs.push(kl);
  for (const e of BAR_EVENTS) if (e.needs && !g.owns(e.needs)) (g.owned as string[]).push(e.needs);
  g.partyReadyAt = 0; g.partyUntil = 0; g.adUntil = 0;
  const m0 = g.money, bar0 = g.barRevenue;
  let orders = 0, cost = 0;
  if (act.kind === 'ad') { cost = g.adCost(act.id); if (!g.advertise(act.id).ok) throw new Error('ad'); }
  if (act.kind === 'ev') { cost = g.eventCost(act.id); const r = g.startEvent(act.id); if (!r.ok) throw new Error(r.reason); }
  for (let t = 0; t < H; t += 0.5) {
    g.step(0.5);
    if (t % 1800 < 0.5) {
      for (const o of [...g.orders]) { const r = g.fulfill(o.id, g.autoPick(o)); if (r.ok) orders += r.amount!; }
      for (let i = 0; i < 10 && g.planned < 20; i++) if (!g.planBrew(g.beers[i % g.beers.length]!.id, 'bottle').ok) break;
    }
  }
  return { money: g.money - m0 + cost, bar: g.barRevenue - bar0, orders, cost };
}
const avg = (snap: unknown, act: Act, kegs: number) => {
  const r = { money: 0, bar: 0, orders: 0, cost: 0 };
  for (let s = 1; s <= N; s++) { const x = play(snap, act, s, kegs); r.money += x.money / N; r.bar += x.bar / N; r.orders += x.orders / N; r.cost = x.cost; }
  return r;
};
const k = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v.toFixed(0));
const mode = process.argv[3] ?? 'ev';
for (let lv = 1; lv <= 5; lv++) {
  let snap: unknown;
  try { snap = JSON.parse(readFileSync(`${dir}/${mode === 'ev' ? 'r' : 'b'}${lv}.json`, 'utf8')); } catch { continue; }
  if (mode === 'ev') {
    for (const kegs of [6, 0]) {
      const b = avg(snap, { kind: 'none' }, kegs);
      const line = [`Bar ${lv} · ${kegs} fûts/tireuse · bar sans rien ${k(b.bar)}`];
      for (const e of BAR_EVENTS) { const r = avg(snap, { kind: 'ev', id: e.id }, kegs); line.push(`${e.id} coût ${k(r.cost)} +bar ${k(r.bar - b.bar)} (×${((r.bar - b.bar) / r.cost).toFixed(2)})`); }
      console.log(line.join(' | '));
    }
  } else {
    const b = avg(snap, { kind: 'none' }, 2);
    const line = [`Brasserie ${lv} · revenu ${k(b.money)} · cmd ${k(b.orders)}`];
    for (const a of ADS) { const r = avg(snap, { kind: 'ad', id: a.id }, 2); line.push(`${a.id} ${k(r.cost)}: +argent ${k(r.money - b.money)} (×${((r.money - b.money) / r.cost).toFixed(2)}) +cmd ${k(r.orders - b.orders)}`); }
    console.log(line.join(' | '));
  }
}
