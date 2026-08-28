(function () {
  const DISPLAY_ID = 1;
  let thankYouTimer = null;
  let thankYouActive = false;
  let currentPromoActive = false; // 新增：追蹤目前的宣傳狀態

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
      subtotal: 0, discount: 0, total: 0,
    };
    return {
      id: DISPLAY_ID,
      session_key: 'main',
      is_promo_active: currentPromoActive, // 新增：將宣傳狀態包裝進 Payload 傳給資料庫
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

  const debouncedUpsert = debounce(async (payload) => {
    const client = getClient();
    if (!client) return;
    try {
      await client.from('pos_display_state').upsert(payload, { onConflict: 'id' });
    } catch (e) {
      console.warn('[display-sync]', e);
    }
  }, 300);

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
      debouncedUpsert(payload);
    }
  }

  // --- 新增：按鈕控制與自動中斷防呆機制 ---
  async function setPromoActive(active) {
    currentPromoActive = active;
    // 只有在系統沒有訂單的情況下，才推播狀態更新
    if (!thankYouActive && window.posCart?.getItems().length === 0) {
      await pushState(buildPayload({ phase: 'idle' }), true);
    }
  }

  function stopPromoInternally() {
    if (currentPromoActive) {
      currentPromoActive = false;
      // 發出事件讓 index.html 的按鈕知道要變回「播放宣傳」
      window.dispatchEvent(new CustomEvent('posPromoStopped'));
    }
  }
  // ----------------------------------------

  async function syncIdle() {
    if (thankYouActive) return;
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    await pushState(buildPayload({ phase: 'idle', items: [], subtotal: 0, discount: 0, total: 0, amount_received: 0, change_amount: 0 }));
  }

  async function syncCart() {
    stopPromoInternally(); // 【防呆】：進入購物車，強制關閉宣傳
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
    await pushState(buildPayload({ phase: 'cart', amount_received: 0, change_amount: 0 }));
  }

  async function syncCheckout(total) {
    stopPromoInternally(); // 【防呆】：進入結帳，強制關閉宣傳
    const t = Number(total) || 0;
    await pushState(buildPayload({ phase: 'checkout', total: t, amount_received: 0, change_amount: 0 }), true);
  }

  async function syncThankYou({ total, received, change, order_code }) {
    stopPromoInternally(); // 【防呆】：結帳完成，強制關閉宣傳
    thankYouActive = true;
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
    stopPromoInternally(); // 【防呆】：重設螢幕時，強制關閉宣傳
    thankYouActive = false;
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    await pushState({
      id: DISPLAY_ID,
      session_key: 'main',
      phase: 'idle',
      is_promo_active: false, // 寫死關閉
      items: [],
      subtotal: 0, discount: 0, total: 0, amount_received: 0, change_amount: 0,
      updated_at: new Date().toISOString(),
    }, true);
  }

  window.posDisplaySync = {
    syncIdle, syncCart, syncCheckout, syncThankYou, syncFromRegister, resetDisplay, isThankYouActive,
    setPromoActive // 匯出控制函數給 app.js 使用
  };
})();
