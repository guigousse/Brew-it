import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { MAX_PLAN, MAX_TANKS, TANK_STAGES, type Beer, type Game, type Order } from '../core/game';
import { AD, BAR, kegGlasses, kegLiters, PARTY } from '../core/market';
import { CLIENT_TYPES, COMPUTERS, KIND_LABEL, orderAsk, wholesalePrice } from '../core/orders';
import { stars, trendById, trendsOf } from '../core/trends';
import { BREWERY_NAMES, MAX_LEVEL, STATION_ORDER, STATIONS, upgradeCost, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
import { drawLabel } from '../render/labelArt';
import { BOTTLE_SCALE, drawShelfBottle, LABEL_SPOT, type ShelfBottleKind } from '../render/bottleArt';
import { BarRoom, StorageRoom } from '../render/rooms';
import { CRATE, MAX_RANGE, STORAGE } from '../core/warehouse';
import { DEFAULT_LABEL, EMBLEMS, FONTS, LABEL_COLORS, PATTERNS, SHAPES, type Label } from '../core/label';
import { drawGaston } from './gaston';
import { createKnob } from './knob';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${Math.floor(v).toLocaleString('fr-FR')} €`;
const moneyShort = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€` : v >= 1e4 ? `${Math.round(v / 1000)} k€` : moneyInt(v));
const fmtRate = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 });
const VERDICT_CLASS: Record<string, string> = { Imbuvable: 'v-bad', Médiocre: 'v-meh', Correcte: 'v-ok', Bonne: 'v-good', Excellente: 'v-top' };

function img(canvas: HTMLCanvasElement, cls = 'pix'): HTMLImageElement {
  const i = h('img', cls);
  i.src = canvas.toDataURL();
  i.style.setProperty('--w', String(canvas.width));
  i.style.setProperty('--h', String(canvas.height));
  i.alt = '';
  return i;
}

/** Les trois pièces, dans l'ordre du trajet de la bière : on glisse de l'une à l'autre. */
export type RoomId = 'workshop' | 'storage' | 'bar';
const ROOMS: readonly { id: RoomId; name: string }[] = [
  { id: 'workshop', name: 'Atelier' },
  { id: 'storage', name: 'Stockage' },
  { id: 'bar', name: 'Bar' },
];

type PcTab = 'orders' | 'trends' | 'wholesale';
type SheetState = { kind: 'station'; id: StationId } | { kind: 'brew' | 'range' | 'storage' | 'bar' | 'barUp' };

const starText = (p: number) => {
  const n = stars(p);
  return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n));
};

