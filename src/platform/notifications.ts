/**
 * Notifications locales iOS (@capacitor/local-notifications) : programmées au passage en arrière-plan, annulées au retour.
 * Dans le navigateur, rien n'est envoyé (les réglages restent visibles pour les tests).
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NOTIF_CATEGORIES, NOTIF_IDS, type NotifCategory, type NotifKind, type PlannedNotif } from '../core/notifications';

const KEY = 'brewit:notifs';

export interface NotifPrefs {
  enabled: Record<NotifCategory, boolean>;
  /** La demande d'autorisation a déjà été faite (acceptée ou non). */
  asked: boolean;
}

const DEFAULT: NotifPrefs = { enabled: { brewery: true, orders: true, contests: true, reminders: true }, asked: false };

export type NotifPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export class Notifier {
  readonly native = Capacitor.isNativePlatform();
  prefs: NotifPrefs = loadPrefs();
  private onOpen: ((kind: NotifKind) => void) | null = null;

  constructor() {
    if (!this.native) return;
    void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const kind = a.notification.extra?.kind as NotifKind | undefined;
      if (kind) this.onOpen?.(kind);
    });
  }

  /** Toucher une notification : le jeu s'ouvre au bon endroit. */
  onTap(fn: (kind: NotifKind) => void): void {
    this.onOpen = fn;
  }

  async permission(): Promise<NotifPermission> {
    if (!this.native) return 'unsupported';
    try {
      const p = await LocalNotifications.checkPermissions();
      return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  /** Demande l'autorisation au système (une seule fois : iOS ne la redemande plus ensuite). */
  async request(): Promise<boolean> {
    this.prefs.asked = true;
    this.save();
    if (!this.native) return false;
    try {
      return (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch {
      return false;
    }
  }

  /** Le joueur a répondu « Plus tard » (ou iOS a déjà tranché) : Gaston ne repose pas la question. */
  markAsked(): void {
    this.prefs.asked = true;
    this.save();
  }

  setCategory(c: NotifCategory, on: boolean): void {
    this.prefs.enabled[c] = on;
    this.save();
  }

  /** Remplace les notifications en attente par celles-ci. */
  async schedule(list: PlannedNotif[]): Promise<void> {
    if (!this.native) return;
    try {
      await this.cancelAll();
      if (!list.length || (await this.permission()) !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: list.map((n) => ({
          id: NOTIF_IDS[n.kind],
          title: n.title,
          body: n.body,
          schedule: { at: new Date(n.at), allowWhileIdle: true },
          extra: { kind: n.kind },
        })),
      });
    } catch (e) {
      console.error('notifications', e);
    }
  }

  /** Le joueur est revenu : plus rien en attente, et les notifications reçues quittent le centre de notifications. */
  async cancelAll(): Promise<void> {
    if (!this.native) return;
    try {
      const ids = Object.values(NOTIF_IDS).map((id) => ({ id }));
      await LocalNotifications.cancel({ notifications: ids });
      await LocalNotifications.removeAllDeliveredNotifications();
    } catch (e) {
      console.error('notifications', e);
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* stockage indisponible : les réglages durent le temps de la session */
    }
  }
}

function loadPrefs(): NotifPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotifPrefs> | null;
    if (!raw) return structuredClone(DEFAULT);
    const enabled = { ...DEFAULT.enabled };
    for (const c of NOTIF_CATEGORIES) if (typeof raw.enabled?.[c] === 'boolean') enabled[c] = raw.enabled[c];
    return { enabled, asked: !!raw.asked };
  } catch {
    return structuredClone(DEFAULT);
  }
}
