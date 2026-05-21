(function () {
  async function checkout(ctx) {
    const items = window.posCart.getItems();
    if (!items.length) {
      window.ui.toast('購物車是空的', 'error');
      return;
    }
    const discount = Number(document.getElementById('fieldDiscount')?.value || 0);
    const { subtotal, discount: disc, total } = window.posCart.totals(discount);
    const staff = ctx.getStaff();
    window.ui.setLoading(true, '結帳中…');
    try {
      const order = await window.posApi.createOrder({
        mode: 'sale',
        payment_method: document.getElementById('fieldPayment')?.value || 'Cash',
        payment_status: document.getElementById('fieldPayStatus')?.value || 'Paid',
        customer_name: document.getElementById('fieldName')?.value || null,
        contact: document.getElementById('fieldContact')?.value || null,
        email: document.getElementById('fieldEmail')?.value || null,
        discount: disc,
        note: document.getElementById('fieldNote')?.value || null,
        subtotal,
        discount_amount: disc,
        total,
        staff_id: staff?.id || null,
      }, items);
      await window.posApi.applyStockDeltas(items, -1);
      for (const i of items) {
        await window.posApi.addMovement({
          product_id: i.product_id,
          delta: -i.qty,
          reason: 'sale',
          order_id: order.id,
          staff_id: staff?.id,
        });
      }
      window.posCart.clear();
      window.ui.toast(`結帳成功 #${order.id}`, 'success');
      await ctx.reloadProducts();
    } catch (e) {
      console.error(e);
      window.ui.toast(`結帳失敗: ${e.message}`, 'error');
    } finally {
      window.ui.setLoading(false);
    }
  }

  window.posModes = window.posModes || {};
  window.posModes.sale = { checkout };
})();
