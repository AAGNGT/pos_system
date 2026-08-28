// 🌟 核心修復：監聽「上一頁」返回事件 (BFCache)，確保按鈕解凍
window.addEventListener('pageshow', (event) => {
    // 如果頁面是從快取中恢復的 (例如按了瀏覽器的上一頁)
    if (event.persisted) {
        const btnReceiptContact = document.getElementById('btnReceiptContact');
        if (btnReceiptContact && btnReceiptContact.disabled) {
            btnReceiptContact.textContent = '💬 聯絡我們';
            btnReceiptContact.disabled = false;
        }
        
        const btnSubmit = document.getElementById('btnSubmit');
        if (btnSubmit && btnSubmit.disabled) {
            btnSubmit.textContent = '查詢收據';
            btnSubmit.disabled = false;
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // 1. 手機版漢堡選單開關邏輯
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // 2. 登入按鈕行為
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'openAuthBtn') {
            window.location.href = 'index.html?auth=login';
        }
    });

    // 3. 綁定歷史記錄的點擊與刪除事件
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-delete-history');
            const historyItem = e.target.closest('.history-item');

            // 如果點擊的是刪除按鈕
            if (deleteBtn) {
                e.stopPropagation();
                const id = deleteBtn.dataset.id;
                deleteHistory(id);
                return;
            }

            // 如果點擊的是記錄卡片本身
            if (historyItem) {
                const id = historyItem.dataset.id;
                document.getElementById('orderId').value = id;
                document.getElementById('btnSubmit').click(); // 直接觸發查詢
            }
        });
    }

    // 4. 處理 URL 參數
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('ID') || urlParams.get('id');
    
    if (orderIdParam) {
        document.getElementById('searchView').style.display = 'none';
        document.getElementById('receiptView').style.display = 'block';
        fetchOrderDetails(orderIdParam);
    } else {
        document.getElementById('searchView').style.display = 'block';
        document.getElementById('receiptView').style.display = 'none';
        renderHistory();
    }
});

// ---------------------------------------------------------
// 連接 POS 系統 Supabase (只負責唯讀查詢訂單)
// ---------------------------------------------------------
const POS_SUPABASE_URL = 'https://dryvaibjsetigszkzxuh.supabase.co';
const POS_SUPABASE_KEY = 'sb_publishable_rUaICkdFf6_6aAtxgvI90Q__shoTcRA';
const posClient = supabase.createClient(POS_SUPABASE_URL, POS_SUPABASE_KEY);

// 處理表單提交
document.getElementById('trackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let inputVal = document.getElementById('orderId').value.trim();
    if (!inputVal) return;

    // 更新 URL
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('id', inputVal);
    window.history.pushState({ path: newUrl.href }, '', newUrl.href);

    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.textContent = '查詢中...';
    btnSubmit.disabled = true;
    document.getElementById('errorMsg').style.display = 'none';

    // 執行查詢
    fetchOrderDetails(inputVal);
});

// 處理「查詢其他」按鈕
document.getElementById('btnNewSearch').addEventListener('click', (e) => {
    e.preventDefault();
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete('id');
    newUrl.searchParams.delete('ID');
    window.history.pushState({ path: newUrl.href }, '', newUrl.href);
    
    document.getElementById('receiptView').style.display = 'none';
    document.getElementById('searchView').style.display = 'block';
    document.getElementById('orderId').value = '';
    document.getElementById('errorMsg').style.display = 'none';
    
    renderHistory();
});

