import { brew, GASTON_RECIPE, DRINKABLE_MIN, REF_LITERS, type Actual, type Levels, type Recipe, type Tasting } from './brewing/model';
import { EventBus } from './events';
import type { Label } from './label';
import { bottlePrice, DEAL_BONUS, dealCost, DISTRIBUTORS, variety } from './market';
import { Rng } from './rng';
import { executeStep } from './brewing/execution';
import { BREWERY_NAMES, CAPACITY, MAX_LEVEL, STATION_ORDER, stationDuration, upgradeCost, type StationId } from './stations';
import { CRATE, MAX_RANGE, slotCost, STORAGE } from './warehouse';

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const BOTTLE_L = 0.33;
export const STARTING_MONEY = 250;

/** Prix des ingrédients (achetés automatiquement au lancement d'un brassin). */
export const PRICES = { maltKg: 1.5, hopsG: 0.05, yeastPer20L: 4, bottle: 0.25 };

export interface Beer {
  id: number;
  name: string;
  recipe: Recipe;
  /** Dégustation du dernier lot produit. */
  tasting: Tasting;
  stock: number;
  sold: number;
  revenue: number;
  label: Label;
}

export interface Batch {
  id: number;
  recipe: Recipe;
  /** Bière de la gamme brassée, ou null pour un essai. */
  beerId: number | null;
  liters: number;
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
  /** Bouteilles déjà rangées dans le stockage (le lot attend tant que le stockage est plein). */
  delivered?: number;
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
 * une gamme de bières et des distributeurs qui les achètent.
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
  batches: Batch[] = [];
  /** Essai embouteillé qui attend d'être goûté, mis de côté pour ne pas bloquer la ligne. */
  trial: Batch | null = null;
  beers: Beer[] = [];
  signed: string[] = ['bar'];
  /** Niveau de négociation de chaque contrat (0 à MAX_DEAL). */
  deals: Record<string, number> = {};
  /** Places achetées sur l'étagère de la gamme. */
  rangeSlots = 1;
  /** Niveau du stockage (1 à STORAGE.length). */
  storageLevel = 1;
  totalSold = 0;
  totalRevenue = 0;
  batchesDone = 0;
  nextId = 1;
  /** Demande accumulée de chaque distributeur (bouteilles). */
  demand: Record<string, number> = {};
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

