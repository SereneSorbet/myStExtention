# DeepSeek Usage Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SillyTavern extension that intercepts DeepSeek API responses locally to track token usage, cost, cache hit rate, and account balance with per-request granularity.

**Architecture:** A fetch interceptor monkey-patches `window.fetch` at extension load time. Only DeepSeek chat completion URLs are intercepted; all other traffic passes through unchanged. For streaming responses, `response.body.tee()` splits the stream — one copy goes to SillyTavern, the other is consumed to extract the final `usage` chunk. Captured data is written to localStorage using a tiered retention scheme (30-day full records + permanent daily aggregates). Balance is queried from DeepSeek's API after each complete response, using the API key cached from the intercepted request's Authorization header.

**Tech Stack:** Vanilla JS (ES modules), jQuery (provided by SillyTavern), Jest 29 + jsdom (unit tests), localStorage (persistence), DeepSeek REST API

---

## File Map

| File | Responsibility |
|------|----------------|
| `manifest.json` | SillyTavern extension declaration |
| `index.js` | Entry point — wires interceptor, widget, panel, balance together |
| `src/cost.js` | Pure cost calculation from `usage` object + model name |
| `src/storage.js` | localStorage read/write with 30-day tiered retention |
| `src/interceptor.js` | fetch monkey-patch — handles streaming and non-streaming DeepSeek responses |
| `src/balance.js` | DeepSeek balance API query, API key cache, balance formatting |
| `src/ui/widget.js` | Injects live session summary bar into ST's chat area |
| `src/ui/panel.js` | Slide-in stats panel with time-range filter and balance display |
| `style.css` | Extension styles (widget + panel) |
| `package.json` | Jest dev dependency + ES module config |
| `tests/cost.test.js` | Unit tests for cost calculation |
| `tests/storage.test.js` | Unit tests for storage operations |
| `tests/interceptor.test.js` | Unit tests for URL matching and usage extraction |
| `tests/balance.test.js` | Unit tests for balance parsing and formatting |

---

### Task 1: Scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `index.js`
- Create: `style.css`

- [ ] **Step 1: Create manifest.json**

```json
{
  "display_name": "DeepSeek Usage Tracker",
  "loading_order": 10,
  "requires": [],
  "optional": [],
  "js": "index.js",
  "css": "style.css",
  "author": "",
  "version": "1.0.0",
  "homePage": "",
  "auto": true
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "deepseek-usage-tracker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0"
  },
  "jest": {
    "testEnvironment": "jsdom",
    "transform": {}
  }
}
```

- [ ] **Step 3: Install dev dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create index.js skeleton**

```js
import { initInterceptor } from './src/interceptor.js';
import { initWidget, updateWidget } from './src/ui/widget.js';
import { initPanel } from './src/ui/panel.js';
import { fetchBalance } from './src/balance.js';

const SESSION_ID = Date.now().toString(36);

jQuery(async () => {
  initInterceptor(SESSION_ID, (record) => {
    updateWidget(record);
    fetchBalance();
  });
  initWidget();
  initPanel();
  window.addEventListener('ds-balance-refresh-requested', () => fetchBalance());
});
```

- [ ] **Step 5: Create style.css skeleton**

```css
/* populated in Tasks 6 and 7 */
```

- [ ] **Step 6: Commit**

```bash
git init
git add manifest.json package.json index.js style.css
git commit -m "feat: scaffold extension structure"
```

---

### Task 2: Cost Calculation

**Files:**
- Create: `src/cost.js`
- Create: `tests/cost.test.js`

- [ ] **Step 1: Write failing tests**

`tests/cost.test.js`:
```js
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
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/cost.test.js`
Expected: FAIL — `Cannot find module '../src/cost.js'`

- [ ] **Step 3: Implement src/cost.js**

