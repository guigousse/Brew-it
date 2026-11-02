import type { BuildingType } from '../content/buildings';
import { STARTER_BUILDINGS } from '../content/progression';
import type { World } from '../world';
import { TUTORIAL_STEPS, type PlaceTarget, type TutorialStep } from './steps';

export interface TutorialState {
  step: number;
  done: boolean;
  /** Signaux reçus de l'interface (conservés : un choix fait en avance valide l'étape plus tard). */
  signals: string[];
}

export const currentStep = (w: World): TutorialStep | undefined =>
  w.tutorial.done ? undefined : TUTORIAL_STEPS[w.tutorial.step];

export const stepText = (w: World, step: TutorialStep): string => (typeof step.text === 'function' ? step.text(w) : step.text);

const placed = (w: World, t: PlaceTarget) => {
  const b = w.at(t.x, t.y);
  return !!b && b.type === t.type && b.x === t.x && b.y === t.y;
};

/** Cibles de construction restantes de l'étape en cours. */
export const pendingPlacements = (w: World): PlaceTarget[] => (currentStep(w)?.places ?? []).filter((t) => !placed(w, t));

/** La construction demandée correspond-elle à une cible du tutoriel ? */
export function tutorialPlacement(w: World, type: BuildingType, x: number, y: number): PlaceTarget | undefined {
  return pendingPlacements(w).find((t) => t.type === type && t.x === x && t.y === y);
}

/** Bâtiments proposés dans la palette pendant l'étape en cours. */
export const tutorialPalette = (w: World): BuildingType[] => [...new Set(pendingPlacements(w).map((t) => t.type))];

function isComplete(w: World, step: TutorialStep): boolean {
  if (step.places && !step.places.every((t) => placed(w, t))) return false;
  if (step.signal && !w.tutorial.signals.includes(step.signal)) return false;
  if (step.ack && !w.tutorial.signals.includes(`ack:${step.id}`)) return false;
  if (step.until && !step.until(w)) return false;
  return true;
}

/** Fait avancer le tutoriel tant que l'étape en cours est remplie. */
export function tutorialUpdate(w: World): void {
  let step = currentStep(w);
  while (step && isComplete(w, step)) {
    step.onComplete?.(w);
    w.tutorial.step++;
    w.events.emit({ type: 'tutorialStep', index: w.tutorial.step });
    step = currentStep(w);
  }
  if (!w.tutorial.done && w.tutorial.step >= TUTORIAL_STEPS.length) finishTutorial(w);
}

export function finishTutorial(w: World): void {
  w.tutorial.done = true;
  w.unlock(STARTER_BUILDINGS);
  w.events.emit({ type: 'tutorialDone' });
}

/** Passer le tutoriel (joueur expérimenté) : on débloque tout et on donne l'argent de départ. */
export function skipTutorial(w: World): void {
  if (w.tutorial.done) return;
  const remaining = TUTORIAL_STEPS.slice(w.tutorial.step);
  for (const s of remaining) s.onComplete?.(w);
  w.tutorial.step = TUTORIAL_STEPS.length;
  finishTutorial(w);
}

export const TUTORIAL_LENGTH = TUTORIAL_STEPS.length;