  /** Un distributeur peut être signé : assez de bouteilles vendues et une brasserie du bon niveau. */
  distributorOpen(id: string): boolean {
    const d = DISTRIBUTORS.find((x) => x.id === id);
    return !!d && this.totalSold >= d.unlockSold && this.breweryLevel >= d.level;
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

  /** Bouteilles en stock, toutes bières confondues. */
  get stored(): number {
    return this.beers.reduce((s, b) => s + b.stock, 0);
  }

  /**
   * Le stockage pourra accueillir un brassin de plus, en comptant ceux déjà sur la ligne
   * (le brassage continu attend sinon, pour ne pas acheter d'ingrédients pour rien).
   */
  get roomForBatch(): boolean {
    const pending = this.batches.reduce((s, b) => s + (b.beerId != null ? Math.floor(b.liters / BOTTLE_L) - (b.delivered ?? 0) : 0), 0);
    // Un brassin plus gros que tout le stockage peut quand même partir quand tout est vide : il se rangera au fil des ventes.
    if (this.stored + pending === 0) return true;
    return this.stored + pending + Math.floor(this.batchLiters / BOTTLE_L) <= this.storageCap;
  }

  get storageFull(): boolean {
    return this.stored >= this.storageCap;
  }

  /** Coût des ingrédients d'un brassin. */
  brewCost(r: Recipe = this.recipe, liters = this.batchLiters): number {
    const k = liters / REF_LITERS;
    const bottles = Math.floor(liters / BOTTLE_L);
    return r.grainKg * k * PRICES.maltKg + (r.hopsBitter + r.hopsAroma) * k * PRICES.hopsG + Math.ceil(k) * PRICES.yeastPer20L + bottles * PRICES.bottle;
  }

  /** Lot présent dans un appareil. */
  batchAt(id: StationId): Batch | undefined {
    const i = STATION_ORDER.indexOf(id);
    return this.batches.find((b) => b.stage === i);
  }

  canBrew(): CommandResult {
    if (this.batchAt('mill')) return { ok: false, reason: 'Le moulin est occupé' };
    if (this.money < this.brewCost() && !this.broke) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    return { ok: true };
  }

  /**
   * Plus d'argent, rien en stock ni en cours : la partie serait bloquée. Gaston avance alors les ingrédients
   * (le brassin est gratuit) pour que le joueur puisse toujours repartir.
   */
  get broke(): boolean {
    return this.money < this.brewCost() && this.stored === 0 && this.batches.length === 0;
  }

  /** Bouteilles d'une bière encore sur la ligne (pas encore rangées). */
  pendingBottles(beerId: number): number {
    return this.batches.reduce((s, b) => s + (b.beerId === beerId ? Math.floor(b.liters / BOTTLE_L) - (b.delivered ?? 0) : 0), 0);
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
    this.launch(this.recipe, this.selectedBeer);
    return { ok: true };
  }

  /** Moulin occupé : le brassin partira dès qu'il se libère, avant le brassage continu. */
  queueBrew(): CommandResult {
    if (!this.batchAt('mill')) return this.brew();
    if (this.money < this.brewCost()) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    this.queued = true;
    return { ok: true };
  }

  private launch(recipe: Recipe, beerId: number | null): void {
    const liters = this.batchLiters;
    this.money = Math.max(0, this.money - this.brewCost(recipe, liters));
    const batch: Batch = {
      id: this.nextId++, recipe: { ...recipe }, beerId, liters,
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
      stock: 0, sold: 0, revenue: 0, label: { ...label },
    };
    this.beers.push(beer);
    b.beerId = beer.id;
    if (sameRecipe(this.recipe, beer.recipe)) this.selectedBeer = beer.id;
    if (b === this.trial) {
      // L'essai était déjà sorti de la ligne : ses bouteilles vont directement au stockage.
      this.trial = null;
      beer.stock += b.bottles ?? 0;
      this.batchesDone++;
      this.events.emit({ type: 'batchDone', beerId: beer.id, bottles: b.bottles ?? 0 });
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
    if (this.selectedBeer === id) this.selectedBeer = null;
    if (!this.beers.length) this.autoBrew = false;
  }

  /** Signe un contrat avec un distributeur débloqué. */
  sign(id: string): CommandResult {
    const d = DISTRIBUTORS.find((x) => x.id === id);
    if (!d || this.signed.includes(id)) return { ok: false, reason: 'Déjà signé' };
    if (this.breweryLevel < d.level) return { ok: false, reason: `Ta brasserie doit d'abord passer au niveau ${d.level} (${BREWERY_NAMES[d.level - 1]})` };
    if (this.totalSold < d.unlockSold) return { ok: false, reason: `Vends d'abord ${d.unlockSold} bouteilles` };
    if (this.money < d.fee) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= d.fee;
    this.signed.push(id);
    return { ok: true };
  }

  /** Prix de la prochaine négociation avec un distributeur (null : impossible ou au maximum). */
  dealCost(id: string): number | null {
    const d = DISTRIBUTORS.find((x) => x.id === id);
    if (!d || !this.signed.includes(id)) return null;
    return dealCost(d, this.deals[id] ?? 0);
  }

  /** Négocie un plus gros volume avec un distributeur sous contrat. */
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

  /** Commandes totales de tous les distributeurs sous contrat (bouteilles/min). */
  get demandRate(): number {
    return this.signed.reduce((s, id) => s + this.orderRate(id), 0);
  }

  /** Bouteilles par minute que commande un distributeur, avec la gamme actuelle. */
  orderRate(id: string): number {
    const d = DISTRIBUTORS.find((x) => x.id === id);
    if (!d) return 0;
    const accepted = this.beers.filter((b) => b.tasting.quality >= d.minQuality).length;
    return d.rate * variety(accepted) * (1 + DEAL_BONUS * (this.deals[id] ?? 0));
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
      if (this.queued) {
        this.queued = false;
        this.brew();
      } else if (this.autoBrew && this.roomForBatch) {
        const beer = this.nextAutoBeer();
        if (beer && this.money >= this.brewCost(beer.recipe)) this.launch(beer.recipe, beer.id);
      }
    }
    this.sell(dt);
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
      b.bottles = Math.floor((b.liters / BOTTLE_L) * (1 - b.tasting.lost));
    }
    b.duration = stationDuration(id, r, lv, b.bottles != null ? b.bottles * BOTTLE_L : b.liters);
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
    const bottles = tasting.quality >= DRINKABLE_MIN ? (b.bottles ?? Math.floor((b.liters / BOTTLE_L) * (1 - tasting.lost))) : 0;
    const beer = this.beers.find((x) => x.id === b.beerId);
    if (beer && (b.delivered ?? 0) < bottles) {
      const n = Math.min(bottles - (b.delivered ?? 0), Math.max(0, this.storageCap - this.stored));
      beer.stock += n;
      b.delivered = (b.delivered ?? 0) + n;
      if (b.delivered < bottles) return;
    }
    this.batches = this.batches.filter((x) => x !== b);
    this.batchesDone++;
    // Un lot imbuvable est jeté ; sinon la bière prend la dégustation de son dernier lot (le matériel fait varier la qualité).
    if (beer && tasting.quality >= DRINKABLE_MIN) beer.tasting = tasting;
    if (beer && tasting.quality < DRINKABLE_MIN) this.events.emit({ type: 'batchRuined', beerId: beer.id });
    else this.events.emit({ type: 'batchDone', beerId: beer?.id ?? null, bottles });
  }

