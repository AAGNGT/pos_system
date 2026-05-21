(function () {
  const DISPLAY_ID = 1;
  let thankYouTimer = null;
  let thankYouActive = false;

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

  async function pushState(payload) {
    const client = getClient();
    if (!client) return;
    try {
      const { error } = await client.from('pos_display_state').upsert(payload, { onConflict: 'id' });
      if (error) console.warn('[display-sync]', error.message);
    } catch (e) {
      console.warn('[display-sync]', e);
    }
  }

  async function syncIdle() {
    if (thankYouActive) return;
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
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
    const items = window.posCart?.getItems?.() || [];
    if (!items.length) {
      await syncIdle();
      return;
    }
    await pushState(buildPayload({ phase: 'cart', amount_received: 0, change_amount: 0 }));
  }

  async function syncCheckout(total) {
    const t = Number(total) || 0;
    await pushState(buildPayload({
      phase: 'checkout',
      total: t,
      amount_received: 0,
      change_amount: 0,
    }));
  }

  async function syncThankYou({ total, received, change }) {
    thankYouActive = true;
    await pushState(buildPayload({
      phase: 'thankyou',
      total: Number(total) || 0,
      amount_received: Number(received) || 0,
      change_amount: Number(change) || 0,
    }));
    if (thankYouTimer) clearTimeout(thankYouTimer);
    thankYouTimer = setTimeout(() => {
      thankYouTimer = null;
      thankYouActive = false;
      syncIdle();
    }, 8000);
  }

  window.posDisplaySync = {
    syncIdle,
    syncCart,
    syncCheckout,
    syncThankYou,
    isThankYouActive,
  };
})();
