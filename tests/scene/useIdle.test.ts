import { describe, expect, it } from 'vitest';
import { idleAfter } from '@/scene/useIdle';

describe('idleAfter', () => {
  it('não está ocioso antes de 3 s', () => expect(idleAfter(1000, 3999, false)).toBe(false));
  it('fica ocioso a partir de 3 s', () => {
    expect(idleAfter(1000, 4000, false)).toBe(true);
    expect(idleAfter(1000, 9000, false)).toBe(true);
  });
  it('nunca some com foco dentro', () => expect(idleAfter(0, 99999, true)).toBe(false));
  it('aceita outro limite', () => expect(idleAfter(0, 500, false, 500)).toBe(true));
});
