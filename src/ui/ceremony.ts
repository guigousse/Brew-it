import { COCARDE_BONUS, CONTEST_TIERS, contestCategory, MEDALS, METALS, rivalLook, type ContestResult, type ContestTier, type Medal, type Metal, type Rival } from '../core/contests';
import type { Label } from '../core/label';
import { Rng } from '../core/rng';
import { drawCocarde } from '../render/cocarde';
import { drawLabel } from '../render/labelArt';
import { drawShelfBottle, labelSpot, BOTTLE_SCALE } from '../render/bottleArt';
import { sfx } from '../platform/audio';
import { tapFeedback } from '../platform/lifecycle';
import { locale, tl } from '../i18n';

/**
 * La proclamation des résultats d'un concours : un défilé de bouteilles.
 * 1. Les bières rivales passent une à une sous le projecteur (la 3e, la 2e, puis la 1re) : la bouteille entre,
 *    son nom et sa brasserie s'affichent, sa note défile, puis elle sort et rejoint le classement.
 * 2. La bière du joueur entre en dernier ; le jury goûte… et sa note monte lentement, en dépassant les rivaux
 *    un à un (chacun vacille au classement quand il est dépassé). Un écart serré fait clignoter la note.
 * 3. La révélation, à la mesure du résultat : pluie de confettis d'or, éclats d'argent, quelques étincelles
 *    de bronze, ou un projecteur qui s'éteint. La cocarde tombe sur la bouteille, la bière prend sa place
 *    au classement, et le rival qui sort du podium perd la sienne.
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

/** La bière d'un rival ; les concours d'avant le défilé n'en avaient pas : on la tire du nom de la brasserie. */
function lookOf(r: Rival, tier: ContestTier): { beer: string; label: Label } {
  if (r.beer && r.label) return { beer: r.beer, label: r.label };
  let n = 7;
  for (const ch of r.name) n = (n * 31 + ch.charCodeAt(0)) | 0;
  return rivalLook(new Rng(n), tier);
}

