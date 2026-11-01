import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Appelle `onPause` quand l'app passe en arrière-plan et `onResume` au retour (iOS + navigateur). */
export function onAppLifecycle(onPause: () => void, onResume: () => void): void {
  if (Capacitor.isNativePlatform()) {
    void App.addListener('pause', onPause);
    void App.addListener('resume', onResume);
  } else {
    document.addEventListener('visibilitychange', () => (document.hidden ? onPause() : onResume()));
  }
}

export function tapFeedback(strong = false): void {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light });
}