  /** Lot bloqué en fin de ligne faute de place dans le stockage. */
  get bottlingBlocked(): boolean {
    const b = this.batchAt('bottling');
    return !!b && b.waiting && b.beerId != null && this.storageFull;
  }

  /**
   * Les distributeurs passent commande en continu, par lots (1 bouteille pour le bar, des palettes pour le supermarché).
   * Une commande part dès qu'une bière qui leur convient en a assez en stock : celle dont on a le plus.
   * Plus la gamme compte de bières qui leur plaisent, plus ils commandent (variété).
   */
  private sell(dt: number): void {
    let earned = 0;
    for (const id of this.signed) {
      const d = DISTRIBUTORS.find((x) => x.id === id);
      if (!d) continue;
      const accepted = this.beers.filter((b) => b.tasting.quality >= d.minQuality);
      if (!accepted.length) continue;
      const rate = this.orderRate(id);
      this.demand[id] = Math.min(d.order * 2, (this.demand[id] ?? 0) + (rate / 60) * dt);
      while ((this.demand[id] ?? 0) >= d.order) {
        let best: Beer | undefined;
        for (const beer of accepted) if (beer.stock >= d.order && (!best || beer.stock > best.stock)) best = beer;
        if (!best) break;
        const price = bottlePrice(d, best.tasting) * d.order;
        best.stock -= d.order;
        best.sold += d.order;
        best.revenue += price;
        this.totalSold += d.order;
        this.totalRevenue += price;
        this.money += price;
        earned += price;
        this.demand[id]! -= d.order;
      }
    }
    if (earned > 0) this.events.emit({ type: 'sale', amount: earned });
  }

  private announce(): void {
    for (const d of DISTRIBUTORS) {
      if (this.signed.includes(d.id) || this.announced.has(d.id) || !this.distributorOpen(d.id)) continue;
      this.announced.add(d.id);
      this.events.emit({ type: 'distributorAvailable', id: d.id });
    }
  }

  // ------------------------------------------------------------------ sauvegarde

  toJSON() {
    return {
      version: 4, time: this.time, money: this.money, rng: this.rng.state, stations: this.stations, recipe: this.recipe,
      selectedBeer: this.selectedBeer, autoBrew: this.autoBrew, batches: this.batches, trial: this.trial, beers: this.beers,
      queued: this.queued, signed: this.signed, deals: this.deals, rangeSlots: this.rangeSlots, storageLevel: this.storageLevel, totalSold: this.totalSold, totalRevenue: this.totalRevenue, batchesDone: this.batchesDone,
      nextId: this.nextId, demand: this.demand, tips: this.tips, offline: this.offline, announced: [...this.announced],
    };
  }

  static fromJSON(raw: unknown): Game {
    const s = raw as Omit<ReturnType<Game['toJSON']>, 'version'> & { version: number };
    if (!s || s.version < 2 || s.version > 4) throw new Error('Sauvegarde incompatible');
    const g = new Game();
    Object.assign(g, { ...s, rng: new Rng(s.rng), announced: new Set(s.announced) });
    // Sauvegardes v2 : places de gamme liées aux distributeurs, pas encore de stockage.
    if (s.version === 2) {
      g.rangeSlots = Math.max(1, g.beers.length);
      g.storageLevel = 1;
    }
    // Avant la v4, il n'y avait que 3 niveaux d'appareils : ils deviennent les niveaux 2 à 4.
    if (s.version < 4) for (const id of STATION_ORDER) g.stations[id] = { level: Math.min(MAX_LEVEL, (g.stations[id]?.level ?? 1) + 1) };
    g.queued ??= false;
    g.deals ??= {};
    g.trial ??= null;
    return g;
  }
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
