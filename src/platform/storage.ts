import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { SaveStorage } from '../core/save';

/**
 * iOS : fichiers JSON dans Library/ (sauvegardé par iCloud Backup, invisible dans l'app Fichiers).
 * Écriture atomique : fichier temporaire puis renommage, pour ne jamais corrompre une sauvegarde
 * si l'app est tuée en pleine écriture.
 */
export class NativeFileStorage implements SaveStorage {
  async read(key: string): Promise<string | null> {
    try {
      const r = await Filesystem.readFile({ path: `${key}.json`, directory: Directory.Library, encoding: Encoding.UTF8 });
      return typeof r.data === 'string' ? r.data : await r.data.text();
    } catch {
      return null;
    }
  }

  async write(key: string, data: string): Promise<void> {
    const tmp = `${key}.tmp.json`;
    await Filesystem.writeFile({ path: tmp, data, directory: Directory.Library, encoding: Encoding.UTF8 });
    await Filesystem.rename({ from: tmp, to: `${key}.json`, directory: Directory.Library, toDirectory: Directory.Library });
  }
}

/** Navigateur (développement) : localStorage. */
export class LocalStorageAdapter implements SaveStorage {
  async read(key: string) {
    try {
      return localStorage.getItem(`brewit:${key}`);
    } catch {
      return null;
    }
  }
  async write(key: string, data: string) {
    try {
      localStorage.setItem(`brewit:${key}`, data);
    } catch {
      /* stockage indisponible (navigation privée) : on ignore */
    }
  }
}

export const createStorage = (): SaveStorage =>
  Capacitor.isNativePlatform() ? new NativeFileStorage() : new LocalStorageAdapter();
