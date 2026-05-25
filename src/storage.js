const KEYS = {
  RECENT:  'ds_tracker_recent',
  DAILY:   'ds_tracker_daily',
  BALANCE: 'ds_tracker_balance',
  API_KEY: 'ds_tracker_api_key',
};
const RETENTION_DAYS = 30;

export function saveRecord(record) {
  const all = getRecentRecords();
  all.push(record);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const old = all.filter(r => r.timestamp < cutoff);
  const keep = all.filter(r => r.timestamp >= cutoff);
  if (old.length) _archiveRecords(old);
  localStorage.setItem(KEYS.RECENT, JSON.stringify(keep));
}

export function getRecentRecords(days = null) {
  try {
    const all = JSON.parse(localStorage.getItem(KEYS.RECENT) ?? '[]');
    if (days === null) return all;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return all.filter(r => r.timestamp >= cutoff);
  } catch { return []; }
}

export function getDailyAggregates() {
  try { return JSON.parse(localStorage.getItem(KEYS.DAILY) ?? '{}'); }
  catch { return {}; }
}

export function saveBalance(info) {
  localStorage.setItem(KEYS.BALANCE, JSON.stringify(info));
}

export function getBalance() {
  try { return JSON.parse(localStorage.getItem(KEYS.BALANCE) ?? 'null'); }
  catch { return null; }
}

export function saveApiKey(key) {
  localStorage.setItem(KEYS.API_KEY, key);
}

export function getApiKey() {
  return localStorage.getItem(KEYS.API_KEY) ?? null;
}

export function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

function _archiveRecords(records) {
  const daily = getDailyAggregates();
  for (const r of records) {
    const date = new Date(r.timestamp).toISOString().slice(0, 10);
    if (!daily[date]) daily[date] = { input_tokens: 0, output_tokens: 0, cache_hit_tokens: 0, cache_miss_tokens: 0, cost_usd: 0, count: 0 };
    daily[date].input_tokens    += r.input_tokens;
    daily[date].output_tokens   += r.output_tokens;
    daily[date].cache_hit_tokens  += (r.cache_hit_tokens  ?? 0);
    daily[date].cache_miss_tokens += (r.cache_miss_tokens ?? 0);
    daily[date].cost_usd        += r.cost_usd;
    daily[date].count           += 1;
  }
  localStorage.setItem(KEYS.DAILY, JSON.stringify(daily));
}
