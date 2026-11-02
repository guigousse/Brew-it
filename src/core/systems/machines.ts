import type { BatchProfile } from '../brewing/batches';
import { boil, ferment, mash, TIME_SCALE } from '../brewing/profile';
import { Alert, countItems, num, takeItems, type Building, type FluidTank, type MachineState } from '../building';
import { BUILDINGS, type BuildingDef, type MachineKind } from '../content/buildings';
import type { FluidId } from '../content/fluids';
import { BOTTLE_LITERS, HOPS_GRAMS_PER_ITEM, type ItemId } from '../content/items';
import { YEAST_DEATH_TEMP, type StrainId } from '../content/strains';
import { fermentTempFor } from '../brewing/recipe';
import { appeal, ITEM_PRICES, salePrice } from '../economy/market';
import { approach } from '../math';
import type { World } from '../world';
import { drain, mixInto } from './fluids';

/** Durée d'affichage d'un échec avant que la machine ne reprenne. */
const FAILED_COOLDOWN = 3;
const BOIL_TEMP = 100;
/** Réglages fixes (le joueur ne choisit que l'essentiel). */
export const FIXED = {
  waterL: 24, // eau d'empâtage fixe : la quantité de malt règle donc la force de la bière
  mashTimeMin: 60,
  boilTimeMin: 60,
  mashHeatRate: 1.5, // °C/s
  boilHeatRate: 2,
  /** Un lot démarre quand le liquide d'entrée n'a plus bougé pendant ce délai (s)… */
  settleSeconds: 2,
  /** … et qu'il y en a au moins ce volume (L). */
  minBatchLiters: 5,
};
export const CRATE_SIZE = 12;
const CRATE_TRIP_SECONDS = 4;

type MachineUpdate = (world: World, b: Building, m: MachineState, dt: number) => void;

const setPhase = (m: MachineState, phase: MachineState['phase'], duration = 0) => {
  m.phase = phase;
  m.timer = 0;
  m.duration = duration;
};

export const waterFor = (_grainKg: number) => FIXED.waterL;

const defOf = (b: Building) => BUILDINGS[b.type] as BuildingDef;
const scaleOf = (b: Building) => defOf(b).batchScale ?? 1;
const speedOf = (b: Building) => defOf(b).speed ?? 1;
/** Volume de moût de référence d'un lot ×1 (24 L d'eau − absorption du grain). */
const REF_BATCH_L = 19;
/** Houblon nécessaire pour un volume de moût donné (la dose de la recette vaut pour 19 L). */
export const hopsFor = (hopsItems: number, liters: number) => Math.max(hopsItems, Math.round((hopsItems * liters) / REF_BATCH_L));
/** Un sachet de levure pour 25 L. */
export const yeastFor = (liters: number) => Math.max(1, Math.ceil(liters / 25 - 1e-9));

const outputFits = (b: Building, fluid: FluidId, amount: number): boolean => {
  const tank = b.fluid!;
  const cap = (BUILDINGS[b.type] as { fluid: { capacity: number } }).fluid.capacity;
  return (tank.fluid === null || tank.fluid === fluid) && tank.amount + amount <= cap + 1e-6;
};

const outputItemsFull = (b: Building): boolean => b.itemsOut!.length >= defOf(b).itemsOut!.capacity;

/**
 * Le liquide d'entrée est-il prêt ? Vrai quand le réservoir est plein, ou quand il contient
 * un lot raisonnable et que plus rien n'arrive. Ainsi chaque machine traite le lot entier
 * venu de l'étape précédente, sans que le joueur ait à régler des volumes.
 */
function inputSettled(m: MachineState, tank: FluidTank, capacity: number, dt: number): boolean {
  if (tank.amount >= capacity - 1e-6) return true;
  if (!m.settle || Math.abs(m.settle.amount - tank.amount) > 1e-6) {
    m.settle = { amount: tank.amount, t: 0 };
    return false;
  }
  m.settle.t += dt;
  return tank.amount >= FIXED.minBatchLiters && m.settle.t >= FIXED.settleSeconds;
}

function fail(world: World, b: Building, m: MachineState, reason: string) {
  b.alerts |= Alert.BatchLost;
  world.events.emit({ type: 'batchLost', buildingId: b.id, reason });
  m.batch = null;
  setPhase(m, 'failed', FAILED_COOLDOWN);
}

