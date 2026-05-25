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
