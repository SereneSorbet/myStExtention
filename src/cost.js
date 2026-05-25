export const USD_TO_CNY = 6.78;

// Prices in USD per token. Update when DeepSeek changes their published rates.
// V4 prices reflect the current 75% launch discount.
export const PRICING = {
  'deepseek-v4-pro': {
    cache_hit: 0.003625 / 1_000_000,
    cache_miss: 0.435 / 1_000_000,
    output: 0.87 / 1_000_000,
  },
  'deepseek-v4-flash': {
    cache_hit: 0.0028 / 1_000_000,
    cache_miss: 0.14 / 1_000_000,
    output: 0.28 / 1_000_000,
  },
  'deepseek-chat': {
    cache_hit: 0.07 / 1_000_000,
    cache_miss: 0.27 / 1_000_000,
    output: 1.10 / 1_000_000,
  },
  'deepseek-reasoner': {
    cache_hit: 0.14 / 1_000_000,
    cache_miss: 0.55 / 1_000_000,
    output: 2.19 / 1_000_000,
  },
};

export function calculateCost(usage, model) {
  const p = PRICING[model] ?? PRICING['deepseek-chat'];
  return (usage.prompt_cache_hit_tokens ?? 0) * p.cache_hit
    + (usage.prompt_cache_miss_tokens ?? 0) * p.cache_miss
    + (usage.completion_tokens ?? 0) * p.output;
}