// 核心查詢邏輯
async function fetchOrderDetails(queryVal) {
    const loadingEl = document.getElementById('receiptLoading');
    const contentEl = document.getElementById('receiptContent');
    const btnSubmit = document.getElementById('btnSubmit');
    const errorMsg = document.getElementById('errorMsg');
    
    // 顯示載入中畫面前，先切換視圖
    document.getElementById('searchView').style.display = 'none';
    document.getElementById('receiptView').style.display = 'block';
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    
    try {
        let query = posClient
            .from('pos_orders')
            .select('*, pos_order_items(*, pos_products(name))');

        if (/^\d+$/.test(queryVal)) {
            query = query.or(`order_code.eq.${queryVal},id.eq.${queryVal}`);
        } else {
            query = query.eq('order_code', queryVal);
        }

        const { data, error } = await query.single();

        if (error || !data) {
            throw new Error('找不到該訂單，請檢查編號是否正確。');
        }

        // 查詢成功，儲存到歷史記錄中
        const displayOrderCode = data.order_code ? data.order_code : data.id;
        saveToHistory(displayOrderCode);

        renderReceipt(data);
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (err) {
        document.getElementById('receiptView').style.display = 'none';
        document.getElementById('searchView').style.display = 'block';
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
        renderHistory();
    } finally {
        btnSubmit.textContent = '查詢收據';
        btnSubmit.disabled = false;
    }
}

// 渲染電子收據
function renderReceipt(data) {
    const displayOrderCode = data.order_code ? data.order_code : data.id;
    const dateObj = new Date(data.created_at);
    const dateStr = dateObj.toLocaleDateString('zh-HK') + ' ' + dateObj.toLocaleTimeString('zh-HK', {hour: '2-digit', minute:'2-digit'});
    
    const modeZh = { 'sale': '一般銷售', 'restock': '市集補貨', 'return': '市集退貨', 'damage': '產品報損' };
    const modeStr = modeZh[data.mode] || data.mode;
    
    let bannerClass = 'status-neutral';
    let bannerIcon = '📝';
    let bannerTitle = modeStr;
    let bannerSub = '記錄已建立';

    if (data.mode === 'sale') {
        bannerClass = 'status-success';
        bannerIcon = '✅';
        bannerTitle = '交易完成 (Completed)';
        bannerSub = `感謝您的購買！此為正式電子收據。`;
    } else if (data.mode === 'return' || data.mode === 'damage') {
        bannerClass = 'status-warning';
        bannerIcon = '⚠️';
    }

    const itemsHtml = (data.pos_order_items || []).map(item => `
        <div class="pos-receipt-item">
            <span style="flex:2; font-weight:500; color:#334155;">${item.pos_products?.name || '未知產品'}</span>
            <span style="flex:1; text-align:center; color:#64748b;">x${item.qty}</span>
            <span style="flex:1; text-align:right; font-weight:600; color:#0f172a;">$${Number(item.line_total).toFixed(2)}</span>
        </div>
    `).join('');

    const subtotal = Number(data.subtotal).toFixed(2);
    const discount = Number(data.discount_amount);
    const total = Number(data.total).toFixed(2);
    const received = Number(data.amount_received || 0).toFixed(2);
    const change = Number(data.change_amount || 0).toFixed(2);
    const paymentMethod = data.payment_method || 'N/A';

    let summaryHtml = `
        <div class="pos-receipt-summary-row">
            <span>小計</span><span class="pos-receipt-val">$${subtotal}</span>
        </div>`;
        
    if (discount > 0) {
        summaryHtml += `
        <div class="pos-receipt-summary-row">
            <span>折扣優惠</span><span style="color:#16a34a; font-weight:600;">-$${discount.toFixed(2)}</span>
        </div>`;
    }
    
    summaryHtml += `
        <div class="pos-receipt-total-row">
            <span>實付總額</span><span class="pos-receipt-total-val">$${total}</span>
        </div>`;

    const contentEl = document.getElementById('receiptContent');
    contentEl.innerHTML = `
        <div class="receipt-header-actions">
            <h1 style="margin:0; font-size:1.5rem; color:#0f172a; font-family:'Noto Serif TC', serif;">🧾 訂單細節</h1>
            <button type="button" class="btn-track-other" id="btnReceiptContact">💬 聯絡我們</button>
            <button type="button" class="btn-new-search" id="btnNewSearchBtn">🔍 查詢其他</button>
        </div>

        <div id="statusBanner" class="receipt-status-banner ${bannerClass}">
            <div class="status-icon">${bannerIcon}</div>
            <div class="status-text">
                <h3>${bannerTitle}</h3>
                <p>${bannerSub}</p>
            </div>
        </div>

        <div class="pos-receipt-card">
            <div class="pos-receipt-meta">
                <div class="pos-receipt-row">
                    <span>交易時間</span><span class="pos-receipt-val">${dateStr}</span>
                </div>
                <div class="pos-receipt-row">
                    <span>訂單編號</span><span class="pos-receipt-code">${displayOrderCode}</span>
                </div>
                <div class="pos-receipt-row">
                    <span>交易類型</span><span class="pos-receipt-val">${modeStr}</span>
                </div>
                <div class="pos-receipt-row">
                    <span>付款方式</span><span class="pos-receipt-val">${paymentMethod}</span>
                </div>
                <div class="pos-receipt-row" style="margin-top: 6px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
                    <span>實收 / 找續</span><span class="pos-receipt-val">$${received} / $${change}</span>
                </div>
            </div>

            <h4 style="margin: 0 0 12px 0; font-size: 1.05rem; color: #0f172a;">🛍️ 購買項目</h4>
            <div class="pos-receipt-items">
                ${itemsHtml || '<p style="padding:10px 0; color:#94a3b8; font-size:0.9rem; text-align:center;">無產品記錄</p>'}
            </div>

            ${summaryHtml}
        </div>
    `;

    // 綁定「查詢其他」按鈕事件
    document.getElementById('btnNewSearchBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('id');
        newUrl.searchParams.delete('ID');
        window.history.pushState({ path: newUrl.href }, '', newUrl.href);
        
        document.getElementById('receiptView').style.display = 'none';
        document.getElementById('searchView').style.display = 'block';
        document.getElementById('orderId').value = '';
        document.getElementById('errorMsg').style.display = 'none';
        renderHistory();
    });

    // 🌟 綁定「聯絡我們」按鈕事件：生成 Token 並無縫跳轉，且加入返回解凍機制
    const btnReceiptContact = document.getElementById('btnReceiptContact');
    if (btnReceiptContact) {
        const newBtn = btnReceiptContact.cloneNode(true);
        btnReceiptContact.parentNode.replaceChild(newBtn, btnReceiptContact);

        newBtn.addEventListener('click', () => {
            newBtn.textContent = '跳轉中...';
            newBtn.disabled = true;

            const trackingCode = data.order_code || data.id;
            const token = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
            
            sessionStorage.setItem('chat_token_order_' + trackingCode, token);
            
            setTimeout(() => {
                newBtn.textContent = '💬 聯絡我們';
                newBtn.disabled = false;
            }, 1500);

            window.location.href = `contact.html?order_id=${trackingCode}&token=${token}`;
        });
    }
}

