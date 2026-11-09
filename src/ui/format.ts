/** Formats d'affichage purs (testables sans navigateur). */

/**
 * Montant court pour le header (la pièce ou le diamant à côté dit déjà de quoi il s'agit) : 250, 2,5k, 48k, 1,2M.
 * Arrondi vers le bas : le header n'annonce jamais plus que ce qu'on a.
 */
export function compact(v: number): string {
  const n = Math.max(0, Math.floor(v));
  const unit = (d: number, u: string) => {
    const x = n / d;
    const dec = x < 100 ? 1 : 0;
    const f = Math.floor(x * 10 ** dec) / 10 ** dec;
    return `${f.toLocaleString('fr-FR', { maximumFractionDigits: dec })}${u}`;
  };
  if (n < 1000) return String(n);
  if (n < 1e6) return unit(1e3, 'k');
  if (n < 1e9) return unit(1e6, 'M');
  return unit(1e9, 'Md');
}

/**
 * Délai avant un événement, qu'on ne puisse pas confondre avec l'heure du jeu : « dans 45 s », « dans 19 min »,
 * « dans 1 h 05 ». Arrondi vers le haut : on n'annonce jamais l'événement plus tôt qu'il n'arrive.
 */
export function countdown(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  if (t < 60) return `dans ${t} s`;
  const m = Math.ceil(t / 60);
  if (m < 60) return `dans ${m} min`;
  return `dans ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
