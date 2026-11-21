import { describe, expect, it } from 'vitest';
import { Game, TUTO_DONE } from '../core/game';
import { DEFAULT_LABEL } from '../core/label';
import { LESSONS, TOUR } from './tutorial';

const ready = () => {
  const g = new Game();
  g.brew();
  for (let i = 0; i < 20000 && !g.tastable; i++) g.step(0.5);
  g.keepTrial('Blonde', DEFAULT_LABEL);
  g.finishTour();
  return g;
};
const due = (g: Game) => LESSONS.filter((l) => l.when(g)).map((l) => l.id);

describe('visite et leçons de Gaston', () => {
  it('la visite d\'accueil reste courte', () => {
    expect(TOUR.length).toBeLessThanOrEqual(8);
  });

  it('chaque leçon attend son moment', () => {
    const g = ready();
    g.money = 0;
    expect(due(g)).toEqual([]);
    g.ordersDone = 2;
    expect(due(g)).toEqual(['queue']);
    g.money = 1e6;
    expect(due(g)).toContain('upgrade');
    g.owned.push('darts');
    expect(due(g)).toContain('events');
    g.wholesaleLiters = 5;
    expect(due(g)).toContain('storage');
  });

  it('brancher un fût vient après la leçon du bar, quand un fût attend', () => {
    const g = ready();
    g.beers[0]!.kegs.push(5);
    expect(due(g)).not.toContain('plug');
    g.lessonsDone.push('bar');
    expect(due(g)).toContain('plug');
  });

  it('une ancienne partie, déjà finie, n\'a pas de leçon à rattraper', () => {
    const raw = JSON.parse(JSON.stringify(ready()));
    delete raw.lessonsDone;
    raw.tips = TUTO_DONE;
    expect(Game.fromJSON(raw).lessonsDone).toEqual(['*']);
  });
});
