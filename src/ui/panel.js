import { getRecentRecords, getBalance, saveApiKey, getApiKey } from '../storage.js';
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
    <div class="ds-key-row">
      <input id="ds-key-inp" type="password" placeholder="DeepSeek API Key（查余额用）" />
      <button id="ds-key-btn">保存</button>
    </div>
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

  document.getElementById('ds-key-btn').addEventListener('click', () => {
    const val = document.getElementById('ds-key-inp').value.trim();
    if (val) { saveApiKey(val); document.getElementById('ds-key-inp').value = ''; }
  });

  const storedKey = getApiKey();
  if (storedKey) document.getElementById('ds-key-inp').placeholder = 'API Key 已保存';

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
