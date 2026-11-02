import { brew, GASTON_RECIPE, DRINKABLE_MIN, REF_LITERS, type Actual, type Levels, type Recipe, type Tasting } from './brewing/model';
import { EventBus } from './events';
import type { Label } from './label';
import { BAR, BAR_BASE_SHARE, BAR_MIN_QUALITY, CLIENTS, glassPrice, kegGlasses, kegLiters, kegSpace, DEAL_BONUS, DEAL_PRICE, dealCost, LIKE_BONUS, LIKE_CHANCE, MAX_PENDING, ORDER_GAP_S, ORDER_LIFE_S, ORDER_MINUTES, ORDER_PREMIUM, qualityFactor, suits, variety, type Client } from './market';
import { Rng } from './rng';
import { executeStep } from './brewing/execution';
import { BREWERY_NAMES, CAPACITY, MAX_LEVEL, STATION_ORDER, stationDuration, upgradeCost, type StationId } from './stations';
import { CRATE, MAX_RANGE, slotCost, STORAGE } from './warehouse';
import { brandPopularity, gainPop, POP_DECAY, POP_PER_BOTTLE, POP_PER_GLASS, popTarget, TREND_COUNT, TREND_MAX_S, TREND_MIN_S, TRENDS, trendFactor, trendsOf, type Trend } from './trends';

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const BOTTLE_L = 0.33;
export const STARTING_MONEY = 250;

/** Prix des ingrédients (achetés automatiquement au lancement d'un brassin). */
export const PRICES = { maltKg: 1.5, hopsG: 0.05, yeastPer20L: 4, bottle: 0.25, keg: 1 };

/** Ce que remplit la ligne en fin de brassin : des bouteilles (stock, commandes) ou des fûts (bar). */
export type Format = 'bottle' | 'keg';

/** Brassin programmé : il partira dès que le moulin sera libre, dans l'ordre de la file. */
export interface PlannedBrew {
  beerId: number;
  format: Format;
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

/** Commande d'un client, reçue sur l'ordinateur du stockage : une mission à remplir avant son expiration. */
export interface Order {
  id: number;
  client: string;
  /** Bouteilles demandées. */
  qty: number;
  /** La commande exige le style préféré du client (et paie mieux). */
  like: boolean;
  /** Instant de réception (s de jeu). */
  received: number;
  /** Instant d'expiration (s de jeu). */
  expires: number;
}

/** Ce que rapporterait une commande remplie avec ces bières (prises dans l'ordre donné). */
export interface OrderQuote {
  /** Bouteilles prises à chaque bière. */
  take: { beer: Beer; n: number }[];
  filled: number;
  amount: number;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface OfflineReport {
  seconds: number;
  earned: number;
  sold: number;
  batches: number;
}

type StationState = { level: number };

/**
 * État complet d'une partie : une brasserie verticale de 7 appareils, des lots qui la traversent,
 * une gamme de bières, un bar qui les sert et des clients qui les commandent.
 */
export class Game {
  time = 0;
  money = STARTING_MONEY;
  rng = new Rng(0xbee12);
  readonly events = new EventBus();
  stations: Record<StationId, StationState> = Object.fromEntries(STATION_ORDER.map((id) => [id, { level: 1 }])) as Record<StationId, StationState>;
  /** Réglages actuels des appareils (la recette en cours de mise au point). */
  recipe: Recipe = { ...GASTON_RECIPE };
  /** Bière de la gamme dont les réglages sont chargés (null = réglages modifiés : on brasse un essai). */
  selectedBeer: number | null = null;
  /** Brassage continu : dès que le moulin est libre, on relance la bière de la gamme la moins en stock. */
  autoBrew = false;
  /** Essai demandé alors que le moulin était occupé : il passe avant le brassage continu. */
  queued = false;
  /** Format choisi pour le prochain brassin lancé à la main. */
  format: Format = 'bottle';
  /** Brassins programmés : ils passent avant le brassage continu. */
  plan: PlannedBrew[] = [];
  batches: Batch[] = [];
  /** Essai embouteillé qui attend d'être goûté, mis de côté pour ne pas bloquer la ligne. */
  trial: Batch | null = null;
  beers: Beer[] = [];
  /** Clients sous contrat : ils envoient des commandes sur l'ordinateur du stockage. */
  signed: string[] = [];
  /** Niveau de négociation de chaque contrat (0 à MAX_DEAL). */
  deals: Record<string, number> = {};
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
  barSold = 0;
  barRevenue = 0;
  /** Commandes en attente sur l'ordinateur. */
  orders: Order[] = [];
  /** Compte à rebours (s) avant la prochaine commande de chaque client. */
  orderTimers: Record<string, number> = {};
  ordersDone = 0;
  totalSold = 0;
  totalRevenue = 0;
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

