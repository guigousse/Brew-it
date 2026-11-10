import { brew, GASTON_RECIPE, DRINKABLE_MIN, REF_LITERS, type Actual, type Levels, type Recipe, type Tasting } from './brewing/model';
import { EventBus } from './events';
import type { Label } from './label';
import { PARTY } from './market';
import { AD_EXTEND, adById, adCost, ADS, BAR, BAR_BASE_SHARE, BAR_MIN_QUALITY, GLASS_L, glassPrice, kegGlasses, kegLiters, kegSpace, PARTY_COST, BARMAN, BARMAN_COST, barEventById, SHOP_ITEMS, variety, type AdDef, type AdId, type BarEventId, type ShopItemId } from './market';
import { orderGems, CLIENT_TYPES, COMPUTERS, drawOrder, FIRST_ORDER_S, fits, openTypes, ORDER_GAP_MAX_S, ORDER_GAP_MIN_S, PRESTIGE_QUALITY, STARTER_ORDERS, wholesalePrice, type Order } from './orders';
import { Rng } from './rng';
import { executeStep } from './brewing/execution';
import { BREWERY_NAMES, CAPACITY, MAX_LEVEL, STATION_ORDER, stationDuration, upgradeCost, type StationId } from './stations';
import { CRATE, MAX_RANGE, slotCost, STORAGE } from './warehouse';
import { APPRENTICE_CHECK_S, APPRENTICE_COST, BOOST_MAX_AHEAD, boostById, GEMS, sameEffect, COURIER_COST, COURIER_ROUND_S, FURNITURE, STAFF_CONTRACT, STAFF_SLOTS, unlockById, isLockable, YEAST_STAGES, DECOR_ORDER, gemPackById, gemPackByProduct, type GemPackId, type DecorId, type BoostChannel, type BoostId, type FurnitureId, type StaffId, type UnlockKind } from './shop';
import { brandPopularity, gainPop, POP_CAP, POP_DECAY, POP_PER_BOTTLE, POP_PER_GLASS, popTarget, TREND_COUNT, TREND_MAX_S, TREND_MIN_S, TRENDS, trendFactor, trendsOf, type Trend } from './trends';

/** Prévision de production : fin de chaque brassin (s), et ce qui bloque la file si elle ne se vide pas. */
/** Message par défaut du panneau lumineux du bar, et sa longueur maximale. */
export const BAR_MESSAGE = 'Bienvenue ! Santé et bonne dégustation';
export const BAR_MESSAGE_MAX = 40;

export interface Forecast {
  ends: number[];
  total: number;
  done: boolean;
  /** storage : le stockage reste plein ; money : plus de quoi payer les ingrédients ; slow : plus de 24 h. */
  blocked: 'storage' | 'money' | 'slow' | null;
}
/** Sans aucun brassin terminé pendant ce temps, la prévision considère la file bloquée. */
const STALL_S = 2 * 3600;

/** Repos du quartier entre deux événements au bar. */
const PARTY_COOLDOWN = PARTY.cooldown;

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const BOTTLE_L = 0.33;

/** Quota du grossiste, par bière et par jour, en brassins : base + pop × popularité (0 à 1). */
export const WHOLESALE_QUOTA = { base: 4, pop: 20 } as const;

/** Numéro du jour, à l'heure locale, d'un instant (ms depuis 1970). */
export function localDay(ms: number): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);
}
export const STARTING_MONEY = 250;

/** Prix des ingrédients (achetés automatiquement au lancement d'un brassin). */
export const PRICES = { maltKg: 1.5, hopsG: 0.05, yeastPer20L: 4, bottle: 0.25, keg: 1 };

/** Ce que remplit la ligne en fin de brassin : des bouteilles (stock, commandes) ou des fûts (bar). */
export type Format = 'bottle' | 'keg';

/** Brassin programmé : il partira dès que le moulin sera libre, dans l'ordre de la file. */
export interface PlannedBrew {
  beerId: number;
  format: Format;
  /** Nombre de brassins identiques à la suite. */
  count: number;
}

/** Tireuse du bar et le fût qui y est branché. */
export interface Tap {
  /** Bière du fût branché (null : aucun fût). */
  beerId: number | null;
  /** Verres restant dans le fût. */
  glasses: number;
  /** Verres du fût plein (pour la jauge). */
  capacity: number;
}

export interface Beer {
  id: number;
  name: string;
  recipe: Recipe;
  /** Dégustation du dernier lot produit. */
  tasting: Tasting;
  /** Bouteilles en stock. */
  stock: number;
  /** Fûts pleins au stockage : le nombre de verres de chacun (leur taille dépend du matériel qui les a remplis). */
  kegs: number[];
  sold: number;
  revenue: number;
  label: Label;
  /** Popularité de la bière (0 à 1) : monte quand elle se boit, s'érode sinon. */
  pop: number;
  /** Litres vendus (bar, commandes et grossiste). */
  liters: number;
  /** Litres repris par le grossiste aujourd'hui (le quota se recharge à minuit). */
  wsToday: number;
}

export interface Batch {
  id: number;
  recipe: Recipe;
  /** Bière de la gamme brassée, ou null pour un essai. */
  beerId: number | null;
  liters: number;
  /** Bouteilles ou fûts (un essai est toujours en bouteilles : on goûte la première). */
  format: Format;
  /** Index dans STATION_ORDER. */
  stage: number;
  elapsed: number;
  duration: number;
  /** Étape terminée, en attente que l'appareil suivant se libère. */
  waiting: boolean;
  actual: Partial<Actual>;
  /** Dégustation, connue dès l'entrée à l'embouteillage (toutes les étapes sont faites). */
  tasting?: Tasting;
  /** Bouteilles produites par ce lot (après pertes éventuelles). */
  bottles?: number;
  /** Fûts produits par ce lot (format « fûts »), et les verres de chacun. */
  kegs?: number;
  kegGlasses?: number;
  /** Bouteilles ou fûts déjà rangés dans le stockage (le lot attend tant que le stockage est plein). */
  delivered?: number;
}

export type { Order } from './orders';

/** Une commande remplie avec les bières choisies (sans rien prélever). */
export interface OrderQuote {
  /** Bouteilles (ou fûts) prises à chaque bière. */
  take: { beer: Beer; n: number }[];
  filled: number;
  /** La commande est complète. */
  ok: boolean;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface OfflineReport {
  seconds: number;
  earned: number;
  sold: number;
  /** Litres vendus pendant l'absence. */
  liters: number;
  batches: number;
}

type StationState = { level: number };

/** D'où vient l'argent : le bar, les commandes ou le grossiste. */
export type SaleSource = 'bar' | 'orders' | 'wholesale';
export const SALE_SOURCES: readonly SaleSource[] = ['bar', 'orders', 'wholesale'];
/** Une minute de jeu de ventes, par source (pour le tableau de bord). */
export interface SalesMinute {
  /** Minute de jeu (floor(time / 60)). */
  m: number;
  bar: number;
  orders: number;
  wholesale: number;
}
/** Minutes de ventes gardées en mémoire. */
export const SALES_HISTORY_MIN = 60;

/**
 * État complet d'une partie : une brasserie verticale de 7 appareils, des lots qui la traversent,
 * une gamme de bières, un bar qui les sert et des clients qui les commandent.
 */
export class Game {
  time = 0;
  money = STARTING_MONEY;
  /** Diamants : la monnaie premium (boosts, cosmétiques). */
  gems: number = GEMS.start;
  rng = new Rng(0xbee12);
  readonly events = new EventBus();
  stations: Record<StationId, StationState> = Object.fromEntries(STATION_ORDER.map((id) => [id, { level: 1 }])) as Record<StationId, StationState>;
  /** Réglages actuels des appareils (la recette en cours de mise au point). */
  recipe: Recipe = { ...GASTON_RECIPE };
  /** Bière de la gamme dont les réglages sont chargés (null = réglages modifiés : on brasse un essai). */
  selectedBeer: number | null = null;
  /** Essai demandé alors que le moulin était occupé : il passe avant les brassins programmés. */
  queued = false;
  /** Format choisi pour le prochain brassin lancé à la main. */
  format: Format = 'bottle';
  /** Brassins programmés : ils partent dans l'ordre, dès que le moulin est libre. */
  plan: PlannedBrew[] = [];
  batches: Batch[] = [];
  /** Essai embouteillé qui attend d'être goûté, mis de côté pour ne pas bloquer la ligne. */
  trial: Batch | null = null;
  beers: Beer[] = [];
  /** Places achetées sur l'étagère de la gamme. */
  rangeSlots = 1;
  /** Niveau du stockage (1 à STORAGE.length). */
  storageLevel = 1;
  /** Niveau du bar (1 à BAR.length). */
  barLevel = 1;
  /** Tireuses du bar, un fût branché sur chacune. */
  taps: Tap[] = [{ beerId: null, glasses: 0, capacity: 0 }];
  /** Clientèle accumulée du bar (verres). */
  barDemand = 0;
  /** Tendances du moment. */
  trends: Trend[] = [];
  /** Cuves de fermentation et de garde (plusieurs brassins en parallèle). */
  tanks: Partial<Record<StationId, number>> = {};
  /** Fin de la fête en cours, et instant où l'on pourra en organiser une autre (s de jeu). */
  partyUntil = 0;
  partyReadyAt = 0;
  /** Événement en cours au bar (ou le dernier). */
  eventId: BarEventId = 'party';
  /** Objets achetés au magasin (télé, cible…). */
  owned: ShopItemId[] = [];
  /** Fin du contrat du barman en renfort (s de jeu). */
  barmanUntil = 0;
  /** Message qui défile sur le panneau lumineux du comptoir (personnalisable). */
  barMessage = BAR_MESSAGE;
  /** Fin de la campagne de pub en cours. */
  adUntil = 0;
  /** La campagne de pub en cours (ou la dernière). */
  adId: AdId = 'paper';
  /** La pub télé fait venir une commande de prestige : la prochaine lettre en sera une. */
  adPrestige = false;
  /** Boosts en cours, un par canal (brasserie, levure, bar, grossiste). */
  boosts: Partial<Record<BoostChannel, { id: BoostId; until: number }>> = {};
  /** Achats de diamants déjà crédités (identifiants de transaction App Store) : un achat n'est jamais compté deux fois. */
  purchases: string[] = [];
  /** Packs « une seule fois » déjà achetés. */
  packsBought: GemPackId[] = [];
  /** Fin des contrats du livreur et de l'apprenti (le barman a le sien : barmanUntil). */
  staffUntil: { courier: number; apprentice: number } = { courier: 0, apprentice: 0 };
  /** Mobilier du bar, dans l'ordre d'achat. */
  furniture: FurnitureId[] = [];
  /** Formes de bouteille, d'étiquette, logos et motifs débloqués (`kind:value`). */
  unlocked: string[] = [];
  /** Dernier brassin programmé : l'apprenti le reprogramme quand la file se vide. */
  lastPlan: { beerId: number; format: Format } | null = null;
  private courierClock = 0;
  private apprenticeClock = 0;
  barSold = 0;
  barRevenue = 0;
  /** Commandes en attente sur l'ordinateur. */
  orders: Order[] = [];
  /** Instants (s de jeu) des commandes expirées dans les dernières 24 h : des boulettes dans la corbeille du bureau. */
  expiredAt: number[] = [];
  /** Compte à rebours (s) avant la prochaine commande. */
  /**
   * Emplacements libres du tableau des commandes : le délai (s de jeu) avant que chacun reçoive une lettre.
   * Il y a toujours autant de commandes et d'emplacements libres que de places au tableau.
   */
  orderWaits: number[] = [FIRST_ORDER_S, FIRST_ORDER_S + ORDER_GAP_MIN_S];
  ordersDone = 0;
  /** Niveau de l'ordinateur des commandes (1 à COMPUTERS.length). */
  computerLevel = 1;
  /** Litres repris par le grossiste. */
  wholesaleLiters = 0;
  /** Le grossiste reprend automatiquement de quoi débloquer la production quand le stockage est plein (dans la limite du quota). */
  autoWholesale = true;
  private wholesaleClock = 0;
  /** Heure réelle (ms depuis 1970) : le quota du grossiste se recharge à minuit, heure locale. */
  wall = 0;
  /** Jour (local) du dernier rechargement du quota. */
  quotaDay = 0;
  totalSold = 0;
  /** Litres vendus au total (bar, commandes et grossiste). */
  totalLiters = 0;
  totalRevenue = 0;
  /** Recettes cumulées des commandes et du grossiste (celles du bar : barRevenue). */
  ordersRevenue = 0;
  wholesaleRevenue = 0;
  /** Ventes minute par minute de la dernière heure de jeu. */
  salesHistory: SalesMinute[] = [];
  batchesDone = 0;
  nextId = 1;
  /** Avancement de l'accompagnement de Gaston. */
  tips = 0;
  /** Gains de la dernière absence, en attente de récolte. */
  offline: OfflineReport | null = null;
  private announced = new Set<string>();

