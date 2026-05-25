import { calculateCost, PRICING } from '../src/cost.js';

describe('calculateCost', () => {
  test('calculates cost for deepseek-chat with all cache fields', () => {
    const usage = { prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 400, completion_tokens: 340 };
    const expected =
      800 * PRICING['deepseek-chat'].cache_hit +
      400 * PRICING['deepseek-chat'].cache_miss +
      340 * PRICING['deepseek-chat'].output;
    expect(calculateCost(usage, 'deepseek-chat')).toBeCloseTo(expected, 10);
  });

  test('falls back to deepseek-chat pricing for unknown model', () => {
    const usage = { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, completion_tokens: 50 };
    expect(calculateCost(usage, 'unknown-model')).toBeCloseTo(calculateCost(usage, 'deepseek-chat'), 10);
  });

  test('handles missing cache fields without throwing', () => {
    const usage = { completion_tokens: 100 };
    expect(() => calculateCost(usage, 'deepseek-chat')).not.toThrow();
    expect(calculateCost(usage, 'deepseek-chat')).toBeGreaterThan(0);
  });

  test('returns 0 when all token counts are 0', () => {
    expect(calculateCost({ prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0, completion_tokens: 0 }, 'deepseek-chat')).toBe(0);
  });
});
