import { COCARDE_BONUS, CONTEST_TIERS, contestCategory, MEDALS, METALS, type ContestResult, type Medal, type Metal } from '../core/contests';
import { DEFAULT_LABEL, EMBLEMS, LABEL_COLORS, PATTERNS, type Label } from '../core/label';
import { drawCocarde } from '../render/cocarde';
import { drawLabel } from '../render/labelArt';
import { sfx } from '../platform/audio';
import { tapFeedback } from '../platform/lifecycle';
import { locale, tl } from '../i18n';

/**
 * La proclamation des résultats d'un concours, en trois temps :
 * 1. les brasseries rivales arrivent une à une (la 3e, la 2e, puis la 1re), leur note défile ;
 * 2. la bière du joueur entre sous le projecteur, le jury goûte… et sa note monte lentement, en dépassant
 *    les rivaux un à un (chacun vacille quand il est dépassé) ;
 * 3. la révélation, à la mesure du résultat : pluie de confettis d'or, éclats d'argent, quelques étincelles
 *    de bronze, ou un projecteur qui s'éteint. La bière prend sa place au classement, les rivaux
 *    descendent, la cocarde tombe.
 * « Passer » mène directement au résultat.
 */

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

/** « Or · Concours national ». */
export const medalName = (m: Pick<Medal, 'tier' | 'metal'>) => `${METALS[m.metal]} · ${CONTEST_TIERS[m.tier]!.name}`;

/** Une cocarde de concours, en pixel art. */
export function cocardeCanvas(m: Pick<Medal, 'tier' | 'metal'>, scale = 2, cls = 'cocarde'): HTMLCanvasElement {
  const c = h('canvas', `${cls} t${m.tier}`);
  drawCocarde(c, m.tier, m.metal, scale);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', medalName(m));
  return c;
}

/** Une étiquette pour chaque brasserie rivale, toujours la même pour un même nom. */
function rivalLabel(name: string): Label {
  let n = 7;
  for (const ch of name) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T,>(list: readonly T[], k: number) => list[(n >>> k) % list.length]!;
  const bg = pick(LABEL_COLORS, 0);
  const dark = ['#1b1424', '#1e3c78', '#2c6a3a', '#a8302a', '#8a5cc8'].includes(bg);
  return {
    ...DEFAULT_LABEL,
    bg,
    pattern: pick(PATTERNS.slice(0, 11), 3).id,
    patternColor: pick(LABEL_COLORS, 7),
    emblem: pick(EMBLEMS.slice(0, 14), 11).id,
    textColor: dark ? '#f6ecd6' : '#1b1424',
  };
}

const fmt = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

type Outcome = 'gold' | 'silver' | 'bronze' | 'none';
const OUTCOME: readonly Outcome[] = ['bronze', 'silver', 'gold'];

export interface CeremonyOptions {
  /** La fenêtre (déjà ouverte) où se joue la cérémonie. */
  card: HTMLElement;
  /** Calque plein écran pour les confettis. */
  layer: HTMLElement;
  result: ContestResult;
  /** Étiquette de la bière du joueur. */
  label: Label;
  /** Fin de la cérémonie : le joueur touche « Continuer ». */
  onDone: () => void;
}

