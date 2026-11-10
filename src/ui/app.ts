import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { BAR_MESSAGE, BAR_MESSAGE_MAX, BOTTLE_L, MAX_TANKS, SALE_SOURCES, TANK_STAGES, type Beer, type Format, type Game, type Order, type SaleSource } from '../core/game';
import { AD_EXTEND, ADS, BAR, BAR_EVENTS, BARMAN, GLASS_L, kegGlasses, kegLiters, PARTY, SHOP_ITEMS, type AdDef, type AdId, type BarEventId, type ShopItemId } from '../core/market';
import { CLIENT_TYPES, COMPUTERS, KIND_LABEL, orderAsk, orderGems, wholesalePrice } from '../core/orders';
import { stars, trendById, trendsOf } from '../core/trends';
import { BREWERY_NAMES, MAX_LEVEL, STATION_ORDER, STATIONS, upgradeCost, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
import { drawLabel } from '../render/labelArt';
import { BOTTLE_SCALE, drawCrate, drawShelfBottle, labelSpot, type ShelfBottleKind } from '../render/bottleArt';
import { instBox } from '../render/decor';
import { decorLayout } from '../render/decorLayout';
import { BarRoom, boundsFor, drawKeg, ROOM_W, StorageRoom } from '../render/rooms';
import { OfficeRoom } from '../render/officeRoom';
import { iconCanvas, type IconId } from '../render/icons';
import { CRATE, MAX_RANGE, STORAGE } from '../core/warehouse';
import { BOOST_POSTS, BOOSTS, GEMS, DECOR_ORDER, type DecorId, FURNITURE, LABEL_UNLOCKS, STAFF, STAFF_CONTRACT, STAFF_SLOTS, UNLOCK_KINDS, type BoostChannel, type BoostDef, type BoostId, type LabelUnlock, type UnlockKind } from '../core/shop';
import { BOTTLES, DEFAULT_LABEL, EMBLEMS, FONTS, LABEL_COLORS, PATTERNS, SHAPES, type Label } from '../core/label';
import { drawGaston } from './gaston';
import { createKnob } from './knob';
import { compact, countdown } from './format';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${Math.floor(v).toLocaleString('fr-FR')} €`;
/** Un volume en litres : une décimale sous 10 L. */
const liters = (v: number) => `${v < 10 ? (Math.round(v * 10) / 10).toLocaleString('fr-FR') : Math.round(v).toLocaleString('fr-FR')} L`;
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

/** Icône de chaque campagne de pub. */
const AD_ICON: Record<AdId, IconId> = { flyers: 'poster', paper: 'clipboard', radio: 'bubble', tv: 'tv', national: 'trend' };

/** L'effet d'une campagne en une ligne : « 6 h · lettres ×2 · popularité +10 % · une lettre tout de suite ». */
export function adEffect(ad: AdDef): string {
  const fr = (x: number) => String(x).replace('.', ',');
  const nb = '\u00a0'; // espace insécable : « +10 % » ne se coupe pas
  const parts = [`${ad.duration / 3600}${nb}h`, `lettres${nb}×${fr(ad.orderBoost)}`, `popularité +${Math.round(ad.pop * 100)}${nb}%`];
  if (ad.letters === 1) parts.push('une lettre tout de suite');
  else if (ad.letters > 1) parts.push('emplacements remplis');
  if (ad.pay !== 1) parts.push(`commandes +${Math.round((ad.pay - 1) * 100)}${nb}%`);
  if (ad.prestige) parts.push('une commande de prestige');
  if (ad.bar !== 1) parts.push(`bar +${Math.round((ad.bar - 1) * 100)}${nb}% de clients`);
  return parts.join(' · ');
}

/** Nom de la pièce en haut à gauche : un bouton qui ouvre son amélioration. Quand on peut se l'offrir,
 *  il clignote et une flèche verte apparaît juste après le texte, dans le même cadre. */
function roomPlaque(): HTMLButtonElement {
  const b = h('button', 'map-btn plaque');
  const arrow = iconCanvas('up', 1, 'pix-icon plaque-up');
  arrow.setAttribute('aria-hidden', 'true');
  b.append(h('span', 'plaque-text'), arrow);
  return b;
}

/** Met à jour le texte d'une plaque et son état « amélioration possible ». */
function setPlaque(b: HTMLButtonElement, text: string, canUp: boolean, upLabel: string): void {
  const t = b.querySelector<HTMLElement>('.plaque-text')!;
  if (t.textContent !== text) t.textContent = text;
  b.classList.toggle('alert', canUp);
  const aria = canUp ? `${text} : ${upLabel} possible` : text;
  if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
}

/** Icône de chaque pièce de décoration du bar (meubles et objets d'événement). */
const DECOR_ICON: Record<DecorId, IconId> = {
  plants: 'plant', darts: 'darts', posters: 'poster', tv: 'tv', neon: 'neon', disco: 'disco', benches: 'bench', jukebox: 'jukebox',
};

/** Onglets du magasin. */
type ShopTab = 'bar' | 'boosts' | 'labels';
/** Onglets du magasin, de gauche à droite. */
const SHOP_TABS: readonly { id: ShopTab; name: string; icon: IconId }[] = [
  { id: 'bar', name: 'Bar', icon: 'plant' },
  { id: 'boosts', name: 'Boosts', icon: 'bolt' },
  { id: 'labels', name: 'Étiquettes', icon: 'labels' },
];
/** Icône de chaque effet (poste de boost), en haut à droite de l'écran quand il est actif : la marmite des machines… */
const EFFECT_ICON: Record<BoostChannel, IconId> = { brew: 'brew', yeast: 'flask', bar: 'mug', wholesale: 'truck' };
/** Le nom de chaque effet, pour la lecture d'écran. */
const EFFECT_NAME: Record<BoostChannel, string> = { brew: 'Machines', yeast: 'Fermentation et garde', bar: 'Clients du bar', wholesale: 'Grossiste' };
/** Icône de chaque boost, dans le magasin. */
const BOOST_ICON: Record<BoostId, IconId> = {
  rush: 'flame', cadence: 'fast2', nightShift: 'moon', fullSpeed: 'fast3', yeast: 'yeast', happyHour: 'mug', buzz: 'bubble', broker: 'truck', openGate: 'crate', prospect: 'envelope',
};
/** L'événement qu'ouvre chaque objet d'événement de la décoration. */
const DECOR_EVENT: Partial<Record<DecorId, 'darts' | 'foot' | 'party'>> = { darts: 'darts', tv: 'foot', disco: 'party' };
/** Hauteur de la vitrine du bar, en px. */
const SHOWCASE_H = 132;

/** Effets d'un meuble, en petites étiquettes chiffrées. */
function furnitureEffects(id: DecorId): string[] {
  const f = FURNITURE.find((x) => x.id === id);
  if (!f) return [];
  const pct = (m: number) => `+${Math.round((m - 1) * 100)} %`;
  const out: string[] = [];
  if (f.clients) out.push(`clients ${pct(f.clients)}`);
  if (f.seats) out.push(`+${f.seats} places`);
  if (f.price) out.push(`verres ${pct(f.price)}`);
  if (f.pop) out.push(`gamme connue ${pct(f.pop)}`);
  return out;
}

/** Effet d'un boost en quelques mots : multiplicateur et durée. */
function boostShort(b: BoostDef): string {
  const n = (v: number) => String(v).replace('.', ',');
  const dur = b.minutes >= 60 ? `${b.minutes / 60} h` : `${b.minutes} min`;
  if (!b.channel) return 'immédiat';
  if (b.channel === 'bar') return `clients ×${n(b.mult)}${b.priceMult ? ` · verres −${Math.round((1 - b.priceMult) * 100)} %` : ''} · ${dur}`;
  if (b.channel === 'wholesale') return `prix ×${n(b.mult)} · ${dur}`;
  if (b.id === 'openGate') return `sans limite · ${dur}`;
  return `×${n(b.mult)} · ${dur}`;
}

/** Un nombre de diamants, en toutes lettres. */
const gemsText = (n: number) => `${n} diamant${n > 1 ? 's' : ''}`;

/** Nom de la pièce en haut à gauche. */
function roomTitle(plaque: HTMLElement): HTMLElement {
  const el = h('div', 'room-title');
  el.append(plaque);
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
      ? `${after} : le stockage sera plein de fûts. Sers-les au bar, livre des commandes de fûts ou vends-en au grossiste (dans la limite de son quota du jour) ; sinon programme moins de fûts, ou agrandis le stockage.`
      : `${after} : le stockage sera plein. Livre des commandes, vends au grossiste (dans la limite de son quota du jour) ou agrandis le stockage.`;
  }
  if (res.blocked === 'money') return `${after} : il n'y aura plus de quoi payer les ingrédients.`;
  return 'La file entière prendra plus de 24 h.';
}

/** Icône de chaque événement du bar. */
const EVENT_ICON: Record<BarEventId, IconId> = { party: 'disco', darts: 'darts', foot: 'ball' };

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

/** Les pièces : le bureau, puis le trajet de la bière ; on glisse de l'une à l'autre. */
export type RoomId = 'office' | 'workshop' | 'storage' | 'bar';
const ROOMS: readonly { id: RoomId; name: string }[] = [
  { id: 'office', name: 'Bureau' },
  { id: 'workshop', name: 'Atelier' },
  { id: 'storage', name: 'Stockage' },
  { id: 'bar', name: 'Bar' },
];
/** Ce que montre l'écran : une des pièces, ou le magasin. */
export type View = RoomId | 'shop';
/** Onglets de la barre de navigation, de gauche à droite. */
const TABS: readonly { id: View; name: string; icon: IconId }[] = [
  { id: 'office', name: 'Bureau', icon: 'office' },
  { id: 'workshop', name: 'Atelier', icon: 'flask' },
  { id: 'storage', name: 'Stockage', icon: 'crate' },
  { id: 'bar', name: 'Bar', icon: 'mug' },
  { id: 'shop', name: 'Magasin', icon: 'cart' },
];
const isRoom = (v: View): v is RoomId => ROOMS.some((r) => r.id === v);

/** Couleur de chaque source de ventes dans le graphique (palette validée sur le fond des panneaux). */
const SOURCE: Record<SaleSource, { name: string; color: string }> = {
  bar: { name: 'Bar', color: '#b8862a' },
  orders: { name: 'Commandes', color: '#3f88d4' },
  wholesale: { name: 'Grossiste', color: '#d45c8e' },
};

/** Les applications de l'ordinateur du bureau, dans l'ordre du menu. */
export type PcApp = 'dashboard' | 'messages' | 'orders' | 'staff' | 'trends' | 'wholesale';
const PC_APPS: readonly { id: PcApp; name: string; icon: IconId }[] = [
  { id: 'dashboard', name: 'Tableau de bord', icon: 'chart' },
  { id: 'messages', name: 'Messages', icon: 'bubble' },
  { id: 'orders', name: 'Commandes', icon: 'clipboard' },
  { id: 'staff', name: 'Personnel', icon: 'staff' },
  { id: 'trends', name: 'Tendances', icon: 'trend' },
  { id: 'wholesale', name: 'Grossiste', icon: 'truck' },
];
/** Un message reçu au bureau (commandes, tendances, brassins…), daté en temps de jeu. */
interface Message { at: number; text: string; kind: 'good' | 'bad' | 'info'; icon: IconId; read: boolean }
const MAX_MESSAGES = 60;
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

/** Heure du jeu, à l'horloge du bureau : une partie commence à 8 h du matin. */
const gameClock = (t: number) => {
  const d = (t + 8 * 3600) % 86400;
  return `${String(Math.floor(d / 3600)).padStart(2, '0')}:${String(Math.floor((d % 3600) / 60)).padStart(2, '0')}`;
};

