import { Capacitor } from '@capacitor/core';
import { NativePurchases } from '@capgo/native-purchases';

/** Un achat confirmé par la boutique, pas encore forcément crédité. */
export interface Purchase {
  productId: string;
  transactionId: string;
}

/**
 * La boutique de diamants vue par le jeu.
 * - « appstore » : achats intégrés iOS (StoreKit 2). Une transaction n'est terminée (`finish`) qu'une fois les
 *   diamants crédités et la partie sauvegardée : si l'app est tuée entre les deux, `pending` la rend au lancement.
 * - « dev » : en développement dans le navigateur, un achat simulé réussit tout de suite.
 * - « none » : navigateur en production, pas d'achat possible.
 */
export interface GemStore {
  readonly kind: 'appstore' | 'dev' | 'none';
  /** Prix localisés (devise du joueur), par identifiant de produit ; vide si la boutique ne répond pas. */
  prices(productIds: string[]): Promise<Map<string, string>>;
  /** Lance l'achat ; null si le joueur annule. */
  buy(productId: string): Promise<Purchase | null>;
  /** Termine la transaction auprès de la boutique (après crédit et sauvegarde). */
  finish(transactionId: string): Promise<void>;
  /** Achats payés mais pas encore terminés (reprise après un arrêt de l'app). */
  pending(): Promise<Purchase[]>;
  /** Achats arrivés hors de l'app (achat différé, demande parentale approuvée…). */
  onUpdate(listener: (p: Purchase) => void): void;
}

class AppStore implements GemStore {
  readonly kind = 'appstore' as const;
  private ready: Promise<void>;

  constructor() {
    this.ready = NativePurchases.configure({ autoFinishTransactions: false }).catch((e) => console.error('Achats : configuration', e));
  }

  async prices(productIds: string[]): Promise<Map<string, string>> {
    await this.ready;
    try {
      const { products } = await NativePurchases.getProducts({ productIdentifiers: productIds });
      return new Map(products.map((p) => [p.identifier, p.priceString]));
    } catch (e) {
      console.error('Achats : produits', e);
      return new Map();
    }
  }

  async buy(productId: string): Promise<Purchase | null> {
    await this.ready;
    try {
      const t = await NativePurchases.purchaseProduct({ productIdentifier: productId, isConsumable: true, autoAcknowledgePurchases: false });
      return { productId: t.productIdentifier || productId, transactionId: t.transactionId };
    } catch (e) {
      // le joueur a fermé la fenêtre d'achat : ce n'est pas une erreur
      if (/cancel/i.test(String((e as { message?: string })?.message ?? e))) return null;
      throw e;
    }
  }

  async finish(transactionId: string): Promise<void> {
    await this.ready;
    await NativePurchases.finishTransaction({ transactionId });
  }

  async pending(): Promise<Purchase[]> {
    await this.ready;
    try {
      const { transactions } = await NativePurchases.getUnfinishedTransactions();
      return transactions.map((t) => ({ productId: t.productIdentifier, transactionId: t.transactionId }));
    } catch (e) {
      console.error('Achats : transactions en attente', e);
      return [];
    }
  }

  onUpdate(listener: (p: Purchase) => void): void {
    void NativePurchases.addListener('transactionUpdated', (t) => listener({ productId: t.productIdentifier, transactionId: t.transactionId }));
  }
}

/** Développement : chaque achat réussit après un court délai, avec un identifiant de transaction unique. */
class DevStore implements GemStore {
  readonly kind = 'dev' as const;
  async prices(): Promise<Map<string, string>> {
    return new Map();
  }
  async buy(productId: string): Promise<Purchase | null> {
    await new Promise((r) => setTimeout(r, 400));
    return { productId, transactionId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
  async finish(): Promise<void> {}
  async pending(): Promise<Purchase[]> {
    return [];
  }
  onUpdate(): void {}
}

/** Navigateur en production : la boutique s'affiche, mais les achats ne se font que dans l'app iOS. */
class NoStore implements GemStore {
  readonly kind = 'none' as const;
  async prices(): Promise<Map<string, string>> {
    return new Map();
  }
  async buy(): Promise<Purchase | null> {
    throw new Error('Les achats se font dans l\'app iPhone');
  }
  async finish(): Promise<void> {}
  async pending(): Promise<Purchase[]> {
    return [];
  }
  onUpdate(): void {}
}

export function createGemStore(): GemStore {
  if (Capacitor.isNativePlatform()) return new AppStore();
  return import.meta.env.DEV ? new DevStore() : new NoStore();
}
