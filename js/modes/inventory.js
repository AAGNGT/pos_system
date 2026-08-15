(function () {
  let selectedProduct = null;
  function bind(ctx) {
    const btn = document.getElementById('btnInvConfirm');
    if (!btn) return;
    btn.onclick = () => confirm(ctx);
  }
  function selectProduct(product) {
    selectedProduct = product;
    const el = document.getElementById('invSelectedName');
    if (el) el.textContent = product ? `${product.name} (${product.code}) - 庫存: ${product.stock_count}` : '請選擇商品';
  }
  async function confirm(ctx) {
    if (!selectedProduct) {
      window.ui.toast('請先選擇商品', 'error');
      return;
    }
    const qty = parseInt(document.getElementById('fieldInvQty')?.value, 10) || 0;
    const reason = document.getElementById('fieldInvReason')?.value?.trim() || '';
    const mode = ctx.getMode();
    if (qty <= 0) {
      window.ui.toast('數量必須大於 0', 'error');
      return;
    }
    let delta = 0;
    if (mode === 'restock') delta = qty;
    else if (mode === 'return') delta = qty;
    else if (mode === 'damage') delta = -qty;
    else return;
    const staff = ctx.getStaff();
    window.ui.setLoading(true);
    try {
      const newStock = Math.max(0, (selectedProduct.stock_count || 0) + delta);
      await window.posApi.updateProductStock(selectedProduct.id, newStock);
      const order = await window.posApi.createOrder({
        mode,
        payment_method: 'N/A',
        subtotal: 0,
        discount_amount: 0,
        total: 0,
        note: reason,
        staff_id: staff?.id || null,
      }, [{
        product_id: selectedProduct.id,
        qty,
        unit_price: Number(selectedProduct.price),
        line_total: Number(selectedProduct.price) * qty,
      }]);
      // 定義長度不一的中文預設原因
      const defaultReasons = {
        restock: '補貨',          // 2 字
        return: '退換貨',         // 3 字
        damage: '貨品損壞報銷'    // 6 字
      };
      // 如果店員有手動輸入原因就用手動的，否則用中文預設名
      const finalReason = reason || defaultReasons[mode] || mode;

      await window.posApi.addMovement({
        product_id: selectedProduct.id,
        delta,
        reason: finalReason,
        order_id: order.id,
        staff_id: staff?.id,
      });

      window.ui.toast(`${mode} 操作成功`, 'success');
      document.getElementById('fieldInvQty').value = '1';
      selectedProduct = null;
      document.getElementById('invSelectedName').textContent = '請選擇商品';
      await ctx.reloadProducts();
    } catch (e) {
      window.ui.toast(e.message, 'error');
    } finally {
      window.ui.setLoading(false);
    }
  }
  window.posModes = window.posModes || {};
  window.posModes.inventory = { bind, selectProduct, confirm };
})();