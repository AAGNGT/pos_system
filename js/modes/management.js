(function () {
  async function renderHistory() {
    const el = document.getElementById('panelHistory');
    if (!el) return;
    try {
      const orders = await window.posApi.fetchOrders(80);
      if (!orders.length) {
        el.innerHTML = '<p class="pos-order__empty">尚無訂單</p>';
        return;
      }
      const modeZh = { sale: '銷售', restock: '補貨', return: '退貨', damage: '損壞' };
      el.innerHTML = `<table class="pos-table"><thead><tr><th>編號</th><th>模式</th><th>合計</th><th>實收</th><th>找續</th><th>時間</th></tr></thead><tbody>${orders.map((o) => `
        <tr>
          <td>#${o.id}</td>
          <td>${modeZh[o.mode] || o.mode}</td>
          <td>$${Number(o.total).toFixed(2)}</td>
          <td>$${Number(o.amount_received || 0).toFixed(2)}</td>
          <td>$${Number(o.change_amount || 0).toFixed(2)}</td>
          <td>${new Date(o.created_at).toLocaleString('zh-TW')}</td>
        </tr>`).join('')}</tbody></table>`;
    } catch (e) {
      el.innerHTML = `<p class="pos-order__empty">${e.message}</p>`;
    }
  }

  async function renderDashboard() {
    const el = document.getElementById('panelDashboard');
    if (!el) return;
    try {
      const [stats, low] = await Promise.all([
        window.posApi.fetchTodayStats(),
        window.posApi.fetchLowStock(5),
      ]);
      el.innerHTML = `
        <div class="pos-card-grid">
          <div class="pos-stat-card"><div class="pos-stat-card__val">$${stats.revenue.toFixed(2)}</div><div class="pos-stat-card__lbl">今日營業額</div></div>
          <div class="pos-stat-card"><div class="pos-stat-card__val">${stats.count}</div><div class="pos-stat-card__lbl">今日訂單</div></div>
          <div class="pos-stat-card"><div class="pos-stat-card__val">${low.length}</div><div class="pos-stat-card__lbl">低庫存商品</div></div>
        </div>
        ${low.length ? `<h3 style="margin-top:20px">低庫存</h3><ul>${low.map((p) => `<li>${p.code} ${p.name}: ${p.stock_count}</li>`).join('')}</ul>` : ''}`;
    } catch (e) {
      el.innerHTML = `<p>${e.message}</p>`;
    }
  }

  async function renderSettings() {
    const el = document.getElementById('panelSettings');
    if (!el) return;
    const s = await window.posApi.fetchSettings();
    el.innerHTML = `
      <div class="pos-form-card">
        <label>店名</label>
        <input id="setStoreName" value="${s.store_name || ''}">
        <label>預設付款</label>
        <input id="setPayment" value="${s.default_payment || 'Cash'}">
        <button class="pos-btn-charge" type="button" id="btnSaveSettings">儲存設定</button>
      </div>`;
    document.getElementById('btnSaveSettings').onclick = async () => {
      await window.posApi.upsertSetting('store_name', document.getElementById('setStoreName').value);
      await window.posApi.upsertSetting('default_payment', document.getElementById('setPayment').value);
      window.ui.toast('設定已儲存', 'success');
    };
  }

  async function renderStaff() {
    const el = document.getElementById('panelStaff');
    if (!el) return;
    const staff = await window.posApi.fetchStaff();
    el.innerHTML = `
      <table class="pos-table"><thead><tr><th>名稱</th><th>角色</th><th>狀態</th></tr></thead>
      <tbody>${staff.map((s) => {
        const role = s.role === 'ADMIN' ? '管理員' : '員工';
        return `<tr><td>${s.display_name}</td><td>${role}</td><td>${s.is_active ? '啟用' : '停用'}</td></tr>`;
      }).join('')}</tbody></table>
      <p style="margin-top:12px"><a href="manager.html">在資料管理新增員工</a></p>`;
  }

  async function renderEod() {
    const el = document.getElementById('panelEod');
    if (!el) return;
    const orders = await window.posApi.fetchTodayOrdersForEod();
    const sales = orders.filter((o) => o.mode === 'sale');
    const total = sales.reduce((s, o) => s + Number(o.total), 0);
    el.innerHTML = `
      <div class="pos-form-card">
        <p>今日訂單：${orders.length} 筆</p>
        <p>今日銷售額：$${total.toFixed(2)}</p>
        <button class="pos-btn-charge" type="button" id="btnEodGenerate">產生日終報告</button>
      </div>`;
    document.getElementById('btnEodGenerate').onclick = async () => {
      const d = new Date().toISOString().slice(0, 10);
      await window.posApi.createEodReport(d, { orders: sales, generated_at: new Date().toISOString() });
      window.ui.toast('日終報告已儲存', 'success');
    };
  }

  window.posModes = window.posModes || {};
  window.posModes.management = {
    renderHistory, renderDashboard, renderSettings, renderStaff, renderEod,
  };
})();
