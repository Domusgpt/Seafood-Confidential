import { describe, expect, it } from 'vitest';
import { Semaphore, WindowCounter } from './limits';

describe('WindowCounter', () => {
  it('allows up to the limit per window and recovers after it', () => {
    const c = new WindowCounter(2, 1000);
    expect(c.hit('a', 0)).toBe(true);
    expect(c.hit('a', 10)).toBe(true);
    expect(c.hit('a', 20)).toBe(false);
    expect(c.blocked('a', 30)).toBe(true);
    expect(c.hit('b', 30)).toBe(true);
    expect(c.hit('a', 1015)).toBe(true);
  });

  it('bounds memory by evicting the oldest keys', () => {
    const c = new WindowCounter(1, 1000, 3);
    for (const k of ['a', 'b', 'c', 'd']) c.hit(k, 0);
    expect(c.hit('a', 1)).toBe(true); // 'a' was evicted, so it starts fresh
  });
});

describe('Semaphore', () => {
  it('limits concurrency and rejects beyond the queue', async () => {
    const s = new Semaphore(1, 1);
    const first = await s.acquire();
    const second = s.acquire();
    expect(await s.acquire()).toBeNull();
    expect(s.load).toEqual({ active: 1, waiting: 1 });
    first!();
    const release = await second;
    expect(release).toBeTypeOf('function');
    release!();
    expect(s.load).toEqual({ active: 0, waiting: 0 });
  });
});
