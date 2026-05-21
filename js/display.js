(function () {
  const DISPLAY_ID = 1;
  let channel = null;
  let storeName = 'POS 商店';

  function formatMoney(n) {
    const v = Math.max(0, Number(n) || 0);
    return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
  }

  function showError(msg) {
    const el = document.getElementById('displayError');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }

  function setView(phase) {
    document.querySelectorAll('.cdisp-view').forEach((v) => {
      v.classList.toggle('active', v.dataset.view === phase);
    });
    const status = document.getElementById('displayStatus');
    if (status) {
      const labels = { idle: '待機', cart: '購物中', checkout: '請付款', thankyou: '多謝惠顧' };
      status.textContent = labels[phase] || phase;
    }
  }

  function renderCart(state) {
    const list = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');
    const items = Array.isArray(state.items) ? state.items : [];
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p style="text-align:center;color:#64748b;font-size:1.2rem">尚無商品</p>';
    } else {
      list.innerHTML = items.map((i) => `
        <div class="cdisp-cart__item">
          <div>
            <p class="cdisp-cart__name">${escapeHtml(i.name)}</p>
            <p class="cdisp-cart__meta">${escapeHtml(i.code || '')} · ${i.qty} × ${formatMoney(i.unit_price)}</p>
          </div>
          <span class="cdisp-cart__line-total">${formatMoney(i.line_total)}</span>
        </div>
      `).join('');
    }
    if (totalEl) totalEl.textContent = formatMoney(state.total);
  }

  function renderCheckout(state) {
    const el = document.getElementById('checkoutAmount');
    if (el) el.textContent = formatMoney(state.total);
  }

  function renderThankYou(state) {
    const total = document.getElementById('thankTotal');
    const received = document.getElementById('thankReceived');
    const change = document.getElementById('thankChange');
    if (total) total.textContent = formatMoney(state.total);
    if (received) received.textContent = formatMoney(state.amount_received);
    if (change) change.textContent = formatMoney(state.change_amount);
  }

  function render(state) {
    if (!state) return;
    const phase = state.phase || 'idle';
    setView(phase);
    if (phase === 'cart') renderCart(state);
    if (phase === 'checkout') renderCheckout(state);
    if (phase === 'thankyou') renderThankYou(state);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  async function loadStoreName(client) {
    try {
      const { data } = await client.from('pos_settings').select('value').eq('key', 'store_name').maybeSingle();
      if (data?.value) storeName = data.value;
      const el = document.getElementById('storeName');
      if (el) el.textContent = storeName;
    } catch (_) { /* ignore */ }
  }

  async function loadInitial(client) {
    const { data, error } = await client
      .from('pos_display_state')
      .select('*')
      .eq('id', DISPLAY_ID)
      .maybeSingle();
    if (error) throw error;
    render(data || { phase: 'idle', items: [] });
  }

  function subscribeRealtime(client) {
    channel = client
      .channel('pos-display-main')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_display_state', filter: `id=eq.${DISPLAY_ID}` },
        (payload) => {
          render(payload.new || payload.old);
        }
      )
      .subscribe((status) => {
        const el = document.getElementById('displayStatus');
        if (status === 'SUBSCRIBED' && el) {
          el.textContent = el.textContent || '已連線';
        }
        if (status === 'CHANNEL_ERROR') {
          showError('Realtime 連線失敗，請在 Supabase 啟用 pos_display_state');
        }
      });
  }

  async function init() {
    if (!window.posDb?.initSupabase?.()) {
      showError('無法連接 Supabase，請檢查 config.js');
      setView('idle');
      return;
    }
    const client = window.posDb.getClient();
    await loadStoreName(client);
    try {
      await loadInitial(client);
      subscribeRealtime(client);
    } catch (e) {
      showError(`載入失敗: ${e.message}`);
      setView('idle');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => {
    if (channel) channel.unsubscribe();
  });
})();
