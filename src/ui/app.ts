import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { AD_DAILY, TUTO_DONE, BAR_MESSAGE, BAR_MESSAGE_MAX, BOTTLE_L, MAX_TANKS, SALE_SOURCES, TANK_STAGES, type Beer, type Format, type Game, type Order, type SaleSource } from '../core/game';
import { AD_EXTEND, ADS, BAR, BAR_EVENTS, BARMAN, GLASS_L, kegGlasses, kegLiters, PARTY, SHOP_ITEMS, type AdDef, type AdId, type BarEventId, type ShopItemId } from '../core/market';
import { CLIENT_TYPES, COMPUTERS, KIND_LABEL, orderAsk, orderGems, wholesalePrice } from '../core/orders';
import { popScore, SALES_STEPS, stars, trendById, trendsOf } from '../core/trends';
import { BREWERY_NAMES, MAX_LEVEL, precisionPct, speedFactor, STATION_ORDER, STATIONS, STEPS_PER_TIER, upgradeCost, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
import { drawLabel } from '../render/labelArt';
import { BOTTLE_SCALE, drawCrate, drawShelfBottle, labelSpot, type ShelfBottleKind } from '../render/bottleArt';
import { instBox } from '../render/decor';
import { decorLayout } from '../render/decorLayout';
import { BarRoom, boundsFor, drawKeg, ROOM_W, StorageRoom } from '../render/rooms';
import { OfficeRoom } from '../render/officeRoom';
import { iconCanvas, type IconId } from '../render/icons';
import { cocardeCanvas, medalName, playCeremony } from './ceremony';
import { PARTNER_DAYS, partnerById, PARTNERS } from '../core/partners';
import { type ContestTier, pointsAsStars, bestMedal, COCARDE_BONUS, CONTEST_BOTTLES, CONTEST_OPEN_S, CONTEST_TIERS, cocardeRank, contestCategory, MEDALS, METALS, openTiers, type ContestResult, type Medal } from '../core/contests';
import { CRATE, MAX_RANGE, STORAGE } from '../core/warehouse';
import { BOOST_POSTS, BOOSTS, GEM_PACKS, type GemPack, GEMS, DECOR_ORDER, type DecorId, FURNITURE, LABEL_UNLOCKS, LUXURY_GEMS, STAFF, STAFF_CONTRACT, STAFF_SLOTS, UNLOCK_KINDS, type BoostChannel, type BoostDef, type BoostId, type LabelUnlock, type UnlockKind } from '../core/shop';
import { GEMSTONES, BOTTLES, DEFAULT_LABEL, EMBLEMS, FONTS, LABEL_COLORS, PATTERNS, SHAPES, type Label } from '../core/label';
import { drawGaston } from './gaston';
import { createKnob } from './knob';
import { sfx } from '../platform/audio';
import { showRewardedAd } from '../platform/ads';
import { Tour, type TourTarget, type TourView } from './tutorial';
import { compact, countdown, dialTime } from './format';
import { chosenLang, LANGS, locale, setLang, systemLang, tl, type Lang } from '../i18n';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
/** Couleur de la bière (« Blonde » est aussi un style : la couleur a sa propre traduction). */
const colorName = (c: string) => tl(c === 'Blonde' ? 'Blonde (couleur)' : c);
const money = (v: number) => `${v.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${Math.floor(v).toLocaleString(locale)} €`;
/** Un volume en litres : une décimale sous 10 L. */
const liters = (v: number) => `${v < 10 ? (Math.round(v * 10) / 10).toLocaleString(locale) : Math.round(v).toLocaleString(locale)} L`;
const moneyShort = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString(locale, { maximumFractionDigits: 1 })} M€` : v >= 1e4 ? `${Math.round(v / 1000)} k€` : moneyInt(v));
const fmtRate = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: v < 10 ? 1 : 0 });
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

/** Ce que fait une campagne, en phrases simples, une par effet. */
export function adPerks(ad: AdDef): string[] {
  const fr = (x: number) => x.toLocaleString(locale);
  const out = [
    tl('Toute ta gamme : +{0} points de popularité', Math.round(ad.stars * 20)),
    tl('Les commandes arrivent {0} fois plus vite', fr(ad.orderBoost)),
  ];
  if (ad.letters === 1) out.push(tl('Une commande arrive tout de suite'));
  else if (ad.letters > 1) out.push(tl('Chaque place libre du tableau reçoit une commande tout de suite'));
  if (ad.pay !== 1) out.push(tl('Les commandes reçues sont payées {0} % de plus', Math.round((ad.pay - 1) * 100)));
  if (ad.prestige) out.push(tl('Une commande de prestige (s\'il y a une bière Excellente)'));
  if (ad.bar !== 1) out.push(tl('{0} % de clients en plus au bar', Math.round((ad.bar - 1) * 100)));
  return out;
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
  const aria = canUp ? tl('{0} : {1} possible', text, upLabel) : text;
  if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
}

/** Icône de chaque pièce de décoration du bar (meubles et objets d'événement). */
const DECOR_ICON: Record<DecorId, IconId> = {
  plants: 'plant', darts: 'darts', posters: 'poster', tv: 'tv', neon: 'neon', disco: 'disco', benches: 'bench', jukebox: 'jukebox',
};

/** Onglets du magasin. */
type ShopTab = 'bar' | 'boosts' | 'labels' | 'gems';
/** Onglets du magasin, de gauche à droite. */
const SHOP_TABS: readonly { id: ShopTab; name: string; icon: IconId }[] = [
  { id: 'bar', name: tl('Bar'), icon: 'plant' },
  { id: 'boosts', name: tl('Boosts'), icon: 'bolt' },
  { id: 'labels', name: tl('Étiquettes'), icon: 'labels' },
  { id: 'gems', name: tl('Diamants'), icon: 'gem' },
];
/** Icône de chaque effet (poste de boost), en haut à droite de l'écran quand il est actif : la marmite des machines… */
const EFFECT_ICON: Record<BoostChannel, IconId> = { brew: 'brew', yeast: 'flask', bar: 'mug', wholesale: 'truck' };
/** Le nom de chaque effet, pour la lecture d'écran. */
const EFFECT_NAME: Record<BoostChannel, string> = { brew: tl('Machines'), yeast: tl('Fermentation et garde'), bar: tl('Clients du bar'), wholesale: tl('Grossiste') };
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
  if (f.seats) out.push(tl('+{0} places', f.seats));
  if (f.price) out.push(`verres ${pct(f.price)}`);
  if (f.pop) out.push(tl('gamme connue {0}', pct(f.pop)));
  return out;
}

/** Effet d'un boost en quelques mots : multiplicateur et durée. */
function boostShort(b: BoostDef): string {
  const n = (v: number) => v.toLocaleString(locale);
  const dur = b.minutes >= 60 ? `${b.minutes / 60} h` : tl('{0} min', b.minutes);
  if (!b.channel) return tl('immédiat');
  if (b.channel === 'bar') return tl('clients ×{0}{1} · {2}', n(b.mult), b.priceMult ? tl(' · verres −{0} %', Math.round((1 - b.priceMult) * 100)) : '', dur);
  if (b.channel === 'wholesale') return tl('prix ×{0} · {1}', n(b.mult), dur);
  if (b.id === 'openGate') return tl('sans limite · {0}', dur);
  return tl('×{0} · {1}', n(b.mult), dur);
}

/** Un nombre de diamants, en toutes lettres. */
const gemsText = (n: number) => tl('{0} diamant{1}', n, n > 1 ? 's' : '');

/** Nom de la pièce en haut à gauche. */
function roomTitle(plaque: HTMLElement): HTMLElement {
  const el = h('div', 'room-title');
  el.append(plaque);
  return el;
}

/** Ce qu'on affiche à la place d'un temps quand la file ne se videra pas. */
const BLOCKED_TEXT: Record<'storage' | 'money' | 'slow', string> = { storage: tl('⏸ stockage plein'), money: tl('⏸ fonds insuffisants'), slow: tl('plus de 24 h') };

/** Explication sous la production restante quand la file va se bloquer. */
function blockedHint(res: { ends: number[]; blocked: 'storage' | 'money' | 'slow' | null }, format?: Format): string {
  const n = res.ends.length;
  const after = tl('La file se bloque après {0} brassin{1}', n, n > 1 ? 's' : '');
  if (res.blocked === 'storage') {
    return format === 'keg'
      ? tl('{0} : le stockage sera plein de fûts. Sers-les au bar, livre des commandes de fûts ou vends-en au grossiste (dans la limite de son quota du jour) ; sinon programme moins de fûts, ou agrandis le stockage.', after)
      : tl('{0} : le stockage sera plein. Livre des commandes, vends au grossiste (dans la limite de son quota du jour) ou agrandis le stockage.', after);
  }
  if (res.blocked === 'money') return tl('{0} : il n\'y aura plus de quoi payer les ingrédients.', after);
  return tl('La file entière prendra plus de 24 h.');
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
  { id: 'office', name: tl('Bureau') },
  { id: 'workshop', name: tl('Atelier') },
  { id: 'storage', name: tl('Stockage') },
  { id: 'bar', name: tl('Bar') },
];
/** Ce que montre l'écran : une des pièces, ou le magasin. */
export type View = RoomId | 'shop';
/** Onglets de la barre de navigation, de gauche à droite. */
const TABS: readonly { id: View; name: string; icon: IconId }[] = [
  { id: 'office', name: tl('Bureau'), icon: 'office' },
  { id: 'workshop', name: tl('Atelier'), icon: 'flask' },
  { id: 'storage', name: tl('Stockage'), icon: 'crate' },
  { id: 'bar', name: tl('Bar'), icon: 'mug' },
  { id: 'shop', name: tl('Magasin'), icon: 'cart' },
];
const isRoom = (v: View): v is RoomId => ROOMS.some((r) => r.id === v);

/** Couleur de chaque source de ventes dans le graphique (palette validée sur le fond des panneaux). */
const SOURCE: Record<SaleSource, { name: string; color: string }> = {
  bar: { name: tl('Bar'), color: '#b8862a' },
  orders: { name: tl('Commandes'), color: '#3f88d4' },
  wholesale: { name: tl('Grossiste'), color: '#d45c8e' },
};

/** Les applications de l'ordinateur du bureau, dans l'ordre du menu. */
export type PcApp = 'dashboard' | 'messages' | 'orders' | 'staff' | 'trends' | 'marketing' | 'wholesale' | 'contests' | 'partners';
const PC_APPS: readonly { id: PcApp; name: string; icon: IconId }[] = [
  { id: 'dashboard', name: tl('Tableau de bord'), icon: 'chart' },
  { id: 'messages', name: tl('Messages'), icon: 'bubble' },
  { id: 'orders', name: tl('Commandes'), icon: 'clipboard' },
  { id: 'staff', name: tl('Personnel'), icon: 'staff' },
  { id: 'trends', name: tl('Tendances'), icon: 'trend' },
  { id: 'marketing', name: tl('Marketing'), icon: 'megaphone' },
  { id: 'wholesale', name: tl('Grossiste'), icon: 'truck' },
  { id: 'contests', name: tl('Concours'), icon: 'trophy' },
  { id: 'partners', name: tl('Partenariats'), icon: 'pennant' },
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
  return m < 1 ? tl('à l\'instant') : m < 60 ? tl('il y a {0} min', m) : m < 24 * 60 ? tl('il y a {0} h', Math.floor(m / 60)) : tl('il y a {0} j', Math.floor(m / 1440));
};

const duration = (s: number) => {
  const m = Math.max(0, Math.floor(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : tl('{0} min', m);
};

export interface AppCallbacks {
  getSpeed(): number;
  setSpeed(s: number): void;
  newGame(): void;
  /** La boutique de diamants : « appstore » (iOS), « dev » (achats simulés), « none » (navigateur). */
  storeKind(): 'appstore' | 'dev' | 'none';
  /** Prix localisés des packs (identifiant de produit → prix), quand la boutique répond. */
  gemPrices(): Promise<Map<string, string>>;
  /** Achète un pack : crédite les diamants, sauvegarde, puis termine la transaction. */
  buyGems(productId: string): Promise<{ ok: boolean; gems?: number; cancelled?: boolean; reason?: string }>;
}

/** Interface du jeu : header, brasserie, barre du bas, panneaux et fenêtres. */
export class App {
  readonly scene = new Scene();
  private header = h('header', 'topbar');
  private moneyEl = h('span', 'money-value');
  private moneyPill = h('div', 'money');
  /** Gains de l'absence à récolter : une petite bourse sous l'argent, qu'on touche quand on veut. */
  /** La bourse de l'absence : deux boutons, les diamants (à gauche) et l'argent (à droite), récoltés séparément. */
  private harvest = h('button', 'harvest hidden');
  private harvestGems = h('button', 'harvest harvest-gem hidden');
  private harvests = h('div', 'harvests');
  /** Compteur d'argent qui défile après une récolte. */
  private moneyAnim: { from: number; to: number; start: number } | null = null;
  /** Le compteur de diamants garde son ancienne valeur le temps que les diamants récoltés arrivent. */
  private gemsHold: { value: number; until: number } | null = null;
  private stage = h('main', 'stage');
  private sceneWrap = h('div', 'scene-wrap');
  private overlays = new Map<StationId, { btn: HTMLButtonElement; label: HTMLElement; bar: HTMLElement; text: HTMLElement }>();
  private tasteBtn = h('button', 'taste-btn hidden', tl('🍺 Goûter'));
  /** Plaque du niveau de la brasserie, en haut à gauche de la scène. */
  private plaque = roomPlaque();
  private announcedTaste = -1;
  /** Bas de l'écran : les actions de la pièce (sous-menu), puis la barre de navigation. */
  private dock = h('div', 'dock');
  /** Actions de la pièce : des boutons ronds flottants en bas à droite, l'action principale en dessous. */
  private fabs = h('div', 'fabs');
  private tabbar = h('nav', 'tabbar');
  private brewBtn = fab('brew', tl('Brasser'));
  /** La brasserie était-elle déjà à l'arrêt au rendu précédent ? (la notification ne part qu'au moment où elle s'arrête) */
  private wasStopped = false;
  private rangeBtn = fab('range', tl('Ma gamme'));
  private eventsBtn = fab('events', tl('Événements'));
  private barmanBtn = fab('barman', tl('Barman en renfort'));
  /** Le magasin : trois onglets, et le rayon affiché dessous. */
  private shopPane = h('div', 'shop');
  private shopBody = h('div', 'shop-body');
  private shopTabs = new Map<ShopTab, { btn: HTMLButtonElement; mark: HTMLElement }>();
  private shopTab: ShopTab = 'bar';
  /** Prix des packs de diamants donnés par l'App Store (null : pas encore demandés). */
  private gemPrices: Map<string, string> | null = null;
  /** Pack dont l'achat est en cours (les boutons attendent la réponse de l'App Store). */
  private gemBuying: string | null = null;
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
  /** Bière choisie pour le concours en cours. */
  private contestPick: number | null = null;
  /** Onglet ouvert dans l'app Concours (0 régional, 1 national, 2 international). */
  private contestTier: ContestTier = 0;
  /** Bière choisie sur l'étagère (fiche affichée sous l'étagère). */
  private shelfSel: number | null = null;
  private sheet = h('section', 'sheet hidden');
  private modal = h('div', 'modal hidden');
  private toasts = h('div', 'toasts');
  private openSheet: SheetState | null = null;
  /** Assistant « Brasser » : étape en cours et choix faits (null : la file des brassins). */
  private wiz: { step: 'beer' | 'format' | 'count' | 'trial'; beerId: number | null; format: Format; count: number } | null = null;
  private sheetKey = '';
  /** La visite guidée de Gaston (tuto d'introduction). */
  private tour!: Tour;
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
    this.harvest.onclick = () => this.collectOfflineMoney(this.harvest, this.game().offline?.doubled ? 16 : 8);
    this.harvestGems.onclick = () => this.collectOfflineGems();
    this.harvests.append(this.harvestGems, this.harvest);
    const opts = h('button', 'icon-btn', '⚙');
    opts.setAttribute('aria-label', tl('Options'));
    opts.onclick = () => this.openOptions();
    this.gemsPill.append(iconCanvas('gem', 1, 'gems-icon'), this.gemsEl);
    this.gemsPill.setAttribute('aria-label', tl('Diamants : la boutique de diamants'));
    this.gemsPill.onclick = () => this.openShop('gems');
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
      window: { label: tl('Fenêtre : aller à l\'atelier'), run: () => this.goView('workshop') },
      board: { label: tl('Panneau des commandes'), run: () => this.openComputer('orders') },
      display: { label: tl('Présentoir : ma gamme'), run: () => this.open({ kind: 'range' }) },
      computer: { label: tl('Ordinateur'), run: () => this.openComputer() },
    };
    for (const hit of this.officeRoom.hits()) {
      const el = h('button', 'station-hit');
      el.setAttribute('aria-label', OFFICE_HITS[hit.id].label);
      el.dataset.hit = hit.id;
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
      el.setAttribute('aria-label', tl('Rayonnages'));
      el.dataset.hit = 'racks';
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
    counterEl.setAttribute('aria-label', tl('Comptoir'));
    counterEl.dataset.hit = 'counter';
    counterEl.onclick = () => this.open({ kind: 'bar' });
    this.barWrap.append(counterEl);
    this.roomHits.push({ el: counterEl, rect: counter.rect });
    // le panneau lumineux au-dessus des bouteilles : on y écrit son message (sans panneau, c'est le comptoir)
    const signEl = h('button', 'station-hit');
    signEl.setAttribute('aria-label', tl('Panneau lumineux : changer le message'));
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

    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cost]');
      if (!b) return;
      const missing = Number(b.dataset.cost) - this.game().money;
      if (missing <= 0) return;
      e.stopPropagation();
      e.preventDefault();
      this.toast(tl('Il te manque {0}', moneyInt(Math.ceil(missing))), 'bad');
    }, true);
    // Gaston fait visiter la brasserie : le doigt montre, la surbrillance isole, la bulle explique
    const tourTargets: Record<string, () => HTMLElement | HTMLElement[] | null | undefined> = {
      computer: () => this.computerHit,
      display: () => this.roomHits.find((x) => x.el.dataset.hit === 'display')?.el,
      officePlaque: () => this.officePlaque,
      mill: () => this.overlays.get('mill')?.label,
      mash: () => this.overlays.get('mash')?.btn,
      brewBtn: () => this.brewBtn,
      racks: () => this.roomHits.find((x) => x.el.dataset.hit === 'racks')?.el,
      counter: () => this.roomHits.find((x) => x.el.dataset.hit === 'counter')?.el,
      barBtns: () => [this.eventsBtn, this.barmanBtn],
      money: () => [this.gemsPill, this.moneyPill],
      taste: () => (this.tasteBtn.classList.contains('hidden') ? null : this.tasteBtn),
    };
    this.tour = new Tour({
      game: () => this.game(),
      view: () => this.view as TourView,
      goView: (v) => this.goView(v),
      target: (t: TourTarget) => (t.startsWith('nav:') ? this.navTabs.get(t.slice(4) as View)?.btn ?? null : tourTargets[t]?.() ?? null),
      busy: () => this.modalOpen || !!this.openSheet,
      sheet: () => this.openSheet?.kind ?? null,
      avatar: () => {
        const av = h('canvas', 'mentor-avatar');
        drawGaston(av);
        return av;
      },
      tap: () => sfx.play('pop'),
    }, root);
    root.append(this.header, this.stage, this.fabs, this.harvests, this.boostHud, this.sheet, this.dock, this.modal, this.toasts);
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
    this.tour.frame();
    if (this.moneyAnim) {
      const a = this.moneyAnim;
      const k = Math.max(0, Math.min(1, (performance.now() - a.start) / 900)); // le compteur attend que les pièces arrivent
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
        ? id === 'bottling' && g.bottlingBlocked ? tl('Stockage plein ⏸')
        : id === 'bottling' && g.tastable === batch ? tl('À goûter ⏸')
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
    const moneyAria = tl('Argent : {0}', moneyInt(g.money));
    if (this.moneyPill.getAttribute('aria-label') !== moneyAria) this.moneyPill.setAttribute('aria-label', moneyAria);
    this.renderBoostHud(g);
    if (this.gemsHold && performance.now() >= this.gemsHold.until) this.gemsHold = null;
    const gems = compact(this.gemsHold ? this.gemsHold.value : g.gems);
    if (this.gemsEl.textContent !== gems) this.gemsEl.textContent = gems;
    const off = g.offline;
    if (off && off.earned <= 0 && !off.gems) g.collectOffline(); // rien à récolter : on n'en parle pas
    // pendant que les pièces volent vers la bourse doublée, elle garde l'ancien montant jusqu'à leur arrivée
    const held = performance.now() < this.harvestHoldUntil;
    const earned = held ? Number(this.harvest.dataset.earned ?? 0) : g.offline?.earned ?? 0;
    const offGems = g.offline?.gems ?? 0;
    this.harvest.classList.toggle('hidden', earned <= 0);
    this.harvest.classList.toggle('boosted', !held && !!g.offline?.doubled && earned > 0);
    if (!held) this.harvest.dataset.earned = String(earned);
    const doubled = !held && !!g.offline?.doubled;
    this.harvestGems.classList.toggle('hidden', offGems <= 0);
    if (earned > 0) {
      const text = `+${moneyShort(earned)}`;
      const key = `${text}${doubled ? tl('×2') : ''}`;
      if (this.harvest.dataset.text !== key) {
        this.harvest.dataset.text = key;
        this.harvest.replaceChildren(h('span', 'harvest-bag', '💰'), h('span', 'harvest-value', text));
        if (doubled) this.harvest.append(h('span', 'harvest-x2', tl('×2')));
        this.harvest.setAttribute('aria-label', tl('Récolter {0} gagnés pendant ton absence', moneyInt(earned)));
      }
    }
    if (offGems > 0) {
      const text = `+${offGems}`;
      if (this.harvestGems.dataset.text !== text) {
        this.harvestGems.dataset.text = text;
        this.harvestGems.replaceChildren(iconCanvas('gem', 1, 'gems-icon'), h('span', 'harvest-value', text));
        this.harvestGems.setAttribute('aria-label', tl('Récolter {0} gagnés pendant ton absence', gemsText(offGems)));
      }
    }
    // les deux boutons côte à côte ne doivent pas mordre sur l'étiquette de la pièce : sur un écran étroit,
    // les diamants passent sous l'argent
    const roomPlaque = isRoom(this.view) ? { workshop: this.plaque, office: this.officePlaque, storage: this.storagePlaque, bar: this.barPlaque }[this.view] : undefined;
    this.harvests.classList.remove('stack');
    if (roomPlaque && earned > 0 && offGems > 0 && this.harvests.getBoundingClientRect().left < roomPlaque.getBoundingClientRect().right + 2) this.harvests.classList.add('stack');
    this.boostHud.classList.toggle('below-harvest-stack', this.harvests.classList.contains('stack'));
    // au retour : la bourse de l'absence s'ouvre en grand au centre de l'écran (une fois par absence)
    if (g.offline && g.offline !== this.offlineShown && !this.modalOpen && !this.openSheet) {
      this.offlineShown = g.offline;
      if (g.canOfferDouble()) {
        g.markDoubleOffered();
        this.openOfflineReward();
      }
    }
    // résultat d'un concours : la cérémonie s'ouvre dès que l'écran est libre
    const res = g.contestResults[0];
    // fermée par la croix : elle compte comme vue
    if (res && res === this.ceremonyShown && !this.modalOpen) g.seenContestResult();
    else if (res && res !== this.ceremonyShown && !this.modalOpen && !this.openSheet && !this.tour.active) {
      this.ceremonyShown = res;
      this.openContestResult(res);
    }
    const can = g.canBrew();
    const trial = g.tastable;
    // pastilles des boutons d'action : l'essentiel en un coup d'œil ; « ready » = il y a quelque chose à faire
    // la brasserie à l'arrêt se voit partout (après le tutoriel) : « 0 » en rouge sur Brasser, « ! » sur l'onglet Atelier, et une notification
    const stopped = g.stopped && g.tips >= TUTO_DONE;
    setFab(this.brewBtn, g.planned ? String(g.planned) : stopped ? '0' : '', can.ok && !g.planned ? 'ready' : '',
      g.planned ? tl('Brasser : {0} programmé{1}', g.planned, g.planned > 1 ? 's' : '') : stopped ? tl('Brasser : la brasserie est à l\'arrêt') : tl('Brasser'));
    this.brewBtn.querySelector('.fab-badge')!.classList.toggle('stop', stopped);
    if (stopped && !this.wasStopped) {
      this.toast(tl('La brasserie est à l\'arrêt : programme des brassins'), 'bad', {
        label: tl('Brasser'), run: () => {
          this.goView('workshop');
          this.open({ kind: 'brew' });
        },
      }, 8000);
    }
    this.wasStopped = stopped;
    setFab(this.rangeBtn, trial ? '!' : '', trial ? 'alert' : '', tl('Ma gamme : {0}/{1}', g.beers.length, g.rangeSlots));
    const ready = g.readyOrders.length;
    const emptyTap = g.taps.some((t) => t.glasses <= 0);
    const kegsReady = g.beers.some((b) => b.kegs.length > 0);
    this.syncKegHits();
    const nextBar = BAR[g.barLevel];
    const eventReady = !g.partying && g.time >= g.partyReadyAt;
    setFab(this.eventsBtn, g.partying ? clock(g.partyUntil - g.time) : '', g.partying ? 'alert' : '', g.partying ? tl('{0} en cours', g.barEvent.name) : tl('Événements'));
    this.eventsBtn.classList.toggle('dim', !g.partying && !eventReady);
    // barman : temps restant de son contrat ; le bouton s'allume quand un fût attend d'être branché
    const left = g.barmanUntil - g.time;
    setFab(this.barmanBtn, g.barmanOn ? (left >= 3600 ? `${Math.ceil(left / 3600)} h` : tl('{0} min', Math.ceil(left / 60))) : '',
      g.barmanOn ? 'alert' : emptyTap && kegsReady ? 'ready' : '', g.barmanOn ? tl('Barman en renfort : encore {0}', duration(left)) : tl('Embaucher un barman'));
    // améliorations possibles : la flèche brille
    const stationUp = STATION_ORDER.some((id) => g.money >= g.upgradeCost(id));
    const nextStore = STORAGE[g.storageLevel];
    const nextPc = COMPUTERS[g.computerLevel];
    // l'ordinateur (l'enveloppe est dessinée sur son écran) : son nom dit les commandes en attente
    const unread = this.unread;
    this.computerHit?.setAttribute('aria-label', tl('Ordinateur : {0} commande{1}{2}{3}', g.orders.length, g.orders.length > 1 ? 's' : '', ready ? tl(', {0} à livrer', ready) : '', unread ? tl(', {0} message{1}', unread, unread > 1 ? 's' : '') : ''));
    this.fabs.classList.toggle('hidden', !isRoom(this.view) || !!this.openSheet);
    // les notifications se posent au-dessus du panneau ouvert
    const sheetTop = this.openSheet ? this.sheet.getBoundingClientRect().top : 0;
    this.root.style.setProperty('--toast-bottom', sheetTop ? `${Math.round(window.innerHeight - sheetTop)}px` : 'var(--bottom-h, 70px)');
    // le tutoriel montre le bouton dont il parle
    setPlaque(this.plaque, `★ ${g.breweryLevel} · ${g.breweryName}`, stationUp, tl('amélioration'));
    setPlaque(this.storagePlaque, `▣ ${STORAGE[g.storageLevel - 1]!.name}`, !!nextStore && g.money >= nextStore.cost, 'agrandissement');
    setPlaque(this.officePlaque, `▣ ${COMPUTERS[g.computerLevel - 1]!.name}`, !!nextPc && g.money >= nextPc.cost, tl('amélioration'));
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
      s, g.levelNumber(s.kind === 'station' ? s.id : 'mill'), s.kind === 'station' ? g.tankCount(s.id) : 0, g.beers.map((b) => [b.id, b.stock, b.name]), g.tastable?.id ?? 0, g.selectedBeer,
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
    body.append(h('div', 'step-tag', tl('{0} · niveau {1}', def.step, g.levelNumber(id))));
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
      body.append(h('div', 'section-title', tl('Levure')), row, desc);
    }
    const knobs = h('div', 'knob-row');
    for (const k of def.knobs) {
      knobs.append(createKnob({ label: k.label, min: k.min, max: k.max, step: k.step, unit: k.unit, value: g.recipe[k.key] as number, onChange: (v) => g.setParam(k.key, v) }));
    }
    body.append(knobs);
    // pendant le tutoriel, la fiche ne parle que des réglages : les achats viennent après la première bière
    if (g.tips < TUTO_DONE) return;
    // cuves en parallèle (fermentation, garde)
    const tankCost = g.tankCost(id);
    if (TANK_STAGES.includes(id)) {
      const row = h('div', 'deal-row');
      row.append(h('span', 'stats-line strong', tl('Cuves : {0}/{1}', g.tankCount(id), MAX_TANKS)));
      if (tankCost != null) {
        const b = this.btn('btn small', tl('+ 1 cuve · {0}', moneyShort(tankCost)), () => {
          const r = g.addTank(id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('repair');
          this.toast(tl('Nouvelle cuve installée'), 'good');
          this.sheetKey = '';
        });
        this.costGate(b, tankCost);
        row.append(b);
      }
      body.append(row);
    }
    body.append(this.upgradeCard(g, id));
  }

  /**
   * Améliorer un appareil : où il en est dans son palier (5 cases), ce que donne le prochain niveau (plus rapide,
   * plus précis), ou la machine suivante au bout du palier, puis des niveaux sans fin après le 25e.
   */
  private upgradeCard(g: Game, id: StationId): HTMLElement {
    const def = STATIONS[id];
    const st = g.stations[id];
    const lv = st.level;
    const step = st.step ?? 0;
    const extra = st.extra ?? 0;
    const up = h('div', 'card upgrade');
    up.append(h('div', 'section-title', tl('Améliorer')));
    // le palier : 5 cases, celles déjà acquises en vert
    const tier = h('div', 'tier-line');
    tier.append(h('span', 'tier-name', extra ? tl('{0} +{1}', def.names[lv - 1], extra) : tl('{0} · palier {1}/{2}', def.names[lv - 1], lv, MAX_LEVEL)));
    const pips = h('span', 'tier-pips');
    for (let i = 0; i < STEPS_PER_TIER; i++) pips.append(h('span', `tier-pip${i <= step ? ' on' : ''}`));
    tier.append(pips);
    up.append(tier);
    // ses statistiques : vitesse (par rapport au début du palier) et précision
    const speedOf = (x: typeof st) => {
      const f = speedFactor(id, x);
      return `×${(f < 10 ? Math.round(f * 100) / 100 : Math.round(f * 10) / 10).toLocaleString(locale)}`;
    };
    const after = { ...st, ...(g.nextIsTier(id) ? { level: lv + 1, step: 0 } : step < STEPS_PER_TIER - 1 ? { step: step + 1 } : { extra: extra + 1 }) };
    const stats = h('div', 'machine-stats');
    const stat = (label: string, now: string, next: string) => {
      const el = h('div', 'machine-stat');
      el.append(h('span', 'machine-stat-label', label), h('span', 'machine-stat-value', now));
      if (next !== now) el.append(h('span', 'machine-stat-next', `➜ ${next}`));
      stats.append(el);
    };
    stat(tl('Vitesse'), speedOf(st), speedOf(after));
    stat(tl('Précision'), `${precisionPct(st)} %`, `${precisionPct(after)} %`);
    up.append(stats);
    const cost = g.upgradeCost(id);
    const tierUp = g.nextIsTier(id);
    let label: string;
    if (tierUp) {
      // la machine suivante : on ne dévoile que celle-ci, la surprise reste entière pour les suivantes
      const levels = h('div', 'levels');
      const cell = (i: number, tag: string, cls: string) => {
        const c = h('div', `level ${cls}`);
        c.append(h('div', 'section-title', tag), img(stationCanvas(id, i), 'pix level-pic'), h('div', 'level-name', def.names[i - 1]!), h('div', 'level-perk', def.perks[i - 1]!));
        return c;
      };
      levels.append(cell(lv, tl('Actuelle'), 'done'), h('div', 'level-arrow', '➜'), cell(lv + 1, tl('Niveau {0}', g.levelNumber(id) + 1), 'current'));
      up.append(levels);
      label = tl('Passer à : {0} · {1}', def.names[lv]!, moneyShort(cost));
    } else {
      up.append(h('div', 'section-title', tl('Niveau {0}', g.levelNumber(id) + 1)));
      if (lv >= MAX_LEVEL && step >= STEPS_PER_TIER - 1) up.append(h('p', 'hint', tl('Sans limite : le prix grimpe à chaque niveau.')));
      label = tl('Améliorer · {0}', moneyShort(cost));
    }
    const b = this.btn('btn primary', label, () => {
      const r = g.upgrade(id);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play(tierUp ? 'upgrade' : 'repair');
      this.toast(tierUp ? tl('{0} installé !', def.names[lv]) : tl('{0} : niveau {1}', def.step, g.levelNumber(id)), 'good');
      this.sheetKey = '';
    });
    b.setAttribute('aria-label', tl('{0} : {1}', label, moneyInt(cost)));
    this.costGate(b, cost);
    up.append(b);
    return up;
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
    const body = this.frameSheet(w.step === 'trial' ? tl('Nouvel essai') : tl('Programmer des brassins'));
    if (w.step !== 'trial') body.append(this.wizSteps(w.step));
    else if (g.beers.length) body.append(this.btn('btn small wiz-back', tl('‹ Retour'), () => this.wizGo('beer')));
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
      const el = this.btn(`wiz-step${i === at ? ' active' : i < at ? ' done' : ''}`, `${i + 1}. ${[tl('Bière'), tl('Format'), tl('Nombre')][i]}`, () => i < at && this.wizGo(id));
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
    if (g.money < cost && !g.broke) return tl('⏸ Il manque {0}', moneyInt(cost - g.money));
    if (!g.roomFor(head.format)) return tl('⏸ Stockage plein');
    return '';
  }

  /** La file : les groupes de brassins, dans l'ordre où ils partiront. */
  private queueView(g: Game): void {
    const body = this.frameSheet(tl('Brasser'));
    if (g.tastable) body.append(this.btn('btn primary', tl('🍺 Un essai attend : goûter'), () => this.openTasting()));
    body.append(this.btn('btn primary big', tl('+ Programmer des brassins'), () => this.wizGo('beer', { beerId: null, format: 'bottle', count: 1 })));
    // la file et sa capacité
    const head = h('div', 'beer-head');
    head.append(h('span', 'section-title', tl('File des brassins')), h('span', 'stats-line', `${g.planned}/${g.planCap}`));
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
      eta.append(h('span', '', tl('⏱ Production restante')), this.etaEl(fc, fc.res.done ? fc.res.ends.length - 1 : -1, 'big'));
      body.append(eta);
      if (!fc.res.done) body.append(h('p', 'note bad', blockedHint(fc.res, g.plan[0]?.format)));
    }
    if (!g.plan.length) body.append(h('p', 'hint', inLine ? tl('Aucun autre brassin programmé.') : tl('Aucun brassin programmé : la brasserie est à l\'arrêt.')));
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
        this.toast(tl('{0} × {1} retiré{2}', removed.count, b.name, removed.count > 1 ? 's' : ''), 'info', { label: tl('Annuler'), run: () => {
          g.plan.splice(Math.min(i, g.plan.length), 0, removed);
          this.refreshSheet();
        } }, 5000);
      });
      close.setAttribute('aria-label', tl('Retirer de la file'));
      card.append(h('div', 'plan-title', `${i + 1}. ${b.name}`), close);
      const row = h('div', 'plan-row');
      const pic = h('div', 'plan-pic');
      pic.append(this.beerVisual(b, p.format));
      const info = h('div', 'plan-info');
      info.append(h('span', 'stats-line strong', p.format === 'keg' ? tl('Fûts') : tl('Bouteilles')));
      // fin du dernier brassin de ce groupe
      const done = inLine + g.plan.slice(0, i + 1).reduce((n, x) => n + x.count, 0) - 1;
      if (fc) {
        const w = h('span', 'plan-eta');
        if (fc.res.ends[done] != null) w.append(h('span', '', tl('prêt dans ')));
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
      up.setAttribute('aria-label', tl('Avancer dans la file'));
      const down = this.btn('btn small', '▼', () => {
        g.movePlan(i, 1);
        this.refreshSheet();
      });
      down.disabled = i === g.plan.length - 1;
      down.setAttribute('aria-label', tl('Reculer dans la file'));
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
    body.append(h('div', 'wiz-q', tl('Quelle bière brasser ?')));
    const grid = h('div', 'pick-grid');
    for (const b of g.beers) {
      const card = h('button', 'card pick-card');
      const thumb = h('canvas', 'label-thumb pick-label');
      drawLabel(thumb, b.label, b.name);
      card.append(thumb, h('span', 'beer-name', b.name), h('span', 'stats-line', tl('{0} btl · {1} fût{2}', b.stock, b.kegs.length, b.kegs.length > 1 ? 's' : '')), h('span', 'pop-stars', starText(b.pop)));
      card.onclick = () => this.wizGo('format', { beerId: b.id });
      grid.append(card);
    }
    // un essai : les réglages actuels des machines, s'ils ne sont pas ceux d'une bière de la gamme
    const trial = h('button', 'card pick-card trial');
    trial.append(h('span', 'pick-icon', '🧪'), h('span', 'beer-name', tl('Nouvel essai')), h('span', 'stats-line', g.selectedBeer == null ? tl('Réglages actuels des machines') : tl('Change un réglage d\'une machine d\'abord')));
    trial.disabled = g.selectedBeer != null;
    trial.onclick = () => this.wizGo('trial');
    grid.append(trial);
    body.append(grid);
  }

  /** Étape 2 : bouteilles ou fûts ? */
  private formatStep(g: Game, body: HTMLElement, beer: Beer): void {
    body.append(h('div', 'wiz-q', tl('Bouteilles ou fûts ?')));
    const grid = h('div', 'pick-grid');
    for (const [f, name, use] of [['bottle', tl('Bouteilles'), tl('Pour le stock et les commandes')], ['keg', tl('Fûts'), tl('Pour les tireuses du bar')]] as const) {
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
    body.append(h('div', 'wiz-q', tl('Combien de brassins ?')));
    const visual = h('div', 'batch-visual');
    const side = h('div', 'batch-side');
    side.append(this.beerVisual(beer, f), h('span', 'stats-line', `${beer.name}`), h('span', 'stats-line', f === 'keg' ? tl('Fûts') : tl('Bouteilles')));
    visual.append(side, this.batchGrid(beer, f, n));
    body.append(visual);
    const row = h('div', 'count-row');
    row.append(this.stepper(n, 1, Math.max(1, room), (v) => this.wizGo('count', { count: v })));
    const chips = h('div', 'chips');
    for (const v of [1, 5, 10, 25, 50].filter((x) => x < room)) chips.append(this.btn(`chip${v === n ? ' active' : ''}`, String(v), () => this.wizGo('count', { count: v })));
    if (room > 1) chips.append(this.btn(`chip${n === room ? ' active' : ''}`, tl('Max {0}', room), () => this.wizGo('count', { count: room })));
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
    line(tl('Production'), this.batchOutput(g, f, n));
    line(tl('Ingrédients'), `${moneyInt(unit * n)} (${moneyInt(unit)} / brassin)`);
    line(tl('Au plus'), room < g.planRoom ? tl('{0} (place au stockage)', room) : tl('{0} (place dans la file)', room));
    // quand ces brassins seraient prêts, après ceux déjà programmés
    const fc = this.forecast(g, { beerId: beer.id, format: f, count: n });
    if (fc) {
      const r = h('div', 'live-row');
      r.append(h('span', '', fc.res.done ? tl('Prêts dans') : tl('Prêts')), this.etaEl(fc, fc.res.done ? fc.res.ends.length - 1 : -1));
      sum.append(r);
      if (!fc.res.done) sum.append(h('p', 'note bad', blockedHint(fc.res, f)));
    }
    sum.append(h('p', 'hint', tl('Payés au lancement de chaque brassin. Un brassin attend l\'argent et la place dont il a besoin.')));
    body.append(sum);
    const go = this.btn('btn primary big', room ? tl('Programmer {0} brassin{1}', n, n > 1 ? 's' : '') : g.planRoom ? tl('Stockage plein') : tl('File pleine'), () => {
      const r = g.planBrew(beer.id, f, n);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('pop');
      this.toast(tl('{0} brassin{1} programmé{2}', n, n > 1 ? 's' : '', n > 1 ? 's' : ''), 'good');
      this.wizGo(null);
    });
    go.disabled = !room;
    body.append(go);
    if (!room) body.append(h('p', 'note bad', g.planRoom
      ? tl('Plus de place au stockage (en comptant les brassins déjà programmés). {0}, ou agrandis le stockage.', f === 'keg' ? tl('Sers des fûts au bar, livre des commandes de fûts, vends-en au grossiste') : tl('Livre des commandes, vends au grossiste'))
      : tl('La file est pleine ({0} brassins). Elle s\'allonge avec le niveau de la brasserie.', g.planCap)));
  }

  /** Un essai : les réglages actuels des machines ; on goûtera la première bouteille. */
  private trialStep(g: Game, body: HTMLElement): void {
    const card = h('div', 'card');
    const cost = g.brewCost(g.recipe, g.batchLiters, 'bottle');
    card.append(
      h('p', 'hint', tl('Un brassin avec les réglages actuels des machines. On goûte la première bouteille, puis on décide de la garder dans la gamme.')),
      h('div', 'stats-line strong', `${this.batchOutput(g, 'bottle', 1)} · ${g.broke ? tl('offert par Gaston') : moneyInt(cost)}`),
    );
    body.append(card);
    const can = g.canBrew();
    const busy = !!g.batchAt('mill');
    const label = g.queued ? tl('En attente du moulin…') : can.ok ? (g.broke ? tl('Brasser (offert par Gaston)') : tl('Brasser l\'essai')) : busy ? tl('Brasser au prochain tour') : can.reason!;
    const go = this.btn('btn primary big', label, () => {
      const r = busy ? g.queueBrew() : g.brew();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('pop');
      if (busy) this.toast(tl('En file d\'attente'), 'good');
      this.close();
    });
    go.disabled = g.queued || (!can.ok && !(busy && g.money >= cost));
    body.append(go);
  }

  /** Ce que donnent n brassins : bouteilles, ou fûts de x verres. */
  private batchOutput(g: Game, f: Format, n: number): string {
    if (f === 'bottle') return tl('{0} btl', (Math.floor(g.batchLiters / 0.33) * n).toLocaleString(locale));
    const kl = kegLiters(g.batchLiters);
    const k = Math.floor(g.batchLiters / kl) * n;
    return tl('{0} fût{1} de {2} verres', k.toLocaleString(locale), k > 1 ? 's' : '', kegGlasses(kl));
  }

  /** −  n  + */
  private stepper(value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const el = h('div', 'stepper');
    const minus = this.btn('knob-btn', '−', () => onChange(Math.max(min, value - 1)));
    const plus = this.btn('knob-btn', '+', () => onChange(Math.min(max, value + 1)));
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    minus.setAttribute('aria-label', tl('Moins'));
    plus.setAttribute('aria-label', tl('Plus'));
    el.append(minus, h('span', 'stepper-value', tl('×{0}', value)), plus);
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
    const body = this.frameSheet(tl('Ma gamme · {0}/{1}', g.beers.length, g.rangeSlots));
    this.sheet.classList.add('fit');
    if (g.tastable) body.append(this.btn('btn primary', tl('🍺 Un essai attend : goûter'), () => this.openTasting()));
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
        const best = bestMedal(beer.medals);
        if (best) bottle.append(cocardeCanvas(best, 2, 'cocarde shelf-cocarde'));
      }
      item.append(bottle, h('span', 'shelf-tag', tag));
      if (onclick) item.onclick = onclick;
      else item.disabled = true;
      items.push(item);
      return item;
    };
    for (const b of g.beers) slot('beer', tl('{0} btl', b.stock), () => {
      this.shelfSel = b.id;
      this.sheetKey = '';
    }, b);
    for (let i = g.beers.length; i < g.rangeSlots; i++) slot('empty', tl('Libre'), () => this.toast(tl('Garde un essai pour la remplir'), 'info'));
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
    const card = this.modalCard(tl('Nouvelle gamme'));
    card.append(
      h('p', 'hint', tl('Une place de plus sur ton étagère.')),
    );
    const buy = this.btn('btn primary big', tl('Créer une gamme · {0}', moneyInt(cost)), () => {
      const r = g.buySlot();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('paper');
      this.closeModal();
      this.sheetKey = '';
      this.toast(tl('Nouvelle place !'), 'good');
    });
    this.costGate(buy, cost);
    card.append(buy);
    if (g.money < cost) card.append(h('p', 'note bad', tl('Il te manque {0}.', moneyInt(cost - g.money))));
    card.append(this.btn('btn', tl('Annuler'), () => this.closeModal()));
  }

  // --- Stockage : les caisses s'empilent jusqu'à ce que la réserve soit pleine
  private storageSheet(g: Game): void {
    const lvl = STORAGE[g.storageLevel - 1]!;
    const body = this.frameSheet(tl('Stockage · {0}', lvl.name));
    const capCrates = lvl.crates;
    const crates = Math.ceil(g.stored / CRATE);
    body.append(h('div', 'stats-line strong', tl('{0} / {1} caisses', crates, capCrates)));
    const bar = h('div', 'progress');
    const fill = h('div', `progress-fill${g.storageFull ? ' full' : ''}`);
    fill.style.width = `${Math.min(100, (g.stored / g.storageCap) * 100)}%`;
    bar.append(fill);
    body.append(bar);
    if (g.bottlingBlocked) body.append(h('p', 'note bad', tl('Plein : embouteillage à l\'arrêt')));
    if (g.beers.length) {
      const list = h('div', 'stock-list');
      for (const b of g.beers) {
        const line = h('div', 'stock-line');
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', tl('{0} btl{1}', b.stock, b.kegs.length ? tl(' · {0} fûts', b.kegs.length) : '')));
        list.append(line);
      }
      body.append(list);
    }
    body.append(this.btn('btn small', tl('⬆ Agrandir le stockage'), () => this.open({ kind: 'storageUp' })));
  }

  // --- Stockage : l'agrandir
  private storageUpSheet(g: Game): void {
    const lvl = STORAGE[g.storageLevel - 1]!;
    const body = this.frameSheet(tl('Agrandir le stockage'));
    const up = h('div', 'card upgrade');
    // Seulement le palier actuel et le suivant.
    const levels = h('div', 'storage-levels');
    const next = STORAGE[g.storageLevel];
    for (const [l, tag, cls] of [[lvl, tl('Actuel'), 'done'], [next, tl('Suivant'), 'current']] as const) {
      if (!l) continue;
      const cell = h('div', `storage-level ${cls}`);
      cell.append(h('span', 'level-name', `${tag} : ${l.name}`), h('span', 'level-perk', tl('{0} caisses', l.crates.toLocaleString(locale))));
      levels.append(cell);
    }
    up.append(levels);
    if (next) {
      const b = this.btn('btn primary', tl('Agrandir · {0}', moneyInt(next.cost)), () => {
        const r = g.upgradeStorage();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('upgrade');
        this.toast(`${next.name} !`, 'good');
        this.sheetKey = '';
      });
      this.costGate(b, next.cost);
      up.append(b);
    } else up.append(h('p', 'note', tl('Niveau maximal')));
    body.append(up);
  }

  private beerCard(g: Game, b: Beer): HTMLElement {
    const t = b.tasting;
    const v = verdictOf(t.quality);
    const card = h('div', 'card beer');
    const head = h('div', 'beer-head');
    head.append(h('span', 'beer-name', b.name), h('span', `verdict ${VERDICT_CLASS[v]}`, tl(v)));
    card.append(head, h('div', 'stats-line', tl('{0} · {1} % · {2} btl{3}', tl(t.style), t.abv.toFixed(1), b.stock, b.kegs.length ? tl(' · {0} fûts', b.kegs.length) : '')));
    card.append(this.popLine(g, b));
    const actions = h('div', 'row');
    actions.append(this.btn('btn small', b.id === g.selectedBeer ? tl('✓ Chargée') : tl('Charger'), () => {
      g.loadBeer(b.id);
      this.sheetKey = '';
    }));
    actions.append(this.btn('btn small', tl('Fiche'), () => this.openTastingView(b.name, t)));
    actions.append(this.btn('btn small', tl('Étiquette'), () => this.openLabelEditor(b.name, b.label, (name, label) => {
      b.name = name.trim() || b.name;
      g.setLabel(b.id, label);
      this.sheetKey = '';
      this.closeModal();
    })));
    actions.append(this.confirmBtn('btn small bad', tl('Retirer'), tl('Retirer de la gamme ?'), () => {
      g.removeBeer(b.id);
      this.sheetKey = '';
    }));
    card.append(actions);
    return card;
  }

  /**
   * Popularité d'une bière : ses étoiles, puis d'où elles viennent, chacune avec sa part dans une jauge sur 5 ★ :
   * la qualité (jusqu'à 2,5 ★), les tendances suivies (+½ ★ chacune), les ventes des 7 derniers jours (jusqu'à 2,5 ★,
   * avec le palier suivant) et la pub en cours. Gaston dit le levier le plus utile.
   */
  private popLine(g: Game, b: Beer): HTMLElement {
    const box = h('div', 'pop-box');
    const p = g.popBreakdown(b);
    const line = h('div', 'pop-line');
    line.append(h('span', 'pop-stars', starText(b.pop)), h('span', 'pop-total', tl('{0} / 100', popScore(b.pop))));
    const best = bestMedal(b.medals);
    if (best) line.append(h('span', 'medal-chip', `${METALS[best.metal]} +${Math.round(g.medalBonus(b) * 100)} %`));
    box.append(line);
    // la jauge sur 5 ★ : une couleur par part
    const gauge = h('div', 'pop-gauge');
    let room = 5; // le total ne dépasse pas 5 ★ : la dernière part s'arrête au bout
    for (const [cls, v] of [['q', p.quality], ['t', p.trends], ['s', p.sales], ['a', p.ad]] as const) {
      const w = Math.min(v, room);
      room -= w;
      const seg = h('div', `pop-seg ${cls}`);
      seg.style.width = `${(w / 5) * 100}%`;
      gauge.append(seg);
    }
    box.append(gauge);
    // les parts, une ligne chacune
    const why = h('div', 'pop-why');
    const row = (cls: string, label: string, value: string) => why.append(h('span', `pop-dot ${cls}`), h('span', 'pop-why-label', label), h('span', 'pop-why-value', value));
    // chaque part en points : 1 ★ = 20 points
    const pts = (x: number) => Math.round(x * 20);
    row('q', tl('Qualité {0}', tl(verdictOf(b.tasting.quality))), `${pts(p.quality)} / 50`);
    const followed = trendsOf(b.tasting, g.trends).map((t) => t.short);
    row('t', followed.length ? tl('Tendances : {0}', followed.join(', ')) : tl('Aucune tendance suivie'), `+${pts(p.trends)}`);
    row('s', tl('Ventes sur 7 jours : {0}', liters(p.liters)), `${pts(p.sales)} / 50`);
    if (p.ad) row('a', tl('Campagne de pub en cours'), `+${pts(p.ad)}`);
    box.append(why);
    if (p.next) {
      // la marche suivante des ventes
      const step = h('div', 'pop-next');
      const prev = [...[{ liters: 10, stars: 0 }], ...SALES_STEPS].filter((x) => x.liters <= p.next!.liters).slice(-2)[0]!;
      const k = p.liters <= prev.liters ? 0 : Math.log(p.liters / prev.liters) / Math.log(p.next.liters / prev.liters);
      const bar = h('div', 'pop-next-bar');
      const fill = h('div', 'pop-next-fill');
      fill.style.width = `${Math.max(0, Math.min(1, k)) * 100}%`;
      bar.append(fill);
      step.append(h('span', 'pop-next-text', tl('Ventes : {0} / 50 à {1} sur 7 jours', Math.round(p.next.stars * 20), liters(p.next.liters))), bar);
      box.append(step);
    }
    // le levier le plus utile
    const tip = p.total >= 5 ? ''
      : p.quality < 1.25 ? tl('Gaston : « Une meilleure bière, c\'est jusqu\'à 50 points : soigne la recette et le matériel. »')
        : p.next ? tl('Gaston : « Vends-la : bar, commandes et grossiste comptent tous. Plus elle se vend, plus elle est connue. »')
          : tl('Gaston : « Suis une tendance : +10 points par tendance. »');
    if (tip) box.append(h('p', 'hint pop-tip', tip));
    return box;
  }

  // --- Bar : popularité, affluence et fûts branchés
  private barSheet(g: Game): void {
    const body = this.frameSheet(tl('Les fûts'));
    body.append(h('div', 'stats-line strong', tl('Marque {0} · {1} clients/h', starText(g.brand), fmtRate(g.barRate * 60))));
    const list = h('div', 'stock-list');
    g.taps.forEach((tap, i) => {
      const b = g.beer(tap.beerId);
      const line = h('button', `stock-line tap-line${tap.glasses > 0 ? ' on' : ''}`);
      if (b) {
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', tap.glasses > 0 ? tl('{0}/{1} verres', tap.glasses, tap.capacity) : tl('Vide')));
      } else line.append(h('span', 'stock-name', tl('Tireuse {0}', i + 1)), h('span', 'stock-qty', '—'));
      line.append(h('span', 'tap-state', '⇄'));
      line.onclick = () => this.openKegSwap(i);
      list.append(line);
    });
    body.append(list);
    if (!g.beers.some((b) => b.kegs.length)) body.append(h('p', 'hint', tl('Aucun fût plein : brasse en « Fûts » à l\'atelier.')));
  }

  /** Changer le fût d'une tireuse : on prend un fût plein au stockage. */
  openKegSwap(i: number): void {
    const g = this.game();
    const tap = g.taps[i];
    if (!tap) return;
    this.barRoom.selected = `keg${i}`;
    const card = this.modalCard(tl('Changer le fût'));
    if (tap.glasses > 0) card.append(h('p', 'hint', tl('Il reste {0} verres, ils seront perdus.', tap.glasses)));
    const list = h('div', 'stock-list');
    for (const b of g.beers) {
      const line = h('button', 'stock-line tap-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', tl('{0} fût{1}', b.kegs.length, b.kegs.length > 1 ? 's' : '')));
      line.disabled = !b.kegs.length;
      line.onclick = () => {
        const r = g.swapKeg(i, b.id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('crate');
        this.toast(tl('Fût de {0} branché', b.name), 'good');
        this.barRoom.selected = null;
        this.sheetKey = '';
        this.closeModal();
      };
      list.append(line);
    }
    card.append(list);
    if (!g.beers.some((b) => b.kegs.length > 0)) card.append(h('p', 'note bad', tl('Aucun fût plein : brasse en « Fûts » à l\'atelier.')));
    card.append(this.btn('btn', tl('Fermer'), () => {
      this.barRoom.selected = null;
      this.closeModal();
    }));
  }

  // --- Bar : l'agrandir (plus de places, de tireuses, une meilleure ambiance)
  private barUpSheet(g: Game): void {
    const lvl = g.bar;
    const body = this.frameSheet(tl('Bar · {0}', lvl.name));
    const next = BAR[g.barLevel];
    const levels = h('div', 'storage-levels');
    for (const [l, tag, cls] of [[lvl, tl('Actuel'), 'done'], [next, tl('Suivant'), 'current']] as const) {
      if (!l) continue;
      const cell = h('div', `storage-level ${cls}`);
      cell.append(h('span', 'level-name', `${tag} : ${l.name}`), h('span', 'level-perk', tl('{0} tireuse{1} · {2} places', l.taps, l.taps > 1 ? 's' : '', l.seats)));
      levels.append(cell);
    }
    body.append(levels);
    if (next) {
      const b = this.btn('btn primary', tl('Agrandir · {0}', moneyInt(next.cost)), () => {
        const r = g.upgradeBar();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('upgrade');
        this.toast(`${next.name} !`, 'good');
        this.barRoom.invalidate();
        this.syncKegHits();
        this.sheetKey = '';
      });
      this.costGate(b, next.cost);
      body.append(b);
    } else body.append(h('p', 'note', tl('Niveau maximal')));
  }

  /** Barman en renfort : 8 h à rebrancher les fûts vides, à renouveler. */
  openBarman(): void {
    const g = this.game();
    const card = this.modalCard(tl('Barman en renfort'));
    const head = h('div', 'event-head');
    head.append(iconCanvas('barman', 2), h('p', 'hint', tl('Pendant {0} h, il rebranche tout seul les fûts vides avec ceux du stockage, même quand tu n\'es pas là. Pense à renouveler son contrat.', BARMAN.duration / 3600)));
    card.append(head);
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    card.append(h('div', g.barmanOn ? 'note' : 'stats-line', g.barmanOn ? tl('En poste encore {0}', duration(g.barmanUntil - g.time)) : tl('Pas de barman en renfort')));
    card.append(h('div', kegs ? 'stats-line strong' : 'note bad', tl('Fûts pleins au stockage : {0}', kegs)));
    const cost = g.barmanCost;
    const tooLong = Math.max(g.time, g.barmanUntil) + BARMAN.duration - g.time > BARMAN.maxAhead;
    const go = this.btn('btn primary big', tooLong ? tl('Contrat déjà prolongé au maximum (24 h)') : `${g.barmanOn ? tl('Prolonger de 8 h') : tl('Embaucher pour 8 h')} · ${moneyInt(cost)}`, () => {
      const r = g.hireBarman();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('doorOpen');
      this.toast(g.barmanUntil - g.time > BARMAN.duration + 1 ? tl('Contrat prolongé') : tl('Barman embauché !'), 'good');
      this.onSent?.();
      this.closeModal();
    });
    const full = !g.barmanOn && g.staffBusy >= g.staffSlots;
    if (full) go.textContent = tl('Aucun poste libre ({0}/{1})', g.staffBusy, g.staffSlots);
    go.disabled = tooLong || full;
    if (!go.disabled) this.costGate(go, cost);
    card.append(h('p', 'hint', tl('Personnel : {0}/{1} postes occupés.', g.staffBusy, g.staffSlots)));
    card.append(go, this.btn('btn', tl('Tout le personnel (bureau)'), () => this.openComputer('staff')), this.btn('btn', tl('Fermer'), () => this.closeModal()));
  }

  /** Les événements du bar : la fête, puis ceux qu'on débloque en achetant des objets au magasin. */
  openEvents(): void {
    const g = this.game();
    if (this.view !== 'bar') this.goRoom('bar');
    const card = this.modalCard(tl('Événements'));
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    if (g.partying) card.append(h('div', 'note', tl('{0} en cours · encore {1}', g.barEvent.name, clock(g.partyUntil - g.time))));
    else if (g.time < g.partyReadyAt) card.append(h('div', 'hint', tl('Le quartier se repose : prochain événement dans {0}', duration(g.partyReadyAt - g.time))));
    card.append(
      h('p', 'hint', tl('Pendant un événement, les fûts vides sont rebranchés tout seuls avec ceux du stockage.')),
      h('div', kegs ? 'stats-line strong' : 'note bad', tl('Fûts pleins au stockage : {0}', kegs)),
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
        el.append(this.btn('btn small', next?.id === item.id ? tl('🔒 Achète « {0} » au magasin', item.name) : tl('🔒 Au magasin, après « {0} »', next?.name), () => {
          this.closeModal();
          this.openShop('bar', item.id);
        }));
      } else {
        const cost = g.eventCost(ev.id);
        const go = this.btn('btn primary', tl('Lancer · {0}', moneyInt(cost)), () => {
          const r = g.startEvent(ev.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('crowd');
          this.toast(tl('{0} : c\'est parti !', ev.name), 'good');
          this.onSent?.();
          this.closeModal();
        });
        go.disabled = !can;
        if (can) this.costGate(go, cost);
        el.append(go);
      }
      card.append(el);
    }
    card.append(this.btn('btn', tl('Fermer'), () => this.closeModal()));
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
    pc.setAttribute('aria-label', tl('Ordinateur'));
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
    chin.lastElementChild!.setAttribute('aria-label', tl('Éteindre l\'ordinateur'));
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
    this.log(tl('Gaston : bienvenue au bureau ! Les commandes, les tendances et les nouvelles de la brasserie arrivent ici.'), 'info', 'bubble');
  }

  private computerKey(g: Game): string {
    const app = this.computer?.app;
    return JSON.stringify([app, g.computerLevel, g.orders.map((o) => o.id), g.readyOrders.length, this.messages.length, this.unread,
      app === 'staff' ? [g.staffBusy, g.staffSlots, Math.floor(g.money >= g.staffCost('courier') ? 1 : 0), STAFF.map((x) => Math.ceil((g.staffEnd(x.id) - g.time) / 60))] : 0,
      app === 'partners' ? [g.partner ? [g.partner.id, g.partnerDay, Math.floor(g.partnerLeft), Math.floor(g.partnerStock)] : null, PARTNERS.map((p) => [g.partnerChecks(p).map((c) => c.ok), g.money >= p.fee]), popScore(g.brandBase), g.staffOn('courier')] : 0,
      app === 'contests' ? [g.contests, g.contestNexts.map((t) => (t > g.time ? Math.ceil((t - g.time) / 60) : 0)), this.contestTier, g.breweryLevel, [0, 1, 2].map((t) => g.money >= g.contestFee(t as ContestTier)), g.beers.map((b) => [b.id, b.stock >= CONTEST_BOTTLES, Math.round(b.pop * 10), Math.round(b.tasting.quality * 200), b.medals?.length ?? 0]), this.contestPick] : 0,
      app === 'trends' || app === 'marketing' || app === 'orders' || app === 'wholesale' ? [g.adId, g.advertising, ADS.map((a) => g.money >= g.adCost(a.id)), g.gems >= AD_EXTEND.gems, g.computerLevel, g.money >= (COMPUTERS[g.computerLevel]?.cost ?? Infinity), g.trends, g.beers.map((b) => [b.id, b.stock, b.kegs.length, Math.round(b.pop * 10), Math.round(b.wsToday)]), [...this.picks]] : 0]);
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
    bar.append(h('span', 'pc-os', tl('BREW OS')), h('span', 'pc-clock', gameClock(g.time)));
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
    back.setAttribute('aria-label', tl('Retour au menu'));
    const title = h('span', 'pc-win-title');
    title.append(iconCanvas(def.icon, 1, 'pc-win-icon'), h('span', '', def.name));
    const x = this.btn('pc-x', '✕', () => this.closeModal());
    x.setAttribute('aria-label', tl('Éteindre l\'ordinateur'));
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
    else if (st.app === 'marketing') this.marketingTab(g, body);
    else if (st.app === 'contests') this.contestsTab(g, body);
    else if (st.app === 'partners') this.partnersTab(g, body);
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
      marketing: { text: g.advertising ? '●' : '', hot: false },
      wholesale: { text: '', hot: false },
      partners: { text: g.partner && g.partnerLeft > 0 ? '!' : '', hot: !!g.partner && g.partnerLeft > 0 && g.partnerStock >= 1 },
      contests: (() => {
        const open = ([0, 1, 2] as ContestTier[]).filter((t) => g.contestOf(t) && !g.contestOf(t)!.entry);
        return { text: open.length ? '!' : '', hot: open.some((t) => g.beers.some((b) => g.contestChecks(t, b).every((x) => x.ok))) };
      })(),
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
    card.append(h('div', 'stats-line strong', tl('Postes occupés : {0} / {1}', g.staffBusy, g.staffSlots)));
    card.append(h('p', 'hint', next >= 0 ? tl('Un poste de plus quand la brasserie passe ★{0}.', next + 1) : tl('Tous les postes sont ouverts.')));
    for (const def of STAFF) {
      const on = g.staffOn(def.id);
      const left = g.staffEnd(def.id) - g.time;
      const el = h('div', `card staff${on ? ' banner' : ''}`);
      const head = h('div', 'event-head');
      const title = h('div', 'event-title');
      title.append(h('span', 'beer-name', def.name), h('span', 'hint', def.role));
      head.append(iconCanvas(def.id, 3), title);
      el.append(head, h('p', 'hint', def.text));
      const state = h('div', 'stats-line', on ? tl('En poste · encore {0}', duration(left)) : tl('Libre'));
      el.append(state);
      const cost = g.staffCost(def.id);
      const full = !on && g.staffBusy >= g.staffSlots;
      const tooLong = on && left + STAFF_CONTRACT.duration > STAFF_CONTRACT.maxAhead;
      const b = this.btn('btn primary', full ? tl('Aucun poste libre') : tooLong ? tl('Contrat au maximum (24 h)') : `${on ? tl('Prolonger de 8 h') : tl('Embaucher pour 8 h')} · ${moneyShort(cost)}`, () => {
        const r = g.hire(def.id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('doorOpen');
        this.toast(on ? tl('Contrat prolongé') : tl('{0} embauché !', def.name), 'good');
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
    if (!this.messages.length) card.append(h('p', 'hint', tl('Aucun message.')));
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
    const card = this.modalCard(tl('Améliorer l\'ordinateur'));
    card.append(h('div', 'stats-line strong', tl('{0} · {1} places de commandes', cur.name, cur.slots)));
    if (!next) {
      card.append(h('p', 'hint', tl('Ton ordinateur est au sommet.')), this.btn('btn', tl('Fermer'), () => this.closeModal()));
      return;
    }
    card.append(h('p', 'hint', tl('Suivant : {0}, {1} places au tableau des commandes, et un nouveau décor pour le bureau.', next.name, next.slots)));
    const buy = this.btn('btn primary big', tl('Installer · {0}', moneyInt(next.cost)), () => {
      const r = g.upgradeComputer();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('upgrade');
      this.toast(tl('{0} installé', next.name), 'good');
      this.closeModal();
    });
    this.costGate(buy, next.cost);
    card.append(buy);
    if (g.money < next.cost) card.append(h('p', 'note bad', tl('Il te manque {0}.', moneyInt(next.cost - g.money))));
    card.append(this.btn('btn', tl('Annuler'), () => this.closeModal()));
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
    foot.append(h('span', 'hint', tl('{0} · {1} emplacements', COMPUTERS[g.computerLevel - 1]!.name, g.boardSlots)));
    if (next) {
      const b = this.btn('btn small', tl('+1 place · {0}', moneyShort(next.cost)), () => {
        const r = g.upgradeComputer();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('upgrade');
        this.toast(tl('{0} installé', next.name), 'good');
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
    info.append(h('span', 'slot-free-text', tl('Prochaine lettre')), t);
    el.append(iconCanvas('envelope', 2, 'slot-free-icon'), info);
    if (i === 0) {
      const b = this.gemsBtn(tl('Prospecter'), g.boostCost('prospect'), () => {
        const r = g.buyBoost('prospect');
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('paper');
        this.toast(tl('Une lettre arrive !'), 'good');
        this.computer!.key = '';
        this.refreshComputer();
      });
      b.setAttribute('aria-label', tl('Prospecter : une lettre tout de suite, pour {0}', gemsText(g.boostCost('prospect'))));
      // la même prospection contre une pub, 3 fois par jour au plus (le bouton disparaît ensuite jusqu'au lendemain)
      const left = g.adLeft('prospect');
      if (left > 0) {
        const ad = h('button', 'btn small ad-btn');
        ad.append(h('span', '', tl('▶ Gratuit')), h('span', 'ad-left', `${left}/${AD_DAILY}`));
        ad.setAttribute('aria-label', tl('Prospecter gratuitement en regardant une pub (encore {0} aujourd\'hui)', left));
        ad.onclick = async () => {
          ad.disabled = true;
          const seen = await showRewardedAd();
          ad.disabled = false;
          if (!seen) return this.toast(tl('Pub interrompue : pas de lettre'), 'info');
          const r = g.prospectWithAd();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('paper');
          this.toast(tl('Une lettre arrive !'), 'good');
          this.computer!.key = '';
          this.refreshComputer();
        };
        const pair = h('div', 'prospect-btns');
        pair.append(ad, b);
        el.append(pair);
      } else el.append(b);
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
    const parts = [`${o.qty}${o.kind === 'keg' ? tl(' fût{0}', o.qty > 1 ? 's' : '') : ''}`];
    if (o.mix) parts.push(tl('{0} bières', o.mix));
    if (want) parts.push(want.short);
    ask.append(h('span', 'ask-text', parts.join(' · ')));
    const q5 = Math.round(o.minQuality * 5);
    const quality = h('span', 'ask-quality', '★'.repeat(q5) + '☆'.repeat(5 - q5));
    quality.setAttribute('aria-label', tl('Qualité minimale : {0} %', Math.round(o.minQuality * 100)));
    ask.append(quality);
    card.append(ask);
    // ce qui partira
    const ok = g.suitable(o);
    const avail = (b: Beer) => (o.kind === 'keg' ? b.kegs.length : b.stock);
    if (!ok.length) card.append(h('p', 'letter-status none', tl('✗ Aucune bière ne convient')));
    else if (!this.editing.has(o.id)) {
      const line = h('div', `letter-status ${q.ok ? 'ok' : 'short'}`);
      const names = (q.take.length ? q.take.map((t) => t.beer) : ok).map((b) => b.name).join(', ');
      line.append(h('span', 'letter-status-text', q.ok ? `✓ ${names}` : tl('Stock insuffisant : {0}', names)));
      if (ok.length > 1) line.append(this.btn('btn small', tl('Changer'), () => {
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
      sfx.play('cash');
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
    send.append(h('span', 'order-send-label', tl('Envoyer')), gain);
    send.setAttribute('aria-label', tl('Envoyer : {0}{1}', moneyInt(o.reward), gems > 0 ? tl(' et {0}', gemsText(gems)) : ''));
    row.append(send, this.confirmBtn('btn small letter-decline', tl('Refuser'), tl('Refuser ?'), () => {
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
    card.append(h('div', 'letter-delivered', tl('LIVRÉ')));
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
  /**
   * Les campagnes de pub : une phrase qui dit à quoi elles servent, la campagne en cours (ce qu'elle fait, le temps
   * qui reste, la prolonger), puis chaque campagne avec sa durée, son prix et ses effets, une ligne par effet.
   */
  private adsBox(g: Game): HTMLElement {
    const cur = g.ad;
    const box = h('div', `post${cur ? ' live' : ''}`);
    const head = h('div', 'post-head');
    head.append(h('span', 'post-name', tl('Campagnes de pub')));
    box.append(head);
    box.append(h('p', 'hint ad-intro', tl('Une seule à la fois. Tant qu\'elle dure, ta gamme est plus populaire et les commandes arrivent plus vite. Le prix suit la taille de ta brasserie.')));
    const perks = (ad: AdDef) => {
      const list = h('ul', 'ad-perks');
      for (const p of adPerks(ad)) list.append(h('li', '', p));
      return list;
    };
    // la campagne en cours d'abord
    for (const ad of [...ADS].sort((a, b) => Number(b.id === cur?.id) - Number(a.id === cur?.id))) {
      const mine = cur?.id === ad.id;
      const row = h('div', `boost-row ad-row${mine ? ' mine' : ''}${g.adUnlocked(ad.id) ? '' : ' locked'}`);
      const icon = h('div', 'boost-icon');
      icon.append(iconCanvas(AD_ICON[ad.id], 2));
      const text = h('div', 'boost-text');
      const when = mine ? h('span', 'ad-left') : h('span', 'ad-duration', tl('pendant {0} h', ad.duration / 3600));
      if (mine) {
        when.dataset.expires = String(g.adUntil);
        when.textContent = `⏳ ${duration(g.adUntil - g.time)}`;
      }
      const title = h('div', 'ad-title');
      title.append(h('span', 'boost-name', mine ? tl('En cours : {0}', ad.name) : ad.name), when);
      text.append(title, perks(ad));
      const cost = g.adCost(ad.id);
      let b: HTMLElement;
      if (!g.adUnlocked(ad.id)) {
        b = h('span', 'ad-note', tl('🔒 avec l\'ordinateur « {0} »', COMPUTERS[ad.computer - 1]!.name));
      } else if (mine) {
        b = this.gemsBtn(tl('Prolonger de {0} h', AD_EXTEND.hours), AD_EXTEND.gems, () => {
          const r = g.extendAd();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('newspaper');
          this.toast(tl('{0} : prolongée de {1} h', ad.name, AD_EXTEND.hours), 'good');
          this.onSent?.();
          this.computer!.key = '';
          this.refreshComputer();
        });
        b.setAttribute('aria-label', tl('Prolonger {0} de {1} heures : {2}', ad.name, AD_EXTEND.hours, gemsText(AD_EXTEND.gems)));
      } else if (cur) {
        b = h('span', 'ad-note', tl('Disponible après la campagne en cours · {0}', moneyShort(cost)));
      } else {
        const go = this.btn('btn primary price', tl('Lancer · {0}', moneyShort(cost)), () => {
          const r = g.advertise(ad.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('newspaper');
          this.toast(tl('{0} : ta gamme fait parler d\'elle', ad.name), 'good');
          this.computer!.key = '';
          this.refreshComputer();
        });
        go.setAttribute('aria-label', tl('Lancer {0} : {1}', ad.name, moneyInt(cost)));
        this.costGate(go, cost);
        b = go;
      }
      row.append(icon, text, b);
      box.append(row);
    }
    return box;
  }

  /** Le marketing : la popularité de la marque et les campagnes de pub. */
  private marketingTab(g: Game, card: HTMLElement): void {
    card.append(h('div', 'stats-line strong', tl('Ta marque : {0} · {1} / 100', starText(g.brand), popScore(g.brand))));
    card.append(this.adsBox(g));
  }

  /** La popularité de la marque et les tendances du moment. */
  private trendsTab(g: Game, card: HTMLElement): void {
    card.append(h('div', 'stats-line strong', tl('Ta marque : {0} · {1} / 100', starText(g.brand), popScore(g.brand))));
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

  /**
   * Partenariats : le contrat en cours (la jauge du jour, les 7 journées, livrer), puis les partenaires à signer,
   * du club du village aux Jeux mondiaux.
   */
  private partnersTab(g: Game, card: HTMLElement): void {
    card.append(h('div', 'stats-line strong', tl('Ta marque : {0} · {1} / 100', starText(g.brandBase), popScore(g.brandBase))));
    card.append(h('p', 'hint', tl('Sponsorise un club ou un événement pendant une semaine. Chaque jour, une jauge de bière à livrer se remplit : ce qui n\'est pas livré dans la journée est perdu. Bien payé, et le public découvre tes bières (elles comptent double dans les ventes de la semaine).')));
    const ship = g.partner;
    const cur = ship && partnerById(ship.id);
    if (ship && cur) {
      const el = h('div', 'card partner-live');
      const head = h('div', 'beer-head');
      head.append(h('span', 'beer-name', cur.name), h('span', 'order-time', tl('Jour {0} / {1}', g.partnerDay + 1, PARTNER_DAYS)));
      el.append(head);
      // les 7 journées : remplie, manquée, en cours, à venir
      const days = h('div', 'partner-days');
      for (let d = 0; d < PARTNER_DAYS; d++) {
        const full = (ship.delivered[d] ?? 0) >= cur.daily - 0.5;
        const cls = full ? 'full' : d < g.partnerDay ? 'missed' : d === g.partnerDay ? 'today' : '';
        days.append(h('span', `partner-day ${cls}`, full ? '✓' : d < g.partnerDay ? '✗' : String(d + 1)));
      }
      el.append(days);
      // la jauge du jour
      const done = ship.delivered[g.partnerDay] ?? 0;
      const gauge = h('div', 'partner-gauge');
      const fill = h('div', 'partner-gauge-fill');
      fill.style.width = `${Math.min(100, (done / cur.daily) * 100)}%`;
      gauge.append(fill, h('span', 'partner-gauge-text', tl('{0} / {1} aujourd\'hui', liters(done), liters(cur.daily))));
      el.append(gauge);
      const next = h('span', 'order-time');
      const end = ship.start + (g.partnerDay + 1) * 86400;
      next.dataset.expires = String(end);
      next.textContent = `⏳ ${duration(end - g.time)}`;
      const line = h('div', 'stats-line');
      line.append(h('span', '', g.partnerDay + 1 < PARTNER_DAYS ? tl('Nouvelle jauge dans ') : tl('Fin du contrat dans ')), next);
      el.append(line);
      const left = g.partnerLeft;
      const stock = g.partnerStock;
      if (left > 0) {
        const send = Math.min(left, stock);
        const go = this.btn('btn primary', send >= 1 ? tl('Livrer · {0}', liters(send)) : tl('Pas de bière assez bonne en stock'), () => {
          const r = g.deliverPartner();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('crate');
          this.onSent?.();
          this.toast(tl('{0} livrés · +{1}', liters(r.liters!), moneyInt(r.amount!)), 'good');
          this.renderComputer();
        });
        if (send < 1) go.disabled = true;
        el.append(go);
      } else el.append(h('p', 'note', tl('✓ Tout est livré pour aujourd\'hui.')));
      el.append(h('p', 'hint', tl('Qualité minimale : {0} · gagné : {1} · toutes les journées remplies : +{2} 💎', tl(verdictOf(cur.minQuality)), moneyInt(ship.earned), cur.gems)));
      if (!g.staffOn('courier')) el.append(h('p', 'hint', tl('Le livreur (application Personnel) remplit la jauge tout seul, même pendant ton absence.')));
      card.append(el);
    }
    for (const p of PARTNERS) {
      if (cur?.id === p.id) continue;
      const lock = g.partnerLock(p);
      const el = h('div', `card partner${lock ? ' locked' : ''}`);
      const head = h('div', 'beer-head');
      const title = h('span', 'beer-name');
      title.append(iconCanvas('pennant', 1, 'partner-icon'), document.createTextNode(` ${p.name}`));
      head.append(title);
      const done = g.partnersDone[p.id];
      if (done) head.append(h('span', 'partner-done', `✓ ×${done}`));
      el.append(head, h('p', 'hint', p.text));
      const perks = h('ul', 'ad-perks');
      for (const t of [
        tl('{0} par jour pendant {1} jours', liters(p.daily), PARTNER_DAYS),
        tl('Qualité minimale : {0}', tl(verdictOf(p.minQuality))),
        tl('Payé {0} fois le prix du grossiste', p.pay.toLocaleString(locale)),
        tl('Toutes les journées remplies : +{0} 💎', p.gems),
      ]) perks.append(h('li', '', t));
      el.append(perks);
      if (lock) {
        // les conditions, cochées ou non
        const checks = h('div', 'partner-checks');
        for (const c of g.partnerChecks(p)) checks.append(h('div', `partner-check${c.ok ? ' ok' : ''}`, `${c.ok ? '✓' : '🔒'} ${c.text}`));
        el.append(checks);
      }
      else if (ship) el.append(h('span', 'ad-note', tl('Disponible après le partenariat en cours · {0}', moneyShort(p.fee))));
      else {
        const sign = this.btn('btn primary', tl('Signer · {0}', moneyShort(p.fee)), () => {
          const r = g.signPartner(p.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('paper');
          this.toast(tl('Partenariat signé : {0}', p.name), 'good');
          this.renderComputer();
        });
        this.costGate(sign, p.fee);
        el.append(sign);
      }
      card.append(el);
    }
  }

  /** Les concours : le concours en cours (une lettre à cachet de cire), l'inscription, puis le palmarès. */
  private contestsTab(g: Game, card: HTMLElement): void {
    const tiers = openTiers(g.breweryLevel);
    if (!tiers.length) {
      const el = h('div', 'card locked');
      el.append(h('div', 'beer-name', tl('🔒 Les concours s\'ouvrent avec la microbrasserie')),
        h('p', 'hint', tl('Trois concours : régional, national puis international. Pour le national, il faut une médaille au régional ; pour l\'international, une médaille au national. Une médaille se porte en cocarde sur la bouteille : la bière se vend plus, et plus cher.')));
      card.append(el);
    } else {
      // les trois concours, un onglet chacun : la hiérarchie se lit de gauche à droite
      const tabs = h('div', 'contest-tabs');
      for (const tier of [0, 1, 2] as const) {
        const c = g.contestOf(tier);
        const t = CONTEST_TIERS[tier]!;
        const tab = this.btn(`contest-tab${tier === this.contestTier ? ' active' : ''}`, '', () => {
          this.contestTier = tier;
          this.contestPick = null;
          this.renderComputer();
        });
        const state = h('span', 'contest-tab-state');
        if (c?.entry) state.textContent = tl('✓ inscrite');
        else if (c) {
          state.dataset.expires = String(c.closes);
          state.textContent = `⏳ ${duration(c.closes - g.time)}`;
        } else state.textContent = tl('fermé');
        tab.append(cocardeCanvas({ tier, metal: 2 }, 1, 'cocarde small'), h('span', 'contest-tab-name', t.short), state);
        if (c && !c.entry && g.beers.some((b) => g.contestChecks(tier, b).every((x) => x.ok))) tab.classList.add('hot');
        tabs.append(tab);
      }
      card.append(tabs);
      const tier = this.contestTier;
      if (g.contestOf(tier)) card.append(this.contestLetter(g, tier));
      else {
        const el = h('div', 'card');
        const wait = h('span', 'order-time');
        wait.dataset.expires = String(g.contestNexts[tier]);
        wait.textContent = `⏳ ${duration((g.contestNexts[tier] ?? 0) - g.time)}`;
        const head = h('div', 'beer-head');
        head.append(h('span', 'beer-name', tl('Prochaine session')), wait);
        el.append(head, h('p', 'hint', tl('Une lettre arrivera au bureau. Prépare des bières excellentes et populaires : le jury goûte le dernier lot.')));
        card.append(el);
      }
    }
    // le barème des cocardes : plus le concours est prestigieux, plus elle rapporte
    const scale = h('div', 'card');
    scale.append(h('div', 'beer-name', tl('Cocardes')), h('p', 'hint', tl('La meilleure médaille d\'une bière fait vendre plus, et plus cher (bar et grossiste).')));
    const grid = h('div', 'cocarde-grid');
    CONTEST_TIERS.forEach((t, tier) => {
      const row = h('div', `cocarde-row${tiers.includes(tier as 0 | 1 | 2) ? '' : ' locked'}`);
      row.append(h('span', 'cocarde-tier', tl('{0} · {1} ★ ({2} points)', t.name, pointsAsStars(t.points), t.points)));
      for (const metal of [0, 1, 2] as const) {
        const cell = h('span', 'cocarde-cell');
        cell.append(cocardeCanvas({ tier: tier as 0 | 1 | 2, metal }, 2), h('span', '', `+${Math.round(COCARDE_BONUS[tier * 3 + metal]! * 100)} %`));
        row.append(cell);
      }
      grid.append(row);
    });
    scale.append(grid);
    card.append(scale);
    // le palmarès de la brasserie
    const won = g.beers.flatMap((b) => (b.medals ?? []).map((m) => ({ b, m })));
    if (won.length) {
      const list = h('div', 'card');
      list.append(h('div', 'beer-name', tl('Palmarès')));
      won.sort((a, b) => cocardeRank(b.m) - cocardeRank(a.m));
      for (const { b, m } of won) {
        const line = h('div', 'palmares-line');
        const text = h('div', 'palmares-text');
        text.append(h('span', 'palmares-beer', b.name), h('span', 'palmares-detail', `${medalName(m)} · ${contestCategory(m.cat)?.short ?? ''} · ${m.score.toFixed(1)}/20`));
        line.append(cocardeCanvas(m, 1, 'cocarde small'), text);
        list.append(line);
      }
      card.append(list);
    }
  }

  /** La lettre du concours en cours : la catégorie, les rivaux à battre, et la bière à inscrire. */
  private contestLetter(g: Game, tierId: ContestTier): HTMLElement {
    const c = g.contestOf(tierId)!;
    const tier = CONTEST_TIERS[c.tier]!;
    const cat = contestCategory(c.cat);
    const el = h('div', 'letter contest-letter');
    const head = h('div', 'letter-head');
    const time = this.timer(duration(c.closes - g.time));
    time.dataset.expires = String(c.closes);
    time.dataset.received = String(c.closes - 12 * 3600);
    head.append(h('span', 'letter-client', `🏆 ${tier.name}`), time);
    el.append(head);
    this.paintTimer(time, g.time);
    el.append(h('div', 'letter-ask', tl('Catégorie : {0}', cat?.text ?? c.cat)));
    // les rivaux ne se dévoilent qu'à la proclamation : seulement le nombre de participants
    el.append(h('div', 'letter-ask', tl('Participants : {0} brasseries', c.rivals.length + 1)));
    if (c.entry) {
      const b = g.beer(c.entry.beerId);
      el.append(h('p', 'letter-status ok', tl('✓ « {0} » est inscrite. Le jury goûte son lot à la clôture.', b?.name ?? '?')));
      return el;
    }
    if (!g.beers.length) {
      el.append(h('p', 'letter-status none', tl('Garde une bière dans ta gamme pour l\'inscrire.')));
      return el;
    }
    if (this.contestPick == null || !g.beer(this.contestPick)) this.contestPick = g.contestCandidate(c.tier)?.id ?? null;
    const pick = g.beer(this.contestPick)!;
    // les bières de la gamme, en puces : on choisit la candidate
    const chips = h('div', 'chips');
    for (const b of g.beers) {
      const ok = g.contestChecks(c.tier, b).every((x) => x.ok);
      const chip = this.btn(`chip${b.id === pick.id ? ' active' : ''}${ok ? ' ok' : ''}`, b.name, () => {
        this.contestPick = b.id;
        this.renderComputer();
      });
      chips.append(chip);
    }
    el.append(h('div', 'letter-sub', tl('Ta candidate')), chips);
    const note = Math.round(pick.tasting.quality * 200) / 10;
    const checks = h('div', 'contest-checks');
    for (const x of g.contestChecks(c.tier, pick)) checks.append(h('div', `contest-check${x.ok ? ' ok' : ''}`, `${x.ok ? '✓' : '✗'} ${x.text}`));
    checks.append(h('div', 'contest-check info', tl('Dernier lot : {0}/20 (le jury varie de ± 0,3)', note.toFixed(1))));
    el.append(checks);
    const fee = g.contestFee(c.tier);
    const ready = g.contestChecks(c.tier, pick).every((x) => x.ok);
    const go = this.btn('btn primary', tl('Inscrire · {0}', moneyInt(fee)), () => {
      const r = g.enterContest(c.tier, pick.id);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      sfx.play('paper');
      this.toast(tl('« {0} » est inscrite !', pick.name), 'good');
      this.renderComputer();
    });
    if (!ready) go.disabled = true;
    else this.costGate(go, fee);
    el.append(go);
    if (!ready) {
      const miss = g.contestChecks(c.tier, pick).find((x) => !x.ok)!;
      el.append(h('p', 'letter-status short', this.contestAdvice(g, c.tier, pick, miss.text)));
    }
    return el;
  }

  /** Ce qu'il faut faire pour remplir la condition qui manque. */
  private contestAdvice(g: Game, tier: ContestTier, b: Beer, miss: string): string {
    const checks = g.contestChecks(tier, b);
    const kind = (text: string) => checks.findIndex((x) => x.text === text) - (tier > 0 ? 1 : 0);
    if (tier > 0 && checks[0]?.text === miss) return tl('Inscris-la d\'abord au {0} et décroche une médaille.', CONTEST_TIERS[tier - 1]!.name.toLowerCase());
    const k = kind(miss);
    if (k === 0) return tl('Elle n\'entre pas dans la catégorie : brasse une recette exprès.');
    if (k === 1) {
      const p = g.popBreakdown(b);
      const missing = Math.max(1, CONTEST_TIERS[tier]!.points - popScore(b.pop));
      if (p.next) return tl('Il lui manque {0} points : vends-en davantage ({1} sur 7 jours donnent {2} / 50) ou suis une tendance (+10).', missing, liters(p.next.liters), Math.round(p.next.stars * 20));
      return tl('Il lui manque {0} points : suis une tendance (+10) ou améliore la qualité.', missing);
    }
    return tl('Programme un brassin en bouteilles.');
  }

  /** La proclamation des résultats : les rivaux, le suspense de la note, puis la révélation (voir ceremony.ts). */
  private openContestResult(r: ContestResult): void {
    const g = this.game();
    const card = this.modalCard(`🏆 ${CONTEST_TIERS[r.tier]!.name}`);
    // la fenêtre reste en haut et s'agrandit vers le bas à mesure que les bières arrivent
    this.modal.classList.add('top');
    playCeremony({
      card, layer: this.modal, result: r, brewery: tl('Ta brasserie'),
      label: (r.beerId != null ? g.beer(r.beerId)?.label : undefined) ?? DEFAULT_LABEL,
      onDone: () => {
        g.seenContestResult();
        this.closeModal();
        this.sheetKey = '';
      },
    });
  }

  /** Le grossiste : il reprend bouteilles et fûts à tout moment, à petit prix, dans la limite d'un quota par bière (en litres, rechargé à minuit). */
  private wholesaleTab(g: Game, card: HTMLElement): void {
    const auto = h('label', 'toggle');
    const box = h('input');
    box.type = 'checkbox';
    box.checked = g.autoWholesale;
    box.onchange = () => (g.autoWholesale = box.checked);
    auto.append(box, h('span', '', tl('Vendre automatiquement quand le stockage est plein')));
    card.append(auto, h('p', 'hint', tl('Bouteilles et fûts, à petit prix, dans la limite d\'un quota par bière qui se recharge à minuit. Plus une bière est populaire, plus il en reprend.')));
    const beers = g.beers.filter((b) => (b.stock > 0 || b.kegs.length > 0) && b.tasting.quality >= DRINKABLE_MIN);
    if (!beers.length) card.append(h('p', 'hint', tl('Rien en stock.')));
    for (const b of beers) {
      const box = h('div', 'ws-beer');
      const head = h('div', 'stock-line');
      const thumb = h('canvas', 'label-thumb');
      drawLabel(thumb, b.label, b.name);
      const quota = g.wholesaleQuota(b);
      const left = g.wholesaleLeft(b);
      const open = !Number.isFinite(quota); // grossiste sans limite (boost)
      head.append(thumb, h('span', 'stock-name', b.name), h('span', `ws-quota${left <= 0 ? ' full' : ''}`, open ? tl('sans limite') : `${liters(quota - left)} / ${liters(quota)}`));
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
            sfx.play('cash');
            this.gainToast(r.amount!);
            this.refreshComputer();
          });
          btn.disabled = can <= 0;
          return btn;
        };
        if (can > one.n) el.append(sell(one.n, one.label));
        const kegL = [...b.kegs].sort((x, y) => x - y).slice(0, can).reduce((s, k) => s + k * GLASS_L, 0);
        const value = (format === 'bottle' ? can * BOTTLE_L : kegL) * perL;
        el.append(sell(can, can > 0 ? `${can === have ? tl('Tout') : can} · ${moneyInt(value)}` : tl('Quota atteint')));
        box.append(el);
      };
      row('bottle', b.stock, tl('{0} btl', b.stock), { n: CRATE, label: '1 caisse' });
      row('keg', b.kegs.length, tl('{0} fût{1}', b.kegs.length, b.kegs.length > 1 ? 's' : ''), { n: 1, label: tl('1 fût') });
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
        el.setAttribute('aria-label', tl('Fût de la tireuse {0} : les fûts', Number(hit.id.slice(3)) + 1));
        el.onclick = () => this.open({ kind: 'bar' });
      } else {
        el.setAttribute('aria-label', tl('{0} : événements', g.barEvent.name));
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
    const card = this.modalCard(tl('Dégustation'));
    this.tastingBody(card, t);
    const ok = t.quality >= DRINKABLE_MIN;
    const full = g.beers.length >= g.rangeSlots;
    const slotCost = g.nextSlotCost;
    const keep = this.btn('btn primary big', ok ? (full ? tl('Gamme pleine') : tl('Garder cette bière')) : tl('Imbuvable'), () => {
      this.openLabelEditor(g.beers.length ? '' : tl('Blonde de Gaston'), { ...DEFAULT_LABEL }, (name, label) => {
        const r = g.keepTrial(name, label);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('pickup');
        this.closeModal();
        this.toast(tl('Nouvelle bière dans ta gamme !'), 'good');
        this.sheetKey = '';
      });
    });
    keep.disabled = !ok || full;
    if (full && ok) {
      if (slotCost != null) {
        const buy = this.btn('btn', tl('Créer une gamme · {0}', moneyInt(slotCost)), () => {
          const r = g.buySlot();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('paper');
          this.sheetKey = '';
          this.openTasting();
        });
        this.costGate(buy, slotCost);
        card.append(buy);
      }
    }
    // le premier essai, guidé par Gaston, ne se jette pas
    if (!g.beers.length && g.tips < TUTO_DONE) return void card.append(keep);
    card.append(keep, this.confirmBtn('btn bad', tl('Jeter'), tl('Jeter ce brassin ? Toucher pour confirmer'), () => {
      g.discardTrial();
      this.closeModal();
      this.toast(tl('Brassin jeté'), 'info');
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
    const card = this.modalCard(tl('Ton étiquette'));
    const preview = h('div', 'label-preview');
    const big = h('canvas', 'label-big');
    const bottle = h('div', 'shelf-bottle');
    const glass = h('canvas', 'shelf-glass');
    const small = h('canvas', 'shelf-label');
    bottle.append(glass, small);
    preview.append(big, bottle);
    const input = h('input', 'name-input');
    input.maxLength = 22;
    input.placeholder = tl('Nom de ta bière');
    input.value = name;
    let stones: HTMLElement | null = null;
    const redraw = () => {
      stones?.classList.toggle('hidden', label.emblem !== 'gem');
      drawLabel(big, label, input.value);
      drawLabel(small, label, input.value);
      drawShelfBottle(glass, 'beer', label.bottle);
      const spot = labelSpot(label.bottle);
      Object.assign(small.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
    };
    const g = this.game();
    input.oninput = redraw;
    card.append(preview, h('div', 'section-title', tl('Nom')), input);
    const isOpen = (kind: UnlockKind, value: string) => g.isUnlocked(kind, value) || String(base[kind]) === value;
    const chooser = <K extends keyof Label>(title: string, key: K, options: { id: Label[K]; name: string }[], kind?: UnlockKind) => {
      const row = h('div', 'chips');
      for (const o of options) {
        const open = !kind || isOpen(kind, String(o.id));
        const x = LABEL_UNLOCKS.find((u) => u.kind === kind && u.value === o.id);
        const c = this.btn(`chip${(label[key] ?? 'classic') === o.id ? ' active' : ''}${open ? '' : ' locked'}`, open ? o.name : `🔒 ${o.name}`, () => {
          if (!open) return this.toast(tl('« {0} » se débloque au magasin, rayon Étiquettes · {1}', o.name, x?.gems ? gemsText(x.gems) : moneyShort(x?.cost ?? 0)), 'info');
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
    chooser(tl('Bouteille'), 'bottle', BOTTLES, 'bottle');
    chooser(tl('Forme'), 'shape', SHAPES, 'shape');
    colors(tl('Fond'), 'bg');
    chooser(tl('Motif'), 'pattern', PATTERNS, 'pattern');
    colors(tl('Couleur du motif'), 'patternColor');
    chooser(tl('Emblème'), 'emblem', EMBLEMS, 'emblem');
    // logo diamant : le choix de la pierre
    stones = h('div', 'gem-stones');
    const stoneRow = h('div', 'swatches');
    for (const st of GEMSTONES) {
      const sw = this.btn(`swatch stone${(label.gem ?? 'diamond') === st.id ? ' active' : ''}`, '', () => {
        label.gem = st.id;
        stoneRow.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === sw));
        redraw();
      });
      sw.style.background = `linear-gradient(135deg, ${st.a} 0 22%, ${st.b} 22% 55%, ${st.d} 55%)`;
      sw.setAttribute('aria-label', st.name);
      sw.title = st.name;
      stoneRow.append(sw);
    }
    stones.append(h('div', 'section-title', tl('Pierre du diamant')), stoneRow);
    card.append(stones);
    chooser(tl('Police du nom'), 'font', FONTS);
    colors(tl('Couleur du texte et du contour'), 'textColor');
    card.append(this.btn('btn primary big', tl('Valider l\'étiquette'), () => onDone(input.value, label)));
    redraw();
    void document.fonts?.ready.then(redraw);
  }

  private openTastingView(name: string, t: Tasting): void {
    const card = this.modalCard(name);
    this.tastingBody(card, t);
    card.append(this.btn('btn', tl('Fermer'), () => this.closeModal()));
  }

  private tastingBody(card: HTMLElement, t: Tasting): void {
    const v = verdictOf(t.quality);
    card.append(h('div', `verdict big ${VERDICT_CLASS[v]}`, tl(v)), h('div', 'score', tl('{0} · note {1}/20', tl(t.style), Math.round(t.quality * 20))));
    const stats = h('div', 'tasting-stats');
    const lab = (x: number, a: string, b: string, c: string) => (x > 0.66 ? a : x > 0.33 ? b : c);
    for (const [k, val] of [
      [tl('Alcool'), `${t.abv.toFixed(1)} %`], [tl('Amertume'), tl('{0} IBU', Math.round(t.ibu))], [tl('Couleur'), colorName(t.color)],
      [tl('Arôme'), lab(t.aroma, tl('Intense'), tl('Présent'), tl('Discret'))], [tl('Limpidité'), lab(t.clarity, tl('Limpide'), tl('Voilée'), tl('Trouble'))], [tl('Bulles'), t.co2 < 1.8 ? tl('Plate') : t.co2 > 3.2 ? tl('Excessives') : tl('Fines')],
    ] as const) {
      const c = h('div', 'stat');
      c.append(h('div', 'section-title', k), h('div', 'stat-value', val));
      stats.append(c);
    }
    card.append(stats);
    if (t.defects.length) {
      card.append(h('div', 'section-title', tl('Ce qui ne va pas')));
      const ul = h('ul', 'defects');
      for (const d of t.defects) ul.append(h('li', '', d.label));
      card.append(ul);
    } else card.append(h('p', 'note', tl('Aucun défaut')));
    // au-delà des défauts : ce qui manque pour une grande bière
    if (t.tips?.length && t.quality >= 0.6) {
      card.append(h('div', 'section-title', tl('Pour plus de finesse')));
      const ul = h('ul', 'defects tips');
      for (const tip of t.tips.slice(0, 3)) ul.append(h('li', '', tip));
      card.append(ul);
    }
  }

  /** La bourse pour laquelle le doublement a déjà été proposé (une nouvelle absence en crée une autre). */
  private offlineShown: object | null = null;
  private ceremonyShown: ContestResult | null = null;
  /** Jusqu'à quand la bourse garde son ancien montant (les pièces du doublement sont en vol). */
  private harvestHoldUntil = 0;

  /**
   * Au retour : la bourse de l'absence reste en haut à droite (on la récolte comme avant) ; une fenêtre sobre propose
   * seulement de doubler l'argent contre une pub (3 fois par jour au plus). Pub regardée : les pièces quittent la
   * fenêtre pour rejoindre la bourse, dont le montant grossit à leur arrivée et qui brille alors davantage.
   */
  private openOfflineReward(): void {
    const g = this.game();
    const o = g.offline;
    if (!o || o.earned <= 0 || o.doubled || g.adLeft('double') <= 0) return;
    const card = this.modalCard(tl('Doubler tes gains ?'));
    card.classList.add('reward-card');
    // une ligne : la bourse, l'offre, et le bouton Play à côté (la croix du titre ferme la fenêtre)
    const row = h('div', 'reward-row');
    const bag = h('span', 'reward-bag', '💰');
    const note = h('p', 'reward-note hidden');
    const amount = h('strong', 'reward-amount', moneyInt(o.earned));
    const text = h('p', 'reward-text');
    text.append(tl('Regardez une pub pour gagner '), amount, tl(' supplémentaires !'));
    const play = h('button', 'btn primary reward-play', '▶');
    play.setAttribute('aria-label', tl('Regarder une pub pour gagner {0} supplémentaires', moneyInt(o.earned)));
    play.onclick = async () => {
      play.disabled = true;
      const seen = await showRewardedAd();
      play.disabled = false;
      if (!seen) {
        // pub passée : la fenêtre reste, on peut réessayer (rien n'est compté)
        note.textContent = tl('La pub n\'a pas été vue jusqu\'au bout : tes gains ne sont pas doublés. Tu peux réessayer.');
        note.classList.remove('hidden');
        return;
      }
      const r = g.doubleOffline();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.coinsToHarvest(amount);
    };
    row.append(bag, text, play);
    card.append(row, note);
  }

  /** Après la pub : les pièces filent de la fenêtre jusqu'à la bourse, qui prend le montant doublé à leur arrivée. */
  private coinsToHarvest(from: HTMLElement): void {
    this.harvestHoldUntil = performance.now() + 60_000; // levé à l'arrivée des pièces
    this.harvest.classList.remove('hidden');
    this.harvests.classList.add('over-modal');
    this.fly(from, this.harvest, 12, () => h('span', 'fly coin'));
    window.setTimeout(() => this.closeModal(), 250);
    window.setTimeout(() => {
      sfx.play('cash');
      this.onSent?.();
      this.harvestHoldUntil = 0;
      this.harvests.classList.remove('over-modal');
      this.harvest.dataset.text = '';
      this.update();
    }, 900);
  }

  /** Récolte l'argent de l'absence : les pièces filent vers le compteur, l'argent défile, un petit mot résume l'absence. */
  collectOfflineMoney(origin: HTMLElement = this.harvest, coins = 8): void {
    const g = this.game();
    const o = g.offline;
    if (!o || o.earned <= 0) return;
    const from = g.money;
    const { seconds, liters: l } = o;
    this.fly(origin, this.moneyPill, coins, () => h('span', 'fly coin'));
    const earned = g.collectOffline('money');
    sfx.play('cash');
    this.moneyAnim = { from, to: g.money, start: performance.now() + 600 };
    this.moneyPill.classList.add('gain');
    this.harvest.classList.add('hidden');
    const hrs = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    this.toast(tl('+{0} · {1}{2} min d\'absence, {3} vendus', moneyInt(earned), hrs ? `${hrs} h ` : '', min, liters(l ?? 0)), 'good');
    this.log(tl('Pendant ton absence ({0}{1} min) : {2} de bière vendus, +{3}', hrs ? `${hrs} h ` : '', min, liters(l ?? 0), moneyInt(earned)), 'good', 'chart');
    this.onSent?.();
  }

  /** Récolte les diamants de l'absence : ils filent vers leur compteur, qui se met à jour à leur arrivée. */
  collectOfflineGems(): void {
    const g = this.game();
    const n = g.offline?.gems ?? 0;
    if (n <= 0) return;
    this.gemsHold = { value: g.gems, until: performance.now() + 750 };
    this.fly(this.harvestGems, this.gemsPill, Math.min(6, n), () => iconCanvas('gem', 1, 'fly fly-gem'));
    g.collectOffline('gems');
    sfx.play('gem');
    this.harvestGems.classList.add('hidden');
    this.toast(tl('+{0} gagnés pendant ton absence', gemsText(n)), 'good');
    this.onSent?.();
  }

  /** Fiche de la brasserie : son niveau, ce qui manque pour le suivant et ce qu'il débloque. */
  openBrewery(levelUp = false): void {
    const g = this.game();
    const lv = g.breweryLevel;
    const card = this.modalCard(levelUp ? tl('Ta brasserie grandit !') : tl('Ta brasserie'));
    card.append(h('div', 'verdict big v-top', `★ ${lv} · ${g.breweryName}`));
    const opened = CLIENT_TYPES.filter((d) => d.level === lv && d.level > 1);
    if (levelUp && opened.length) card.append(h('p', 'note', tl('Nouveaux clients : {0}', opened.map((d) => d.label).join(', '))));
    if (lv < MAX_LEVEL) {
      card.append(h('div', 'section-title', tl('Prochain : ★{0} {1}', lv + 1, BREWERY_NAMES[lv])));
      const list = h('div', 'brewery-list');
      for (const id of STATION_ORDER) {
        const ok = g.level(id) > lv;
        const row = h('div', `brewery-row${ok ? ' ok' : ''}`);
        row.append(img(stationCanvas(id, g.level(id)), 'pix brewery-pic'), h('span', '', STATIONS[id].step), h('span', 'brewery-state', ok ? '✓' : tl('niv. {0}', g.level(id))));
        row.onclick = () => {
          this.closeModal();
          this.goRoom('workshop');
          this.open({ kind: 'station', id });
        };
        list.append(row);
      }
      const next = CLIENT_TYPES.filter((d) => d.level === lv + 1);
      card.append(list);
      if (next.length) card.append(h('p', 'hint', tl('Débloque : {0}', next.map((d) => d.label).join(', '))));
    } else card.append(h('p', 'note', tl('Niveau maximal')));
    card.append(this.btn('btn primary', tl('Fermer'), () => this.closeModal()));
  }

  private openOptions(): void {
    const g = this.game();
    const card = this.modalCard(tl('Options'));
    card.append(h('div', 'stats-line', tl('{0} brassins · {1} vendus · {2}', g.batchesDone, liters(g.totalLiters), moneyInt(g.totalRevenue))));
    const fresh = this.btn('btn bad', tl('Nouvelle partie'), () => {
      if (fresh.dataset.confirm) {
        this.closeModal();
        this.cb.newGame();
        return;
      }
      fresh.dataset.confirm = '1';
      fresh.textContent = tl('Sûr ? Ta brasserie sera effacée. Toucher pour confirmer');
    });
    const sound = h('div', 'card');
    const vol = h('input', 'volume-range');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.step = '5';
    vol.value = String(sfx.prefs.volume);
    vol.setAttribute('aria-label', tl('Volume des bruitages'));
    vol.oninput = () => sfx.setVolume(Number(vol.value));
    vol.onchange = () => sfx.play('pop');
    const toggle = this.btn(`chip${sfx.prefs.effects ? ' active' : ''}`, sfx.prefs.effects ? tl('Activés') : tl('Coupés'), () => {
      sfx.setEffects(!sfx.prefs.effects);
      toggle.classList.toggle('active', sfx.prefs.effects);
      toggle.textContent = sfx.prefs.effects ? tl('Activés') : tl('Coupés');
      vol.disabled = !sfx.prefs.effects;
      sfx.play('pop');
    });
    vol.disabled = !sfx.prefs.effects;
    const row = h('div', 'volume-row');
    row.append(toggle, vol);
    sound.append(h('div', 'section-title', tl('Bruitages')), row);
    card.append(sound);
    // la langue : celle du système par défaut (l'anglais si le jeu ne la parle pas)
    const langCard = h('div', 'card');
    const langs = h('div', 'chips');
    const chosen = chosenLang();
    const sys = LANGS.find((l) => l.id === systemLang())!;
    const opt = (id: Lang | null, name: string) => {
      const c = this.btn(`chip${chosen === id ? ' active' : ''}`, name, () => {
        if (chosen === id) return;
        setLang(id);
      });
      langs.append(c);
    };
    opt(null, tl('Système ({0})', sys.name));
    for (const l of LANGS) opt(l.id, l.name);
    langCard.append(h('div', 'section-title', tl('Langue')), langs);
    card.append(langCard);
    // Accélération du temps : réservée aux tests (elle fausserait l'équilibrage du jeu).
    const speed = h('div', 'card');
    const chips = h('div', 'chips');
    for (const v of [1, 2, 4, 10]) {
      const c = this.btn(`chip${this.cb.getSpeed() === v ? ' active' : ''}`, tl('×{0}', v), () => {
        this.cb.setSpeed(v);
        chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
      });
      chips.append(c);
    }
    speed.append(h('div', 'section-title', tl('Mode test : vitesse')), chips);
    if (import.meta.env.DEV) card.append(speed);
    card.append(fresh, this.btn('btn', tl('Fermer'), () => this.closeModal()));
  }

  /** Le message qui défile sur le panneau lumineux du comptoir. */
  private openBarMessage(): void {
    const g = this.game();
    const card = this.modalCard(tl('Panneau lumineux'));
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
      h('div', 'stats-line', tl('Le message qui défile sur la façade du comptoir ({0} caractères au plus).', BAR_MESSAGE_MAX)),
      input,
      this.btn('btn primary', tl('Afficher ce message'), save),
    );
    input.focus();
  }

  private modalCard(title: string): HTMLElement {
    this.computer = null;
    this.modal.classList.remove('top');
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
    this.modal.classList.remove('top');
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
    kpi(tl('Dernière heure'), moneyShort(hour), tl('{0}/min ces 5 min', moneyInt(last5 / 5)));
    kpi(tl('Recettes totales'), moneyShort(g.totalRevenue), tl('{0} vendus', liters(g.totalLiters)));
    kpi(tl('Marque'), starText(g.brand), tl('{0} clients/h au bar', fmtRate(g.barRate * 60)));
    kpi(tl('Brassins'), String(g.batchesDone), tl('{0} en cours', g.batches.length));
    page.append(kpis);

    // ventes minute par minute
    const chart = h('div', 'card dash-chart');
    chart.append(h('div', 'section-title', tl('Ventes · 60 dernières minutes')));
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
    canvas.setAttribute('aria-label', tl('Ventes de la dernière heure : {0}', moneyInt(hour)));
    const axis = h('div', 'chart-axis');
    axis.append(h('span', '', tl('−60 min')), h('span', '', '−30'), h('span', '', 'maintenant'));
    chart.append(legend, tip, canvas, axis);
    page.append(chart);
    const showTip = () => {
      const i = this.dashPick;
      const m = i != null ? minutes[i] : undefined;
      if (!m) {
        tip.textContent = hour ? tl('Touche une barre pour le détail') : tl('Pas encore de vente cette heure-ci');
        tip.classList.add('dim');
        return;
      }
      tip.classList.remove('dim');
      const ago = minutes.length - 1 - i!;
      const parts = SALE_SOURCES.filter((s) => m[s] > 0).map((s) => `${SOURCE[s].name} ${moneyInt(m[s])}`);
      tip.textContent = `${ago ? tl('Il y a {0} min', ago) : tl('Cette minute')} : ${moneyInt(m.bar + m.orders + m.wholesale)}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
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
    split.append(h('div', 'section-title', tl('Répartition des recettes')));
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
    live.append(h('div', 'section-title', tl('En direct')));
    const line = (k: string, v: string, cls = '') => {
      const r = h('div', `live-row ${cls}`);
      r.append(h('span', '', k), h('span', 'live-value', v));
      live.append(r);
    };
    const sorted = [...g.batches].sort((a, b) => b.stage - a.stage);
    if (!sorted.length) line(tl('Atelier'), tl('à l\'arrêt'), 'dim');
    for (const b of sorted) {
      const id = STATION_ORDER[b.stage]!;
      const name = g.beer(b.beerId)?.name ?? tl('Essai');
      line(`${name} · ${STATIONS[id].step}`, b.waiting ? '⏸' : clock(b.duration - b.elapsed));
    }
    if (g.tastable) line(tl('Essai'), tl('à goûter 🍺'));
    line(tl('Stockage'), g.storageFull ? tl('plein !') : `${Math.round((g.stored / g.storageCap) * 100)} %`, g.storageFull ? 'bad' : '');
    const taps = g.taps.filter((t) => t.glasses > 0).length;
    line(tl('Bar'), tl('{0}/{1} tireuses · {2} verres', taps, g.taps.length, g.glassesLeft));
    if (g.partying) line(tl('Fête'), `🎉 ${clock(g.partyUntil - g.time)}`);
    if (g.ad) line(g.ad.name, `📣 ${clock(g.adUntil - g.time)}`);
    const fc = this.forecast(g);
    if (fc) line(tl('File de brassins'), `${g.planned} · ${fc.res.done ? tl('fin dans {0}', clock(fc.at + fc.res.total - g.time)) : BLOCKED_TEXT[fc.res.blocked ?? 'slow']}`, fc.res.done ? '' : 'bad');
    else line(tl('File de brassins'), 'vide');
    line(tl('Commandes'), g.orders.length ? tl('{0} en attente{1}', g.orders.length, g.readyOrders.length ? tl(' · {0} prête{1}', g.readyOrders.length, g.readyOrders.length > 1 ? 's' : '') : '') : 'aucune');
    page.append(live);

    // les bières qui rapportent le plus
    if (g.beers.length) {
      const top = h('div', 'card');
      top.append(h('div', 'section-title', tl('Ma gamme')));
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
    // le concours en cours a sa case, dorée, avec le temps qui reste avant la clôture des inscriptions
    const contest = g.contest;
    const ship = g.partner;
    const shipDef = ship && partnerById(ship.id);
    const hide = (!live.length && !contest && !ship) || this.view === 'shop' || this.modalOpen || !!this.openSheet;
    this.boostHud.classList.toggle('hidden', hide);
    this.boostHud.classList.toggle('below-harvest', !this.harvest.classList.contains('hidden') || !this.harvestGems.classList.contains('hidden'));
    if (hide) return;
    const mult = (id: string) => BOOSTS.find((x) => x.id === id)?.mult ?? 1;
    const key = live.map((b) => `${b.ch}:${mult(b.id)}`).join('|') + (contest ? `|contest:${contest.tier}:${g.contests.map((c) => (c ? (c.entry ? 'e' : 'o') : '-')).join('')}` : '') + (ship ? `|partner:${ship.id}:${g.partnerDay}` : '');
    if (key !== this.boostHudKey) {
      this.boostHudKey = key;
      this.boostHud.replaceChildren();
      for (const b of live) {
        // l'effet : dans un cadre arc-en-ciel, l'icône du poste, le multiplicateur dans un coin,
        // un cadran qui se vide en balayant au fil du boost, et le temps qui reste au centre
        const el = h('button', `boost-chip effect-${b.ch}`);
        const face = h('span', 'boost-chip-face');
        // le grossiste sans limite : une caisse marquée « ∞ »
        const gate = b.id === 'openGate';
        face.append(h('span', 'boost-chip-dial'), iconCanvas(gate ? 'crate' : EFFECT_ICON[b.ch], 2), h('span', 'boost-chip-time'));
        el.append(face, h('span', 'boost-chip-mult', gate ? '∞' : tl('×{0}', mult(b.id).toLocaleString(locale))));
        el.onclick = () => this.openShop('boosts');
        this.boostHud.append(el);
      }
      if (contest) {
        const el = h('button', `boost-chip contest-chip t${contest.tier}`);
        const face = h('span', 'boost-chip-face');
        face.append(h('span', 'boost-chip-dial'), iconCanvas('trophy', 2), h('span', 'boost-chip-time'));
        // inscrite : une coche ; pas encore : un point d'exclamation
        const waiting = g.contests.some((c) => c && !c.entry);
        el.append(face, h('span', `boost-chip-mult contest-flag${waiting ? '' : ' in'}`, waiting ? '!' : '✓'));
        el.onclick = () => {
          // ouvre l'onglet du concours qui ferme le plus tôt sans bière inscrite (sinon le plus proche)
          const open = ([0, 1, 2] as ContestTier[]).filter((t) => g.contestOf(t));
          const todo = open.filter((t) => !g.contestOf(t)!.entry).sort((a, b) => g.contestOf(a)!.closes - g.contestOf(b)!.closes)[0];
          this.contestTier = todo ?? g.contest?.tier ?? 0;
          this.contestPick = null;
          this.openComputer('contests');
        };
        this.boostHud.append(el);
      }
      if (ship) {
        // le partenariat : la jauge du jour se remplit dans le cadran, le jour du contrat dans un coin
        const el = h('button', 'boost-chip partner-chip');
        const face = h('span', 'boost-chip-face');
        face.append(h('span', 'boost-chip-dial'), iconCanvas('pennant', 2), h('span', 'boost-chip-time'));
        el.append(face, h('span', 'boost-chip-mult partner-flag', `${g.partnerDay + 1}/${PARTNER_DAYS}`));
        el.onclick = () => this.openComputer('partners');
        this.boostHud.append(el);
      }
    }
    if (ship && shipDef) {
      const el = this.boostHud.querySelector<HTMLElement>('.partner-chip')!;
      const done = ship.delivered[g.partnerDay] ?? 0;
      el.style.setProperty('--left', Math.min(1, done / shipDef.daily).toFixed(4));
      el.classList.toggle('full', done >= shipDef.daily - 0.5);
      const t = done >= shipDef.daily - 0.5 ? '✓' : `${Math.floor((done / shipDef.daily) * 100)}%`;
      const span = el.querySelector('.boost-chip-time')!;
      if (span.textContent !== t) span.textContent = t;
      el.setAttribute('aria-label', tl('{0} : jour {1} sur {2}, {3} livrés sur {4}', shipDef.name, g.partnerDay + 1, PARTNER_DAYS, liters(done), liters(shipDef.daily)));
    }
    if (contest) {
      const el = this.boostHud.querySelector<HTMLElement>('.contest-chip')!;
      const left = Math.max(0, contest.closes - g.time);
      el.style.setProperty('--left', (left / CONTEST_OPEN_S).toFixed(4));
      const t = dialTime(left);
      const span = el.querySelector('.boost-chip-time')!;
      if (span.textContent !== t) span.textContent = t;
      el.setAttribute('aria-label', tl('{0} : {1}, encore {2}', CONTEST_TIERS[contest.tier]!.name, contest.entry ? tl('bière inscrite') : tl('inscriptions ouvertes'), duration(left)));
    }
    this.boostHud.querySelectorAll<HTMLElement>('.boost-chip:not(.contest-chip):not(.partner-chip)').forEach((el, i) => {
      const b = live[i]!;
      const left = Math.max(0, b.until - g.time);
      el.style.setProperty('--left', g.boostLeftShare(b.ch).toFixed(4));
      const t = dialTime(left);
      const span = el.querySelector('.boost-chip-time')!;
      if (span.textContent !== t) span.textContent = t;
      el.setAttribute('aria-label', tl('{0} : encore {1}', b.id === 'openGate' ? tl('Grossiste sans limite') : tl('{0} ×{1}', EFFECT_NAME[b.ch], mult(b.id).toLocaleString(locale)), duration(left)));
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
      gems: { text: '', cls: '' },
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
      tab === 'gems' ? [g.packsBought, this.gemBuying, this.gemPrices ? [...this.gemPrices] : null] : 0,
    ]);
    if (key === this.shopKey) return;
    this.shopKey = key;
    const scroll = this.shopBody.scrollTop;
    this.shopBody.replaceChildren();
    this.showcaseScene = null;
    if (tab === 'bar') this.shopBar(g);
    if (tab === 'boosts') this.shopBoosts(g);
    if (tab === 'labels') this.shopLabels(g);
    if (tab === 'gems') this.shopGems(g);
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
      if (missing > 0) return this.toast(tl('Il te manque {0} : les commandes livrées en rapportent', gemsText(missing)), 'bad');
      run();
    };
    return b;
  }

  /**
   * Rayon Diamants : la boutique d'argent réel. Le pack de démarrage en tête (une seule fois), puis les quatre packs.
   * Les prix viennent de l'App Store dans la devise du joueur ; en attendant, les prix de référence en euros.
   */
  private shopGems(g: Game): void {
    if (!this.gemPrices) {
      this.gemPrices = new Map();
      void this.cb.gemPrices().then((m) => {
        this.gemPrices = m;
        this.shopKey = '';
        this.renderShop();
      });
    }
    const kind = this.cb.storeKind();
    const head = h('div', 'gems-head');
    const count = h('div', 'gems-count');
    count.append(iconCanvas('gem', 2, 'gems-count-icon'), h('span', '', g.gems.toLocaleString(locale)));
    head.append(count, h('p', 'gems-why', tl('Les diamants font gagner du temps : boosts, prospection, pièces rares d\'étiquette.')));
    this.shopBody.append(head);
    const card = (pack: GemPack, big: boolean) => {
      const el = h('div', `gem-pack${big ? ' big' : ''}`);
      if (pack.tag) el.append(h('span', 'gem-pack-tag', pack.tag));
      const pile = h('div', 'gem-pack-pile');
      // une pile de diamants d'autant plus haute que le pack est gros
      const n = pack.gems >= 2000 ? 5 : pack.gems >= 1000 ? 4 : pack.gems >= 400 ? 3 : pack.gems >= 200 ? 2 : 1;
      for (let i = 0; i < n; i++) pile.append(iconCanvas('gem', big ? 3 : 2, 'gem-pack-gem'));
      const text = h('div', 'gem-pack-text');
      text.append(h('span', 'gem-pack-n', tl('{0} diamants', pack.gems.toLocaleString(locale))), h('span', 'gem-pack-name', pack.name));
      const price = this.gemPrices?.get(pack.productId) ?? pack.price;
      const busy = this.gemBuying != null;
      const b = this.btn(`btn primary price gem-pack-buy${busy ? ' short' : ''}`, this.gemBuying === pack.id ? '…' : price, () => {
        if (this.gemBuying) return;
        if (kind === 'none') return this.toast(tl('Les achats de diamants se font dans l\'app iPhone'), 'info');
        this.gemBuying = pack.id;
        this.shopKey = '';
        this.renderShop();
        void this.cb.buyGems(pack.productId).then((r) => {
          this.gemBuying = null;
          this.shopKey = '';
          if (r.ok) {
            sfx.play('gem');
            this.toast(tl('+{0} diamants, merci !', r.gems!.toLocaleString(locale)), 'good');
            // le bouton a été redessiné pendant l'achat : on part de celui qui est à l'écran
            const from = this.shopBody.querySelector<HTMLElement>(`[data-pack="${pack.id}"]`) ?? this.gemsPill;
            this.fly(from, this.gemsPill, 6, () => iconCanvas('gem', 1, 'fly fly-gem'));
            this.onSent?.();
          } else if (!r.cancelled) this.toast(r.reason ?? tl('Achat impossible pour le moment'), 'bad');
          this.renderShop();
        });
      });
      b.dataset.pack = pack.id;
      b.setAttribute('aria-label', tl('Acheter {0} diamants pour {1}', pack.gems, price));
      el.append(pile, text, b);
      return el;
    };
    const starter = GEM_PACKS.find((p) => p.once && g.packAvailable(p.id));
    if (starter) this.shopBody.append(card(starter, true));
    const grid = h('div', 'gem-grid');
    for (const p of GEM_PACKS.filter((x) => !x.once)) grid.append(card(p, false));
    this.shopBody.append(grid);
    this.shopBody.append(this.btn('btn small gems-boosts', tl('Voir les boosts'), () => this.openShop('boosts')));
    if (kind === 'dev') this.shopBody.append(h('p', 'hint', tl('Développement : les achats sont simulés.')));
    if (kind === 'none') this.shopBody.append(h('p', 'hint', tl('Les achats de diamants se font dans l\'app iPhone.')));
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
    scene.append(this.showcase.canvas, h('span', 'vitrine-pin', owned ? tl('Dans ton bar') : tl('Aperçu dans ton bar')));
    this.showcase.showcase = d.event ? { event: DECOR_EVENT[pick] } : { furniture: pick as (typeof FURNITURE)[number]['id'] };
    this.showcaseScene = scene;
    const body = h('div', 'vitrine-body');
    const name = h('div', 'vitrine-name');
    name.append(h('span', 'beer-name', d.name), h('span', `kind-tag ${d.event ? 'kind-prestige' : 'kind-style'}`, d.event ? tl('Événement') : tl('Mobilier')));
    const fx = h('div', 'fx');
    for (const t of d.event ? [ev!.name, tl('{0} fois plus de clients', ev!.mult)] : furnitureEffects(pick)) fx.append(h('span', 'fx-chip', t));
    body.append(name, fx, h('p', 'hint', ev ? ev.text : d.text));
    if (owned) {
      body.append(this.btn('btn price own', tl('✓ Au bar · voir'), () => this.goView('bar')));
    } else if (isNext) {
      const b = this.btn('btn primary price', `${d.event ? tl('Acheter') : tl('Installer')} · ${moneyShort(d.cost)}`, () => {
        const r = g.buyDecor(pick);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        sfx.play('repair');
        this.decorPick = null;
        this.onSent?.();
        this.toast(d.event ? tl('{0} : nouvel événement au bar !', d.name) : tl('{0} : au bar !', d.name), 'good', { label: tl('Voir'), run: () => this.goView('bar') });
        this.shopKey = '';
        this.renderShop();
      });
      this.costGate(b, d.cost);
      body.append(b);
    } else {
      const before = g.decorDef(DECOR_ORDER[idx - 1]!);
      body.append(this.btn('btn price lock', tl('🔒 Après « {0} » · {1}', before.name, moneyShort(d.cost)), () => {
        this.decorPick = null;
        this.shopKey = '';
        this.renderShop();
      }));
    }
    card.append(scene, body);
    // la piste
    const count = DECOR_ORDER.filter((id) => g.ownsDecor(id)).length;
    const head = h('div', 'shop-section');
    head.append(h('span', '', tl('La suite')), h('span', 'shop-section-n', tl('{0} / {1} au bar', count, DECOR_ORDER.length)));
    const track = h('div', 'decor-track');
    for (const id of DECOR_ORDER) {
      const dd = g.decorDef(id);
      const own = g.ownsDecor(id);
      const slot = h('button', `decor-slot${own ? ' owned' : next?.id === id ? ' next' : ' locked'}${id === pick ? ' picked' : ''}`);
      slot.setAttribute('aria-label', `${dd.name}${own ? tl(' : au bar') : ` : ${moneyShort(dd.cost)}`}`);
      if (dd.event) slot.append(h('i', 'decor-ev'));
      slot.append(iconCanvas(DECOR_ICON[id], 2), h('span', 'decor-slot-price', own ? '✓' : moneyShort(dd.cost)));
      slot.onclick = () => {
        this.decorPick = id;
        this.shopKey = '';
        this.renderShop();
      };
      track.append(slot);
    }
    this.shopBody.append(card, head, track, h('p', 'hint', tl('Le carré doré marque un objet d\'événement. Toucher une case la montre dans la vitrine.')));
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
        if (blocked && cur) b = this.btn('btn price lock', tl('occupé'), () => this.toast(tl('{0} : celui-ci attend la fin.', blocked), 'info'));
        else {
          const extend = !!cur;
          b = this.gemsBtn('', def.gems, () => {
            const r = g.buyBoost(def.id);
            if (!r.ok) return this.toast(r.reason!, 'bad');
            sfx.play('recharge');
            this.toast(extend ? tl('{0} : prolongé !', def.name) : `${def.name} !`, 'good');
            this.onSent?.();
            this.renderShop();
          });
          if (blocked) b.classList.add('short');
          b.setAttribute('aria-label', `${extend ? tl('Prolonger avec') : tl('Lancer')} ${def.name} : ${gemsText(def.gems)}`);
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
    const name = beer?.name ?? tl('Ma bière');
    const grid = h('div', `unlock-grid${kind === 'bottle' ? ' bottles' : ''}`);
    for (const x of LABEL_UNLOCKS.filter((y) => y.kind === kind)) {
      const owned = g.unlocked.includes(x.id);
      const cell = h('div', `unlock${owned ? ' owned' : ''}${x.gems ? ' premium' : ''}${x.gems === LUXURY_GEMS ? ' luxury' : ''}`);
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
      if (owned) b = this.btn('btn price own', tl('✓ Débloqué'), () => this.toast(tl('{0} est dans l\'éditeur d\'étiquette (Ma gamme → Étiquette)', x.name), 'info'));
      else {
        const buy = () => {
          const r = g.buyUnlock(x.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          sfx.play('pickup');
          this.toast(tl('{0} : dans l\'éditeur d\'étiquette !', x.name), 'good');
          this.onSent?.();
          this.shopKey = '';
          this.renderShop();
        };
        if (x.gems) b = this.gemsBtn('', x.gems, buy);
        else {
          b = this.btn('btn primary price', moneyShort(x.cost), buy);
          this.costGate(b, x.cost);
        }
        b.setAttribute('aria-label', tl('Débloquer {0}', x.name));
      }
      cell.append(b);
      grid.append(cell);
    }
    this.shopBody.append(tabs, grid, h('p', 'hint', tl('Ce que tu débloques apparaît dans l\'éditeur d\'étiquette (Ma gamme → Étiquette).')));
  }

  // ------------------------------------------------------------------ Gaston

  // ------------------------------------------------------------------ notifications

  /** Notification : deux au plus à l'écran (la plus ancienne laisse sa place), avec un bouton d'action facultatif. */
  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info', action?: { label: string; run: () => void }, ms = 3000): void {
    if (kind === 'bad') sfx.play('error');
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
