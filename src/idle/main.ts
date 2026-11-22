/**
 * Brew It Idle (prototype) : l'interface. Une liste de cartes (une par activité), l'argent en haut,
 * quatre onglets en bas : Activités, Maîtres brasseurs, Améliorations, Levure mère.
 * Sauvegarde à part (`brewit-idle-1`) : la partie de Brew It n'est jamais touchée.
 */
import '../ui/style.css';
import './idle.css';
import { createStorage } from '../platform/storage';
import { onAppLifecycle, tapFeedback } from '../platform/lifecycle';
import { sfx } from '../platform/audio';
import { stationCanvas } from '../render/sprites';
import { iconCanvas, type IconId } from '../render/icons';
import { drawGaston } from '../ui/gaston';
import type { StationId } from '../core/stations';
import {
  BIZ, buy, buyCount, buyUpgrade, costOf, cycleTime, dur, fmt, fromJSON, hire, milestonesOf, newState, nextMilestone, offline,
  payout, perSecond, prestige, start, tick, totalPerSecond, UPGRADES, YEAST_BONUS, yeastGain, type IdleState,
} from './model';

const SLOT = 'brewit-idle-1';
const SAVE_EVERY = 10;

type Tab = 'biz' | 'managers' | 'upgrades' | 'yeast';
type Mode = 1 | 10 | 100 | 'next' | 'max';

/** Le dessin de chaque activité : une machine de l'atelier (qui grandit aux paliers) ou une icône. */
const PIC: Record<string, { station: StationId; base: number } | IconId> = {
  garage: { station: 'mash', base: 1 }, market: 'keg', bistro: 'mug', micro: { station: 'fermenter', base: 2 }, pub: 'barman',
  festival: 'pennant', factory: { station: 'bottling', base: 3 }, chain: 'neon', export: 'truck', orbital: { station: 'boil', base: 5 },
};

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function fit(c: HTMLCanvasElement, box: number): HTMLCanvasElement {
  const s = Math.max(1, Math.floor(Math.min(box / c.width, box / c.height)));
  c.style.width = `${c.width * s}px`;
  c.style.height = `${c.height * s}px`;
  c.classList.add('idle-pix');
  return c;
}

function picFor(s: IdleState, i: number): HTMLCanvasElement {
  const p = PIC[BIZ[i]!.id]!;
  if (typeof p === 'string') return fit(iconCanvas(p, 1), 52);
  return fit(stationCanvas(p.station, Math.min(5, p.base + Math.min(4, milestonesOf(s.owned[i]!)))), 52);
}

interface Card {
  el: HTMLElement;
  pic: HTMLElement;
  picKey: string;
  count: HTMLElement;
  next: HTMLElement;
  bar: HTMLElement;
  barText: HTMLElement;
  time: HTMLElement;
  buyBtn: HTMLButtonElement;
  buyText: HTMLElement;
  buyCost: HTMLElement;
  hint: HTMLElement;
}

