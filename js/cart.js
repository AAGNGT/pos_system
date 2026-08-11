(function () {
  const state = { items: [] };

  function find(productId) {
    return state.items.find((i) => i.product_id === productId);
  }

  function add(product, qty = 1) {
    const existing = find(product.id);
    if (existing) {
      existing.qty += qty;
      existing.line_total = existing.qty * existing.unit_price;
      if (!existing.image_url && product.image_url) {
        existing.image_url = product.image_url;
      }
    } else {
      state.items.push({
        product_id: product.id,
        code: product.code,
        name: product.name,
        image_url: product.image_url || null,
        unit_price: Number(product.price),
        qty,
        line_total: Number(product.price) * qty,
        stock_count: product.stock_count,
      });
    }
    notify();
  }

  function setQty(productId, qty) {
    const item = find(productId);
    if (!item) return;
    if (qty <= 0) {
      remove(productId);
      return;
    }
    item.qty = qty;
    item.line_total = item.qty * item.unit_price;
    notify();
  }

  function remove(productId) {
    state.items = state.items.filter((i) => i.product_id !== productId);
    notify();
  }

  function clear() {
    state.items = [];
    notify();
  }

  function getItems() {
    return [...state.items];
  }

  function subtotal() {
    return state.items.reduce((s, i) => s + i.line_total, 0);
  }

function totals(discountInput = 0) {
    let posSub = 0;
    let negDisc = 0;
    
    // 將正數產品計入小計，負數產品的絕對值計入折扣
    state.items.forEach((i) => {
      if (i.line_total >= 0) {
        posSub += i.line_total;
      } else {
        negDisc += Math.abs(i.line_total);
      }
    });

    const manualDisc = Math.max(0, Number(discountInput) || 0);
    // 總折扣 = 負數產品折扣 + 手動輸入的折扣
    const totalDisc = negDisc + manualDisc; 
    const total = Math.max(0, posSub - totalDisc);
    
    return { subtotal: posSub, discount: totalDisc, total };
  }

  let onChange = null;
  function onCartChange(fn) {
    onChange = fn;
  }
  function notify() {
    if (typeof onChange === 'function') onChange(getItems());
    if (window.posDisplaySync) {
      const items = getItems();
      if (items.length) window.posDisplaySync.syncCart();
      else if (!window.posDisplaySync.isThankYouActive?.()) window.posDisplaySync.syncIdle();
    }
  }

  window.posCart = {
    add, setQty, remove, clear, getItems, subtotal, totals, onCartChange,
  };
})();
