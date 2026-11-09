/**
 * Ce que disent les lettres de commande : le type de client au singulier, la phrase du client
 * et son merci à la livraison. Choisis d'après le numéro de la commande : une lettre garde toujours ses mots.
 */
import type { Order } from './orders';

/** Le type de client, au singulier, sous son nom. */
export const CLIENT_KIND_NAME: Record<string, string> = {
  particulier: 'Particulier', bistrot: 'Bistrot', epicerie: 'Épicerie fine', caviste: 'Caviste', restaurant: 'Restaurant',
  fetes: 'Fête de village', festival: 'Festival', supermarche: 'Supermarché', gastro: 'Grande table', export: 'Export',
};

/** Ce que cherche le client, dit comme une phrase (« une lager », « une bière bien amère »…). */
const WANT_PHRASE: Record<string, string> = {
  ipa: 'une IPA', lager: 'une lager bien fraîche', saison: 'une saison', blonde: 'une bonne blonde', paleale: 'une pale ale',
  abbaye: 'une triple ou une forte', fruity: 'une bière fruitée', light: 'une bière légère, sous les 5 %', strong: 'une bière qui tape, 7 % et plus',
  bitter: 'une bière bien amère', soft: 'une bière douce', aroma: 'une bière qui a du nez', clear: 'une bière bien limpide', dark: 'une ambrée',
};

const pick = <T>(list: readonly T[], n: number) => list[n % list.length]!;

/** La phrase du client, dans sa bulle. */
export function orderQuote(o: Pick<Order, 'id' | 'kind' | 'qty' | 'want' | 'mix'>): string {
  const style = o.want ? WANT_PHRASE[o.want] : undefined;
  const ask = style ?? 'ce que tu as de meilleur';
  switch (o.kind) {
    case 'keg':
      return pick([
        `Ma tireuse est à sec : ${o.qty} fût${o.qty > 1 ? 's' : ''}, s'il te plaît !`,
        `${o.qty} fût${o.qty > 1 ? 's' : ''} pour ce week-end, on compte sur toi.`,
      ], o.id);
    case 'style':
      return pick([`Mes clients ne jurent que par ${ask}. Tu as ça ?`, `Je cherche ${ask}, la tienne a bonne réputation.`], o.id);
    case 'mix':
      return pick([
        `Un assortiment de ${o.mix ?? 2} bières, pour faire découvrir ta gamme.`,
        `De la variété ! ${o.mix ?? 2} bières différentes, c'est possible ?`,
      ], o.id);
    case 'urgent':
      return pick([`Vite, vite ! Il me faut ${ask}, et pas demain.`, `C'est la panique ici : il me faut ${ask} au plus tôt !`], o.id);
    case 'prestige':
      return pick([`Pour notre carte, seulement l'excellence${style ? ` : ${ask}` : ''}.`, `Nos clients sont exigeants. Montre-nous ton plus beau brassin${style ? `, ${style}` : ''}.`], o.id);
    default:
      return pick([`${o.qty} bouteilles${style ? `, ${style}` : ''}, et c'est la fête !`, `Il me faudrait ${o.qty} bouteilles. Je te fais confiance !`, `On organise un petit quelque chose : ${o.qty} bouteilles, merci !`], o.id);
  }
}

/** Le merci du client, quand la commande part. */
export function orderThanks(o: Pick<Order, 'id'>): string {
  return pick(['Merci, c\'est parfait !', 'Santé ! À la prochaine.', 'Mes clients vont adorer, merci !', 'Livré à temps, bravo !'], o.id);
}
