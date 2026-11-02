/**
 * Joueur simulé : 4 visites par jour (8 h, 12 h 30, 18 h 30, 22 h 30), 10 minutes de jeu actif par visite,
 * la brasserie tourne pendant l'absence (plafond hors-ligne). À chaque visite il récolte, achète ce qui est utile
 * du moins cher au plus cher, et crée une nouvelle bière quand il a une place libre.
 *
 *   npx vite-node scripts/balance.ts [jours]
 */
import { DRINKABLE_MIN } from '../src/core/brewing/model';
import { DEFAULT_LABEL } from '../src/core/label';
import { Game, simulateOffline } from '../src/core/game';
import { BAR, CLIENTS } from '../src/core/market';
import { MAX_LEVEL, STATION_ORDER, upgradeCost } from '../src/core/stations';
import { STORAGE } from '../src/core/warehouse';
import { BOT_RECIPES } from './recipes';

const DAYS = Number(process.argv[2] ?? 45);
const SESSIONS = (process.env.SESSIONS ?? "8,12.5,18.5,22.5").split(",").map(Number);
const ACTIVE_MIN = Number(process.env.ACTIVE ?? 10);
const DT = 0.25;

const g = new Game();
let clock = SESSIONS[0]! * 3600; // secondes depuis le jour 1 à minuit
const log: { t: number; what: string; cost: number }[] = [];
const fmt = (t: number) => `J${Math.floor(t / 86400) + 1} ${String(Math.floor((t % 86400) / 3600)).padStart(2, '0')}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
const buy = (what: string, cost: number) => log.push({ t: clock, what, cost });

/** Remplit toutes les commandes possibles avec les bières qui conviennent (les plus en stock d'abord). */
function deliver() {
  for (const o of [...g.orders]) {
    const ids = g.suitable(o).sort((a, b) => b.stock - a.stock).map((b) => b.id);
    const r = g.fulfill(o.id, ids);
    if (r.ok) delivered += r.amount!;
  }
}
let delivered = 0;

/** Le bar : change les fûts vides (la bière la plus populaire d'abord) et programme des brassins en fûts. */
function tendBar() {
  g.taps.forEach((t, i) => {
    if (t.glasses > 0) return;
    const b = g.beers.filter((x) => x.kegs.length).sort((a, c) => c.pop - a.pop)[0];
    if (b) g.swapKeg(i, b.id);
  });
  if (!g.beers.length) return;
  const kegs = g.beers.reduce((s, b) => s + b.kegs.length + g.pendingKegs(b.id), 0) + g.plan.filter((p) => p.format === 'keg').length;
  if (kegs < g.taps.length * 2 && g.plan.length < 2) g.planBrew(g.beers[g.batchesDone % g.beers.length]!.id, 'keg');
}
const brandByDay: number[] = [];

function play(seconds: number, during?: () => void) {
  for (let s = 0; s < seconds; s += DT) {
    g.step(DT);
    clock += DT;
    during?.();
  }
}

/** Crée une bière : réglages, essai, attente de la première bouteille, on garde. */
function newBeer(): boolean {
  const recipe = BOT_RECIPES[g.beers.length % BOT_RECIPES.length]!;
  g.autoBrew = false;
  g.recipe = { ...recipe };
  g.selectedBeer = null;
  let guard = 0;
  while (!g.canBrew().ok && guard++ < 20000) play(1);
  if (!g.brew().ok) return false;
  guard = 0;
  while (!g.tastable && guard++ < 20000) play(1);
  const t = g.tastable?.tasting;
  if (!t || t.quality < DRINKABLE_MIN) {
    g.discardTrial();
    return false;
  }
  g.keepTrial(`Bière ${g.beers.length + 1}`, DEFAULT_LABEL);
  return true;
}

function shop() {
  for (let k = 0; k < 200; k++) {
    const options: { cost: number; label: string; act: () => boolean }[] = [];
    for (const d of CLIENTS) {
      if (g.signed.includes(d.id) || !g.clientOpen(d.id)) continue;
      options.push({ cost: d.fee, label: `Contrat ${d.name}`, act: () => g.sign(d.id).ok });
    }
    for (const id of STATION_ORDER) {
      const lv = g.level(id);
      if (lv >= MAX_LEVEL) continue;
      options.push({ cost: upgradeCost(id, lv + 1), label: `${id} → ${lv + 1}`, act: () => g.upgrade(id).ok });
    }
    for (const id of g.signed) {
      const c = g.dealCost(id);
      if (c != null) options.push({ cost: c, label: `Négo ${id} ${(g.deals[id] ?? 0) + 1}`, act: () => g.negotiate(id).ok });
    }
    const bar = BAR[g.barLevel];
    if (bar) options.push({ cost: bar.cost, label: `Bar → ${g.barLevel + 1}`, act: () => g.upgradeBar().ok });
    const next = STORAGE[g.storageLevel];
    if (next) options.push({ cost: next.cost, label: `Stockage → ${g.storageLevel + 1}`, act: () => g.upgradeStorage().ok });
    const slot = g.nextSlotCost;
    if (slot != null) options.push({ cost: slot, label: `Place gamme ${g.rangeSlots + 1}`, act: () => g.buySlot().ok });
    options.sort((a, b) => a.cost - b.cost);
    const o = options[0];
    if (!o || o.cost > g.money) return;
    if (!o.act()) return;
    buy(o.label, o.cost);
  }
}

function session(minutes: number) {
  if (g.offline) g.collectOffline();
  deliver();
  tendBar();
  shop();
  while (g.beers.length < g.rangeSlots && newBeer()) buy(`Nouvelle bière (${g.beers.length})`, 0);
  if (g.beers.length) {
    g.loadBeer(g.beers[0]!.id);
    g.autoBrew = true;
  }
  play(minutes * 60, () => {
    if (clock % 10 < DT) deliver();
    if (clock % 30 < DT) tendBar();
    if (clock % 60 < DT) shop();
  });
  deliver();
  shop();
}

const done = () => STATION_ORDER.every((id) => g.level(id) >= MAX_LEVEL) && g.storageLevel >= STORAGE.length && g.nextSlotCost == null && g.barLevel >= BAR.length && g.signed.length === CLIENTS.length && g.signed.every((id) => g.dealCost(id) == null);

// Première session : le tutoriel, un peu plus long (20 min).
session(20);
const sessionStarts: number[] = [];
const revenueByDay: number[] = [];
let completed: number | null = null;
for (let day = 0; day < DAYS && completed == null; day++) {
  revenueByDay[day] = g.totalRevenue;
  brandByDay[day] = g.brand;
  for (let i = 0; i < SESSIONS.length; i++) {
    const target = day * 86400 + SESSIONS[i]! * 3600;
    if (target <= clock) continue;
    const gap = target - clock;
    simulateOffline(g, gap);
    clock = target;
    sessionStarts.push(clock);
    session(ACTIVE_MIN);
    if (done()) {
      completed = clock;
      break;
    }
  }
}

// ------------------------------------------------------------------ rapport
const byDay = new Map<number, typeof log>();
for (const e of log) {
  const d = Math.floor(e.t / 86400) + 1;
  byDay.set(d, [...(byDay.get(d) ?? []), e]);
}
for (const [d, es] of byDay) {
  console.log(`--- Jour ${d} : ${es.length} achats`);
  for (const e of es) console.log(`  ${fmt(e.t)}  ${e.what.padEnd(26)} ${e.cost.toLocaleString('fr-FR')} €`);
}
// visites sans aucun achat d'affilée
let worst = 0;
let run = 0;
for (const s of sessionStarts) {
  const bought = log.some((e) => e.t >= s && e.t < s + ACTIVE_MIN * 60 + 1);
  run = bought ? 0 : run + 1;
  worst = Math.max(worst, run);
}
const noBuy = sessionStarts.filter((s) => !log.some((e) => e.t >= s && e.t < s + ACTIVE_MIN * 60 + 1)).length;
console.log('\n=== Chiffre d\'affaires par jour');
console.log(revenueByDay.map((r, i) => `J${i + 1} ${Math.round(((revenueByDay[i + 1] ?? g.totalRevenue) - r) / 1000)}k`).join(' · '));
console.log('\n=== Résumé');
console.log('Fini :', completed ? fmt(completed) : `non (après ${DAYS} jours)`);
console.log('Visites :', sessionStarts.length, '· sans achat :', noBuy, `(${Math.round((noBuy / sessionStarts.length) * 100)} %) · pire série sans achat :`, worst);
console.log('Marque par jour :', brandByDay.map((b, i) => `J${i + 1} ${Math.round(b * 100)}`).join(' · '));
console.log('Bar :', Math.round(g.barRevenue), '€ ·', g.barSold, 'btl · commandes :', g.ordersDone, 'livrées,', Math.round(delivered), '€');
console.log('Argent :', Math.round(g.money), '€ · vendues :', g.totalSold, '· niveaux :', STATION_ORDER.map((id) => g.level(id)).join(''), '· stockage', g.storageLevel, '· gamme', g.beers.length, '/', g.rangeSlots, '· contrats', g.signed.length);
for (const d of CLIENTS) {
  const e = log.find((x) => x.what === `Contrat ${d.name}`);
  console.log(`  ${d.name.padEnd(16)} ${e ? fmt(e.t) : '—'}`);
}
if (process.env.DEBUG) {
  console.log('autoBrew', g.autoBrew, 'queued', g.queued, 'room', g.roomForBatch, 'stored', g.stored, '/', g.storageCap, 'liters', g.batchLiters);
  console.log('batches', g.batches.map((b) => `${b.stage}:${b.beerId}:${b.waiting}:${b.bottles}:${b.delivered}`));
  console.log('beers', g.beers.map((b) => `${b.name} q${b.tasting.quality.toFixed(2)} stock ${b.stock}`));
  console.log('orders', g.orders.map((o) => `${o.client}:${o.qty}`));
}
