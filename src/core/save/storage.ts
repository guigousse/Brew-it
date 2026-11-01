import type { World } from '../world';
import { fromJSON, toJSON } from './serialize';

/** Abstraction du stockage : Filesystem natif sur iOS, localStorage sur le web, mémoire dans les tests. */
export interface SaveStorage {
  read(key: string): Promise<string | null>;
  write(key: string, data: string): Promise<void>;
}

export class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  async read(key: string) {
    return this.data.get(key) ?? null;
  }
  async write(key: string, data: string) {
    this.data.set(key, data);
  }
}

export class SaveManager {
  constructor(
    private storage: SaveStorage,
    private slot = 'save-1',
  ) {}

  async save(world: World, now = Date.now()): Promise<void> {
    await this.storage.write(this.slot, toJSON(world, now));
  }

  /** Charge la partie ; renvoie aussi le temps réel écoulé depuis la sauvegarde (production hors-ligne). */
  async load(now = Date.now()): Promise<{ world: World; elapsedSeconds: number } | null> {
    const json = await this.storage.read(this.slot);
    if (!json) return null;
    const savedAt = (JSON.parse(json) as { savedAt: number }).savedAt;
    return { world: fromJSON(json), elapsedSeconds: Math.max(0, (now - savedAt) / 1000) };
  }
}
