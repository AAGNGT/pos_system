(function () {
  const DISPLAY_ID = 1;
  let channel = null;
  let storeName = 'POS 商店';

  function formatMoney(n) {
    const val = Number(n) || 0;
    const absVal = Math.abs(val);
    // 正確處理負數顯示，如 -$20
    return `${val < 0 ? '-' : ''}$${absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(2)}`;
  }

  function formatDiscountMoney(n) {
    const v = Math.max(0, Number(n) || 0);
    if (!v) return '';
    const s = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
    return `-$${s}`;
  }

  let errorSeq = 0;
  const errorIds = new Set();
  let productCatalog = [];

  function dismissError(id) {
    const root = document.getElementById('displayErrors');
    const item = root?.querySelector(`[data-error-id="${id}"]`);
    if (item) item.remove();
    errorIds.delete(id);
    if (root && !root.children.length) root.classList.remove('show');
  }

  function showError(msg) {
    const root = document.getElementById('displayErrors');
    if (!root) return;
    const id = `err-${++errorSeq}`;
    errorIds.add(id);
    const item = document.createElement('div');
    item.className = 'cdisp__error-item';
    item.dataset.errorId = id;
    item.innerHTML = `
      <span class="cdisp__error-msg">${escapeHtml(msg)}</span>
      <button type="button" class="cdisp__error-dismiss" aria-label="關閉通知">×</button>
    `;
    item.querySelector('.cdisp__error-dismiss')?.addEventListener('click', () => dismissError(id));
    root.appendChild(item);
    root.classList.add('show');
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
      const thumb = window.posProductThumb;
      list.innerHTML = items.map((i) => {
        const imgSrc = thumb?.thumbSrc?.(i, productCatalog) || thumb?.svgPlaceholder?.(i.name) || '';
        const fallback = thumb?.svgPlaceholder?.(i.name) || '';
        return `
        <div class="cdisp-cart__item">
          <img class="cdisp-cart__thumb" src="${safeImgAttr(imgSrc)}" data-fallback="${safeImgAttr(fallback)}" alt="${escapeHtml(i.name)}" loading="lazy">
          <div class="cdisp-cart__info">
            <p class="cdisp-cart__name">${escapeHtml(i.name)}</p>
            <p class="cdisp-cart__meta">${escapeHtml(i.code || '')} · ${i.qty} × ${formatMoney(i.unit_price)}</p>
          </div>
          <span class="cdisp-cart__line-total">${formatMoney(i.line_total)}</span>
        </div>
      `;
      }).join('');
      list.querySelectorAll('.cdisp-cart__thumb').forEach((img) => {
        img.addEventListener('error', () => {
          const fb = img.dataset.fallback;
          if (fb && img.src !== fb) img.src = fb;
        }, { once: true });
      });
    }
    const discount = Math.max(0, Number(state.discount) || 0);
    const discountWrap = document.getElementById('cartDiscountWrap');
    const discountEl = document.getElementById('cartDiscount');
    const footerRow = document.getElementById('cartFooterRow');
    if (discount > 0) {
      discountWrap?.classList.remove('hidden');
      footerRow?.classList.remove('cdisp-cart__footer-row--single');
      if (discountEl) discountEl.textContent = formatDiscountMoney(discount);
    } else {
      discountWrap?.classList.add('hidden');
      footerRow?.classList.add('cdisp-cart__footer-row--single');
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

  function safeImgAttr(url) {
    const s = String(url || '');
    if (/^\s*javascript:/i.test(s)) return '';
    return s.replace(/"/g, '&quot;');
  }

  async function loadProductCatalog(client) {
    try {
      const { data, error } = await client
        .from('pos_products')
        .select('id, code, name, image_url')
        .eq('is_active', true);
      if (error) throw error;
      productCatalog = data || [];
    } catch (_) {
      productCatalog = [];
    }
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
    await loadProductCatalog(client);
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