function heatTo(m: MachineState, target: number, rate: number, dt: number): boolean {
  m.temp = approach(m.temp ?? target, target, rate * dt);
  return Math.abs(m.temp - target) < 0.5;
}

function tickFailed(m: MachineState, dt: number) {
  if (m.phase !== 'failed') return;
  m.timer += dt;
  if (m.timer >= m.duration) setPhase(m, 'filling');
}

/** Phase commune « traitement terminé » → tentative de sortie au tick suivant. */
function advanceProcessing(m: MachineState, dt: number) {
  m.timer += dt;
  if (m.timer >= m.duration) m.phase = 'blocked';
}

/** Le brassin d'un lot (celui qui l'a lancé), à défaut le brassin actif. */
function recipeOf(world: World, p: BatchProfile | undefined) {
  return world.recipes.find((r) => r.id === p?.recipeId) ?? world.activeRecipe;
}

export function emptyProfile(): BatchProfile {
  return { og: 0, fermentability: 0.75, ibu: 0, abv: 0, fruity: 0, quality: 1, strain: null, gardeDays: 0 };
}

const MACHINES: Record<MachineKind, MachineUpdate> = {
  water_tap(_world, b, _m, dt) {
    const tank = b.fluid!;
    const cap = defOf(b).fluid!.capacity;
    const add = Math.min(num(b, 'rate') * dt, cap - tank.amount);
    if (add > 0) {
      tank.fluid = 'water';
      tank.temp = tank.amount > 0 ? (tank.temp * tank.amount + num(b, 'temp') * add) / (tank.amount + add) : num(b, 'temp');
      tank.amount += add;
    }
  },

  supplier(world, b, m, dt) {
    const item = String(b.params.item) as ItemId;
    const price = ITEM_PRICES[item] ?? 1;
    if (outputItemsFull(b)) return;
    m.timer += dt;
    if (m.timer < num(b, 'interval')) return;
    if (world.money < price) {
      b.alerts |= Alert.NoMoney;
      return;
    }
    b.alerts &= ~Alert.NoMoney;
    world.money -= price;
    m.timer = 0;
    b.itemsOut!.push({ item, batch: null });
  },

  mill(_world, b, m, dt) {
    if (countItems(b.itemsIn!, 'malt') === 0 || outputItemsFull(b)) {
      m.phase = 'idle';
      return;
    }
    m.phase = 'processing';
    m.duration = num(b, 'interval');
    m.timer += dt;
    if (m.timer >= m.duration) {
      m.timer = 0;
      takeItems(b.itemsIn!, 'malt', 1);
      b.itemsOut!.push({ item: 'crushed_malt', batch: null });
    }
  },

  mash_tun(world, b, m, dt) {
    switch (m.phase) {
      case 'idle':
      case 'filling': {
        m.phase = 'filling';
        const recipe = world.activeRecipe;
        if (!recipe || !world.canStart('mash_tun')) return;
        const grain = recipe.grainKg * scaleOf(b);
        const water = waterFor(recipe.grainKg) * scaleOf(b);
        const ready = countItems(b.itemsIn!, 'crushed_malt') >= grain && b.fluidIn!.amount >= water;
        if (!ready) return;
        m.data = { grainKg: grain, waterL: water, mashTemp: recipe.mashTemp, recipeId: recipe.id, name: recipe.name };
        m.temp = b.fluidIn!.temp;
        takeItems(b.itemsIn!, 'crushed_malt', grain);
        drain(b.fluidIn!, water);
        setPhase(m, 'heating');
        return;
      }
      case 'heating':
        if (heatTo(m, Number(m.data!.mashTemp), FIXED.mashHeatRate * speedOf(b), dt)) {
          setPhase(m, 'processing', (FIXED.mashTimeMin * TIME_SCALE.brewMinute) / speedOf(b));
        }
        return;
      case 'processing':
        advanceProcessing(m, dt);
        return;
      case 'blocked': {
        const d = m.data!;
        const r = mash({ grainKg: +d.grainKg!, waterL: +d.waterL!, mashTemp: +d.mashTemp!, mashTimeMin: FIXED.mashTimeMin });
        if (!outputFits(b, 'wort', r.volume)) {
          b.alerts |= Alert.OutputBlocked;
          return;
        }
        b.alerts &= ~Alert.OutputBlocked;
        const batch = world.batches.create({
          ...emptyProfile(), og: r.og, fermentability: r.fermentability, quality: r.quality,
          name: String(d.name), recipeId: Number(d.recipeId),
        });
        mixInto(world, b.fluid!, 'wort', r.volume, m.temp ?? +d.mashTemp!, batch);
        world.events.emit({ type: 'batchReady', buildingId: b.id, batchId: batch });
        setPhase(m, 'filling');
        return;
      }
      default:
        tickFailed(m, dt);
    }
  },

  kettle(world, b, m, dt) {
    switch (m.phase) {
      case 'idle':
      case 'filling': {
        m.phase = 'filling';
        const cap = defOf(b).fluidIn!.capacity;
        if (!inputSettled(m, b.fluidIn!, cap, dt) || !world.canStart('kettle')) return;
        const src = world.batches.get(b.fluidIn!.batch);
        const recipe = recipeOf(world, src);
        const volume = b.fluidIn!.amount;
        const hops = hopsFor(recipe?.hopsItems ?? 1, volume);
        if (countItems(b.itemsIn!, 'hops') < hops) return;
        m.data = { volume, hopsGrams: hops * HOPS_GRAMS_PER_ITEM, og: src?.og ?? 0 };
        m.batch = world.batches.create(src ?? emptyProfile()); // copie : le lot d'origine reste intact
        m.temp = b.fluidIn!.temp;
        takeItems(b.itemsIn!, 'hops', hops);
        drain(b.fluidIn!, volume);
        m.settle = undefined;
        setPhase(m, 'heating');
        return;
      }
      case 'heating':
        if (heatTo(m, BOIL_TEMP, FIXED.boilHeatRate * speedOf(b), dt)) setPhase(m, 'processing', (FIXED.boilTimeMin * TIME_SCALE.brewMinute) / speedOf(b));
        return;
      case 'processing':
        advanceProcessing(m, dt);
        return;
      case 'blocked': {
        const d = m.data!;
        const r = boil({ og: +d.og!, volume: +d.volume!, hopsGrams: +d.hopsGrams!, boilMin: FIXED.boilTimeMin });
        if (!outputFits(b, 'hopped_wort', r.volume)) {
          b.alerts |= Alert.OutputBlocked;
          return;
        }
        b.alerts &= ~Alert.OutputBlocked;
        const p = world.batches.get(m.batch)!;
        p.og = r.og;
        p.ibu = r.ibu;
        p.quality *= r.quality;
        mixInto(world, b.fluid!, 'hopped_wort', r.volume, BOIL_TEMP, m.batch);
        world.stats.brews++;
        m.batch = null;
        setPhase(m, 'filling');
        return;
      }
      default:
        tickFailed(m, dt);
    }
  },

  fermenter(world, b, m, dt) {
    switch (m.phase) {
      case 'idle':
      case 'filling': {
        m.phase = 'filling';
        const cap = defOf(b).fluidIn!.capacity;
        if (!inputSettled(m, b.fluidIn!, cap, dt) || countItems(b.itemsIn!, 'yeast') < yeastFor(b.fluidIn!.amount) || !world.canStart('fermenter')) return;
        const src = world.batches.get(b.fluidIn!.batch);
        const recipe = recipeOf(world, src);
        const strain: StrainId = recipe?.strain ?? 'ale_us';
        const volume = b.fluidIn!.amount;
        const pitchTemp = b.fluidIn!.temp;
        drain(b.fluidIn!, volume);
        takeItems(b.itemsIn!, 'yeast', yeastFor(volume));
        m.settle = undefined;
        if (pitchTemp > YEAST_DEATH_TEMP) {
          // Moût ensemencé trop chaud : la levure meurt, le lot est perdu.
          fail(world, b, m, `Levure tuée : le moût était à ${pitchTemp.toFixed(0)} °C`);
          return;
        }
        const temp = fermentTempFor(strain);
        const garde = recipe?.gardeDays ?? 3;
        const r = ferment({ og: src?.og ?? 0, fermentability: src?.fermentability ?? 0.75, strain, temp, gardeDays: garde });
        m.batch = world.batches.create({
          ...(src ?? emptyProfile()),
          abv: r.abv, fruity: r.fruity, quality: (src?.quality ?? 1) * r.quality, strain, gardeDays: garde,
        });
        // ~5 % de pertes (lie). fermentDuration sert à l'affichage « fermentation » puis « garde ».
        m.data = { volume: volume * 0.95, temp, fermentDuration: r.days * TIME_SCALE.brewDay };
        m.temp = temp;
        m.data.fermentDuration = Number(m.data.fermentDuration) / speedOf(b);
        setPhase(m, 'processing', ((r.days + garde) * TIME_SCALE.brewDay) / speedOf(b));
        return;
      }
      case 'processing':
        advanceProcessing(m, dt);
        return;
      case 'blocked': {
        const volume = Number(m.data!.volume);
        if (!outputFits(b, 'beer', volume)) {
          b.alerts |= Alert.OutputBlocked;
          return;
        }
        b.alerts &= ~Alert.OutputBlocked;
        mixInto(world, b.fluid!, 'beer', volume, Number(m.data!.temp), m.batch);
        world.stats.fermentations++;
        world.events.emit({ type: 'batchReady', buildingId: b.id, batchId: m.batch! });
        m.batch = null;
        setPhase(m, 'filling');
        return;
      }
      default:
        tickFailed(m, dt);
    }
  },

  bottler(world, b, m, dt) {
    const beer = b.fluidIn!;
    if (beer.amount < BOTTLE_LITERS || countItems(b.itemsIn!, 'bottle') === 0 || outputItemsFull(b)) {
      m.phase = 'idle';
      return;
    }
    m.phase = 'processing';
    m.duration = num(b, 'interval');
    m.timer += dt;
    if (m.timer >= m.duration) {
      m.timer = 0;
      const batch = beer.batch;
      drain(beer, BOTTLE_LITERS);
      takeItems(b.itemsIn!, 'bottle', 1);
      b.itemsOut!.push({ item: 'beer_bottle', batch });
      world.stats.bottles++;
    }
  },

  /** Caisse de livraison : dès 12 bouteilles, elle part chez le bar et rapporte le prix des bouteilles. */
  crate(world, b, m, dt) {
    if (m.phase === 'processing') {
      m.timer += dt;
      if (m.timer >= m.duration) setPhase(m, 'filling');
      return;
    }
    m.phase = 'filling';
    const stock = b.itemsIn!;
    if (stock.length < CRATE_SIZE) return;
    const units = stock.splice(0, CRATE_SIZE);
    if (!world.firstBeer) {
      const p = world.batches.get(units[0]!.batch);
      if (p) world.firstBeer = { ...p };
    }
    let price = 0;
    for (const u of units) price += salePrice(world.batches.get(u.batch) ?? emptyProfile(), world.market, num(b, 'basePrice'));
    world.earn(price);
    world.stats.crates++;
    world.checkUnlocks();
    world.events.emit({ type: 'crateDelivered', buildingId: b.id, price });
    setPhase(m, 'processing', CRATE_TRIP_SECONDS);
  },

  stand(world, b, m, dt) {
    const stock = b.itemsIn!;
    if (stock.length === 0) {
      m.phase = 'idle';
      b.alerts |= Alert.NoInput;
      return;
    }
    b.alerts &= ~Alert.NoInput;
    m.phase = 'processing';
    const profile = world.batches.get(stock[0]!.batch) ?? emptyProfile();
    // La demande dépend de l'attrait de la bière proposée (tendance × qualité).
    const rate = (num(b, 'customersPerMin') / 60) * (0.3 + 0.7 * appeal(profile, world.market));
    m.timer += rate * dt;
    if (m.timer >= 1) {
      m.timer -= 1;
      const sold = stock.shift()!;
      const price = salePrice(profile, world.market, num(b, 'basePrice'));
      world.earn(price);
      world.events.emit({ type: 'sale', buildingId: b.id, batchId: sold.batch ?? 0, price });
    }
  },
};

export function updateMachine(world: World, b: Building, dt: number): void {
  const m = b.machine;
  const kind = (BUILDINGS[b.type] as { machine?: MachineKind }).machine;
  if (!m || !kind || b.health <= 0) return;
  if (m.phase !== 'failed') b.alerts &= ~Alert.BatchLost;
  MACHINES[kind](world, b, m, dt);
}