```js
// Prices in USD per token. Update when DeepSeek changes their published rates.
export const PRICING = {
  'deepseek-chat': {
    cache_hit:  0.07  / 1_000_000,
    cache_miss: 0.27  / 1_000_000,
    output:     1.10  / 1_000_000,
  },
  'deepseek-reasoner': {
    cache_hit:  0.14  / 1_000_000,
    cache_miss: 0.55  / 1_000_000,
    output:     2.19  / 1_000_000,
  },
};

export function calculateCost(usage, model) {
  const p = PRICING[model] ?? PRICING['deepseek-chat'];
  return (usage.prompt_cache_hit_tokens  ?? 0) * p.cache_hit
       + (usage.prompt_cache_miss_tokens ?? 0) * p.cache_miss
       + (usage.completion_tokens        ?? 0) * p.output;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/cost.test.js`
Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/cost.js tests/cost.test.js
git commit -m "feat: add cost calculation with DeepSeek pricing"
```

---

### Task 3: Storage Module

**Files:**
- Create: `src/storage.js`
- Create: `tests/storage.test.js`

- [ ] **Step 1: Write failing tests**

`tests/storage.test.js`:
```js
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
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/storage.test.js`
Expected: FAIL — `Cannot find module '../src/storage.js'`

- [ ] **Step 3: Implement src/storage.js**

```js
const KEYS = {
  RECENT:  'ds_tracker_recent',
  DAILY:   'ds_tracker_daily',
  BALANCE: 'ds_tracker_balance',
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/storage.test.js`
Expected: PASS — 8 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/storage.js tests/storage.test.js
git commit -m "feat: add tiered localStorage storage module"
```

---

### Task 4: Fetch Interceptor

**Files:**
- Create: `src/interceptor.js`
- Create: `tests/interceptor.test.js`

- [ ] **Step 1: Write failing tests for pure functions**

`tests/interceptor.test.js`:
```js
import { isDeepSeekChatUrl, extractUsageFromChunks, buildRecord } from '../src/interceptor.js';

describe('isDeepSeekChatUrl', () => {
  test('matches deepseek chat completions URL', () => {
    expect(isDeepSeekChatUrl('https://api.deepseek.com/v1/chat/completions')).toBe(true);
  });
  test('does not match openai URL', () => {
    expect(isDeepSeekChatUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
  });
  test('does not match deepseek balance URL', () => {
    expect(isDeepSeekChatUrl('https://api.deepseek.com/user/balance')).toBe(false);
  });
  test('handles invalid URL without throwing', () => {
    expect(isDeepSeekChatUrl('not-a-url')).toBe(false);
  });
});

describe('extractUsageFromChunks', () => {
  test('extracts usage from final SSE chunk', () => {
    const text = [
      'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":null}',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":80,"prompt_cache_miss_tokens":20}}',
      'data: [DONE]',
    ].join('\n');
    const usage = extractUsageFromChunks(text);
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.prompt_cache_hit_tokens).toBe(80);
  });
  test('returns null when no usage present', () => {
    expect(extractUsageFromChunks('data: [DONE]\n')).toBeNull();
  });
  test('skips chunks where usage is null', () => {
    expect(extractUsageFromChunks('data: {"usage":null}\n')).toBeNull();
  });
});

describe('buildRecord', () => {
  test('maps usage fields to record fields', () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 };
    const r = buildRecord(usage, 'deepseek-chat', 'sess-1');
    expect(r.input_tokens).toBe(100);
    expect(r.output_tokens).toBe(50);
    expect(r.cache_hit_tokens).toBe(60);
    expect(r.cache_miss_tokens).toBe(40);
    expect(r.model).toBe('deepseek-chat');
    expect(r.session_id).toBe('sess-1');
    expect(typeof r.cost_usd).toBe('number');
    expect(typeof r.timestamp).toBe('number');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/interceptor.test.js`
Expected: FAIL — `Cannot find module '../src/interceptor.js'`

- [ ] **Step 3: Implement src/interceptor.js**

```js
import { calculateCost } from './cost.js';
import { saveRecord } from './storage.js';

export function isDeepSeekChatUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('deepseek.com') && u.pathname.includes('/chat/completions');
  } catch { return false; }
}

export function extractUsageFromChunks(text) {
  let last = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed.usage) last = parsed.usage;
    } catch { }
  }
  return last;
}

export function buildRecord(usage, model, sessionId) {
  return {
    timestamp:         Date.now(),
    model,
    session_id:        sessionId,
    input_tokens:      usage.prompt_tokens              ?? 0,
    output_tokens:     usage.completion_tokens          ?? 0,
    cache_hit_tokens:  usage.prompt_cache_hit_tokens    ?? 0,
    cache_miss_tokens: usage.prompt_cache_miss_tokens   ?? 0,
    cost_usd:          calculateCost(usage, model),
  };
}

let _cachedApiKey = null;

export function cacheApiKey(key) {
  if (key) _cachedApiKey = key;
}

export function getCachedApiKey() {
  return _cachedApiKey;
}

export function initInterceptor(sessionId, onRecord) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (url, options = {}) {
    const response = await originalFetch(url, options);

    if (!isDeepSeekChatUrl(url)) return response;

    // Cache API key from Authorization header for balance queries
    const auth = options?.headers?.['Authorization']
               ?? options?.headers?.get?.('Authorization')
               ?? '';
    if (auth.startsWith('Bearer ')) cacheApiKey(auth.slice(7));

    try {
      const model = _extractModel(options);
      const ct = response.headers.get('content-type') ?? '';

      if (ct.includes('text/event-stream')) {
        const [forST, forUs] = response.body.tee();
        _consumeStream(forUs, model, sessionId, onRecord);
        return new Response(forST, { status: response.status, statusText: response.statusText, headers: response.headers });
      } else {
        const clone = response.clone();
        clone.json().then(data => {
          if (data.usage) {
            const record = buildRecord(data.usage, model, sessionId);
            saveRecord(record);
            onRecord(record);
          }
        }).catch(() => {});
        return response;
      }
    } catch {
      return response;
    }
  };
}

async function _consumeStream(stream, model, sessionId, onRecord) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
    const usage = extractUsageFromChunks(buffer);
    if (usage) {
      const record = buildRecord(usage, model, sessionId);
      saveRecord(record);
      onRecord(record);
    }
  } catch { }
}

function _extractModel(options) {
  try { return JSON.parse(options?.body ?? '{}').model ?? 'deepseek-chat'; }
  catch { return 'deepseek-chat'; }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/interceptor.test.js`
Expected: PASS — 8 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/interceptor.js tests/interceptor.test.js
git commit -m "feat: add fetch interceptor for streaming and non-streaming DeepSeek responses"
```

---

### Task 5: Balance Module

**Files:**
- Create: `src/balance.js`
- Create: `tests/balance.test.js`

- [ ] **Step 1: Write failing tests**

`tests/balance.test.js`:
```js
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
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- tests/balance.test.js`
Expected: FAIL — `Cannot find module '../src/balance.js'`

- [ ] **Step 3: Implement src/balance.js**

```js
import { saveBalance } from './storage.js';
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

export async function fetchBalance() {
  const key = getCachedApiKey();
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tests/balance.test.js`
Expected: PASS — 7 tests passed

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — all tests in all files pass

- [ ] **Step 6: Commit**

```bash
git add src/balance.js tests/balance.test.js
git commit -m "feat: add balance query module"
```

---

### Task 6: Widget UI

**Files:**
- Create: `src/ui/widget.js`
- Modify: `style.css`

- [ ] **Step 1: Create src/ui/widget.js**

```js
const WIDGET_ID = 'ds-tracker-widget';

const SESSION = { input: 0, output: 0, cacheHit: 0, cacheMiss: 0, costUsd: 0 };

export function initWidget() {
  if (document.getElementById(WIDGET_ID)) return;

  const el = document.createElement('div');
  el.id = WIDGET_ID;
  el.innerHTML = `
    <span class="ds-label">本次会话</span>
    <span class="ds-stat">↑<span id="ds-w-in">0</span></span>
    <span class="ds-stat">↓<span id="ds-w-out">0</span></span>
    <span class="ds-stat">命中<span id="ds-w-cache">—</span></span>
    <span class="ds-stat">$<span id="ds-w-cost">0.0000</span></span>
    <button id="ds-panel-btn" title="查看详细统计">📊</button>
  `;

  const anchor = document.getElementById('send_form') ?? document.getElementById('form_sheld');
  if (anchor) anchor.insertBefore(el, anchor.firstChild);
  else document.body.appendChild(el);

  document.getElementById('ds-panel-btn')
    ?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ds-panel-toggle')));
}

export function updateWidget(record) {
  SESSION.input    += record.input_tokens;
  SESSION.output   += record.output_tokens;
  SESSION.cacheHit += record.cache_hit_tokens;
  SESSION.cacheMiss += record.cache_miss_tokens;
  SESSION.costUsd  += record.cost_usd;

  const cacheable = SESSION.cacheHit + SESSION.cacheMiss;
  const cacheRate = cacheable > 0 ? Math.round(SESSION.cacheHit / cacheable * 100) + '%' : '—';

  _set('ds-w-in',    _fmt(SESSION.input));
  _set('ds-w-out',   _fmt(SESSION.output));
  _set('ds-w-cache', cacheRate);
  _set('ds-w-cost',  SESSION.costUsd.toFixed(4));
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
```

- [ ] **Step 2: Add widget styles to style.css**

```css
#ds-tracker-widget {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: 0.78em;
  color: var(--SmartThemeBodyColor, #ccc);
  border-top: 1px solid var(--SmartThemeBorderColor, #444);
  flex-wrap: wrap;
}
#ds-tracker-widget .ds-label { opacity: 0.6; }
#ds-tracker-widget .ds-stat  { white-space: nowrap; }
#ds-panel-btn {
  background: none; border: none; cursor: pointer;
  font-size: 1.1em; margin-left: auto;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/widget.js style.css
git commit -m "feat: add live session widget"
```

---

### Task 7: Stats Panel UI

**Files:**
- Create: `src/ui/panel.js`
- Modify: `style.css`

- [ ] **Step 1: Create src/ui/panel.js**

```js
import { getRecentRecords, getBalance } from '../storage.js';
import { formatBalance } from '../balance.js';

const PANEL_ID = 'ds-tracker-panel';

export function initPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.className = 'ds-panel ds-hidden';
  el.innerHTML = `
    <div class="ds-ph">
      <span>DeepSeek 用量追踪</span>
      <button id="ds-pc">×</button>
    </div>
    <div class="ds-bal-row">
      <span>账户余额</span>
      <span id="ds-bal-val">—</span>
      <button id="ds-bal-btn">刷新</button>
    </div>
    <div class="ds-tabs">
      <button class="ds-tab active" data-d="1">今天</button>
      <button class="ds-tab" data-d="7">7天</button>
      <button class="ds-tab" data-d="30">30天</button>
    </div>
    <div class="ds-summary">
      <div>Token 用量<span id="ds-p-tok">—</span></div>
      <div>缓存命中率<span id="ds-p-cache">—</span></div>
      <div>累计费用<span id="ds-p-cost">—</span></div>
    </div>
    <div class="ds-rec-hdr">最近请求</div>
    <div id="ds-p-list" class="ds-rec-list"></div>
  `;
  document.body.appendChild(el);

  document.getElementById('ds-pc').addEventListener('click', () => el.classList.add('ds-hidden'));
  document.getElementById('ds-bal-btn').addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ds-balance-refresh-requested')));

  el.querySelectorAll('.ds-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.ds-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _refresh(Number(btn.dataset.d));
    });
  });

  window.addEventListener('ds-panel-toggle', () => {
    el.classList.toggle('ds-hidden');
    if (!el.classList.contains('ds-hidden')) _refresh(1);
  });

  window.addEventListener('ds-balance-updated', e => {
    document.getElementById('ds-bal-val').textContent = formatBalance(e.detail);
  });

  const cached = getBalance();
  if (cached) document.getElementById('ds-bal-val').textContent = formatBalance(cached);
}

