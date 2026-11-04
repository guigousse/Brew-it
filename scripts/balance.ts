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
import { BAR } from '../src/core/market';
import { COMPUTERS } from '../src/core/orders';
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
    const r = g.fulfill(o.id, g.autoPick(o));
    if (r.ok) delivered += r.amount!;
  }
}

/** Grossiste : on vend ce qui dépasse la moitié du stockage (on garde de quoi honorer les commandes). */
function wholesale() {
  const keep = g.storageCap * 0.5;
  for (const b of [...g.beers].sort((a, c) => c.stock - a.stock)) {
    const over = g.stored - keep;
    if (over <= 0) break;
    const r = g.sellWholesale(b.id, Math.min(b.stock, over));
    if (r.ok) wholesaled += r.amount!;
  }
}
let wholesaled = 0;
let delivered = 0;

/** Le bar : change les fûts vides (la bière la plus populaire d'abord) et programme des brassins en fûts. */
function tendBar() {
  g.taps.forEach((t, i) => {
    if (t.glasses > 0) return;
    const b = g.beers.filter((x) => x.kegs.length).sort((a, c) => c.pop - a.pop)[0];
    if (b) g.swapKeg(i, b.id);
  });
  if (!g.beers.length) return;
  const kegs = g.beers.reduce((s, b) => s + b.kegs.length + g.pendingKegs(b.id), 0) + g.plan.filter((p) => p.format === 'keg').reduce((n, p) => n + p.count, 0);
  if (kegs < g.taps.length * 4 && g.planned < 2) g.planBrew(g.beers[g.batchesDone % g.beers.length]!.id, 'keg');
  // une fête quand on a prévu assez de fûts
  const full = g.beers.reduce((s, b) => s + b.kegs.length, 0);
  if (full >= g.taps.length * 3 && g.money >= g.partyCost * 2 && g.startParty().ok) buy('Fête', g.partyCost);
}
const brandByDay: number[] = [];

/** Le joueur garde toujours un brassin en file : la bière la moins en stock, en bouteilles. */
let autoPlan = false;
function play(seconds: number, during?: () => void) {
  for (let s = 0; s < seconds; s += DT) {
    if (autoPlan && g.planned === 0 && g.roomForBatch) {
      const b = g.lowestStockBeer();
      if (b) g.planBrew(b.id, 'bottle');
    }
    g.step(DT);
    clock += DT;
    during?.();
  }
}

/** Crée une bière : réglages, essai, attente de la première bouteille, on garde. */
function newBeer(): boolean {
  const recipe = BOT_RECIPES[g.beers.length % BOT_RECIPES.length]!;
  autoPlan = false;
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
    for (const id of STATION_ORDER) {
      const lv = g.level(id);
      if (lv >= MAX_LEVEL) continue;
      options.push({ cost: g.upgradeCost(id), label: `${id} → ${lv + 1}`, act: () => g.upgrade(id).ok });
    }
    for (const id of ['fermenter', 'conditioning'] as const) {
      const c = g.tankCost(id);
      if (c != null) options.push({ cost: c, label: `Cuve ${id} ${g.tankCount(id) + 1}`, act: () => g.addTank(id).ok });
    }
    const pc = COMPUTERS[g.computerLevel];
    if (pc) options.push({ cost: pc.cost, label: `Ordinateur → ${g.computerLevel + 1}`, act: () => g.upgradeComputer().ok });
    const bar = BAR[g.barLevel];
    if (bar) options.push({ cost: bar.cost, label: `Bar → ${g.barLevel + 1}`, act: () => g.upgradeBar().ok });
    const next = STORAGE[g.storageLevel];
    if (next) options.push({ cost: next.cost, label: `Stockage → ${g.storageLevel + 1}`, act: () => g.upgradeStorage().ok });
    const slot = g.nextSlotCost;
    if (slot != null) options.push({ cost: slot, label: `Place gamme ${g.rangeSlots + 1}`, act: () => g.buySlot().ok });
    options.sort((a, b) => a.cost - b.cost);
    const o = options[0];
    if (!o || o.cost > g.money) {
      // de l'argent en trop par rapport au prochain achat : une campagne de pub
      if (!g.advertising && g.beers.length && g.money >= g.adCost * 4 && g.advertise().ok) buy('Campagne de pub', g.adCost);
      return;
    }
    if (!o.act()) return;
    buy(o.label, o.cost);
  }
}

function session(minutes: number) {
  if (g.offline) g.collectOffline();
  deliver();
  wholesale();
  tendBar();
  shop();
  while (g.beers.length < g.rangeSlots && newBeer()) buy(`Nouvelle bière (${g.beers.length})`, 0);
  if (g.beers.length) {
    g.loadBeer(g.beers[0]!.id);
    autoPlan = true;
  }
  play(minutes * 60, () => {
    if (clock % 10 < DT) deliver();
    if (clock % 30 < DT) tendBar();
    if (clock % 60 < DT) shop();
  });
  deliver();
  wholesale();
  shop();
  // avant de partir, on remplit la file de brassins (en bouteilles, la gamme à tour de rôle)
  for (let i = 0; g.beers.length && g.planRoom > 0 && i < 500; i++) g.planBrew(g.beers[i % g.beers.length]!.id, 'bottle');
}

const done = () => STATION_ORDER.every((id) => g.level(id) >= MAX_LEVEL) && g.storageLevel >= STORAGE.length && g.nextSlotCost == null && g.barLevel >= BAR.length && g.computerLevel >= COMPUTERS.length && g.tankCost('fermenter') == null && g.tankCost('conditioning') == null;

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
console.log('Bar :', Math.round(g.barRevenue), '€ · commandes :', g.ordersDone, 'livrées,', Math.round(delivered), '€ · grossiste :', g.wholesaleSold, 'btl');
console.log('Argent :', Math.round(g.money), '€ · vendues :', g.totalSold, '· niveaux :', STATION_ORDER.map((id) => g.level(id)).join(''), '· stockage', g.storageLevel, '· gamme', g.beers.length, '/', g.rangeSlots);
if (process.env.DEBUG) {
  console.log('autoPlan', autoPlan, 'queued', g.queued, 'room', g.roomForBatch, 'stored', g.stored, '/', g.storageCap, 'liters', g.batchLiters);
  console.log('batches', g.batches.map((b) => `${b.stage}:${b.beerId}:${b.waiting}:${b.bottles}:${b.delivered}`));
  console.log('beers', g.beers.map((b) => `${b.name} q${b.tasting.quality.toFixed(2)} stock ${b.stock}`));
  console.log('orders', g.orders.map((o) => `${o.client}:${o.qty}`));
}
