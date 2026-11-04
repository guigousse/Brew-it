import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { MAX_TANKS, SALE_SOURCES, TANK_STAGES, type Beer, type Format, type Game, type Order, type SaleSource } from '../core/game';
import { AD, BAR, BAR_EVENTS, kegGlasses, kegLiters, PARTY, SHOP_ITEMS, type BarEventId, type ShopItemId } from '../core/market';
import { CLIENT_TYPES, COMPUTERS, KIND_LABEL, orderAsk, wholesalePrice } from '../core/orders';
import { stars, trendById, trendsOf } from '../core/trends';
import { BREWERY_NAMES, MAX_LEVEL, STATION_ORDER, STATIONS, upgradeCost, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
import { drawLabel } from '../render/labelArt';
import { BOTTLE_SCALE, drawCrate, drawShelfBottle, LABEL_SPOT, type ShelfBottleKind } from '../render/bottleArt';
import { BarRoom, drawKeg, StorageRoom } from '../render/rooms';
import { extendBackdrop } from '../render/extend';
import { iconCanvas, type IconId } from '../render/icons';
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

/** Bouton d'action rond : une icône, une pastille d'info, un petit nom dessous. */
/** Petit bouton d'action carré, une icône en pixel art au centre, une pastille d'info dans le coin. */
function fab(icon: IconId, label: string): HTMLButtonElement {
  const b = h('button', 'act');
  b.append(iconCanvas(icon, 2), h('span', 'fab-badge hidden'));
  b.setAttribute('aria-label', label);
  return b;
}

function upBtn(label: string): HTMLButtonElement {
  const b = h('button', 'act up');
  b.append(iconCanvas('up', 1));
  b.setAttribute('aria-label', label);
  return b;
}

/** Nom de la pièce en haut à gauche, précédé de son bouton d'amélioration. */
function roomTitle(up: HTMLButtonElement, plaque: HTMLElement): HTMLElement {
  const el = h('div', 'room-title');
  el.append(up, plaque);
  return el;
}

/** Ce qu'on affiche à la place d'un temps quand la file ne se videra pas. */
const BLOCKED_TEXT: Record<'storage' | 'money' | 'slow', string> = { storage: '⏸ stockage plein', money: '⏸ fonds insuffisants', slow: 'plus de 24 h' };

/** Explication sous la production restante quand la file va se bloquer. */
function blockedHint(res: { ends: number[]; blocked: 'storage' | 'money' | 'slow' | null }, format?: Format): string {
  const n = res.ends.length;
  const after = `La file se bloque après ${n} brassin${n > 1 ? 's' : ''}`;
  if (res.blocked === 'storage') {
    return format === 'keg'
      ? `${after} : le stockage sera plein de fûts. Ils ne partent qu'au bar, par les commandes de fûts ou pendant un événement : programme moins de fûts, ou agrandis le stockage.`
      : `${after} : le stockage sera plein. Livre des commandes, vends au grossiste ou agrandis le stockage.`;
  }
  if (res.blocked === 'money') return `${after} : il n'y aura plus de quoi payer les ingrédients.`;
  return 'La file entière prendra plus de 24 h.';
}

/** Icône de chaque événement du bar. */
const EVENT_ICON: Record<BarEventId, IconId> = { party: 'disco', darts: 'darts', foot: 'ball' };
const ITEM_ICON: Record<ShopItemId, IconId> = { disco: 'disco', darts: 'darts', tv: 'tv' };

function setFab(b: HTMLButtonElement, badge: string, state: '' | 'ready' | 'alert', aria: string): void {
  const el = b.querySelector<HTMLElement>('.fab-badge')!;
  if (el.textContent !== badge) el.textContent = badge;
  el.classList.toggle('hidden', !badge);
  b.classList.toggle('ready', state === 'ready');
  b.classList.toggle('alert', state === 'alert');
  if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
}

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
/** Ce que montre l'écran : une des pièces, ou une page (tableau de bord, magasin). */
export type View = RoomId | 'dashboard' | 'shop';
type PageId = Exclude<View, RoomId>;
/** Onglets de la barre de navigation, de gauche à droite. */
const TABS: readonly { id: View; name: string; icon: string }[] = [
  { id: 'dashboard', name: 'Tableau de bord', icon: '📊' },
  { id: 'workshop', name: 'Atelier', icon: '⚗️' },
  { id: 'storage', name: 'Stockage', icon: '📦' },
  { id: 'bar', name: 'Bar', icon: '🍺' },
  { id: 'shop', name: 'Magasin', icon: '🛒' },
];
const isRoom = (v: View): v is RoomId => ROOMS.some((r) => r.id === v);

/** Couleur de chaque source de ventes dans le graphique (palette validée sur le fond des panneaux). */
const SOURCE: Record<SaleSource, { name: string; color: string }> = {
  bar: { name: 'Bar', color: '#b8862a' },
  orders: { name: 'Commandes', color: '#3f88d4' },
  wholesale: { name: 'Grossiste', color: '#d45c8e' },
};

type PcTab = 'orders' | 'trends' | 'wholesale';
type SheetState = { kind: 'station'; id: StationId } | { kind: 'brew' | 'range' | 'storage' | 'storageUp' | 'bar' | 'barUp' };

const starText = (p: number) => {
  const n = stars(p);
  return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n));
};

