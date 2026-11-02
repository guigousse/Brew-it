import { TICK_DT, type OfflineReport, type World } from '../world';

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

export const MAX_OFFLINE_SECONDS = 8 * 3600;
/** Pas de simulation hors-ligne : assez fin pour que tapis et embouteilleuse gardent leur cadence. */
const OFFLINE_STEP = 0.5;

/**
 * Production hors-ligne : simule le temps écoulé (plafonné à 8 h). Les gains ne sont pas versés
 * directement : ils attendent dans `world.offline` que le joueur les récolte.
 */
export function simulateOffline(world: World, seconds: number, max = MAX_OFFLINE_SECONDS): OfflineReport | null {
  const target = Math.min(seconds, max);
  if (target < OFFLINE_STEP) return null;
  const money = world.money;
  const stats = { ...world.stats };
  const stock = { ...world.stock };
  let t = 0;
  while (t + OFFLINE_STEP <= target) {
    world.step(OFFLINE_STEP);
    t += OFFLINE_STEP;
  }
  const earned = world.money - money;
  world.money = money; // mis de côté jusqu'à la récolte
  const used: OfflineReport['used'] = {};
  for (const k of Object.keys(stock) as (keyof typeof stock)[]) {
    const d = (stock[k] ?? 0) - (world.stock[k] ?? 0);
    if (d > 0) used[k] = d;
  }
  const prev = world.offline;
  world.offline = {
    seconds: t + (prev?.seconds ?? 0),
    earned: earned + (prev?.earned ?? 0),
    crates: world.stats.crates - stats.crates + (prev?.crates ?? 0),
    bottles: world.stats.bottles - stats.bottles + (prev?.bottles ?? 0),
    brews: world.stats.brews - stats.brews + (prev?.brews ?? 0),
    used,
  };
  return world.offline;
}