// =========================================================
// 瀏覽記錄 (Local Storage) 及動態時間計算邏輯
// =========================================================
function saveToHistory(id) {
    let history = JSON.parse(localStorage.getItem('pos_track_history')) || [];
    history = history.filter(item => item.id !== String(id));
    history.unshift({ id: String(id), timestamp: Date.now() });
    
    if (history.length > 5) history.pop();
    localStorage.setItem('pos_track_history', JSON.stringify(history));
}

function deleteHistory(id) {
    let history = JSON.parse(localStorage.getItem('pos_track_history')) || [];
    history = history.filter(item => item.id !== String(id));
    localStorage.setItem('pos_track_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('pos_track_history')) || [];
    const panel = document.getElementById('historyPanel');
    const list = document.getElementById('historyList');
    
    if (history.length === 0) {
        panel.style.display = 'none';
        return;
    }
    
    panel.style.display = 'block';
    list.innerHTML = history.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-info">
                <span class="history-id">${item.id}</span>
                <span class="history-time">${timeAgo(item.timestamp)}</span>
            </div>
            <button type="button" class="btn-delete-history" data-id="${item.id}" aria-label="刪除記錄">×</button>
        </div>
    `).join('');
}

function timeAgo(timestamp) {
    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} 秒前`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} 分鐘前`;
    if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} 小時前`;
    }
    
    const date = new Date(timestamp);
    const today = new Date();
    const isYesterday = (today.getDate() - date.getDate() === 1) && (today.getMonth() === date.getMonth());
    const timeString = date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
    
    if (isYesterday) return `昨日 ${timeString}`;
    return date.toLocaleDateString('zh-HK') + ` ${timeString}`;
}
