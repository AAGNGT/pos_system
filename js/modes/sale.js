(function () {
  let dueAmount = 0;
  let receivedValue = 0;
  let appCtx = null;
  function formatMoney(n) {
    const val = Number(n) || 0;
    const absVal = Math.abs(val);
    return `${val < 0 ? '-' : ''}$${absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(2)}`;
  }
  function parseReceived() {
    return receivedValue;
  }
  function getModal() {
    return document.getElementById('checkoutModal');
  }
  function updateCheckoutDisplay() {
    const received = Math.round(parseReceived() * 100) / 100;
    const due = Math.round(dueAmount * 100) / 100;
    const change = Math.max(0, Math.round((received - due) * 100) / 100);
    const dueEl = document.getElementById('checkoutDue');
    const recEl = document.getElementById('checkoutReceived');
    const chEl = document.getElementById('checkoutChange');
    const confirmBtn = document.getElementById('btnCheckoutConfirm');
    if (dueEl) dueEl.textContent = formatMoney(due);
    if (recEl) recEl.textContent = formatMoney(received);
    if (chEl) chEl.textContent = formatMoney(change);
    if (confirmBtn) confirmBtn.disabled = received < due - 0.001 || due <= 0;
  }
  function openCheckoutModal(ctx) {
    appCtx = ctx || appCtx || (window.posApp?.ctx?.());
    const items = window.posCart.getItems();
    if (!items.length) { window.ui.toast('購物車為空', 'error'); return; }
    
    const discount = Number(document.getElementById('fieldDiscount')?.value || 0);
    const { total } = window.posCart.totals(discount);
    if (total <= 0) { window.ui.toast('結帳金額不能為 0', 'error'); return; }
    
    dueAmount = Math.round(total * 100) / 100;
    receivedValue = 0;
    updateCheckoutDisplay();
    
    const modal = getModal();
    if (!modal) return;
    
    document.body.classList.add('checkout-open');
    window.ui.openModal(modal);
    window.posDisplaySync?.syncCheckout?.(dueAmount);
  }
  function closeCheckoutModal() {
    const modal = getModal();
    window.ui.closeModal(modal, () => {
      document.body.classList.remove('checkout-open');
      receivedValue = 0;
      dueAmount = 0;
      if (window.posCart?.getItems?.()?.length) {
        window.posDisplaySync?.syncCart?.();
      }
    });
  }
  function handleKey(key) {
    if (key === 'back') {
      receivedValue = Math.floor(receivedValue / 10);
    } else if (key === '00') {
      receivedValue = Math.min(receivedValue * 100, 9999999);
    } else {
      const digit = parseInt(key, 10);
      receivedValue = Math.min(receivedValue * 10 + digit, 9999999);
    }
    updateCheckoutDisplay();
  }
  function setExactAmount() {
    receivedValue = Math.round(dueAmount * 100) / 100;
    updateCheckoutDisplay();
  }
  function bindCheckoutModal(ctx) {
    appCtx = ctx || appCtx;
    if (window.__posCheckoutBound) return;
    window.__posCheckoutBound = true;
    document.getElementById('btnExactAmount')?.addEventListener('click', setExactAmount);
    document.getElementById('btnCheckoutCancel')?.addEventListener('click', closeCheckoutModal);
    document.getElementById('btnCheckoutConfirm')?.addEventListener('click', () => confirmCheckout(appCtx));
    document.getElementById('checkoutKeypad')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-key]');
      if (!btn) return;
      e.preventDefault();
      handleKey(btn.dataset.key);
    });
    const modal = getModal();
    const panel = modal?.querySelector('.pos-checkout');
    panel?.addEventListener('click', (e) => e.stopPropagation());
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeCheckoutModal();
    });
  }
  function bindChargeButton() {
    const btn = document.getElementById('btnCharge');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ctx = window.posApp?.ctx?.() || appCtx;
      if (!window.posModes?.sale?.openCheckoutModal) {
        window.ui.toast('結帳模組未載入', 'error');
        return;
      }
      window.posModes.sale.openCheckoutModal(ctx);
    });
  }
  async function confirmCheckout(ctx) {
    const runCtx = ctx || appCtx || window.posApp?.ctx?.();
    const items = window.posCart.getItems();
    if (!items.length) return;
    const received = Math.round(parseReceived() * 100) / 100;
    const due = Math.round(dueAmount * 100) / 100;
    if (received < due - 0.001) {
      window.ui.toast('實收金額不足', 'error');
      return;
    }
    const change = Math.round((received - due) * 100) / 100;
    const discount = Number(document.getElementById('fieldDiscount')?.value || 0);
    const { subtotal, discount: disc, total } = window.posCart.totals(discount);
    const staff = runCtx?.getStaff?.() || null;
    const baseNote = document.getElementById('fieldNote')?.value?.trim() || '';
    const payNote = `實收:${formatMoney(received)} 找續:${formatMoney(change)}`;
    const note = baseNote ? `${baseNote} | ${payNote}` : payNote;
    window.ui.setLoading(true, '結帳中...');
    try {
      const order = await window.posApi.createOrder({
        mode: 'sale',
        payment_method: document.getElementById('fieldPayment')?.value || 'Cash',
        discount: disc,
        note,
        subtotal,
        discount_amount: disc,
        total,
        amount_received: received,
        change_amount: change,
        staff_id: staff?.id || null,
      }, items);
      
      await window.posApi.applyStockDeltas(items, -1);
      for (const i of items) {
        await window.posApi.addMovement({
          product_id: i.product_id,
          delta: -i.qty,
          reason: '銷售扣除',
          order_id: order.id,
          staff_id: staff?.id,
        });
      }
      await window.posDisplaySync?.syncThankYou?.({
        total: due,
        received,
        change,
        order_code: order.order_code || Math.random().toString(36).substring(2, 7).toUpperCase()
      });
      window.posCart.clear();
      closeCheckoutModal();
      window.ui.toast(`訂單 #${order.id} 已完成！找續：${formatMoney(change)}`, 'success');
      if (runCtx?.reloadProducts) await runCtx.reloadProducts();
    } catch (e) {
      console.error(e);
      window.ui.toast(`結帳失敗: ${e.message}`, 'error');
    } finally {
      window.ui.setLoading(false);
    }
  }
  window.posModes = window.posModes || {};
  window.posModes.sale = {
    openCheckoutModal, closeCheckoutModal, bindCheckoutModal, bindChargeButton, confirmCheckout,
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindCheckoutModal(); bindChargeButton();
    });
  } else {
    bindCheckoutModal(); bindChargeButton();
  }
})();
