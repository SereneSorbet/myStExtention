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
