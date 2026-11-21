/**
 * Notifications locales : ce qui mérite de faire revenir le joueur pendant son absence.
 *
 * Au passage en arrière-plan, on rejoue l'absence sur une copie de la partie (la même simulation que celle qui
 * tournera au retour, jusqu'au plafond des 8 h) et on relève les moments clés : essai prêt à goûter, lettre d'un
 * concours, commande urgente… Puis `schedule` trie : catégories coupées, heures calmes, écart minimal, plafond.
 * Tout est pur et testable ; l'envoi au système est dans `src/platform/notifications.ts`.
 */
import { contestName, type ContestTier } from './contests';
import { BAR_EVENTS, barEventById } from './market';
import { partnerById } from './partners';
import { Game, MAX_OFFLINE_SECONDS, TUTO_DONE } from './game';
import { tl } from '../i18n';
import { compact } from '../ui/format';

export type NotifCategory = 'brewery' | 'orders' | 'contests' | 'reminders';
export const NOTIF_CATEGORIES: readonly NotifCategory[] = ['brewery', 'orders', 'contests', 'reminders'];

export type NotifKind =
  | 'cap' | 'taste' | 'eventReady'
  | 'courier' | 'boardFull' | 'urgentOrder' | 'prestigeOrder' | 'partnerDone'
  | 'contestOpen' | 'contestClosing'
  | 'remind1' | 'remind3';

export interface PlannedNotif {
  kind: NotifKind;
  category: NotifCategory;
  /** Heure d'envoi (ms, horloge réelle). */
  at: number;
  title: string;
  body: string;
  /** La plus forte l'emporte quand deux notifications tombent trop près l'une de l'autre. */
  priority: number;
  /** Au-delà, la notification n'a plus de sens (ms) : décalée après les heures calmes, elle est abandonnée. */
  deadline?: number;
}

export const NOTIF = {
  /** Plafond de la simulation hors ligne : au-delà, la brasserie s'arrête. */
  horizon: MAX_OFFLINE_SECONDS,
  /** Pas de la simulation (s) : plus large qu'en jeu, pour rester rapide au passage en arrière-plan. */
  step: 2,
  /** Écart minimal entre deux notifications (ms). */
  gap: 2 * 3600_000,
  /** Notifications au plus par absence (hors rappels). */
  max: 4,
  /** Heures calmes, heure locale : rien de 22 h à 8 h, la notification attend le matin. */
  quietFrom: 22,
  quietTo: 8,
  /** Le livreur prévient 30 min avant la fin de sa tournée. */
  courierLead: 30 * 60,
  /** Un concours sans bière inscrite prévient 1 h avant sa clôture. */
  contestLead: 3600,
  /** Rappels si le jeu n'est pas rouvert : 1 jour, puis 3 jours. */
  reminders: [24 * 3600_000, 72 * 3600_000],
} as const;

const CATEGORY: Record<NotifKind, NotifCategory> = {
  cap: 'brewery', taste: 'brewery', eventReady: 'brewery',
  courier: 'orders', boardFull: 'orders', urgentOrder: 'orders', prestigeOrder: 'orders', partnerDone: 'orders',
  contestOpen: 'contests', contestClosing: 'contests',
  remind1: 'reminders', remind3: 'reminders',
};
const PRIORITY: Record<NotifKind, number> = {
  cap: 100, courier: 90, contestClosing: 85, taste: 80, contestOpen: 75, prestigeOrder: 70, urgentOrder: 70,
  boardFull: 60, partnerDone: 55, eventReady: 50, remind1: 10, remind3: 10,
};
/** Identifiant fixe de chaque sorte de notification (pour les annuler au retour). */
export const NOTIF_IDS: Record<NotifKind, number> = {
  cap: 1, taste: 2, eventReady: 3, courier: 4, boardFull: 5, urgentOrder: 6, prestigeOrder: 7, partnerDone: 8,
  contestOpen: 9, contestClosing: 10, remind1: 11, remind3: 12,
};

const TITLE = 'Brew It';

/**
 * Les notifications que l'absence va déclencher, en rejouant la partie sur une copie.
 * `now` : l'heure réelle du départ (ms). Rien avant la fin de la visite guidée.
 */