  // ------------------------------------------------------------------ lectures

  level(id: StationId): number {
    return this.stations[id].level;
  }

  get levels(): Levels {
    return Object.fromEntries(STATION_ORDER.map((id) => [id, this.level(id)])) as unknown as Levels;
  }

  /** Niveau de la brasserie : celui de son appareil le moins avancé. */
  get breweryLevel(): number {
    return Math.min(...STATION_ORDER.map((id) => this.level(id)));
  }

  get breweryName(): string {
    return BREWERY_NAMES[this.breweryLevel - 1]!;
  }

  /** Taille d'un brassin : le plus petit appareil fixe le volume. */
  get batchLiters(): number {
    // Le moins avancé fixe le palier ; chaque appareil déjà au-dessus apporte tout de suite 1/7 du palier suivant.
    const min = this.breweryLevel;
    const base = CAPACITY[min] ?? 600;
    const next = CAPACITY[min + 1];
    if (next == null) return base;
    const ahead = STATION_ORDER.filter((id) => this.level(id) > min).length;
    return Math.round(base + ((next - base) * ahead) / STATION_ORDER.length);
  }

  /** Cuves d'une étape : plusieurs brassins peuvent fermenter ou se garder en même temps. */
  tankCount(id: StationId): number {
    return TANK_STAGES.includes(id) ? (this.tanks[id] ?? 1) : 1;
  }

  /** Prix d'une cuve de plus : celui de l'appareil du niveau suivant, × le nombre de cuves déjà installées (null : impossible ou au maximum). */
  tankCost(id: StationId): number | null {
    if (!TANK_STAGES.includes(id) || this.tankCount(id) >= MAX_TANKS) return null;
    return upgradeCost(id, Math.min(MAX_LEVEL, this.level(id) + 1)) * this.tankCount(id);
  }

  /** Prix de l'amélioration d'un appareil : toutes ses cuves sont améliorées ensemble. */
  upgradeCost(id: StationId): number {
    return upgradeCost(id, this.level(id) + 1) * this.tankCount(id);
  }

  /** Ajoute une cuve de fermentation ou de garde. */
  addTank(id: StationId): CommandResult {
    const cost = this.tankCost(id);
    if (cost == null) return { ok: false, reason: 'Plus de place pour une cuve' };
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.tanks[id] = this.tankCount(id) + 1;
    return { ok: true };
  }

  /** Lots présents dans un appareil (plusieurs pour les cuves en parallèle). */
  batchesAt(id: StationId): Batch[] {
    const i = STATION_ORDER.indexOf(id);
    return this.batches.filter((b) => b.stage === i);
  }

  /** Prix de la prochaine place dans la gamme (null : étagère complète). */
  get nextSlotCost(): number | null {
    return this.rangeSlots >= MAX_RANGE ? null : slotCost(this.rangeSlots);
  }

  /** Capacité du stockage, en bouteilles. */
  get storageCap(): number {
    return STORAGE[this.storageLevel - 1]!.crates * CRATE;
  }

  /** Place occupée au stockage, en bouteilles : les bouteilles, plus une caisse par fût plein. */
  get stored(): number {
    return this.beers.reduce((s, b) => s + b.stock + b.kegs.reduce((k, g) => k + kegSpace(g), 0), 0);
  }

  /** Place qu'occupera un brassin une fois rangé (en bouteilles). */
  batchSpace(format: Format, liters = this.batchLiters): number {
    if (format === 'bottle') return Math.floor(liters / BOTTLE_L);
    const kl = kegLiters(liters);
    return Math.floor(liters / kl) * kegSpace(kegGlasses(kl));
  }

  /** Place encore à venir d'un lot sur la ligne. */
  private pendingSpace(b: Batch): number {
    if (b.beerId == null) return 0;
    if (b.format === 'keg') {
      const kl = kegLiters(b.liters);
      return ((b.kegs ?? Math.floor(b.liters / kl)) - (b.delivered ?? 0)) * kegSpace(b.kegGlasses ?? kegGlasses(kl));
    }
    return (b.bottles ?? Math.floor(b.liters / BOTTLE_L)) - (b.delivered ?? 0);
  }

  /**
   * Le stockage pourra accueillir un brassin de plus, en comptant ceux déjà sur la ligne
   * (un brassin programmé attend sinon, pour ne pas acheter d'ingrédients pour rien).
   */
  get roomForBatch(): boolean {
    return this.roomFor('bottle');
  }

  roomFor(format: Format): boolean {
    const pending = this.batches.reduce((s, b) => s + this.pendingSpace(b), 0);
    // Un brassin plus gros que tout le stockage peut quand même partir quand tout est vide : il se rangera au fil des ventes.
    if (this.stored + pending === 0) return true;
    return this.stored + pending + this.batchSpace(format) <= this.storageCap;
  }

  get storageFull(): boolean {
    return this.stored >= this.storageCap;
  }

  /** Coût des ingrédients d'un brassin. */
  brewCost(r: Recipe = this.recipe, liters = this.batchLiters, format: Format = 'bottle'): number {
    const k = liters / REF_LITERS;
    const pack = format === 'keg' ? Math.floor(liters / kegLiters(liters)) * PRICES.keg * (kegLiters(liters) / 5) : Math.floor(liters / BOTTLE_L) * PRICES.bottle;
    return r.grainKg * k * PRICES.maltKg + (r.hopsBitter + r.hopsAroma) * k * PRICES.hopsG + Math.ceil(k) * PRICES.yeastPer20L + pack;
  }

  /** Format du prochain brassin lancé à la main (un essai est toujours en bouteilles). */
  get brewFormat(): Format {
    return this.selectedBeer == null ? 'bottle' : this.format;
  }

  /** Lot présent dans un appareil. */
  batchAt(id: StationId): Batch | undefined {
    const i = STATION_ORDER.indexOf(id);
    return this.batches.find((b) => b.stage === i);
  }

  canBrew(): CommandResult {
    if (this.batchAt('mill')) return { ok: false, reason: 'Le moulin est occupé' };
    if (this.money < this.brewCost(this.recipe, this.batchLiters, this.brewFormat) && !this.broke) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    return { ok: true };
  }

  /**
   * Plus d'argent et rien qui puisse en rapporter : la partie serait bloquée. Gaston avance alors les ingrédients
   * (le brassin est gratuit) pour que le joueur puisse toujours repartir.
   */
  get broke(): boolean {
    // rien ne peut rapporter d'argent : ni brassin en cours, ni fût qui coule, ni commande à remplir avec le stock
    return this.money < this.brewCost(this.recipe, this.batchLiters, this.brewFormat) && this.batches.length === 0 && !this.barServing && this.readyOrders.length === 0;
  }

  /** Bouteilles d'une bière encore sur la ligne (pas encore rangées). */
  pendingBottles(beerId: number): number {
    return this.batches.reduce((s, b) => s + (b.beerId === beerId && b.format === 'bottle' ? (b.bottles ?? Math.floor(b.liters / BOTTLE_L)) - (b.delivered ?? 0) : 0), 0);
  }

  /** Fûts d'une bière encore sur la ligne. */
  pendingKegs(beerId: number): number {
    return this.batches.reduce((s, b) => s + (b.beerId === beerId && b.format === 'keg' ? (b.kegs ?? Math.floor(b.liters / kegLiters(b.liters))) - (b.delivered ?? 0) : 0), 0);
  }

