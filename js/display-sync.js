(function () {
  const DISPLAY_ID = 1;
  let thankYouTimer = null;
  let thankYouActive = false;

  // 1. 新增 debounce 函數 (延遲執行)
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  function isThankYouActive() {
    return thankYouActive;
  }

  function getClient() {
    return window.posDb?.getClient?.();
  }

  function getDiscount() {
    return Number(document.getElementById('fieldDiscount')?.value || 0);
  }

  function buildPayload(overrides) {
    const items = window.posCart?.getItems?.() || [];
    const { subtotal, discount, total } = window.posCart?.totals?.(getDiscount()) || {
      subtotal: 0,
      discount: 0,
      total: 0,
    };
    return {
      id: DISPLAY_ID,
      session_key: 'main',
      items: items.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        code: i.code,
        image_url: window.posProductThumb?.resolveThumb?.(i, window.posProductCatalog) || null,
        qty: i.qty,
        unit_price: i.unit_price,
        line_total: i.line_total,
      })),
      subtotal,
      discount,
      total,
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  // 2. 將實際的 Upsert 動作包裝成 Debounced 版本 (延遲 400 毫秒)
  const debouncedUpsert = debounce(async (payload) => {
    const client = getClient();
    if (!client) return;
    try {
      const { error } = await client.from('pos_display_state').upsert(payload, { onConflict: 'id' });
      if (error) console.warn('[display-sync]', error.message);
    } catch (e) {
      console.warn('[display-sync]', e);
    }
  }, 300);

  // 3. 改寫 pushState，加入 immediate 參數控制是否需要即時同步
  async function pushState(payload, immediate = false) {
    if (immediate) {
      const client = getClient();
      if (!client) return;
      try {
        await client.from('pos_display_state').upsert(payload, { onConflict: 'id' });
      } catch (e) {
        console.warn('[display-sync]', e);
      }
    } else {
      // 購物車變更會走這裡，過濾掉頻繁的重複寫入
      debouncedUpsert(payload);
    }
  }

  async function syncIdle() {
    if (thankYouActive) return;
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    // 閒置狀態可以延遲同步
    await pushState(buildPayload({
      phase: 'idle',
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      amount_received: 0,
      change_amount: 0,
    }));
  }

  async function syncCart() {
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    thankYouActive = false;
    const items = window.posCart?.getItems?.() || [];
    if (!items.length) {
      await syncIdle();
      return;
    }
    // 購物車更新使用延遲同步，防止連續按 + 號時產生大量請求
    await pushState(buildPayload({ phase: 'cart', amount_received: 0, change_amount: 0 }));
  }

  async function syncCheckout(total) {
    const t = Number(total) || 0;
    // 結帳畫面必須「立刻」彈出，設定 immediate = true
    await pushState(buildPayload({
      phase: 'checkout',
      total: t,
      amount_received: 0,
      change_amount: 0,
    }), true);
  }

  async function syncThankYou({ total, received, change, order_code }) {
    thankYouActive = true;
    // 感謝與找續畫面必須「立刻」彈出，設定 immediate = true
    await pushState(buildPayload({
      phase: 'thankyou',
      total: Number(total) || 0,
      amount_received: Number(received) || 0,
      change_amount: Number(change) || 0,
      order_code: order_code || null 
    }), true);
    
    if (thankYouTimer) clearTimeout(thankYouTimer);
    thankYouTimer = setTimeout(() => {
      thankYouTimer = null;
      thankYouActive = false;
      syncIdle();
    }, 25000); 
  }

  async function syncFromRegister() {
    const items = window.posCart?.getItems?.() || [];
    if (items.length) await syncCart();
    else if (!thankYouActive) await syncIdle();
  }

  async function resetDisplay() {
    thankYouActive = false;
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    // 重置指令必須立刻執行，設定 immediate = true
    await pushState({
      id: DISPLAY_ID,
      session_key: 'main',
      phase: 'idle',
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      amount_received: 0,
      change_amount: 0,
      updated_at: new Date().toISOString(),
    }, true);
  }

  window.posDisplaySync = {
    syncIdle,
    syncCart,
    syncCheckout,
    syncThankYou,
    syncFromRegister,
    resetDisplay,
    isThankYouActive,
  };
})();