  /** Un client peut être signé : assez de bouteilles vendues et une brasserie du bon niveau. */
  clientOpen(id: string): boolean {
    const c = clientById(id);
    return !!c && this.totalSold >= c.unlockSold && this.breweryLevel >= c.level;
  }

  /** Taille d'un brassin : le plus petit appareil fixe le volume. */
  get batchLiters(): number {
    return Math.min(...STATION_ORDER.map((id) => CAPACITY[this.level(id)] ?? 20));
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
   * (le brassage continu attend sinon, pour ne pas acheter d'ingrédients pour rien).
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

  /** Prochaine bière du brassage continu : celle de la gamme qui a le moins de bouteilles (en stock + en route). */
  nextAutoBeer(): Beer | undefined {
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

  /** Moulin occupé : le brassin partira dès qu'il se libère, avant le brassage continu. */
  queueBrew(): CommandResult {
    if (!this.batchAt('mill')) return this.brew();
    if (this.money < this.brewCost(this.recipe, this.batchLiters, this.brewFormat)) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    this.queued = true;
    return { ok: true };
  }

  /** Programme un brassin d'une bière de la gamme, en bouteilles ou en fûts. */
  planBrew(beerId: number, format: Format): CommandResult {
    if (!this.beers.some((b) => b.id === beerId)) return { ok: false, reason: 'Bière introuvable' };
    if (this.plan.length >= MAX_PLAN) return { ok: false, reason: `${MAX_PLAN} brassins programmés au plus` };
    this.plan.push({ beerId, format });
    return { ok: true };
  }

  unplan(index: number): void {
    this.plan.splice(index, 1);
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
    const cost = upgradeCost(id, lv + 1);
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    const before = this.breweryLevel;
    this.money -= cost;
    this.stations[id].level = lv + 1;
    this.events.emit({ type: 'upgraded', station: id, level: lv + 1 });
    if (this.breweryLevel > before) this.events.emit({ type: 'breweryLevel', level: this.breweryLevel });
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
      stock: 0, kegs: [], sold: 0, revenue: 0, label: { ...label }, pop: 0,
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
    if (!this.beers.length) this.autoBrew = false;
  }

  /** Signe un contrat avec un client débloqué : sa première commande arrive vite. */
  sign(id: string): CommandResult {
    const c = clientById(id);
    if (!c || this.signed.includes(id)) return { ok: false, reason: 'Déjà signé' };
    if (this.breweryLevel < c.level) return { ok: false, reason: `Ta brasserie doit d'abord passer au niveau ${c.level} (${BREWERY_NAMES[c.level - 1]})` };
    if (this.totalSold < c.unlockSold) return { ok: false, reason: `Vends d'abord ${c.unlockSold} bouteilles` };
    if (this.money < c.fee) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= c.fee;
    this.signed.push(id);
    this.orderTimers[id] = FIRST_ORDER_S;
    return { ok: true };
  }

  /** Prix de la prochaine négociation avec un client (null : impossible ou au maximum). */
  dealCost(id: string): number | null {
    const c = clientById(id);
    if (!c || !this.signed.includes(id)) return null;
    return dealCost(c, this.deals[id] ?? 0);
  }

  /** Négocie de plus grosses commandes avec un client sous contrat. */
  negotiate(id: string): CommandResult {
    const cost = this.dealCost(id);
    if (cost == null) return { ok: false, reason: 'Contrat déjà au maximum' };
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.deals[id] = (this.deals[id] ?? 0) + 1;
    return { ok: true };
  }

  /** Cadence maximale de la ligne (bouteilles/min) : un brassin par passage dans l'appareil le plus lent. */
  productionRate(r: Recipe = this.nextAutoBeer()?.recipe ?? this.recipe): number {
    const liters = this.batchLiters;
    const slowest = Math.max(...STATION_ORDER.map((id) => stationDuration(id, r, this.level(id), liters)));
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
    return this.bar.rate * (BAR_BASE_SHARE + (1 - BAR_BASE_SHARE) * this.brand) * variety(Math.max(1, beers));
  }

  /** Le bar a quelque chose à servir. */
  get barServing(): boolean {
    return this.flowing.length > 0;
  }

  /** Verres restant dans tous les fûts branchés. */
  get glassesLeft(): number {
    return this.flowing.reduce((s, t) => s + t.glasses, 0);
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

  /** Taille des commandes d'un client (bouteilles, par demi-caisses), selon la négociation. */
  orderSize(id: string): number {
    const c = clientById(id);
    if (!c) return 0;
    // la popularité de la marque grossit les commandes
    const n = c.rate * ORDER_MINUTES * (1 + DEAL_BONUS * (this.deals[id] ?? 0)) * (0.6 + 0.8 * this.brand);
    // jamais plus que ce que le stockage peut contenir (les trois quarts)
    return Math.max(6, Math.round(Math.min(n, this.storageCap * 0.75) / 6) * 6);
  }

  /** Bières de la gamme qui conviennent à une commande. */
  suitable(o: Order): Beer[] {
    const c = clientById(o.client);
    return c ? this.beers.filter((b) => suits(c, b.tasting, o.like)) : [];
  }

  /** Remplit la commande avec les bières choisies, dans l'ordre (sans rien prélever) : bouteilles et montant. */
  quote(o: Order, beerIds: number[]): OrderQuote {
    const c = clientById(o.client);
    const take: OrderQuote['take'] = [];
    let filled = 0;
    let amount = 0;
    if (!c) return { take, filled, amount };
    const ok = this.suitable(o);
    for (const id of beerIds) {
      const beer = ok.find((b) => b.id === id);
      if (!beer || filled >= o.qty) continue;
      const n = Math.min(beer.stock, o.qty - filled);
      if (n <= 0) continue;
      take.push({ beer, n });
      filled += n;
      amount += n * orderPrice(c, beer.tasting, o.like, this.deals[c.id] ?? 0);
    }
    return { take, filled, amount };
  }

  /** Montant maximal d'une commande (remplie avec des bières excellentes) : affiché sur l'ordinateur. */
  orderValue(o: Order): number {
    const c = clientById(o.client);
    return c ? o.qty * orderPrice(c, { quality: 1 }, o.like, this.deals[c.id] ?? 0) : 0;
  }

  /** Envoie une commande remplie avec les bières choisies : on est payé tout de suite. */
  fulfill(orderId: number, beerIds: number[]): CommandResult & { amount?: number } {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return { ok: false, reason: 'Commande introuvable' };
    const q = this.quote(o, beerIds);
    if (q.filled < o.qty) return { ok: false, reason: `Il manque ${o.qty - q.filled} bouteilles` };
    for (const { beer, n } of q.take) {
      beer.stock -= n;
      beer.sold += n;
      beer.revenue += (n / q.filled) * q.amount;
      beer.pop = gainPop(beer.pop, popTarget(beer.tasting, this.trends), n, POP_PER_BOTTLE);
    }
    this.totalSold += q.filled;
    this.totalRevenue += q.amount;
    this.money += q.amount;
    this.ordersDone++;
    this.orders = this.orders.filter((x) => x !== o);
    this.events.emit({ type: 'sale', amount: q.amount });
    return { ok: true, amount: q.amount };
  }

  /** Refuser une commande : le client en enverra une autre plus tard. */
  declineOrder(orderId: number): CommandResult {
    const before = this.orders.length;
    this.orders = this.orders.filter((x) => x.id !== orderId);
    return before === this.orders.length ? { ok: false, reason: 'Commande introuvable' } : { ok: true };
  }

  /** Commandes qu'on peut remplir tout de suite avec le stock. */
  get readyOrders(): Order[] {
    return this.orders.filter((o) => this.suitable(o).reduce((s, b) => s + b.stock, 0) >= o.qty);
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
    // De l'aval vers l'amont : un appareil se libère avant que le lot précédent n'y entre.
    const sorted = [...this.batches].sort((a, b) => b.stage - a.stage);
    for (const b of sorted) this.advance(b, dt);
    if (!this.batchAt('mill')) {
      const next = this.plan[0];
      const planned = next && this.beer(next.beerId);
      if (this.queued) {
        this.queued = false;
        this.brew();
      } else if (planned && next) {
        // brassin programmé : il attend l'argent et la place nécessaires
        if ((this.money >= this.brewCost(planned.recipe, this.batchLiters, next.format) || this.broke) && this.roomFor(next.format)) {
          this.plan.shift();
          this.launch(planned.recipe, planned.id, next.format);
        }
      } else if (this.autoBrew && this.roomForBatch) {
        const beer = this.nextAutoBeer();
        if (beer && (this.money >= this.brewCost(beer.recipe) || this.broke)) this.launch(beer.recipe, beer.id);
      }
    }
    this.sellBar(dt);
    this.tickOrders(dt);
    this.tickTrends();
    // sans ventes, la popularité s'érode doucement
    const keep = Math.exp(-POP_DECAY * dt);
    for (const b of this.beers) b.pop *= keep;
    this.announce();
  }

  private advance(b: Batch, dt: number): void {
    if (!b.waiting) {
      // Essai : la ligne remplit une seule bouteille, puis attend que le joueur la goûte et décide.
      if (this.awaitingTaste(b)) {
        b.elapsed = Math.min(b.elapsed + dt, b.duration / Math.max(1, b.bottles ?? 1));
        return;
      }
      b.elapsed += dt;
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
    if (this.batches.some((o) => o.stage === next)) return; // appareil suivant occupé
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
    if (!this.barServing) return;
    this.barDemand = Math.min(2, this.barDemand + (this.barRate / 60) * dt);
    let earned = 0;
    while (this.barDemand >= 1) {
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
      const price = glassPrice(this.barLevel, beer.tasting, this.trendsOf(beer).length);
      tap.glasses--;
      beer.sold++;
      beer.revenue += price;
      beer.pop = gainPop(beer.pop, popTarget(beer.tasting, this.trends), 1, POP_PER_GLASS);
      this.totalSold++;
      this.totalRevenue += price;
      this.barSold++;
      this.barRevenue += price;
      this.money += price;
      earned += price;
      this.barDemand--;
    }
    if (earned > 0) this.events.emit({ type: 'sale', amount: earned });
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

  /** Les clients sous contrat envoient ponctuellement des commandes ; elles expirent si on ne les remplit pas. */
  private tickOrders(dt: number): void {
    if (this.orders.some((o) => o.expires <= this.time)) {
      for (const o of this.orders) if (o.expires <= this.time) this.events.emit({ type: 'orderExpired', client: o.client });
      this.orders = this.orders.filter((o) => o.expires > this.time);
    }
    for (const id of this.signed) {
      const c = clientById(id);
      if (!c || this.orders.filter((o) => o.client === id).length >= MAX_PENDING) continue;
      const left = (this.orderTimers[id] ?? FIRST_ORDER_S) - dt;
      this.orderTimers[id] = left;
      if (left > 0) continue;
      // une marque populaire reçoit des commandes plus souvent
      this.orderTimers[id] = (ORDER_GAP_S * (0.7 + 0.6 * this.rng.next())) / (0.6 + 0.8 * this.brand);
      const like = !!c.likes && this.rng.next() < LIKE_CHANCE;
      this.orders.push({ id: this.nextId++, client: id, qty: this.orderSize(id), like, received: this.time, expires: this.time + ORDER_LIFE_S });
      this.events.emit({ type: 'order', client: id });
    }
  }

  private announce(): void {
    for (const c of CLIENTS) {
      if (this.signed.includes(c.id) || this.announced.has(c.id) || !this.clientOpen(c.id)) continue;
      this.announced.add(c.id);
      this.events.emit({ type: 'clientAvailable', id: c.id });
    }
  }

  // ------------------------------------------------------------------ sauvegarde

  toJSON() {
    return {
      version: 6, time: this.time, money: this.money, rng: this.rng.state, stations: this.stations, recipe: this.recipe,
      selectedBeer: this.selectedBeer, autoBrew: this.autoBrew, batches: this.batches, trial: this.trial, beers: this.beers,
      queued: this.queued, signed: this.signed, deals: this.deals, rangeSlots: this.rangeSlots, storageLevel: this.storageLevel, barLevel: this.barLevel, taps: this.taps, barDemand: this.barDemand, trends: this.trends, plan: this.plan, format: this.format,
      barSold: this.barSold, barRevenue: this.barRevenue, orders: this.orders, orderTimers: this.orderTimers, ordersDone: this.ordersDone, totalSold: this.totalSold, totalRevenue: this.totalRevenue, batchesDone: this.batchesDone,
      nextId: this.nextId, tips: this.tips, offline: this.offline, announced: [...this.announced],
    };
  }

  static fromJSON(raw: unknown): Game {
    const s = raw as Omit<ReturnType<Game['toJSON']>, 'version'> & { version: number };
    if (!s || s.version < 2 || s.version > 6) throw new Error('Sauvegarde incompatible');
    const g = new Game();
    const { demand: _demand, ...rest } = s as typeof s & { demand?: unknown };
    Object.assign(g, { ...rest, rng: new Rng(s.rng), announced: new Set(s.announced) });
    // Sauvegardes v2 : places de gamme liées aux distributeurs, pas encore de stockage.
    if (s.version === 2) {
      g.rangeSlots = Math.max(1, g.beers.length);
      g.storageLevel = 1;
    }
    // Avant la v4, il n'y avait que 3 niveaux d'appareils : ils deviennent les niveaux 2 à 4.
    if (s.version < 4) for (const id of STATION_ORDER) g.stations[id] = { level: Math.min(MAX_LEVEL, (g.stations[id]?.level ?? 1) + 1) };
    // Avant la v5, le « Bar du coin » était un distributeur : il devient la pièce Bar, et les ventes passent par des commandes.
    if (s.version < 5) {
      g.signed = g.signed.filter((id) => CLIENTS.some((c) => c.id === id));
      for (const id of g.signed) g.orderTimers[id] = FIRST_ORDER_S;
      delete g.deals.bar;
      g.barLevel = 1;
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
    g.format ??= 'bottle';
    g.orders ??= [];
    g.orderTimers ??= {};
    g.queued ??= false;
    g.deals ??= {};
    g.trial ??= null;
    return g;
  }
}

/** Première commande d'un client tout juste signé (s de jeu). */
export const FIRST_ORDER_S = 20;
/** Brassins programmés au plus. */
export const MAX_PLAN = 6;

export const clientById = (id: string): Client | undefined => CLIENTS.find((c) => c.id === id);

/** Prix d'une bouteille livrée pour une commande. */
export function orderPrice(c: Client, t: Pick<Tasting, 'quality'>, like: boolean, deal = 0): number {
  return c.price * qualityFactor(t) * ORDER_PREMIUM * (like ? LIKE_BONUS : 1) * (1 + DEAL_PRICE * deal);
}

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
    batches: game.batchesDone - done + (prev?.batches ?? 0),
  };
  // Le coût des brassins automatiques lancés pendant l'absence est déjà déduit des gains.
  if (earned < 0) game.money += earned;
  return game.offline;
}