const duration = (s: number) => {
  const m = Math.max(0, Math.floor(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

export interface AppCallbacks {
  getSpeed(): number;
  setSpeed(s: number): void;
  newGame(): void;
}

/** Interface du jeu : header, brasserie, barre du bas, panneaux et fenêtres. */
export class App {
  readonly scene = new Scene();
  private header = h('header', 'topbar');
  private moneyEl = h('span', 'money-value');
  private stage = h('main', 'stage');
  private sceneWrap = h('div', 'scene-wrap');
  private overlays = new Map<StationId, { btn: HTMLButtonElement; label: HTMLElement; bar: HTMLElement; text: HTMLElement }>();
  private tasteBtn = h('button', 'taste-btn hidden', '🍺 Goûter');
  /** Plaque du niveau de la brasserie, en haut à gauche de la scène. */
  private plaque = h('button', 'map-btn plaque');
  private announcedTaste = -1;
  private bottom = h('nav', 'bottombar');
  private brewBtn = h('button', 'brew-btn');
  private rangeBtn = h('button', 'side-btn');
  private stockBtn = h('button', 'side-btn');
  private ordersBtn = h('button', 'brew-btn');
  private menuBtn = h('button', 'brew-btn');
  private barUpBtn = h('button', 'side-btn');
  private partyBtn = h('button', 'side-btn');
  // --- les pièces
  readonly storageRoom = new StorageRoom();
  readonly barRoom = new BarRoom();
  private room: RoomId = 'workshop';
  private nav = h('div', 'rooms-nav');
  private navTabs = new Map<RoomId, { btn: HTMLButtonElement; badge: HTMLElement }>();
  private track = h('div', 'rooms-track');
  private wraps: HTMLElement[] = [];
  private storageWrap = h('div', 'scene-wrap');
  private barWrap = h('div', 'scene-wrap');
  private roomHits: { el: HTMLButtonElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
  private storagePlaque = h('button', 'map-btn plaque');
  private barPlaque = h('button', 'map-btn plaque');
  private ordersBadge = h('div', 'orders-badge hidden');
  /** Glissement en cours : départ du doigt, décalage, et s'il faut avaler le « clic » qui suit. */
  private swipe: { id: number; x: number; y: number; dx: number; on: boolean; t: number } | null = null;
  private swallowClick = false;
  private roomsDrawUntil = 0;
  /** Fenêtre de l'ordinateur ouverte, onglet affiché, bières choisies pour chaque commande. */
  private computer: { tab: PcTab; key: string } | null = null;
  /** Zones tactiles des fûts de la cave (leur nombre suit celui des tireuses). */
  private kegHits: HTMLButtonElement[] = [];
  /** Commandes dont on modifie le choix des bières. */
  private editing = new Set<number>();
  private picks = new Map<number, number[]>();
  /** Bière choisie sur l'étagère (fiche affichée sous l'étagère). */
  private shelfSel: number | null = null;
  private sheet = h('section', 'sheet hidden');
  private modal = h('div', 'modal hidden');
  private mentor = h('div', 'mentor hidden');
  private toasts = h('div', 'toasts');
  private openSheet: SheetState | null = null;
  private sheetKey = '';
  private mentorKey = '';
  private scale = 2;
  /** Appelé quand une première bouteille d'essai est prête (haptique). */
  onTasteReady?: () => void;
  /** Appelé quand une commande part (haptique). */
  onSent?: () => void;

  constructor(private root: HTMLElement, private game: () => Game, private cb: AppCallbacks) {
    // header
    const logo = h('div', 'logo');
    logo.append(img(stationCanvas('boil', 1), 'pix logo-icon'), h('span', 'logo-text', 'Brew It'));
    const pill = h('div', 'money');
    pill.append(h('span', 'coin'), this.moneyEl);
    const opts = h('button', 'icon-btn', '⚙');
    opts.setAttribute('aria-label', 'Options');
    opts.onclick = () => this.openOptions();
    this.header.append(logo, pill, opts, this.nav);
    for (const r of ROOMS) {
      const btn = h('button', 'room-tab');
      const badge = h('span', 'room-badge hidden');
      btn.append(h('span', '', r.name), badge);
      btn.onclick = () => this.goRoom(r.id);
      this.nav.append(btn);
      this.navTabs.set(r.id, { btn, badge });
    }

    // scène + étiquettes cliquables
    this.sceneWrap.append(this.scene.canvas);
    for (const id of STATION_ORDER) {
      const btn = h('button', 'station-hit');
      btn.setAttribute('aria-label', STATIONS[id].step);
      btn.onclick = () => this.open({ kind: 'station', id });
      const label = h('div', 'station-label');
      const text = h('span', 'label-text');
      const bar = h('div', 'label-bar');
      bar.append(h('div', 'label-fill'));
      label.append(text, bar);
      this.sceneWrap.append(btn, label);
      this.overlays.set(id, { btn, label, bar, text });
    }
    this.tasteBtn.onclick = () => this.openTasting();
    this.plaque.onclick = () => this.openBrewery();
    this.sceneWrap.append(this.plaque, this.tasteBtn);

    // stockage : rayonnages et ordinateur
    this.storageWrap.append(this.storageRoom.canvas);
    for (const hit of this.storageRoom.hits()) {
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', hit.id === 'computer' ? 'Ordinateur des commandes' : 'Rayonnages');
      el.onclick = () => (hit.id === 'computer' ? this.openComputer() : this.open({ kind: 'storage' }));
      this.storageWrap.append(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    this.storagePlaque.onclick = () => this.open({ kind: 'storage' });
    this.storageWrap.append(this.storagePlaque, this.ordersBadge);
    // bar : le comptoir
    this.barWrap.append(this.barRoom.canvas);
    const counter = this.barRoom.hits(1)[0]!;
    const counterEl = h('button', 'station-hit');
    counterEl.setAttribute('aria-label', 'Comptoir');
    counterEl.onclick = () => this.open({ kind: 'bar' });
    this.barWrap.append(counterEl);
    this.roomHits.push({ el: counterEl, rect: counter.rect });
    this.barPlaque.onclick = () => this.open({ kind: 'barUp' });
    this.barWrap.append(this.barPlaque);
    for (const w of [this.sceneWrap, this.storageWrap, this.barWrap]) {
      const pane = h('div', 'room');
      pane.append(w);
      this.track.append(pane);
      this.wraps.push(w);
    }
    this.stage.append(this.track);
    this.bindSwipe();

    // barre du bas : ses boutons changent selon la pièce
    this.rangeBtn.onclick = () => this.open({ kind: 'range' });
    this.brewBtn.onclick = () => this.open({ kind: 'brew' });
    this.stockBtn.onclick = () => this.open({ kind: 'storage' });
    this.ordersBtn.onclick = () => this.openComputer();
    this.menuBtn.onclick = () => this.open({ kind: 'bar' });
    this.barUpBtn.onclick = () => this.open({ kind: 'barUp' });
    this.partyBtn.onclick = () => this.openParty();
    this.setBottom();

    // Gaston
    const av = h('canvas', 'mentor-avatar');
    drawGaston(av);
    this.mentor.append(av, h('div', 'mentor-body'));

    root.append(this.header, this.stage, this.mentor, this.sheet, this.bottom, this.modal, this.toasts);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // ------------------------------------------------------------------ mise en page

  /** La brasserie remplit l'espace entre le header et la barre du bas, agrandie au pixel près. */
  layout(): void {
    const top = this.header.getBoundingClientRect().bottom;
    const bottom = this.bottom.getBoundingClientRect().top;
    const availW = window.innerWidth - 8;
    const availH = Math.max(100, bottom - top - 8);
    this.scale = Math.min(availW / SCENE_W, availH / SCENE_H);
    const w = Math.floor(SCENE_W * this.scale);
    const hh = Math.floor(SCENE_H * this.scale);
    for (const wrap of this.wraps) Object.assign(wrap.style, { width: `${w}px`, height: `${hh}px` });
    for (const c of [this.scene.canvas, this.storageRoom.canvas, this.barRoom.canvas]) Object.assign(c.style, { width: `${w}px`, height: `${hh}px` });
    const s = this.scale;
    for (const { el, rect } of this.roomHits) Object.assign(el.style, { left: `${rect.x * s}px`, top: `${rect.y * s}px`, width: `${rect.w * s}px`, height: `${rect.h * s}px` });
    this.syncKegHits(true);
    const bp = this.storageRoom.badgePoint;
    Object.assign(this.ordersBadge.style, { left: `${bp.x * s}px`, top: `${bp.y * s}px` });
    this.placeTrack();
    this.stage.style.top = `${top}px`;
    this.stage.style.bottom = `${window.innerHeight - bottom}px`;
    this.root.style.setProperty('--bottom-h', `${window.innerHeight - bottom}px`);
    this.root.style.setProperty('--top-h', `${top}px`);
    this.laidOut = `${top}|${bottom}|${window.innerWidth}`;
  }
  private laidOut = '';

  // ------------------------------------------------------------------ boucle d'affichage

  frame(t: number): void {
    const g = this.game();
    // On ne dessine que la pièce affichée (et ses voisines pendant un glissement).
    const all = !!this.swipe?.on || performance.now() < this.roomsDrawUntil;
    if (all || this.room === 'storage') this.storageRoom.draw(g, t);
    if (all || this.room === 'bar') this.barRoom.draw(g, t);
    if (!all && this.room !== 'workshop') return;
    this.scene.draw(g, t);
    // étiquettes des appareils
    for (const id of STATION_ORDER) {
      const o = this.overlays.get(id)!;
      const r = this.scene.rect(id, g.level(id));
      const s = this.scale;
      Object.assign(o.btn.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      const batch = g.batchAt(id);
      o.label.classList.toggle('busy', !!batch);
      o.label.style.left = `${(r.x + r.w / 2) * s}px`;
      o.label.style.top = `${Math.max(0, r.y * s - 18)}px`;
      const pct = batch ? Math.min(1, batch.elapsed / Math.max(0.01, batch.duration)) : 0;
      const many = g.tankCount(id) > 1 ? g.batchesAt(id).length : 0;
      o.text.textContent = batch
        ? id === 'bottling' && g.bottlingBlocked ? 'Stockage plein ⏸'
        : id === 'bottling' && g.tastable === batch ? 'À goûter ⏸'
        : many > 1 ? `${STATIONS[id].step} · ${many} cuves`
        : batch.waiting ? `${STATIONS[id].step} ⏸` : `${STATIONS[id].step} · ${Math.round(pct * 100)} %`
        : STATIONS[id].step;
      o.label.classList.toggle('blocked', id === 'bottling' && g.bottlingBlocked);
      (o.bar.firstElementChild as HTMLElement).style.width = `${pct * 100}%`;
    }
  }

  private placeTaste(): void {
    const p = this.scene.tastePoint;
    this.tasteBtn.style.left = `${p.x * this.scale}px`;
    this.tasteBtn.style.top = `${p.y * this.scale}px`;
  }

  /** Rafraîchissement de l'interface DOM (≈ 4 Hz). */
  update(): void {
    const g = this.game();
    this.moneyEl.textContent = moneyInt(g.money);
    this.plaque.textContent = `★ ${g.breweryLevel} · ${g.breweryName}`;
    const can = g.canBrew();
    const sub = g.plan.length ? `${g.plan.length} programmé${g.plan.length > 1 ? 's' : ''}` : g.autoBrew ? '⟳ En continu' : can.ok ? (g.broke ? 'Offert par Gaston' : moneyInt(g.brewCost())) : g.batchAt('mill') ? 'Moulin occupé' : 'Fonds insuffisants';
    this.brewBtn.replaceChildren(h('span', 'brew-title', 'Brasser'), h('span', 'brew-sub', sub));
    this.brewBtn.classList.toggle('ready', can.ok && !g.autoBrew);
    const trial = g.tastable;
    this.rangeBtn.replaceChildren(h('span', 'side-title', 'Gamme'), h('span', 'side-sub', `${g.beers.length}/${g.rangeSlots}`));
    this.stockBtn.replaceChildren(h('span', 'side-title', 'Stock'), h('span', 'side-sub', g.storageFull ? 'Plein !' : `${Math.round((g.stored / g.storageCap) * 100)} %`));
    this.stockBtn.classList.toggle('alert', g.bottlingBlocked);
    const ready = g.readyOrders.length;
    this.ordersBtn.replaceChildren(h('span', 'brew-title', 'Commandes'), h('span', 'brew-sub', g.orders.length ? `${g.orders.length}${ready ? ` · ${ready} prête${ready > 1 ? 's' : ''}` : ''}` : '—'));
    this.ordersBtn.classList.toggle('ready', ready > 0);
    const emptyTap = g.taps.some((t) => t.glasses <= 0);
    const kegsReady = g.beers.some((b) => b.kegs.length > 0);
    this.menuBtn.replaceChildren(h('span', 'brew-title', 'Les fûts'), h('span', 'brew-sub', g.barServing ? `${g.glassesLeft} verres` : kegsReady ? 'Branche un fût !' : 'Vides'));
    this.menuBtn.classList.toggle('ready', emptyTap && kegsReady);
    this.syncKegHits();
    const nextBar = BAR[g.barLevel];
    this.barUpBtn.replaceChildren(h('span', 'side-title', 'Agrandir'), h('span', 'side-sub', nextBar ? moneyShort(nextBar.cost) : 'Au max'));
    this.barUpBtn.classList.toggle('alert', !!nextBar && g.money >= nextBar.cost);
    const partySub = g.partying ? `🎉 ${duration(g.partyUntil - g.time)}` : g.time < g.partyReadyAt ? `dans ${duration(g.partyReadyAt - g.time)}` : moneyShort(g.partyCost);
    this.partyBtn.replaceChildren(h('span', 'side-title', 'Fête'), h('span', 'side-sub', partySub));
    this.partyBtn.classList.toggle('alert', g.partying);
    this.storagePlaque.textContent = `▣ ${STORAGE[g.storageLevel - 1]!.name}`;
    this.barPlaque.textContent = `★ ${g.barLevel} · ${g.bar.name}`;
    this.ordersBadge.classList.toggle('hidden', !g.orders.length);
    this.ordersBadge.classList.toggle('ready', ready > 0);
    this.ordersBadge.textContent = String(g.orders.length);
    // pastilles des onglets de pièces
    const badges: Record<RoomId, string> = {
      workshop: trial ? '🍺' : '',
      storage: g.orders.length ? String(g.orders.length) : g.storageFull ? '!' : '',
      bar: g.partying ? '🎉' : emptyTap && kegsReady ? '!' : '', // un fût à changer, et de quoi le remplacer
    };
    for (const [id, tab] of this.navTabs) {
      tab.btn.classList.toggle('active', id === this.room);
      tab.badge.textContent = badges[id];
      tab.badge.classList.toggle('hidden', !badges[id]);
      tab.badge.classList.toggle('hot', id === 'storage' ? ready > 0 || g.storageFull : !!badges[id]);
    }
    this.tasteBtn.classList.toggle('hidden', !trial || this.modalOpen);
    this.placeTaste();
    if (trial && trial.id !== this.announcedTaste) {
      this.announcedTaste = trial.id;
      this.toast('Première bouteille : goûte-la !', 'good');
      this.onTasteReady?.();
    }
    this.refreshComputer();
    this.renderSheet();
    this.renderMentor();
    // La barre du bas change de hauteur une fois remplie / les polices chargées : on recadre.
    const key = `${this.header.getBoundingClientRect().bottom}|${this.bottom.getBoundingClientRect().top}|${window.innerWidth}`;
    if (key !== this.laidOut) this.layout();
  }

  // ------------------------------------------------------------------ panneaux

  open(s: NonNullable<App['openSheet']>): void {
    const same = this.openSheet && this.openSheet.kind === s.kind && (s.kind !== 'station' || (this.openSheet as { id?: string }).id === s.id);
    this.openSheet = same ? null : s;
    this.scene.selected = this.openSheet?.kind === 'station' ? this.openSheet.id : null;
    this.sheetKey = '';
    if (this.openSheet?.kind === 'station' && this.game().tips === 1) this.game().tips = 2;
    this.renderSheet();
  }

  private close(): void {
    this.openSheet = null;
    this.scene.selected = null;
    this.sheetKey = '';
    this.renderSheet();
  }

  private renderSheet(): void {
    const g = this.game();
    const s = this.openSheet;
    this.sheet.classList.toggle('hidden', !s);
    if (!s) return;
    const key = JSON.stringify([
      s, g.level(s.kind === 'station' ? s.id : 'mill'), s.kind === 'station' ? g.tankCount(s.id) : 0, g.beers.map((b) => [b.id, b.stock, b.name]), g.tastable?.id ?? 0, g.selectedBeer, g.autoBrew,
      g.batchLiters, s.kind === 'brew' ? [g.canBrew().ok, g.roomForBatch, g.queued, g.broke] : 0, s.kind === 'bar' || s.kind === 'barUp' ? [g.taps, g.beers.map((b) => [b.kegs.length, Math.round(b.pop * 100)]), g.barLevel] : 0, s.kind === 'brew' ? [g.plan, g.format, g.beers.map((b) => b.kegs.length)] : 0,
      s.kind === 'storage' ? [Math.round(g.productionRate()), g.beers.map((b) => b.kegs.length)] : 0, s.kind === 'range' ? g.beers.map((b) => Math.round(b.pop * 20)) : 0, g.rangeSlots, g.storageLevel, g.bottlingBlocked, this.shelfSel,
    ]);
    if (key === this.sheetKey) return this.refreshLive();
    this.sheetKey = key;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    const shelfScroll = this.sheet.querySelector('.shelf')?.scrollLeft ?? 0;
    this.sheet.replaceChildren();
    this.sheet.classList.remove('fit');
    if (s.kind === 'station') this.stationSheet(g, s.id);
    if (s.kind === 'brew') this.brewSheet(g);
    if (s.kind === 'range') this.rangeSheet(g);
    if (s.kind === 'storage') this.storageSheet(g);
    if (s.kind === 'bar') this.barSheet(g);
    if (s.kind === 'barUp') this.barUpSheet(g);
    const body = this.sheet.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
    const shelf = this.sheet.querySelector('.shelf');
    if (shelf) shelf.scrollLeft = shelfScroll;
  }

  /** Met à jour sans reconstruire ce qui dépend de l'argent. */
  private refreshLive(): void {
    const g = this.game();
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => (b.disabled = g.money < Number(b.dataset.cost)));
  }

  private frameSheet(title: string, icon?: HTMLCanvasElement): HTMLElement {
    const head = h('div', 'sheet-head');
    const t = h('div', 'sheet-title');
    if (icon) t.append(img(icon, 'pix sheet-icon'));
    t.append(h('strong', '', title));
    const close = h('button', 'icon-btn small', '✕');
    close.onclick = () => this.close();
    head.append(t, close);
    const body = h('div', 'sheet-body');
    this.sheet.append(head, body);
    return body;
  }

  private btn(cls: string, text: string, onclick: () => void): HTMLButtonElement {
    const b = h('button', cls, text);
    b.onclick = onclick;
    return b;
  }

  // --- Fiche d'un appareil : réglages et amélioration
  private stationSheet(g: Game, id: StationId): void {
    const def = STATIONS[id];
    const lv = g.level(id);
    const body = this.frameSheet(`${def.names[lv - 1]}`, stationCanvas(id, lv));
    body.append(h('div', 'step-tag', `${def.step} · niveau ${lv}/${MAX_LEVEL}`));
    const batch = g.batchAt(id);
    if (def.strain) {
      const row = h('div', 'chips');
      const desc = h('div', 'hint strain-desc', STRAINS[g.recipe.strain].description);
      for (const [sid, st] of Object.entries(STRAINS)) {
        const c = this.btn(`chip${g.recipe.strain === sid ? ' active' : ''}`, st.name, () => {
          g.setParam('strain', sid as StrainId);
          row.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
          desc.textContent = st.description;
        });
        row.append(c);
      }
      body.append(h('div', 'section-title', 'Levure'), row, desc);
    }
    const knobs = h('div', 'knob-row');
    for (const k of def.knobs) {
      knobs.append(createKnob({ label: k.label, min: k.min, max: k.max, step: k.step, unit: k.unit, value: g.recipe[k.key] as number, onChange: (v) => g.setParam(k.key, v) }));
    }
    body.append(knobs);
    // cuves en parallèle (fermentation, garde)
    const tankCost = g.tankCost(id);
    if (TANK_STAGES.includes(id)) {
      const row = h('div', 'deal-row');
      row.append(h('span', 'stats-line strong', `Cuves : ${g.tankCount(id)}/${MAX_TANKS}`));
      if (tankCost != null) {
        const b = this.btn('btn small', `+ 1 cuve · ${moneyShort(tankCost)}`, () => {
          const r = g.addTank(id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast('Nouvelle cuve installée', 'good');
          this.sheetKey = '';
        });
        b.dataset.cost = String(tankCost);
        b.disabled = g.money < tankCost;
        row.append(b);
      }
      body.append(row);
    }
    // amélioration
    const up = h('div', 'card upgrade');
    up.append(h('div', 'section-title', 'Améliorer'));
    // On ne dévoile que le palier suivant : la surprise reste entière pour les niveaux d'après.
    const levels = h('div', 'levels');
    const cell = (i: number, tag: string, cls: string) => {
      const c = h('div', `level ${cls}`);
      c.append(h('div', 'section-title', tag), img(stationCanvas(id, i), 'pix level-pic'), h('div', 'level-name', def.names[i - 1]!), h('div', 'level-perk', def.perks[i - 1]!));
      return c;
    };
    levels.append(cell(lv, `Actuel · niv. ${lv}`, 'done'));
    if (lv < MAX_LEVEL) levels.append(h('div', 'level-arrow', '➜'), cell(lv + 1, `Suivant · niv. ${lv + 1}`, 'current'));
    up.append(levels);
    if (lv < MAX_LEVEL) {
      const cost = g.upgradeCost(id);
      const b = this.btn('btn primary', `Améliorer · ${moneyInt(cost)}`, () => {
        const r = g.upgrade(id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${def.names[lv]} installé !`, 'good');
        this.sheetKey = '';
      });
      b.dataset.cost = String(cost);
      b.disabled = g.money < cost;
      up.append(b);
    } else up.append(h('p', 'note', 'Niveau maximal'));
    body.append(up);
  }

  // --- Lancer un brassin
  private brewSheet(g: Game): void {
    const body = this.frameSheet('Brasser');
    const beer = g.beers.find((b) => b.id === g.selectedBeer);
    const card = h('div', 'card');
    const fmt = g.brewFormat;
    const kl = kegLiters(g.batchLiters);
    const nk = Math.floor(g.batchLiters / kl);
    const units = fmt === 'keg' ? `${nk} fût${nk > 1 ? 's' : ''} de ${kegGlasses(kl)} verres` : `${Math.floor(g.batchLiters / 0.33)} btl`;
    card.append(
      h('div', 'beer-name', beer ? beer.name : 'Nouvel essai'),
      h('div', 'stats-line', `${units} · ${moneyInt(g.brewCost(g.recipe, g.batchLiters, fmt))}`),
    );
    if (beer) {
      // bouteilles pour le stock et les commandes, fûts pour le bar
      const chips = h('div', 'chips');
      for (const [f, name] of [['bottle', 'Bouteilles'], ['keg', 'Fûts']] as const) {
        chips.append(this.btn(`chip${fmt === f ? ' active' : ''}`, name, () => {
          g.format = f;
          this.sheetKey = '';
        }));
      }
      card.append(chips);
    }
    body.append(card);
    const can = g.canBrew();
    const busy = !!g.batchAt('mill');
    const label = g.queued ? 'En attente du moulin…' : can.ok ? (g.broke ? 'Brasser (offert par Gaston)' : 'Brasser') : busy ? 'Brasser au prochain tour' : can.reason!;
    const go = this.btn('btn primary big', label, () => {
      const r = busy ? g.queueBrew() : g.brew();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      if (g.tips === 2 || g.tips === 1) g.tips = 3;
      this.toast(busy ? 'En file d\'attente' : 'Brassin lancé !', 'good');
      this.close();
    });
    go.disabled = g.queued || (!can.ok && !(busy && g.money >= g.brewCost(g.recipe, g.batchLiters, fmt)));
    body.append(go);
    if (beer) {
      const plan = this.btn('btn', '+ Programmer', () => {
        const r = g.planBrew(beer.id, fmt);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast('Brassin programmé', 'good');
        this.sheetKey = '';
      });
      plan.disabled = g.plan.length >= MAX_PLAN;
      body.append(plan);
    }
    if (g.plan.length) {
      body.append(h('div', 'section-title', `Programmés · ${g.plan.length}/${MAX_PLAN}`));
      const list = h('div', 'stock-list');
      g.plan.forEach((p, i) => {
        const b = g.beer(p.beerId);
        if (!b) return;
        const line = h('div', 'stock-line');
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(h('span', 'plan-rank', `${i + 1}.`), thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', p.format === 'keg' ? 'Fûts' : 'Btl'), this.btn('icon-btn small', '✕', () => {
          g.unplan(i);
          this.sheetKey = '';
        }));
        list.append(line);
      });
      body.append(list);
    }
    if (g.beers.length) {
      const auto = h('label', 'toggle');
      const box = h('input');
      box.type = 'checkbox';
      box.checked = g.autoBrew;
      box.onchange = () => {
        g.autoBrew = box.checked;
        this.sheetKey = '';
      };
      auto.append(box, h('span', '', 'Brassage continu'));
      body.append(auto);
      if (g.autoBrew && !g.roomForBatch) body.append(h('p', 'note bad', '⏸ Stockage plein'));
    }
    if (g.beers.length) {
      body.append(h('div', 'section-title', 'Ma gamme'));
      const list = h('div', 'chips');
      for (const b of g.beers) list.append(this.btn(`chip${b.id === g.selectedBeer ? ' active' : ''}`, b.name, () => {
        g.loadBeer(b.id);
        this.sheetKey = '';
      }));
      body.append(list);
    }
  }

  // --- Ma gamme : une étagère de grandes bouteilles, et une silhouette « + » pour en créer une nouvelle
  private rangeSheet(g: Game): void {
    const body = this.frameSheet(`Ma gamme · ${g.beers.length}/${g.rangeSlots}`);
    this.sheet.classList.add('fit');
    if (g.tastable) body.append(this.btn('btn primary', '🍺 Un essai attend : goûter', () => this.openTasting()));
    if (this.shelfSel == null || !g.beers.some((b) => b.id === this.shelfSel)) this.shelfSel = g.selectedBeer ?? g.beers[0]?.id ?? null;
    // L'étagère entière, 2 rangées de 4 : bières, places libres, la place à acheter (+), puis les futures places.
    const shelf = h('div', 'shelf');
    const items: HTMLElement[] = [];
    const slot = (kind: ShelfBottleKind, tag: string, onclick?: () => void, beer?: Beer) => {
      const item = h('button', `shelf-item ${kind}${beer && beer.id === this.shelfSel ? ' selected' : ''}`);
      const bottle = h('div', 'shelf-bottle');
      const c = h('canvas', 'shelf-glass');
      drawShelfBottle(c, kind === 'locked' ? 'empty' : kind);
      bottle.append(c);
      if (beer) {
        const lab = h('canvas', 'shelf-label');
        drawLabel(lab, beer.label, beer.name);
        Object.assign(lab.style, { left: `${LABEL_SPOT.x * BOTTLE_SCALE}px`, top: `${LABEL_SPOT.y * BOTTLE_SCALE}px` });
        bottle.append(lab);
      }
      item.append(bottle, h('span', 'shelf-tag', tag));
      if (onclick) item.onclick = onclick;
      else item.disabled = true;
      items.push(item);
      return item;
    };
    for (const b of g.beers) slot('beer', `${b.stock} btl`, () => {
      this.shelfSel = b.id;
      this.sheetKey = '';
    }, b);
    for (let i = g.beers.length; i < g.rangeSlots; i++) slot('empty', 'Libre', () => this.toast('Garde un essai pour la remplir', 'info'));
    const cost = g.nextSlotCost;
    if (cost != null) {
      const add = slot('add', moneyShort(cost), () => this.openNewRange());
      add.classList.toggle('afford', g.money >= cost);
    }
    while (items.length < MAX_RANGE) slot('locked', '🔒');
    for (let r = 0; r < items.length; r += 4) {
      const row = h('div', 'shelf-row');
      row.append(...items.slice(r, r + 4));
      shelf.append(row);
    }
    body.append(shelf);
    const sel = g.beers.find((b) => b.id === this.shelfSel);
    if (sel) body.append(this.beerCard(g, sel));
  }

  /** Confirmation d'achat d'une nouvelle place sur l'étagère. */
  private openNewRange(): void {
    const g = this.game();
    const cost = g.nextSlotCost;
    if (cost == null) return;
    const card = this.modalCard('Nouvelle gamme');
    card.append(
      h('p', 'hint', 'Une place de plus sur ton étagère.'),
    );
    const buy = this.btn('btn primary big', `Créer une gamme · ${moneyInt(cost)}`, () => {
      const r = g.buySlot();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.closeModal();
      this.sheetKey = '';
      this.toast('Nouvelle place !', 'good');
    });
    buy.disabled = g.money < cost;
    card.append(buy);
    if (g.money < cost) card.append(h('p', 'note bad', `Il te manque ${moneyInt(cost - g.money)}.`));
    card.append(this.btn('btn', 'Annuler', () => this.closeModal()));
  }

  // --- Stockage : les caisses s'empilent jusqu'à ce que la réserve soit pleine
  private storageSheet(g: Game): void {
    const lvl = STORAGE[g.storageLevel - 1]!;
    const body = this.frameSheet(`Stockage · ${lvl.name}`);
    const capCrates = lvl.crates;
    const crates = Math.ceil(g.stored / CRATE);
    body.append(h('div', 'stats-line strong', `${crates} / ${capCrates} caisses`));
    const bar = h('div', 'progress');
    const fill = h('div', `progress-fill${g.storageFull ? ' full' : ''}`);
    fill.style.width = `${Math.min(100, (g.stored / g.storageCap) * 100)}%`;
    bar.append(fill);
    body.append(bar);
    if (g.bottlingBlocked) body.append(h('p', 'note bad', 'Plein : embouteillage à l\'arrêt'));
    if (g.beers.length) {
      const list = h('div', 'stock-list');
      for (const b of g.beers) {
        const line = h('div', 'stock-line');
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', `${b.stock} btl${b.kegs.length ? ` · ${b.kegs.length} fûts` : ''}`));
        list.append(line);
      }
      body.append(list);
    }
    // agrandissement
    const up = h('div', 'card upgrade');
    up.append(h('div', 'section-title', 'Agrandir'));
    // Seulement le palier actuel et le suivant.
    const levels = h('div', 'storage-levels');
    const next = STORAGE[g.storageLevel];
    for (const [l, tag, cls] of [[lvl, 'Actuel', 'done'], [next, 'Suivant', 'current']] as const) {
      if (!l) continue;
      const cell = h('div', `storage-level ${cls}`);
      cell.append(h('span', 'level-name', `${tag} : ${l.name}`), h('span', 'level-perk', `${l.crates.toLocaleString('fr-FR')} caisses`));
      levels.append(cell);
    }
    up.append(levels);
    if (next) {
      const b = this.btn('btn primary', `Agrandir · ${moneyInt(next.cost)}`, () => {
        const r = g.upgradeStorage();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${next.name} !`, 'good');
        this.sheetKey = '';
      });
      b.dataset.cost = String(next.cost);
      b.disabled = g.money < next.cost;
      up.append(b);
    } else up.append(h('p', 'note', 'Niveau maximal'));
    body.append(up);
  }

  private beerCard(g: Game, b: Beer): HTMLElement {
    const t = b.tasting;
    const v = verdictOf(t.quality);
    const card = h('div', 'card beer');
    const head = h('div', 'beer-head');
    head.append(h('span', 'beer-name', b.name), h('span', `verdict ${VERDICT_CLASS[v]}`, v));
    card.append(head, h('div', 'stats-line', `${t.style} · ${t.abv.toFixed(1)} % · ${b.stock} btl${b.kegs.length ? ` · ${b.kegs.length} fûts` : ''}`));
    card.append(this.popLine(g, b));
    const actions = h('div', 'row');
    actions.append(this.btn('btn small', b.id === g.selectedBeer ? '✓ Chargée' : 'Charger', () => {
      g.loadBeer(b.id);
      this.sheetKey = '';
    }));
    actions.append(this.btn('btn small', 'Fiche', () => this.openTastingView(b.name, t)));
    actions.append(this.btn('btn small', 'Étiquette', () => this.openLabelEditor(b.name, b.label, (name, label) => {
      b.name = name.trim() || b.name;
      g.setLabel(b.id, label);
      this.sheetKey = '';
      this.closeModal();
    })));
    actions.append(this.btn('btn small bad', 'Retirer', () => {
      g.removeBeer(b.id);
      this.sheetKey = '';
    }));
    card.append(actions);
    return card;
  }

  /** Popularité d'une bière en étoiles, et les tendances qu'elle suit. */
  private popLine(g: Game, b: Beer): HTMLElement {
    const line = h('div', 'pop-line');
    line.append(h('span', 'pop-stars', starText(b.pop)));
    for (const tr of trendsOf(b.tasting, g.trends)) line.append(h('span', 'trend-chip', `↗ ${tr.short}`));
    return line;
  }

  // --- Bar : popularité, affluence et fûts branchés
  private barSheet(g: Game): void {
    const body = this.frameSheet(`Le bar · ${g.bar.name}`);
    body.append(h('div', 'stats-line strong', `Marque ${starText(g.brand)} · ${fmtRate(g.barRate * 60)} clients/h`));
    const list = h('div', 'stock-list');
    g.taps.forEach((tap, i) => {
      const b = g.beer(tap.beerId);
      const line = h('button', `stock-line tap-line${tap.glasses > 0 ? ' on' : ''}`);
      if (b) {
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', tap.glasses > 0 ? `${tap.glasses}/${tap.capacity} verres` : 'Vide'));
      } else line.append(h('span', 'stock-name', `Tireuse ${i + 1}`), h('span', 'stock-qty', '—'));
      line.append(h('span', 'tap-state', '⇄'));
      line.onclick = () => this.openKegSwap(i);
      list.append(line);
    });
    body.append(list);
    if (!g.beers.some((b) => b.kegs.length)) body.append(h('p', 'hint', 'Aucun fût plein : brasse en « Fûts » à l\'atelier.'));
  }

  /** Changer le fût d'une tireuse : on prend un fût plein au stockage. */
  openKegSwap(i: number): void {
    const g = this.game();
    const tap = g.taps[i];
    if (!tap) return;
    this.barRoom.selected = `keg${i}`;
    const card = this.modalCard('Changer le fût');
    if (tap.glasses > 0) card.append(h('p', 'hint', `Il reste ${tap.glasses} verres, ils seront perdus.`));
    const list = h('div', 'stock-list');
    for (const b of g.beers) {
      const line = h('button', 'stock-line tap-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', `${b.kegs.length} fût${b.kegs.length > 1 ? 's' : ''}`));
      line.disabled = !b.kegs.length;
      line.onclick = () => {
        const r = g.swapKeg(i, b.id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`Fût de ${b.name} branché`, 'good');
        this.barRoom.selected = null;
        this.sheetKey = '';
        this.closeModal();
      };
      list.append(line);
    }
    card.append(list);
    if (!g.beers.some((b) => b.kegs.length > 0)) card.append(h('p', 'note bad', 'Aucun fût plein : brasse en « Fûts » à l\'atelier.'));
    card.append(this.btn('btn', 'Fermer', () => {
      this.barRoom.selected = null;
      this.closeModal();
    }));
  }

  // --- Bar : l'agrandir (plus de places, de tireuses, une meilleure ambiance)
  private barUpSheet(g: Game): void {
    const lvl = g.bar;
    const body = this.frameSheet(`Bar · ${lvl.name}`);
    const next = BAR[g.barLevel];
    const levels = h('div', 'storage-levels');
    for (const [l, tag, cls] of [[lvl, 'Actuel', 'done'], [next, 'Suivant', 'current']] as const) {
      if (!l) continue;
      const cell = h('div', `storage-level ${cls}`);
      cell.append(h('span', 'level-name', `${tag} : ${l.name}`), h('span', 'level-perk', `${l.taps} tireuse${l.taps > 1 ? 's' : ''} · ${l.seats} places`));
      levels.append(cell);
    }
    body.append(levels);
    if (next) {
      const b = this.btn('btn primary', `Agrandir · ${moneyInt(next.cost)}`, () => {
        const r = g.upgradeBar();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${next.name} !`, 'good');
        this.barRoom.invalidate();
        this.syncKegHits();
        this.sheetKey = '';
      });
      b.dataset.cost = String(next.cost);
      b.disabled = g.money < next.cost;
      body.append(b);
    } else body.append(h('p', 'note', 'Niveau maximal'));
  }

  /** Organiser une fête : 30 min, 50 fois plus de clients ; il faut avoir prévu des fûts. */
  openParty(): void {
    const g = this.game();
    if (this.room !== 'bar') this.goRoom('bar');
    const card = this.modalCard('Organiser une fête');
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    card.append(
      h('p', 'hint', `${PARTY.duration / 60} min de fête : ${PARTY.mult} fois plus de clients. Les fûts vides sont changés tout seuls avec ceux du stockage.`),
      h('div', kegs ? 'stats-line strong' : 'note bad', `Fûts pleins au stockage : ${kegs}`),
    );
    const can = !g.partying && g.time >= g.partyReadyAt;
    const go = this.btn('btn primary big', g.partying ? 'La fête bat son plein !' : can ? `C'est parti · ${moneyInt(g.partyCost)}` : `Prochaine fête dans ${duration(g.partyReadyAt - g.time)}`, () => {
      const r = g.startParty();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.toast('🎉 Que la fête commence !', 'good');
      this.onSent?.();
      this.closeModal();
    });
    go.disabled = !can || g.money < g.partyCost;
    card.append(go, this.btn('btn', 'Plus tard', () => this.closeModal()));
  }

  // ------------------------------------------------------------------ ordinateur des commandes

  /** L'ordinateur du stockage : le tableau des commandes, les tendances et le grossiste. */
  openComputer(tab: PcTab = 'orders'): void {
    if (this.room !== 'storage') this.goRoom('storage');
    this.close();
    const card = this.modalCard('');
    card.classList.add('computer');
    this.computer = { tab, key: '' };
    this.renderComputer(card);
  }

  private computerKey(g: Game): string {
    return JSON.stringify([this.computer?.tab, g.computerLevel, g.advertising, g.money >= g.adCost, g.money >= (COMPUTERS[g.computerLevel]?.cost ?? Infinity), g.orders.map((o) => o.id), g.trends, g.beers.map((b) => [b.id, b.stock, b.kegs.length, Math.round(b.pop * 10)]), [...this.picks]]);
  }

  /** Reconstruit la fenêtre quand une commande arrive, expire, ou que le stock change. */
  private refreshComputer(): void {
    if (!this.computer || !this.modalOpen) return;
    const card = this.modal.querySelector<HTMLElement>('.modal-card.computer');
    if (!card) return;
    if (this.computerKey(this.game()) !== this.computer.key) this.renderComputer(card);
    else card.querySelectorAll<HTMLElement>('[data-expires]').forEach((el) => (el.textContent = `⏳ ${duration(Number(el.dataset.expires) - this.game().time)}`));
  }

  private renderComputer(card: HTMLElement): void {
    const g = this.game();
    const st = this.computer!;
    st.key = this.computerKey(g);
    const scroll = card.scrollTop;
    card.replaceChildren();
    const head = h('div', 'sheet-head');
    const tabs = h('div', 'pc-tabs');
    for (const [id, name] of [['orders', 'Commandes'], ['trends', 'Tendances'], ['wholesale', 'Grossiste']] as const) {
      tabs.append(this.btn(`pc-tab${st.tab === id ? ' active' : ''}`, name, () => {
        st.tab = id;
        this.renderComputer(card);
      }));
    }
    head.append(tabs, this.btn('icon-btn small', '✕', () => this.closeModal()));
    card.append(head);
    if (st.tab === 'orders') this.ordersTab(g, card);
    else if (st.tab === 'trends') this.trendsTab(g, card);
    else this.wholesaleTab(g, card);
    card.scrollTop = scroll;
  }

  private ordersTab(g: Game, card: HTMLElement): void {
    for (const id of this.picks.keys()) if (!g.orders.some((o) => o.id === id)) this.picks.delete(id);
    if (!g.orders.length) card.append(h('p', 'hint', 'Aucune commande. La prochaine arrive bientôt.'));
    for (const o of [...g.orders].sort((a, b) => a.expires - b.expires)) card.append(this.orderCard(g, o));
    // l'ordinateur : une place de plus au tableau à chaque niveau
    const next = COMPUTERS[g.computerLevel];
    const foot = h('div', 'pc-foot');
    foot.append(h('span', 'hint', `${COMPUTERS[g.computerLevel - 1]!.name} · ${g.orders.length}/${g.boardSlots} places`));
    if (next) {
      const b = this.btn('btn small', `+1 place · ${moneyShort(next.cost)}`, () => {
        const r = g.upgradeComputer();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${next.name} installé`, 'good');
        this.computer!.key = '';
        this.refreshComputer();
      });
      b.disabled = g.money < next.cost;
      foot.append(b);
    }
    card.append(foot);
  }

  /** Une commande : qui, quoi, combien elle paie ; on coche les bières, on envoie. */
  private orderCard(g: Game, o: Order): HTMLElement {
    if (!this.picks.has(o.id)) this.picks.set(o.id, g.autoPick(o));
    const pick = this.picks.get(o.id)!;
    const q = g.quote(o, pick);
    const card = h('div', `card order kind-${o.kind}${q.ok ? ' banner' : ''}`);
    const head = h('div', 'beer-head');
    const left = h('span', 'order-time');
    left.dataset.expires = String(o.expires);
    left.textContent = `⏳ ${duration(o.expires - g.time)}`;
    head.append(h('span', 'beer-name', o.client), left);
    card.append(head);
    const ask = h('div', 'order-ask');
    if (o.kind !== 'classic') ask.append(h('span', `kind-tag kind-${o.kind}`, KIND_LABEL[o.kind]));
    ask.append(h('span', '', orderAsk(o)));
    card.append(ask);
    const ok = g.suitable(o);
    const avail = (b: Beer) => (o.kind === 'keg' ? b.kegs.length : b.stock);
    if (!ok.length) card.append(h('p', 'note bad', 'Aucune bière de ta gamme ne convient'));
    else if (q.ok && !this.editing.has(o.id)) {
      // les bières choisies d'office ; on peut changer
      const line = h('div', 'order-pick');
      line.append(h('span', 'hint', `→ ${q.take.map((t) => t.beer.name).join(', ')}`));
      if (ok.length > 1) line.append(this.btn('btn small', 'Changer', () => {
        this.editing.add(o.id);
        this.computer!.key = '';
        this.refreshComputer();
      }));
      card.append(line);
    } else {
      const chips = h('div', 'chips');
      for (const b of ok) {
        const on = pick.includes(b.id);
        const chip = h('button', `chip beer-chip${on ? ' active' : ''}`);
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        chip.append(thumb, h('span', '', `${b.name} · ${avail(b)}`));
        chip.disabled = !on && avail(b) <= 0;
        chip.onclick = () => {
          this.picks.set(o.id, on ? pick.filter((x) => x !== b.id) : [...pick, b.id]);
          this.refreshComputer();
        };
        chips.append(chip);
      }
      card.append(chips);
    }
    const row = h('div', 'row');
    const send = this.btn('btn primary', q.ok ? `Envoyer · ${moneyInt(o.reward)}` : `${moneyInt(o.reward)} · stock insuffisant`, () => {
      const r = g.fulfill(o.id, pick);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.picks.delete(o.id);
      this.toast(`+${moneyInt(r.amount!)}`, 'good');
      this.onSent?.();
      this.sheetKey = '';
      this.refreshComputer();
    });
    send.disabled = !q.ok;
    row.append(send, this.btn('btn small bad', 'Refuser', () => {
      g.declineOrder(o.id);
      this.picks.delete(o.id);
      this.refreshComputer();
    }));
    card.append(row);
    return card;
  }

  /** La popularité de la marque et les tendances du moment. */
  private trendsTab(g: Game, card: HTMLElement): void {
    card.append(h('div', 'stats-line strong', `Ta marque : ${starText(g.brand)}`));
    const ad = this.btn('btn primary', g.advertising ? `📣 Campagne en cours · ${duration(g.adUntil - g.time)}` : `📣 Campagne de pub · ${moneyShort(g.adCost)}`, () => {
      const r = g.advertise();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.toast('Campagne lancée : ta gamme fait parler d\'elle', 'good');
      this.computer!.key = '';
      this.refreshComputer();
    });
    ad.disabled = g.advertising || g.money < g.adCost;
    card.append(ad, h('p', 'hint', `+${Math.round(AD.pop * 100)} % de popularité, commandes ×${AD.orderBoost} pendant ${AD.duration / 3600} h.`));
    for (const tr of g.trends) {
      const def = trendById(tr.id);
      if (!def) continue;
      const el = h('div', 'card');
      const head = h('div', 'beer-head');
      const left = h('span', 'order-time');
      left.dataset.expires = String(tr.until);
      left.textContent = `⏳ ${duration(tr.until - g.time)}`;
      head.append(h('span', 'beer-name', def.text), left);
      el.append(head);
      const fans = g.beers.filter((b) => def.test(b.tasting));
      if (fans.length) el.append(h('div', 'note', `✓ ${fans.map((b) => b.name).join(', ')}`));
      card.append(el);
    }
    for (const b of g.beers) {
      const el = h('div', 'stock-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      el.append(thumb, h('span', 'stock-name', b.name), h('span', 'pop-stars', starText(b.pop)));
      card.append(el);
    }
  }

  /** Le grossiste : il reprend le surplus de bouteilles à tout moment, à petit prix. */
  private wholesaleTab(g: Game, card: HTMLElement): void {
    const auto = h('label', 'toggle');
    const box = h('input');
    box.type = 'checkbox';
    box.checked = g.autoWholesale;
    box.onchange = () => (g.autoWholesale = box.checked);
    auto.append(box, h('span', '', 'Vendre le surplus automatiquement'));
    card.append(auto, h('p', 'hint', 'Au-delà de la moitié du stockage, à petit prix. Le reste attend les commandes.'));
    const beers = g.beers.filter((b) => b.stock > 0 && b.tasting.quality >= DRINKABLE_MIN);
    if (!beers.length) card.append(h('p', 'hint', 'Rien en stock.'));
    for (const b of beers) {
      const el = h('div', 'stock-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      const unit = wholesalePrice(b.tasting);
      el.append(thumb, h('span', 'stock-name', `${b.name} · ${b.stock}`));
      const sell = (n: number, label: string) =>
        this.btn('btn small', label, () => {
          const r = g.sellWholesale(b.id, n);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`+${moneyInt(r.amount!)}`, 'good');
          this.refreshComputer();
        });
      if (b.stock > CRATE) el.append(sell(CRATE, '1 caisse'));
      el.append(sell(b.stock, `Tout · ${moneyInt(b.stock * unit)}`));
      card.append(el);
    }
  }

  // ------------------------------------------------------------------ pièces

  /** Va dans une pièce (onglet ou glissement). */
  goRoom(id: RoomId): void {
    if (id === this.room) return;
    this.room = id;
    this.close();
    this.storageRoom.selected = null;
    this.barRoom.selected = null;
    this.roomsDrawUntil = performance.now() + 400;
    this.stage.classList.remove('dragging');
    this.placeTrack();
    this.setBottom();
    this.update();
  }

  /** Une zone tactile par fût de la cave : toucher un fût permet de le changer. */
  private syncKegHits(force = false): void {
    const n = this.game().taps.length;
    if (!force && this.kegHits.length === n) return;
    for (const el of this.kegHits) {
      el.remove();
      this.roomHits = this.roomHits.filter((r) => r.el !== el);
    }
    this.kegHits = [];
    for (const hit of this.barRoom.hits(n).slice(1)) {
      const i = Number(hit.id.slice(3));
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', `Fût de la tireuse ${i + 1}`);
      el.onclick = () => this.openKegSwap(i);
      this.barWrap.append(el);
      this.kegHits.push(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    const s = this.scale;
    for (const { el, rect } of this.roomHits) Object.assign(el.style, { left: `${rect.x * s}px`, top: `${rect.y * s}px`, width: `${rect.w * s}px`, height: `${rect.h * s}px` });
  }

  private get roomIndex(): number {
    return ROOMS.findIndex((r) => r.id === this.room);
  }

  private placeTrack(dx = 0): void {
    this.track.style.transform = `translateX(calc(${-this.roomIndex * 100}vw + ${dx}px))`;
  }

  /** La barre du bas propose les actions de la pièce affichée. */
  private setBottom(): void {
    const btns = this.room === 'workshop' ? [this.rangeBtn, this.brewBtn] : this.room === 'storage' ? [this.stockBtn, this.ordersBtn] : [this.barUpBtn, this.partyBtn, this.menuBtn];
    this.bottom.replaceChildren(...btns);
    this.bottom.classList.toggle('three', btns.length === 3);
  }

  /** Glisser horizontalement passe d'une pièce à l'autre ; un glissement n'ouvre pas ce qu'il y a sous le doigt. */
  private bindSwipe(): void {
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => {
      if (this.swipe) return;
      this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false, t: performance.now() };
    });
    st.addEventListener('pointermove', (e) => {
      const sw = this.swipe;
      if (!sw || sw.id !== e.pointerId) return;
      const dx = e.clientX - sw.x;
      const dy = e.clientY - sw.y;
      if (!sw.on) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        sw.on = true;
        st.classList.add('dragging');
        try { st.setPointerCapture(e.pointerId); } catch { /* le doigt est déjà parti */ }
      }
      // résistance aux bords (pas de pièce avant l'atelier ni après le bar)
      const i = this.roomIndex;
      sw.dx = (i === 0 && dx > 0) || (i === ROOMS.length - 1 && dx < 0) ? dx / 3 : dx;
      this.placeTrack(sw.dx);
    });
    const end = (e: PointerEvent) => {
      const sw = this.swipe;
      if (!sw || sw.id !== e.pointerId) return;
      this.swipe = null;
      if (!sw.on) return;
      this.swallowClick = true;
      setTimeout(() => (this.swallowClick = false), 50);
      st.classList.remove('dragging');
      const fast = Math.abs(sw.dx) / Math.max(1, performance.now() - sw.t) > 0.5;
      const far = Math.abs(sw.dx) > window.innerWidth * 0.22;
      const i = this.roomIndex + (fast || far ? (sw.dx < 0 ? 1 : -1) : 0);
      const target = ROOMS[Math.max(0, Math.min(ROOMS.length - 1, i))]!.id;
      this.roomsDrawUntil = performance.now() + 400;
      if (target !== this.room) this.goRoom(target);
      else this.placeTrack();
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    // le relâchement d'un glissement ne doit pas toucher une machine
    st.addEventListener('click', (e) => {
      if (!this.swallowClick) return;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  // ------------------------------------------------------------------ fenêtres

  /** Dégustation de la première bouteille d'un essai : garder (nom + étiquette) ou recommencer. */
  openTasting(): void {
    const g = this.game();
    const b = g.tastable;
    if (!b?.tasting) return;
    const t = b.tasting;
    const card = this.modalCard('Dégustation');
    this.tastingBody(card, t);
    const ok = t.quality >= DRINKABLE_MIN;
    const full = g.beers.length >= g.rangeSlots;
    const slotCost = g.nextSlotCost;
    const keep = this.btn('btn primary big', ok ? (full ? 'Gamme pleine' : 'Garder cette bière') : 'Imbuvable', () => {
      this.openLabelEditor(g.beers.length ? '' : 'Blonde de Gaston', { ...DEFAULT_LABEL }, (name, label) => {
        const r = g.keepTrial(name, label);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        if (g.tips <= 4) g.tips = 4;
        this.closeModal();
        this.toast('Nouvelle bière dans ta gamme !', 'good');
        this.sheetKey = '';
      });
    });
    keep.disabled = !ok || full;
    if (full && ok) {
      if (slotCost != null) {
        const buy = this.btn('btn', `Créer une gamme · ${moneyInt(slotCost)}`, () => {
          const r = g.buySlot();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.sheetKey = '';
          this.openTasting();
        });
        buy.disabled = g.money < slotCost;
        card.append(buy);
      }
    }
    card.append(keep, this.btn('btn bad', 'Jeter', () => {
      g.discardTrial();
      this.closeModal();
      this.toast('Brassin jeté', 'info');
      this.sheetKey = '';
    }));
  }

  /** Éditeur d'étiquette : forme, fond, motif, couleurs, emblème, police ; aperçu en direct. */
  openLabelEditor(name: string, initial: Label, onDone: (name: string, label: Label) => void): void {
    const label: Label = { ...initial };
    const card = this.modalCard('Ton étiquette');
    const preview = h('div', 'label-preview');
    const big = h('canvas', 'label-big');
    const bottle = h('div', 'bottle-preview');
    const small = h('canvas', 'label-on-bottle');
    bottle.append(small);
    preview.append(big, bottle);
    const input = h('input', 'name-input');
    input.maxLength = 22;
    input.placeholder = 'Nom de ta bière';
    input.value = name;
    const redraw = () => {
      drawLabel(big, label, input.value);
      drawLabel(small, label, input.value);
    };
    input.oninput = redraw;
    card.append(preview, h('div', 'section-title', 'Nom'), input);
    const chooser = <K extends keyof Label>(title: string, key: K, options: { id: Label[K]; name: string }[]) => {
      const row = h('div', 'chips');
      for (const o of options) {
        const c = this.btn(`chip${label[key] === o.id ? ' active' : ''}`, o.name, () => {
          label[key] = o.id;
          row.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
          redraw();
        });
        row.append(c);
      }
      card.append(h('div', 'section-title', title), row);
    };
    const colors = (title: string, key: 'bg' | 'patternColor' | 'textColor') => {
      const row = h('div', 'swatches');
      for (const col of LABEL_COLORS) {
        const sw = this.btn(`swatch${label[key] === col ? ' active' : ''}`, '', () => {
          label[key] = col;
          row.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === sw));
          redraw();
        });
        sw.style.background = col;
        sw.setAttribute('aria-label', col);
        row.append(sw);
      }
      card.append(h('div', 'section-title', title), row);
    };
    chooser('Forme', 'shape', SHAPES);
    colors('Fond', 'bg');
    chooser('Motif', 'pattern', PATTERNS);
    colors('Couleur du motif', 'patternColor');
    chooser('Emblème', 'emblem', EMBLEMS);
    chooser('Police du nom', 'font', FONTS);
    colors('Couleur du texte et du contour', 'textColor');
    card.append(this.btn('btn primary big', 'Valider l\'étiquette', () => onDone(input.value, label)));
    redraw();
    void document.fonts?.ready.then(redraw);
  }

  private openTastingView(name: string, t: Tasting): void {
    const card = this.modalCard(name);
    this.tastingBody(card, t);
    card.append(this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  private tastingBody(card: HTMLElement, t: Tasting): void {
    const v = verdictOf(t.quality);
    card.append(h('div', `verdict big ${VERDICT_CLASS[v]}`, v), h('div', 'score', `${t.style} · note ${Math.round(t.quality * 20)}/20`));
    const stats = h('div', 'tasting-stats');
    const lab = (x: number, a: string, b: string, c: string) => (x > 0.66 ? a : x > 0.33 ? b : c);
    for (const [k, val] of [
      ['Alcool', `${t.abv.toFixed(1)} %`], ['Amertume', `${Math.round(t.ibu)} IBU`], ['Couleur', t.color],
      ['Arôme', lab(t.aroma, 'Intense', 'Présent', 'Discret')], ['Limpidité', lab(t.clarity, 'Limpide', 'Voilée', 'Trouble')], ['Bulles', t.co2 < 1.8 ? 'Plate' : t.co2 > 3.2 ? 'Excessives' : 'Fines'],
    ] as const) {
      const c = h('div', 'stat');
      c.append(h('div', 'section-title', k), h('div', 'stat-value', val));
      stats.append(c);
    }
    card.append(stats);
    if (t.defects.length) {
      card.append(h('div', 'section-title', 'Ce qui ne va pas'));
      const ul = h('ul', 'defects');
      for (const d of t.defects) ul.append(h('li', '', d.label));
      card.append(ul);
    } else card.append(h('p', 'note', 'Aucun défaut'));
    // au-delà des défauts : ce qui manque pour une grande bière
    if (t.tips?.length && t.quality >= 0.6) {
      card.append(h('div', 'section-title', 'Pour plus de finesse'));
      const ul = h('ul', 'defects tips');
      for (const tip of t.tips.slice(0, 3)) ul.append(h('li', '', tip));
      card.append(ul);
    }
  }

  openOffline(): void {
    const g = this.game();
    const o = g.offline;
    if (!o) return;
    const card = this.modalCard('Pendant ton absence');
    const hrs = Math.floor(o.seconds / 3600);
    const min = Math.floor((o.seconds % 3600) / 60);
    card.append(h('p', 'hint', `${hrs ? `${hrs} h ` : ''}${min} min d'absence`));
    const stats = h('div', 'tasting-stats');
    for (const [k, v] of [['Brassins', String(o.batches)], ['Vendues', `${o.sold} btl`], ['Gains', moneyInt(o.earned)]] as const) {
      const c = h('div', 'stat');
      c.append(h('div', 'section-title', k), h('div', 'stat-value', v));
      stats.append(c);
    }
    card.append(stats, this.btn('btn primary big', `Récolter ${moneyInt(o.earned)}`, () => {
      g.collectOffline();
      this.closeModal();
      this.toast(`+${moneyInt(o.earned)} récoltés`, 'good');
    }));
  }

  /** Fiche de la brasserie : son niveau, ce qui manque pour le suivant et ce qu'il débloque. */
  openBrewery(levelUp = false): void {
    const g = this.game();
    const lv = g.breweryLevel;
    const card = this.modalCard(levelUp ? 'Ta brasserie grandit !' : 'Ta brasserie');
    card.append(h('div', 'verdict big v-top', `★ ${lv} · ${g.breweryName}`));
    const opened = CLIENT_TYPES.filter((d) => d.level === lv && d.level > 1);
    if (levelUp && opened.length) card.append(h('p', 'note', `Nouveaux clients : ${opened.map((d) => d.label).join(', ')}`));
    if (lv < MAX_LEVEL) {
      card.append(h('div', 'section-title', `Prochain : ★${lv + 1} ${BREWERY_NAMES[lv]}`));
      const list = h('div', 'brewery-list');
      for (const id of STATION_ORDER) {
        const ok = g.level(id) > lv;
        const row = h('div', `brewery-row${ok ? ' ok' : ''}`);
        row.append(img(stationCanvas(id, g.level(id)), 'pix brewery-pic'), h('span', '', STATIONS[id].step), h('span', 'brewery-state', ok ? '✓' : `niv. ${g.level(id)}`));
        row.onclick = () => {
          this.closeModal();
          this.goRoom('workshop');
          this.open({ kind: 'station', id });
        };
        list.append(row);
      }
      const next = CLIENT_TYPES.filter((d) => d.level === lv + 1);
      card.append(list);
      if (next.length) card.append(h('p', 'hint', `Débloque : ${next.map((d) => d.label).join(', ')}`));
    } else card.append(h('p', 'note', 'Niveau maximal'));
    card.append(this.btn('btn primary', 'Fermer', () => this.closeModal()));
  }

  private openOptions(): void {
    const g = this.game();
    const card = this.modalCard('Options');
    card.append(h('div', 'stats-line', `${g.batchesDone} brassins · ${g.totalSold} bouteilles vendues · ${moneyInt(g.totalRevenue)}`));
    const fresh = this.btn('btn bad', 'Nouvelle partie', () => {
      if (fresh.dataset.confirm) {
        this.closeModal();
        this.cb.newGame();
        return;
      }
      fresh.dataset.confirm = '1';
      fresh.textContent = 'Sûr ? Ta brasserie sera effacée. Toucher pour confirmer';
    });
    // Accélération du temps : réservée aux tests (elle fausserait l'équilibrage du jeu).
    const speed = h('div', 'card');
    const chips = h('div', 'chips');
    for (const v of [1, 2, 4, 10]) {
      const c = this.btn(`chip${this.cb.getSpeed() === v ? ' active' : ''}`, `×${v}`, () => {
        this.cb.setSpeed(v);
        chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
      });
      chips.append(c);
    }
    speed.append(h('div', 'section-title', 'Mode test : vitesse'), chips);
    card.append(speed, fresh, this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  private modalCard(title: string): HTMLElement {
    this.computer = null;
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', title), this.btn('icon-btn small', '✕', () => this.closeModal()));
    card.append(head);
    this.modal.append(card);
    return card;
  }

  private closeModal(): void {
    this.computer = null;
    this.modal.classList.add('hidden');
    this.modal.replaceChildren();
  }

  get modalOpen(): boolean {
    return !this.modal.classList.contains('hidden');
  }

  // ------------------------------------------------------------------ Gaston

  private renderMentor(): void {
    const g = this.game();
    const tips: Record<number, { text: string; action?: string }> = {
      0: { text: 'Salut, moi c\'est Gaston ! Le malt entre en haut, la bière sort en bas. J\'ai réglé les machines pour ma blonde.', action: 'Continuer' },
      1: { text: 'Touche une machine pour la régler.' },
      2: { text: 'Appuie sur « Brasser » pour lancer ton premier brassin.' },
      3: { text: 'Je t\'aide pour celui-ci : ça ira vite. On goûte à la première bouteille !' },
      4: { text: 'Glisse l\'écran : au stockage, l\'ordinateur reçoit les commandes ; au bar, branche des fûts. Bonne brasse !', action: 'Compris' },
    };
    const tip = this.modalOpen || this.openSheet?.kind === 'brew' ? undefined : tips[g.tips];
    this.mentor.classList.toggle('hidden', !tip);
    if (!tip) return;
    const key = `${g.tips}`;
    if (key === this.mentorKey) return;
    this.mentorKey = key;
    const body = this.mentor.querySelector('.mentor-body')!;
    body.replaceChildren(h('strong', 'mentor-name', 'Gaston'), h('p', 'mentor-text', tip.text));
    if (tip.action) body.append(this.btn('btn primary small', tip.action, () => {
      g.tips++;
      this.mentorKey = '';
      this.renderMentor();
    }));
  }

  // ------------------------------------------------------------------ notifications

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3000);
  }
}