/** Ancienneté d'un message, en temps de jeu. */
const ago = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60);
  return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 24 * 60 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`;
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
  private plaque = roomPlaque();
  private announcedTaste = -1;
  /** Bas de l'écran : les actions de la pièce (sous-menu), puis la barre de navigation. */
  private dock = h('div', 'dock');
  /** Actions de la pièce : des boutons ronds flottants en bas à droite, l'action principale en dessous. */
  private fabs = h('div', 'fabs');
  private tabbar = h('nav', 'tabbar');
  private brewBtn = fab('brew', 'Brasser');
  /** La brasserie était-elle déjà à l'arrêt au rendu précédent ? (la notification ne part qu'au moment où elle s'arrête) */
  private wasStopped = false;
  private rangeBtn = fab('range', 'Ma gamme');
  private eventsBtn = fab('events', 'Événements');
  private barmanBtn = fab('barman', 'Barman en renfort');
  /** Le magasin : trois onglets, et le rayon affiché dessous. */
  private shopPane = h('div', 'shop');
  private shopBody = h('div', 'shop-body');
  private shopTabs = new Map<ShopTab, { btn: HTMLButtonElement; mark: HTMLElement }>();
  private shopTab: ShopTab = 'bar';
  /** Case choisie sur la piste de la décoration (null : la prochaine en vente). */
  private decorPick: DecorId | null = null;
  private shopKey = '';
  /** Ce qui est devenu abordable et que le joueur a déjà vu au magasin (la pastille de l'onglet s'éteint). */
  private shopSeen = new Set<string>();
  /** Le bar, redessiné dans la vitrine avec l'objet en vente déjà installé. */
  readonly showcase = new BarRoom();
  private showcaseScene: HTMLElement | null = null;
  /** Boosts actifs, en haut à droite de l'écran : leur icône et le temps qui reste. */
  private boostHud = h('div', 'boost-hud hidden');
  private boostHudKey = '';
  /** Diamants, à côté de l'argent. */
  private gemsEl = h('span', 'gems-value');
  private gemsPill = h('button', 'gems');
  private computerHit?: HTMLButtonElement;
  // --- les pièces
  readonly officeRoom = new OfficeRoom();
  private officeWrap = h('div', 'scene-wrap');
  private officePlaque = roomPlaque();
  readonly storageRoom = new StorageRoom();
  readonly barRoom = new BarRoom();
  private room: RoomId = 'workshop';
  private view: View = 'workshop';
  private navTabs = new Map<View, { btn: HTMLButtonElement; badge: HTMLElement }>();
  /** Dernière seconde où le tableau de bord de l'ordinateur a été redessiné. */
  private dashAt = -1;
  /** Minute survolée dans le graphique des ventes (index dans les 60 dernières). */
  private dashPick: number | null = null;
  private track = h('div', 'rooms-track');
  private wraps: HTMLElement[] = [];
  /** Écran de chaque pièce : le canvas le remplit entièrement, le plan de la pièce (et ses zones tactiles) au centre. */
  private views: HTMLElement[] = [];
  /** Taille de l'écran d'une pièce en pixels natifs, et position de la pièce dedans. */
  private viewBox = { w: SCENE_W, h: SCENE_H, ox: 0, oy: 0 };
  private storageWrap = h('div', 'scene-wrap');
  private barWrap = h('div', 'scene-wrap');
  private roomHits: { el: HTMLButtonElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
  private storagePlaque = roomPlaque();
  private barPlaque = roomPlaque();
  /** Glissement en cours : départ du doigt, décalage, et s'il faut avaler le « clic » qui suit. */
  private swipe: { id: number; x: number; y: number; dx: number; on: boolean; t: number } | null = null;
  private swallowClick = false;
  private roomsDrawUntil = 0;
  /** Ordinateur allumé : l'application ouverte (null : le menu), et l'écran où elle s'affiche. */
  private computer: { app: PcApp | null; key: string; ui: HTMLElement } | null = null;
  /** Boîte de réception du bureau, la plus récente en premier. */
  private messages: Message[] = [];
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
    this.gemsPill.append(iconCanvas('gem', 1, 'gems-icon'), this.gemsEl);
    this.gemsPill.setAttribute('aria-label', 'Diamants : voir les boosts');
    this.gemsPill.onclick = () => this.openShop('boosts');
    this.header.append(logo, this.gemsPill, pill, opts);
    for (const t of TABS) {
      const btn = h('button', 'nav-tab');
      btn.setAttribute('aria-label', t.name);
      const badge = h('span', 'room-badge hidden');
      btn.append(iconCanvas(t.icon, 2, 'nav-icon'), h('span', 'nav-name', t.name), badge);
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
    this.sceneWrap.append(roomTitle(this.plaque), this.tasteBtn);

    // bureau : la fenêtre sur l'atelier, le panneau des commandes, le présentoir de la gamme et l'ordinateur
    this.officeWrap.append(this.officeRoom.canvas);
    const OFFICE_HITS = {
      window: { label: 'Fenêtre : aller à l\'atelier', run: () => this.goView('workshop') },
      board: { label: 'Panneau des commandes', run: () => this.openComputer('orders') },
      display: { label: 'Présentoir : ma gamme', run: () => this.open({ kind: 'range' }) },
      computer: { label: 'Ordinateur', run: () => this.openComputer() },
    };
    for (const hit of this.officeRoom.hits()) {
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', OFFICE_HITS[hit.id].label);
      el.onclick = OFFICE_HITS[hit.id].run;
      if (hit.id === 'computer') this.computerHit = el;
      this.officeWrap.append(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    this.officePlaque.onclick = () => this.openComputerUp();
    this.officeWrap.append(roomTitle(this.officePlaque));
    // stockage : les rayonnages
    this.storageWrap.append(this.storageRoom.canvas);
    for (const hit of this.storageRoom.hits()) {
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', 'Rayonnages');
      el.onclick = () => this.open({ kind: 'storage' });
      this.storageWrap.append(el);
      this.roomHits.push({ el, rect: hit.rect });
    }
    this.storagePlaque.onclick = () => this.open({ kind: 'storageUp' });
    this.storageWrap.append(roomTitle(this.storagePlaque));
    // bar : le comptoir
    this.barWrap.append(this.barRoom.canvas);
    const counter = this.barRoom.hits(1)[0]!;
    const counterEl = h('button', 'station-hit');
    counterEl.setAttribute('aria-label', 'Comptoir');
    counterEl.onclick = () => this.open({ kind: 'bar' });
    this.barWrap.append(counterEl);
    this.roomHits.push({ el: counterEl, rect: counter.rect });
    // le panneau lumineux au-dessus des bouteilles : on y écrit son message (sans panneau, c'est le comptoir)
    const signEl = h('button', 'station-hit');
    signEl.setAttribute('aria-label', 'Panneau lumineux : changer le message');
    signEl.onclick = () => (this.game().hasFurniture('neon') ? this.openBarMessage() : this.open({ kind: 'bar' }));
    this.barWrap.append(signEl);
    this.roomHits.push({ el: signEl, rect: this.signRect });
    this.barPlaque.onclick = () => this.open({ kind: 'barUp' });
    this.barWrap.append(roomTitle(this.barPlaque));
    this.buildShop();
    // Le défilé des écrans suit l'ordre des onglets : bureau, atelier, stockage, bar, magasin.
    const wraps: Record<RoomId, HTMLElement> = { office: this.officeWrap, workshop: this.sceneWrap, storage: this.storageWrap, bar: this.barWrap };
    for (const t of TABS) {
      const pane = h('div', 'room');
      if (!isRoom(t.id)) {
        pane.classList.add('shop-pane');
        pane.append(this.shopPane);
        this.track.append(pane);
        continue;
      }
      const view = h('div', 'room-view');
      view.append(wraps[t.id]);
      // le nom de la pièce, dans le coin de l'écran (à égale distance du haut et de la gauche), pas dans le plan
      const title = wraps[t.id].querySelector('.room-title');
      if (title) view.append(title);
      pane.append(view);
      this.track.append(pane);
      this.wraps.push(wraps[t.id]);
      this.views.push(view);
    }
    this.track.style.width = `${TABS.length * 100}vw`;
    this.stage.append(this.track);
    this.bindSwipe();

    // barre du bas : ses boutons changent selon la pièce
    this.rangeBtn.onclick = () => this.open({ kind: 'range' });
    this.brewBtn.onclick = () => this.open({ kind: 'brew' });
    this.eventsBtn.onclick = () => this.openEvents();
    this.barmanBtn.onclick = () => this.openBarman();
    this.setBottom();

    // Gaston
    const av = h('canvas', 'mentor-avatar');
    drawGaston(av);
    this.mentor.append(av, h('div', 'mentor-body'));

    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cost]');
      if (!b) return;
      const missing = Number(b.dataset.cost) - this.game().money;
      if (missing <= 0) return;
      e.stopPropagation();
      e.preventDefault();
      this.toast(`Il te manque ${moneyInt(Math.ceil(missing))}`, 'bad');
    }, true);
    root.append(this.header, this.stage, this.fabs, this.harvest, this.boostHud, this.mentor, this.sheet, this.dock, this.modal, this.toasts);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // ------------------------------------------------------------------ mise en page

  /**
   * Le plan de chaque pièce (160 × 300) tient entier entre le header et la barre du bas, agrandi autant que possible.
   * Le canvas de la pièce, lui, couvre tout l'écran : son décor est peint d'un seul tenant jusqu'aux bords
   * (plus large ou plus haut que le plan selon le format), sans défilement ni bandes.
   */
  layout(): void {
    const top = this.header.getBoundingClientRect().bottom;
    const bottom = this.dock.getBoundingClientRect().top;
    const availW = window.innerWidth;
    const availH = Math.max(100, bottom - top);
    this.scale = Math.min(availW / SCENE_W, availH / SCENE_H);
    const w = Math.floor(SCENE_W * this.scale);
    const hh = Math.floor(SCENE_H * this.scale);
    // l'écran de la pièce, en pixels natifs : le plan au centre, le décor peint jusqu'aux bords
    const vw = Math.ceil(availW / this.scale);
    const vh = Math.ceil(availH / this.scale);
    const b = boundsFor(vw, vh);
    const { ox, oy } = b;
    this.viewBox = { w: vw, h: vh, ox, oy };
    for (const v of this.views) Object.assign(v.style, { width: `${vw * this.scale}px`, height: `${vh * this.scale}px` });
    for (const wrap of this.wraps) Object.assign(wrap.style, { width: `${w}px`, height: `${hh}px`, left: `${ox * this.scale}px`, top: `${oy * this.scale}px` });
    this.scene.resize(vw, vh, b);
    // la cave du bar : les fûts se rangent à gauche des boutons du barman et des événements (48 px, à 10 px du bord)
    const fabLeft = (window.innerWidth - 10 - 48 - 6) / this.scale - ox;
    this.barRoom.kegReserve = Math.max(0, Math.min(60, Math.ceil(ROOM_W - 6 - fabLeft)));
    for (const r of [this.officeRoom, this.storageRoom, this.barRoom]) r.resize(vw, vh);
    for (const c of [this.officeRoom.canvas, this.scene.canvas, this.storageRoom.canvas, this.barRoom.canvas]) {
      Object.assign(c.style, { width: `${vw * this.scale}px`, height: `${vh * this.scale}px`, left: `${-ox * this.scale}px`, top: `${-oy * this.scale}px` });
    }
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

  frame(t: number): void {
    const g = this.game();
    if (this.moneyAnim) {
      const a = this.moneyAnim;
      const k = Math.min(1, (performance.now() - a.start) / 900);
      const v = a.from + (a.to - a.from) * (1 - (1 - k) ** 3);
      this.moneyEl.textContent = compact(k >= 1 ? g.money : v);
      if (k >= 1) {
        this.moneyAnim = null;
        this.moneyPill.classList.remove('gain');
      }
    }
    // On ne dessine que la pièce affichée (et ses voisines pendant un glissement).
    const all = !!this.swipe?.on || performance.now() < this.roomsDrawUntil;
    if (all || this.view === 'storage') this.storageRoom.draw(g, t);
    if (all || this.view === 'bar') this.barRoom.draw(g, t);
    if ((all || this.view === 'shop') && this.shopTab === 'bar') this.drawShowcase(g, t);
    // l'atelier se voit aussi par la fenêtre du bureau
    if (!all && this.view !== 'workshop' && this.view !== 'office') return;
    this.scene.draw(g, t);
    if (all || this.view === 'office') this.officeRoom.draw(g, t, this.scene);
    // étiquettes des appareils
    for (const id of STATION_ORDER) {
      const o = this.overlays.get(id)!;
      const r = this.scene.rect(id, g.level(id));
      const s = this.scale;
      Object.assign(o.btn.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      const batch = g.batchAt(id);
      o.label.classList.toggle('busy', !!batch);
      // au-dessus de toute la rangée de cuves, sans sortir de l'écran
      const row = this.scene.rowRect(id, g.level(id));
      const half = o.label.offsetWidth / 2;
      const minX = -this.viewBox.ox * s + 4 + half;
      const maxX = (this.viewBox.w - this.viewBox.ox) * s - 4 - half;
      o.label.style.left = `${Math.max(minX, Math.min(maxX, (row.x + row.w / 2) * s))}px`;
      o.label.style.top = `${Math.max(0, r.y * s - 18)}px`;
      // le nom de la pièce est dans le coin : l'étiquette de l'appareil d'en dessous passe sous lui
      if (id === 'mill') {
        const tr = this.plaque.getBoundingClientRect();
        const lr = o.label.getBoundingClientRect();
        if (tr.width && lr.left < tr.right && lr.right > tr.left && lr.top < tr.bottom && lr.bottom > tr.top) {
          o.label.style.top = `${parseFloat(o.label.style.top) + (tr.bottom - lr.top) + 2}px`;
        }
      }
      const pct = batch ? Math.min(1, batch.elapsed / Math.max(0.01, batch.duration)) : 0;
      const all = g.batchesAt(id);
      const many = g.tankCount(id) > 1 ? all.length : 0;
      // temps restant de l'étape (avec plusieurs cuves : celle qui finit la première)
      const running = all.filter((b) => !b.waiting);
      const left = running.length ? Math.min(...running.map((b) => b.duration - b.elapsed)) : 0;
      o.text.textContent = batch
        ? id === 'bottling' && g.bottlingBlocked ? 'Stockage plein ⏸'
        : id === 'bottling' && g.tastable === batch ? 'À goûter ⏸'
        : many > 1 ? `${STATIONS[id].step}${running.length ? ` · ${clock(left)}` : ' ⏸'}`
        : batch.waiting ? `${STATIONS[id].step} ⏸` : `${STATIONS[id].step} · ${clock(left)}`
        : STATIONS[id].step;
      o.label.classList.toggle('blocked', id === 'bottling' && g.bottlingBlocked);
      (o.bar.firstElementChild as HTMLElement).style.width = `${pct * 100}%`;
    }
    // les étiquettes de la fermentation et de la garde, sur le même étage, ne se chevauchent pas :
    // celle de la garde s'écarte vers la droite autant que l'écran le permet, puis passe en dessous
    {
      const fl = this.overlays.get('fermenter')!.label;
      const gl = this.overlays.get('conditioning')!.label;
      const fx = parseFloat(fl.style.left);
      const gx = parseFloat(gl.style.left);
      const fy = parseFloat(fl.style.top);
      const gy = parseFloat(gl.style.top);
      const lh = Math.max(fl.offsetHeight, gl.offsetHeight);
      const over = fx + fl.offsetWidth / 2 + 4 - (gx - gl.offsetWidth / 2);
      if (over > 0 && Math.abs(fy - gy) < lh + 2) {
        const maxX = (this.viewBox.w - this.viewBox.ox) * this.scale - 4 - gl.offsetWidth / 2;
        const move = Math.min(over, Math.max(0, maxX - gx));
        gl.style.left = `${gx + move}px`;
        if (move < over) gl.style.top = `${Math.max(gy, fy + lh + 2)}px`;
      }
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
    if (!this.moneyAnim) this.moneyEl.textContent = compact(g.money);
    const moneyAria = `Argent : ${moneyInt(g.money)}`;
    if (this.moneyPill.getAttribute('aria-label') !== moneyAria) this.moneyPill.setAttribute('aria-label', moneyAria);
    this.renderBoostHud(g);
    const gems = compact(g.gems);
    if (this.gemsEl.textContent !== gems) this.gemsEl.textContent = gems;
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
    const can = g.canBrew();
    const trial = g.tastable;
    // pastilles des boutons d'action : l'essentiel en un coup d'œil ; « ready » = il y a quelque chose à faire
    // la brasserie à l'arrêt se voit partout (après le tutoriel) : « 0 » en rouge sur Brasser, « ! » sur l'onglet Atelier, et une notification
    const stopped = g.stopped && g.tips >= 4;
    setFab(this.brewBtn, g.planned ? String(g.planned) : stopped ? '0' : '', can.ok && !g.planned ? 'ready' : '',
      g.planned ? `Brasser : ${g.planned} programmé${g.planned > 1 ? 's' : ''}` : stopped ? 'Brasser : la brasserie est à l\'arrêt' : 'Brasser');
    this.brewBtn.querySelector('.fab-badge')!.classList.toggle('stop', stopped);
    if (stopped && !this.wasStopped) {
      this.toast('La brasserie est à l\'arrêt : programme des brassins', 'bad', {
        label: 'Brasser', run: () => {
          this.goView('workshop');
          this.open({ kind: 'brew' });
        },
      }, 8000);
    }
    this.wasStopped = stopped;
    setFab(this.rangeBtn, trial ? '!' : '', trial ? 'alert' : '', `Ma gamme : ${g.beers.length}/${g.rangeSlots}`);
    const ready = g.readyOrders.length;
    const emptyTap = g.taps.some((t) => t.glasses <= 0);
    const kegsReady = g.beers.some((b) => b.kegs.length > 0);
    this.syncKegHits();
    const nextBar = BAR[g.barLevel];
    const eventReady = !g.partying && g.time >= g.partyReadyAt;
    setFab(this.eventsBtn, g.partying ? clock(g.partyUntil - g.time) : '', g.partying ? 'alert' : '', g.partying ? `${g.barEvent.name} en cours` : 'Événements');
    this.eventsBtn.classList.toggle('dim', !g.partying && !eventReady);
    // barman : temps restant de son contrat ; le bouton s'allume quand un fût attend d'être branché
    const left = g.barmanUntil - g.time;
    setFab(this.barmanBtn, g.barmanOn ? (left >= 3600 ? `${Math.ceil(left / 3600)} h` : `${Math.ceil(left / 60)} min`) : '',
      g.barmanOn ? 'alert' : emptyTap && kegsReady ? 'ready' : '', g.barmanOn ? `Barman en renfort : encore ${duration(left)}` : 'Embaucher un barman');
    // améliorations possibles : la flèche brille
    const stationUp = STATION_ORDER.some((id) => g.level(id) < MAX_LEVEL && g.money >= g.upgradeCost(id));
    const nextStore = STORAGE[g.storageLevel];
    const nextPc = COMPUTERS[g.computerLevel];
    // l'ordinateur (l'enveloppe est dessinée sur son écran) : son nom dit les commandes en attente
    const unread = this.unread;
    this.computerHit?.setAttribute('aria-label', `Ordinateur : ${g.orders.length} commande${g.orders.length > 1 ? 's' : ''}${ready ? `, ${ready} à livrer` : ''}${unread ? `, ${unread} message${unread > 1 ? 's' : ''}` : ''}`);
    this.fabs.classList.toggle('hidden', !isRoom(this.view) || !!this.openSheet);
    // les notifications se posent au-dessus du panneau ouvert
    const sheetTop = this.openSheet ? this.sheet.getBoundingClientRect().top : 0;
    this.root.style.setProperty('--toast-bottom', sheetTop ? `${Math.round(window.innerHeight - sheetTop)}px` : 'var(--bottom-h, 70px)');
    // le tutoriel montre le bouton dont il parle
    this.brewBtn.classList.toggle('tuto', g.tips === 2);
    setPlaque(this.plaque, `★ ${g.breweryLevel} · ${g.breweryName}`, stationUp, 'amélioration');
    setPlaque(this.storagePlaque, `▣ ${STORAGE[g.storageLevel - 1]!.name}`, !!nextStore && g.money >= nextStore.cost, 'agrandissement');
    setPlaque(this.officePlaque, `▣ ${COMPUTERS[g.computerLevel - 1]!.name}`, !!nextPc && g.money >= nextPc.cost, 'amélioration');
    setPlaque(this.barPlaque, `★ ${g.barLevel} · ${g.bar.name}`, !!nextBar && g.money >= nextBar.cost, 'agrandissement');
    // pastilles des onglets de pièces
    const badges: Record<RoomId, string> = {
      office: this.unreadLetters ? '✉' : g.orders.length ? String(g.orders.length) : '',
      workshop: trial ? '🍺' : stopped ? '!' : '',
      storage: g.storageFull ? '!' : '',
      bar: g.partying ? '🎉' : emptyTap && kegsReady ? '!' : '', // un fût à changer, et de quoi le remplacer
    };
    const shopNew = this.view !== 'shop' && this.shopNews(g).length > 0;
    for (const [id, tab] of this.navTabs) {
      const badge = isRoom(id) ? badges[id] : shopNew ? '!' : '';
      tab.btn.classList.toggle('active', id === this.view);
      tab.badge.textContent = badge;
      tab.badge.classList.toggle('hidden', !badge);
      tab.badge.classList.toggle('hot', id === 'office' ? ready > 0 || this.unreadLetters > 0 : !!badge);
    }
    this.renderShop();
    this.tasteBtn.classList.toggle('hidden', !trial || this.modalOpen || this.view !== 'workshop');
    this.placeTaste();
    if (trial && trial.id !== this.announcedTaste) {
      this.announcedTaste = trial.id;
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => b.classList.toggle('short', g.money < Number(b.dataset.cost)));
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

  /** Bouton d'une action sans retour : le premier appui demande confirmation, le second agit (3 s pour confirmer). */
  private confirmBtn(cls: string, text: string, ask: string, onclick: () => void): HTMLButtonElement {
    const b = h('button', cls, text);
    let timer = 0;
    b.onclick = () => {
      if (b.dataset.armed) {
        clearTimeout(timer);
        onclick();
        return;
      }
      b.dataset.armed = '1';
      b.classList.add('armed');
      b.textContent = ask;
      timer = window.setTimeout(() => {
        delete b.dataset.armed;
        b.classList.remove('armed');
        b.textContent = text;
      }, 3000);
    };
    return b;
  }

  /**
   * Bouton payant : s'il manque de l'argent, il reste touchable mais grisé, et dit combien il manque
   * (au lieu d'être désactivé sans explication).
   */
  private costGate(b: HTMLButtonElement, cost: number): void {
    b.dataset.cost = String(cost);
    b.classList.toggle('short', this.game().money < cost);
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
    // pendant le tutoriel, la fiche ne parle que des réglages : les achats viennent après la première bière
    if (g.tips < 4) return;
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
        this.costGate(b, tankCost);
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
      this.costGate(b, cost);
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
      // carte : le nom en haut ; à gauche l'aperçu du brassin ; au milieu le format et le temps ; à droite les réglages
      const card = h('div', `card plan-card${i === 0 ? ' banner' : ''}`);
      const close = this.btn('plan-close', '✕', () => {
        const removed = { ...p };
        g.unplan(i);
        this.refreshSheet();
        // on peut se raviser
        this.toast(`${removed.count} × ${b.name} retiré${removed.count > 1 ? 's' : ''}`, 'info', { label: 'Annuler', run: () => {
          g.plan.splice(Math.min(i, g.plan.length), 0, removed);
          this.refreshSheet();
        } }, 5000);
      });
      close.setAttribute('aria-label', 'Retirer de la file');
      card.append(h('div', 'plan-title', `${i + 1}. ${b.name}`), close);
      const row = h('div', 'plan-row');
      const pic = h('div', 'plan-pic');
      pic.append(this.beerVisual(b, p.format));
      const info = h('div', 'plan-info');
      info.append(h('span', 'stats-line strong', p.format === 'keg' ? 'Fûts' : 'Bouteilles'));
      // fin du dernier brassin de ce groupe
      const done = inLine + g.plan.slice(0, i + 1).reduce((n, x) => n + x.count, 0) - 1;
      if (fc) {
        const w = h('span', 'plan-eta');
        if (fc.res.ends[done] != null) w.append(h('span', '', 'prêt dans '));
        w.append(this.etaEl(fc, done));
        info.append(w);
      }
      const status = i === 0 ? this.planStatus(g) : '';
      if (status) info.append(h('span', 'note bad', status));
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
      const moves = h('div', 'plan-moves');
      moves.append(up, down);
      ctl.append(this.stepper(p.count, 1, Math.max(1, g.planLimit(p.format, i)), (n) => {
        g.setPlanCount(i, n);
        this.refreshSheet();
      }), moves);
      row.append(pic, info, ctl);
      card.append(row);
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
      ? `Plus de place au stockage (en comptant les brassins déjà programmés). ${f === 'keg' ? 'Sers des fûts au bar, livre des commandes de fûts, vends-en au grossiste' : 'Livre des commandes, vends au grossiste'}, ou agrandis le stockage.`
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
      if (busy) this.toast('En file d\'attente', 'good');
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
      drawShelfBottle(c, 'beer', beer.label.bottle);
      const lab = h('canvas', 'shelf-label');
      drawLabel(lab, beer.label, beer.name);
      const spot = labelSpot(beer.label.bottle);
      Object.assign(lab.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
      bottle.append(c, lab);
      box.append(bottle);
    } else {
      // le fût, et l'étiquette de la bière collée dessus
      const wrap = h('div', 'keg-wrap');
      const c = h('canvas', 'keg-big');
      c.width = 24;
      c.height = 24;
      drawKeg(c.getContext('2d')!, 0, 0, 24, beer.label);
      const lab = h('canvas', 'keg-label');
      drawLabel(lab, beer.label, beer.name);
      wrap.append(c, lab);
      box.append(wrap);
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
      drawShelfBottle(c, kind === 'locked' ? 'empty' : kind, beer?.label.bottle);
      bottle.append(c);
      if (beer) {
        const lab = h('canvas', 'shelf-label');
        drawLabel(lab, beer.label, beer.name);
        const spot = labelSpot(beer.label.bottle);
        Object.assign(lab.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
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
    this.costGate(buy, cost);
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
      this.costGate(b, next.cost);
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
    actions.append(this.confirmBtn('btn small bad', 'Retirer', 'Retirer de la gamme ?', () => {
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
      this.costGate(b, next.cost);
      body.append(b);
    } else body.append(h('p', 'note', 'Niveau maximal'));
  }

  /** Barman en renfort : 8 h à rebrancher les fûts vides, à renouveler. */
  openBarman(): void {
    const g = this.game();
    const card = this.modalCard('Barman en renfort');
    const head = h('div', 'event-head');
    head.append(iconCanvas('barman', 2), h('p', 'hint', `Pendant ${BARMAN.duration / 3600} h, il rebranche tout seul les fûts vides avec ceux du stockage, même quand tu n'es pas là. Pense à renouveler son contrat.`));
    card.append(head);
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    card.append(h('div', g.barmanOn ? 'note' : 'stats-line', g.barmanOn ? `En poste encore ${duration(g.barmanUntil - g.time)}` : 'Pas de barman en renfort'));
    card.append(h('div', kegs ? 'stats-line strong' : 'note bad', `Fûts pleins au stockage : ${kegs}`));
    const cost = g.barmanCost;
    const tooLong = Math.max(g.time, g.barmanUntil) + BARMAN.duration - g.time > BARMAN.maxAhead;
    const go = this.btn('btn primary big', tooLong ? 'Contrat déjà prolongé au maximum (24 h)' : `${g.barmanOn ? 'Prolonger de 8 h' : 'Embaucher pour 8 h'} · ${moneyInt(cost)}`, () => {
      const r = g.hireBarman();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.toast(g.barmanUntil - g.time > BARMAN.duration + 1 ? 'Contrat prolongé' : 'Barman embauché !', 'good');
      this.onSent?.();
      this.closeModal();
    });
    const full = !g.barmanOn && g.staffBusy >= g.staffSlots;
    if (full) go.textContent = `Aucun poste libre (${g.staffBusy}/${g.staffSlots})`;
    go.disabled = tooLong || full;
    if (!go.disabled) this.costGate(go, cost);
    card.append(h('p', 'hint', `Personnel : ${g.staffBusy}/${g.staffSlots} postes occupés.`));
    card.append(go, this.btn('btn', 'Tout le personnel (bureau)', () => this.openComputer('staff')), this.btn('btn', 'Fermer', () => this.closeModal()));
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
        const next = g.nextDecor;
        el.append(this.btn('btn small', next?.id === item.id ? `🔒 Achète « ${item.name} » au magasin` : `🔒 Au magasin, après « ${next?.name} »`, () => {
          this.closeModal();
          this.openShop('bar', item.id);
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
        go.disabled = !can;
        if (can) this.costGate(go, cost);
        el.append(go);
      }
      card.append(el);
    }
    card.append(this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  // ------------------------------------------------------------------ ordinateur du bureau

  /**
   * L'ordinateur du bureau : un écran de taille fixe, le fond d'écran flouté, et par-dessus le menu des applications
   * (tableau de bord, messages, commandes, tendances, grossiste) ; chaque application s'ouvre dans une fenêtre.
   */
  openComputer(app: PcApp | null = null): void {
    if (this.view !== 'office') this.goView('office');
    this.close();
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const g = this.game();
    const pc = h('div', `pc computer pc-lv${Math.min(5, g.computerLevel)}`);
    pc.setAttribute('role', 'dialog');
    pc.setAttribute('aria-label', 'Ordinateur');
    const screen = h('div', 'pc-screen');
    // fond d'écran : l'atelier, flouté
    const wall = h('canvas', 'pc-wall');
    wall.width = SCENE_W;
    wall.height = SCENE_H;
    wall.getContext('2d')!.drawImage(this.scene.canvas, 0, 0);
    const ui = h('div', 'pc-ui');
    screen.append(wall, ui);
    const chin = h('div', 'pc-chin');
    const led = h('span', 'pc-led');
    chin.append(led, h('span', 'pc-brand', COMPUTERS[g.computerLevel - 1]!.name), this.btn('pc-power', '⏻', () => this.closeModal()));
    chin.lastElementChild!.setAttribute('aria-label', 'Éteindre l\'ordinateur');
    pc.append(screen, chin);
    this.modal.append(pc);
    this.computer = { app, key: '', ui };
    this.renderComputer();
  }

  private get unread(): number {
    return this.messages.filter((m) => !m.read).length;
  }

  /** Lettres reçues et pas encore lues : les nouvelles commandes (les autres nouvelles ne mettent pas d'enveloppe). */
  private get unreadLetters(): number {
    return this.messages.filter((m) => !m.read && m.icon === 'envelope').length;
  }

  /** Une nouvelle dans la boîte de réception du bureau. */
  log(text: string, kind: Message['kind'] = 'info', icon: IconId = 'bubble'): void {
    this.messages.unshift({ at: this.game().time, text, kind, icon, read: false });
    this.messages.length = Math.min(this.messages.length, MAX_MESSAGES);
    if (this.computer) this.refreshComputer();
  }

  /** Nouvelle partie : la boîte de réception repart de zéro, avec un mot de Gaston. */
  resetMessages(): void {
    this.messages = [];
    this.log('Gaston : bienvenue au bureau ! Les commandes, les tendances et les nouvelles de la brasserie arrivent ici.', 'info', 'bubble');
  }

  private computerKey(g: Game): string {
    const app = this.computer?.app;
    return JSON.stringify([app, g.computerLevel, g.orders.map((o) => o.id), g.readyOrders.length, this.messages.length, this.unread,
      app === 'staff' ? [g.staffBusy, g.staffSlots, Math.floor(g.money >= g.staffCost('courier') ? 1 : 0), STAFF.map((x) => Math.ceil((g.staffEnd(x.id) - g.time) / 60))] : 0,
      app === 'trends' || app === 'orders' || app === 'wholesale' ? [g.adId, g.advertising, ADS.map((a) => g.money >= g.adCost(a.id)), g.gems >= AD_EXTEND.gems, g.computerLevel, g.money >= (COMPUTERS[g.computerLevel]?.cost ?? Infinity), g.trends, g.beers.map((b) => [b.id, b.stock, b.kegs.length, Math.round(b.pop * 10), Math.round(b.wsToday)]), [...this.picks]] : 0]);
  }

  /** Reconstruit l'écran quand une commande arrive, expire, ou que le stock change ; le tableau de bord vit en direct. */
  private refreshComputer(): void {
    if (!this.computer || !this.modalOpen) return;
    const g = this.game();
    const st = this.computer;
    if (performance.now() < this.deliveringUntil) return; // la lettre livrée reste le temps de son tampon
    if (this.computerKey(g) !== st.key) return this.renderComputer();
    const pcClock = st.ui.querySelector('.pc-clock');
    if (pcClock) pcClock.textContent = gameClock(g.time);
    if (st.app === 'dashboard') {
      const now = Math.floor(performance.now() / 1000);
      const body = st.ui.querySelector<HTMLElement>('.pc-body');
      if (body && now !== this.dashAt) {
        this.dashAt = now;
        this.dashboardPage(g, body);
      }
    }
    st.ui.querySelectorAll<HTMLElement>('[data-expires]').forEach((el) => {
      if (el.classList.contains('timer')) this.paintTimer(el, g.time);
      else el.textContent = `⏳ ${duration(Number(el.dataset.expires) - g.time)}`;
    });
    const waits = g.slotWaits;
    st.ui.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => (el.textContent = countdown(waits[Number(el.dataset.slot)] ?? 0)));
  }

  private renderComputer(): void {
    const g = this.game();
    const st = this.computer!;
    const ui = st.ui;
    const oldBody = ui.querySelector('.pc-body');
    const scroll = oldBody && oldBody.getAttribute('data-app') === st.app ? oldBody.scrollTop : 0;
    st.key = this.computerKey(g);
    ui.replaceChildren();
    // barre du haut : le système, l'heure du jeu
    const bar = h('div', 'pc-bar');
    bar.append(h('span', 'pc-os', 'BREW OS'), h('span', 'pc-clock', gameClock(g.time)));
    ui.append(bar);
    if (!st.app) {
      ui.append(this.pcHome(g));
      return;
    }
    const def = PC_APPS.find((a) => a.id === st.app)!;
    const win = h('div', 'pc-window');
    const head = h('div', 'pc-win-head');
    const back = this.btn('pc-back', '‹', () => {
      st.app = null;
      this.renderComputer();
    });
    back.setAttribute('aria-label', 'Retour au menu');
    const title = h('span', 'pc-win-title');
    title.append(iconCanvas(def.icon, 1, 'pc-win-icon'), h('span', '', def.name));
    const x = this.btn('pc-x', '✕', () => this.closeModal());
    x.setAttribute('aria-label', 'Éteindre l\'ordinateur');
    head.append(back, title, x);
    const body = h('div', 'pc-body');
    body.setAttribute('data-app', st.app);
    win.append(head, body);
    ui.append(win);
    if (st.app === 'dashboard') {
      this.dashAt = Math.floor(performance.now() / 1000);
      this.dashPick = null;
      this.dashboardPage(g, body);
    } else if (st.app === 'messages') this.messagesTab(g, body);
    else if (st.app === 'orders') this.ordersTab(g, body);
    else if (st.app === 'staff') this.staffTab(g, body);
    else if (st.app === 'trends') this.trendsTab(g, body);
    else this.wholesaleTab(g, body);
    body.scrollTop = scroll;
  }

  /** Le menu : une icône par application, avec ce qui attend dedans. */
  private pcHome(g: Game): HTMLElement {
    const home = h('div', 'pc-home');
    const ready = g.readyOrders.length;
    const badge: Record<PcApp, { text: string; hot: boolean }> = {
      dashboard: { text: '', hot: false },
      messages: { text: this.unread ? String(this.unread) : '', hot: false },
      orders: { text: g.orders.length ? String(g.orders.length) : '', hot: ready > 0 },
      staff: { text: `${g.staffBusy}/${g.staffSlots}`, hot: false },
      trends: { text: '', hot: false },
      wholesale: { text: '', hot: false },
    };
    const grid = h('div', 'pc-apps');
    for (const a of PC_APPS) {
      const b = h('button', 'pc-app');
      const icon = h('span', 'pc-app-icon');
      icon.append(iconCanvas(a.icon, 3));
      b.append(icon, h('span', 'pc-app-name', a.name));
      const bd = badge[a.id];
      if (bd.text) b.append(h('span', `room-badge pc-badge${bd.hot ? ' hot' : ''}`, bd.text));
      b.setAttribute('aria-label', `${a.name}${bd.text ? ` (${bd.text})` : ''}`);
      b.onclick = () => {
        this.computer!.app = a.id;
        this.renderComputer();
      };
      grid.append(b);
    }
    home.append(grid);
    // la dernière nouvelle, en bas de l'écran
    const last = this.messages[0];
    if (last) {
      const n = h('button', `pc-notif${last.read ? '' : ' unread'}`);
      n.append(iconCanvas(last.icon, 1, 'pc-notif-icon'), h('span', 'pc-notif-text', last.text));
      n.onclick = () => {
        this.computer!.app = 'messages';
        this.renderComputer();
      };
      home.append(n);
    }
    return home;
  }

  /** Le personnel : des postes selon le niveau de la brasserie, des contrats de 8 h qu'on prolonge jusqu'à 24 h. */
  private staffTab(g: Game, card: HTMLElement): void {
    const next = STAFF_SLOTS.findIndex((n, i) => i >= g.breweryLevel && n > g.staffSlots);
    card.append(h('div', 'stats-line strong', `Postes occupés : ${g.staffBusy} / ${g.staffSlots}`));
    card.append(h('p', 'hint', next >= 0 ? `Un poste de plus quand la brasserie passe ★${next + 1}.` : 'Tous les postes sont ouverts.'));
    for (const def of STAFF) {
      const on = g.staffOn(def.id);
      const left = g.staffEnd(def.id) - g.time;
      const el = h('div', `card staff${on ? ' banner' : ''}`);
      const head = h('div', 'event-head');
      const title = h('div', 'event-title');
      title.append(h('span', 'beer-name', def.name), h('span', 'hint', def.role));
      head.append(iconCanvas(def.id, 3), title);
      el.append(head, h('p', 'hint', def.text));
      const state = h('div', 'stats-line', on ? `En poste · encore ${duration(left)}` : 'Libre');
      el.append(state);
      const cost = g.staffCost(def.id);
      const full = !on && g.staffBusy >= g.staffSlots;
      const tooLong = on && left + STAFF_CONTRACT.duration > STAFF_CONTRACT.maxAhead;
      const b = this.btn('btn primary', full ? 'Aucun poste libre' : tooLong ? 'Contrat au maximum (24 h)' : `${on ? 'Prolonger de 8 h' : 'Embaucher pour 8 h'} · ${moneyShort(cost)}`, () => {
        const r = g.hire(def.id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(on ? 'Contrat prolongé' : `${def.name} embauché !`, 'good');
        this.computer!.key = '';
        this.refreshComputer();
      });
      b.disabled = full || tooLong;
      if (!b.disabled) this.costGate(b, cost);
      el.append(b);
      card.append(el);
    }
  }

  /** La boîte de réception : tout ce qui s'est passé à la brasserie ; l'ouvrir marque tout comme lu. */
  private messagesTab(g: Game, card: HTMLElement): void {
    if (!this.messages.length) card.append(h('p', 'hint', 'Aucun message.'));
    for (const m of this.messages) {
      const el = h('div', `pc-msg ${m.kind}${m.read ? '' : ' unread'}`);
      el.append(iconCanvas(m.icon, 2, 'pc-msg-icon'));
      const txt = h('div', 'pc-msg-body');
      txt.append(h('span', 'pc-msg-text', m.text), h('span', 'pc-msg-time', ago(g.time - m.at)));
      el.append(txt);
      card.append(el);
    }
    for (const m of this.messages) m.read = true;
    if (this.computer) this.computer.key = this.computerKey(g);
  }

  /** Améliorer l'ordinateur : une place de plus au tableau des commandes, et un bureau plus beau. */
  openComputerUp(): void {
    const g = this.game();
    const cur = COMPUTERS[g.computerLevel - 1]!;
    const next = COMPUTERS[g.computerLevel];
    const card = this.modalCard('Améliorer l\'ordinateur');
    card.append(h('div', 'stats-line strong', `${cur.name} · ${cur.slots} places de commandes`));
    if (!next) {
      card.append(h('p', 'hint', 'Ton ordinateur est au sommet.'), this.btn('btn', 'Fermer', () => this.closeModal()));
      return;
    }
    card.append(h('p', 'hint', `Suivant : ${next.name}, ${next.slots} places au tableau des commandes, et un nouveau décor pour le bureau.`));
    const buy = this.btn('btn primary big', `Installer · ${moneyInt(next.cost)}`, () => {
      const r = g.upgradeComputer();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.toast(`${next.name} installé`, 'good');
      this.closeModal();
    });
    this.costGate(buy, next.cost);
    card.append(buy);
    if (g.money < next.cost) card.append(h('p', 'note bad', `Il te manque ${moneyInt(next.cost - g.money)}.`));
    card.append(this.btn('btn', 'Annuler', () => this.closeModal()));
  }

  /**
   * Le tableau des commandes : une lettre par commande (celles qu'on peut livrer en haut), puis les emplacements
   * libres, chacun avec le temps avant sa prochaine lettre.
   */
  private ordersTab(g: Game, card: HTMLElement): void {
    for (const id of this.picks.keys()) if (!g.orders.some((o) => o.id === id)) this.picks.delete(id);
    const ready = new Set(g.readyOrders.map((o) => o.id));
    const sorted = [...g.orders].sort((a, b) => Number(ready.has(b.id)) - Number(ready.has(a.id)) || a.expires - b.expires);
    for (const o of sorted) card.append(this.orderCard(g, o));
    g.slotWaits.forEach((w, i) => card.append(this.emptySlot(g, w, i)));
    // l'ordinateur : une place de plus au tableau à chaque niveau
    const next = COMPUTERS[g.computerLevel];
    const foot = h('div', 'pc-foot');
    foot.append(h('span', 'hint', `${COMPUTERS[g.computerLevel - 1]!.name} · ${g.boardSlots} emplacements`));
    if (next) {
      const b = this.btn('btn small', `+1 place · ${moneyShort(next.cost)}`, () => {
        const r = g.upgradeComputer();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${next.name} installé`, 'good');
        this.computer!.key = '';
        this.refreshComputer();
      });
      this.costGate(b, next.cost);
      foot.append(b);
    }
    card.append(foot);
  }

  /** Minuteur lisible : une horloge et le temps, en clair sur fond d'encre ; sa couleur dit l'urgence. */
  private timer(text: string, cls = ''): HTMLElement {
    const t = h('span', `timer ${cls}`);
    t.append(iconCanvas('clock', 1, 'timer-icon'), h('span', 'timer-text', text));
    return t;
  }

  /** Un emplacement libre : le temps avant sa prochaine lettre ; le plus proche propose la prospection. */
  private emptySlot(g: Game, wait: number, i: number): HTMLElement {
    const el = h('div', 'slot-free');
    const t = this.timer(countdown(wait), 'wait');
    t.querySelector<HTMLElement>('.timer-text')!.dataset.slot = String(i);
    const info = h('div', 'slot-free-info');
    info.append(h('span', 'slot-free-text', 'Prochaine lettre'), t);
    el.append(iconCanvas('envelope', 2, 'slot-free-icon'), info);
    if (i === 0) {
      const b = this.gemsBtn('Prospecter', g.boostCost('prospect'), () => {
        const r = g.buyBoost('prospect');
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast('Une lettre arrive !', 'good');
        this.computer!.key = '';
        this.refreshComputer();
      });
      b.setAttribute('aria-label', `Prospecter : une lettre tout de suite, pour ${gemsText(g.boostCost('prospect'))}`);
      el.append(b);
    }
    return el;
  }

  /**
   * Une commande, en lettre épurée : qui et combien de temps il reste ; ce qu'il demande (type, quantité, style,
   * qualité) ; ce qui partira ; le bouton d'envoi avec ce qu'elle rapporte.
   */
  private orderCard(g: Game, o: Order): HTMLElement {
    if (!this.picks.has(o.id)) this.picks.set(o.id, g.autoPick(o));
    const pick = this.picks.get(o.id)!;
    const q = g.quote(o, pick);
    const card = h('div', `letter kind-${o.kind}${q.ok ? ' ready' : ''}`);
    // en-tête : le client, le temps qui reste (et sa barre)
    const head = h('div', 'letter-head');
    const time = this.timer(duration(o.expires - g.time));
    time.dataset.expires = String(o.expires);
    time.dataset.received = String(o.received);
    head.append(h('span', 'letter-client', o.client), time);
    card.append(head);
    this.paintTimer(time, g.time);
    // la demande, sur une seule ligne : type (seulement s'il compte), quantité, style, qualité
    const ask = h('div', 'letter-ask');
    if (o.kind !== 'classic') ask.append(h('span', `ask-kind${o.kind === 'urgent' ? ' urgent' : ''}`, KIND_LABEL[o.kind]));
    ask.append(iconCanvas(o.kind === 'keg' ? 'keg' : 'range', 1, 'ask-icon'));
    const want = o.want ? trendById(o.want) : undefined;
    const parts = [`${o.qty}${o.kind === 'keg' ? ` fût${o.qty > 1 ? 's' : ''}` : ''}`];
    if (o.mix) parts.push(`${o.mix} bières`);
    if (want) parts.push(want.short);
    ask.append(h('span', 'ask-text', parts.join(' · ')));
    const q5 = Math.round(o.minQuality * 5);
    const quality = h('span', 'ask-quality', '★'.repeat(q5) + '☆'.repeat(5 - q5));
    quality.setAttribute('aria-label', `Qualité minimale : ${Math.round(o.minQuality * 100)} %`);
    ask.append(quality);
    card.append(ask);
    // ce qui partira
    const ok = g.suitable(o);
    const avail = (b: Beer) => (o.kind === 'keg' ? b.kegs.length : b.stock);
    if (!ok.length) card.append(h('p', 'letter-status none', '✗ Aucune bière ne convient'));
    else if (!this.editing.has(o.id)) {
      const line = h('div', `letter-status ${q.ok ? 'ok' : 'short'}`);
      const names = (q.take.length ? q.take.map((t) => t.beer) : ok).map((b) => b.name).join(', ');
      line.append(h('span', 'letter-status-text', q.ok ? `✓ ${names}` : `Stock insuffisant : ${names}`));
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
        const chip = h('button', `chip${on ? ' active' : ''}`, `${b.name} · ${avail(b)}`);
        chip.disabled = !on && avail(b) <= 0;
        chip.onclick = () => {
          this.picks.set(o.id, on ? pick.filter((x) => x !== b.id) : [...pick, b.id]);
          this.refreshComputer();
        };
        chips.append(chip);
      }
      card.append(chips);
    }
    // envoyer : le bouton dit ce que rapporte la commande (euros + diamants)
    const row = h('div', 'row');
    const gems = orderGems(o);
    const send = this.btn('btn primary order-send', '', () => {
      const r = g.fulfill(o.id, pick);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.picks.delete(o.id);
      this.editing.delete(o.id);
      this.onSent?.();
      this.sheetKey = '';
      this.deliver(card, send, r.amount!, gems);
    });
    send.disabled = !q.ok;
    const gain = h('span', 'order-gain');
    // les diamants n'apparaissent que si la lettre en porte (commande difficile, ou pourboire d'une commande simple)
    gain.append(h('span', '', moneyInt(o.reward)));
    if (gems > 0) gain.append(h('span', 'order-gain-sep', '+'), iconCanvas('gem', 1, 'gems-icon'), h('span', '', String(gems)));
    send.append(h('span', 'order-send-label', 'Envoyer'), gain);
    send.setAttribute('aria-label', `Envoyer : ${moneyInt(o.reward)}${gems > 0 ? ` et ${gemsText(gems)}` : ''}`);
    row.append(send, this.confirmBtn('btn small letter-decline', 'Refuser', 'Refuser ?', () => {
      g.declineOrder(o.id);
      this.picks.delete(o.id);
      this.computer!.key = '';
      this.refreshComputer();
    }));
    card.append(row);
    return card;
  }

  /** Minuteur d'une commande : le temps qui reste ; il ne passe au rouge qu'au dernier cinquième. */
  private paintTimer(timer: HTMLElement, now: number): void {
    const end = Number(timer.dataset.expires);
    const start = Number(timer.dataset.received);
    const k = Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start)));
    const level = k <= 0.2 ? 'low' : k <= 0.5 ? 'mid' : '';
    timer.classList.toggle('mid', level === 'mid');
    timer.classList.toggle('low', level === 'low');
    const text = timer.querySelector('.timer-text')!;
    const t = duration(end - now);
    if (text.textContent !== t) text.textContent = t;
  }

  /** Livraison : le tampon « LIVRÉ » s'abat, les pièces et les diamants filent vers les compteurs du haut. */
  private deliveringUntil = 0;
  private deliver(card: HTMLElement, from: HTMLElement, amount: number, gems: number): void {
    this.deliveringUntil = performance.now() + 1300;
    card.classList.add('delivered');
    card.append(h('div', 'letter-delivered', 'LIVRÉ'));
    this.gainToast(amount);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      this.fly(from, this.moneyPill, 6, () => h('span', 'fly coin'));
      this.fly(from, this.gemsPill, Math.min(6, gems), () => iconCanvas('gem', 1, 'fly fly-gem'));
    }
    window.setTimeout(() => {
      this.deliveringUntil = 0;
      if (this.computer) this.computer.key = '';
      this.refreshComputer();
    }, 1300);
  }

  /** Fait voler quelques pièces (ou diamants) d'un élément vers un autre. */
  private fly(from: HTMLElement, to: HTMLElement, n: number, make: () => HTMLElement): void {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const el = make();
      const x0 = a.left + a.width * (0.5 + (Math.random() - 0.5) * 0.6);
      const y0 = a.top + a.height / 2;
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, transitionDelay: `${i * 70}ms` });
      document.body.append(el);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transform = `translate(${b.left + b.width / 2 - x0}px, ${b.top + b.height / 2 - y0}px) scale(.7)`;
        el.style.opacity = '0.2';
      }));
      window.setTimeout(() => el.remove(), 900 + i * 70);
    }
    window.setTimeout(() => {
      to.classList.remove('bump');
      void to.offsetWidth;
      to.classList.add('bump');
    }, 700);
  }

  /** Les campagnes de pub : une par niveau de l'ordinateur, une seule à la fois ; celle en cours se prolonge en diamants. */
  private adsBox(g: Game): HTMLElement {
    const cur = g.ad;
    const box = h('div', `post${cur ? ' live' : ''}`);
    const head = h('div', 'post-head');
    head.append(h('span', 'post-name', 'Campagnes de pub'));
    if (cur) {
      const left = h('span', '', duration(g.adUntil - g.time));
      left.dataset.expires = String(g.adUntil);
      head.append(h('span', 'post-state on', ''));
      head.lastElementChild!.append(left);
    }
    box.append(head);
    for (const ad of ADS) {
      const mine = cur?.id === ad.id;
      const row = h('div', `boost-row ad-row${mine ? ' mine' : ''}`);
      const icon = h('div', 'boost-icon');
      icon.append(iconCanvas(AD_ICON[ad.id], 2));
      const text = h('div', 'boost-text');
      text.append(h('span', 'boost-name', ad.name), h('span', 'boost-effect', adEffect(ad)));
      const cost = g.adCost(ad.id);
      let b: HTMLButtonElement;
      if (!g.adUnlocked(ad.id)) {
        const pc = COMPUTERS[ad.computer - 1]!;
        b = this.btn('btn price lock', `🔒 ${pc.name}`, () => this.toast(`${ad.name} : avec l'ordinateur « ${pc.name} »`, 'info'));
      } else if (mine) {
        b = this.gemsBtn(`+${AD_EXTEND.hours} h`, AD_EXTEND.gems, () => {
          const r = g.extendAd();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${ad.name} : prolongée de ${AD_EXTEND.hours} h`, 'good');
          this.onSent?.();
          this.computer!.key = '';
          this.refreshComputer();
        });
        b.setAttribute('aria-label', `Prolonger ${ad.name} de ${AD_EXTEND.hours} heures : ${gemsText(AD_EXTEND.gems)}`);
      } else if (cur) {
        b = this.btn('btn price lock', 'occupé', () => this.toast(`${cur.name} est en cours : une seule campagne à la fois`, 'info'));
      } else {
        b = this.btn('btn primary price', moneyShort(cost), () => {
          const r = g.advertise(ad.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${ad.name} : ta gamme fait parler d'elle`, 'good');
          this.computer!.key = '';
          this.refreshComputer();
        });
        b.setAttribute('aria-label', `Lancer ${ad.name} : ${moneyInt(cost)}`);
        this.costGate(b, cost);
      }
      row.append(icon, text, b);
      box.append(row);
    }
    return box;
  }

  /** La popularité de la marque et les tendances du moment. */
  private trendsTab(g: Game, card: HTMLElement): void {
    card.append(h('div', 'stats-line strong', `Ta marque : ${starText(g.brand)}`));
    card.append(this.adsBox(g));
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

  /** Le grossiste : il reprend bouteilles et fûts à tout moment, à petit prix, dans la limite d'un quota par bière (en litres, rechargé à minuit). */
  private wholesaleTab(g: Game, card: HTMLElement): void {
    const auto = h('label', 'toggle');
    const box = h('input');
    box.type = 'checkbox';
    box.checked = g.autoWholesale;
    box.onchange = () => (g.autoWholesale = box.checked);
    auto.append(box, h('span', '', 'Vendre automatiquement quand le stockage est plein'));
    card.append(auto, h('p', 'hint', 'Bouteilles et fûts, à petit prix, dans la limite d\'un quota par bière qui se recharge à minuit. Plus une bière est populaire, plus il en reprend.'));
    const beers = g.beers.filter((b) => (b.stock > 0 || b.kegs.length > 0) && b.tasting.quality >= DRINKABLE_MIN);
    if (!beers.length) card.append(h('p', 'hint', 'Rien en stock.'));
    for (const b of beers) {
      const box = h('div', 'ws-beer');
      const head = h('div', 'stock-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      const quota = g.wholesaleQuota(b);
      const left = g.wholesaleLeft(b);
      const open = !Number.isFinite(quota); // grossiste sans limite (boost)
      head.append(thumb, h('span', 'stock-name', b.name), h('span', `ws-quota${left <= 0 ? ' full' : ''}`, open ? 'sans limite' : `${liters(quota - left)} / ${liters(quota)}`));
      const bar = h('div', 'ws-bar');
      const fill = h('div', 'ws-fill');
      fill.style.width = `${open ? 0 : Math.min(100, quota ? (100 * (quota - left)) / quota : 100)}%`;
      bar.append(fill);
      box.append(head, bar);
      const perL = wholesalePrice(b.tasting) / BOTTLE_L;
      const row = (format: Format, have: number, what: string, one: { n: number; label: string }) => {
        if (have <= 0) return;
        const can = g.wholesaleSellable(b, format);
        const el = h('div', 'ws-row');
        el.append(h('span', 'ws-have', what));
        const sell = (n: number, label: string) => {
          const btn = this.btn('btn small', label, () => {
            const r = g.sellWholesale(b.id, n, format);
            if (!r.ok) return this.toast(r.reason!, 'bad');
            this.gainToast(r.amount!);
            this.refreshComputer();
          });
          btn.disabled = can <= 0;
          return btn;
        };
        if (can > one.n) el.append(sell(one.n, one.label));
        const kegL = [...b.kegs].sort((x, y) => x - y).slice(0, can).reduce((s, k) => s + k * GLASS_L, 0);
        const value = (format === 'bottle' ? can * BOTTLE_L : kegL) * perL;
        el.append(sell(can, can > 0 ? `${can === have ? 'Tout' : can} · ${moneyInt(value)}` : 'Quota atteint'));
        box.append(el);
      };
      row('bottle', b.stock, `${b.stock} btl`, { n: CRATE, label: '1 caisse' });
      row('keg', b.kegs.length, `${b.kegs.length} fût${b.kegs.length > 1 ? 's' : ''}`, { n: 1, label: '1 fût' });
      card.append(box);
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
    this.officeRoom.selected = null;
    this.roomsDrawUntil = performance.now() + 600;
    this.placeTrack();
    this.setBottom();
    this.update();
  }

  /** Une zone tactile par fût de la cave : toucher un fût permet de le changer. */
  private kegKey = '';
  /** Zone tactile du panneau lumineux : sa place change avec le niveau du bar (voir decorLayout). */
  private signRect = { x: 52, y: 32, w: 56, h: 16 };

  private syncKegHits(force = false): void {
    const g = this.game();
    const n = g.taps.length;
    const key = `${n}|${g.partying}|${g.barLevel}`;
    if (!force && this.kegKey === key) return;
    this.kegKey = key;
    const sign = decorLayout.bar[g.barLevel]?.find((i) => i.a.startsWith('neonSign'));
    const box = sign && instBox(sign);
    if (box) Object.assign(this.signRect, { x: box.x - 4, y: box.y - 3, w: box.w + 8, h: box.h + 6 });
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
    const btns = this.view === 'workshop' ? [this.rangeBtn, this.brewBtn] : this.view === 'bar' ? [this.barmanBtn, this.eventsBtn] : [];
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
        this.costGate(buy, slotCost);
        card.append(buy);
      }
    }
    // le premier essai, guidé par Gaston, ne se jette pas
    if (!g.beers.length && g.tips < 4) return void card.append(keep);
    card.append(keep, this.confirmBtn('btn bad', 'Jeter', 'Jeter ce brassin ? Toucher pour confirmer', () => {
      g.discardTrial();
      this.closeModal();
      this.toast('Brassin jeté', 'info');
      this.sheetKey = '';
    }));
  }

  /**
   * Éditeur d'étiquette : forme, fond, motif, couleurs, emblème, police ; aperçu en direct.
   * Ce qui n'est pas débloqué porte un cadenas et renvoie au magasin. `base` est l'étiquette d'origine :
   * ce qu'elle porte déjà reste utilisable.
   */
  openLabelEditor(name: string, initial: Label, onDone: (name: string, label: Label) => void, base: Label = initial): void {
    const label: Label = { ...initial };
    const card = this.modalCard('Ton étiquette');
    const preview = h('div', 'label-preview');
    const big = h('canvas', 'label-big');
    const bottle = h('div', 'shelf-bottle');
    const glass = h('canvas', 'shelf-glass');
    const small = h('canvas', 'shelf-label');
    bottle.append(glass, small);
    preview.append(big, bottle);
    const input = h('input', 'name-input');
    input.maxLength = 22;
    input.placeholder = 'Nom de ta bière';
    input.value = name;
    const redraw = () => {
      drawLabel(big, label, input.value);
      drawLabel(small, label, input.value);
      drawShelfBottle(glass, 'beer', label.bottle);
      const spot = labelSpot(label.bottle);
      Object.assign(small.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
    };
    const g = this.game();
    input.oninput = redraw;
    card.append(preview, h('div', 'section-title', 'Nom'), input);
    const isOpen = (kind: UnlockKind, value: string) => g.isUnlocked(kind, value) || String(base[kind]) === value;
    const chooser = <K extends keyof Label>(title: string, key: K, options: { id: Label[K]; name: string }[], kind?: UnlockKind) => {
      const row = h('div', 'chips');
      for (const o of options) {
        const open = !kind || isOpen(kind, String(o.id));
        const x = LABEL_UNLOCKS.find((u) => u.kind === kind && u.value === o.id);
        const c = this.btn(`chip${(label[key] ?? 'classic') === o.id ? ' active' : ''}${open ? '' : ' locked'}`, open ? o.name : `🔒 ${o.name}`, () => {
          if (!open) return this.toast(`« ${o.name} » se débloque au magasin, rayon Étiquettes · ${x?.gems ? gemsText(x.gems) : moneyShort(x?.cost ?? 0)}`, 'info');
          label[key] = o.id;
          row.querySelectorAll('.chip').forEach((y) => y.classList.toggle('active', y === c));
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
    chooser('Bouteille', 'bottle', BOTTLES, 'bottle');
    chooser('Forme', 'shape', SHAPES, 'shape');
    colors('Fond', 'bg');
    chooser('Motif', 'pattern', PATTERNS, 'pattern');
    colors('Couleur du motif', 'patternColor');
    chooser('Emblème', 'emblem', EMBLEMS, 'emblem');
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
    this.toast(`+${moneyInt(o.earned)} · ${hrs ? `${hrs} h ` : ''}${min} min d'absence, ${liters(o.liters ?? 0)} vendus`, 'good');
    this.log(`Pendant ton absence (${hrs ? `${hrs} h ` : ''}${min} min) : ${liters(o.liters ?? 0)} de bière vendus, +${moneyInt(o.earned)}`, 'good', 'chart');
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
    card.append(h('div', 'stats-line', `${g.batchesDone} brassins · ${liters(g.totalLiters)} vendus · ${moneyInt(g.totalRevenue)}`));
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
    if (import.meta.env.DEV) card.append(speed);
    card.append(fresh, this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  /** Le message qui défile sur le panneau lumineux du comptoir. */
  private openBarMessage(): void {
    const g = this.game();
    const card = this.modalCard('Panneau lumineux');
    const input = h('input', 'name-input');
    input.maxLength = BAR_MESSAGE_MAX;
    input.placeholder = BAR_MESSAGE;
    input.value = g.barMessage;
    const save = () => {
      g.setBarMessage(input.value);
      this.closeModal();
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') save(); };
    card.append(
      h('div', 'stats-line', `Le message qui défile sur la façade du comptoir (${BAR_MESSAGE_MAX} caractères au plus).`),
      input,
      this.btn('btn primary', 'Afficher ce message', save),
    );
    input.focus();
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

  /** Tableau de bord (application de l'ordinateur) : un aperçu en direct des ventes et de la brasserie. */
  private dashboardPage(g: Game, page: HTMLElement): void {
    const scroll = page.scrollTop;
    page.replaceChildren();
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
    kpi('Recettes totales', moneyShort(g.totalRevenue), `${liters(g.totalLiters)} vendus`);
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
    if (g.ad) line(g.ad.name, `📣 ${clock(g.adUntil - g.time)}`);
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
        el.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', `${liters(b.liters)} · ${moneyShort(b.revenue)}`), h('span', 'pop-stars', starText(b.pop)));
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

  // ------------------------------------------------------------------ magasin

  /** Les trois onglets du magasin ; le rayon s'affiche dessous. */
  private buildShop(): void {
    const tabs = h('div', 'shop-tabs');
    for (const t of SHOP_TABS) {
      const btn = h('button', 'shop-tab');
      const mark = h('span', 'shop-tab-mark hidden');
      btn.append(iconCanvas(t.icon, 2, 'shop-tab-icon'), h('span', 'shop-tab-name', t.name), mark);
      btn.onclick = () => this.openShop(t.id);
      tabs.append(btn);
      this.shopTabs.set(t.id, { btn, mark });
    }
    this.shopPane.append(tabs, this.shopBody);
  }

  /** Ouvre le magasin sur un onglet (et, au bar, sur une pièce de la décoration). */
  openShop(tab: ShopTab = this.shopTab, pick?: DecorId): void {
    this.shopTab = tab;
    if (pick) this.decorPick = pick;
    this.shopKey = '';
    this.closeModal();
    if (this.view !== 'shop') this.goView('shop');
    else this.renderShop();
  }

  /** Ce qui est devenu abordable depuis la dernière visite : la prochaine décoration, les étiquettes. */
  private shopNews(g: Game): string[] {
    const out: string[] = [];
    const next = g.nextDecor;
    if (next && g.money >= next.cost) out.push(`decor:${next.id}`);
    for (const x of LABEL_UNLOCKS) {
      if (!g.unlocked.includes(x.id) && (x.gems ? g.gems >= x.gems : g.money >= x.cost)) out.push(`label:${x.id}`);
    }
    return out.filter((k) => !this.shopSeen.has(k));
  }

  /**
   * Les boosts actifs, empilés en haut à droite de l'écran : l'icône du boost et le temps qui reste.
   * Les toucher ouvre les boosts du magasin. Masqués au magasin (le rayon les montre) et sous une fenêtre.
   */
  private renderBoostHud(g: Game): void {
    const live = BOOST_POSTS.flatMap((p) => {
      const b = p.id ? g.boostOf(p.id) : null;
      return b && p.id ? [{ ch: p.id, ...b }] : [];
    });
    const hide = !live.length || this.view === 'shop' || this.modalOpen;
    this.boostHud.classList.toggle('hidden', hide);
    this.boostHud.classList.toggle('below-harvest', !this.harvest.classList.contains('hidden'));
    if (hide) return;
    const mult = (id: string) => BOOSTS.find((x) => x.id === id)?.mult ?? 1;
    const key = live.map((b) => `${b.ch}:${mult(b.id)}`).join('|');
    if (key !== this.boostHudKey) {
      this.boostHudKey = key;
      this.boostHud.replaceChildren();
      for (const b of live) {
        // l'effet : l'icône du poste, le multiplicateur posé dessus, puis le temps qui reste
        const el = h('button', `boost-chip effect-${b.ch}`);
        const icon = h('span', 'boost-chip-icon');
        // le grossiste sans limite : une caisse marquée « ∞ »
        const gate = b.id === 'openGate';
        icon.append(iconCanvas(gate ? 'crate' : EFFECT_ICON[b.ch], 2), h('span', 'boost-chip-mult', gate ? '∞' : `×${String(mult(b.id)).replace('.', ',')}`));
        el.append(icon, h('span', 'boost-chip-time'));
        el.onclick = () => this.openShop('boosts');
        this.boostHud.append(el);
      }
    }
    this.boostHud.querySelectorAll<HTMLElement>('.boost-chip').forEach((el, i) => {
      const b = live[i]!;
      const left = Math.max(0, b.until - g.time);
      const t = left >= 3600 ? `${Math.floor(left / 3600)} h ${String(Math.floor((left % 3600) / 60)).padStart(2, '0')}` : clock(left);
      const span = el.lastElementChild!;
      if (span.textContent !== t) span.textContent = t;
      el.setAttribute('aria-label', `${b.id === 'openGate' ? 'Grossiste sans limite' : `${EFFECT_NAME[b.ch]} ×${String(mult(b.id)).replace('.', ',')}`} : encore ${duration(left)}`);
    });
  }

  /** Redessine le rayon quand ce qu'il montre change ; la bulle de Gaston et les minuteurs, à chaque appel. */
  private renderShop(): void {
    const g = this.game();
    const tab = this.shopTab;
    // ce que le joueur voit est « vu » : la pastille de l'onglet Magasin s'éteint
    if (this.view === 'shop') {
      for (const k of this.shopNews(g)) if ((tab === 'bar') === k.startsWith('decor:')) this.shopSeen.add(k);
    }
    // marques des onglets : décoration abordable, boost en cours (temps restant), étiquette abordable
    const live = BOOST_POSTS.flatMap((p) => (p.id ? [g.boostOf(p.id)] : [])).filter((b) => !!b);
    const soonest = live.length ? Math.min(...live.map((b) => b!.until)) - g.time : 0;
    const next = g.nextDecor;
    const marks: Record<ShopTab, { text: string; cls: string }> = {
      bar: next && g.money >= next.cost ? { text: '', cls: 'dot' } : { text: '', cls: '' },
      boosts: soonest > 0 ? { text: clock(soonest), cls: 'timer' } : { text: '', cls: '' },
      labels: LABEL_UNLOCKS.some((x) => !g.unlocked.includes(x.id) && !x.gems && g.money >= x.cost) ? { text: '', cls: 'dot' } : { text: '', cls: '' },
    };
    for (const [id, { btn, mark }] of this.shopTabs) {
      btn.classList.toggle('active', id === tab);
      const m = marks[id];
      if (mark.textContent !== m.text) mark.textContent = m.text;
      mark.className = `shop-tab-mark ${m.cls}${m.cls ? '' : ' hidden'}`;
    }
    this.shopBody.querySelectorAll<HTMLElement>('[data-until]').forEach((el) => (el.textContent = clock(Math.max(0, Number(el.dataset.until) - g.time))));
    const key = JSON.stringify([
      tab, this.decorPick, this.labelTab, g.gems, g.owned, g.furniture, g.unlocked, g.barLevel, g.beers.length,
      tab === 'bar' ? DECOR_ORDER.map((id) => g.money >= g.decorDef(id).cost) : 0,
      tab === 'boosts' ? [BOOSTS.map((b) => [b.channel ? g.boostOf(b.channel)?.id : 0, g.boostBlocked(b.id)]), g.batches.length > 0 || g.planned > 0] : 0,
      tab === 'labels' ? LABEL_UNLOCKS.map((x) => g.money >= x.cost) : 0,
    ]);
    if (key === this.shopKey) return;
    this.shopKey = key;
    const scroll = this.shopBody.scrollTop;
    this.shopBody.replaceChildren();
    this.showcaseScene = null;
    if (tab === 'bar') this.shopBar(g);
    if (tab === 'boosts') this.shopBoosts(g);
    if (tab === 'labels') this.shopLabels(g);
    this.shopBody.scrollTop = scroll;
  }

  /** Bouton de prix en diamants : doré si on peut payer, sinon grisé (il dit ce qui manque). */
  private gemsBtn(text: string, gems: number, run: () => void, cls = ''): HTMLButtonElement {
    const b = h('button', `btn price gems-price ${cls}`);
    b.append(h('span', '', text ? `${text} · ` : ''), iconCanvas('gem', 1, 'gems-icon'), h('span', '', String(gems)));
    const short = this.game().gems < gems;
    b.classList.toggle('primary', !short);
    b.classList.toggle('short', short);
    b.onclick = () => {
      const missing = gems - this.game().gems;
      if (missing > 0) return this.toast(`Il te manque ${gemsText(missing)} : les commandes livrées en rapportent`, 'bad');
      run();
    };
    return b;
  }

  /** Rayon Bar : la vitrine (la pièce choisie, montrée dans le bar), puis toute la piste de la décoration. */
  private shopBar(g: Game): void {
    const next = g.nextDecor;
    const pick = this.decorPick ?? next?.id ?? DECOR_ORDER[DECOR_ORDER.length - 1]!;
    const d = g.decorDef(pick);
    const owned = g.ownsDecor(pick);
    const isNext = next?.id === pick;
    const idx = DECOR_ORDER.indexOf(pick);
    const ev = d.event ? BAR_EVENTS.find((e) => e.needs === pick) : undefined;
    // vitrine
    const card = h('div', `vitrine${isNext ? ' next' : ''}`);
    const scene = h('div', 'vitrine-scene');
    scene.style.height = `${SHOWCASE_H}px`;
    scene.append(this.showcase.canvas, h('span', 'vitrine-pin', owned ? 'Dans ton bar' : 'Aperçu dans ton bar'));
    this.showcase.showcase = d.event ? { event: DECOR_EVENT[pick] } : { furniture: pick as (typeof FURNITURE)[number]['id'] };
    this.showcaseScene = scene;
    const body = h('div', 'vitrine-body');
    const name = h('div', 'vitrine-name');
    name.append(h('span', 'beer-name', d.name), h('span', `kind-tag ${d.event ? 'kind-prestige' : 'kind-style'}`, d.event ? 'Événement' : 'Mobilier'));
    const fx = h('div', 'fx');
    for (const t of d.event ? [ev!.name, `${ev!.mult} fois plus de clients`] : furnitureEffects(pick)) fx.append(h('span', 'fx-chip', t));
    body.append(name, fx, h('p', 'hint', ev ? ev.text : d.text));
    if (owned) {
      body.append(this.btn('btn price own', '✓ Au bar · voir', () => this.goView('bar')));
    } else if (isNext) {
      const b = this.btn('btn primary price', `${d.event ? 'Acheter' : 'Installer'} · ${moneyShort(d.cost)}`, () => {
        const r = g.buyDecor(pick);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.decorPick = null;
        this.onSent?.();
        this.toast(d.event ? `${d.name} : nouvel événement au bar !` : `${d.name} : au bar !`, 'good', { label: 'Voir', run: () => this.goView('bar') });
        this.shopKey = '';
        this.renderShop();
      });
      this.costGate(b, d.cost);
      body.append(b);
    } else {
      const before = g.decorDef(DECOR_ORDER[idx - 1]!);
      body.append(this.btn('btn price lock', `🔒 Après « ${before.name} » · ${moneyShort(d.cost)}`, () => {
        this.decorPick = null;
        this.shopKey = '';
        this.renderShop();
      }));
    }
    card.append(scene, body);
    // la piste
    const count = DECOR_ORDER.filter((id) => g.ownsDecor(id)).length;
    const head = h('div', 'shop-section');
    head.append(h('span', '', 'La suite'), h('span', 'shop-section-n', `${count} / ${DECOR_ORDER.length} au bar`));
    const track = h('div', 'decor-track');
    for (const id of DECOR_ORDER) {
      const dd = g.decorDef(id);
      const own = g.ownsDecor(id);
      const slot = h('button', `decor-slot${own ? ' owned' : next?.id === id ? ' next' : ' locked'}${id === pick ? ' picked' : ''}`);
      slot.setAttribute('aria-label', `${dd.name}${own ? ' : au bar' : ` : ${moneyShort(dd.cost)}`}`);
      if (dd.event) slot.append(h('i', 'decor-ev'));
      slot.append(iconCanvas(DECOR_ICON[id], 2), h('span', 'decor-slot-price', own ? '✓' : moneyShort(dd.cost)));
      slot.onclick = () => {
        this.decorPick = id;
        this.shopKey = '';
        this.renderShop();
      };
      track.append(slot);
    }
    this.shopBody.append(card, head, track, h('p', 'hint', 'Le carré doré marque un objet d\'événement. Toucher une case la montre dans la vitrine.'));
  }

  /** Le bar de la vitrine : redessiné à chaque image, cadré sur l'objet en vente. */
  private drawShowcase(g: Game, t: number): void {
    const scene = this.showcaseScene;
    if (!scene?.isConnected) return;
    const w = scene.clientWidth;
    if (!w) return;
    const room = this.showcase;
    room.draw(g, t);
    const s = w / room.canvas.width;
    const ch = room.canvas.height * s;
    const top = Math.max(SHOWCASE_H - ch, Math.min(0, SHOWCASE_H / 2 - room.showcaseFocus(g) * s));
    Object.assign(room.canvas.style, { width: `${w}px`, height: `${ch}px`, top: `${top}px` });
  }

  /** Rayon Boosts : un bloc par poste ; un poste occupé montre son temps restant et grise les autres effets. */
  private shopBoosts(g: Game): void {
    for (const post of BOOST_POSTS) {
      const cur = post.id ? g.boostOf(post.id) : null;
      const box = h('div', `post${cur ? ' live' : ''}`);
      const head = h('div', 'post-head');
      head.append(h('span', 'post-name', post.name));
      if (cur) {
        const left = h('span', '', clock(cur.until - g.time));
        left.dataset.until = String(cur.until);
        const state = h('span', 'post-state on');
        state.append('⚡ ', left);
        head.append(state);
      }
      box.append(head);
      for (const def of BOOSTS.filter((b) => (b.channel ?? null) === post.id)) {
        const mine = cur?.id === def.id;
        const row = h('div', `boost-row${mine ? ' mine' : ''}`);
        const icon = h('div', 'boost-icon');
        icon.append(iconCanvas(BOOST_ICON[def.id], 2));
        const text = h('div', 'boost-text');
        text.append(h('span', 'boost-name', def.name), h('span', 'boost-effect', def.text));
        const blocked = g.boostBlocked(def.id);
        let b: HTMLButtonElement;
        if (blocked && cur) b = this.btn('btn price lock', 'occupé', () => this.toast(`${blocked} : celui-ci attend la fin.`, 'info'));
        else {
          const extend = !!cur;
          b = this.gemsBtn('', def.gems, () => {
            const r = g.buyBoost(def.id);
            if (!r.ok) return this.toast(r.reason!, 'bad');
            this.toast(extend ? `${def.name} : prolongé !` : `${def.name} !`, 'good');
            this.onSent?.();
            this.renderShop();
          });
          if (blocked) b.classList.add('short');
          b.setAttribute('aria-label', `${extend ? 'Prolonger avec' : 'Lancer'} ${def.name} : ${gemsText(def.gems)}`);
        }
        row.append(icon, text, b);
        box.append(row);
      }
      this.shopBody.append(box);
    }
  }

  /** Rayon Étiquettes : bouteilles, formes, logos et motifs ; toucher un objet l'essaie sur ta bière. */
  private labelTab: UnlockKind = 'bottle';
  private shopLabels(g: Game): void {
    const kind = this.labelTab;
    const tabs = h('div', 'chips');
    for (const k of UNLOCK_KINDS) {
      const all = LABEL_UNLOCKS.filter((x) => x.kind === k.id);
      const own = all.filter((x) => g.unlocked.includes(x.id)).length;
      const c = this.btn(`chip${k.id === kind ? ' active' : ''}`, `${k.name} ${own}/${all.length}`, () => {
        this.labelTab = k.id;
        this.shopKey = '';
        this.renderShop();
      });
      tabs.append(c);
    }
    const beer = g.beers[0];
    const sample = beer?.label ?? DEFAULT_LABEL;
    const name = beer?.name ?? 'Ma bière';
    const grid = h('div', `unlock-grid${kind === 'bottle' ? ' bottles' : ''}`);
    for (const x of LABEL_UNLOCKS.filter((y) => y.kind === kind)) {
      const owned = g.unlocked.includes(x.id);
      const cell = h('div', `unlock${owned ? ' owned' : ''}${x.gems ? ' premium' : ''}`);
      // l'objet, montré avec l'étiquette de ta première bière
      const preview = h('div', 'unlock-preview');
      const l = { ...sample, [x.kind]: x.value } as Label;
      if (x.kind === 'bottle') {
        const bottle = h('div', 'shelf-bottle');
        const c = h('canvas', 'shelf-glass');
        drawShelfBottle(c, 'beer', l.bottle);
        const lab = h('canvas', 'shelf-label');
        drawLabel(lab, l, name);
        const spot = labelSpot(l.bottle);
        Object.assign(lab.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
        bottle.append(c, lab);
        preview.append(bottle);
      } else {
        const c = h('canvas', 'label-thumb big');
        drawLabel(c, l, name);
        preview.append(c);
      }
      cell.append(preview, h('span', 'unlock-name', x.name));
      let b: HTMLButtonElement;
      if (owned) b = this.btn('btn price own', '✓ Débloqué', () => this.toast(`${x.name} est dans l'éditeur d'étiquette (Ma gamme → Étiquette)`, 'info'));
      else {
        const buy = () => {
          const r = g.buyUnlock(x.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${x.name} : dans l'éditeur d'étiquette !`, 'good');
          this.onSent?.();
          this.shopKey = '';
          this.renderShop();
        };
        if (x.gems) b = this.gemsBtn('', x.gems, buy);
        else {
          b = this.btn('btn primary price', moneyShort(x.cost), buy);
          this.costGate(b, x.cost);
        }
        b.setAttribute('aria-label', `Débloquer ${x.name}`);
      }
      cell.append(b);
      grid.append(cell);
    }
    this.shopBody.append(tabs, grid, h('p', 'hint', 'Ce que tu débloques apparaît dans l\'éditeur d\'étiquette (Ma gamme → Étiquette).'));
  }

  // ------------------------------------------------------------------ Gaston

  private renderMentor(): void {
    const g = this.game();
    const tips: Record<number, { text: string; action?: string }> = {
      0: { text: 'Salut, moi c\'est Gaston ! Le malt entre en haut, la bière sort en bas. J\'ai réglé les machines pour ma blonde.', action: 'Continuer' },
      1: { text: 'Touche une machine pour la régler : leurs noms brillent.' },
      2: { text: 'Touche la cuve de cuivre, en bas à droite, pour lancer ton premier brassin.' },
      3: { text: 'Je t\'aide pour celui-ci : ça ira vite. On goûte à la première bouteille !' },
      4: { text: 'Glisse l\'écran : au bureau, touche l\'ordinateur pour les commandes et les nouvelles ; au bar, touche les fûts pour les brancher. Bonne brasse !', action: 'Compris' },
    };
    const tip = this.modalOpen || this.openSheet?.kind === 'brew' || !isRoom(this.view) ? undefined : tips[g.tips];
    this.mentor.classList.toggle('hidden', !tip);
    // la bulle ne cache pas ce dont elle parle : en bas quand elle montre le haut de l'atelier (étapes 0 et 1)
    this.mentor.classList.toggle('low', !!tip && this.view === 'workshop' && g.tips <= 1);
    for (const o of this.overlays.values()) o.label.classList.toggle('tuto', !!tip && g.tips === 1);
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

  /** Notification : deux au plus à l'écran (la plus ancienne laisse sa place), avec un bouton d'action facultatif. */
  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info', action?: { label: string; run: () => void }, ms = 3000): void {
    const t = h('div', `toast ${kind}`);
    t.append(h('span', '', text));
    if (action) {
      t.classList.add('with-action');
      const b = h('button', 'toast-action', action.label);
      b.onclick = () => {
        action.run();
        t.remove();
      };
      t.append(b);
    }
    this.toasts.append(t);
    this.trimToasts();
    setTimeout(() => t.remove(), ms);
  }

  private trimToasts(): void {
    while (this.toasts.childElementCount > 2) this.toasts.firstElementChild!.remove();
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
      this.trimToasts();
      this.gain = { el, amount, timer: 0 };
    }
    const g = this.gain!;
    g.timer = window.setTimeout(() => {
      g.el.remove();
      if (this.gain === g) this.gain = null;
    }, 3000);
  }
}
