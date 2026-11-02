import { brew, GASTON_RECIPE, DRINKABLE_MIN, REF_LITERS, type Actual, type Levels, type Recipe, type Tasting } from './brewing/model';
import { EventBus } from './events';
import type { Label } from './label';
import { bottlePrice, DISTRIBUTORS } from './market';
import { Rng } from './rng';
import { CAPACITY, PRECISION, STATION_ORDER, STATIONS, stationDuration, type StationId } from './stations';
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
  /** Relancer automatiquement la bière sélectionnée dès que le moulin est libre. */
  autoBrew = false;
  batches: Batch[] = [];
  beers: Beer[] = [];
  signed: string[] = ['bar'];
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
    if (this.money < this.brewCost()) return { ok: false, reason: 'Pas assez d\'argent pour les ingrédients' };
    return { ok: true };
  }

  // ------------------------------------------------------------------ commandes

  /** Lance un brassin avec les réglages actuels des appareils. */
  brew(): CommandResult {
    const can = this.canBrew();
    if (!can.ok) return can;
    const liters = this.batchLiters;
    this.money -= this.brewCost(this.recipe, liters);
    const batch: Batch = {
      id: this.nextId++, recipe: { ...this.recipe }, beerId: this.selectedBeer, liters,
      stage: 0, elapsed: 0, duration: 0, waiting: false, actual: {},
    };
    this.enter(batch, 0);
    this.batches.push(batch);
    return { ok: true };
  }

  setParam<K extends keyof Recipe>(key: K, value: Recipe[K]): void {
    this.recipe[key] = value;
    const beer = this.beers.find((b) => b.id === this.selectedBeer);
    if (beer && beer.recipe[key] !== value) {
      this.selectedBeer = null;
      this.autoBrew = false;
    }
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
    if (lv >= 3) return { ok: false, reason: 'Niveau maximal' };
    if (this.batchAt(id)) return { ok: false, reason: 'Attends que l\'appareil soit vide' };
    const cost = STATIONS[id].upgradeCost[lv - 1]!;
    if (this.money < cost) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= cost;
    this.stations[id].level = lv + 1;
    this.events.emit({ type: 'upgraded', station: id, level: lv + 1 });
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

  /** Essai en cours d'embouteillage dont la première bouteille est sortie : on peut le goûter. */
  get tastable(): Batch | undefined {
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
    return { ok: true };
  }

  /** Recommencer : l'essai est jeté, l'embouteillage se libère. */
  discardTrial(): CommandResult {
    const b = this.tastable ?? this.batchAt('bottling');
    if (!b || b.beerId != null) return { ok: false, reason: 'Aucun essai à jeter' };
    this.batches = this.batches.filter((x) => x !== b);
    return { ok: true };
  }

  setLabel(beerId: number, label: Label): void {
    const beer = this.beers.find((b) => b.id === beerId);
    if (beer) beer.label = { ...label };
  }

  removeBeer(id: number): void {
    this.beers = this.beers.filter((b) => b.id !== id);
    if (this.selectedBeer === id) {
      this.selectedBeer = null;
      this.autoBrew = false;
    }
  }

  /** Signe un contrat avec un distributeur débloqué. */
  sign(id: string): CommandResult {
    const d = DISTRIBUTORS.find((x) => x.id === id);
    if (!d || this.signed.includes(id)) return { ok: false, reason: 'Déjà signé' };
    if (this.totalSold < d.unlockSold) return { ok: false, reason: `Vends d'abord ${d.unlockSold} bouteilles` };
    if (this.money < d.fee) return { ok: false, reason: 'Pas assez d\'argent' };
    this.money -= d.fee;
    this.signed.push(id);
    return { ok: true };
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
    if (this.autoBrew && this.selectedBeer != null && this.roomForBatch && this.canBrew().ok) this.brew();
    this.sell(dt);
    this.announce();
  }

  private advance(b: Batch, dt: number): void {
    if (!b.waiting) {
      b.elapsed += dt;
      if (b.elapsed < b.duration) return;
      b.waiting = true;
    }
    const next = b.stage + 1;
    if (next >= STATION_ORDER.length) {
      // Un essai attend la décision du joueur (garder ou recommencer) avant de sortir de la ligne.
      if (b.beerId == null) return;
      return this.store(b);
    }
    if (this.batches.some((o) => o.stage === next)) return; // appareil suivant occupé
    this.enter(b, next);
  }

  /** Entrée d'un lot dans un appareil : la température réelle dépend de la précision de l'appareil. */
  private enter(b: Batch, stage: number): void {
    const id = STATION_ORDER[stage]!;
    const lv = this.level(id);
    const noise = () => (this.rng.next() * 2 - 1) * (PRECISION[lv] ?? 2);
    const r = b.recipe;
    if (id === 'mash') b.actual.mashTemp = r.mashTemp + noise();
    if (id === 'cooler') {
      b.actual.pitchTemp = r.pitchTemp + noise();
      b.actual.infectionRoll = this.rng.next();
    }
    if (id === 'fermenter') b.actual.fermentTemp = r.fermentTemp + noise();
    if (id === 'conditioning') b.actual.gardeTemp = r.gardeTemp + noise();
    b.stage = stage;
    b.elapsed = 0;
    b.waiting = false;
    if (id === 'bottling') {
      b.tasting = brew(r, this.levels, b.actual as Actual);
      b.bottles = Math.floor((b.liters / BOTTLE_L) * (1 - b.tasting.lost));
    }
    b.duration = stationDuration(id, r, lv, b.bottles != null ? b.bottles * BOTTLE_L : b.liters);
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
    if (beer) beer.tasting = tasting;
    this.events.emit({ type: 'batchDone', beerId: beer?.id ?? null, bottles });
  }

  /** Lot bloqué en fin de ligne faute de place dans le stockage. */
  get bottlingBlocked(): boolean {
    const b = this.batchAt('bottling');
    return !!b && b.waiting && b.beerId != null && this.storageFull;
  }

  /** Les distributeurs achètent en continu les bières de la gamme qui leur conviennent. */
  private sell(dt: number): void {
    let earned = 0;
    for (const id of this.signed) {
      const d = DISTRIBUTORS.find((x) => x.id === id);
      if (!d) continue;
      this.demand[id] = Math.min(5, (this.demand[id] ?? 0) + (d.rate / 60) * dt);
      while ((this.demand[id] ?? 0) >= 1) {
        let best: Beer | undefined;
        let bestPrice = 0;
        for (const beer of this.beers) {
          if (beer.stock <= 0 || beer.tasting.quality < d.minQuality) continue;
          const p = bottlePrice(d, beer.tasting);
          if (p > bestPrice) {
            best = beer;
            bestPrice = p;
          }
        }
        if (!best) break;
        best.stock--;
        best.sold++;
        best.revenue += bestPrice;
        this.totalSold++;
        this.totalRevenue += bestPrice;
        this.money += bestPrice;
        earned += bestPrice;
        this.demand[id]! -= 1;
      }
    }
    if (earned > 0) this.events.emit({ type: 'sale', amount: earned });
  }

  private announce(): void {
    for (const d of DISTRIBUTORS) {
      if (this.signed.includes(d.id) || this.announced.has(d.id) || this.totalSold < d.unlockSold) continue;
      this.announced.add(d.id);
      this.events.emit({ type: 'distributorAvailable', id: d.id });
    }
  }

  // ------------------------------------------------------------------ sauvegarde

  toJSON() {
    return {
      version: 3, time: this.time, money: this.money, rng: this.rng.state, stations: this.stations, recipe: this.recipe,
      selectedBeer: this.selectedBeer, autoBrew: this.autoBrew, batches: this.batches, beers: this.beers,
      signed: this.signed, rangeSlots: this.rangeSlots, storageLevel: this.storageLevel, totalSold: this.totalSold, totalRevenue: this.totalRevenue, batchesDone: this.batchesDone,
      nextId: this.nextId, demand: this.demand, tips: this.tips, offline: this.offline, announced: [...this.announced],
    };
  }

  static fromJSON(raw: unknown): Game {
    const s = raw as Omit<ReturnType<Game['toJSON']>, 'version'> & { version: number };
    if (!s || (s.version !== 2 && s.version !== 3)) throw new Error('Sauvegarde incompatible');
    const g = new Game();
    Object.assign(g, { ...s, rng: new Rng(s.rng), announced: new Set(s.announced) });
    // Sauvegardes v2 : places de gamme liées aux distributeurs, pas encore de stockage.
    if (s.version === 2) {
      g.rangeSlots = Math.max(1, g.beers.length);
      g.storageLevel = 1;
    }
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