export function playCeremony(o: CeremonyOptions): void {
  const { card, result: r } = o;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = reduce ? 0.35 : 1;
  let skip = false;
  const waiters = new Set<() => void>();
  const sleep = (ms: number) => new Promise<void>((res) => {
    if (skip) return res();
    const done = () => {
      waiters.delete(done);
      clearTimeout(t);
      res();
    };
    const t = setTimeout(done, ms * speed);
    waiters.add(done);
  });
  const alive = () => card.isConnected;

  card.classList.add('ceremony');
  card.append(h('p', 'hint cer-cat', tl('Catégorie : {0}', contestCategory(r.cat)?.text ?? r.cat)));
  const phase = h('p', 'cer-phase', tl('Le jury proclame les résultats…'));
  const board = h('div', 'cer-board');
  const spot = h('div', 'cer-spot hidden');
  const verdict = h('div', 'cer-verdict hidden');
  const actions = h('div', 'cer-actions');
  const skipBtn = h('button', 'btn small cer-skip', tl('Passer ▸▸'));
  skipBtn.onclick = () => {
    skip = true;
    for (const w of [...waiters]) w();
  };
  actions.append(skipBtn);
  card.append(phase, board, spot, verdict, actions);

  // --- une ligne du classement
  interface Row { el: HTMLElement; score: number; me: boolean; rank: HTMLElement; medal: HTMLElement; value: HTMLElement }
  const rows: Row[] = [];
  const makeRow = (name: string, label: Label, score: number, me: boolean): Row => {
    const el = h('div', `cer-row${me ? ' me' : ''}`);
    const rank = h('span', 'cer-rank');
    const thumb = h('canvas', 'cer-thumb');
    drawLabel(thumb, label, name);
    const medal = h('span', 'cer-medal');
    const value = h('span', 'cer-score', fmt(0));
    el.append(rank, thumb, h('span', 'cer-name', name), medal, value);
    return { el, score, me, rank, medal, value };
  };
  /** Numéros et cocardes provisoires selon l'ordre affiché ; un rival qui sort du podium perd la sienne. */
  const restyle = () => {
    rows.forEach((row, i) => {
      row.rank.textContent = String(i + 1);
      const metal = i <= 2 ? ((2 - i) as Metal) : null;
      const had = row.medal.dataset.metal;
      const now = metal == null ? '' : String(metal);
      if (had === now) return;
      row.medal.dataset.metal = now;
      if (had && !now) {
        row.medal.classList.add('lost');
        return;
      }
      row.medal.classList.remove('lost');
      row.medal.replaceChildren(...(metal == null ? [] : [cocardeCanvas({ tier: r.tier, metal }, 1, 'cocarde small')]));
    });
  };
  const insert = (row: Row) => {
    let i = rows.findIndex((x) => x.score < row.score || (x.score === row.score && row.me));
    if (i < 0) i = rows.length;
    rows.splice(i, 0, row);
    board.insertBefore(row.el, board.children[i] ?? null);
    restyle();
  };
  /** Une note qui défile de `from` à `to`. */
  const count = (el: HTMLElement, from: number, to: number, ms: number, onValue?: (v: number) => void) => new Promise<void>((res) => {
    const start = performance.now();
    const tick = () => {
      if (!alive()) return res();
      const t = skip ? 1 : Math.min(1, (performance.now() - start) / (ms * speed));
      const v = from + (to - from) * easeOut(t);
      el.textContent = fmt(t >= 1 ? to : Math.floor(v * 10) / 10);
      onValue?.(v);
      if (t >= 1) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });

  const run = async () => {
    // 1. les rivaux, de la 3e à la 1re
    await sleep(500);
    phase.textContent = tl('Les brasseries rivales');
    for (const rival of [...r.rivals].sort((a, b) => a.score - b.score)) {
      if (!alive()) return;
      const row = makeRow(rival.name, rivalLabel(rival.name), rival.score, false);
      insert(row);
      sfx.play('click');
      await count(row.value, 0, rival.score, 600);
      await sleep(450);
    }
    // 2. la bière du joueur, sous le projecteur
    if (!alive()) return;
    const score = r.score ?? 0;
    phase.textContent = tl('Et maintenant, ta bière…');
    spot.classList.remove('hidden');
    const big = h('canvas', 'cer-spot-label');
    drawLabel(big, o.label, r.beerName);
    const digits = h('div', 'cer-digits', '?');
    const sub = h('div', 'cer-spot-sub', tl('Le jury goûte'));
    spot.append(big, h('div', 'cer-spot-name', r.beerName), digits, sub);
    sfx.play('paper');
    await sleep(900);
    sub.classList.add('dots');
    await sleep(1300);
    // la note monte, et dépasse les rivaux un à un : plus elle en dépasse, plus c'est long
    if (!alive()) return;
    sub.classList.remove('dots');
    sub.textContent = '';
    const passes = r.rivals.filter((x) => x.score <= score).length;
    const from = Math.max(0, Math.min(score, r.rivals[2]!.score) - 1.6);
    const passed = new Set<Row>();
    digits.classList.add('rolling');
    await count(digits, from, score, 1800 + passes * 650, (v) => {
      for (const row of rows) {
        if (row.me || passed.has(row) || row.score > v) continue;
        passed.add(row);
        row.el.classList.add('passed');
        if (!skip) {
          sfx.play('pop');
          tapFeedback(false);
        }
      }
    });
    digits.classList.remove('rolling');
    // un écart serré mérite un temps de plus : la note clignote avant le verdict
    const close = r.rivals.some((x) => Math.abs(x.score - score) < 0.5);
    if (close) {
      digits.classList.add('holding');
      await sleep(1100);
      digits.classList.remove('holding');
    } else await sleep(350);
    // 3. la révélation
    if (!alive()) return;
    reveal(score);
  };

  const reveal = (score: number) => {
    skipBtn.remove();
    const outcome: Outcome = r.metal == null ? 'none' : OUTCOME[r.metal]!;
    card.classList.add(`out-${outcome}`);
    spot.classList.add('stamped');
    const me = makeRow(r.beerName, o.label, score, true);
    me.value.textContent = fmt(score);
    insert(me);
    for (const row of rows) row.value.textContent = fmt(row.score);
    phase.textContent = outcome === 'none' ? tl('Le verdict') : tl('Le podium');

    // le ton du moment : de justesse, haut la main, note exceptionnelle, ou à un cheveu du podium
    const above = r.rivals.filter((x) => x.score > score).sort((a, b) => a.score - b.score)[0];
    const below = r.rivals.filter((x) => x.score <= score).sort((a, b) => b.score - a.score)[0];
    let tone = '';
    if (score >= 19.5) tone = tl('Note exceptionnelle : le jury est sous le charme !');
    else if (outcome === 'gold' && below && score - below.score >= 1) tone = tl('Haut la main !');
    else if (outcome !== 'none' && below && score - below.score < 0.3) tone = tl('De justesse !');
    else if (outcome === 'none' && r.rivals[2] && r.rivals[2].score - score < 0.5) tone = tl('À {0} point du podium…', fmt(r.rivals[2].score - score));
    else if (outcome !== 'none' && outcome !== 'gold' && above) tone = tl('À {0} point de la marche du dessus.', fmt(above.score - score));

    if (r.metal != null) {
      verdict.append(cocardeCanvas({ tier: r.tier, metal: r.metal }, 4, 'cocarde big'), h('strong', 'ceremony-title', MEDALS[r.metal]), h('span', 'ceremony-beer', tl('pour « {0} »', r.beerName)));
      if (tone) verdict.append(h('p', 'cer-tone', tone));
      verdict.append(h('p', 'hint', tl('Sa cocarde : +{0} % de ventes et de prix.', Math.round(COCARDE_BONUS[r.tier * 3 + r.metal]! * 100))));
    } else {
      verdict.append(h('strong', 'ceremony-title', tl('{0}e place', (r.rank ?? 3) + 1)), h('span', 'ceremony-beer', tl('Pas de médaille cette fois.')));
      if (tone) verdict.append(h('p', 'cer-tone', tone));
    }
    if (r.tip) verdict.append(h('p', 'note', tl('Gaston : « Pour plus de finesse : {0} »', r.tip)));
    verdict.classList.remove('hidden');
    const done = h('button', 'btn primary', tl('Continuer'));
    done.onclick = o.onDone;
    actions.append(done);

    // effets à la mesure du résultat
    const burst = { gold: 70, silver: 34, bronze: 16, none: 0 }[outcome];
    if (burst) confetti(o.layer, outcome as Exclude<Outcome, 'none'>, score >= 19.5 ? burst + 40 : burst);
    if (outcome === 'gold') {
      sfx.play('levelUp');
      sfx.play('crowd');
      tapFeedback(true);
    } else if (outcome === 'silver') {
      sfx.play('levelUp');
      tapFeedback(true);
    } else if (outcome === 'bronze') {
      sfx.play('pickup');
      tapFeedback(false);
    } else sfx.play('error');
  };

  void run();
}

/** Pluie de confettis en pixel art, aux couleurs du métal. */
function confetti(layer: HTMLElement, metal: 'gold' | 'silver' | 'bronze', n: number): void {
  const colors = {
    gold: ['#f2c14e', '#fff4b0', '#a8742a', '#e8553a', '#7ee081', '#4ea8f0'],
    silver: ['#ffffff', '#bcc6d0', '#8cd0ff', '#5c6670'],
    bronze: ['#f0b884', '#c07a3e', '#6e3e1a'],
  }[metal];
  const box = h('div', `confetti-layer ${metal}`);
  for (let i = 0; i < n; i++) {
    const p = h('i', 'confetti');
    const size = 4 + Math.floor(Math.random() * 3) * 2;
    p.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;background:${colors[i % colors.length]};`
      + `animation-delay:${(Math.random() * (metal === 'gold' ? 1.2 : 0.6)).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.6).toFixed(2)}s;`
      + `--drift:${Math.round((Math.random() - 0.5) * 120)}px;--spin:${Math.round(Math.random() * 4) * 90}deg`;
    box.append(p);
  }
  layer.append(box);
  setTimeout(() => box.remove(), 4500);
}