function _refresh(days) {
  const records = getRecentRecords(days);
  _summary(records);
  _list(records);
}

function _summary(records) {
  const t = records.reduce((a, r) => {
    a.tokens += r.input_tokens + r.output_tokens;
    a.hit    += r.cache_hit_tokens;
    a.miss   += r.cache_miss_tokens;
    a.cost   += r.cost_usd;
    return a;
  }, { tokens: 0, hit: 0, miss: 0, cost: 0 });

  const cacheable = t.hit + t.miss;
  const cacheRate = cacheable > 0 ? Math.round(t.hit / cacheable * 100) + '%' : '—';

  document.getElementById('ds-p-tok').textContent   = t.tokens.toLocaleString();
  document.getElementById('ds-p-cache').textContent = cacheRate;
  document.getElementById('ds-p-cost').textContent  = '$' + t.cost.toFixed(4);
}

function _list(records) {
  const el = document.getElementById('ds-p-list');
  const rows = [...records].reverse().slice(0, 50);
  if (!rows.length) { el.innerHTML = '<div class="ds-empty">暂无记录</div>'; return; }

  el.innerHTML = rows.map(r => {
    const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const cacheable = r.cache_hit_tokens + r.cache_miss_tokens;
    const hitPct = cacheable > 0 ? Math.round(r.cache_hit_tokens / cacheable * 100) + '%' : '—';
    return `<div class="ds-row">
      <span class="ds-rt">${time}</span>
      <span>↑${_fmt(r.input_tokens)} ↓${_fmt(r.output_tokens)}</span>
      <span>命中${hitPct}</span>
      <span>$${r.cost_usd.toFixed(4)}</span>
    </div>`;
  }).join('');
}

