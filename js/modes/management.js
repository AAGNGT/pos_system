(function () {

  // ============================================================================
  // 🌟 共用功能：智慧型動態日曆彈窗 (只允許選擇有交易紀錄的日期)
  // ============================================================================
  async function openSharedDatePicker(onDateSelected) {
    window.ui.setLoading(true, '正在掃描歷史交易日期...');
    const client = window.posDb.getClient();
    
    // 1. 抓取 pos_orders 所有訂單的建立時間，提煉出「有營業的日期」
    const { data } = await client.from('pos_orders').select('created_at');
    const availableDates = new Set();
    (data || []).forEach(d => {
      const dt = new Date(d.created_at);
      const localDate = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      availableDates.add(localDate);
    });
    window.ui.setLoading(false);

    // 2. 如果彈窗不存在，就動態建立一個
    let modal = document.getElementById('sharedDatePickerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sharedDatePickerModal';
      modal.className = 'pos-modal';
      modal.style.zIndex = '2500'; 
      modal.innerHTML = `
        <style>
          .cal-day-btn.available:hover { background: #3b82f6 !important; color: #fff !important; transform: scale(1.05); }
          .cal-nav-btn { background:none; border:none; cursor:pointer; font-size:18px; color:#64748b; padding:4px 12px; border-radius:8px; transition: background 0.2s;}
          .cal-nav-btn:hover { background:#e2e8f0; color:#0f172a;}
          .btn-view-order:active { transform: scale(0.94); }
        </style>
        <div class="pos-modal__box" style="width: min(340px, 100%); padding: 24px;">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; text-align: center; color: #0f172a;">請選擇日期</h2>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; background:#f8fafc; border-radius:8px; padding:4px;">
            <button id="calPrevMonth" class="cal-nav-btn">&lt;</button>
            <h3 id="calMonthLabel" style="margin:0; font-size:15px; color:#334155; font-weight:700;"></h3>
            <button id="calNextMonth" class="cal-nav-btn">&gt;</button>
          </div>
          <div id="calGrid"></div>
          <div style="margin-top:20px; display:flex; gap:8px;">
            <button class="pos-modal__btn-secondary" style="width:100%; padding:10px;" id="calCancelBtn">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // 3. 日曆渲染邏輯
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth();

    const renderGrid = () => {
      document.getElementById('calMonthLabel').textContent = `${viewYear}年 ${viewMonth + 1}月`;
      const firstDay = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      let html = '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; text-align:center;">';
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      days.forEach(d => html += `<div style="font-size:12px; color:#94a3b8; font-weight:bold; padding:8px 0;">${d}</div>`);

      for (let i = 0; i < firstDay; i++) html += `<div></div>`;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (availableDates.has(dateStr)) {
          html += `<button class="cal-day-btn available" data-date="${dateStr}" style="padding:10px 0; border:none; border-radius:8px; background:#eff6ff; color:#2563eb; cursor:pointer; font-weight:bold; font-size:14px; transition:all 0.15s; box-shadow: 0 2px 4px rgba(37,99,235,0.1);">${day}</button>`;
        } else {
          html += `<div style="padding:10px 0; color:#cbd5e1; font-size:14px;">${day}</div>`;
        }
      }
      html += '</div>';
      document.getElementById('calGrid').innerHTML = html;

      document.querySelectorAll('.cal-day-btn.available').forEach(btn => {
        btn.onclick = () => {
          window.ui.closeModal(modal, () => {
            onDateSelected(btn.dataset.date);
          });
        };
      });
    };

    // 4. 綁定導航按鈕
    const prevBtn = document.getElementById('calPrevMonth');
    const nextBtn = document.getElementById('calNextMonth');
    const cancelBtn = document.getElementById('calCancelBtn');
    
    const newPrev = prevBtn.cloneNode(true);
    const newNext = nextBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    prevBtn.replaceWith(newPrev);
    nextBtn.replaceWith(newNext);
    cancelBtn.replaceWith(newCancel);

    newPrev.onclick = () => { viewMonth--; if(viewMonth < 0){viewMonth = 11; viewYear--;} renderGrid(); };
    newNext.onclick = () => { viewMonth++; if(viewMonth > 11){viewMonth = 0; viewYear++;} renderGrid(); };
    newCancel.onclick = () => window.ui.closeModal(modal);

    // 5. 顯示彈窗 (使用全域動畫)
    renderGrid();
    window.ui.openModal(modal);
  }


  // ============================================================================
  // 📜 模組 1：交易紀錄 (帶日期篩選與動畫明細)
  // ============================================================================
  async function renderHistory(filterDate = null) {
    const el = document.getElementById('panelHistory');
    if (!el) return;

    try {
      const client = window.posDb.getClient();
      
      let query = client.from('pos_orders')
        .select('*, pos_order_items(*, pos_products(name, stock_count))')
        .order('created_at', { ascending: false });

      if (filterDate) {
        const start = new Date(`${filterDate}T00:00:00`).toISOString();
        const end = new Date(`${filterDate}T23:59:59.999`).toISOString();
        query = query.gte('created_at', start).lte('created_at', end);
      } else {
        query = query.limit(80); 
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      window._tempHistoryOrders = orders || [];
      const modeZh = { sale: '售賣', restock: '入貨', return: '退貨', damage: '報銷' };

      let tableRows = '<p class="pos-order__empty">尚無交易紀錄</p>';
      if (window._tempHistoryOrders.length > 0) {
        tableRows = window._tempHistoryOrders.map((o) => {
          const items = o.pos_order_items || [];
          let summary = items.map(i => `${i.pos_products?.name || '未知產品'}(x${i.qty})`).join(', ');
          if (summary.length > 22) summary = summary.substring(0, 22) + '...';
          if (!summary) summary = '<span style="color:#cbd5e1;">無明細</span>';

          const isSale = o.mode === 'sale';
          const modeStr = modeZh[o.mode] || o.mode;
          
          const subtotalStr = isSale ? `$${Number(o.subtotal).toFixed(2)}` : '-';
          const discountStr = isSale && Number(o.discount_amount) > 0 ? `<span style="color:#16a34a;">-$${Number(o.discount_amount).toFixed(2)}</span>` : (isSale ? '$0.00' : '-');
          const totalStr = isSale ? `$${Number(o.total).toFixed(2)}` : '-';
          const timeStr = new Date(o.created_at).toLocaleString('zh-TW');

          return `
            <tr>
              <td style="font-weight: 600; color: #334155;">#${o.id}</td>
              <td>${modeStr}</td>
              <td style="color:#64748b; font-size:12px; line-height: 1.4;">${summary}</td>
              <td>${subtotalStr}</td>
              <td>${discountStr}</td>
              <td style="font-weight:bold; color:#0f172a;">${totalStr}</td>
              <td style="font-size:12px; color:#64748b;">${timeStr}</td>
              <td style="text-align: right;">
                <button class="pos-pill btn-view-order" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe; transition: transform 0.15s ease;" data-id="${o.id}">
                  👁️ 查閲更多
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }

      el.innerHTML = `
        <div class="pos-form-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; max-width: 100%;">
          <h3 style="margin:0; color:#0f172a; font-size:18px; display:flex; align-items:center; gap:8px;">
            ${filterDate ? `📅 ${filterDate} 的交易紀錄` : '📜 全部交易記錄'}
          </h3>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap: wrap;">
            ${filterDate ? `<button class="pos-pill" id="btnClearHistoryFilter" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; font-weight:600; font-size:13px; padding:8px 16px; cursor:pointer;">✖ 清除篩選</button>` : ''}
            <button class="pos-btn-secondary" id="btnFilterHistory" style="padding: 10px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; cursor:pointer; font-weight:600; color:#334155; display:flex; align-items:center; gap:6px; font-size: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;">
              <span>📅</span> <span>${filterDate ? filterDate : '選擇指定日期'}</span>
            </button>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table class="pos-table" style="min-width: 800px;">
            <thead>
              <tr>
                <th>單號</th>
                <th>類型</th>
                <th style="width: 25%;">商品/庫存摘要</th>
                <th>小計</th>
                <th>總折扣</th>
                <th>實付總計</th>
                <th>時間</th>
                <th style="text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${window._tempHistoryOrders.length > 0 ? tableRows : ''}
            </tbody>
          </table>
          ${window._tempHistoryOrders.length === 0 ? tableRows : ''}
        </div>

        <!-- 訂單詳細 Modal -->
        <div class="pos-modal" id="orderDetailModal" aria-hidden="true" style="z-index: 2100;">
          <div class="pos-modal__box" style="width: min(450px, 100%); padding: 0; overflow: hidden;">
            <div style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background: #f8fafc;">
              <h2 style="margin:0; font-size: 18px; color: #0f172a;" id="detailModalTitle">訂單詳細</h2>
              <button type="button" id="btnDetailClose" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer; line-height:1;">&times;</button>
            </div>
            <div style="padding: 24px; max-height: 60vh; overflow-y: auto;" id="detailModalBody"></div>
          </div>
        </div>
      `;

      document.getElementById('btnFilterHistory').onclick = () => {
        openSharedDatePicker((selectedDate) => {
          renderHistory(selectedDate);
        });
      };

      if (document.getElementById('btnClearHistoryFilter')) {
        document.getElementById('btnClearHistoryFilter').onclick = () => renderHistory(null);
      }

      document.querySelectorAll('.btn-view-order').forEach(btn => {
        btn.onclick = () => {
          const orderId = Number(btn.dataset.id);
          const order = window._tempHistoryOrders.find(o => o.id === orderId);
          if (order) showOrderDetail(order);
        };
      });

      const m = document.getElementById('orderDetailModal');
      document.getElementById('btnDetailClose').onclick = () => window.ui.closeModal(m);
      m.onclick = (e) => { if (e.target.id === 'orderDetailModal') window.ui.closeModal(m); };

    } catch (e) {
      el.innerHTML = `<p class="pos-order__empty">讀取失敗: ${e.message}</p>`;
    }
  }

  function showOrderDetail(order) {
    const m = document.getElementById('orderDetailModal');
    const title = document.getElementById('detailModalTitle');
    const body = document.getElementById('detailModalBody');
    if (!m || !title || !body) return;

    const isSale = order.mode === 'sale';
    const modeZh = { sale: '售賣', restock: '入貨', return: '退貨', damage: '報銷' };
    title.textContent = `單號 #${order.id} (${modeZh[order.mode] || order.mode})`;

    const items = order.pos_order_items || [];
    const itemsHtml = items.map(i => {
      const pName = i.pos_products?.name || '未知產品';
      if (isSale) {
        const lineTotal = Number(i.line_total);
        const amtStr = lineTotal < 0 ? `-$${Math.abs(lineTotal).toFixed(2)}` : `$${lineTotal.toFixed(2)}`;
        return `
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:10px 0; font-size:14px;">
              <span style="flex:2; font-weight:500; color:#334155;">${pName}</span>
              <span style="flex:1; text-align:center; color:#64748b;">x${i.qty}</span>
              <span style="flex:1; text-align:right; font-weight:600;">${amtStr}</span>
          </div>`;
      } else {
        const currentStock = i.pos_products?.stock_count ?? '未知';
        const sign = order.mode === 'damage' ? '-' : '+'; 
        const color = sign === '+' ? '#16a34a' : '#dc2626'; 
        return `
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:10px 0; font-size:14px;">
              <span style="flex:2; font-weight:500; color:#334155;">${pName}</span>
              <span style="flex:1; text-align:center; color:${color}; font-weight:600;">異動: ${sign}${i.qty}</span>
              <span style="flex:1; text-align:right; color:#64748b;">現時庫存: ${currentStock}</span>
          </div>`;
      }
    }).join('');

    let topInfoHtml = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span>操作時間：</span><span style="color:#0f172a;">${new Date(order.created_at).toLocaleString('zh-TW')}</span>
      </div>`;
    if (isSale) {
      topInfoHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>付款方式：</span><span style="color:#0f172a;">${order.payment_method || '無'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>實收 / 找續：</span><span style="color:#0f172a;">$${Number(order.amount_received || 0).toFixed(2)} / $${Number(order.change_amount || 0).toFixed(2)}</span>
        </div>`;
    }
    topInfoHtml += `
      <div style="display:flex; justify-content:space-between;">
          <span>備註/原因：</span><span style="color:#0f172a;">${order.note || '無'}</span>
      </div>`;

    let bottomHtml = '';
    if (isSale) {
      bottomHtml = `
        <div style="display:flex; justify-content:space-between; font-size: 14px; color: #64748b; margin-bottom: 8px;">
            <span>小計：</span><span>$${Number(order.subtotal).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 14px; color: #64748b; margin-bottom: 8px;">
            <span>總折扣：</span><span style="color:#16a34a;">-$${Number(order.discount_amount).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 16px; padding-top: 16px; border-top: 1px dashed #cbd5e1;">
            <span>實付總計：</span><span style="color:#2563eb;">$${Number(order.total).toFixed(2)}</span>
        </div>`;
    }

    body.innerHTML = `
      <div style="margin-bottom: 20px; font-size: 13px; color: #64748b; background: #f1f5f9; padding: 16px; border-radius: 12px;">${topInfoHtml}</div>
      <h4 style="margin: 0 0 12px 0; font-size: 15px; color: #0f172a; display:flex; align-items:center; gap:6px;">
        ${isSale ? '🛒 購買項目' : '📦 庫存異動明細'}
      </h4>
      <div style="border-top: 2px solid #e2e8f0; margin-bottom: ${isSale ? '20px' : '0'};">
          ${itemsHtml || '<p style="padding:10px 0; color:#94a3b8; font-size:13px; text-align:center;">無商品明細紀錄</p>'}
      </div>
      ${bottomHtml}
    `;

    window.ui.openModal(m);
  }


  // ============================================================================
  // 📊 模組 2：營業概況
  // ============================================================================
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
          <div class="pos-stat-card"><div class="pos-stat-card__val">$${stats.revenue.toFixed(2)}</div><div class="pos-stat-card__lbl">今日營收</div></div>
          <div class="pos-stat-card"><div class="pos-stat-card__val">${stats.count}</div><div class="pos-stat-card__lbl">今日訂單</div></div>
          <div class="pos-stat-card"><div class="pos-stat-card__val">${low.length}</div><div class="pos-stat-card__lbl">低庫存警告</div></div>
        </div>
        ${low.length ? `<h3 style="margin-top:20px">低庫存產品</h3><ul>${low.map((p) => `<li>${p.code} ${p.name}: ${p.stock_count}</li>`).join('')}</ul>` : ''}`;
    } catch (e) {
      el.innerHTML = `<p>${e.message}</p>`;
    }
  }


  // ============================================================================
  // ⚙️ 模組 3：系統設定
  // ============================================================================
  async function renderSettings() {
    const el = document.getElementById('panelSettings');
    if (!el) return;
    const s = await window.posApi.fetchSettings();
    el.innerHTML = `
      <div class="pos-form-card">
        <label>商店名稱</label>
        <input id="setStoreName" value="${s.store_name || ''}">
        <label>預設付款方式</label>
        <input id="setPayment" value="${s.default_payment || 'Cash'}">
        <label>深色模式強制設定 (force_dark_mode)</label>
        <select id="setForceDark">
          <option value="" ${!s.force_dark_mode ? 'selected' : ''}>不強制 (依賴本地瀏覽器記憶)</option>
          <option value="true" ${s.force_dark_mode === 'true' ? 'selected' : ''}>強制深色模式</option>
          <option value="false" ${s.force_dark_mode === 'false' ? 'selected' : ''}>強制淺色模式</option>
        </select>
        <label>系統維護模式 (maintenance_mode)</label>
        <select id="setMaintenance">
          <option value="false" ${s.maintenance_mode !== 'true' ? 'selected' : ''}>關閉 (正常營運)</option>
          <option value="true" ${s.maintenance_mode === 'true' ? 'selected' : ''}>開啟 (僅 ADMIN 可登入)</option>
        </select>
        <button class="pos-btn-charge" type="button" id="btnSaveSettings" style="margin-top: 16px;">儲存設定</button>
      </div>`;
    document.getElementById('btnSaveSettings').onclick = async () => {
      await window.posApi.upsertSetting('store_name', document.getElementById('setStoreName').value);
      await window.posApi.upsertSetting('default_payment', document.getElementById('setPayment').value);
      await window.posApi.upsertSetting('force_dark_mode', document.getElementById('setForceDark').value);
      await window.posApi.upsertSetting('maintenance_mode', document.getElementById('setMaintenance').value);
      window.ui.toast('設定已儲存', 'success');
    };
  }


  // ============================================================================
  // 👥 模組 4：員工管理
  // ============================================================================
  async function renderStaff() {
    const el = document.getElementById('panelStaff');
    if (!el) return;
    const staff = await window.posApi.fetchStaff();
    el.innerHTML = `
      <table class="pos-table"><thead><tr><th>名稱</th><th>角色</th><th>狀態</th></tr></thead>
      <tbody>${staff.map((s) => {
        const role = s.role === 'ADMIN' ? '管理員' : '一般員工';
        return `<tr><td>${s.display_name}</td><td>${role}</td><td>${s.is_active ? '啟用' : '停用'}</td></tr>`;
      }).join('')}</tbody></table>
      <p style="margin-top:12px"><a href="manager.html">前往進階後台管理</a></p>`;
  }


  // ============================================================================
  // 📝 模組 5：營業日結單 (Z-Report)
  // ============================================================================
  async function renderEod() {
    const el = document.getElementById('panelEod');
    if (!el) return;

    const client = window.posDb.getClient();
    const staff = window.posApp?.getStaff?.();
    const isAdmin = staff && staff.role === 'ADMIN';

    const d = new Date();
    const localTodayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    window._eodTargetDate = window._eodTargetDate || localTodayStr; 

    const { data: reports } = await client
      .from('pos_eod_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    el.innerHTML = `
      <div class="pos-form-card" style="max-width: 100%;">
        <h2 style="margin-top:0; color:#0f172a;">營業日結單 (Z-Report)</h2>
        <p style="color:#64748b; margin-bottom:16px;">選擇指定日期統計銷售數據。生成後將作為快照永久保存。</p>
        
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <button class="pos-btn-secondary" type="button" id="btnSelectEodDate" style="padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; cursor:pointer; font-weight:600; color:#334155; min-width: 160px; text-align:left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;">
            📅 <span id="eodDateLabel">${window._eodTargetDate}</span>
          </button>
          <button class="pos-btn-charge" type="button" id="btnEodGenerate" style="max-width: 250px; margin: 0;">📄 生成指定日期結算表</button>
        </div>
      </div>

      <h3 style="margin-top:24px; color:#334155;">歷史交數紀錄</h3>
      <table class="pos-table" style="margin-bottom: 24px;">
        <thead>
          <tr>
            <th>結算目標日</th>
            <th>生成時間</th>
            <th>經手人</th>
            <th>單數</th>
            <th>總營業額</th>
            <th style="text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${(reports || []).map(r => `
            <tr>
              <td style="font-weight:600;">${r.report_date}</td>
              <td style="font-size: 11px; color: #64748b;">${new Date(r.created_at).toLocaleString('zh-TW')}</td>
              <td>${r.payload?.staff || '未知'}</td>
              <td>${r.order_count}</td>
              <td style="color:#3b82f6; font-weight:bold;">$${Number(r.total_sales).toFixed(2)}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="pos-pill btn-view-pdf" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe;" data-payload='${JSON.stringify(r.payload).replace(/'/g, "&#39;")}'>
                  👁️ 預覽
                </button>
                ${isAdmin ? `
                <button class="pos-pill btn-delete-pdf" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; margin-left:4px;" data-id="${r.id}">
                  🗑️ 刪除
                </button>` : ''}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" style="text-align:center;">尚無結算紀錄</td></tr>'}
        </tbody>
      </table>
    `;

    document.getElementById('btnSelectEodDate').onclick = () => {
      openSharedDatePicker((selectedDate) => {
        window._eodTargetDate = selectedDate; 
        document.getElementById('eodDateLabel').textContent = window._eodTargetDate;
      });
    };

    document.getElementById('btnEodGenerate').onclick = async () => {
      const targetDateStr = window._eodTargetDate;
      if (!targetDateStr) {
        window.ui.toast('請先選擇要結算的日期', 'error');
        return;
      }

      window.ui.setLoading(true, '正在深度計算數據...');
      try {
        const start = new Date(`${targetDateStr}T00:00:00`);
        const end = new Date(`${targetDateStr}T23:59:59.999`);

        const { data: orders } = await client.from('pos_orders')
          .select('*, pos_order_items(*, pos_products(name, code))')
          .eq('mode', 'sale')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());

        const sales = orders || [];
        
        if (sales.length === 0) {
          window.ui.toast(`日期 ${targetDateStr} 沒有任何銷售紀錄！`, 'error');
          window.ui.setLoading(false);
          return;
        }

        let totalRevenue = 0;
        let totalDiscount = 0;
        let payments = {};
        let itemsMap = {};

        sales.forEach(o => {
          totalRevenue += Number(o.total);
          totalDiscount += Number(o.discount_amount || 0);

          const pm = o.payment_method || '未分類';
          payments[pm] = (payments[pm] || 0) + Number(o.total);

          if (o.pos_order_items) {
            o.pos_order_items.forEach(item => {
              const pName = item.pos_products?.name || '未知商品';
              if (!itemsMap[pName]) itemsMap[pName] = { qty: 0, amount: 0 };
              itemsMap[pName].qty += item.qty;
              itemsMap[pName].amount += Number(item.line_total);
            });
          }
        });

        const payload = {
          date: targetDateStr,
          generated_at: new Date().toLocaleString('zh-TW'),
          staff: staff ? staff.display_name : 'Admin',
          total_orders: sales.length,
          total_revenue: totalRevenue,
          total_discount: totalDiscount,
          payments: payments,
          items: Object.keys(itemsMap).map(k => ({ name: k, ...itemsMap[k] }))
        };

        const { error } = await client.from('pos_eod_reports').insert({
          report_date: targetDateStr,
          total_sales: totalRevenue,
          order_count: sales.length,
          payload: payload
        });
        
        if (error) throw error;

        window.ui.toast('結算報告已生成並存檔！', 'success');
        generatePdf(payload);
        renderEod();
      } catch (e) {
        window.ui.toast(`結算失敗: ${e.message}`, 'error');
      } finally {
        window.ui.setLoading(false);
      }
    };

    document.querySelectorAll('.btn-view-pdf').forEach(btn => {
      btn.onclick = () => {
        try {
          const payload = JSON.parse(btn.dataset.payload);
          generatePdf(payload);
        } catch(e) {
          window.ui.toast('讀取報告資料失敗', 'error');
        }
      };
    });

    document.querySelectorAll('.btn-delete-pdf').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('確定要刪除這筆結算紀錄嗎？（僅刪除報告，不影響實際訂單）')) return;
        window.ui.setLoading(true);
        try {
          await client.from('pos_eod_reports').delete().eq('id', btn.dataset.id);
          window.ui.toast('紀錄已刪除', 'success');
          renderEod();
        } catch(e) {
          window.ui.toast(`刪除失敗: ${e.message}`, 'error');
        } finally {
          window.ui.setLoading(false);
        }
      };
    });
  }

  // ============================================================================
  // 🖨️ PDF 產生器
  // ============================================================================
  function generatePdf(data) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '794px'; 
    document.body.appendChild(wrapper);

    const div = document.createElement('div');
    div.style.padding = '10px 20px';
    div.style.fontFamily = 'sans-serif';
    div.style.color = '#111';
    div.style.boxSizing = 'border-box';
    div.style.background = '#fff';
    
    let paymentsHtml = Object.entries(data.payments || {}).map(([k, v]) => `
      <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #e2e8f0; padding:6px 0; font-size:11px;">
        <span>${k}</span><span style="font-weight:600;">$${Number(v).toFixed(2)}</span>
      </div>
    `).join('');
    
    let itemsHtml = (data.items || []).map(i => {
      const amt = Number(i.amount);
      const amtStr = amt < 0 ? `-$${Math.abs(amt).toFixed(2)}` : `$${amt.toFixed(2)}`;
      return `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:6px 0; font-size:11px;">
        <span style="flex:2;">${i.name}</span>
        <span style="flex:1; text-align:center;">${i.qty}</span>
        <span style="flex:1; text-align:right;">${amtStr}</span>
      </div>
    `}).join('');
    
    div.innerHTML = `
      <div style="text-align:center; margin-bottom: 15px; border-bottom: 2px solid #1e293b; padding-bottom: 10px;">
        <h1 style="margin:0; font-size:22px; font-weight:900; letter-spacing:1px;">ASSTUDIOHK</h1>
        <h2 style="margin:6px 0 0; font-size:13px; color:#64748b;">每日營運結算表 (Z-Report)</h2>
      </div>
      
      <div style="display:flex; justify-content:space-between; margin-bottom: 15px; font-size:11px; color:#334155; background:#f8fafc; padding:8px; border-radius:6px;">
        <div><strong>營業日期：</strong> ${data.date}</div>
        <div><strong>製表時間：</strong> ${data.generated_at}</div>
        <div><strong>當值經手人：</strong> ${data.staff}</div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="background:#e2e8f0; padding:6px 10px; margin:0 0 8px; font-size:13px; border-left:3px solid #3b82f6;">財務摘要 (Financial Summary)</h3>
        <div style="display:flex; justify-content:space-between; padding:4px 10px; font-size:11px;"><span>總交易單數：</span><strong>${data.total_orders} 單</strong></div>
        <div style="display:flex; justify-content:space-between; padding:4px 10px; font-size:11px;"><span>總折扣送出：</span><strong>-$${Number(data.total_discount).toFixed(2)}</strong></div>
        <div style="display:flex; justify-content:space-between; padding:8px 10px; margin-top:6px; background:#eff6ff; font-size:15px; font-weight:bold; border-radius:6px;">
          <span>淨營業額 (Net Sales)：</span><span style="color:#2563eb;">$${Number(data.total_revenue).toFixed(2)}</span>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h3 style="background:#e2e8f0; padding:6px 10px; margin:0 0 8px; font-size:13px; border-left:3px solid #10b981;">收款明細 (Tender Breakdown)</h3>
        <div style="padding: 0 10px;">${paymentsHtml || '<div style="padding:6px 0; color:#94a3b8; font-size:11px;">無收款紀錄</div>'}</div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3 style="background:#e2e8f0; padding:6px 10px; margin:0 0 8px; font-size:13px; border-left:3px solid #f59e0b;">商品銷量排行 (Item Sales)</h3>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #cbd5e1; padding:6px 10px; font-weight:bold; font-size:11px; color:#64748b;">
          <span style="flex:2;">商品名稱</span>
          <span style="flex:1; text-align:center;">賣出數量</span>
          <span style="flex:1; text-align:right;">貢獻營收</span>
        </div>
        <div style="padding: 0 10px;">${itemsHtml || '<p style="text-align:center; padding:10px; color:#94a3b8; font-size:11px;">本日無銷售紀錄</p>'}</div>
      </div>
      
      <div style="display:flex; justify-content:space-between; margin-top: 35px; padding:0 20px;">
        <div style="width: 35%; text-align:center;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 6px; height:25px;"></div>
          <div style="font-size:11px; color:#64748b;">當值員工簽署 (Prepared By)</div>
        </div>
        <div style="width: 35%; text-align:center;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 6px; height:25px;"></div>
          <div style="font-size:11px; color:#64748b;">店長核准 (Approved By)</div>
        </div>
      </div>
    `;

    wrapper.appendChild(div);

    const opt = {
      margin:       [10, 15, 10, 15], 
      filename:     `Z-Report-${data.date}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    const newTab = window.open('', '_blank');
    if (newTab) {
      newTab.document.title = "載入結算表中...";
      newTab.document.write('<div style="font-family:sans-serif; text-align:center; margin-top:50px; color:#64748b;">正在為您生成 PDF 結算表，請稍候...</div>');
    }

    html2pdf().set(opt).from(div).output('blob').then(function(blob) {
      const blobUrl = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        window.location.href = blobUrl;
      }
      document.body.removeChild(wrapper);
    }).catch(function(err) {
      console.error(err);
      window.ui.toast('生成 PDF 失敗，請重試', 'error');
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    });
  }

  // 將方法綁定到全域供 app.js 呼叫
  window.posModes = window.posModes || {};
  window.posModes.management = {
    renderHistory, renderDashboard, renderSettings, renderStaff, renderEod,
  };

})();