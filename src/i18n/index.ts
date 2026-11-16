/**
 * Traductions. Le français est la langue source : chaque texte du jeu passe par `t('texte français', ...valeurs)`,
 * et les dictionnaires (en, es, zh) donnent sa traduction. `{0}`, `{1}`… sont remplacés par les valeurs, dans l'ordre
 * (une traduction peut les déplacer ou en omettre, par exemple un « s » du pluriel en chinois).
 *
 * Langue : celle choisie dans les options, sinon celle du système si elle est disponible, sinon l'anglais.
 * Changer de langue recharge l'application (les textes des données sont traduits au chargement).
 */
import en from './en';
import es from './es';
import zh from './zh';

export type Lang = 'fr' | 'en' | 'es' | 'zh';
export const LANGS: readonly { id: Lang; name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'zh', name: '简体中文' },
];

const KEY = 'brewit:lang';
const DICTS: Record<Exclude<Lang, 'fr'>, Record<string, string>> = { en, es, zh };
/** Clés qui ne s'affichent pas telles quelles en français (un même mot pour deux sens). */
const FR: Record<string, string> = { 'Blonde (couleur)': 'Blonde' };

/** La langue choisie dans les options, ou null si le joueur suit la langue du système. */
export function chosenLang(): Lang | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return LANGS.some((l) => l.id === v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

/** Langue du système si le jeu la parle, sinon l'anglais. */
export function systemLang(): Lang {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return 'fr'; // tests (Node) : la langue source
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of list) {
    const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
    if (base === 'fr' || base === 'en' || base === 'es' || base === 'zh') return base;
  }
  return 'en';
}

export const lang: Lang = chosenLang() ?? systemLang();

/** Pour les nombres et les dates. */
export const locale = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', zh: 'zh-CN' }[lang];

if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;

/** Traduit un texte du jeu (écrit en français) dans la langue en cours. */
export function tl(src: string, ...args: unknown[]): string {
  const tr = lang === 'fr' ? FR[src] ?? src : DICTS[lang][src] ?? DICTS.en[src] ?? FR[src] ?? src;
  return args.length ? tr.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? '')) : tr;
}

/** Choisit la langue (null : celle du système) et recharge le jeu. */
export function setLang(l: Lang | null): void {
  try {
    if (l) localStorage.setItem(KEY, l);
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
  location.reload();
}
