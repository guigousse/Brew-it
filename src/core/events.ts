import type { BatchId } from './brewing/batches';

/** Événements émis par la simulation, consommés par l'UI (toasts, sons, haptique). */
export type GameEvent =
  | { type: 'sale'; buildingId: number; batchId: BatchId; price: number }
  | { type: 'batchLost'; buildingId: number; reason: string }
  | { type: 'batchReady'; buildingId: number; batchId: BatchId }
  | { type: 'broken'; buildingId: number }
  | { type: 'expanded'; level: number }
  | { type: 'crateDelivered'; buildingId: number; price: number }
  | { type: 'tutorialStep'; index: number }
  | { type: 'tutorialDone' }
  | { type: 'unlocked'; buildings: string[] }
  | { type: 'tasting'; recipeId: number }
  | { type: 'stockEmpty'; item: string };

type Listener = (e: GameEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
