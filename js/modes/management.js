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
        <label>商店名稱</label>
        <input id="setStoreName" value="${s.store_name || ''}">
        <label>預設付款方式</label>
        <input id="setPayment" value="${s.default_payment || 'Cash'}">

        <!-- 新增：全站主題強制設定 -->
        <label>深色模式強制設定 (force_dark_mode)</label>
        <select id="setForceDark">
          <option value="" ${!s.force_dark_mode ? 'selected' : ''}>不強制 (依賴本地瀏覽器記憶)</option>
          <option value="true" ${s.force_dark_mode === 'true' ? 'selected' : ''}>強制深色模式</option>
          <option value="false" ${s.force_dark_mode === 'false' ? 'selected' : ''}>強制淺色模式</option>
        </select>

        <!-- 新增：系統維護模式 -->
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
      
      // 儲存我們新增的兩個變數
      await window.posApi.upsertSetting('force_dark_mode', document.getElementById('setForceDark').value);
      await window.posApi.upsertSetting('maintenance_mode', document.getElementById('setMaintenance').value);
      
      window.ui.toast('設定已儲存，重新載入頁面後生效', 'success');
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

    const client = window.posDb.getClient();
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. 獲取歷史結算紀錄 (改為依照建立時間排序，因為同一天可能有多筆)
    const { data: reports } = await client
      .from('pos_eod_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    // 2. 構建 UI (加入刪除按鈕)
    el.innerHTML = `
      <div class="pos-form-card" style="max-width: 100%;">
        <h2 style="margin-top:0; color:#0f172a;">日終結算 (Z-Report)</h2>
        <p style="color:#64748b; margin-bottom:16px;">統計目前銷售數據，並存檔為快照。同一日可多次生成報表。</p>
        <button class="pos-btn-charge" type="button" id="btnEodGenerate" style="max-width: 250px;">📄 生成最新結算表</button>
      </div>

      <h3 style="margin-top:24px; color:#334155;">歷史交數紀錄</h3>
      <table class="pos-table" style="margin-bottom: 24px;">
        <thead>
          <tr>
            <th>結算時間</th>
            <th>總訂單數</th>
            <th>總營業額</th>
            <th style="text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${(reports || []).map(r => `
            <tr>
              <td>${new Date(r.created_at).toLocaleString('zh-TW')}</td>
              <td>${r.order_count}</td>
              <td style="color:#3b82f6; font-weight:bold;">$${Number(r.total_sales).toFixed(2)}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="pos-pill btn-view-pdf" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe;" data-payload='${JSON.stringify(r.payload).replace(/'/g, "&#39;")}'>
                  👁️ 預覽
                </button>
                <button class="pos-pill btn-delete-pdf" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; margin-left:4px;" data-id="${r.id}">
                  🗑️ 刪除
                </button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="4" style="text-align:center;">尚無結算紀錄</td></tr>'}
        </tbody>
      </table>
    `;

    // 3. 綁定「生成今日報告」按鈕
    document.getElementById('btnEodGenerate').onclick = async () => {
      window.ui.setLoading(true, '正在深度計算數據...');
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const { data: orders } = await client.from('pos_orders')
          .select('*, pos_order_items(*, pos_products(name, code))')
          .eq('mode', 'sale')
          .gte('created_at', start.toISOString());

        const sales = orders || [];
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

        const staff = window.posApp?.getStaff?.();
        const payload = {
          date: todayStr,
          generated_at: new Date().toLocaleString('zh-TW'),
          staff: staff ? staff.display_name : 'Admin',
          total_orders: sales.length,
          total_revenue: totalRevenue,
          total_discount: totalDiscount,
          payments: payments,
          items: Object.keys(itemsMap).map(k => ({ name: k, ...itemsMap[k] }))
        };

        // 改為強制 insert（允許同日多筆）並修正總額寫入
        const { error } = await client.from('pos_eod_reports').insert({
          report_date: todayStr,
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

    // 4. 綁定「預覽報告」按鈕
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

    // 5. 綁定「刪除報告」按鈕
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

// === 專屬 PDF 排版與生成函數 (已修正置中、縮細比例與單頁顯示) ===
  function generatePdf(data) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    // 關鍵修正：給予外層容器明確的 A4 比例像素寬度 (794px)，確保 html2pdf 擷取時完美置中
    wrapper.style.width = '794px'; 
    document.body.appendChild(wrapper);

    const div = document.createElement('div');
    // 稍微縮減內部 padding，騰出更多空間給商品列表
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
    
    let itemsHtml = (data.items || []).map(i => `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:6px 0; font-size:11px;">
        <span style="flex:2;">${i.name}</span>
        <span style="flex:1; text-align:center;">${i.qty}</span>
        <span style="flex:1; text-align:right;">$${Number(i.amount).toFixed(2)}</span>
      </div>
    `).join('');
    
    // 縮減了各個區塊的 margin-bottom 與 padding，確保極限利用一頁的空間
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
      // 關鍵修正：上下邊距縮減為 10mm 騰出縱向空間，左右保持 15mm
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

  window.posModes = window.posModes || {};
  window.posModes.management = {
    renderHistory, renderDashboard, renderSettings, renderStaff, renderEod,
  };
})();
