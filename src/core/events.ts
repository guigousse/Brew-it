/** Événements émis par le jeu, consommés par l'interface (toasts, haptique). */
export type GameEvent =
  | { type: 'batchDone'; beerId: number | null; bottles: number }
  | { type: 'stage'; batchId: number; stage: number }
  | { type: 'sale'; amount: number }
  | { type: 'clientAvailable'; id: string }
  | { type: 'order'; client: string }
  | { type: 'orderExpired'; client: string }
  | { type: 'upgraded'; station: string; level: number }
  | { type: 'breweryLevel'; level: number }
  | { type: 'batchRuined'; beerId: number };

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