  /** La bière de la gamme qui a le moins de bouteilles (en stock + en route). */
  lowestStockBeer(): Beer | undefined {
    let best: Beer | undefined;
    let low = Infinity;
    for (const b of this.beers) {
      const n = b.stock + this.pendingBottles(b.id);
      if (n < low) {
        low = n;
        best = b;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ commandes

  /** Lance un brassin avec les réglages actuels des appareils. */
  brew(): CommandResult {
    const can = this.canBrew();
    if (!can.ok) return can;
    this.launch(this.recipe, this.selectedBeer, this.brewFormat);
    return { ok: true };
  }

  /** Moulin occupé : le brassin partira dès qu'il se libère, avant les brassins programmés. */
  queueBrew(): CommandResult {
    if (!this.batchAt('mill')) return this.brew();
    if (this.money < this.brewCost(this.recipe, this.batchLiters, this.brewFormat)) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    this.queued = true;
    return { ok: true };
  }

  /** Programme un brassin d'une bière de la gamme, en bouteilles ou en fûts. */
  planBrew(beerId: number, format: Format, count = 1): CommandResult {
    if (!this.beers.some((b) => b.id === beerId)) return { ok: false, reason: 'Bière introuvable' };
    count = Math.floor(count);
    if (count < 1) return { ok: false, reason: 'Aucun brassin' };
    if (count > this.planRoom) return { ok: false, reason: `${this.planCap} brassins programmés au plus` };
    if (count > this.planLimit(format)) return { ok: false, reason: 'Pas assez de place au stockage' };
    // à la suite d'un groupe identique, on l'allonge
    const last = this.plan[this.plan.length - 1];
    if (last && last.beerId === beerId && last.format === format) last.count += count;
    else this.plan.push({ beerId, format, count });
    this.lastPlan = { beerId, format };
    return { ok: true };
  }

  /** Retire un groupe de brassins programmés. */
  unplan(index: number): void {
    this.plan.splice(index, 1);
  }

  /** Change le nombre de brassins d'un groupe (0 le retire). */
  setPlanCount(index: number, count: number): void {
    const p = this.plan[index];
    if (!p) return;
    count = Math.max(0, Math.min(Math.floor(count), this.planLimit(p.format, index)));
    if (count === 0) this.plan.splice(index, 1);
    else p.count = count;
  }

  /** Avance (-1) ou recule (+1) un groupe dans la file ; deux groupes identiques qui se touchent fusionnent. */
  movePlan(index: number, dir: -1 | 1): void {
    const j = index + dir;
    if (!this.plan[index] || !this.plan[j]) return;
    [this.plan[index], this.plan[j]] = [this.plan[j]!, this.plan[index]!];
    for (let i = this.plan.length - 1; i > 0; i--) {
      const a = this.plan[i - 1]!;
      const b = this.plan[i]!;
      if (a.beerId === b.beerId && a.format === b.format) {
        a.count += b.count;
        this.plan.splice(i, 1);
      }
    }
  }

  /**
   * Prévision de la production : on rejoue la brasserie sur une copie (ventes comprises, qui libèrent le stockage)
   * jusqu'à ce que les brassins sur la ligne et ceux de la file soient tous embouteillés.
   * `ends[i]` : dans combien de secondes le i-ème brassin sera fini (ceux sur la ligne d'abord, puis la file dans l'ordre).
   * `extra` : des brassins à ajouter en fin de file (pour savoir quand ils seraient prêts).
   */
  forecast(extra?: PlannedBrew, maxSeconds = 24 * 3600): Forecast {
    const sim = Game.fromJSON(JSON.parse(JSON.stringify(this.toJSON())));
    // un essai attend la dégustation du joueur : on ne le compte pas
    sim.trial = null;
    sim.queued = false;
    sim.batches = sim.batches.filter((b) => b.beerId != null);
    if (extra && extra.count > 0) sim.plan.push({ ...extra });
    const target = sim.batches.length + sim.planned;
    const ends: number[] = [];
    const start = sim.time;
    let lastDone = start;
    sim.events.on((e) => {
      if (e.type === 'batchDone' || e.type === 'batchRuined') {
        ends.push(sim.time - start);
        lastDone = sim.time;
      }
    });
    // pas de 1 s (2 s pour une longue file) : précis à quelques secondes près, et rapide.
    // Plus rien ne sort depuis 2 h : la file est bloquée (stockage plein de fûts, plus d'argent…), on s'arrête là.
    const dt = target > 100 ? 2 : 1;
    while (ends.length < target && sim.time - start < maxSeconds && sim.time - lastDone < STALL_S) sim.step(dt);
    const done = ends.length >= target;
    let blocked: Forecast['blocked'] = null;
    if (!done) {
      const head = sim.plan[0];
      const beer = head && sim.beer(head.beerId);
      if (head && !sim.roomFor(head.format)) blocked = 'storage';
      else if (head && beer && sim.money < sim.brewCost(beer.recipe, sim.batchLiters, head.format) && !sim.broke) blocked = 'money';
      else blocked = 'slow';
    }
    return { ends, total: ends[ends.length - 1] ?? 0, done, blocked };
  }

  /**
   * Combien de brassins de ce format on peut encore programmer (ou porter, pour le groupe `index`) :
   * il faut une place dans la file, et que le stockage puisse les accueillir, en comptant ce qui est déjà sur la ligne
   * et dans la file. Si le grossiste vend tout seul quand le stockage est plein, ce qu'il peut encore reprendre
   * aujourd'hui (le quota restant de chaque bière) compte comme de la place en plus.
   */
  planLimit(format: Format, index = -1): number {
    const own = this.plan[index];
    const room = this.planRoom + (own ? own.count : 0);
    const pending = this.batches.reduce((s, b) => s + this.pendingSpace(b), 0);
    const queued = this.plan.reduce((s, p, i) => s + (i !== index ? p.count * this.batchSpace(p.format) : 0), 0);
    const used = this.stored + pending + queued;
    const unit = this.batchSpace(format);
    const extra = this.autoWholesale ? this.beers.reduce((s, b) => s + (b.tasting.quality >= DRINKABLE_MIN ? Math.floor(this.wholesaleLeft(b) / BOTTLE_L) : 0), 0) : 0;
    const cap = this.storageCap + extra;
    // un brassin plus gros que tout le stockage peut partir quand tout est vide (il se rangera au fil des ventes)
    const fits = used === 0 && unit > this.storageCap ? 1 : Math.floor(Math.max(0, cap - used) / Math.max(1, unit));
    return Math.max(0, Math.min(room, fits));
  }

  /** Brassins programmés au total. */
  get planned(): number {
    return this.plan.reduce((s, p) => s + p.count, 0);
  }

  /** La brasserie est à l'arrêt : aucun brassin sur la ligne ni dans la file. */
  get stopped(): boolean {
    return this.batches.length === 0 && this.planned === 0;
  }

  /** Brassins qu'on peut programmer d'avance : la file s'allonge avec le niveau de la brasserie. */
  get planCap(): number {
    return PLAN_CAP[this.breweryLevel - 1] ?? PLAN_CAP[PLAN_CAP.length - 1]!;
  }

  get planRoom(): number {
    return Math.max(0, this.planCap - this.planned);
  }

  /** Prochain instant où l'on revérifie si un brassin peut partir sans attendre (le calcul n'est pas refait à chaque image). */
  private launchCheckAt = 0;

  /**
   * Lancement anticipé, comme un vrai brasseur : on ne lance un brassin que s'il pourra aller jusqu'au bout sans
   * attendre nulle part. On prévoit le trajet des brassins déjà sur la ligne et du nouveau, appareil par appareil
   * (cuves comprises) ; si le nouveau devait patienter devant un appareil occupé, il reste dans la file.
   * Résultat : plus d'appareil bloqué par un brassin en attente, et la même cadence (le goulot ne chôme pas).
   */
  private smoothLaunch(recipe: Recipe, format: Format): boolean {
    if (this.time < this.launchCheckAt) return false;
    const last = STATION_ORDER.length - 1;
    const liters = this.batchLiters;
    const dur = (r: Recipe, f: Format, l: number, s: number) => {
      const id = STATION_ORDER[s]!;
      const d = stationDuration(id, r, this.level(id), l);
      return id === 'bottling' && f === 'keg' ? d * 0.5 : d;
    };
    type Slot = { stage: number; left: number; r: Recipe; f: Format; l: number; mine?: boolean };
    const line: Slot[] = this.batches.map((b) => ({
      stage: b.stage,
      // un essai qui attend d'être goûté reste sur la ligne : rien ne passera derrière lui avant
      left: this.awaitingTaste(b) ? Infinity : b.waiting ? 0 : Math.max(0, b.duration - b.elapsed),
      r: b.recipe, f: b.format, l: b.liters,
    }));
    const me: Slot = { stage: 0, left: dur(recipe, format, liters, 0), r: recipe, f: format, l: liters, mine: true };
    line.push(me);
    const cap = STATION_ORDER.map((id) => this.tankCount(id));
    const count = (s: number) => line.reduce((n, x) => n + (x.stage === s ? 1 : 0), 0);
    let ok = true;
    for (let t = 0; t < 24 * 3600; t++) {
      line.sort((a, b) => b.stage - a.stage);
      for (let i = 0; i < line.length; i++) {
        const x = line[i]!;
        if (x.left > 0) { x.left -= 1; if (x.left > 0) continue; }
        if (x.stage === last) { line.splice(i--, 1); continue; }
        if (count(x.stage + 1) >= cap[x.stage + 1]!) {
          if (x.mine) { ok = false; break; } // le nouveau brassin devrait attendre : on ne le lance pas encore
          continue;
        }
        x.stage++;
        x.left = dur(x.r, x.f, x.l, x.stage);
        if (x.mine && x.stage === last) return true;
      }
      if (!ok || !line.includes(me)) break;
    }
    if (!ok) this.launchCheckAt = this.time + 5;
    return ok;
  }

  private launch(recipe: Recipe, beerId: number | null, format: Format = 'bottle'): void {
    const liters = this.batchLiters;
    if (beerId == null) format = 'bottle';
    this.money = Math.max(0, this.money - this.brewCost(recipe, liters, format));
    const batch: Batch = {
      id: this.nextId++, recipe: { ...recipe }, beerId, liters, format,
      stage: 0, elapsed: 0, duration: 0, waiting: false, actual: {},
    };
    this.enter(batch, 0);
    this.batches.push(batch);
  }

  setParam<K extends keyof Recipe>(key: K, value: Recipe[K]): void {
    this.recipe[key] = value;
    const beer = this.beers.find((b) => b.id === this.selectedBeer);
    if (beer && beer.recipe[key] !== value) this.selectedBeer = null;
  }

  /** Charge les réglages d'une bière de la gamme dans les appareils. */
  loadBeer(id: number): CommandResult {
    const beer = this.beers.find((b) => b.id === id);
    if (!beer) return { ok: false, reason: 'Bière introuvable' };
    this.recipe = { ...beer.recipe };
    this.selectedBeer = id;
    return { ok: true };
  }

  upgrade(id: StationId): CommandResult {
    const lv = this.level(id);
    if (lv >= MAX_LEVEL) return { ok: false, reason: 'Niveau maximal' };
    const cost = this.upgradeCost(id);
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    const before = this.breweryLevel;
    this.money -= cost;
    this.stations[id].level = lv + 1;
    this.events.emit({ type: 'upgraded', station: id, level: lv + 1 });
    if (this.breweryLevel > before) {
      this.events.emit({ type: 'breweryLevel', level: this.breweryLevel });
      this.earnGems(GEMS.breweryLevel[this.breweryLevel] ?? 0, 'level');
    }
    return { ok: true };
  }

  /** Achète une nouvelle place sur l'étagère de la gamme. */
  buySlot(): CommandResult {
    const cost = this.nextSlotCost;
    if (cost == null) return { ok: false, reason: 'Ton étagère est complète' };
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.rangeSlots++;
    return { ok: true };
  }

  upgradeStorage(): CommandResult {
    const next = STORAGE[this.storageLevel];
    if (!next) return { ok: false, reason: 'Niveau maximal' };
    if (this.money < next.cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= next.cost;
    this.storageLevel++;
    return { ok: true };
  }

  /** Essai à l'embouteillage, pas encore validé : il ne remplit qu'une bouteille. */
  private awaitingTaste(b: Batch): boolean {
    return b.beerId == null && b.stage === STATION_ORDER.length - 1 && !!b.tasting && (b.bottles ?? 0) > 1;
  }

  /** Essai en cours d'embouteillage dont la première bouteille est sortie : on peut le goûter. */
  get tastable(): Batch | undefined {
    if (this.trial) return this.trial;
    const b = this.batchAt('bottling');
    if (!b || b.beerId != null || !b.tasting) return undefined;
    const done = b.waiting ? 1 : b.elapsed / Math.max(0.01, b.duration);
    return done * (b.bottles ?? 1) >= 1 ? b : undefined;
  }

  /** Garder l'essai : il entre dans la gamme avec son nom et son étiquette ; ses bouteilles sont étiquetées. */
  keepTrial(name: string, label: Label): CommandResult {
    const b = this.tastable;
    if (!b?.tasting) return { ok: false, reason: 'Aucun essai à garder' };
    if (b.tasting.quality < DRINKABLE_MIN) return { ok: false, reason: 'Imbuvable : personne ne l\'achètera' };
    if (this.beers.length >= this.rangeSlots) return { ok: false, reason: 'Ta gamme est pleine : achète une nouvelle place ou retire une bière' };
    const beer: Beer = {
      id: this.nextId++, name: name.trim() || `Bière n°${this.beers.length + 1}`, recipe: b.recipe, tasting: b.tasting,
      stock: 0, kegs: [], sold: 0, revenue: 0, label: { ...label }, pop: 0, liters: 0, wsToday: 0,
    };
    this.beers.push(beer);
    b.beerId = beer.id;
    if (sameRecipe(this.recipe, beer.recipe)) this.selectedBeer = beer.id;
    if (b === this.trial) {
      // L'essai était déjà sorti de la ligne : ses bouteilles vont directement au stockage.
      this.trial = null;
      beer.stock += b.bottles ?? 0;
      this.batchesDone++;
      this.events.emit({ type: 'batchDone', beerId: beer.id, bottles: b.bottles ?? 0, kegs: 0 });
    }
    return { ok: true };
  }

  /** Recommencer : l'essai est jeté, l'embouteillage se libère. */
  discardTrial(): CommandResult {
    const b = this.tastable ?? this.batchAt('bottling');
    if (!b || b.beerId != null) return { ok: false, reason: 'Aucun essai à jeter' };
    if (b === this.trial) this.trial = null;
    this.batches = this.batches.filter((x) => x !== b);
    return { ok: true };
  }

  setLabel(beerId: number, label: Label): void {
    const beer = this.beers.find((b) => b.id === beerId);
    if (beer) beer.label = { ...label };
  }

  removeBeer(id: number): void {
    this.beers = this.beers.filter((b) => b.id !== id);
    this.plan = this.plan.filter((p) => p.beerId !== id);
    for (const t of this.taps) if (t.beerId === id) Object.assign(t, { beerId: null, glasses: 0, capacity: 0 });
    if (this.selectedBeer === id) this.selectedBeer = null;
  }

  /** Cadence maximale de la ligne (bouteilles/min) : un brassin par passage dans l'appareil le plus lent. */
  productionRate(r: Recipe = this.lowestStockBeer()?.recipe ?? this.recipe): number {
    const liters = this.batchLiters;
    const slowest = Math.max(...STATION_ORDER.map((id) => stationDuration(id, r, this.level(id), liters) / this.tankCount(id)));
    return (Math.floor(liters / BOTTLE_L) / slowest) * 60;
  }

  // ------------------------------------------------------------------ bar

  get bar() {
    return BAR[this.barLevel - 1]!;
  }

  /** Tireuses du bar. */
  get barTaps(): number {
    return this.bar.taps;
  }

  /** Bière d'un fût. */
  beer(id: number | null): Beer | undefined {
    return id == null ? undefined : this.beers.find((b) => b.id === id);
  }

  /** Fûts branchés qui ont encore à servir. */
  get flowing(): Tap[] {
    return this.taps.filter((t) => t.glasses > 0 && (this.beer(t.beerId)?.tasting.quality ?? 0) >= BAR_MIN_QUALITY);
  }

  /** Change le fût d'une tireuse : un fût plein de cette bière est pris au stockage (ce qui restait dans l'ancien est perdu). */
  swapKeg(tap: number, beerId: number): CommandResult {
    const t = this.taps[tap];
    const beer = this.beer(beerId);
    if (!t || !beer) return { ok: false, reason: 'Tireuse ou bière introuvable' };
    if (!beer.kegs.length) return { ok: false, reason: `Aucun fût plein de « ${beer.name} » au stockage : programme un brassin en fûts` };
    // on branche le plus gros fût disponible
    beer.kegs.sort((a, b) => b - a);
    const glasses = beer.kegs.shift()!;
    t.beerId = beerId;
    t.glasses = glasses;
    t.capacity = glasses;
    return { ok: true };
  }

  /** Popularité de la marque (0 à 1), d'après celle des bières de la gamme. */
  get brand(): number {
    return brandPopularity(this.beers.map((b) => b.pop));
  }

  /** Clients par minute : 1 toutes les 10 minutes au début, plus avec la popularité, le niveau du bar et la variété. */
  get barRate(): number {
    const beers = new Set(this.flowing.map((t) => t.beerId)).size;
    return this.bar.rate * (BAR_BASE_SHARE + (1 - BAR_BASE_SHARE) * this.brand) * variety(Math.max(1, beers)) * (this.partying ? this.barEvent.mult : 1)
      * this.boostMult('bar') * this.furnitureMult('clients') * (this.ad?.bar ?? 1);
  }

  /** Places du bar, banquettes comprises. */
  get barSeats(): number {
    return this.bar.seats + FURNITURE.reduce((s, f) => s + (this.hasFurniture(f.id) ? f.seats ?? 0 : 0), 0);
  }

  /** L'événement en cours (ou le dernier organisé). */
  get barEvent() {
    return barEventById(this.eventId) ?? barEventById('party')!;
  }

  /** Prix d'un événement : un multiple du prix d'une fête, selon le niveau du bar. */
  eventCost(id: BarEventId): number {
    return Math.round(this.partyCost * (barEventById(id)?.cost ?? 1));
  }

  owns(item: ShopItemId): boolean {
    return this.owned.includes(item);
  }

  /** Le prochain objet d'événement pas encore acheté. */
  get nextItem() {
    return SHOP_ITEMS.find((x) => !this.owns(x.id));
  }

  /** Achète un objet d'événement (il fait partie de la décoration : voir buyDecor). */
  buyItem(id: ShopItemId): CommandResult {
    return this.buyDecor(id);
  }

  // ------------------------------------------------------------------ décoration du bar

  ownsDecor(id: DecorId): boolean {
    return this.owns(id as ShopItemId) || this.hasFurniture(id as FurnitureId);
  }

  /** Une pièce de décoration : un meuble, ou un objet qui débloque un événement. */
  decorDef(id: DecorId): { id: DecorId; name: string; text: string; cost: number; event: boolean } {
    const item = SHOP_ITEMS.find((x) => x.id === id);
    if (item) return { ...item, event: true };
    const f = FURNITURE.find((x) => x.id === id)!;
    return { id: f.id, name: f.name, text: f.text, cost: f.cost, event: false };
  }

  /** La prochaine pièce de décoration en vente (meubles et objets d'événement alternent ; chacune débloque la suivante). */
  get nextDecor() {
    const id = DECOR_ORDER.find((x) => !this.ownsDecor(x));
    return id ? this.decorDef(id) : undefined;
  }

  /** Celle d'après (la caisse mystère du magasin). */
  get afterDecor() {
    const left = DECOR_ORDER.filter((x) => !this.ownsDecor(x));
    return left[1] ? this.decorDef(left[1]) : undefined;
  }

  buyDecor(id: DecorId): CommandResult {
    if (!DECOR_ORDER.includes(id)) return { ok: false, reason: 'Objet introuvable' };
    if (this.ownsDecor(id)) return { ok: false, reason: 'Déjà acheté' };
    const next = this.nextDecor;
    if (next?.id !== id) return { ok: false, reason: `Il faut d'abord : ${next?.name}` };
    if (this.money < next.cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= next.cost;
    if (next.event) this.owned.push(id as ShopItemId);
    else this.furniture.push(id as FurnitureId);
    return { ok: true };
  }

  /** Une fête bat son plein. */
  /** Change le message du panneau lumineux (vide : le message par défaut). */
  setBarMessage(text: string): void {
    this.barMessage = text.replace(/\s+/g, ' ').trim().slice(0, BAR_MESSAGE_MAX) || BAR_MESSAGE;
  }

  get partying(): boolean {
    return this.time < this.partyUntil;
  }

  get partyCost(): number {
    return PARTY_COST[this.barLevel - 1] ?? PARTY_COST[0];
  }

  /** Le barman en renfort est là : il rebranche les fûts vides tout seul. */
  get barmanOn(): boolean {
    return this.time < this.barmanUntil;
  }

  get barmanCost(): number {
    return BARMAN_COST[this.barLevel - 1] ?? BARMAN_COST[0];
  }

  /** Embauche (ou prolonge) le barman pour 8 h, jusqu'à 24 h d'avance. */
  hireBarman(): CommandResult {
    return this.hire('barman');
  }

  // ------------------------------------------------------------------ personnel

  /** Postes de personnel : 1 au début, jusqu'à 3 selon le niveau de la brasserie. */
  get staffSlots(): number {
    return STAFF_SLOTS[this.breweryLevel - 1] ?? STAFF_SLOTS[0];
  }

  /** Fin du contrat d'un employé (s de jeu). */
  staffEnd(id: StaffId): number {
    return id === 'barman' ? this.barmanUntil : this.staffUntil[id];
  }

  staffOn(id: StaffId): boolean {
    return this.time < this.staffEnd(id);
  }

  /** Postes occupés. */
  get staffBusy(): number {
    return (['barman', 'courier', 'apprentice'] as const).filter((id) => this.staffOn(id)).length;
  }

  staffCost(id: StaffId): number {
    if (id === 'barman') return this.barmanCost;
    const table = id === 'courier' ? COURIER_COST : APPRENTICE_COST;
    return table[this.breweryLevel - 1] ?? table[0];
  }

  /** Embauche (ou prolonge) un employé pour 8 h, jusqu'à 24 h d'avance ; il faut un poste libre pour un nouveau. */
  hire(id: StaffId): CommandResult {
    const on = this.staffOn(id);
    if (!on && this.staffBusy >= this.staffSlots) return { ok: false, reason: `Plus de poste libre (${this.staffSlots}) : la brasserie en ouvre d'autres en grandissant` };
    const from = Math.max(this.time, this.staffEnd(id));
    if (from + STAFF_CONTRACT.duration - this.time > STAFF_CONTRACT.maxAhead) return { ok: false, reason: 'Contrat déjà assez long' };
    const cost = this.staffCost(id);
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    if (id === 'barman') {
      this.barmanUntil = from + BARMAN.duration;
      this.refillTaps();
    } else this.staffUntil[id] = from + STAFF_CONTRACT.duration;
    return { ok: true };
  }

  /** Le livreur envoie les commandes remplissables ; l'apprenti reprogramme le dernier brassin quand la file est vide. */
  private tickStaff(dt: number): void {
    if (this.staffOn('courier') && (this.courierClock += dt) >= COURIER_ROUND_S) {
      this.courierClock = 0;
      for (const o of this.readyOrders) {
        const r = this.fulfill(o.id, this.autoPick(o));
        if (r.ok) this.events.emit({ type: 'autoSent', client: o.client, amount: r.amount! });
      }
    }
    if (this.staffOn('apprentice') && (this.apprenticeClock += dt) >= APPRENTICE_CHECK_S) {
      this.apprenticeClock = 0;
      const last = this.lastPlan;
      if (!this.plan.length && !this.queued && last && this.beer(last.beerId) && this.planBrew(last.beerId, last.format, 1).ok) {
        this.events.emit({ type: 'apprenticePlanned', beerId: last.beerId });
      }
    }
  }

  // ------------------------------------------------------------------ boosts

  /** Boost en cours sur un canal. */
  boostOf(channel: BoostChannel): { id: BoostId; until: number } | null {
    const b = this.boosts[channel];
    return b && b.until > this.time ? b : null;
  }

  /** Multiplicateur d'un canal (1 sans boost). */
  boostMult(channel: BoostChannel): number {
    const b = this.boostOf(channel);
    return b ? boostById(b.id)?.mult ?? 1 : 1;
  }

  /** Cadence d'une machine : le boost de brasserie, et la levure express pour la fermentation et la garde. */
  stageMult(id: StationId): number {
    return this.boostMult('brew') * (YEAST_STAGES.includes(id) ? this.boostMult('yeast') : 1);
  }

  /** Prix des verres : happy hour, juke-box. */
  get barPriceMult(): number {
    const b = this.boostOf('bar');
    return (b ? boostById(b.id)?.priceMult ?? 1 : 1) * this.furnitureMult('price');
  }

  /** Diamants gagnées (commande livrée, niveau de la brasserie). */
  /** Le pack peut-il encore s'acheter (le pack de démarrage, une seule fois) ? */
  packAvailable(id: GemPackId): boolean {
    const pack = gemPackById(id);
    return !!pack && !(pack.once && this.packsBought.includes(id));
  }

  /**
   * Crédite un achat de diamants confirmé par l'App Store. Idempotent : une transaction déjà créditée (reprise au
   * lancement, notification en double) ne rapporte rien de plus.
   */
  grantPurchase(productId: string, transactionId: string): CommandResult & { gems?: number } {
    const pack = gemPackByProduct(productId);
    if (!pack) return { ok: false, reason: 'Produit inconnu' };
    if (this.purchases.includes(transactionId)) return { ok: false, reason: 'Achat déjà crédité' };
    this.purchases.push(transactionId);
    if (this.purchases.length > 500) this.purchases.splice(0, this.purchases.length - 500);
    if (pack.once && !this.packsBought.includes(pack.id)) this.packsBought.push(pack.id);
    this.earnGems(pack.gems, 'purchase');
    return { ok: true, gems: pack.gems };
  }

  earnGems(n: number, why: 'order' | 'level' | 'purchase'): void {
    if (n <= 0) return;
    this.gems += n;
    this.events.emit({ type: 'gems', amount: n, why });
  }

  /** Prix d'un boost, en diamants : fixe, et dégressif avec la durée. */
  boostCost(id: BoostId): number {
    return boostById(id)?.gems ?? Infinity;
  }

  /** Pourquoi un boost ne peut pas partir maintenant (hors manque de diamants), ou null. */
  boostBlocked(id: BoostId): string | null {
    const def = boostById(id);
    if (!def) return 'Boost introuvable';
    if (!def.channel) return id === 'prospect' && this.orders.length >= this.boardSlots ? 'Le tableau des commandes est plein' : null;
    const cur = this.boostOf(def.channel);
    const curDef = cur ? boostById(cur.id) : undefined;
    if (cur && curDef && !sameEffect(curDef, def)) return `« ${curDef.name} » est en cours`;
    const from = cur ? cur.until : this.time;
    if (from + def.minutes * 60 - this.time > BOOST_MAX_AHEAD) return 'Déjà prolongé au maximum (24 h)';
    return null;
  }

  /**
   * Achète un boost avec des diamants. Un boost au même effet que celui en cours le prolonge
   * (24 h d'avance au plus) ; un effet différent sur le même poste attend la fin.
   */
  buyBoost(id: BoostId): CommandResult {
    const def = boostById(id);
    if (!def) return { ok: false, reason: 'Boost introuvable' };
    const blocked = this.boostBlocked(id);
    if (blocked) return { ok: false, reason: blocked };
    if (this.gems < def.gems) return { ok: false, reason: 'Pas assez de diamants' };
    this.gems -= def.gems;
    if (!def.channel) {
      this.syncSlots();
      const i = this.orderWaits.indexOf(Math.min(...this.orderWaits));
      if (i >= 0) this.orderWaits[i] = 0;
      this.tickOrders(0);
      return { ok: true };
    }
    const cur = this.boostOf(def.channel);
    // le poste garde le nom du boost en cours ; la durée s'ajoute
    this.boosts[def.channel] = { id: cur?.id ?? id, until: (cur ? cur.until : this.time) + def.minutes * 60 };
    return { ok: true };
  }

  // ------------------------------------------------------------------ mobilier et étiquettes

  hasFurniture(id: FurnitureId): boolean {
    return this.furniture.includes(id);
  }

  /** Produit des effets du mobilier sur les clients, le prix des verres ou la popularité. */
  furnitureMult(k: 'clients' | 'price' | 'pop'): number {
    return FURNITURE.reduce((m, f) => m * (this.hasFurniture(f.id) ? f[k] ?? 1 : 1), 1);
  }

  buyFurniture(id: FurnitureId): CommandResult {
    return this.buyDecor(id);
  }

  /** Une forme, un logo ou un motif est-il disponible dans l'éditeur ? (ceux du départ le sont toujours) */
  isUnlocked(kind: UnlockKind, value: string): boolean {
    return !isLockable(kind, value) || this.unlocked.includes(`${kind}:${value}`);
  }

  buyUnlock(id: string): CommandResult {
    const x = unlockById(id);
    if (!x) return { ok: false, reason: 'Introuvable' };
    if (this.unlocked.includes(id)) return { ok: false, reason: 'Déjà débloqué' };
    if (x.gems) {
      if (this.gems < x.gems) return { ok: false, reason: 'Pas assez de diamants' };
      this.gems -= x.gems;
    } else {
      if (this.money < x.cost) return { ok: false, reason: 'Pas assez d\'argent' };
      this.money -= x.cost;
    }
    this.unlocked.push(id);
    return { ok: true };
  }

  /** Organise une fête au bar : 60 fois plus de clients pendant 45 min ; les fûts vides sont rebranchés tout seuls. */
  startParty(): CommandResult {
    return this.startEvent('party');
  }

  /** Lance un événement au bar (il faut l'objet nécessaire, de l'argent, et que le quartier soit remis du précédent). */
  startEvent(id: BarEventId): CommandResult {
    const ev = barEventById(id);
    if (!ev) return { ok: false, reason: 'Événement introuvable' };
    if (ev.needs && !this.owns(ev.needs)) return { ok: false, reason: `Il faut d'abord acheter : ${SHOP_ITEMS.find((x) => x.id === ev.needs)?.name}` };
    if (this.partying) return { ok: false, reason: 'Un événement bat déjà son plein' };
    if (this.time < this.partyReadyAt) return { ok: false, reason: 'Le quartier se remet du dernier événement' };
    const cost = this.eventCost(id);
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.eventId = id;
    this.partyUntil = this.time + ev.duration;
    this.partyReadyAt = this.time + PARTY_COOLDOWN;
    this.refillTaps();
    return { ok: true };
  }

  /** Pendant une fête, le personnel rebranche les fûts vides avec ceux du stockage (la bière la plus populaire d'abord). */
  private refillTaps(): void {
    this.taps.forEach((t, i) => {
      if (t.glasses > 0) return;
      const b = this.beers.filter((x) => x.kegs.length && x.tasting.quality >= BAR_MIN_QUALITY).sort((a, c) => c.pop - a.pop)[0];
      if (b) this.swapKeg(i, b.id);
    });
  }

  /** Prix d'une campagne, selon le niveau de la brasserie. */
  adCost(id: AdId): number {
    return adCost(adById(id)!, this.breweryLevel);
  }

  /** La campagne est-elle débloquée (chaque niveau de l'ordinateur en ouvre une) ? */
  adUnlocked(id: AdId): boolean {
    return this.computerLevel >= (adById(id)?.computer ?? Infinity);
  }

  get advertising(): boolean {
    return this.time < this.adUntil;
  }

  /** La campagne en cours. */
  get ad(): AdDef | null {
    return this.advertising ? adById(this.adId) ?? null : null;
  }

  /** La meilleure campagne débloquée. */
  get bestAd(): AdDef {
    return [...ADS].reverse().find((a) => this.adUnlocked(a.id)) ?? ADS[0]!;
  }

  /**
   * Lance une campagne (une seule à la fois) : toute la gamme gagne en popularité, des lettres arrivent tout de suite
   * selon la campagne, puis plus souvent jusqu'à la fin, et mieux payées pour les plus grosses.
   */
  advertise(id: AdId = 'flyers'): CommandResult {
    const ad = adById(id);
    if (!ad) return { ok: false, reason: 'Campagne inconnue' };
    if (!this.adUnlocked(id)) return { ok: false, reason: `Il faut d'abord : ${COMPUTERS[ad.computer - 1]?.name}` };
    if (this.advertising) return { ok: false, reason: 'Une campagne est déjà en cours' };
    const cost = this.adCost(id);
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.adId = id;
    this.adUntil = this.time + ad.duration;
    this.adPrestige = ad.prestige;
    for (const b of this.beers) b.pop = Math.max(b.pop, Math.min(this.popCap, b.pop + ad.pop));
    this.syncSlots();
    // des lettres tout de suite : les emplacements libres les plus proches (au moins un, dans la minute)
    const order = this.orderWaits.map((w, i) => [w, i] as const).sort((a, b) => a[0] - b[0]);
    order.slice(0, Math.max(1, Math.min(ad.letters, order.length))).forEach(([w, i]) => (this.orderWaits[i] = Math.min(w, ad.letters ? 1 : 60)));
    return { ok: true };
  }

  /** Prolonge la campagne en cours de quelques heures, en diamants (jusqu'à 24 h d'avance). */
  extendAd(): CommandResult {
    if (!this.advertising) return { ok: false, reason: 'Aucune campagne en cours' };
    if (this.adUntil - this.time + AD_EXTEND.hours * 3600 > AD_EXTEND.maxAhead) return { ok: false, reason: 'Pas plus de 24 h d\'avance' };
    if (this.gems < AD_EXTEND.gems) return { ok: false, reason: 'Pas assez de diamants' };
    this.gems -= AD_EXTEND.gems;
    this.adUntil += AD_EXTEND.hours * 3600;
    return { ok: true };
  }

  /** Le bar a quelque chose à servir. */
  get barServing(): boolean {
    return this.flowing.length > 0;
  }

  /** Verres restant dans tous les fûts branchés. */
  get glassesLeft(): number {
    return this.flowing.reduce((s, t) => s + t.glasses, 0);
  }

  /** Notoriété maximale de la brasserie (selon son niveau). */
  get popCap(): number {
    return POP_CAP[this.breweryLevel - 1] ?? 1;
  }

  /** Popularité que peut viser une bière de la gamme. */
  popTarget(b: Beer): number {
    return popTarget(b.tasting, this.trends, this.popCap);
  }

  /** Les tendances que suit une bière. */
  trendsOf(b: Beer) {
    return trendsOf(b.tasting, this.trends);
  }

  upgradeBar(): CommandResult {
    const next = BAR[this.barLevel];
    if (!next) return { ok: false, reason: 'Niveau maximal' };
    if (this.money < next.cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= next.cost;
    this.barLevel++;
    while (this.taps.length < this.barTaps) this.taps.push({ beerId: null, glasses: 0, capacity: 0 });
    return { ok: true };
  }

  // ------------------------------------------------------------------ commandes

  /** Places au tableau des commandes. */
  get boardSlots(): number {
    return COMPUTERS[this.computerLevel - 1]!.slots;
  }

  /** Améliore l'ordinateur : une place de plus au tableau des commandes. */
  upgradeComputer(): CommandResult {
    const next = COMPUTERS[this.computerLevel];
    if (!next) return { ok: false, reason: 'Niveau maximal' };
    if (this.money < next.cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= next.cost;
    this.computerLevel++;
    return { ok: true };
  }

  /** Bières de la gamme qui conviennent à une commande (qualité, style). */
  suitable(o: Order): Beer[] {
    return this.beers.filter((b) => fits(o, b.tasting));
  }

  /** Ce que donneraient les bières choisies pour cette commande (bouteilles, ou fûts pour une commande de fûts). */
  quote(o: Order, beerIds: number[]): OrderQuote {
    const ok = this.suitable(o);
    const chosen = beerIds.map((id) => ok.find((b) => b.id === id)).filter((b): b is Beer => !!b);
    const avail = (b: Beer) => (o.kind === 'keg' ? b.kegs.length : b.stock);
    const take: OrderQuote['take'] = [];
    let filled = 0;
    if (o.mix) {
      // assortiment : une part égale de plusieurs bières différentes
      const per = Math.ceil(o.qty / o.mix);
      for (const b of chosen) {
        if (take.length >= o.mix || avail(b) < per) continue;
        take.push({ beer: b, n: per });
        filled += per;
      }
      return { take, filled: Math.min(filled, o.qty), ok: take.length >= o.mix };
    }
    for (const b of chosen) {
      if (filled >= o.qty) break;
      const n = Math.min(avail(b), o.qty - filled);
      if (n <= 0) continue;
      take.push({ beer: b, n });
      filled += n;
    }
    return { take, filled, ok: filled >= o.qty };
  }

  /** Les bières à proposer d'emblée pour une commande : celles qui ont le plus de stock. */
  autoPick(o: Order): number[] {
    const avail = (b: Beer) => (o.kind === 'keg' ? b.kegs.length : b.stock);
    const sorted = this.suitable(o).filter((b) => avail(b) > 0).sort((a, b) => avail(b) - avail(a));
    if (o.mix) return sorted.slice(0, o.mix).map((b) => b.id);
    const out: number[] = [];
    let n = 0;
    for (const b of sorted) {
      if (n >= o.qty) break;
      out.push(b.id);
      n += avail(b);
    }
    return out;
  }

  /** Envoie une commande remplie avec les bières choisies : elle est payée tout de suite. */
  fulfill(orderId: number, beerIds: number[]): CommandResult & { amount?: number } {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return { ok: false, reason: 'Commande introuvable' };
    const q = this.quote(o, beerIds);
    if (!q.ok) return { ok: false, reason: o.mix ? `Il faut ${o.mix} bières différentes` : `Il manque ${o.qty - q.filled} ${o.kind === 'keg' ? 'fûts' : 'bouteilles'}` };
    const units = q.take.reduce((s, t) => s + t.n, 0);
    let liters = 0;
    for (const { beer, n } of q.take) {
      let l = n * BOTTLE_L;
      if (o.kind === 'keg') {
        beer.kegs.sort((a, b) => a - b);
        l = beer.kegs.splice(0, n).reduce((s, g) => s + g * GLASS_L, 0);
      } else beer.stock -= n;
      beer.liters += l;
      liters += l;
      beer.sold += n;
      beer.revenue += (n / units) * o.reward;
      // une commande fait connaître la bière (une commande de prestige, beaucoup)
      beer.pop = gainPop(beer.pop, this.popTarget(beer), o.kind === 'prestige' ? 60 : o.kind === 'keg' ? n * 40 : n, POP_PER_BOTTLE);
    }
    this.totalSold += units;
    this.totalLiters += liters;
    this.totalRevenue += o.reward;
    this.ordersRevenue += o.reward;
    this.recordSale('orders', o.reward);
    this.money += o.reward;
    this.ordersDone++;
    this.orders = this.orders.filter((x) => x !== o);
    this.freeSlot();
    this.events.emit({ type: 'sale', amount: o.reward });
    this.earnGems(orderGems(o), 'order');
    return { ok: true, amount: o.reward };
  }

  /** Refuser une commande : sa place se libère pour une autre. */
  declineOrder(orderId: number): CommandResult {
    const before = this.orders.length;
    this.orders = this.orders.filter((x) => x.id !== orderId);
    if (before === this.orders.length) return { ok: false, reason: 'Commande introuvable' };
    this.freeSlot();
    return { ok: true };
  }

  /** Commandes qu'on peut remplir tout de suite avec le stock. */
  get readyOrders(): Order[] {
    return this.orders.filter((o) => this.quote(o, this.autoPick(o)).ok);
  }

  /** Quota du grossiste pour une bière, en litres par jour : il grandit avec sa popularité (et avec le matériel). */
  wholesaleQuota(beer: Beer): number {
    // pendant un boost de production, le grossiste suit la cadence : sans ça, produire plus ne rapporterait rien
    if (this.boostOf('wholesale')?.id === 'openGate') return Infinity; // grossiste sans limite
    const boost = Math.max(this.boostMult('brew'), this.boostMult('yeast') > 1 ? 1.5 : 1);
    return Math.round(this.batchLiters * (WHOLESALE_QUOTA.base + WHOLESALE_QUOTA.pop * beer.pop) * boost);
  }

  /** Litres que le grossiste reprend encore aujourd'hui pour cette bière. */
  wholesaleLeft(beer: Beer): number {
    return Math.max(0, this.wholesaleQuota(beer) - beer.wsToday);
  }

  /** Bouteilles ou fûts que le grossiste peut reprendre maintenant (stock et quota du jour). */
  wholesaleSellable(beer: Beer, format: Format): number {
    if (beer.tasting.quality < DRINKABLE_MIN) return 0;
    let left = this.wholesaleLeft(beer) + 1e-9;
    if (format === 'bottle') return Math.min(beer.stock, Math.floor(left / BOTTLE_L));
    let n = 0;
    for (const g of [...beer.kegs].sort((a, b) => a - b)) {
      if (g * GLASS_L > left) break;
      left -= g * GLASS_L;
      n++;
    }
    return n;
  }

  /**
   * Le grossiste reprend bouteilles et fûts à tout moment, à petit prix (le même au litre), dans la limite
   * d'un quota quotidien par bière, en litres, rechargé à minuit.
   */
  sellWholesale(beerId: number, n: number, format: Format = 'bottle'): CommandResult & { amount?: number; sold?: number } {
    const beer = this.beer(beerId);
    if (!beer) return { ok: false, reason: 'Bière introuvable' };
    if (beer.tasting.quality < DRINKABLE_MIN) return { ok: false, reason: 'Imbuvable' };
    const have = format === 'bottle' ? beer.stock : beer.kegs.length;
    if (Math.floor(n) <= 0 || have <= 0) return { ok: false, reason: 'Rien à vendre' };
    n = Math.min(Math.floor(n), this.wholesaleSellable(beer, format));
    if (n <= 0) return { ok: false, reason: 'Quota du grossiste atteint pour aujourd\'hui' };
    let liters = n * BOTTLE_L;
    if (format === 'bottle') beer.stock -= n;
    else {
      beer.kegs.sort((a, b) => a - b);
      liters = beer.kegs.splice(0, n).reduce((s, g) => s + g * GLASS_L, 0);
    }
    const amount = (liters / BOTTLE_L) * wholesalePrice(beer.tasting) * this.boostMult('wholesale');
    beer.wsToday += liters;
    beer.sold += n;
    beer.liters += liters;
    beer.revenue += amount;
    this.totalSold += n;
    this.totalLiters += liters;
    this.totalRevenue += amount;
    this.wholesaleLiters += liters;
    this.wholesaleRevenue += amount;
    this.recordSale('wholesale', amount);
    this.money += amount;
    this.events.emit({ type: 'sale', amount });
    return { ok: true, amount, sold: n };
  }

  /** Recharge les quotas du grossiste au premier passage après minuit. */
  private refillQuota(): void {
    const day = localDay(this.wall);
    if (day === this.quotaDay) return;
    this.quotaDay = day;
    for (const b of this.beers) b.wsToday = 0;
  }

  collectOffline(): number {
    const e = this.offline?.earned ?? 0;
    this.money += e;
    this.offline = null;
    return e;
  }

  // ------------------------------------------------------------------ simulation

  step(dt = TICK_DT): void {
    this.time += dt;
    this.wall += dt * 1000;
    this.refillQuota();
    // De l'aval vers l'amont : un appareil se libère avant que le lot précédent n'y entre.
    const sorted = [...this.batches].sort((a, b) => b.stage - a.stage);
    for (const b of sorted) this.advance(b, dt);
    if (!this.batchAt('mill')) {
      const next = this.plan[0];
      const planned = next && this.beer(next.beerId);
      if (this.queued) {
        if (this.smoothLaunch(this.recipe, 'bottle')) {
          this.queued = false;
          this.brew();
        }
      } else if (planned && next) {
        // brassin programmé : il attend l'argent, la place nécessaire, et que son trajet soit libre
        if ((this.money >= this.brewCost(planned.recipe, this.batchLiters, next.format) || this.broke) && this.roomFor(next.format) && this.smoothLaunch(planned.recipe, next.format)) {
          if (--next.count <= 0) this.plan.shift();
          this.launch(planned.recipe, planned.id, next.format);
        }
      }
    }
    this.sellBar(dt);
    this.tickOrders(dt);
    this.tickStaff(dt);
    if (this.autoWholesale && (this.wholesaleClock += dt) >= 1) {
      this.wholesaleClock = 0;
      this.sellWhenFull();
    }
    this.tickTrends();
    // sans ventes, la popularité s'érode doucement
    const keep = Math.exp(-POP_DECAY * dt);
    for (const b of this.beers) b.pop *= keep;
    this.announce();
  }

  private advance(b: Batch, dt: number): void {
    if (!b.waiting) {
      // Essai : la ligne remplit une seule bouteille, puis attend que le joueur la goûte et décide.
      const fast = dt * this.stageMult(STATION_ORDER[b.stage]!);
      if (this.awaitingTaste(b)) {
        b.elapsed = Math.min(b.elapsed + fast, b.duration / Math.max(1, b.bottles ?? 1));
        return;
      }
      b.elapsed += fast;
      if (b.elapsed < b.duration) return;
      b.waiting = true;
    }
    const next = b.stage + 1;
    if (next >= STATION_ORDER.length) {
      // Un essai attend la décision du joueur (garder ou recommencer) : il est mis de côté pour libérer la ligne.
      if (b.beerId == null) {
        if (this.trial) return;
        this.trial = b;
        this.batches = this.batches.filter((x) => x !== b);
        return;
      }
      return this.store(b);
    }
    if (this.batches.filter((o) => o.stage === next).length >= this.tankCount(STATION_ORDER[next]!)) return; // appareil suivant occupé
    this.enter(b, next);
  }

  /** Entrée d'un lot dans un appareil : la température réelle dépend de la précision de l'appareil. */
  private enter(b: Batch, stage: number): void {
    const id = STATION_ORDER[stage]!;
    const lv = this.level(id);
    const r = b.recipe;
    // L'appareil exécute l'étape avec sa précision. Le tout premier brassin, Gaston veille au grain : tout est exact.
    const guided = this.batchesDone === 0 && this.beers.length === 0 && !this.trial;
    executeStep(id, r, lv, () => this.rng.next(), b.actual, guided);
    b.stage = stage;
    b.elapsed = 0;
    b.waiting = false;
    if (id === 'bottling') {
      b.tasting = brew(r, this.levels, b.actual as Actual);
      if (b.format === 'keg') {
        const kl = kegLiters(b.liters);
        b.kegGlasses = kegGlasses(kl);
        b.kegs = Math.floor((b.liters * (1 - b.tasting.lost)) / kl + 1e-9);
      }
      else b.bottles = Math.floor((b.liters / BOTTLE_L) * (1 - b.tasting.lost));
    }
    // un fût se remplit deux fois plus vite que le même volume en bouteilles
    b.duration = b.format === 'keg' && id === 'bottling'
      ? stationDuration(id, r, lv, (b.kegs ?? 0) * ((b.kegGlasses ?? 20) * 0.25)) * 0.5
      : stationDuration(id, r, lv, b.bottles != null ? b.bottles * BOTTLE_L : b.liters);
    // Premier brassin du tutoriel : Gaston donne un coup de main, tout va 4 fois plus vite.
    if (this.batchesDone === 0 && this.beers.length === 0 && this.batches.length <= 1) b.duration *= 0.25;
    this.events.emit({ type: 'stage', batchId: b.id, stage });
  }

  /**
   * Fin de l'embouteillage : les caisses rejoignent le stockage. S'il est plein, le lot reste sur la ligne
   * (l'embouteillage est bloqué) et finit de se ranger dès que des bouteilles sont vendues.
   */
  private store(b: Batch): void {
    const tasting = b.tasting ?? brew(b.recipe, this.levels, b.actual as Actual);
    const keg = b.format === 'keg';
    const made = keg ? (b.kegs ?? 0) : (b.bottles ?? Math.floor((b.liters / BOTTLE_L) * (1 - tasting.lost)));
    const bottles = tasting.quality >= DRINKABLE_MIN ? made : 0;
    const beer = this.beers.find((x) => x.id === b.beerId);
    if (beer && (b.delivered ?? 0) < bottles) {
      const glasses = b.kegGlasses ?? 20;
      const unit = keg ? kegSpace(glasses) : 1;
      const n = Math.min(bottles - (b.delivered ?? 0), Math.floor(Math.max(0, this.storageCap - this.stored) / unit));
      if (keg) for (let k = 0; k < n; k++) beer.kegs.push(glasses);
      else beer.stock += n;
      b.delivered = (b.delivered ?? 0) + n;
      if (b.delivered < bottles) return;
    }
    this.batches = this.batches.filter((x) => x !== b);
    this.batchesDone++;
    // Un lot imbuvable est jeté ; sinon la bière prend la dégustation de son dernier lot (le matériel fait varier la qualité).
    if (beer && tasting.quality >= DRINKABLE_MIN) beer.tasting = tasting;
    if (beer && tasting.quality < DRINKABLE_MIN) this.events.emit({ type: 'batchRuined', beerId: beer.id });
    else this.events.emit({ type: 'batchDone', beerId: beer?.id ?? null, bottles: keg ? 0 : bottles, kegs: keg ? bottles : 0 });
  }

  /** Lot bloqué en fin de ligne faute de place dans le stockage. */
  get bottlingBlocked(): boolean {
    const b = this.batchAt('bottling');
    return !!b && b.waiting && b.beerId != null && this.storageFull;
  }

  /**
   * Le bar sert ses clients un verre à la fois, tiré des fûts branchés. Chaque client choisit parmi les bières
   * qui coulent, attiré par les plus populaires et celles dans la tendance. Chaque verre fait connaître la bière.
   */
  private sellBar(dt: number): void {
    if (this.partying || this.barmanOn) this.refillTaps();
    if (!this.barServing) return;
    this.barDemand = Math.min(this.partying ? 200 : 2, this.barDemand + (this.barRate / 60) * dt);
    let earned = 0;
    while (this.barDemand >= 1) {
      if ((this.partying || this.barmanOn) && this.taps.some((t) => t.glasses <= 0)) this.refillTaps();
      const flowing = this.flowing;
      if (!flowing.length) break;
      const weight = (t: Tap) => {
        const b = this.beer(t.beerId)!;
        return (0.2 + b.pop) * trendFactor(b.tasting, this.trends);
      };
      let pick = this.rng.next() * flowing.reduce((s, t) => s + weight(t), 0);
      let tap = flowing[0]!;
      for (const t of flowing) if ((pick -= weight(t)) <= 0) { tap = t; break; }
      const beer = this.beer(tap.beerId)!;
      const price = glassPrice(this.barLevel, beer.tasting, this.trendsOf(beer).length) * (this.partying ? this.barEvent.priceMult : 1) * this.barPriceMult;
      tap.glasses--;
      beer.sold++;
      beer.liters += GLASS_L;
      this.totalLiters += GLASS_L;
      beer.revenue += price;
      beer.pop = gainPop(beer.pop, this.popTarget(beer), (this.partying ? this.barEvent.popMult : 1) * this.furnitureMult('pop'), POP_PER_GLASS);
      this.totalSold++;
      this.totalRevenue += price;
      this.barSold++;
      this.barRevenue += price;
      this.money += price;
      earned += price;
      this.barDemand--;
    }
    if (earned > 0) {
      this.recordSale('bar', earned);
      this.events.emit({ type: 'sale', amount: earned });
    }
  }

  /** Range une vente dans la minute de jeu en cours ; on ne garde que la dernière heure. */
  private recordSale(source: SaleSource, amount: number): void {
    const m = Math.floor(this.time / 60);
    let last = this.salesHistory[this.salesHistory.length - 1];
    if (!last || last.m !== m) {
      last = { m, bar: 0, orders: 0, wholesale: 0 };
      this.salesHistory.push(last);
      const keep = m - SALES_HISTORY_MIN + 1;
      while (this.salesHistory.length && this.salesHistory[0]!.m < keep) this.salesHistory.shift();
    }
    last[source] += amount;
  }

  /** Ventes des n dernières minutes de jeu (la minute en cours comprise), une case par minute, les plus anciennes d'abord. */
  salesMinutes(n = SALES_HISTORY_MIN): SalesMinute[] {
    const now = Math.floor(this.time / 60);
    const byMin = new Map(this.salesHistory.map((s) => [s.m, s]));
    const out: SalesMinute[] = [];
    for (let m = now - n + 1; m <= now; m++) out.push(byMin.get(m) ?? { m, bar: 0, orders: 0, wholesale: 0 });
    return out;
  }

  /** Recettes de la dernière heure de jeu. */
  get revenueLastHour(): number {
    return this.salesMinutes().reduce((s, x) => s + x.bar + x.orders + x.wholesale, 0);
  }

  /** Les tendances passent ; de nouvelles les remplacent (jamais deux fois la même en même temps). */
  private tickTrends(): void {
    if (this.trends.length >= TREND_COUNT && this.trends.every((t) => t.until > this.time)) return;
    const first = this.trends.length === 0;
    this.trends = this.trends.filter((t) => t.until > this.time);
    while (this.trends.length < TREND_COUNT) {
      const pool = TRENDS.filter((d) => !this.trends.some((t) => t.id === d.id));
      const d = pool[Math.floor(this.rng.next() * pool.length)]!;
      const life = TREND_MIN_S + (TREND_MAX_S - TREND_MIN_S) * this.rng.next();
      // au tout début, les tendances sont décalées pour ne pas changer toutes en même temps
      this.trends.push({ id: d.id, until: this.time + (first ? life * (0.35 + 0.65 * (this.trends.length / TREND_COUNT)) : life) });
      if (!first) this.events.emit({ type: 'trend', id: d.id });
    }
  }

  /**
   * Place qui manque pour que la production reparte : un lot fini attend de se ranger, ou le prochain brassin de la file
   * attend de la place. 0 si le stockage n'est pas plein.
   */
  get storageShortfall(): number {
    const free = this.storageCap - this.stored;
    let need = 0;
    for (const b of this.batches) {
      if (b.stage !== STATION_ORDER.length - 1 || b.elapsed < b.duration) continue;
      const left = this.pendingSpace(b);
      if (left > 0) need = Math.max(need, Math.min(left, b.format === 'keg' ? kegSpace(b.kegGlasses ?? 20) : left) - free);
    }
    const head = this.plan[0];
    if (head && !this.roomFor(head.format)) {
      const pending = this.batches.reduce((s, b) => s + this.pendingSpace(b), 0);
      need = Math.max(need, this.stored + pending + this.batchSpace(head.format) - this.storageCap);
    }
    return Math.max(0, need);
  }

  /**
   * Vente automatique : seulement quand le stockage est plein (la production attend de la place), le grossiste reprend
   * de quoi la débloquer, dans la limite des quotas. Les bouteilles d'abord (elles prennent plus de place par litre),
   * puis les fûts ; la bière qui occupe le plus de place d'abord.
   */
  private sellWhenFull(): void {
    let need = this.storageShortfall;
    for (const format of ['bottle', 'keg'] as const) {
      while (need > 0) {
        let best: Beer | undefined;
        let bestSpace = 0;
        for (const b of this.beers) {
          if (this.wholesaleSellable(b, format) <= 0) continue;
          const space = format === 'bottle' ? b.stock : b.kegs.reduce((k, g) => k + kegSpace(g), 0);
          if (space > bestSpace) { best = b; bestSpace = space; }
        }
        if (!best) break;
        let n = 1;
        if (format === 'bottle') n = Math.ceil(need);
        else {
          const sorted = [...best.kegs].sort((a, b) => a - b);
          for (let freed = 0, i = 0; i < sorted.length && freed < need; i++) { freed += kegSpace(sorted[i]!); n = i + 1; }
        }
        const before = this.stored;
        if (!this.sellWholesale(best.id, n, format).ok) break;
        need -= before - this.stored;
      }
    }
  }

  /** Délai avant la lettre suivante d'un emplacement qui se libère : 30 à 60 min (un peu moins pour une marque connue). */
  private orderGap(): number {
    return (ORDER_GAP_MIN_S + (ORDER_GAP_MAX_S - ORDER_GAP_MIN_S) * this.rng.next()) / (0.8 + 0.4 * this.brand);
  }

  /** Une commande quitte le tableau (envoyée, refusée, expirée) : son emplacement attend la lettre suivante. */
  private freeSlot(): void {
    this.orderWaits.push(this.orderGap());
    this.syncSlots();
  }

  /** Autant d'emplacements que de places : une place gagnée (nouvel ordinateur) reçoit vite sa première lettre. */
  private syncSlots(): void {
    while (this.orders.length + this.orderWaits.length < this.boardSlots) this.orderWaits.push(FIRST_ORDER_S);
    while (this.orders.length + this.orderWaits.length > this.boardSlots && this.orderWaits.length) {
      this.orderWaits.splice(this.orderWaits.indexOf(Math.max(...this.orderWaits)), 1);
    }
  }

  /** Temps réel restant (s de jeu) avant la lettre de chaque emplacement libre, du plus proche au plus lointain. */
  get slotWaits(): number[] {
    const speed = this.ad?.orderBoost ?? 1;
    return [...this.orderWaits].sort((a, b) => a - b).map((w) => Math.max(0, w / speed));
  }

  /**
   * Chaque emplacement libre a son délai : une lettre y arrive quand il est écoulé (deux fois plus vite pendant
   * une campagne de pub). Envoyer, refuser ou laisser expirer une commande relance le délai de son emplacement.
   */
  private tickOrders(dt: number): void {
    if (this.orders.some((o) => o.expires <= this.time)) {
      for (const o of this.orders) if (o.expires <= this.time) {
        this.expiredAt.push(this.time);
        this.events.emit({ type: 'orderExpired', client: o.client });
        this.orderWaits.push(this.orderGap());
      }
      this.expiredAt = this.expiredAt.filter((x) => x > this.time - 86400).slice(-12);
      this.orders = this.orders.filter((o) => o.expires > this.time);
    }
    this.syncSlots();
    const step = dt * (this.ad?.orderBoost ?? 1);
    for (let i = 0; i < this.orderWaits.length; i++) this.orderWaits[i]! -= step;
    while (this.orderWaits.some((w) => w <= 0)) {
      this.orderWaits.splice(this.orderWaits.findIndex((w) => w <= 0), 1);
      const o = drawOrder(this.nextId++, {
        rng: this.rng, time: this.time, breweryLevel: this.breweryLevel, brand: this.brand, beers: this.beers.length,
        storageCap: this.storageCap, kegLiters: kegLiters(this.batchLiters), trends: this.trends,
        starter: this.ordersDone + this.orders.length < STARTER_ORDERS,
        kind: this.adPrestige && this.advertising && this.beers.some((b) => b.tasting.quality >= PRESTIGE_QUALITY) ? 'prestige' : undefined,
      });
      if (o.kind === 'prestige') this.adPrestige = false;
      // une commande reçue pendant une grosse campagne est mieux payée
      const ad = this.ad;
      if (ad && ad.pay !== 1) o.reward = Math.round(o.reward * ad.pay);
      this.orders.push(o);
      this.events.emit({ type: 'order', client: o.client });
    }
  }

  /** Annonce les nouveaux profils de clients (la brasserie grandit, la marque se fait connaître). */
  private announce(): void {
    for (const c of openTypes(this.breweryLevel, this.brand)) {
      if (this.announced.has(c.id)) continue;
      this.announced.add(c.id);
      if (c.level > 1 || c.pop > 0) this.events.emit({ type: 'clientAvailable', id: c.id });
    }
  }

  // ------------------------------------------------------------------ sauvegarde

  toJSON() {
    return {
      version: 7, time: this.time, money: this.money, gems: this.gems, rng: this.rng.state, stations: this.stations, recipe: this.recipe,
      selectedBeer: this.selectedBeer, batches: this.batches, trial: this.trial, beers: this.beers,
      queued: this.queued, rangeSlots: this.rangeSlots, storageLevel: this.storageLevel, barLevel: this.barLevel, taps: this.taps, barDemand: this.barDemand, trends: this.trends, plan: this.plan, format: this.format,
      barSold: this.barSold, barRevenue: this.barRevenue, orders: this.orders, expiredAt: this.expiredAt, orderWaits: this.orderWaits, tanks: this.tanks, partyUntil: this.partyUntil, partyReadyAt: this.partyReadyAt, eventId: this.eventId, owned: this.owned, barmanUntil: this.barmanUntil, barMessage: this.barMessage, adUntil: this.adUntil, adId: this.adId, adPrestige: this.adPrestige, boosts: this.boosts, purchases: this.purchases, packsBought: this.packsBought, staffUntil: this.staffUntil, furniture: this.furniture, unlocked: this.unlocked, lastPlan: this.lastPlan, ordersDone: this.ordersDone, computerLevel: this.computerLevel, wholesaleLiters: this.wholesaleLiters, autoWholesale: this.autoWholesale, wall: this.wall, quotaDay: this.quotaDay, totalSold: this.totalSold, totalLiters: this.totalLiters, totalRevenue: this.totalRevenue, ordersRevenue: this.ordersRevenue, wholesaleRevenue: this.wholesaleRevenue, salesHistory: this.salesHistory, batchesDone: this.batchesDone,
      nextId: this.nextId, tips: this.tips, offline: this.offline, announced: [...this.announced],
    };
  }

  static fromJSON(raw: unknown): Game {
    const s = raw as Omit<ReturnType<Game['toJSON']>, 'version'> & { version: number };
    if (!s || s.version < 2 || s.version > 7) throw new Error('Sauvegarde incompatible');
    const g = new Game();
    const { demand: _d, signed: _s, deals: _dl, orderTimers: _t, ...rest } = s as typeof s & { demand?: unknown; signed?: unknown; deals?: unknown; orderTimers?: unknown };
    Object.assign(g, { ...rest, rng: new Rng(s.rng), announced: new Set(s.announced) });
    // Sauvegardes v2 : places de gamme liées aux distributeurs, pas encore de stockage.
    if (s.version === 2) {
      g.rangeSlots = Math.max(1, g.beers.length);
      g.storageLevel = 1;
    }
    // Avant la v4, il n'y avait que 3 niveaux d'appareils : ils deviennent les niveaux 2 à 4.
    if (s.version < 4) for (const id of STATION_ORDER) g.stations[id] = { level: Math.min(MAX_LEVEL, (g.stations[id]?.level ?? 1) + 1) };
    // Avant la v5, le « Bar du coin » était un distributeur : il devient la pièce Bar, et les ventes passent par des commandes.
    if (s.version < 5) g.barLevel = 1;
    // Avant la v7, les commandes venaient de clients sous contrat : place au tableau de commandes variées.
    if (s.version < 7) {
      g.orders = [];
      (g as unknown as { orderTimer?: number }).orderTimer = FIRST_ORDER_S;
      g.announced = new Set(CLIENT_TYPES.filter((c) => c.level <= g.breweryLevel && c.pop <= g.brand).map((c) => c.id));
    }
    // Avant la v6, le bar servait des bouteilles : il tire maintenant des fûts, et les bières ont une popularité.
    if (s.version < 6) {
      for (const b of g.beers) {
        b.kegs ??= [];
        b.pop ??= 0.3 * b.tasting.quality;
      }
      for (const b of g.batches) b.format ??= 'bottle';
      if (g.trial) g.trial.format ??= 'bottle';
      delete (g as unknown as { barMenu?: unknown }).barMenu;
    }
    g.taps ??= [];
    while (g.taps.length < g.barTaps) g.taps.push({ beerId: null, glasses: 0, capacity: 0 });
    g.trends ??= [];
    g.plan ??= [];
    // avant les groupes, chaque brassin programmé était une ligne
    for (const p of g.plan) p.count ??= 1;
    g.format ??= 'bottle';
    g.orders ??= [];
    g.expiredAt ??= [];
    // avant les emplacements, un seul minuteur pour tout le tableau : il devient le délai du premier emplacement libre
    if ((s as { orderWaits?: unknown }).orderWaits == null) {
      const old = (g as unknown as { orderTimer?: number }).orderTimer ?? FIRST_ORDER_S;
      const free = Math.max(0, g.boardSlots - g.orders.length);
      g.orderWaits = Array.from({ length: free }, (_, i) => (i === 0 ? old : old + i * ORDER_GAP_MIN_S));
    }
    delete (g as unknown as { orderTimer?: unknown }).orderTimer;
    // avant le quota du grossiste, les ventes se comptaient en bouteilles : on les convertit en litres
    const old = s as unknown as { wholesaleSold?: number };
    g.wholesaleLiters ??= (old.wholesaleSold ?? 0) * BOTTLE_L;
    delete (g as unknown as { wholesaleSold?: unknown }).wholesaleSold;
    g.totalLiters ??= g.totalSold * BOTTLE_L;
    for (const b of g.beers) {
      b.liters ??= b.sold * BOTTLE_L;
      b.wsToday ??= 0;
    }
    g.wall ??= 0;
    g.quotaDay ??= localDay(g.wall);
    g.autoWholesale ??= true;
    g.computerLevel ??= 1;
    delete (g as unknown as { autoBrew?: unknown }).autoBrew; // le brassage continu a disparu : tout passe par la file
    g.ordersRevenue ??= 0;
    g.wholesaleRevenue ??= 0;
    g.salesHistory ??= [];
    delete (g as unknown as { decor?: unknown }).decor; // la décoration reviendra plus tard
    g.tanks ??= {};
    g.partyUntil ??= 0;
    g.partyReadyAt ??= 0;
    g.eventId ??= 'party';
    g.owned ??= [];
    g.barmanUntil ??= 0;
    g.barMessage ??= BAR_MESSAGE;
    // la fête demande désormais une boule à facettes : qui en a déjà organisé une la garde
    if (g.partyReadyAt > 0 && !g.owned.includes('disco')) g.owned.push('disco');
    g.adUntil ??= 0;
    g.adId ??= 'paper'; // les campagnes d'avant les types de pub ressemblaient à l'annonce dans le journal
    g.adPrestige ??= false;
    // les lettres d'avant les pourboires : une commande simple gardait son diamant affiché
    for (const o of g.orders) if (o.tip == null && (o.kind === 'classic' || o.kind === 'keg')) o.tip = true;
    g.boosts ??= {};
    g.purchases ??= [];
    g.packsBought ??= [];
    // le grossiste sans limite avait son propre poste avant d'être rangé avec le grossiste
    const gate = (g.boosts as Record<string, { id: BoostId; until: number } | undefined>).quota;
    if (gate) {
      if (!g.boosts.wholesale || g.boosts.wholesale.until < g.time) g.boosts.wholesale = gate;
      delete (g.boosts as Record<string, unknown>).quota;
    }
    // la monnaie premium s'appelait « capsules » : elles deviennent des diamants, à nombre égal
    const oldCaps = (g as unknown as { caps?: number }).caps;
    if ((s as { gems?: number }).gems == null) g.gems = oldCaps ?? GEMS.start;
    delete (g as unknown as { caps?: unknown }).caps;
    // la campagne de pub ne se vend plus au magasin (elle reste dans l'ordinateur)
    delete (g.boosts as Record<string, unknown>).ad;
    g.staffUntil ??= { courier: 0, apprentice: 0 };
    g.furniture ??= [];
    g.unlocked ??= [];
    g.lastPlan ??= null;
    g.queued ??= false;
    g.trial ??= null;
    return g;
  }
}

/** Brassins programmés au plus. */
/**
 * Brassins programmables d'avance, par niveau de la brasserie. Sans brassage continu, la file est ce qui fait
 * tourner la brasserie pendant l'absence : de 2 à 4 h de production selon le matériel (le simulateur
 * d'équilibrage finit le jeu vers le 31e jour, comme avec l'ancien brassage continu).
 */
export const PLAN_CAP: readonly number[] = [50, 80, 150, 250, 400];
/** Étapes lentes où l'on peut ajouter des cuves en parallèle, et leur nombre maximal. */
export const TANK_STAGES: readonly StationId[] = ['fermenter', 'conditioning'];
export const MAX_TANKS = 4;

export const sameRecipe = (a: Recipe, b: Recipe) => (Object.keys(a) as (keyof Recipe)[]).every((k) => a[k] === b[k]);

// ------------------------------------------------------------------ boucle et hors-ligne

/** Boucle à pas fixe, indépendante du framerate (60/120 Hz). */
export class FixedStepLoop {
  private acc = 0;
  speed = 1;
  constructor(private game: () => Game) {}
  advance(realDt: number): void {
    this.acc += Math.min(realDt, 0.25) * this.speed;
    let n = 0;
    while (this.acc >= TICK_DT && n < 8 * this.speed) {
      this.game().step(TICK_DT);
      this.acc -= TICK_DT;
      n++;
    }
    if (n >= 8 * this.speed) this.acc = 0;
  }
}

export const MAX_OFFLINE_SECONDS = 8 * 3600;

/** La brasserie continue pendant l'absence ; les gains attendent la récolte. */
export function simulateOffline(game: Game, seconds: number, max = MAX_OFFLINE_SECONDS): OfflineReport | null {
  const target = Math.min(seconds, max);
  if (target < 5) return null;
  const money = game.money;
  const sold = game.totalSold;
  const liters = game.totalLiters;
  const done = game.batchesDone;
  const step = 0.5;
  for (let t = 0; t < target; t += step) game.step(step);
  const earned = game.money - money;
  game.money = money;
  const prev = game.offline;
  game.offline = {
    seconds: target + (prev?.seconds ?? 0),
    earned: Math.max(0, earned) + (prev?.earned ?? 0),
    sold: game.totalSold - sold + (prev?.sold ?? 0),
    liters: game.totalLiters - liters + (prev?.liters ?? 0),
    batches: game.batchesDone - done + (prev?.batches ?? 0),
  };
  // Le coût des brassins automatiques lancés pendant l'absence est déjà déduit des gains.
  if (earned < 0) game.money += earned;
  return game.offline;
}
