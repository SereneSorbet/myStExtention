import { saveBalance, getApiKey } from './storage.js';
import { getCachedApiKey } from './interceptor.js';

const BALANCE_URL = 'https://api.deepseek.com/user/balance';

export function parseBalanceResponse(data) {
  try {
    if (!data?.is_available || !data.balance_infos?.length) return null;
    const info = data.balance_infos[0];
    return { amount: info.total_balance, currency: info.currency, queried_at: Date.now() };
  } catch { return null; }
}

export function formatBalance(info) {
  if (!info) return '—';
  const symbol = info.currency === 'CNY' ? '¥' : '$';
  return `${symbol}${info.amount}`;
}

function _getKeyFromST() {
  // Try SillyTavern globals where the API key might be stored
  return window.oai_settings?.api_key_openai
      || window.secret_state?.openai
      || null;
}

export async function fetchBalance() {
  const key = getCachedApiKey() ?? getApiKey() ?? _getKeyFromST();
  if (!key) return;
  try {
    const resp = await fetch(BALANCE_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!resp.ok) return;
    const data = await resp.json();
    const parsed = parseBalanceResponse(data);
    if (parsed) {
      saveBalance(parsed);
      window.dispatchEvent(new CustomEvent('ds-balance-updated', { detail: parsed }));
    }
  } catch { }
}
