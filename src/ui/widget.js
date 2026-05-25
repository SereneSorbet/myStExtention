import { USD_TO_CNY } from '../cost.js';

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
    <span class="ds-stat">¥<span id="ds-w-cost">0.000</span></span>
    <button id="ds-panel-btn" title="查看详细统计"><span class="ds-icon">◈</span></button>
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
  _set('ds-w-cost',  (SESSION.costUsd * USD_TO_CNY).toFixed(3));
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
