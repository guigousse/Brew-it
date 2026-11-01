import type { FluidTank } from '../building';
import { BUILDINGS } from '../content/buildings';
import { AMBIENT_TEMP } from '../content/fluids';
import type { World } from '../world';

const DEFAULT_HEAT_LOSS = 0.003;

const relax = (tank: FluidTank, k: number, dt: number) => {
  if (tank.amount <= 0) return;
  tank.temp += (AMBIENT_TEMP - tank.temp) * (1 - Math.exp(-k * dt));
};

/** Déperdition thermique de tous les réservoirs (les refroidisseurs agissent au transfert, cf. fluids.ts). */
export function updateHeat(world: World, dt: number): void {
  for (const b of world.list) {
    const def = BUILDINGS[b.type];
    if (b.fluid && 'fluid' in def) {
      relax(b.fluid, ('heatLoss' in def.fluid ? def.fluid.heatLoss : undefined) ?? DEFAULT_HEAT_LOSS, dt);
    }
    if (b.fluidIn) relax(b.fluidIn, DEFAULT_HEAT_LOSS, dt);
  }
}
