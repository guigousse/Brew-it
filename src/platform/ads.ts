/**
 * Pubs vidéo récompensées.
 *
 * Aucune régie n'est encore branchée : `showRewardedAd` affiche une pub de TEST (un écran plein de 5 s) pour régler
 * l'interface et l'équilibrage. Le jour où une régie arrive (AdMob via @capacitor-community/admob, par exemple),
 * seul ce fichier change : la promesse vaut `true` si la pub a été regardée jusqu'au bout, `false` sinon
 * (fermée avant la fin, pas de pub disponible, erreur). La récompense n'est donnée que sur `true`.
 */

const TEST_AD_SECONDS = 5;

let showing = false;

export function showRewardedAd(): Promise<boolean> {
  if (showing) return Promise.resolve(false);
  showing = true;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ad-test';
    const box = document.createElement('div');
    box.className = 'ad-test-box';
    const tag = document.createElement('div');
    tag.className = 'ad-test-tag';
    tag.textContent = 'Publicité (test)';
    const count = document.createElement('div');
    count.className = 'ad-test-count';
    const close = document.createElement('button');
    close.className = 'btn ad-test-close';
    close.textContent = 'Fermer sans récompense';
    box.append(tag, count, close);
    overlay.append(box);
    document.body.append(overlay);
    let left = TEST_AD_SECONDS;
    const finish = (ok: boolean) => {
      window.clearInterval(timer);
      overlay.remove();
      showing = false;
      resolve(ok);
    };
    const tick = () => {
      count.textContent = left > 0 ? String(left) : '✓';
      if (left <= 0) {
        close.textContent = 'Récupérer la récompense';
        close.classList.add('primary');
        close.onclick = () => finish(true);
      }
      left--;
    };
    close.onclick = () => finish(false);
    tick();
    const timer = window.setInterval(() => {
      if (left < 0) return window.clearInterval(timer);
      tick();
    }, 1000);
  });
}
