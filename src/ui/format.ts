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