export function forecast(game: Game, now: number): PlannedNotif[] {
  if (game.tips < TUTO_DONE) return [];
  const out: PlannedNotif[] = [];
  const t0 = game.time;
  const wall = (t: number) => now + (t - t0) * 1000;
  const add = (kind: NotifKind, t: number, body: string, deadline?: number) =>
    out.push({ kind, category: CATEGORY[kind], at: wall(t), title: TITLE, body, priority: PRIORITY[kind], deadline: deadline == null ? undefined : wall(deadline) });
  const once = (kind: NotifKind) => !out.some((n) => n.kind === kind);

  const sim = Game.fromJSON(JSON.parse(JSON.stringify(game)));
  const end = t0 + NOTIF.horizon;
  const money = sim.money;

  // Le livreur : sa tournée ne se prolonge pas pendant l'absence.
  if (sim.staffOn('courier')) {
    const until = sim.staffUntil.courier;
    const at = until - NOTIF.courierLead;
    if (until <= end && at > t0 + 60) add('courier', at, tl('Ton livreur termine sa tournée dans 30 min.'), until);
  }

  // Ce que la simulation annonce, au fil de l'absence.
  const seen = new Set<string>();
  const off = sim.events.on((e) => {
    if (e.type === 'contestOpen') {
      add('contestOpen', sim.time, tl('Nouveau concours : {0}. Les inscriptions sont ouvertes 12 h.', contestName({ tier: e.tier as ContestTier, cat: e.cat })));
    }
    if (e.type === 'order') {
      const o = sim.orders[sim.orders.length - 1];
      if (o?.kind === 'urgent' && once('urgentOrder')) add('urgentOrder', sim.time, tl('Commande urgente de {0} : tu as 2 h pour la livrer.', o.client), o.expires);
      if (o?.kind === 'prestige' && once('prestigeOrder')) add('prestigeOrder', sim.time, tl('{0} demande ta meilleure bière : une commande de prestige t\'attend.', o.client), o.expires);
    }
    if (e.type === 'partnerEnd' && e.gems > 0 && once('partnerDone')) {
      add('partnerDone', sim.time, tl('{0} : contrat rempli ! {1} 💎 t\'attendent.', partnerById(e.id)?.name, e.gems));
    }
  });

  const tasteAtStart = !!sim.tastable;
  let boardFull = sim.orders.length >= sim.boardSlots;
  const restAt = BAR_EVENTS.filter((ev) => (!ev.needs || sim.owns(ev.needs)) && sim.eventReadyTime(ev.id) > t0 && sim.eventReadyTime(ev.id) <= end);
  for (let t = t0; t < end; t += NOTIF.step) {
    sim.step(NOTIF.step);
    if (!tasteAtStart && once('taste') && sim.tastable) add('taste', sim.time, tl('Ton nouvel essai est en bouteille : viens le goûter !'));
    const full = sim.orders.length >= sim.boardSlots;
    if (full && !boardFull && once('boardFull')) add('boardFull', sim.time, tl('Ton tableau des commandes est plein : les clients attendent leur bière.'));
    boardFull = full;
    for (const c of sim.contests) if (c && !c.entry) seen.add(`${c.tier}|${c.closes}|${c.cat}`);
    for (let i = restAt.length - 1; i >= 0; i--) {
      const ev = restAt[i]!;
      if (sim.time < sim.eventReadyTime(ev.id)) continue;
      restAt.splice(i, 1);
      const kegs = sim.beers.some((b) => b.kegs.length > 0);
      if (kegs && !sim.partying && once('eventReady')) add('eventReady', sim.time, tl('{0} : le quartier est prêt, et tes fûts aussi.', barEventById(ev.id)?.name));
    }
  }
  off();

  // Un concours ouvert sans bière inscrite : on prévient 1 h avant la clôture.
  for (const key of seen) {
    const [tier, closes, cat] = key.split('|');
    const at = Number(closes) - NOTIF.contestLead;
    if (at > t0 + 60 && Number(closes) <= end && once('contestClosing')) {
      add('contestClosing', at, tl('{0} ferme dans 1 h, et aucune bière n\'est inscrite.', contestName({ tier: Number(tier) as ContestTier, cat: cat! })), Number(closes));
    }
  }

  // Le plafond : la brasserie s'arrête au bout de 8 h, la bourse attend.
  const earned = sim.money - money;
  add('cap', end, earned > 0 ? tl('La brasserie s\'est arrêtée : viens récolter tes {0} €.', compact(earned)) : tl('La brasserie s\'est arrêtée : viens la relancer.'));

  // Les rappels, si le jeu n'est pas rouvert.
  const star = [...game.beers].sort((a, b) => b.pop - a.pop)[0];
  const [d1, d3] = NOTIF.reminders;
  out.push({ kind: 'remind1', category: 'reminders', at: now + d1, title: TITLE, body: star ? tl('Gaston : tes clients réclament ta « {0} » !', star.name) : tl('Gaston : la brasserie t\'attend !'), priority: PRIORITY.remind1 });
  out.push({ kind: 'remind3', category: 'reminders', at: now + d3, title: TITLE, body: tl('Gaston : les cuves s\'ennuient sans toi. On brasse ?'), priority: PRIORITY.remind3 });
  return out;
}

/** Hors des heures calmes : une notification de la nuit attend 8 h du matin. */
export function outOfQuietHours(at: number): number {
  const d = new Date(at);
  const hr = d.getHours();
  if (hr >= NOTIF.quietTo && hr < NOTIF.quietFrom) return at;
  const m = new Date(d);
  if (hr >= NOTIF.quietFrom) m.setDate(m.getDate() + 1);
  m.setHours(NOTIF.quietTo, 0, 0, 0);
  return m.getTime();
}

/**
 * Le choix final : catégories coupées, heures calmes, au moins 2 h entre deux notifications (la plus importante
 * l'emporte), 4 au plus pendant l'absence, plus les rappels.
 */
export function schedule(list: PlannedNotif[], enabled: Record<NotifCategory, boolean>, now: number): PlannedNotif[] {
  const ok = list
    .filter((n) => enabled[n.category])
    .map((n) => ({ ...n, at: outOfQuietHours(n.at) }))
    .filter((n) => n.at > now + 60_000 && (n.deadline == null || n.at < n.deadline))
    .sort((a, b) => b.priority - a.priority || a.at - b.at);
  const kept: PlannedNotif[] = [];
  let count = 0;
  for (const n of ok) {
    const reminder = n.category === 'reminders';
    if (!reminder && count >= NOTIF.max) continue;
    if (kept.some((k) => Math.abs(k.at - n.at) < NOTIF.gap)) continue;
    kept.push(n);
    if (!reminder) count++;
  }
  return kept.sort((a, b) => a.at - b.at);
}

/** Le tout : ce qu'il faut programmer au moment où le joueur quitte le jeu. */
export function planNotifications(game: Game, now: number, enabled: Record<NotifCategory, boolean>): PlannedNotif[] {
  return schedule(forecast(game, now), enabled, now);
}
