import type { BatchProfile } from '../brewing/batches';
import { boil, ferment, mash, TIME_SCALE } from '../brewing/profile';
import { Alert, countItems, num, takeItems, type Building, type MachineState } from '../building';
import { BUILDINGS } from '../content/buildings';
import { BOTTLE_LITERS, HOPS_GRAMS_PER_ITEM, type ItemId } from '../content/items';
import { STRAINS, YEAST_DEATH_TEMP, type StrainId } from '../content/strains';
import { appeal, ITEM_PRICES, salePrice } from '../economy/market';
import type { FluidId } from '../content/fluids';
import { approach } from '../math';
import type { World } from '../world';
import { drain, mixInto } from './fluids';

/** Durée d'affichage d'un échec avant que la machine ne reprenne. */
const FAILED_COOLDOWN = 3;
const BOIL_TEMP = 100;

type MachineUpdate = (world: World, b: Building, m: MachineState, dt: number) => void;

const setPhase = (m: MachineState, phase: MachineState['phase'], duration = 0) => {
  m.phase = phase;
  m.timer = 0;
  m.duration = duration;
};

/** Peut-on verser `amount` L de `fluid` dans le réservoir de sortie ? */
const outputFits = (b: Building, fluid: FluidId, amount: number): boolean => {
  const tank = b.fluid!;
  const cap = (BUILDINGS[b.type] as { fluid: { capacity: number } }).fluid.capacity;
  return (tank.fluid === null || tank.fluid === fluid) && tank.amount + amount <= cap + 1e-6;
};

const outputItemsFull = (b: Building): boolean =>
  b.itemsOut!.length >= (BUILDINGS[b.type] as { itemsOut: { capacity: number } }).itemsOut.capacity;

/** Échec d'un lot : alerte, événement, puis la machine redémarre après un délai. */
function fail(world: World, b: Building, m: MachineState, reason: string) {
  b.alerts |= Alert.BatchLost;
  world.events.emit({ type: 'batchLost', buildingId: b.id, reason });
  m.batch = null;
  setPhase(m, 'failed', FAILED_COOLDOWN);
}

/** Phase commune « chauffe » : la température interne rejoint la consigne. */
function heatTo(m: MachineState, target: number, rate: number, dt: number): boolean {
  m.temp = approach(m.temp ?? target, target, rate * dt);
  return Math.abs(m.temp - target) < 0.5;
}

