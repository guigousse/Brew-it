import { describe, expect, it } from 'vitest';
import { compact, countdown, dialTime } from './format';

describe('montants courts du header', () => {
  it('raccourcit sans jamais arrondir vers le haut', () => {
    expect(compact(250)).toBe('250');
    expect(compact(999.9)).toBe('999');
    expect(compact(2500)).toBe('2,5k');
    expect(compact(2499)).toBe('2,4k');
    expect(compact(48_000)).toBe('48k');
    expect(compact(250_400)).toBe('250k');
    expect(compact(1_250_000)).toBe('1,2M');
    expect(compact(3_000_000_000)).toBe('3Md');
  });
});

describe('délais', () => {
  it('se lisent comme un délai, jamais comme une heure', () => {
    expect(countdown(45)).toBe('dans 45 s');
    expect(countdown(19 * 60 + 39)).toBe('dans 20 min');
    expect(countdown(65 * 60)).toBe('dans 1 h 05');
    expect(countdown(-3)).toBe('dans 0 s');
  });
});

describe('cadran des boosts', () => {
  it('heures, puis minutes, puis secondes', () => {
    expect(dialTime(3 * 3600 + 5)).toBe('3h');
    expect(dialTime(29 * 60 + 10)).toBe('30m');
    expect(dialTime(59)).toBe('59s');
    expect(dialTime(-1)).toBe('0s');
  });
});