/** Temps restant façon chrono : m:ss, ou h:mm:ss au-delà d'une heure. */
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
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
  private moneyPill = h('div', 'money');
  /** Gains de l'absence à récolter : une petite bourse sous l'argent, qu'on touche quand on veut. */
  private harvest = h('button', 'harvest hidden');
  /** Compteur d'argent qui défile après une récolte. */
  private moneyAnim: { from: number; to: number; start: number } | null = null;
  private stage = h('main', 'stage');
  private sceneWrap = h('div', 'scene-wrap');
  private overlays = new Map<StationId, { btn: HTMLButtonElement; label: HTMLElement; bar: HTMLElement; text: HTMLElement }>();
  private tasteBtn = h('button', 'taste-btn hidden', '🍺 Goûter');
  /** Plaque du niveau de la brasserie, en haut à gauche de la scène. */
  private plaque = h('button', 'map-btn plaque');
  private announcedTaste = -1;
  /** Bas de l'écran : les actions de la pièce (sous-menu), puis la barre de navigation. */
  private dock = h('div', 'dock');
  /** Actions de la pièce : des boutons ronds flottants en bas à droite, l'action principale en dessous. */
  private fabs = h('div', 'fabs');
  private tabbar = h('nav', 'tabbar');
  private brewBtn = fab('brew', 'Brasser');
  private rangeBtn = fab('range', 'Ma gamme');
  private eventsBtn = fab('events', 'Événements');
  /** Bouton d'amélioration (flèche vers le haut) à gauche du nom de chaque pièce. */
  private ups: Record<RoomId, HTMLButtonElement> = { workshop: upBtn('Améliorer la brasserie'), storage: upBtn('Agrandir le stockage'), bar: upBtn('Agrandir le bar') };
  private shopKey = '';
  private computerHit?: HTMLButtonElement;
  // --- les pièces
  readonly storageRoom = new StorageRoom();
  readonly barRoom = new BarRoom();
  private room: RoomId = 'workshop';
  private view: View = 'workshop';
  private navTabs = new Map<View, { btn: HTMLButtonElement; badge: HTMLElement }>();
  /** Pages hors des pièces : le tableau de bord et le magasin. */
  private pages: Record<PageId, HTMLElement> = { dashboard: h('section', 'room page'), shop: h('section', 'room page') };
  private dashAt = -1;
  /** Minute survolée dans le graphique des ventes (index dans les 60 dernières). */
  private dashPick: number | null = null;
  private track = h('div', 'rooms-track');
  private wraps: HTMLElement[] = [];
  /**
   * Chaque pièce est entière à l'écran ; autour, son décor est prolongé jusqu'aux bords (ext) pour qu'il n'y ait
   * pas de bandes noires, quel que soit le format de l'écran.
   */
  private views: { view: HTMLElement; ext: HTMLCanvasElement; src: { backdrop(g: Game): HTMLCanvasElement | undefined }; key: string; bg?: HTMLCanvasElement }[] = [];
  /** Taille de l'écran d'une pièce en pixels natifs, et position de la pièce dedans. */
  private viewBox = { w: SCENE_W, h: SCENE_H, ox: 0, oy: 0 };
  private storageWrap = h('div', 'scene-wrap');
  private barWrap = h('div', 'scene-wrap');
  private roomHits: { el: HTMLButtonElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
  private storagePlaque = h('button', 'map-btn plaque');
  private barPlaque = h('button', 'map-btn plaque');
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
  /** Assistant « Brasser » : étape en cours et choix faits (null : la file des brassins). */
  private wiz: { step: 'beer' | 'format' | 'count' | 'trial'; beerId: number | null; format: Format; count: number } | null = null;
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
    const pill = this.moneyPill;
    pill.append(h('span', 'coin'), this.moneyEl);
    this.harvest.onclick = () => this.collectOffline();
    const opts = h('button', 'icon-btn', '⚙');
    opts.setAttribute('aria-label', 'Options');
    opts.onclick = () => this.openOptions();
    this.header.append(logo, pill, opts);
    for (const t of TABS) {
      const btn = h('button', 'nav-tab');
      btn.setAttribute('aria-label', t.name);
      const badge = h('span', 'room-badge hidden');
      btn.append(h('span', 'nav-icon', t.icon), h('span', 'nav-name', t.name), badge);
      btn.onclick = () => this.goView(t.id);
      this.tabbar.append(btn);
      this.navTabs.set(t.id, { btn, badge });
    }
    this.dock.append(this.tabbar);

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
    this.ups.workshop.onclick = () => this.openBrewery();
    this.sceneWrap.append(roomTitle(this.ups.workshop, this.plaque), this.tasteBtn);

    // stockage : rayonnages et ordinateur
    this.storageWrap.append(this.storageRoom.canvas);
    for (const hit of this.storageRoom.hits()) {
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', hit.id === 'computer' ? 'Ordinateur des commandes' : 'Rayonnages');
      el.onclick = () => (hit.id === 'computer' ? this.openComputer() : this.open({ kind: 'storage' }));
      if (hit.id === 'computer') this.computerHit = el;
      this.storageWrap.append(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    this.storagePlaque.onclick = () => this.open({ kind: 'storageUp' });
    this.ups.storage.onclick = () => this.open({ kind: 'storageUp' });
    this.storageWrap.append(roomTitle(this.ups.storage, this.storagePlaque));
    // bar : le comptoir
    this.barWrap.append(this.barRoom.canvas);
    const counter = this.barRoom.hits(1)[0]!;
    const counterEl = h('button', 'station-hit');
    counterEl.setAttribute('aria-label', 'Comptoir');
    counterEl.onclick = () => this.open({ kind: 'bar' });
    this.barWrap.append(counterEl);
    this.roomHits.push({ el: counterEl, rect: counter.rect });
    this.barPlaque.onclick = () => this.open({ kind: 'barUp' });
    this.ups.bar.onclick = () => this.open({ kind: 'barUp' });
    this.barWrap.append(roomTitle(this.ups.bar, this.barPlaque));
    // Le défilé des écrans suit l'ordre des onglets : tableau de bord, les trois pièces, magasin.
    const wraps: Record<RoomId, HTMLElement> = { workshop: this.sceneWrap, storage: this.storageWrap, bar: this.barWrap };
    const srcs = { workshop: this.scene, storage: this.storageRoom, bar: this.barRoom };
    for (const t of TABS) {
      if (!isRoom(t.id)) {
        this.track.append(this.pages[t.id]);
        continue;
      }
      const pane = h('div', 'room');
      const view = h('div', 'room-view');
      const ext = h('canvas', 'room-ext');
      view.append(ext, wraps[t.id]);
      pane.append(view);
      this.track.append(pane);
      this.wraps.push(wraps[t.id]);
      this.views.push({ view, ext, src: srcs[t.id], key: '' });
    }
    this.track.style.width = `${TABS.length * 100}vw`;
    this.stage.append(this.track);
    this.bindSwipe();

    // barre du bas : ses boutons changent selon la pièce
    this.rangeBtn.onclick = () => this.open({ kind: 'range' });
    this.brewBtn.onclick = () => this.open({ kind: 'brew' });
    this.eventsBtn.onclick = () => this.openEvents();
    this.setBottom();

    // Gaston
    const av = h('canvas', 'mentor-avatar');
    drawGaston(av);
    this.mentor.append(av, h('div', 'mentor-body'));

    root.append(this.header, this.stage, this.fabs, this.harvest, this.mentor, this.sheet, this.dock, this.modal, this.toasts);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // ------------------------------------------------------------------ mise en page

  /**
   * Chaque pièce tient entière entre le header et la barre du bas, agrandie autant que possible.
   * La place qui reste (sur les côtés, ou en haut et en bas selon le format de l'écran) est remplie
   * par le décor de la pièce, prolongé : pas de défilement, pas de bandes noires.
   */
  layout(): void {
    const top = this.header.getBoundingClientRect().bottom;
    const bottom = this.dock.getBoundingClientRect().top;
    const availW = window.innerWidth;
    const availH = Math.max(100, bottom - top);
    this.scale = Math.min(availW / SCENE_W, availH / SCENE_H);
    const w = Math.floor(SCENE_W * this.scale);
    const hh = Math.floor(SCENE_H * this.scale);
    // l'écran de la pièce, en pixels natifs : la pièce au centre, le décor prolongé autour
    const vw = Math.ceil(availW / this.scale);
    const vh = Math.ceil(availH / this.scale);
    const ox = Math.floor((vw - SCENE_W) / 2);
    const oy = Math.floor((vh - SCENE_H) / 2);
    this.viewBox = { w: vw, h: vh, ox, oy };
    for (const v of this.views) {
      Object.assign(v.view.style, { width: `${vw * this.scale}px`, height: `${vh * this.scale}px` });
      Object.assign(v.ext.style, { width: `${vw * this.scale}px`, height: `${vh * this.scale}px` });
    }
    for (const wrap of this.wraps) Object.assign(wrap.style, { width: `${w}px`, height: `${hh}px`, left: `${ox * this.scale}px`, top: `${oy * this.scale}px` });
    this.syncBackdrops();
    for (const c of [this.scene.canvas, this.storageRoom.canvas, this.barRoom.canvas]) Object.assign(c.style, { width: `${w}px`, height: `${hh}px` });
    const s = this.scale;
    for (const { el, rect } of this.roomHits) Object.assign(el.style, { left: `${rect.x * s}px`, top: `${rect.y * s}px`, width: `${rect.w * s}px`, height: `${rect.h * s}px` });
    this.syncKegHits(true);
    this.placeTrack();
    this.stage.style.top = `${top}px`;
    this.stage.style.bottom = `${window.innerHeight - bottom}px`;
    this.root.style.setProperty('--bottom-h', `${window.innerHeight - bottom}px`);
    this.root.style.setProperty('--top-h', `${top}px`);
    this.laidOut = `${top}|${bottom}|${window.innerWidth}`;
  }
  private laidOut = '';

  // ------------------------------------------------------------------ boucle d'affichage

  /** Redessine le décor prolongé d'une pièce quand son décor change (niveau) ou que l'écran change de taille. */
  private syncBackdrops(): void {
    const g = this.game();
    const { w, h: vh, ox, oy } = this.viewBox;
    const size = `${w}x${vh}`;
    for (const v of this.views) {
      const bg = v.src.backdrop(g);
      if (!bg || (bg === v.bg && v.key === size)) continue;
      v.bg = bg;
      v.key = size;
      extendBackdrop(bg, v.ext, w, vh, ox, oy);
    }
  }

  frame(t: number): void {
    const g = this.game();
    this.syncBackdrops();
    if (this.moneyAnim) {
      const a = this.moneyAnim;
      const k = Math.min(1, (performance.now() - a.start) / 900);
      const v = a.from + (a.to - a.from) * (1 - (1 - k) ** 3);
      this.moneyEl.textContent = moneyInt(k >= 1 ? g.money : v);
      if (k >= 1) {
        this.moneyAnim = null;
        this.moneyPill.classList.remove('gain');
      }
    }
    // On ne dessine que la pièce affichée (et ses voisines pendant un glissement).
    const all = !!this.swipe?.on || performance.now() < this.roomsDrawUntil;
    if (all || this.view === 'storage') this.storageRoom.draw(g, t);
    if (all || this.view === 'bar') this.barRoom.draw(g, t);
    if (!all && this.view !== 'workshop') return;
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
      const all = g.batchesAt(id);
      const many = g.tankCount(id) > 1 ? all.length : 0;
      // temps restant de l'étape (avec plusieurs cuves : celle qui finit la première)
      const running = all.filter((b) => !b.waiting);
      const left = running.length ? Math.min(...running.map((b) => b.duration - b.elapsed)) : 0;
      o.text.textContent = batch
        ? id === 'bottling' && g.bottlingBlocked ? 'Stockage plein ⏸'
        : id === 'bottling' && g.tastable === batch ? 'À goûter ⏸'
        : many > 1 ? `${STATIONS[id].step} · ${many} cuves${running.length ? ` · ${clock(left)}` : ''}`
        : batch.waiting ? `${STATIONS[id].step} ⏸` : `${STATIONS[id].step} · ${clock(left)}`
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
    if (!this.moneyAnim) this.moneyEl.textContent = moneyInt(g.money);
    const off = g.offline;
    if (off && off.earned <= 0) g.collectOffline(); // rien à récolter : on n'en parle pas
    const earned = g.offline?.earned ?? 0;
    this.harvest.classList.toggle('hidden', earned <= 0);
    if (earned > 0) {
      const text = `+${moneyShort(earned)}`;
      if (this.harvest.dataset.text !== text) {
        this.harvest.dataset.text = text;
        this.harvest.replaceChildren(h('span', 'harvest-bag', '💰'), h('span', 'harvest-value', text));
        this.harvest.setAttribute('aria-label', `Récolter ${moneyInt(earned)} gagnés pendant ton absence`);
      }
    }
    this.plaque.textContent = `★ ${g.breweryLevel} · ${g.breweryName}`;
    const can = g.canBrew();
    const trial = g.tastable;
    // pastilles des boutons d'action : l'essentiel en un coup d'œil ; « ready » = il y a quelque chose à faire
    setFab(this.brewBtn, g.planned ? String(g.planned) : '', can.ok && !g.planned ? 'ready' : '',
      g.planned ? `Brasser : ${g.planned} programmé${g.planned > 1 ? 's' : ''}` : 'Brasser');
    setFab(this.rangeBtn, trial ? '!' : '', trial ? 'alert' : '', `Ma gamme : ${g.beers.length}/${g.rangeSlots}`);
    const ready = g.readyOrders.length;
    const emptyTap = g.taps.some((t) => t.glasses <= 0);
    const kegsReady = g.beers.some((b) => b.kegs.length > 0);
    this.syncKegHits();
    const nextBar = BAR[g.barLevel];
    const eventReady = !g.partying && g.time >= g.partyReadyAt;
    setFab(this.eventsBtn, g.partying ? clock(g.partyUntil - g.time) : '', g.partying ? 'alert' : '', g.partying ? `${g.barEvent.name} en cours` : 'Événements');
    this.eventsBtn.classList.toggle('dim', !g.partying && !eventReady);
    // améliorations possibles : la flèche brille
    const stationUp = STATION_ORDER.some((id) => g.level(id) < MAX_LEVEL && g.money >= g.upgradeCost(id));
    const nextStore = STORAGE[g.storageLevel];
    this.ups.workshop.classList.toggle('alert', stationUp);
    this.ups.storage.classList.toggle('alert', !!nextStore && g.money >= nextStore.cost);
    this.ups.bar.classList.toggle('alert', !!nextBar && g.money >= nextBar.cost);
    // l'ordinateur (l'enveloppe est dessinée sur son écran) : son nom dit les commandes en attente
    this.computerHit?.setAttribute('aria-label', `Ordinateur : ${g.orders.length} commande${g.orders.length > 1 ? 's' : ''}${ready ? `, ${ready} à livrer` : ''}`);
    this.fabs.classList.toggle('hidden', !isRoom(this.view) || !!this.openSheet);
    this.storagePlaque.textContent = `▣ ${STORAGE[g.storageLevel - 1]!.name}`;
    this.barPlaque.textContent = `★ ${g.barLevel} · ${g.bar.name}`;
    // pastilles des onglets de pièces
    const badges: Record<RoomId, string> = {
      workshop: trial ? '🍺' : '',
      storage: g.orders.length ? String(g.orders.length) : g.storageFull ? '!' : '',
      bar: g.partying ? '🎉' : emptyTap && kegsReady ? '!' : '', // un fût à changer, et de quoi le remplacer
    };
    for (const [id, tab] of this.navTabs) {
      const badge = isRoom(id) ? badges[id] : '';
      tab.btn.classList.toggle('active', id === this.view);
      tab.badge.textContent = badge;
      tab.badge.classList.toggle('hidden', !badge);
      tab.badge.classList.toggle('hot', id === 'storage' ? ready > 0 || g.storageFull : !!badge);
    }
    this.renderPage();
    this.tasteBtn.classList.toggle('hidden', !trial || this.modalOpen || this.view !== 'workshop');
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
    const key = `${this.header.getBoundingClientRect().bottom}|${this.dock.getBoundingClientRect().top}|${window.innerWidth}`;
    if (key !== this.laidOut) this.layout();
  }

  // ------------------------------------------------------------------ panneaux

  open(s: NonNullable<App['openSheet']>): void {
    const same = this.openSheet && this.openSheet.kind === s.kind && (s.kind !== 'station' || (this.openSheet as { id?: string }).id === s.id);
    this.openSheet = same ? null : s;
    this.scene.selected = this.openSheet?.kind === 'station' ? this.openSheet.id : null;
    this.sheetKey = '';
    this.wiz = null;
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
    this.fabs.classList.toggle('hidden', !!s || !isRoom(this.view));
    if (!s) return;
    const key = JSON.stringify([
      s, g.level(s.kind === 'station' ? s.id : 'mill'), s.kind === 'station' ? g.tankCount(s.id) : 0, g.beers.map((b) => [b.id, b.stock, b.name]), g.tastable?.id ?? 0, g.selectedBeer,
      g.batchLiters, s.kind === 'brew' ? [g.canBrew().ok, g.roomForBatch, g.queued, g.broke] : 0, s.kind === 'bar' || s.kind === 'barUp' ? [g.taps, g.beers.map((b) => [b.kegs.length, Math.round(b.pop * 100)]), g.barLevel] : 0, s.kind === 'brew' ? [g.plan, g.planCap, this.wiz, g.selectedBeer, g.beers.map((b) => b.kegs.length), this.planStatus(g)] : 0,
      s.kind === 'storage' || s.kind === 'storageUp' ? [Math.round(g.productionRate()), g.beers.map((b) => b.kegs.length)] : 0, s.kind === 'range' ? g.beers.map((b) => Math.round(b.pop * 20)) : 0, g.rangeSlots, g.storageLevel, g.bottlingBlocked, this.shelfSel,
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
    if (s.kind === 'storageUp') this.storageUpSheet(g);
    const body = this.sheet.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
    const shelf = this.sheet.querySelector('.shelf');
    if (shelf) shelf.scrollLeft = shelfScroll;
  }

  /** Met à jour sans reconstruire ce qui dépend de l'argent. */
  private refreshLive(): void {
    const g = this.game();
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => (b.disabled = g.money < Number(b.dataset.cost)));
    this.sheet.querySelectorAll<HTMLElement>('[data-eta]').forEach((el) => (el.textContent = clock(Number(el.dataset.eta) - g.time)));
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

  // --- Brasser : la file des brassins programmés, et un assistant en 3 étapes pour en ajouter

  private brewSheet(g: Game): void {
    // pas encore de bière dans la gamme : on commence par un essai
    if (!g.beers.length) this.wiz = { step: 'trial', beerId: null, format: 'bottle', count: 1 };
    const w = this.wiz;
    if (!w) return this.queueView(g);
    const beer = w.beerId != null ? g.beer(w.beerId) : undefined;
    if (w.step !== 'trial' && w.step !== 'beer' && !beer) {
      this.wiz = null;
      return this.queueView(g);
    }
    const body = this.frameSheet(w.step === 'trial' ? 'Nouvel essai' : 'Programmer des brassins');
    if (w.step !== 'trial') body.append(this.wizSteps(w.step));
    else if (g.beers.length) body.append(this.btn('btn small wiz-back', '‹ Retour', () => this.wizGo('beer')));
    if (w.step === 'trial') this.trialStep(g, body);
    if (w.step === 'beer') this.beerStep(g, body);
    if (w.step === 'format' && beer) this.formatStep(g, body, beer);
    if (w.step === 'count' && beer) this.countStep(g, body, beer, w.format);
  }

  /** Prévisions de production en cache (avec ou sans brassins en plus) : refaites quand la file change, ou toutes les 10 s. */
  private fcCache = new Map<string, { key: string; at: number; real: number; res: ReturnType<Game['forecast']> }>();

  private forecast(g: Game, extra?: { beerId: number; format: Format; count: number }): { at: number; res: ReturnType<Game['forecast']> } | null {
    if (!g.planned && !g.batches.some((b) => b.beerId != null) && !extra) return null;
    const slot = extra ? 'extra' : 'file';
    const key = JSON.stringify([g.plan, g.batches.length, extra ?? null]);
    const c = this.fcCache.get(slot);
    if (c && c.key === key && performance.now() - c.real < 10000) return c;
    const fresh = { key, at: g.time, real: performance.now(), res: g.forecast(extra) };
    this.fcCache.set(slot, fresh);
    return fresh;
  }

  /** Compte à rebours jusqu'à la fin du brassin n° i de la prévision (mis à jour en direct). */
  private etaEl(fc: { at: number; res: ReturnType<Game['forecast']> }, i: number, cls = ''): HTMLElement {
    const el = h('span', `eta ${cls}`);
    const end = fc.res.ends[i];
    if (end == null) {
      // ce brassin ne sortira pas : la file se bloque avant (ou ça prend plus de 24 h)
      el.textContent = BLOCKED_TEXT[fc.res.blocked ?? 'slow'];
      el.classList.add('blocked');
      return el;
    }
    el.dataset.eta = String(fc.at + end);
    el.textContent = clock(fc.at + end - this.game().time);
    return el;
  }

  private refreshSheet(): void {
    this.sheetKey = '';
    this.renderSheet();
  }

  private wizGo(step: NonNullable<App['wiz']>['step'] | null, patch: Partial<NonNullable<App['wiz']>> = {}): void {
    this.wiz = step == null ? null : { ...(this.wiz ?? { beerId: null, format: 'bottle', count: 1 }), ...patch, step };
    this.sheetKey = '';
    this.renderSheet();
    this.sheet.querySelector('.sheet-body')?.scrollTo(0, 0);
  }

  /** Fil d'Ariane de l'assistant : 1 Bière › 2 Format › 3 Nombre (on peut revenir en arrière). */
  private wizSteps(step: 'beer' | 'format' | 'count'): HTMLElement {
    const row = h('div', 'wiz-steps');
    const order = ['beer', 'format', 'count'] as const;
    const at = order.indexOf(step);
    row.append(this.btn('btn small wiz-back', '‹', () => this.wizGo(at === 0 ? null : order[at - 1]!)));
    order.forEach((id, i) => {
      const el = this.btn(`wiz-step${i === at ? ' active' : i < at ? ' done' : ''}`, `${i + 1}. ${['Bière', 'Format', 'Nombre'][i]}`, () => i < at && this.wizGo(id));
      el.disabled = i > at;
      row.append(el);
    });
    return row;
  }

  /** Ce qui retient le prochain brassin programmé (rien : il part). */
  private planStatus(g: Game): string {
    const head = g.plan[0];
    const b = head && g.beer(head.beerId);
    if (!head || !b) return '';
    const cost = g.brewCost(b.recipe, g.batchLiters, head.format);
    if (g.money < cost && !g.broke) return `⏸ Il manque ${moneyInt(cost - g.money)}`;
    if (!g.roomFor(head.format)) return '⏸ Stockage plein';
    return '';
  }

  /** La file : les groupes de brassins, dans l'ordre où ils partiront. */
  private queueView(g: Game): void {
    const body = this.frameSheet('Brasser');
    if (g.tastable) body.append(this.btn('btn primary', '🍺 Un essai attend : goûter', () => this.openTasting()));
    body.append(this.btn('btn primary big', '+ Programmer des brassins', () => this.wizGo('beer', { beerId: null, format: 'bottle', count: 1 })));
    // la file et sa capacité
    const head = h('div', 'beer-head');
    head.append(h('span', 'section-title', 'File des brassins'), h('span', 'stats-line', `${g.planned}/${g.planCap}`));
    const bar = h('div', 'progress');
    const fill = h('div', 'progress-fill');
    fill.style.width = `${Math.min(100, (g.planned / g.planCap) * 100)}%`;
    bar.append(fill);
    body.append(head, bar);
    // temps de production restant : les brassins sur la ligne, puis toute la file
    const fc = this.forecast(g);
    const inLine = g.batches.filter((b) => b.beerId != null).length;
    if (fc && (fc.res.ends.length || !fc.res.done)) {
      const eta = h('div', 'eta-total');
      eta.append(h('span', '', '⏱ Production restante'), this.etaEl(fc, fc.res.done ? fc.res.ends.length - 1 : -1, 'big'));
      body.append(eta);
      if (!fc.res.done) body.append(h('p', 'note bad', blockedHint(fc.res, g.plan[0]?.format)));
    }
    if (!g.plan.length) body.append(h('p', 'hint', inLine ? 'Aucun autre brassin programmé.' : 'Aucun brassin programmé : la brasserie est à l\'arrêt.'));
    const list = h('div', 'plan-list');
    g.plan.forEach((p, i) => {
      const b = g.beer(p.beerId);
      if (!b) return;
      const card = h('div', `card plan-card${i === 0 ? ' banner' : ''}`);
      const top = h('div', 'plan-top');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      const name = h('div', 'plan-name');
      name.append(h('span', 'stock-name', b.name), h('span', 'stats-line', p.format === 'keg' ? '🛢 Fûts' : '🍾 Bouteilles'));
      top.append(h('span', 'plan-rank', `${i + 1}.`), thumb, name, this.btn('icon-btn small', '✕', () => {
        g.unplan(i);
        this.refreshSheet();
      }));
      const ctl = h('div', 'plan-ctl');
      const up = this.btn('btn small', '▲', () => {
        g.movePlan(i, -1);
        this.refreshSheet();
      });
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Avancer dans la file');
      const down = this.btn('btn small', '▼', () => {
        g.movePlan(i, 1);
        this.refreshSheet();
      });
      down.disabled = i === g.plan.length - 1;
      down.setAttribute('aria-label', 'Reculer dans la file');
      ctl.append(this.stepper(p.count, 1, Math.max(1, g.planLimit(p.format, i)), (n) => {
        g.setPlanCount(i, n);
        this.refreshSheet();
      }), up, down);
      card.append(top, ctl);
      const foot = h('div', 'plan-foot');
      foot.append(h('span', 'note bad', i === 0 ? this.planStatus(g) : ''));
      // fin du dernier brassin de ce groupe
      const done = inLine + g.plan.slice(0, i + 1).reduce((n, x) => n + x.count, 0) - 1;
      if (fc) {
        const w = h('span', 'plan-eta');
        if (fc.res.ends[done] != null) w.append(h('span', '', 'prêt dans '));
        w.append(this.etaEl(fc, done));
        foot.append(w);
      }
      card.append(foot);
      list.append(card);
    });
    body.append(list);
  }

  /** Étape 1 : quelle bière ? */
  private beerStep(g: Game, body: HTMLElement): void {
    body.append(h('div', 'wiz-q', 'Quelle bière brasser\u00a0?'));
    const grid = h('div', 'pick-grid');
    for (const b of g.beers) {
      const card = h('button', 'card pick-card');
      const thumb = h('canvas', 'label-thumb pick-label');
      drawLabel(thumb, b.label, b.name);
      card.append(thumb, h('span', 'beer-name', b.name), h('span', 'stats-line', `${b.stock} btl · ${b.kegs.length} fût${b.kegs.length > 1 ? 's' : ''}`), h('span', 'pop-stars', starText(b.pop)));
      card.onclick = () => this.wizGo('format', { beerId: b.id });
      grid.append(card);
    }
    // un essai : les réglages actuels des machines, s'ils ne sont pas ceux d'une bière de la gamme
    const trial = h('button', 'card pick-card trial');
    trial.append(h('span', 'pick-icon', '🧪'), h('span', 'beer-name', 'Nouvel essai'), h('span', 'stats-line', g.selectedBeer == null ? 'Réglages actuels des machines' : 'Change un réglage d\'une machine d\'abord'));
    trial.disabled = g.selectedBeer != null;
    trial.onclick = () => this.wizGo('trial');
    grid.append(trial);
    body.append(grid);
  }

  /** Étape 2 : bouteilles ou fûts ? */
  private formatStep(g: Game, body: HTMLElement, beer: Beer): void {
    body.append(h('div', 'wiz-q', 'Bouteilles ou fûts\u00a0?'));
    const grid = h('div', 'pick-grid');
    for (const [f, name, use] of [['bottle', 'Bouteilles', 'Pour le stock et les commandes'], ['keg', 'Fûts', 'Pour les tireuses du bar']] as const) {
      const card = h('button', `card pick-card format${this.wiz?.format === f ? ' selected' : ''}`);
      card.setAttribute('aria-label', `${name} : ${use}`);
      card.append(this.beerVisual(beer, f), h('span', 'beer-name', name));
      card.onclick = () => this.wizGo('count', { format: f, count: Math.min(this.wiz?.count ?? 1, Math.max(1, g.planLimit(f))) });
      grid.append(card);
    }
    body.append(grid);
  }

  /** Étape 3 : combien de brassins ? Le visuel montre chaque brassin (une caisse ou un fût). */
  private countStep(g: Game, body: HTMLElement, beer: Beer, f: Format): void {
    const w = this.wiz!;
    // au plus : la place dans la file, et ce que le stockage peut recevoir
    const room = g.planLimit(f);
    const n = Math.max(1, Math.min(w.count, room || 1));
    body.append(h('div', 'wiz-q', 'Combien de brassins\u00a0?'));
    const visual = h('div', 'batch-visual');
    const side = h('div', 'batch-side');
    side.append(this.beerVisual(beer, f), h('span', 'stats-line', `${beer.name}`), h('span', 'stats-line', f === 'keg' ? 'Fûts' : 'Bouteilles'));
    visual.append(side, this.batchGrid(beer, f, n));
    body.append(visual);
    const row = h('div', 'count-row');
    row.append(this.stepper(n, 1, Math.max(1, room), (v) => this.wizGo('count', { count: v })));
    const chips = h('div', 'chips');
    for (const v of [1, 5, 10, 25, 50].filter((x) => x < room)) chips.append(this.btn(`chip${v === n ? ' active' : ''}`, String(v), () => this.wizGo('count', { count: v })));
    if (room > 1) chips.append(this.btn(`chip${n === room ? ' active' : ''}`, `Max ${room}`, () => this.wizGo('count', { count: room })));
    row.append(chips);
    body.append(row);
    // bilan
    const unit = g.brewCost(beer.recipe, g.batchLiters, f);
    const sum = h('div', 'card');
    const line = (k: string, v: string, cls = '') => {
      const r = h('div', `live-row ${cls}`);
      r.append(h('span', '', k), h('span', 'live-value', v));
      sum.append(r);
    };
    line('Production', this.batchOutput(g, f, n));
    line('Ingrédients', `${moneyInt(unit * n)} (${moneyInt(unit)} / brassin)`);
    line('Au plus', room < g.planRoom ? `${room} (place au stockage)` : `${room} (place dans la file)`);
    // quand ces brassins seraient prêts, après ceux déjà programmés
    const fc = this.forecast(g, { beerId: beer.id, format: f, count: n });
    if (fc) {
      const r = h('div', 'live-row');
      r.append(h('span', '', fc.res.done ? 'Prêts dans' : 'Prêts'), this.etaEl(fc, fc.res.done ? fc.res.ends.length - 1 : -1));
      sum.append(r);
      if (!fc.res.done) sum.append(h('p', 'note bad', blockedHint(fc.res, f)));
    }
    sum.append(h('p', 'hint', 'Payés au lancement de chaque brassin. Un brassin attend l\'argent et la place dont il a besoin.'));
    body.append(sum);
    const go = this.btn('btn primary big', room ? `Programmer ${n} brassin${n > 1 ? 's' : ''}` : g.planRoom ? 'Stockage plein' : 'File pleine', () => {
      const r = g.planBrew(beer.id, f, n);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      if (g.tips === 2 || g.tips === 1) g.tips = 3;
      this.toast(`${n} brassin${n > 1 ? 's' : ''} programmé${n > 1 ? 's' : ''}`, 'good');
      this.wizGo(null);
    });
    go.disabled = !room;
    body.append(go);
    if (!room) body.append(h('p', 'note bad', g.planRoom
      ? `Plus de place au stockage (en comptant les brassins déjà programmés). ${f === 'keg' ? 'Sers des fûts au bar, livre des commandes de fûts' : 'Livre des commandes, vends au grossiste'}, ou agrandis le stockage.`
      : `La file est pleine (${g.planCap} brassins). Elle s'allonge avec le niveau de la brasserie.`));
  }

  /** Un essai : les réglages actuels des machines ; on goûtera la première bouteille. */
  private trialStep(g: Game, body: HTMLElement): void {
    const card = h('div', 'card');
    const cost = g.brewCost(g.recipe, g.batchLiters, 'bottle');
    card.append(
      h('p', 'hint', 'Un brassin avec les réglages actuels des machines. On goûte la première bouteille, puis on décide de la garder dans la gamme.'),
      h('div', 'stats-line strong', `${this.batchOutput(g, 'bottle', 1)} · ${g.broke ? 'offert par Gaston' : moneyInt(cost)}`),
    );
    body.append(card);
    const can = g.canBrew();
    const busy = !!g.batchAt('mill');
    const label = g.queued ? 'En attente du moulin…' : can.ok ? (g.broke ? 'Brasser (offert par Gaston)' : 'Brasser l\'essai') : busy ? 'Brasser au prochain tour' : can.reason!;
    const go = this.btn('btn primary big', label, () => {
      const r = busy ? g.queueBrew() : g.brew();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      if (g.tips === 2 || g.tips === 1) g.tips = 3;
      this.toast(busy ? 'En file d\'attente' : 'Brassin lancé !', 'good');
      this.close();
    });
    go.disabled = g.queued || (!can.ok && !(busy && g.money >= cost));
    body.append(go);
  }

  /** Ce que donnent n brassins : bouteilles, ou fûts de x verres. */
  private batchOutput(g: Game, f: Format, n: number): string {
    if (f === 'bottle') return `${(Math.floor(g.batchLiters / 0.33) * n).toLocaleString('fr-FR')} btl`;
    const kl = kegLiters(g.batchLiters);
    const k = Math.floor(g.batchLiters / kl) * n;
    return `${k.toLocaleString('fr-FR')} fût${k > 1 ? 's' : ''} de ${kegGlasses(kl)} verres`;
  }

  /** −  n  + */
  private stepper(value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const el = h('div', 'stepper');
    const minus = this.btn('knob-btn', '−', () => onChange(Math.max(min, value - 1)));
    const plus = this.btn('knob-btn', '+', () => onChange(Math.min(max, value + 1)));
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    minus.setAttribute('aria-label', 'Moins');
    plus.setAttribute('aria-label', 'Plus');
    el.append(minus, h('span', 'stepper-value', `×${value}`), plus);
    return el;
  }

  /** La bière en grand : une bouteille étiquetée, ou un fût cerclé à sa couleur. */
  private beerVisual(beer: Beer, f: Format): HTMLElement {
    const box = h('div', 'beer-visual');
    if (f === 'bottle') {
      const bottle = h('div', 'shelf-bottle');
      const c = h('canvas', 'shelf-glass');
      drawShelfBottle(c, 'beer');
      const lab = h('canvas', 'shelf-label');
      drawLabel(lab, beer.label, beer.name);
      Object.assign(lab.style, { left: `${LABEL_SPOT.x * BOTTLE_SCALE}px`, top: `${LABEL_SPOT.y * BOTTLE_SCALE}px` });
      bottle.append(c, lab);
      box.append(bottle);
    } else {
      const c = h('canvas', 'keg-big');
      c.width = 24;
      c.height = 24;
      drawKeg(c.getContext('2d')!, 0, 0, 24, beer.label);
      box.append(c);
    }
    return box;
  }

  /** Les brassins en petit : une caisse (ou un fût) par brassin. */
  private batchGrid(beer: Beer, f: Format, n: number): HTMLElement {
    const box = h('div', 'batch-grid');
    const shown = Math.min(n, 40);
    const per = shown <= 16 ? 4 : 8;
    const cols = Math.min(shown, per);
    const rows = Math.ceil(shown / per);
    const S = 14;
    const zoom = shown <= 16 ? 3 : 2; // peu de brassins : on les montre plus gros
    const c = h('canvas', 'batch-canvas');
    c.width = cols * S;
    c.height = rows * S;
    c.style.width = `${cols * S * zoom}px`;
    c.style.height = `${rows * S * zoom}px`;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < shown; i++) {
      const x = (i % per) * S + 1;
      const y = Math.floor(i / per) * S + 1;
      if (f === 'keg') drawKeg(ctx, x, y, S - 2, beer.label);
      else drawCrate(ctx, x, y, S - 2, { beer, count: 12 });
    }
    box.append(c);
    if (n > shown) box.append(h('span', 'stats-line', `+ ${n - shown}`));
    return box;
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
    body.append(this.btn('btn small', '⬆ Agrandir le stockage', () => this.open({ kind: 'storageUp' })));
  }

  // --- Stockage : l'agrandir
  private storageUpSheet(g: Game): void {
    const lvl = STORAGE[g.storageLevel - 1]!;
    const body = this.frameSheet(`Agrandir le stockage`);
    const up = h('div', 'card upgrade');
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
    const body = this.frameSheet('Les fûts');
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

  /** Les événements du bar : la fête, puis ceux qu'on débloque en achetant des objets au magasin. */
  openEvents(): void {
    const g = this.game();
    if (this.view !== 'bar') this.goRoom('bar');
    const card = this.modalCard('Événements');
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    if (g.partying) card.append(h('div', 'note', `${g.barEvent.name} en cours · encore ${clock(g.partyUntil - g.time)}`));
    else if (g.time < g.partyReadyAt) card.append(h('div', 'hint', `Le quartier se repose : prochain événement dans ${duration(g.partyReadyAt - g.time)}`));
    card.append(
      h('p', 'hint', 'Pendant un événement, les fûts vides sont rebranchés tout seuls avec ceux du stockage.'),
      h('div', kegs ? 'stats-line strong' : 'note bad', `Fûts pleins au stockage : ${kegs}`),
    );
    const can = !g.partying && g.time >= g.partyReadyAt;
    for (const ev of BAR_EVENTS) {
      const el = h('div', 'card event-card');
      const head = h('div', 'event-head');
      const title = h('div', 'event-title');
      title.append(h('span', 'beer-name', ev.name), h('span', 'hint', ev.text));
      head.append(iconCanvas(EVENT_ICON[ev.id], 2), title);
      el.append(head);
      const item = ev.needs ? SHOP_ITEMS.find((x) => x.id === ev.needs) : undefined;
      if (item && !g.owns(item.id)) {
        el.classList.add('locked');
        el.append(this.btn('btn small', `🔒 Achète « ${item.name} » au magasin`, () => {
          this.closeModal();
          this.goView('shop');
        }));
      } else {
        const cost = g.eventCost(ev.id);
        const go = this.btn('btn primary', `Lancer · ${moneyInt(cost)}`, () => {
          const r = g.startEvent(ev.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${ev.name} : c'est parti !`, 'good');
          this.onSent?.();
          this.closeModal();
        });
        go.disabled = !can || g.money < cost;
        el.append(go);
      }
      card.append(el);
    }
    card.append(this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  // ------------------------------------------------------------------ ordinateur des commandes

  /** L'ordinateur du stockage : le tableau des commandes, les tendances et le grossiste. */
  openComputer(tab: PcTab = 'orders'): void {
    if (this.view !== 'storage') this.goRoom('storage');
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
      this.gainToast(r.amount!);
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
          this.gainToast(r.amount!);
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
    this.goView(id);
  }

  /** Un écran : une pièce ou une page (onglet de la barre de navigation, ou glissement). */
  goView(v: View): void {
    if (v === this.view) return;
    this.view = v;
    if (isRoom(v)) this.room = v;
    this.close();
    this.storageRoom.selected = null;
    this.barRoom.selected = null;
    if (v === 'dashboard') {
      this.dashAt = -1;
      this.dashPick = null;
    }
    this.roomsDrawUntil = performance.now() + 600;
    this.placeTrack();
    this.setBottom();
    this.update();
  }

  /** Une zone tactile par fût de la cave : toucher un fût permet de le changer. */
  private kegKey = '';
  private syncKegHits(force = false): void {
    const g = this.game();
    const n = g.taps.length;
    const key = `${n}|${g.partying}`;
    if (!force && this.kegKey === key) return;
    this.kegKey = key;
    for (const el of this.kegHits) {
      el.remove();
      this.roomHits = this.roomHits.filter((r) => r.el !== el);
    }
    this.kegHits = [];
    for (const hit of this.barRoom.hits(n, g.partying).slice(1)) {
      const el = h('button', 'station-hit');
      if (hit.id.startsWith('keg')) {
        el.setAttribute('aria-label', `Fût de la tireuse ${Number(hit.id.slice(3)) + 1} : les fûts`);
        el.onclick = () => this.open({ kind: 'bar' });
      } else {
        el.setAttribute('aria-label', `${g.barEvent.name} : événements`);
        el.onclick = () => this.openEvents();
      }
      this.barWrap.append(el);
      this.kegHits.push(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    const s = this.scale;
    for (const { el, rect } of this.roomHits) Object.assign(el.style, { left: `${rect.x * s}px`, top: `${rect.y * s}px`, width: `${rect.w * s}px`, height: `${rect.h * s}px` });
  }

  private get viewIndex(): number {
    return TABS.findIndex((t) => t.id === this.view);
  }

  private placeTrack(dx = 0): void {
    this.track.style.transform = `translateX(calc(${-this.viewIndex * 100}vw + ${dx}px))`;
  }

  /** Les boutons flottants proposent les actions de la pièce affichée (l'action principale en bas). */
  private setBottom(): void {
    const btns = this.view === 'workshop' ? [this.rangeBtn, this.brewBtn] : this.view === 'bar' ? [this.eventsBtn] : [];
    this.fabs.replaceChildren(...btns);
    this.fabs.classList.toggle('hidden', !btns.length || !!this.openSheet);
  }

  /** Glisser horizontalement passe d'une pièce à l'autre ; un glissement n'ouvre pas ce qu'il y a sous le doigt. */
  private bindSwipe(): void {
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => {
      if (this.swipe) return;
      if ((e.target as HTMLElement).closest('.sales-canvas')) return; // le graphique se parcourt au doigt
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
      // résistance aux bords (rien avant le tableau de bord ni après le magasin)
      const i = this.viewIndex;
      sw.dx = (i === 0 && dx > 0) || (i === TABS.length - 1 && dx < 0) ? dx / 3 : dx;
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
      const i = this.viewIndex + (fast || far ? (sw.dx < 0 ? 1 : -1) : 0);
      const target = TABS[Math.max(0, Math.min(TABS.length - 1, i))]!.id;
      this.roomsDrawUntil = performance.now() + 600;
      if (target !== this.view) this.goView(target);
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

  /** Récolte les gains de l'absence : l'argent défile, un petit mot résume l'absence. */
  collectOffline(): void {
    const g = this.game();
    const o = g.offline;
    if (!o) return;
    const from = g.money;
    g.collectOffline();
    this.moneyAnim = { from, to: g.money, start: performance.now() };
    this.moneyPill.classList.add('gain');
    this.harvest.classList.add('hidden');
    const hrs = Math.floor(o.seconds / 3600);
    const min = Math.floor((o.seconds % 3600) / 60);
    this.toast(`+${moneyInt(o.earned)} · ${hrs ? `${hrs} h ` : ''}${min} min d'absence, ${o.sold} vendues`, 'good');
    this.onSent?.();
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

  // ------------------------------------------------------------------ pages

  private renderPage(): void {
    // le tableau de bord vit quand il est affiché, et juste à côté (pour qu'il soit à jour quand on y glisse)
    if (this.view === 'shop' || this.view === 'bar') this.shopPage(this.game());
    if (this.view === 'dashboard' || this.view === 'workshop') {
      // en direct, mais une fois par seconde suffit
      const now = Math.floor(performance.now() / 1000);
      if (now === this.dashAt) return;
      this.dashAt = now;
      this.dashboardPage(this.game());
    }
  }

  /** Tableau de bord : un aperçu en direct des ventes et de la brasserie. */
  private dashboardPage(g: Game): void {
    const page = this.pages.dashboard;
    const scroll = page.scrollTop;
    page.replaceChildren();
    page.append(h('div', 'page-title', 'Tableau de bord'));
    // chiffres clés
    const kpis = h('div', 'kpis');
    const kpi = (label: string, value: string, sub?: string) => {
      const c = h('div', 'kpi');
      c.append(h('div', 'section-title', label), h('div', 'kpi-value', value));
      if (sub) c.append(h('div', 'kpi-sub', sub));
      kpis.append(c);
    };
    const minutes = g.salesMinutes();
    const hour = g.revenueLastHour;
    const last5 = minutes.slice(-5).reduce((s, m) => s + m.bar + m.orders + m.wholesale, 0);
    kpi('Dernière heure', moneyShort(hour), `${moneyInt(last5 / 5)}/min ces 5 min`);
    kpi('Recettes totales', moneyShort(g.totalRevenue), `${g.totalSold.toLocaleString('fr-FR')} vendues`);
    kpi('Marque', starText(g.brand), `${fmtRate(g.barRate * 60)} clients/h au bar`);
    kpi('Brassins', String(g.batchesDone), `${g.batches.length} en cours`);
    page.append(kpis);

    // ventes minute par minute
    const chart = h('div', 'card dash-chart');
    chart.append(h('div', 'section-title', 'Ventes · 60 dernières minutes'));
    const legend = h('div', 'legend');
    for (const src of SALE_SOURCES) {
      const it = h('span', 'legend-item');
      const sw = h('span', 'legend-swatch');
      sw.style.background = SOURCE[src].color;
      it.append(sw, h('span', '', SOURCE[src].name));
      legend.append(it);
    }
    const tip = h('div', 'chart-tip');
    const canvas = h('canvas', 'sales-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Ventes de la dernière heure : ${moneyInt(hour)}`);
    const axis = h('div', 'chart-axis');
    axis.append(h('span', '', '−60 min'), h('span', '', '−30'), h('span', '', 'maintenant'));
    chart.append(legend, tip, canvas, axis);
    page.append(chart);
    const showTip = () => {
      const i = this.dashPick;
      const m = i != null ? minutes[i] : undefined;
      if (!m) {
        tip.textContent = hour ? 'Touche une barre pour le détail' : 'Pas encore de vente cette heure-ci';
        tip.classList.add('dim');
        return;
      }
      tip.classList.remove('dim');
      const ago = minutes.length - 1 - i!;
      const parts = SALE_SOURCES.filter((s) => m[s] > 0).map((s) => `${SOURCE[s].name} ${moneyInt(m[s])}`);
      tip.textContent = `${ago ? `Il y a ${ago} min` : 'Cette minute'} : ${moneyInt(m.bar + m.orders + m.wholesale)}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    };
    const draw = () => this.drawSales(canvas, minutes);
    const pick = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * minutes.length);
      this.dashPick = Math.max(0, Math.min(minutes.length - 1, i));
      showTip();
      draw();
    };
    canvas.addEventListener('pointerdown', pick);
    canvas.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && pick(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.dashPick = null;
      showTip();
      draw();
    });
    showTip();
    requestAnimationFrame(draw); // il faut la taille réelle du canevas

    // d'où vient l'argent (depuis le début)
    const split = h('div', 'card');
    split.append(h('div', 'section-title', 'Répartition des recettes'));
    const totals: Record<SaleSource, number> = { bar: g.barRevenue, orders: g.ordersRevenue, wholesale: g.wholesaleRevenue };
    const sum = Math.max(1e-9, totals.bar + totals.orders + totals.wholesale);
    for (const src of SALE_SOURCES) {
      const row = h('div', 'split-row');
      const bar = h('div', 'split-bar');
      const fill = h('div', 'split-fill');
      fill.style.width = `${(totals[src] / sum) * 100}%`;
      fill.style.background = SOURCE[src].color;
      bar.append(fill);
      row.append(h('span', 'split-name', SOURCE[src].name), bar, h('span', 'split-value', moneyShort(totals[src])));
      split.append(row);
    }
    page.append(split);

    // la brasserie en direct
    const live = h('div', 'card');
    live.append(h('div', 'section-title', 'En direct'));
    const line = (k: string, v: string, cls = '') => {
      const r = h('div', `live-row ${cls}`);
      r.append(h('span', '', k), h('span', 'live-value', v));
      live.append(r);
    };
    const sorted = [...g.batches].sort((a, b) => b.stage - a.stage);
    if (!sorted.length) line('Atelier', 'à l\'arrêt', 'dim');
    for (const b of sorted) {
      const id = STATION_ORDER[b.stage]!;
      const name = g.beer(b.beerId)?.name ?? 'Essai';
      line(`${name} · ${STATIONS[id].step}`, b.waiting ? '⏸' : clock(b.duration - b.elapsed));
    }
    if (g.tastable) line('Essai', 'à goûter 🍺');
    line('Stockage', g.storageFull ? 'plein !' : `${Math.round((g.stored / g.storageCap) * 100)} %`, g.storageFull ? 'bad' : '');
    const taps = g.taps.filter((t) => t.glasses > 0).length;
    line('Bar', `${taps}/${g.taps.length} tireuses · ${g.glassesLeft} verres`);
    if (g.partying) line('Fête', `🎉 ${clock(g.partyUntil - g.time)}`);
    if (g.advertising) line('Campagne de pub', `📣 ${clock(g.adUntil - g.time)}`);
    const fc = this.forecast(g);
    if (fc) line('File de brassins', `${g.planned} · ${fc.res.done ? `fin dans ${clock(fc.at + fc.res.total - g.time)}` : BLOCKED_TEXT[fc.res.blocked ?? 'slow']}`, fc.res.done ? '' : 'bad');
    else line('File de brassins', 'vide');
    line('Commandes', g.orders.length ? `${g.orders.length} en attente${g.readyOrders.length ? ` · ${g.readyOrders.length} prête${g.readyOrders.length > 1 ? 's' : ''}` : ''}` : 'aucune');
    page.append(live);

    // les bières qui rapportent le plus
    if (g.beers.length) {
      const top = h('div', 'card');
      top.append(h('div', 'section-title', 'Ma gamme'));
      const list = h('div', 'stock-list');
      for (const b of [...g.beers].sort((a, c) => c.revenue - a.revenue)) {
        const el = h('div', 'stock-line');
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        el.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', `${b.sold} · ${moneyShort(b.revenue)}`), h('span', 'pop-stars', starText(b.pop)));
        list.append(el);
      }
      top.append(list);
      page.append(top);
    }
    page.scrollTop = scroll;
  }

  /** Barres empilées par source, une par minute ; la minute touchée est mise en avant. */
  private drawSales(canvas: HTMLCanvasElement, minutes: ReturnType<Game['salesMinutes']>): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, canvas.clientWidth);
    const hh = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const max = Math.max(1, ...minutes.map((m) => m.bar + m.orders + m.wholesale));
    const top = 14;
    const base = hh - 1;
    // graduation discrète : le maximum de l'heure
    ctx.fillStyle = '#5c4a6e';
    ctx.fillRect(0, top, w, 1);
    ctx.fillRect(0, base, w, 1);
    ctx.font = '14px VT323, monospace';
    ctx.fillStyle = '#bcaecb';
    ctx.textBaseline = 'bottom';
    ctx.fillText(moneyInt(max), 0, top - 1);
    const slot = w / minutes.length;
    const bw = Math.max(1, slot - 1);
    minutes.forEach((m, i) => {
      let y = base;
      const x = i * slot;
      const dim = this.dashPick != null && this.dashPick !== i;
      ctx.globalAlpha = dim ? 0.45 : 1;
      for (const src of SALE_SOURCES) {
        const v = m[src];
        if (v <= 0) continue;
        const bh = Math.max(1, ((base - top) * v) / max);
        ctx.fillStyle = SOURCE[src].color;
        ctx.fillRect(x, y - bh, bw, bh - (y < base ? 1 : 0)); // 1 px de fond entre deux segments
        y -= bh;
      }
    });
    ctx.globalAlpha = 1;
    if (this.dashPick != null) {
      ctx.fillStyle = '#f6ecd6';
      ctx.fillRect(this.dashPick * slot, base - 1, bw, 2);
    }
  }

  /** Le magasin : des objets pour le bar (ils débloquent des événements), et bientôt des décorations. */
  private shopPage(g: Game): void {
    const key = JSON.stringify([g.owned, SHOP_ITEMS.map((x) => g.money >= x.cost)]);
    if (key === this.shopKey) return;
    this.shopKey = key;
    const page = this.pages.shop;
    const scroll = page.scrollTop;
    page.replaceChildren(h('div', 'page-title', 'Magasin'));
    page.append(h('div', 'section-title', 'Pour le bar'));
    const items = h('div', 'shop-grid');
    for (const item of SHOP_ITEMS) {
      const owned = g.owns(item.id);
      const c = h('div', `card shop-item${owned ? ' owned' : ''}`);
      c.append(iconCanvas(ITEM_ICON[item.id], 3), h('div', 'beer-name', item.name), h('div', 'hint', item.text));
      if (owned) c.append(h('span', 'note', '✓ Achetée'));
      else {
        const b = this.btn('btn primary small', `Acheter · ${moneyInt(item.cost)}`, () => {
          const r = g.buyItem(item.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${item.name} : nouvel événement au bar !`, 'good');
          this.barRoom.invalidate();
          this.syncKegHits(true);
          this.shopKey = '';
          this.shopPage(g);
        });
        b.disabled = g.money < item.cost;
        c.append(b);
      }
      items.append(c);
    }
    page.append(items, h('div', 'section-title', 'Bientôt'));
    const grid = h('div', 'shop-grid');
    for (const [icon, name, desc] of [
      ['🪴', 'Décorations', 'Plantes, cadres, guirlandes pour le bar'],
      ['🪑', 'Mobilier', 'Tables, tabourets et banquettes'],
      ['🪧', 'Enseignes', 'Une façade à l\'image de ta marque'],
      ['💡', 'Ambiance', 'Éclairages et musique'],
    ] as const) {
      const c = h('div', 'card shop-item locked');
      c.append(h('div', 'shop-icon', icon), h('div', 'beer-name', name), h('div', 'hint', desc), h('span', 'kind-tag', 'Bientôt'));
      grid.append(c);
    }
    page.append(grid);
    page.scrollTop = scroll;
  }

  // ------------------------------------------------------------------ Gaston

  private renderMentor(): void {
    const g = this.game();
    const tips: Record<number, { text: string; action?: string }> = {
      0: { text: 'Salut, moi c\'est Gaston ! Le malt entre en haut, la bière sort en bas. J\'ai réglé les machines pour ma blonde.', action: 'Continuer' },
      1: { text: 'Touche une machine pour la régler.' },
      2: { text: 'Appuie sur « Brasser » pour lancer ton premier brassin.' },
      3: { text: 'Je t\'aide pour celui-ci : ça ira vite. On goûte à la première bouteille !' },
      4: { text: 'Glisse l\'écran : au stockage, touche l\'ordinateur pour les commandes ; au bar, touche les fûts pour les brancher. Bonne brasse !', action: 'Compris' },
    };
    const tip = this.modalOpen || this.openSheet?.kind === 'brew' || !isRoom(this.view) ? undefined : tips[g.tips];
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

  /** Argent gagné : une seule notification, dont le montant grimpe à chaque nouvelle vente rapprochée. */
  private gain: { el: HTMLElement; amount: number; timer: number } | null = null;
  gainToast(amount: number): void {
    const gn = this.gain;
    if (gn && gn.el.isConnected) {
      gn.amount += amount;
      clearTimeout(gn.timer);
      gn.el.textContent = `+${moneyInt(gn.amount)}`;
      gn.el.classList.remove('bump');
      void gn.el.offsetWidth; // relance la petite animation
      gn.el.classList.add('bump');
    } else {
      const el = h('div', 'toast good', `+${moneyInt(amount)}`);
      this.toasts.append(el);
      this.gain = { el, amount, timer: 0 };
    }
    const g = this.gain!;
    g.timer = window.setTimeout(() => {
      g.el.remove();
      if (this.gain === g) this.gain = null;
    }, 3000);
  }
}
