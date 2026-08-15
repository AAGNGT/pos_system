(function () {
  function db() {
    return window.posDb?.getClient();
  }
  async function fetchCategories() {
    const client = db();
    const { data, error } = await client.from('pos_categories').select('*').eq('is_active', true).order('sort_order');
    if (error) throw error;
    return data || [];
  }
  async function fetchProducts(categoryId = null) {
    const client = db();
    let q = client.from('pos_products').select('*').eq('is_active', true).order('sort_order');
    if (categoryId) q = q.eq('category_id', categoryId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  async function fetchStaff() {
    const client = db();
    const { data, error } = await client.from('pos_staff').select('*').eq('is_active', true);
    if (error) throw error;
    return data || [];
  }
  async function verifyStaff(staffId, pin) {
    const client = db();
    const { data, error } = await client.from('pos_staff').select('*').eq('id', staffId).eq('pin', pin).eq('is_active', true).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function updateProductStock(productId, newStock) {
    const client = db();
    const { error } = await client.from('pos_products').update({ stock_count: newStock }).eq('id', productId);
    if (error) throw error;
  }
  async function addMovement({ product_id, delta, reason, order_id, staff_id }) {
    const client = db();
    const { error } = await client.from('pos_inventory_movements').insert({
      product_id, delta, reason: reason || null, order_id: order_id || null, staff_id: staff_id || null,
    });
    if (error) throw error;
  }
  async function createOrder(order, items) {
    const client = db();
    const { data: orderRow, error: orderErr } = await client.from('pos_orders').insert(order).select().single();
    if (orderErr) throw orderErr;
    const lines = items.map((i) => ({
      order_id: orderRow.id,
      product_id: i.product_id,
      qty: i.qty,
      unit_price: i.unit_price,
      line_total: i.line_total,
    }));
    const { error: itemsErr } = await client.from('pos_order_items').insert(lines);
    if (itemsErr) throw itemsErr;
    return orderRow;
  }
  async function applyStockDeltas(items, sign) {
    for (const item of items) {
      const client = db();
      const { data: p } = await client.from('pos_products').select('stock_count').eq('id', item.product_id).single();
      const current = p?.stock_count ?? 0;
      const next = Math.max(0, current + sign * item.qty);
      await updateProductStock(item.product_id, next);
    }
  }
  async function fetchOrders(limit = 50, mode = null) {
    const client = db();
    let q = client.from('pos_orders').select('*').order('created_at', { ascending: false }).limit(limit);
    if (mode) q = q.eq('mode', mode);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  async function fetchSettings() {
    const client = db();
    const { data, error } = await client.from('pos_settings').select('*');
    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => { map[r.key] = r.value; });
    return map;
  }
  async function upsertSetting(key, value) {
    const client = db();
    const { error } = await client.from('pos_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  }
  async function fetchTodayStats() {
    const client = db();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await client
      .from('pos_orders')
      .select('total, mode')
      .eq('mode', 'sale')
      .gte('created_at', start.toISOString());
    if (error) throw error;
    const orders = data || [];
    return {
      revenue: orders.reduce((s, o) => s + Number(o.total), 0),
      count: orders.length,
    };
  }
  async function fetchLowStock(threshold = 5) {
    const client = db();
    const { data, error } = await client.from('pos_products').select('code, name, stock_count').lte('stock_count', threshold).eq('is_active', true);
    if (error) throw error;
    return data || [];
  }
  async function createEodReport(reportDate, payload) {
    const client = db();
    const sales = payload.orders || [];
    const total = sales.reduce((s, o) => s + Number(o.total), 0);
    const { error } = await client.from('pos_eod_reports').upsert({
      report_date: reportDate,
      total_sales: total,
      order_count: sales.length,
      payload,
    }, { onConflict: 'report_date' });
    if (error) throw error;
  }
  async function fetchTodayOrdersForEod() {
    const client = db();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await client.from('pos_orders').select('*').gte('created_at', start.toISOString());
    if (error) throw error;
    return data || [];
  }

  // === 新增：作廢訂單 API ===
  async function voidOrder(orderId, reason, staffId) {
    const client = db();
    const { error: orderErr } = await client.from('pos_orders')
      .update({ status: 'voided', void_reason: reason })
      .eq('id', orderId);
    if (orderErr) throw orderErr;

    const { data: items, error: itemsErr } = await client.from('pos_order_items')
      .select('*')
      .eq('order_id', orderId);
    if (itemsErr) throw itemsErr;

    if (items && items.length > 0) {
      await applyStockDeltas(items, 1);
      for (const item of items) {
        await addMovement({
          product_id: item.product_id,
          delta: item.qty,
          reason: `作廢訂單 #${orderId}: ${reason}`,
          order_id: orderId,
          staff_id: staffId
        });
      }
    }
  }
  async function processCheckout(order, items) {
    const client = db();
    const { data, error } = await client.rpc('process_checkout', {
      p_order_data: order,
      p_order_items: items
    });
    if (error) throw error;
    return data;
  }

  window.posApi = {
    fetchCategories, fetchProducts, fetchStaff, verifyStaff,
    updateProductStock, addMovement, createOrder, applyStockDeltas,
    fetchOrders, fetchSettings, upsertSetting, fetchTodayStats,
    fetchLowStock, createEodReport, fetchTodayOrdersForEod,
    voidOrder, processCheckout // 導出作廢 API // <-- 新增這裡
  };
})();
