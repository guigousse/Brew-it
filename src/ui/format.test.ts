import { describe, expect, it } from 'vitest';
import { compact } from './format';

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
