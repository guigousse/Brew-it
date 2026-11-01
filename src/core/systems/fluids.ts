import type { BatchId } from '../brewing/batches';
import { Alert, type Building, type FluidTank } from '../building';
import { BUILDINGS, type FluidTankDef } from '../content/buildings';
import type { FluidId } from '../content/fluids';
import type { World } from '../world';

const EPS = 1e-6;
/** Dégâts par seconde par unité de surpression (remplissage au-delà de 1). */
const PRESSURE_DAMAGE = 40;
/** Part du contenu perdue par seconde par un bâtiment cassé. */
const LEAK_RATE = 0.2;

interface InputSlot {
  tank: FluidTank;
  capacity: number;
  maxPressure: number;
  /** Entrée de machine : agit comme un puits (pression perçue nulle) jusqu'à être pleine. */
  sink: boolean;
}

/** Réservoir dans lequel `target` reçoit du fluide venant de `source`, ou undefined s'il refuse. */
export function inputSlot(world: World, target: Building, source: Building, fluid: FluidId): InputSlot | undefined {
  if (target.health <= 0) return undefined;
  const def = BUILDINGS[target.type];
  if (target.fluidIn && 'fluidIn' in def) {
    if (!(def.fluidIn.accepts as readonly string[]).includes(fluid)) return undefined;
    return { tank: target.fluidIn, capacity: def.fluidIn.capacity, maxPressure: 1, sink: true };
  }
  if (!target.fluid || !('fluid' in def)) return undefined;
  const fd: FluidTankDef = def.fluid;
  if (fd.accepts !== 'any' && !fd.accepts.includes(fluid)) return undefined;
  if (fd.directional && world.front(target) === source) return undefined; // on ne remonte pas un tuyau
  return { tank: target.fluid, capacity: fd.capacity, maxPressure: fd.maxPressure ?? 1, sink: false };
}

/** Ajoute du fluide dans un réservoir en mélangeant température et lot (pondéré par volume). */
export function mixInto(world: World, tank: FluidTank, fluid: FluidId, amount: number, temp: number, batch: BatchId | null): void {
  if (amount <= 0) return;
  if (tank.amount <= EPS || tank.fluid === null) {
    tank.fluid = fluid;
    tank.amount = amount;
    tank.temp = temp;
    tank.batch = batch;
    return;
  }
  const total = tank.amount + amount;
  tank.temp = (tank.temp * tank.amount + temp * amount) / total;
  tank.batch = world.batches.blend(tank.batch, tank.amount, batch, amount);
  tank.amount = total;
}

export function drain(tank: FluidTank, amount: number): void {
  tank.amount -= amount;
  if (tank.amount <= EPS) {
    tank.amount = 0;
    tank.fluid = null;
    tank.batch = null;
  }
}

/**
 * Déplace du fluide de `src` vers `dst` selon la différence de pression (= taux de remplissage).
 * Une pompe ajoute une hauteur manométrique et peut remplir la cible au-delà de 100 % (surpression).
 * Renvoie le volume transféré.
 */
export function moveFluid(world: World, src: Building, dst: Building, budget: number, dt: number): number {
  const tank = src.fluid!;
  const sdef = BUILDINGS[src.type] as { fluid: FluidTankDef };
  if (!tank.fluid || tank.amount <= EPS || budget <= EPS) return 0;
  const slot = inputSlot(world, dst, src, tank.fluid);
  if (!slot) return 0;
  if (slot.tank.fluid !== null && slot.tank.amount > EPS && slot.tank.fluid !== tank.fluid) {
    src.alerts |= Alert.MixedFluids;
    return 0;
  }
  const head = sdef.fluid.pumpHead ?? 0;
  const srcCap = sdef.fluid.capacity;
  const dstPressure = slot.sink ? 0 : slot.tank.amount / slot.capacity;
  const drive = tank.amount / srcCap - dstPressure + head;
  if (drive <= 0) return 0;
  const limit = (head > 0 ? slot.maxPressure : 1) * slot.capacity;
  // Facteur 0.5 : deux réservoirs de même taille s'équilibrent en un tick sans osciller.
  const flow = slot.sink ? drive * srcCap : drive * Math.min(srcCap, slot.capacity) * 0.5;
  const amount = Math.min(tank.amount, budget, flow, limit - slot.tank.amount);
  if (amount <= EPS) return 0;
  mixInto(world, slot.tank, tank.fluid, amount, exitTemp(src, amount / dt), tank.batch);
  drain(tank, amount);
  return amount;
}

/**
 * Température du fluide qui sort de `src`. Pour un refroidisseur (échangeur à plaques), méthode ε-NTU :
 * efficacité = 1 - exp(-capacité / débit). Plus le débit est fort, moins il refroidit → goulot à gérer
 * (baisser le débit, ou mettre plusieurs refroidisseurs en série).
 */
export function exitTemp(src: Building, flowRate: number): number {
  const tank = src.fluid!;
  const def = BUILDINGS[src.type];
  if (!('cooler' in def) || src.health <= 0) return tank.temp;
  const target = Number(src.params.targetTemp ?? tank.temp);
  const effectiveness = 1 - Math.exp(-def.cooler.capacity / Math.max(flowRate, 1e-3));
  return tank.temp + (target - tank.temp) * effectiveness;
}

export function updateFluids(world: World, dt: number): void {
  for (const b of world.list) {
    const tank = b.fluid;
    if (!tank) continue;
    const def = BUILDINGS[b.type] as { fluid: FluidTankDef; maxHealth: number };
    b.alerts &= ~(Alert.MixedFluids | Alert.Overpressure);

    if (b.health <= 0) {
      b.alerts |= Alert.Broken;
      if (tank.amount > 0) drain(tank, tank.amount * LEAK_RATE * dt);
      continue;
    }

    let budget = def.fluid.maxFlow * dt;
    if (def.fluid.directional) {
      const target = world.front(b);
      if (target) budget -= moveFluid(world, b, target, budget, dt);
    } else {
      const ns = world.neighbors(b);
      // Répartition équitable : chaque voisin a droit à une part du débit, en commençant par un index tournant.
      const share = budget / Math.max(ns.length, 1);
      for (let k = 0; k < ns.length; k++) {
        const n = ns[(b.dumpIndex + k) % ns.length]!;
        budget -= moveFluid(world, b, n.b, Math.min(share, budget), dt);
      }
      if (ns.length) b.dumpIndex = (b.dumpIndex + 1) % ns.length;
    }

    // Surpression : au-delà de 100 % le bâtiment s'abîme, puis casse et fuit.
    const fill = tank.amount / def.fluid.capacity;
    if (fill > 1 + EPS) {
      b.alerts |= Alert.Overpressure;
      b.health -= (fill - 1) * PRESSURE_DAMAGE * dt;
      if (b.health <= 0) {
        b.health = 0;
        b.alerts |= Alert.Broken;
        world.events.emit({ type: 'broken', buildingId: b.id });
      }
    }
  }
}