const MACHINES: Record<string, MachineUpdate> = {
  water_tap(_world, b, _m, dt) {
    const tank = b.fluid!;
    const cap = BUILDINGS.water_tap.fluid.capacity;
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
        const grain = num(b, 'grainKg');
        const water = num(b, 'waterL');
        const ready = countItems(b.itemsIn!, 'crushed_malt') >= grain && b.fluidIn!.amount >= water;
        if (!ready) return;
        m.data = { grainKg: grain, waterL: water, mashTemp: num(b, 'mashTemp'), mashTime: num(b, 'mashTime') };
        m.temp = b.fluidIn!.temp;
        takeItems(b.itemsIn!, 'crushed_malt', grain);
        drain(b.fluidIn!, water);
        setPhase(m, 'heating');
        return;
      }
      case 'heating':
        if (heatTo(m, Number(m.data!.mashTemp), num(b, 'heatRate'), dt)) {
          setPhase(m, 'processing', Number(m.data!.mashTime) * TIME_SCALE.brewMinute);
        }
        return;
      case 'processing':
        m.timer += dt;
        if (m.timer < m.duration) return;
        m.phase = 'blocked'; // la sortie est tentée au tick suivant
        return;
      case 'blocked': {
        const d = m.data!;
        const r = mash({ grainKg: +d.grainKg!, waterL: +d.waterL!, mashTemp: +d.mashTemp!, mashTimeMin: +d.mashTime! });
        if (!outputFits(b, 'wort', r.volume)) {
          b.alerts |= Alert.OutputBlocked;
          return;
        }
        b.alerts &= ~Alert.OutputBlocked;
        const batch = world.batches.create({
          og: r.og, fermentability: r.fermentability, ibu: 0, abv: 0, fruity: 0, quality: r.quality, strain: null, gardeDays: 0,
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
        const volume = num(b, 'volume');
        const hops = num(b, 'hopsItems');
        if (b.fluidIn!.amount < volume || countItems(b.itemsIn!, 'hops') < hops) return;
        const src = world.batches.get(b.fluidIn!.batch);
        m.data = { volume, hopsGrams: hops * HOPS_GRAMS_PER_ITEM, boilTime: num(b, 'boilTime'), og: src?.og ?? 0 };
        // Copie du lot : le reste du moût dans la cuve d'entrée garde le lot d'origine.
        m.batch = world.batches.create(src ?? emptyProfile());
        m.temp = b.fluidIn!.temp;
        takeItems(b.itemsIn!, 'hops', hops);
        drain(b.fluidIn!, volume);
        setPhase(m, 'heating');
        return;
      }
      case 'heating':
        if (heatTo(m, BOIL_TEMP, num(b, 'heatRate'), dt)) setPhase(m, 'processing', Number(m.data!.boilTime) * TIME_SCALE.brewMinute);
        return;
      case 'processing':
        m.timer += dt;
        if (m.timer < m.duration) return;
        m.phase = 'blocked'; // la sortie est tentée au tick suivant
        return;
      case 'blocked': {
        const d = m.data!;
        const r = boil({ og: +d.og!, volume: +d.volume!, hopsGrams: +d.hopsGrams!, boilMin: +d.boilTime! });
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
        m.batch = null;
        setPhase(m, 'filling');
        return;
      }
      default:
        tickFailed(m, dt);
    }
  },

  fermenter(world, b, m, dt) {
    const strain = String(b.params.strain) as StrainId;
    const s = STRAINS[strain] ?? STRAINS.ale_us;
    if (num(b, 'temp') > s.tempMax) b.alerts |= Alert.Overheat;
    else b.alerts &= ~Alert.Overheat;

    switch (m.phase) {
      case 'idle':
      case 'filling': {
        m.phase = 'filling';
        const volume = num(b, 'volume');
        if (b.fluidIn!.amount < volume || countItems(b.itemsIn!, 'yeast') < 1) return;
        const pitchTemp = b.fluidIn!.temp;
        const src = world.batches.get(b.fluidIn!.batch);
        drain(b.fluidIn!, volume);
        takeItems(b.itemsIn!, 'yeast', 1);
        if (pitchTemp > YEAST_DEATH_TEMP) {
          // Moût ensemencé trop chaud : la levure meurt, le lot est perdu.
          fail(world, b, m, `Levure tuée : moût à ${pitchTemp.toFixed(0)} °C`);
          return;
        }
        const temp = num(b, 'temp');
        const garde = num(b, 'gardeDays');
        const r = ferment({ og: src?.og ?? 0, fermentability: src?.fermentability ?? 0.75, strain, temp, gardeDays: garde });
        m.batch = world.batches.create({
          ...(src ?? emptyProfile()),
          abv: r.abv, fruity: r.fruity, quality: (src?.quality ?? 1) * r.quality, strain, gardeDays: garde,
        });
        m.data = { volume: volume * 0.95, temp }; // ~5 % de pertes (lie)
        setPhase(m, 'processing', (r.days + garde) * TIME_SCALE.brewDay);
        return;
      }
      case 'processing':
        m.timer += dt;
        if (m.timer < m.duration) return;
        m.phase = 'blocked'; // la sortie est tentée au tick suivant
        return;
      case 'blocked': {
        const volume = Number(m.data!.volume);
        if (!outputFits(b, 'beer', volume)) {
          b.alerts |= Alert.OutputBlocked;
          return;
        }
        b.alerts &= ~Alert.OutputBlocked;
        mixInto(world, b.fluid!, 'beer', volume, Number(m.data!.temp), m.batch);
        world.events.emit({ type: 'batchReady', buildingId: b.id, batchId: m.batch! });
        m.batch = null;
        setPhase(m, 'filling');
        return;
      }
      default:
        tickFailed(m, dt);
    }
  },

  bottler(_world, b, m, dt) {
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
    }
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
      world.money += price;
      world.events.emit({ type: 'sale', buildingId: b.id, batchId: sold.batch ?? 0, price });
    }
  },
};

function tickFailed(m: MachineState, dt: number) {
  if (m.phase !== 'failed') return;
  m.timer += dt;
  if (m.timer >= m.duration) setPhase(m, 'filling');
}

export function emptyProfile(): BatchProfile {
  return { og: 0, fermentability: 0.75, ibu: 0, abv: 0, fruity: 0, quality: 1, strain: null, gardeDays: 0 };
}

export function updateMachine(world: World, b: Building, dt: number): void {
  const m = b.machine;
  const kind = (BUILDINGS[b.type] as { machine?: string }).machine;
  if (!m || !kind || b.health <= 0) return;
  if (m.phase !== 'failed') b.alerts &= ~Alert.BatchLost;
  MACHINES[kind]?.(world, b, m, dt);
}
