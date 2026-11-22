/**
 * Joueur simulé du prototype idle : il achète toujours ce qui rapporte le plus vite (gain par seconde / prix),
 * touche les activités sans maître brasseur tant qu'il joue, et note quand chaque chose arrive.
 *
 *   npx vite-node scripts/idle-balance.ts [heures]
 *
 * ACTIVE=1 : le joueur reste devant l'écran (touche les activités sans maître brasseur) ; par défaut il ne
 * touche que pendant les 10 premières minutes, puis seuls les maîtres brasseurs produisent.
 */
import { BIZ, buy, cycleTime, dur, fmt, hire, buyUpgrade, multiplier, newState, perSecond, start, tick, totalPerSecond, UPGRADES, yeastGain, costOf } from '../src/idle/model';

const HOURS = Number(process.argv[2] ?? 24);
const ACTIVE = process.env.ACTIVE === '1';
const s = newState();
const log: string[] = [];
const seen = new Set<string>();
const note = (key: string, t: number, text: string) => {
  if (seen.has(key)) return;
  seen.add(key);
  log.push(`${dur(Math.max(1, t)).padStart(9)}  ${text}`);
};

/** Gain par seconde d'une activité si elle tourne (touchée ou automatisée). */
const rate = (i: number, playing: boolean) => (s.managers[i] || playing ? perSecond(s, i) : 0);

let t = 0;
const end = HOURS * 3600;
const marks = [600, 1800, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 24 * 3600, 48 * 3600];
while (t < end) {
  const playing = ACTIVE || t < 600;
  if (playing) BIZ.forEach((_, i) => start(s, i));
  // le meilleur achat : gain par seconde ajouté / prix
  for (let k = 0; k < 50; k++) {
    let best: { score: number; go: () => boolean } | null = null;
    BIZ.forEach((b, i) => {
      const c = costOf(s, i, 1);
      if (s.money >= c) {
        const before = rate(i, playing);
        s.owned[i]!++;
        const after = s.managers[i] || playing ? perSecond(s, i) : 0;
        s.owned[i]!--;
        // une activité pas encore ouverte vaut d'être ouverte (pour son maître brasseur à venir)
        const gain = after - before + (s.owned[i] === 0 ? b.rev / b.time : 0);
        const score = gain / c;
        if (!best || score > best.score) best = { score, go: () => buy(s, i, 1) };
      }
      if (!s.managers[i] && s.owned[i]! > 0 && s.money >= b.manager) {
        const score = (perSecond(s, i) * (playing ? 0.5 : 1)) / b.manager + 1e-3;
        if (!best || score > best.score) best = { score, go: () => hire(s, i) };
      }
    });
    for (const u of UPGRADES) {
      if (s.upgrades.includes(u.id) || s.money < u.cost) continue;
      const cur = BIZ.reduce((a, _, i) => a + (u.biz === -1 || u.biz === i ? rate(i, playing) : 0), 0);
      const score = (cur * (u.mult - 1)) / u.cost;
      if (!best || score > best.score) best = { score, go: () => buyUpgrade(s, u.id) };
    }
    if (!best) break;
    (best as { go: () => boolean }).go();
  }
  BIZ.forEach((b, i) => {
    if (s.owned[i]! > 0) note(`own${i}`, t, `ouvre ${b.name}`);
    if (s.managers[i]) note(`mgr${i}`, t, `maître brasseur : ${b.managerName} (${b.name})`);
  });
  for (const m of marks) if (t >= m) note(`m${m}`, t, `— ${fmt(totalPerSecond(s))} €/s, levures mères à gagner : ${yeastGain(s)}, cycle garage ${dur(cycleTime(s, 0))}, ×${fmt(multiplier(s, 0))}`);
  if (yeastGain(s) >= 1) note('y1', t, `première levure mère disponible`);
  if (yeastGain(s) >= 10) note('y10', t, `10 levures mères disponibles (+20 %)`);
  tick(s, 1);
  t += 1;
}
console.log(log.join('\n'));
console.log(`\nFin (${HOURS} h) : ${fmt(s.money)} €, ${fmt(totalPerSecond(s))} €/s, exemplaires ${s.owned.join(' ')}, améliorations ${s.upgrades.length}/${UPGRADES.length}, levures à gagner ${yeastGain(s)}`);