function _fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
```

- [ ] **Step 2: Add panel styles to style.css**

```css
.ds-panel {
  position: fixed; top: 0; right: 0;
  width: 300px; height: 100vh;
  background: var(--SmartThemeBlurTintColor, #1a1a1a);
  border-left: 1px solid var(--SmartThemeBorderColor, #444);
  z-index: 9999; display: flex; flex-direction: column;
  font-size: 0.85em; color: var(--SmartThemeBodyColor, #ccc); overflow: hidden;
}
.ds-panel.ds-hidden { display: none; }
.ds-ph {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
  font-weight: bold;
}
#ds-pc { background: none; border: none; color: inherit; cursor: pointer; font-size: 1.2em; }
.ds-bal-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
}
#ds-bal-val { margin-left: auto; font-weight: bold; }
#ds-bal-btn {
  background: none; border: 1px solid var(--SmartThemeBorderColor, #555);
  color: inherit; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.85em;
}
.ds-tabs { display: flex; padding: 8px 16px; gap: 6px; }
.ds-tab {
  flex: 1; background: none; border: 1px solid var(--SmartThemeBorderColor, #555);
  color: inherit; border-radius: 4px; padding: 4px 0; cursor: pointer;
}
.ds-tab.active { background: var(--SmartThemeQuoteColor, #4a90d9); border-color: transparent; color: #fff; }
.ds-summary {
  padding: 8px 16px 12px; border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
  display: flex; flex-direction: column; gap: 4px;
}
.ds-summary div { display: flex; justify-content: space-between; }
.ds-rec-hdr { padding: 8px 16px 4px; opacity: 0.6; font-size: 0.85em; }
.ds-rec-list { flex: 1; overflow-y: auto; padding: 0 8px; }
.ds-row {
  display: flex; gap: 8px; padding: 5px 8px;
  border-radius: 4px; font-size: 0.85em;
}
.ds-row:hover { background: rgba(255,255,255,0.05); }
.ds-rt { opacity: 0.6; min-width: 40px; }
.ds-empty { padding: 16px; text-align: center; opacity: 0.5; }
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/panel.js style.css
git commit -m "feat: add slide-in stats panel"
```

---

### Task 8: Final Integration Check

**Files:**
- Verify: `index.js` (already complete from Task 1 Step 4)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS — all tests across all files pass, 0 failures

- [ ] **Step 2: Commit if any files changed**

```bash
git status
# If anything unstaged:
git add -A
git commit -m "feat: complete integration wiring"
```

---

### Task 9: Install in SillyTavern and Manual Test

- [ ] **Step 1: Find your SillyTavern installation path**

SillyTavern is typically at `C:\path\to\SillyTavern\`. Extensions live in:
`<SillyTavern>\public\scripts\extensions\third-party\`

- [ ] **Step 2: Create a symlink (run PowerShell as Administrator)**

```powershell
New-Item -ItemType SymbolicLink `
  -Path "<ST path>\public\scripts\extensions\third-party\deepseek-usage-tracker" `
  -Target "D:\.mySpace\mySpace\SillyTavernExtention"
```

Or copy the folder manually if symlink is not preferred.

- [ ] **Step 3: Enable in SillyTavern**

Open SillyTavern → click the Extensions icon (puzzle piece) → find "DeepSeek Usage Tracker" → toggle on.

- [ ] **Step 4: Verify widget appears**

Expected: A bar reading `本次会话 ↑0 ↓0 命中— $0.0000 📊` appears in the chat area.

- [ ] **Step 5: Send one message using the DeepSeek model**

Expected after the response finishes streaming:
- Widget counters update with real token numbers
- Cache hit % appears (may be `—` if first message has no cached context)
- Cost shows a non-zero value

- [ ] **Step 6: Open the panel and verify all sections**

Click 📊.
Expected:
- Balance row shows a ¥ or $ amount
- Today's summary matches widget totals
- Recent requests list shows the message with correct time, token counts, and cost

- [ ] **Step 7: Test time range switching**

Click "7天" then "30天".
Expected: Numbers update (same as Today if you just installed; will differ as history accumulates).

- [ ] **Step 8: Test manual balance refresh**

Click "刷新" in the panel.
Expected: Balance value refreshes (network request fires, value updates or stays same if unchanged).
