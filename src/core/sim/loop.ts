import { TICK_DT, type World } from '../world';

/**
 * Boucle à pas fixe : la simulation avance toujours par ticks de 1/20 s, quel que soit le framerate.
 * Le rendu (60/120 Hz sur iPhone ProMotion) est découplé et peut interpoler.
 */
export class FixedStepLoop {
  private acc = 0;
  /** Multiplicateur de vitesse (x1, x2, x4…) — bonus d'accélération possible. */
  speed = 1;

  constructor(
    private world: World,
    private maxStepsPerFrame = 8,
  ) {}

  /** À appeler à chaque frame avec le temps réel écoulé (s). Renvoie le nombre de ticks exécutés. */
  advance(realDt: number): number {
    this.acc += Math.min(realDt, 0.25) * this.speed;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < this.maxStepsPerFrame * this.speed) {
      this.world.step(TICK_DT);
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps >= this.maxStepsPerFrame * this.speed) this.acc = 0; // anti « spirale de la mort »
    return steps;
  }
}

export const MAX_OFFLINE_SECONDS = 2 * 3600;
const OFFLINE_STEP = 0.25;

/**
 * Production hors-ligne : simule le temps écoulé (plafonné) avec un pas plus grossier.
 * Renvoie l'argent gagné, pour l'écran « Pendant votre absence… ».
 */
export function simulateOffline(world: World, seconds: number, max = MAX_OFFLINE_SECONDS): { simulated: number; earned: number } {
  const target = Math.min(seconds, max);
  const before = world.money;
  let t = 0;
  while (t + OFFLINE_STEP <= target) {
    world.step(OFFLINE_STEP);
    t += OFFLINE_STEP;
  }
  return { simulated: t, earned: world.money - before };
}