/** Une grande bouteille, son étiquette posée comme sur l'étagère de la gamme. */
function bottleEl(label: Label, name: string): HTMLElement {
  const bottle = h('div', 'shelf-bottle cer-bottle');
  const glass = h('canvas', 'shelf-glass');
  drawShelfBottle(glass, 'beer', label.bottle);
  const lab = h('canvas', 'shelf-label');
  drawLabel(lab, label, name);
  const spot = labelSpot(label.bottle);
  Object.assign(lab.style, { left: `${spot.x * BOTTLE_SCALE}px`, top: `${spot.y * BOTTLE_SCALE}px` });
  bottle.append(glass, lab);
  return bottle;
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
  /** Nom de la brasserie du joueur. */
  brewery: string;
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
  const stage = h('div', 'cer-stage');
  const board = h('div', 'cer-board');
  const verdict = h('div', 'cer-verdict hidden');
  const actions = h('div', 'cer-actions');
  const skipBtn = h('button', 'btn small cer-skip', tl('Passer ▸▸'));
  skipBtn.onclick = () => {
    skip = true;
    for (const w of [...waiters]) w();
    stage.querySelectorAll('.cer-act:not(.me)').forEach((el) => el.remove());
  };
  actions.append(skipBtn);
  card.append(phase, stage, board, verdict, actions);

  // --- la bouteille sous le projecteur : la bouteille, son nom, sa brasserie, sa note
  interface Act { el: HTMLElement; bottle: HTMLElement; digits: HTMLElement; sub: HTMLElement }
  const makeAct = (beer: string, brewery: string, label: Label, me: boolean): Act => {
    const el = h('div', `cer-act${me ? ' me' : ''}`);
    const bottle = bottleEl(label, beer);
    const info = h('div', 'cer-info');
    const digits = h('div', 'cer-digits', me ? '?' : fmt(0));
    const sub = h('div', 'cer-spot-sub');
    info.append(h('div', 'cer-beer', beer), h('div', 'cer-brewery', brewery), digits, sub);
    el.append(bottle, info);
    stage.append(el);
    return { el, bottle, digits, sub };
  };

  // --- une ligne du classement
  interface Row { el: HTMLElement; score: number; me: boolean; rank: HTMLElement; medal: HTMLElement; value: HTMLElement }
  const rows: Row[] = [];
  const makeRow = (beer: string, brewery: string, label: Label, score: number, me: boolean): Row => {
    const el = h('div', `cer-row${me ? ' me' : ''}`);
    const rank = h('span', 'cer-rank');
    const thumb = h('canvas', 'cer-thumb');
    drawLabel(thumb, label, beer);
    const names = h('span', 'cer-names');
    names.append(h('span', 'cer-name', beer), h('span', 'cer-brew', brewery));
    const medal = h('span', 'cer-medal');
    const value = h('span', 'cer-score', fmt(score));
    el.append(rank, thumb, names, medal, value);
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
    follow(row.el);
  };
  /** Sur un petit écran, la fenêtre défile pour garder en vue ce qui vient d'apparaître. */
  const follow = (el: HTMLElement) => {
    if (card.scrollHeight > card.clientHeight) el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
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
    // 1. le défilé des rivaux, de la 3e à la 1re
    await sleep(400);
    phase.textContent = tl('Les bières en compétition');
    for (const rival of [...r.rivals].sort((a, b) => a.score - b.score)) {
      if (!alive()) return;
      const look = lookOf(rival, r.tier);
      const act = makeAct(look.beer, rival.name, look.label, false);
      if (!skip) sfx.play('click');
      await sleep(550);
      await count(act.digits, 0, rival.score, 700);
      await sleep(650);
      act.el.classList.add('leave');
      insert(makeRow(look.beer, rival.name, look.label, rival.score, false));
      await sleep(420);
      act.el.remove();
    }
    // 2. la bière du joueur entre en dernier
    if (!alive()) return;
    const score = r.score ?? 0;
    phase.textContent = tl('Et maintenant, ta bière…');
    const act = makeAct(r.beerName, o.brewery, o.label, true);
    sfx.play('paper');
    await sleep(800);
    act.sub.textContent = tl('Le jury goûte');
    act.sub.classList.add('dots');
    await sleep(1400);
    if (!alive()) return;
    act.sub.classList.remove('dots');
    act.sub.textContent = '';
    // la note monte et dépasse les rivaux un à un : plus elle en dépasse, plus c'est long
    const passes = r.rivals.filter((x) => x.score <= score).length;
    const from = Math.max(0, Math.min(score, r.rivals[2]!.score) - 1.6);
    const passed = new Set<Row>();
    act.digits.classList.add('rolling');
    await count(act.digits, from, score, 1800 + passes * 650, (v) => {
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
    act.digits.classList.remove('rolling');
    // un écart serré mérite un temps de plus : la note clignote avant le verdict
    if (r.rivals.some((x) => Math.abs(x.score - score) < 0.5)) {
      act.digits.classList.add('holding');
      await sleep(1100);
      act.digits.classList.remove('holding');
    } else await sleep(350);
    // 3. la révélation
    if (!alive()) return;
    reveal(score, act);
  };

  const reveal = (score: number, act: Act) => {
    skipBtn.remove();
    const outcome: Outcome = r.metal == null ? 'none' : OUTCOME[r.metal]!;
    card.classList.add(`out-${outcome}`);
    act.el.classList.add('stamped');
    act.digits.textContent = fmt(score);
    // la cocarde tombe sur la bouteille
    if (r.metal != null) act.bottle.append(cocardeCanvas({ tier: r.tier, metal: r.metal }, 2, 'cocarde shelf-cocarde cer-drop'));
    insert(makeRow(r.beerName, o.brewery, o.label, score, true));
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
      verdict.append(h('strong', 'ceremony-title', MEDALS[r.metal]), h('span', 'ceremony-beer', tl('pour « {0} »', r.beerName)));
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
    // la scène d'abord, puis le verdict
    setTimeout(() => alive() && follow(verdict), 700);

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
export function confetti(layer: HTMLElement, metal: 'gold' | 'silver' | 'bronze', n: number): void {
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
