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
  // 📜 模組 1：交易紀錄 (加入訂單代碼、簡化摘要、條件隱藏備註)
  // ============================================================================
  async function renderHistory(filterDate = null) {
    const el = document.getElementById('panelHistory');
    if (!el) return;

    try {
      const client = window.posDb.getClient();
      
      let query = client.from('pos_orders')
        .select('*, pos_order_items(*, pos_products(id, code, name, image_url, stock_count, price))')
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
          
          // 💡 1. 簡化「商品/庫存摘要」顯示邏輯
          let summary = '';
          if (items.length === 0) {
            summary = '<span style="color:#cbd5e1;">無明細</span>';
          } else if (items.length === 1) {
            summary = `${items[0].pos_products?.name || '未知產品'} (x${items[0].qty})`;
          } else {
            const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
            summary = `${items[0].pos_products?.name || '未知產品'} 等 ${items.length} 項 (共 ${totalQty} 件)`;
          }

                   const isSale = o.mode === 'sale';
          const isVoided = o.status === 'voided';
          const isAdmin = window.posApp?.getStaff?.()?.role === 'ADMIN';
          const modeStr = modeZh[o.mode] || o.mode;
          
          const rowOpacity = isVoided ? 'opacity: 0.5;' : '';
          
          let statusBadge = '';
          if (isVoided) {
             statusBadge = `<span style="background:#fef2f2; color:#dc2626; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; margin-left:8px; border: 1px solid #fecaca;">已作廢</span>`;
          } else if (isSale && o.status === 'completed') {
             statusBadge = `<span style="background:#ecfdf5; color:#059669; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; margin-left:8px; border: 1px solid #a7f3d0;">已支付</span>`;
          } else if (!isSale) {
             statusBadge = `<span style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; margin-left:8px; border: 1px solid #cbd5e1;">已完成</span>`;
          }

          const subtotalStr = isSale ? `$${Number(o.subtotal).toFixed(2)}` : '-';
          const discountStr = isSale && Number(o.discount_amount) > 0 ? `<span style="color:#16a34a;">-$${Number(o.discount_amount).toFixed(2)}</span>` : (isSale ? '$0.00' : '-');
          const totalStr = isSale ? `$${Number(o.total).toFixed(2)}` : '-';
          const timeStr = new Date(o.created_at).toLocaleString('zh-TW');
          
          let orderCodeStr = '-';
          if (isSale && o.order_code) {
             orderCodeStr = `
              <button type="button" class="pos-btn-secondary btn-redisplay-qr" data-id="${o.id}" 
                 style="padding: 4px 10px; font-size: 13px; font-family: monospace; font-weight: bold; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border-radius: 6px;" 
                 title="重新顯示顧客憑證 QR Code">
                 ${o.order_code}
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
              </button>`;
          }

          let voidBtnHtml = '';
          if (isSale && isAdmin && !isVoided) {
             voidBtnHtml = `<button class="pos-btn-secondary btn-void-order" style="padding: 6px 12px; font-size: 13px; border-radius: 6px; cursor: pointer; color: #dc2626; border-color: #fecaca; background: #fff;" data-id="${o.id}">作廢</button>`;
          }

          return `
            <tr style="${rowOpacity}">
              <td style="font-weight: 600; color: #334155;">#${o.id} ${statusBadge}</td>
              <td>${modeStr}</td>
              <td style="color:#64748b; font-size:12px; line-height: 1.4;">${summary}</td>
              <td>${subtotalStr}</td>
              <td>${discountStr}</td>
              <td style="font-weight:bold; color:#0f172a;">${totalStr}</td>
              <td style="font-size:12px; color:#64748b;">${timeStr}</td>
              <td style="font-family: monospace; font-size:14px; color:#8b5cf6; font-weight:bold;">${orderCodeStr}</td>
              <td style="text-align: right; display: flex; gap: 6px; justify-content: flex-end;">
                ${voidBtnHtml}
                <button class="pos-btn-secondary btn-view-order" style="padding: 6px 12px; font-size: 13px; border-radius: 6px; cursor: pointer; transition: transform 0.15s ease;" data-id="${o.id}">查看</button>
              </td>
            </tr>
          `;

          return `
            <tr>
              <td style="font-weight: 600; color: #334155;">#${o.id}</td>
              <td>${modeStr}</td>
              <td style="color:#64748b; font-size:12px; line-height: 1.4;">${summary}</td>
              <td>${subtotalStr}</td>
              <td>${discountStr}</td>
              <td style="font-weight:bold; color:#0f172a;">${totalStr}</td>
              <td style="font-size:12px; color:#64748b;">${timeStr}</td>
              <td style="font-family: monospace; font-size:14px; color:#8b5cf6; font-weight:bold;">${orderCodeStr}</td>
              <td style="text-align: right;">
                <button class="pos-btn-secondary btn-view-order" style="padding: 6px 12px; font-size: 13px; border-radius: 6px; cursor: pointer; transition: transform 0.15s ease;" data-id="${o.id}">
                     查看詳情
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
          <table class="pos-table" style="min-width: 850px;">
            <thead>
              <tr>
                <th>單號</th>
                <th>類型</th>
                <th style="width: 22%;">商品摘要</th>
                <th>小計</th>
                <th>總折扣</th>
                <th>實付總計</th>
                <th>時間</th>
                <th>訂單代碼</th> <!-- 💡 新增標題欄位 -->
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

        <!-- 重新顯示 QR Code 確認 Modal -->
        <div class="pos-modal" id="reDisplayModal" aria-hidden="true" style="z-index: 2200;">
          <div class="pos-modal__box pos-modal__box--confirm">
            <h2 style="margin: 0 0 16px; color: #0f172a;">重新顯示收據</h2>
            <p class="pos-modal__hint">確定要在客戶顯示屏重新顯示訂單 <strong id="reDisplayCodeTxt" style="color:#3b82f6; font-family:monospace;"></strong> 的電子收據與感謝畫面嗎？</p>
            <div class="pos-modal__actions">
              <button type="button" class="pos-modal__btn-secondary" id="btnReDisplayCancel">取消</button>
              <button type="button" class="pos-btn-primary pos-modal__btn-confirm" id="btnReDisplayConfirm">投放到螢幕</button>
            </div>
          </div>
        </div>

        <div class="pos-modal" id="voidOrderModal" aria-hidden="true" style="z-index: 2200;">
          <div class="pos-modal__box pos-modal__box--confirm">
            <h2 style="margin: 0 0 16px; color: #dc2626;">作廢訂單 <span id="voidOrderTitleId"></span></h2>
            <p class="pos-modal__hint">作廢後將無法復原，商品庫存將會自動退回系統。</p>
            <label style="display:block; text-align:left; font-size:13px; color:#64748b; margin-bottom:8px;">作廢原因 (必填)：</label>
            <input type="text" id="voidReasonInput" placeholder="例如：入錯商品、打錯折..." style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:16px;">
            <div class="pos-modal__actions">
              <button type="button" class="pos-modal__btn-secondary" id="btnVoidCancel">取消</button>
              <button type="button" class="pos-btn-primary pos-modal__btn-confirm" id="btnVoidConfirm" style="background:#dc2626;">確認作廢</button>
            </div>
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

      let targetOrderForDisplay = null;
      const reDisplayModal = document.getElementById('reDisplayModal');

      // 綁定所有「訂單代碼」按鈕
      document.querySelectorAll('.btn-redisplay-qr').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation(); // 阻止觸發整行點擊查看詳情的事件
          const orderId = Number(btn.dataset.id);
          targetOrderForDisplay = window._tempHistoryOrders.find(o => o.id === orderId);
          if (targetOrderForDisplay) {
            document.getElementById('reDisplayCodeTxt').textContent = targetOrderForDisplay.order_code;
            window.ui.openModal(reDisplayModal);
          }
        };
      });

      document.getElementById('btnReDisplayCancel').onclick = () => {
        window.ui.closeModal(reDisplayModal);
      };

      document.getElementById('btnReDisplayConfirm').onclick = () => {
        if (targetOrderForDisplay) {
          window.ui.closeModal(reDisplayModal, async () => {
            if (window.posDisplaySync?.syncThankYou) {
              await window.posDisplaySync.syncThankYou({
                total: targetOrderForDisplay.total,
                received: targetOrderForDisplay.amount_received,
                change: targetOrderForDisplay.change_amount,
                order_code: targetOrderForDisplay.order_code
              });
              window.ui.toast('已成功投送至客戶顯示屏', 'success');
            }
          });
        }
      };

      // ==== 作廢訂單事件綁定 ====
      let targetOrderForVoid = null;
      const voidModal = document.getElementById('voidOrderModal');
      
      document.querySelectorAll('.btn-void-order').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const orderId = Number(btn.dataset.id);
          targetOrderForVoid = window._tempHistoryOrders.find(o => o.id === orderId);
          if (targetOrderForVoid) {
            document.getElementById('voidOrderTitleId').textContent = `#${orderId}`;
            document.getElementById('voidReasonInput').value = '';
            window.ui.openModal(voidModal);
          }
        };
      });

      document.getElementById('btnVoidCancel').onclick = () => window.ui.closeModal(voidModal);
      
      document.getElementById('btnVoidConfirm').onclick = async () => {
        const reason = document.getElementById('voidReasonInput').value.trim();
        if (!reason) {
          window.ui.toast('請填寫作廢原因', 'error');
          return;
        }
        if (!targetOrderForVoid) return;
        
        window.ui.setLoading(true, '作廢中...');
        try {
          const staff = window.posApp?.getStaff?.();
          await window.posApi.voidOrder(targetOrderForVoid.id, reason, staff?.id);
          window.ui.closeModal(voidModal);
          window.ui.toast('訂單已成功作廢，庫存已退回', 'success');
          
          if (confirm('訂單已作廢。\n是否需要將舊有商品載入購物車，以修改並重新結帳？')) {
            window.posCart.clear();
            
            targetOrderForVoid.pos_order_items.forEach(item => {
              const p = item.pos_products;
              const productObj = {
                id: item.product_id,
                code: p?.code || '',
                name: p?.name || '未知商品',
                price: item.unit_price,
                image_url: p?.image_url || null,
                stock_count: p?.stock_count || 0
              };
              window.posCart.add(productObj, item.qty);
            });
            
            window.posApp.setMode('sale');
          } else {
            renderHistory();
          }
        } catch (e) {
          window.ui.toast(`作廢失敗: ${e.message}`, 'error');
        } finally {
          window.ui.setLoading(false);
        }
      };

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
      
    // 💡 也在詳細視窗內補上訂單代碼，方便查閱
    if (isSale && order.order_code) {
      topInfoHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>訂單代碼：</span><span style="color:#8b5cf6; font-weight:bold; font-family:monospace; font-size:15px;">${order.order_code}</span>
        </div>`;
    }

    if (isSale) {
      topInfoHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>付款方式：</span><span style="color:#0f172a;">${order.payment_method || '無'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>實收 / 找續：</span><span style="color:#0f172a;">$${Number(order.amount_received || 0).toFixed(2)} / $${Number(order.change_amount || 0).toFixed(2)}</span>
        </div>`;
    }
    
    // 💡 3. 條件判斷：如果備註沒有內容，則不會渲染出這行
    if (order.note && order.note.trim() !== '') {
      topInfoHtml += `
        <div style="display:flex; justify-content:space-between;">
            <span>備註/原因：</span><span style="color:#0f172a;">${order.note}</span>
        </div>`;
    }
        // ==== 加入作廢原因顯示 ====
    if (order.status === 'voided') {
      topInfoHtml += `
        <div style="display:flex; justify-content:space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #fca5a5;">
            <span style="color:#dc2626; font-weight:bold;">訂單狀態：</span>
            <span style="color:#dc2626; font-weight:bold;">已作廢</span>
        </div>`;
        
      if (order.void_reason) {
        topInfoHtml += `
        <div style="display:flex; justify-content:space-between; margin-top: 4px;">
            <span style="color:#dc2626;">作廢原因：</span>
            <span style="color:#dc2626; text-align:right;">${order.void_reason}</span>
        </div>`;
      }
    }


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
  // 建立全域變數作快取，避免切換頁面時重複載入
  window._dashCache = window._dashCache || null;
  window._dashLastUpdate = window._dashLastUpdate || null;
  window._dashTargetDateStr = window._dashTargetDateStr || null;
  window.dashboardChartInstance = null;

  // 計算「上次更新」時間的輔助函數
  function getTimeAgo(timestamp) {
    if (!timestamp) return '從未更新';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${Math.max(0, seconds)} 秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前`;
    return '很久以前';
  }

  // 獨立出撈取數據嘅邏輯
  async function fetchDashboardData(targetDateStr) {
    const client = window.posDb.getClient();
    const start = new Date(`${targetDateStr}T00:00:00`);
    const end = new Date(`${targetDateStr}T23:59:59.999`);

    const [ordersRes, lowStockRes] = await Promise.all([
      client.from('pos_orders')
            .select('total, mode, created_at, status')
            .eq('mode', 'sale')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString()),
      window.posApi.fetchLowStock(5)
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const validSales = (ordersRes.data || []).filter(o => o.status !== 'voided');
    const revenue = validSales.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = validSales.length;

    const hourlyData = new Array(24).fill(0);
    validSales.forEach(o => {
      const hour = new Date(o.created_at).getHours();
      hourlyData[hour] += 1;
    });

    // 寫入快取
    window._dashCache = {
      revenue,
      orderCount,
      lowStock: lowStockRes || [],
      hourlyData
    };
    window._dashLastUpdate = Date.now();
    window._dashTargetDateStr = targetDateStr;
  }

  // 渲染儀表板 (加入 forceRefresh 參數控制是否強制更新)
  async function renderDashboard(selectedDate = null, forceRefresh = false) {
    const el = document.getElementById('panelDashboard');
    if (!el) return;

    // 決定目標日期
    if (!window._dashTargetDateStr) {
      const d = new Date();
      window._dashTargetDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const targetDateStr = selectedDate || window._dashTargetDateStr;

    // 判斷是否需要向數據庫拿資料：強制刷新 OR 選擇了新日期 OR 沒有快取
    const needsFetch = forceRefresh || (targetDateStr !== window._dashTargetDateStr) || !window._dashCache;

    if (needsFetch) {
      window.ui.setLoading(true, '載入數據中...');
      try {
        await fetchDashboardData(targetDateStr);
      } catch (e) {
        window.ui.setLoading(false);
        el.innerHTML = `<p style="padding: 20px; color: #dc2626; text-align: center; font-weight: bold;">讀取數據失敗: ${e.message}</p>`;
        return;
      }
      window.ui.setLoading(false);
    }

    const data = window._dashCache;

    // 渲染 UI (左邊文字 + 右邊按鈕：Refresh -> DatePicker)
    el.innerHTML = `
      <div class="pos-form-card" style="max-width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: baseline; gap: 12px;">
          <h2 style="margin: 0; color: #0f172a;">營業概況</h2>
          <span style="font-size: 13px; color: #64748b; font-weight: 500;">上次更新: <span id="dashLastUpdateText">${getTimeAgo(window._dashLastUpdate)}</span></span>
        </div>
        
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="pos-btn-secondary btn-refresh-spin" id="btnRefreshDashboard" title="重新整理" style="padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; transition: all 0.2s;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
          </button>
          <button class="pos-btn-secondary" id="btnDashboardDate" style="padding: 10px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background:#fff; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 600; color: #334155; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            📅 <span>${targetDateStr}</span>
          </button>
        </div>
      </div>

      <div class="pos-card-grid" style="margin-bottom: 24px;">
        <div class="pos-stat-card"><div class="pos-stat-card__val">$${data.revenue.toFixed(2)}</div><div class="pos-stat-card__lbl">總銷售額</div></div>
        <div class="pos-stat-card"><div class="pos-stat-card__val">${data.orderCount}</div><div class="pos-stat-card__lbl">完成訂單</div></div>
        <div class="pos-stat-card"><div class="pos-stat-card__val">${data.lowStock.length}</div><div class="pos-stat-card__lbl">低庫存項目</div></div>
      </div>

      <div class="pos-form-card" style="max-width: 100%; margin-bottom: 24px;">
        <h3 style="margin-top: 0; margin-bottom: 16px; color: #334155;">每小時完成訂單數量</h3>
        <div style="position: relative; height: 320px; width: 100%;">
          <canvas id="hourlyOrdersChart"></canvas>
        </div>
      </div>

      ${data.lowStock.length ? `
        <div class="pos-form-card" style="max-width: 100%;">
          <h3 style="margin-top:0; color: #dc2626;">庫存警報清單</h3>
          <ul style="color: #64748b; line-height: 1.6;">
            ${data.lowStock.map((p) => `<li><strong>${p.code}</strong> ${p.name} (剩餘: <span style="color:#dc2626; font-weight:bold;">${p.stock_count}</span>)</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;

    // 綁定「重新整理」按鈕
    const btnRefresh = document.getElementById('btnRefreshDashboard');
    btnRefresh.onclick = async () => {
      // 加入旋轉動畫
      btnRefresh.classList.add('is-spinning');
      await renderDashboard(targetDateStr, true); // forceRefresh = true
      // 如果渲染完成，動畫會因為 DOM 重建而自然消失；或者我們可以直接提示成功
      window.ui.toast('數據已更新', 'success');
    };

    // 綁定「日期選擇器」
    document.getElementById('btnDashboardDate').onclick = () => {
      openSharedDatePicker((newDate) => {
        renderDashboard(newDate, false);
      });
    };

    // 繪製 Chart.js
    const ctx = document.getElementById('hourlyOrdersChart').getContext('2d');
    if (window.dashboardChartInstance) {
      window.dashboardChartInstance.destroy();
    }

    window.dashboardChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${String(i).padStart(2, '0')}:00`),
        datasets: [{
          label: '訂單數量 (單)',
          data: data.hourlyData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b82f6',
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
          x: { grid: { display: false } }
        }
      }
    });
  }
  // ============================================================================
  // ⚙️ 模組 3：系統設定 (全新現代化卡片排版)
  // ============================================================================
  async function renderSettings() {
    const el = document.getElementById('panelSettings');
    if (!el) return;
    
    // 載入中的過渡狀態
    el.innerHTML = '<div style="padding: 40px; text-align: center; color: #94a3b8; font-weight: 600;">讀取設定中...</div>';
    
    try {
      const s = await window.posApi.fetchSettings();
      
      el.innerHTML = `
        <div style="max-width: 760px; margin: 0 auto; padding-bottom: 40px; animation: cdispFadeIn 0.3s ease;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 24px;">
            <h2 style="margin:0; color:#0f172a; font-size:24px; font-weight:800;">系統設定</h2>
            <div style="display: flex; gap: 12px; align-items: center;">
            <button class="pos-btn-secondary btn-refresh-spin" type="button" id="btnRefreshSettings" title="請先儲存設定" disabled style="padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border: 1px solid #e2e8f0; color: #94a3b8; cursor: not-allowed; opacity: 0.6; transition: all 0.2s;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
            </button>
            <button class="pos-btn-charge" type="button" id="btnSaveSettings" style="width:auto; padding: 10px 24px; font-size: 14px; margin: 0; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25); transition: all 0.2s;">
              💾 儲存所有設定
            </button>
            </div>
          </div>

          <!-- 區塊 1：基本資訊 -->
          <div style="margin-bottom: 32px;">
            <h3 style="font-size:13px; color:#64748b; font-weight:700; margin:0 0 10px 12px; text-transform:uppercase; letter-spacing:1px;">基本資訊</h3>
            <div style="background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.02); overflow:hidden;">
              
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9;">
                <div>
                  <span style="font-weight:600; color:#1e293b; font-size:15px; display:block; margin-bottom:2px;">商店名稱</span>
                  <span style="font-size:12px; color:#94a3b8;">顯示在客顯屏與列印收據上</span>
                </div>
                <input id="setStoreName" value="${s.store_name || ''}" placeholder="請輸入店名" style="width:260px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:14px; outline:none; transition:all 0.2s;" onfocus="this.style.borderColor='#3b82f6'; this.style.background='#fff';" onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';">
              </div>
              
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px;">
                <div>
                  <span style="font-weight:600; color:#1e293b; font-size:15px; display:block; margin-bottom:2px;">預設付款方式</span>
                  <span style="font-size:12px; color:#94a3b8;">結帳畫面預設選擇的收款途徑</span>
                </div>
                <select id="setPayment" style="width:260px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:14px; outline:none; cursor:pointer;">
                  <option value="現金" ${s.default_payment === '現金' || !s.default_payment ? 'selected' : ''}>現金 Cash</option>
                  <option value="AlipayHK" ${s.default_payment === 'AlipayHK' ? 'selected' : ''}>支付寶 AlipayHK</option>
                  <option value="WeChat Pay" ${s.default_payment === 'WeChat Pay' ? 'selected' : ''}>微信 WeChat Pay</option>
                </select>
              </div>

            </div>
          </div>

          <!-- 區塊 2：介面與顯示 -->
          <div style="margin-bottom: 32px;">
            <h3 style="font-size:13px; color:#64748b; font-weight:700; margin:0 0 10px 12px; text-transform:uppercase; letter-spacing:1px;">介面與顯示</h3>
            <div style="background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.02); overflow:hidden;">
              
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9;">
                <div>
                  <span style="font-weight:600; color:#1e293b; font-size:15px; display:block; margin-bottom:2px;">深色模式強制設定</span>
                  <span style="font-size:12px; color:#94a3b8;">統一控制所有終端的色彩主題</span>
                </div>
                <select id="setForceDark" style="width:260px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:14px; outline:none; cursor:pointer;">
                  <option value="" ${!s.force_dark_mode ? 'selected' : ''}>不強制 (允許員工自行切換)</option>
                  <option value="true" ${s.force_dark_mode === 'true' ? 'selected' : ''}>🌙 強制鎖定深色模式</option>
                  <option value="false" ${s.force_dark_mode === 'false' ? 'selected' : ''}>☀️ 強制鎖定淺色模式</option>
                </select>
              </div>

              <!-- 💡 新增：購物車預設狀態 -->
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px;">
                <div>
                  <span style="font-weight:600; color:#1e293b; font-size:15px; display:block; margin-bottom:2px;">購物車側邊欄預設狀態</span>
                  <span style="font-size:12px; color:#94a3b8;">控制管理頁面中，右側面板是否強制顯示</span>
                </div>
                <select id="setForceOrderPinned" style="width:260px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:14px; outline:none; cursor:pointer;">
                  <option value="" ${!s.force_order_pinned ? 'selected' : ''}>不強制 (依賴各裝置本地記憶)</option>
                  <option value="true" ${s.force_order_pinned === 'true' ? 'selected' : ''}>📌 強制釘選 (永遠保持展開)</option>
                  <option value="false" ${s.force_order_pinned === 'false' ? 'selected' : ''}>👁️‍🗨️ 強制隱藏 (騰出全螢幕)</option>
                </select>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9;">
                <div>
                  <span style="font-weight:600; color:#1e293b; font-size:15px; display:block; margin-bottom:2px;">客顯屏顯示風格</span>
                  <span style="font-size:12px; color:#94a3b8;">設定面向顧客螢幕的色彩與主題</span>
                </div>
                <select id="setDisplayTheme" style="width:260px; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:14px; outline:none; cursor:pointer;">
                  <option value="default" ${s.display_theme !== 'nature' ? 'selected' : ''}>🌌 經典深空 (深色科技)</option>
                  <option value="nature" ${s.display_theme === 'nature' ? 'selected' : ''}>🌿 自然木質 (卍物所品牌)</option>
                </select>
              </div>

            </div>
          </div>

          <!-- 區塊 3：系統安全 -->
          <div style="margin-bottom: 32px;">
            <h3 style="font-size:13px; color:#64748b; font-weight:700; margin:0 0 10px 12px; text-transform:uppercase; letter-spacing:1px;">系統安全</h3>
            <div style="background:#fff; border-radius:16px; border:1px solid #fecaca; box-shadow:0 4px 12px rgba(220, 38, 38, 0.05); overflow:hidden;">
              
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px;">
                <div>
                  <span style="font-weight:600; color:#b91c1c; font-size:15px; display:block; margin-bottom:2px;">系統維護模式</span>
                  <span style="font-size:12px; color:#ef4444;">開啟後，一般員工將無法登入系統</span>
                </div>
                <select id="setMaintenance" style="width:260px; padding:10px 14px; border:1px solid #fca5a5; border-radius:8px; background:#fef2f2; color:#b91c1c; font-weight:bold; font-size:14px; outline:none; cursor:pointer;">
                  <option value="false" ${s.maintenance_mode !== 'true' ? 'selected' : ''}>🟢 關閉 (正常營運)</option>
                  <option value="true" ${s.maintenance_mode === 'true' ? 'selected' : ''}>🔴 開啟 (僅限 ADMIN)</option>
                </select>
              </div>

            </div>
          </div>
        </div>
      `;

      // 按鈕互動邏輯
      const btnSave = document.getElementById('btnSaveSettings');
      btnSave.onclick = async () => {
        const originalText = btnSave.innerHTML;
        btnSave.innerHTML = '🔄 儲存中...';
        btnSave.disabled = true;
        btnSave.style.opacity = '0.7';
        
        try {
          await window.posApi.upsertSetting('store_name', document.getElementById('setStoreName').value);
          await window.posApi.upsertSetting('default_payment', document.getElementById('setPayment').value);
          await window.posApi.upsertSetting('force_dark_mode', document.getElementById('setForceDark').value);
          await window.posApi.upsertSetting('maintenance_mode', document.getElementById('setMaintenance').value);
                    // 儲存顯示風格
          await window.posApi.upsertSetting('display_theme', document.getElementById('setDisplayTheme').value);

          // 💡 寫入全新的購物車釘選狀態設定
          await window.posApi.upsertSetting('force_order_pinned', document.getElementById('setForceOrderPinned').value);
          
          window.ui.toast('設定已成功儲存！', 'success');

          const btnRefresh = document.getElementById('btnRefreshSettings');
          if (btnRefresh) {
              btnRefresh.disabled = false;                // 解除停用狀態
              btnRefresh.style.cursor = 'pointer';        // 游標變回正常可點擊狀態
              btnRefresh.style.opacity = '1';             // 恢復正常透明度
              btnRefresh.style.background = '#16a34a';    // 變成綠色背景
              btnRefresh.style.color = '#ffffff';         // 圖示變成白色
              btnRefresh.style.borderColor = '#15803d';   // 邊框變成深綠色
              btnRefresh.title = '重新整理顯示 (Refresh Display)';
            }

        } catch (err) {
          window.ui.toast(`儲存失敗: ${err.message}`, 'error');
        } finally {
          btnSave.innerHTML = originalText;
          btnSave.disabled = false;
          btnSave.style.opacity = '1';
        }
      };

      const btnRefresh = document.getElementById('btnRefreshSettings');
      if (btnRefresh) {
        btnRefresh.onclick = () => {
          window.location.reload();
        };
      }

    } catch (e) {
      el.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444; font-weight:bold;">讀取設定失敗: ${e.message}</div>`;
    }
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