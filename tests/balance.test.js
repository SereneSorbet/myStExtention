import { parseBalanceResponse, formatBalance } from '../src/balance.js';

describe('parseBalanceResponse', () => {
  test('extracts amount and currency from valid response', () => {
    const r = parseBalanceResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '0', topped_up_balance: '12.34' }],
    });
    expect(r.amount).toBe('12.34');
    expect(r.currency).toBe('CNY');
  });
  test('returns null when is_available is false', () => {
    expect(parseBalanceResponse({ is_available: false, balance_infos: [] })).toBeNull();
  });
  test('returns null for null input', () => {
    expect(parseBalanceResponse(null)).toBeNull();
  });
  test('returns null for empty balance_infos', () => {
    expect(parseBalanceResponse({ is_available: true, balance_infos: [] })).toBeNull();
  });
});

describe('formatBalance', () => {
  test('formats CNY with ¥', () => {
    expect(formatBalance({ amount: '12.34', currency: 'CNY' })).toBe('¥12.34');
  });
  test('formats USD with $', () => {
    expect(formatBalance({ amount: '5.00', currency: 'USD' })).toBe('$5.00');
  });
  test('returns — for null', () => {
    expect(formatBalance(null)).toBe('—');
  });
});
