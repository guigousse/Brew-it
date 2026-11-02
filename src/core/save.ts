import { Game } from './game';

/** Abstraction du stockage : fichier natif sur iOS, localStorage sur le web, mémoire dans les tests. */
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

/** Nouvelle version du jeu : nouvel emplacement de sauvegarde (les anciennes parties ne sont pas reprises). */
export class SaveManager {
  constructor(private storage: SaveStorage, private slot = 'brewit-sim-1') {}

  async save(game: Game, now = Date.now()): Promise<void> {
    await this.storage.write(this.slot, JSON.stringify({ savedAt: now, game: game.toJSON() }));
  }

  async load(now = Date.now()): Promise<{ game: Game; elapsedSeconds: number } | null> {
    const json = await this.storage.read(this.slot);
    if (!json) return null;
    const data = JSON.parse(json) as { savedAt: number; game: unknown };
    return { game: Game.fromJSON(data.game), elapsedSeconds: Math.max(0, (now - data.savedAt) / 1000) };
  }
}
