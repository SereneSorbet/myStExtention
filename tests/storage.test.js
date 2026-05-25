import { saveRecord, getRecentRecords, getDailyAggregates, saveBalance, getBalance, clearAll } from '../src/storage.js';

const makeRecord = (overrides = {}) => ({
  timestamp: Date.now(),
  model: 'deepseek-chat',
  input_tokens: 100,
  output_tokens: 50,
  cache_hit_tokens: 60,
  cache_miss_tokens: 40,
  cost_usd: 0.001,
  session_id: 'test',
  ...overrides,
});

beforeEach(() => clearAll());

describe('saveRecord / getRecentRecords', () => {
  test('saves and retrieves a record', () => {
    saveRecord(makeRecord());
    expect(getRecentRecords()).toHaveLength(1);
  });

  test('accumulates multiple records', () => {
    saveRecord(makeRecord());
    saveRecord(makeRecord());
    expect(getRecentRecords()).toHaveLength(2);
  });

  test('prunes records older than 30 days on save', () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    saveRecord(makeRecord({ timestamp: old }));
    saveRecord(makeRecord()); // triggers prune
    expect(getRecentRecords()).toHaveLength(1);
  });

  test('archived records appear in daily aggregates', () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const date = new Date(old).toISOString().slice(0, 10);
    saveRecord(makeRecord({ timestamp: old, input_tokens: 200 }));
    saveRecord(makeRecord());
    expect(getDailyAggregates()[date].input_tokens).toBe(200);
  });

  test('filters by days when days param provided', () => {
    const now = Date.now();
    saveRecord(makeRecord({ timestamp: now - 1000 }));
    saveRecord(makeRecord({ timestamp: now - 8 * 24 * 3600_000 }));
    expect(getRecentRecords(7)).toHaveLength(1);
  });

  test('returns empty array on empty storage', () => {
    expect(getRecentRecords()).toEqual([]);
  });
});

describe('saveBalance / getBalance', () => {
  test('stores and retrieves balance', () => {
    saveBalance({ amount: '12.34', currency: 'CNY', queried_at: Date.now() });
    expect(getBalance().amount).toBe('12.34');
  });

  test('returns null when nothing stored', () => {
    expect(getBalance()).toBeNull();
  });
});
