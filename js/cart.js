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
    } else {
      state.items.push({
        product_id: product.id,
        code: product.code,
        name: product.name,
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
    const sub = subtotal();
    const disc = Math.max(0, Number(discountInput) || 0);
    const total = Math.max(0, sub - disc);
    return { subtotal: sub, discount: disc, total };
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
