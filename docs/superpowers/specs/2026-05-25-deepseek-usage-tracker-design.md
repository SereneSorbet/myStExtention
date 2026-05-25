# DeepSeek Usage Tracker — SillyTavern Extension Design

**Date:** 2026-05-25  
**Status:** Approved

---

## Problem

DeepSeek's official dashboard only shows daily totals for the past month. Users cannot see per-request usage, hourly/weekly trends, cache hit rates, or real-time balance with adequate granularity. OpenRouter provides this visibility; direct DeepSeek API users have no equivalent.

## Goal

A SillyTavern extension that intercepts DeepSeek API responses locally and provides detailed usage analytics — token counts, cost estimates, cache hit rates, and account balance — without any external service dependency.

---

## Architecture

### Implementation Approach: Fetch Interceptor

Monkey-patch the browser's native `fetch` at extension load time. Only DeepSeek API URLs are intercepted (domain check). Requests are not modified — only responses are read after they arrive. The interceptor is wrapped in `try-catch` so any failure silently no-ops without affecting chat functionality.

**Streaming handling:** SillyTavern uses streaming responses (SSE). The `usage` object (including cache hit tokens) appears in the final SSE chunk. The interceptor buffers stream chunks, extracts `usage` from the last chunk, then releases the original stream to SillyTavern unchanged.

### File Structure

```
SillyTavernExtension/
├── manifest.json          # ST extension declaration
├── index.js               # Entry: registers fetch interceptor, initializes UI
├── src/
│   ├── interceptor.js     # Fetch interceptor — extracts usage from responses
│   ├── storage.js         # Tiered localStorage read/write logic
│   ├── balance.js         # Balance query on message send + manual refresh
│   └── ui/
│       ├── widget.js      # Inline chat widget (session summary bar)
│       └── panel.js       # Slide-in stats panel
└── style.css
```

### Data Flow

```
DeepSeek API response
  └─► interceptor.js  (extract usage object)
        └─► storage.js  (write to localStorage)
              └─► widget.js  (update live display)

User sends message
  └─► balance.js  (query DeepSeek balance API)
        └─► localStorage ds_balance  (cache result)
              └─► panel.js  (update balance display)
```

---

## Data Model

### Per-Request Record

```json
{
  "timestamp": 1716624000000,
  "model": "deepseek-chat",
  "input_tokens": 1200,
  "output_tokens": 340,
  "cache_hit_tokens": 800,
  "cache_miss_tokens": 400,
  "cost_usd": 0.000412,
  "session_id": "abc123"
}
```

### localStorage Keys

| Key | Content | Retention |
|-----|---------|-----------|
| `ds_records_recent` | Full per-request records (last 30 days) | Entries older than 30 days pruned on each write |
| `ds_records_daily` | Historical daily aggregates `{date, tokens, cost, cache_hit_rate}` | Permanent; written once per day during pruning |
| `ds_balance` | `{amount, currency, queried_at}` | Overwritten on each balance fetch |

**Estimated storage:** ~300 KB for 30 days at 100 requests/day + ~50 KB for 1 year of daily aggregates. Well within the 5–10 MB localStorage limit.

---

## UI

### Chat Widget (always visible, above send bar)

```
┌─────────────────────────────────────────┐
│ 本次会话  ↑1.2k ↓340  命中62%  $0.0041  📊│
└─────────────────────────────────────────┘
```

- Updates after each message
- `↑` = input tokens, `↓` = output tokens
- Cache hit % = `cache_hit_tokens / (cache_hit_tokens + cache_miss_tokens)`
- Click 📊 to open the stats panel

### Stats Panel (slides in from right on click)

```
┌──────────────────────────────┐
│ DeepSeek 用量追踪        [×] │
├──────────────────────────────┤
│ 账户余额   ¥12.34    [刷新] │
├──────────────────────────────┤
│ 时间范围: [今天] [7天] [30天]│
│                              │
│ Token 用量   48,230          │
│ 缓存命中率   71%             │
│ 累计费用     $0.82           │
├──────────────────────────────┤
│ 最近请求记录                 │
│ 14:32  ↑1.2k ↓340  $0.004  │
│ 14:18  ↑980  ↓210  $0.003  │
└──────────────────────────────┘
```

- Time range filter reads from localStorage — no re-fetch needed
- Balance refreshes automatically after each complete response is received
- Manual "刷新" button for on-demand balance check without sending a message

---

## Balance Querying

- **Trigger:** After each complete response is received (stream ends) — piggybacks on the same moment the interceptor extracts usage data, so the balance reflects the actual spend for that turn
- **Source:** Reads the DeepSeek API key already configured in SillyTavern — no separate config required
- **Endpoint:** DeepSeek user balance API (`/user/balance`)
- **Caching:** Result stored in `ds_balance`; panel reads from cache for instant display
- **Manual refresh:** "刷新" button in panel for queries outside of active chat

---

## Cost Calculation

Costs calculated client-side using DeepSeek's published pricing at extension load time. Cache hit tokens are billed at the discounted cache rate; cache miss tokens at the standard input rate. Pricing constants defined in a single config object for easy update if DeepSeek changes rates.

---

## Error Handling

- Interceptor failures are silent (wrapped in try-catch) — chat is never disrupted
- Balance API failures show last cached value with a stale indicator
- If `usage` object is absent from a response (non-DeepSeek model or unexpected format), the record is skipped silently
