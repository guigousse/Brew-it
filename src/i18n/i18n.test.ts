import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from './en';
import es from './es';
import zh from './zh';
import { tl } from '.';

/** Les textes passés à tl('…') dans le code (chaînes simples ; les clés construites à l'exécution sont à part). */
function codeKeys(): Set<string> {
  const keys = new Set<string>();
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); continue; }
      if (!p.endsWith('.ts') || p.endsWith('.test.ts')) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/\btl\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]!.replace(/\\(.)/g, '$1'));
    }
  };
  walk(join(__dirname, '..'));
  return keys;
}

describe('traductions', () => {
  const dicts = { en, es, zh };
  it('chaque texte du jeu est traduit en anglais, espagnol et chinois', () => {
    const missing: string[] = [];
    for (const k of codeKeys()) for (const [lang, d] of Object.entries(dicts)) if (!(k in d)) missing.push(`${lang}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('une traduction n\'invente pas de valeur : ses {n} viennent du texte français', () => {
    const extra: string[] = [];
    for (const [lang, d] of Object.entries(dicts)) {
      for (const [k, v] of Object.entries(d)) {
        const src = new Set(k.match(/\{\d+\}/g) ?? []);
        for (const p of v.match(/\{\d+\}/g) ?? []) if (!src.has(p)) extra.push(`${lang}: ${k} → ${v}`);
      }
    }
    expect(extra).toEqual([]);
  });

  it('les trois dictionnaires ont les mêmes clés', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it('tl remplace les valeurs (en français, la langue des tests)', () => {
    expect(tl('Il te manque {0}', '5 €')).toBe('Il te manque 5 €');
  });
});