async function boot() {
  sfx.install();
  sfx.preload();
  const storage = createStorage();
  let s = newState();
  let pending = 0;
  try {
    const raw = await storage.read(SLOT);
    if (raw) {
      const data = JSON.parse(raw) as { savedAt: number; state: unknown };
      s = fromJSON(data.state);
      pending = offline(s, (Date.now() - data.savedAt) / 1000);
    }
  } catch (e) {
    console.error('sauvegarde idle illisible', e);
  }
  const save = () => void storage.write(SLOT, JSON.stringify({ savedAt: Date.now(), state: s }));

  const root = document.getElementById('app')!;
  root.className = 'idle-root';
  root.replaceChildren();

  // ---- en haut : l'argent, le gain par seconde, les levures mères
  const header = h('header', 'idle-header');
  const money = h('div', 'idle-money');
  const rate = h('div', 'idle-rate');
  const yeastChip = h('button', 'idle-yeast-chip');
  yeastChip.onclick = () => setTab('yeast');
  const moneyBox = h('div', 'idle-money-box');
  moneyBox.append(money, rate);
  header.append(moneyBox, yeastChip);

  // ---- la bourse de l'absence
  const purse = h('button', 'idle-purse hidden');
  purse.onclick = () => {
    s.money += pending;
    pending = 0;
    purse.classList.add('hidden');
    sfx.play('cash');
    tapFeedback(true);
    save();
  };

  // ---- Gaston
  const tipEl = h('div', 'idle-tip hidden');
  const av = h('canvas', 'mentor-avatar');
  drawGaston(av);
  const tipText = h('p', 'idle-tip-text');
  tipEl.append(av, tipText);

  // ---- le mode d'achat
  const modes: Mode[] = [1, 10, 100, 'next', 'max'];
  let mode: Mode = 1;
  const modeBar = h('div', 'idle-modes');
  const modeBtns = modes.map((m) => {
    const b = h('button', 'chip', m === 'next' ? 'Palier' : m === 'max' ? 'Max' : `×${m}`);
    b.onclick = () => {
      mode = m;
      modeBtns.forEach((x, k) => x.classList.toggle('active', modes[k] === m));
      sfx.play('pop');
    };
    return b;
  });
  modeBtns[0]!.classList.add('active');
  modeBar.append(h('span', 'idle-modes-label', 'Acheter'), ...modeBtns);

  const list = h('div', 'idle-list');
  const panel = h('div', 'idle-panel hidden');

  // ---- en bas : les onglets
  const nav = h('nav', 'idle-nav');
  const tabs: Record<Tab, { btn: HTMLButtonElement; badge: HTMLElement }> = {} as never;
  const tabDefs: [Tab, string, IconId][] = [['biz', 'Activités', 'brew'], ['managers', 'Brasseurs', 'staff'], ['upgrades', 'Améliorer', 'up'], ['yeast', 'Levure mère', 'yeast']];
  for (const [id, name, icon] of tabDefs) {
    const b = h('button', 'idle-tab');
    const badge = h('span', 'room-badge hot hidden');
    b.append(iconCanvas(icon, 2), h('span', '', name), badge);
    b.onclick = () => setTab(id);
    tabs[id] = { btn: b, badge };
    nav.append(b);
  }
  let tab: Tab = 'biz';
  let panelKey = '';
  function setTab(t: Tab) {
    tab = t;
    for (const [id, x] of Object.entries(tabs)) x.btn.classList.toggle('active', id === t);
    list.classList.toggle('hidden', t !== 'biz');
    modeBar.classList.toggle('hidden', t !== 'biz');
    panel.classList.toggle('hidden', t === 'biz');
    panelKey = '';
    sfx.play('pop');
  }

  root.append(header, purse, tipEl, modeBar, list, panel, nav);
  tabs.biz.btn.classList.add('active');

  // ---- les cartes des activités
  const cards: Card[] = [];
  let shown = -1;
  function buildCards() {
    // les activités ouvertes, plus la suivante (à ouvrir)
    const upto = Math.min(BIZ.length - 1, Math.max(0, s.owned.findIndex((n) => n === 0) === -1 ? BIZ.length - 1 : s.owned.findIndex((n) => n === 0)));
    if (upto === shown) return;
    shown = upto;
    list.replaceChildren();
    cards.length = 0;
    for (let i = 0; i <= upto; i++) {
      const b = BIZ[i]!;
      const el = h('div', 'idle-card');
      const pic = h('button', 'idle-pic');
      pic.setAttribute('aria-label', `Lancer : ${b.name}`);
      pic.onclick = () => {
        if (start(s, i)) {
          sfx.play('pop');
          tapFeedback(false);
        }
      };
      const count = h('span', 'idle-count');
      pic.append(count);
      const body = h('div', 'idle-body');
      const title = h('div', 'idle-title');
      const next = h('span', 'idle-next');
      title.append(h('span', 'idle-name', b.name), next);
      const barWrap = h('div', 'idle-bar');
      const bar = h('div', 'idle-bar-fill');
      const barText = h('span', 'idle-bar-text');
      barWrap.append(bar, barText);
      const row = h('div', 'idle-row');
      const buyBtn = h('button', 'btn primary idle-buy');
      const buyText = h('span', 'idle-buy-n');
      const buyCost = h('span', 'idle-buy-cost');
      buyBtn.append(buyText, buyCost);
      buyBtn.onclick = () => {
        const n = s.owned[i]! > 0 ? buyCount(s, i, mode) : 1;
        const before = milestonesOf(s.owned[i]!);
        if (!buy(s, i, n)) return;
        const after = milestonesOf(s.owned[i]!);
        sfx.play(after > before ? 'levelUp' : 'cash');
        tapFeedback(after > before);
        if (after > before) flash(el, 'Palier ! Cycle 2× plus rapide');
        if (s.owned[i] === n) shown = -1; // une nouvelle activité : la suivante apparaît
      };
      const time = h('span', 'idle-time');
      row.append(buyBtn, time);
      const hint = h('div', 'idle-hint');
      body.append(title, barWrap, row, hint);
      el.append(pic, body);
      list.append(el);
      cards.push({ el, pic, picKey: '', count, next, bar, barText, time, buyBtn, buyText, buyCost, hint });
    }
  }

  function flash(el: HTMLElement, text: string) {
    const f = h('div', 'idle-flash', text);
    el.append(f);
    setTimeout(() => f.remove(), 1400);
  }

  function updateCards() {
    buildCards();
    cards.forEach((c, i) => {
      const b = BIZ[i]!;
      const n = s.owned[i]!;
      const open = n > 0;
      c.el.classList.toggle('locked', !open);
      const key = `${open}|${milestonesOf(n)}`;
      if (key !== c.picKey) {
        c.picKey = key;
        c.pic.replaceChildren(picFor(s, i), c.count);
      }
      c.count.textContent = open ? String(n) : '';
      const nm = nextMilestone(n);
      c.next.textContent = open && nm ? `${n} / ${nm}` : '';
      const t = cycleTime(s, i);
      const p = s.progress[i]!;
      const frac = p < 0 ? 0 : Math.min(1, t < 0.25 && s.managers[i] ? 1 : p / t);
      c.bar.style.width = `${frac * 100}%`;
      c.barText.textContent = open ? (t < 1 && s.managers[i] ? `${fmt(perSecond(s, i))} €/s` : `${fmt(payout(s, i))} €`) : `Rapporte ${fmt(b.rev)} € par cycle`;
      c.time.textContent = open ? (p < 0 ? dur(t) : dur(Math.max(0, t - p))) : '';
      const k = open ? buyCount(s, i, mode) : 1;
      const cost = costOf(s, i, k);
      c.buyText.textContent = open ? `×${k}` : 'Ouvrir';
      c.buyCost.textContent = `${fmt(cost)} €`;
      c.buyBtn.disabled = s.money < cost;
      c.hint.textContent = !open ? '' : s.managers[i] ? `${b.managerName} brasse pour toi` : p < 0 ? 'Touche le dessin pour brasser' : '';
      c.el.classList.toggle('idle-ready', open && !s.managers[i] && p < 0);
    });
  }

  // ---- les onglets : maîtres brasseurs, améliorations, levure mère
  function renderPanel() {
    const key = JSON.stringify([tab, s.managers, s.upgrades, s.owned.map((n) => n > 0), tab === 'yeast' ? [yeastGain(s), s.yeast] : 0,
      tab === 'managers' ? BIZ.map((b) => s.money >= b.manager) : tab === 'upgrades' ? UPGRADES.map((u) => s.money >= u.cost) : 0]);
    if (key === panelKey) return;
    panelKey = key;
    panel.replaceChildren();
    if (tab === 'managers') {
      panel.append(h('p', 'idle-intro', 'Un maître brasseur fait tourner son activité sans toi, même appli fermée.'));
      BIZ.forEach((b, i) => {
        if (s.owned[i]! <= 0 && !s.managers[i]) return;
        const row = h('div', 'idle-line');
        row.append(fit(iconCanvas(i === 0 ? 'apprentice' : 'staff', 2), 40));
        const txt = h('div', 'idle-line-text');
        txt.append(h('strong', '', b.managerName), h('span', 'hint', b.name));
        row.append(txt);
        if (s.managers[i]) row.append(h('span', 'idle-done', '✓ En poste'));
        else {
          const go = h('button', 'btn primary small', `${fmt(b.manager)} €`);
          go.disabled = s.money < b.manager;
          go.onclick = () => {
            if (!hire(s, i)) return;
            sfx.play('upgrade');
            tapFeedback(true);
            save();
          };
          row.append(go);
        }
        panel.append(row);
      });
    }
    if (tab === 'upgrades') {
      panel.append(h('p', 'idle-intro', 'Recettes et matériel : chaque amélioration triple les gains.'));
      const open = UPGRADES.filter((u) => !s.upgrades.includes(u.id) && (u.biz === -1 || s.owned[u.biz]! > 0)).slice(0, 12);
      if (!open.length) panel.append(h('p', 'hint', 'Ouvre de nouvelles activités pour débloquer d\'autres améliorations.'));
      for (const u of open) {
        const row = h('div', 'idle-line');
        row.append(fit(iconCanvas(u.biz === -1 ? 'trophy' : 'flask', 2), 40));
        const txt = h('div', 'idle-line-text');
        txt.append(h('strong', '', u.name), h('span', 'hint', `${u.biz === -1 ? 'Toutes les activités' : BIZ[u.biz]!.name} : gains ×${u.mult}`));
        row.append(txt);
        const go = h('button', 'btn primary small', `${fmt(u.cost)} €`);
        go.disabled = s.money < u.cost;
        go.onclick = () => {
          if (!buyUpgrade(s, u.id)) return;
          sfx.play('upgrade');
          tapFeedback(true);
          save();
        };
        row.append(go);
        panel.append(row);
      }
    }
    if (tab === 'yeast') {
      const gain = yeastGain(s);
      const box = h('div', 'idle-yeast');
      box.append(fit(iconCanvas('yeast', 4), 64));
      box.append(h('div', 'idle-yeast-big', `${s.yeast} levure${s.yeast > 1 ? 's' : ''} mère${s.yeast > 1 ? 's' : ''}`));
      box.append(h('p', 'hint', `Chacune donne +${Math.round(YEAST_BONUS * 100)} % de gains, pour toujours. Bonus actuel : +${Math.round(s.yeast * YEAST_BONUS * 100)} %.`));
      box.append(h('p', '', gain > 0
        ? `Repartir de zéro maintenant te donnerait ${gain} levure${gain > 1 ? 's' : ''} mère${gain > 1 ? 's' : ''} de plus (+${Math.round(gain * YEAST_BONUS * 100)} %).`
        : 'Continue à brasser : plus tu gagnes, plus tu récolteras de levures mères en repartant de zéro.'));
      const go = h('button', 'btn primary big', gain > 0 ? `Repartir de zéro · +${gain} levure${gain > 1 ? 's' : ''}` : 'Pas encore de levure mère');
      go.disabled = gain <= 0;
      go.onclick = () => {
        if (!go.dataset.confirm) {
          go.dataset.confirm = '1';
          go.textContent = 'Sûr ? Tu perds activités, brasseurs et améliorations. Toucher pour confirmer';
          return;
        }
        const got = prestige(s);
        if (!got) return;
        sfx.play('levelUp');
        tapFeedback(true);
        shown = -1;
        save();
        setTab('biz');
      };
      box.append(go);
      if (s.resets) box.append(h('p', 'hint', `Départs à zéro : ${s.resets}`));
      panel.append(box);
    }
  }

  // ---- Gaston, au bon moment
  const tips: { done: () => boolean; show: () => boolean; text: string }[] = [
    { done: () => s.earned >= 4, show: () => true, text: 'Salut, moi c\'est Gaston ! Touche la cuve pour brasser ta première bière.' },
    { done: () => s.owned[0]! >= 2, show: () => true, text: 'Achète une 2e cuve : chaque cuve rapporte autant que la première.' },
    { done: () => s.owned[1]! > 0, show: () => s.money >= 40, text: 'Bientôt de quoi ouvrir les Fûts au marché : plus lent, mais bien plus rentable !' },
    { done: () => s.managers[0]!, show: () => s.money >= 700, text: 'Embauche-moi (onglet Brasseurs) : je brasse à ta place, même appli fermée !' },
    { done: () => s.owned.some((n) => n >= 25), show: () => s.managers[0]!, text: 'À 25 exemplaires, une activité passe un palier : son cycle va 2× plus vite.' },
    { done: () => s.resets > 0, show: () => yeastGain(s) >= 3, text: 'Des levures mères t\'attendent ! Repartir de zéro te rendra plus fort (onglet Levure mère).' },
  ];
  function updateTip() {
    while (s.tip < tips.length && tips[s.tip]!.done()) s.tip++;
    const t = tips[s.tip];
    const on = !!t && t.show();
    tipEl.classList.toggle('hidden', !on);
    if (on && tipText.textContent !== t.text) tipText.textContent = t.text;
  }

  function update() {
    money.textContent = `${fmt(s.money)} €`;
    const ps = totalPerSecond(s);
    rate.textContent = ps > 0 ? `${fmt(ps)} € / s` : 'Touche une activité pour brasser';
    yeastChip.replaceChildren(fit(iconCanvas('yeast', 1), 20), h('span', '', `${s.yeast}${yeastGain(s) > 0 ? ` (+${yeastGain(s)})` : ''}`));
    if (pending > 0) {
      purse.classList.remove('hidden');
      purse.textContent = `💰 Pendant ton absence : +${fmt(pending)} € · Récolter`;
    }
    tabs.managers.badge.classList.toggle('hidden', !BIZ.some((b, i) => !s.managers[i] && s.owned[i]! > 0 && s.money >= b.manager));
    tabs.managers.badge.textContent = '!';
    tabs.upgrades.badge.classList.toggle('hidden', !UPGRADES.some((u) => !s.upgrades.includes(u.id) && (u.biz === -1 || s.owned[u.biz]! > 0) && s.money >= u.cost));
    tabs.upgrades.badge.textContent = '!';
    tabs.yeast.badge.classList.toggle('hidden', yeastGain(s) < 1);
    tabs.yeast.badge.textContent = `+${yeastGain(s)}`;
    if (tab === 'biz') updateCards();
    else renderPanel();
    updateTip();
  }

  // ---- la boucle
  let last = performance.now();
  let saveT = 0;
  let uiT = 0;
  const frame = (now: number) => {
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    tick(s, dt);
    if ((uiT += dt) >= 0.1) {
      uiT = 0;
      update();
    }
    if ((saveT += dt) >= SAVE_EVERY) {
      saveT = 0;
      save();
    }
    requestAnimationFrame(frame);
  };
  update();
  requestAnimationFrame(frame);

  let pausedAt = 0;
  onAppLifecycle(
    () => {
      pausedAt = Date.now();
      save();
    },
    () => {
      if (!pausedAt) return;
      pending += offline(s, (Date.now() - pausedAt) / 1000);
      pausedAt = 0;
      last = performance.now();
      update();
    },
  );
  (window as unknown as { idle: unknown }).idle = { get state() { return s; } };
}

void boot();
