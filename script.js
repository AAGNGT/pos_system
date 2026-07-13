// ==========================================
// Supabase 雲端資料庫設定
// ==========================================
const SUPABASE_URL = 'https://ysohdkbkhnsyowvzdlvn.supabase.co';      // 替換為你的 URL
const SUPABASE_ANON_KEY = 'sb_publishable_NM8ymgJgh-jYzXZgFYaHGg_w5rNBqSK'; // 替換為你的 anon key

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 核心資料狀態
let state = {
    expenses: { cap: 0, rent: 0, sup: 0, trans: 0, mark: 0 },
    products: [],   
    purchases: [],  
    sales: [],      
    customPrice: {} 
};

// ==========================================
// 雲端同步引擎 (Debounce & Bulk Upsert)
// ==========================================
const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const db = {
    syncExpenses: debounce(async () => {
        await _supabase.from('sheet_expenses').update(state.expenses).eq('id', 1);
    }, 800),

    syncProducts: debounce(async () => {
        if(state.products.length === 0) return;
        const payload = state.products.map(p => ({
            id: p.id, name: p.name, manual_qty: p.manualQty, custom_price: state.customPrice[p.id] || null
        }));
        await _supabase.from('sheet_products').upsert(payload);
    }, 800),

    syncPurchases: debounce(async () => {
        if(state.purchases.length === 0) return;
        const payload = state.purchases.map(r => ({
            id: r.id, date: r.date, prod_id: r.prodId, qty: r.qty, amount: r.amount, note: r.note
        }));
        await _supabase.from('sheet_purchases').upsert(payload);
    }, 800),

    syncSales: debounce(async () => {
        if(state.sales.length === 0) return;
        const payload = state.sales.map(r => ({
            id: r.id, date: r.date, prod_id: r.prodId, qty: r.qty, amount: r.amount, note: r.note
        }));
        await _supabase.from('sheet_sales').upsert(payload);
    }, 800),

    // 刪除操作 (需要立刻執行)
    deleteProduct: async (id) => { await _supabase.from('sheet_products').delete().eq('id', id); },
    deletePurchase: async (id) => { await _supabase.from('sheet_purchases').delete().eq('id', id); },
    deleteSale: async (id) => { await _supabase.from('sheet_sales').delete().eq('id', id); }
};

// ==========================================
// 初始載入：從 Supabase 抓取資料
// ==========================================
async function loadStateFromCloud() {
    try {
        const [expRes, prodRes, purRes, saleRes] = await Promise.all([
            _supabase.from('sheet_expenses').select('*').eq('id', 1).single(),
            _supabase.from('sheet_products').select('*'),
            _supabase.from('sheet_purchases').select('*'),
            _supabase.from('sheet_sales').select('*')
        ]);

        if (expRes.data) {
            const e = expRes.data;
            state.expenses = { cap: e.cap, rent: e.rent, sup: e.sup, trans: e.trans, mark: e.mark };
        }
        if (prodRes.data) {
            state.products = prodRes.data.map(p => ({ id: p.id, name: p.name, manualQty: p.manual_qty }));
            prodRes.data.forEach(p => { if (p.custom_price !== null) state.customPrice[p.id] = p.custom_price; });
        }
        if (purRes.data) {
            state.purchases = purRes.data.map(r => ({ id: r.id, date: r.date, prodId: r.prod_id, qty: r.qty, amount: r.amount, note: r.note }));
        }
        if (saleRes.data) {
            state.sales = saleRes.data.map(r => ({ id: r.id, date: r.date, prodId: r.prod_id, qty: r.qty, amount: r.amount, note: r.note }));
        }

        document.getElementById('inp-cap').value = state.expenses.cap || '';
        document.getElementById('inp-rent').value = state.expenses.rent || '';
        document.getElementById('inp-sup').value = state.expenses.sup || '';
        document.getElementById('inp-trans').value = state.expenses.trans || '';
        document.getElementById('inp-mark').value = state.expenses.mark || '';

        renderProducts();
        calculateDashboard();
    } catch (error) {
        console.error("載入雲端資料失敗", error);
        alert("資料庫連線失敗，請檢查 API Key");
    }
}

// ==========================================
// 介面與業務邏輯 (連動雲端同步)
// ==========================================

function navTo(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    event.target.classList.add('active');
    
    if(sectionId === 'purchases') renderPurchases();
    if(sectionId === 'sales') renderSales();
    if(sectionId === 'inventory') renderInventory();
}

function updateState(key, val) {
    state.expenses[key] = parseFloat(val) || 0;
    calculateDashboard();
    db.syncExpenses(); 
}

// --- 產品管理 ---
function addProduct() {
    const id = 'P' + Date.now();
    state.products.push({ id: id, name: '未命名商品', manualQty: 0 });
    renderProducts();
    calculateDashboard();
    db.syncProducts(); 
}

function updateProductName(id, newName) {
    const p = state.products.find(x => x.id === id);
    if(p) {
        p.name = newName;
        db.syncProducts();
    }
}

function updateProductQty(id, qty) {
    const p = state.products.find(x => x.id === id);
    if(p) {
        p.manualQty = parseFloat(qty) || 0;
        calculateDashboard(); 
        if(document.getElementById('inventory').classList.contains('active')) renderInventory();
        
        const stats = getStats();
        const avg = stats[id].purQty > 0 ? (stats[id].purAmt / stats[id].purQty).toFixed(2) : '0.00';
        document.getElementById(`avg-cost-${id}`).innerText = `$${avg}`;
        
        db.syncProducts();
    }
}

function delProduct(id) {
    if(!confirm("⚠️ 雙重確認：刪除產品會一併刪除所有相關的購貨與銷貨紀錄，你確定要刪除嗎？")) return;
    
    state.products = state.products.filter(x => x.id !== id);
    state.purchases = state.purchases.filter(x => x.prodId !== id);
    state.sales = state.sales.filter(x => x.prodId !== id);
    
    renderProducts();
    calculateDashboard();
    
    db.deleteProduct(id);
}

function renderProducts() {
    const stats = getStats();
    const html = state.products.map(p => {
        const s = stats[p.id] || { purQty: 0, purAmt: 0 };
        const avg = s.purQty > 0 ? (s.purAmt / s.purQty).toFixed(2) : '0.00';
        return `
        <tr>
            <td><input type="text" class="cell-input" value="${p.name}" oninput="updateProductName('${p.id}', this.value)"></td>
            <td>
                <input type="number" class="cell-input" style="border: 1px dashed var(--border); background: var(--bg)" 
                       value="${p.manualQty || ''}" placeholder="填寫製成總量" oninput="updateProductQty('${p.id}', this.value)">
            </td>
            <td>$${s.purAmt.toFixed(2)}</td>
            <td id="avg-cost-${p.id}" style="color: var(--text-secondary)">$${avg}</td>
            <td><button class="btn-danger" onclick="delProduct('${p.id}')">刪除</button></td>
        </tr>`;
    }).join('');
    document.getElementById('tb-products').innerHTML = html || '<tr><td colspan="5" class="text-center" style="padding: 24px; color: var(--text-tertiary)">尚無產品，請點擊上方按鈕新增。</td></tr>';
}

// --- 紀錄管理 (購貨 & 銷貨) ---
function getToday() { return new Date().toISOString().split('T')[0]; }

function addRow(type) {
    const targetArr = type === 'purchases' ? state.purchases : state.sales;
    targetArr.push({
        id: 'R' + Date.now(),
        date: getToday(),
        prodId: state.products.length > 0 ? state.products[0].id : '',
        qty: 0, amount: 0, note: ''
    });
    
    type === 'purchases' ? renderPurchases() : renderSales();
    calculateDashboard();
    
    type === 'purchases' ? db.syncPurchases() : db.syncSales();
}

function updateRow(type, id, field, val) {
    const arr = type === 'purchases' ? state.purchases : state.sales;
    const row = arr.find(x => x.id === id);
    if(row) {
        if(field === 'qty' || field === 'amount') row[field] = parseFloat(val) || 0;
        else row[field] = val;
        
        calculateDashboard(); 
        if(type === 'purchases' && document.getElementById('products').classList.contains('active')) {
            renderProducts(); 
        }
        
        type === 'purchases' ? db.syncPurchases() : db.syncSales();
    }
}

function delRow(type, id) {
    if(!confirm("⚠️ 雙重確認：確定要刪除這筆交易紀錄嗎？")) return;
    
    if(type === 'purchases') {
        state.purchases = state.purchases.filter(x => x.id !== id);
        renderPurchases();
        db.deletePurchase(id);
    } else {
        state.sales = state.sales.filter(x => x.id !== id);
        renderSales();
        db.deleteSale(id);
    }
    
    calculateDashboard();
    if(document.getElementById('products').classList.contains('active')) renderProducts();
}

function getProductOptionsHTML(selectedId) {
    if(state.products.length === 0) return `<option value="">請先新增產品</option>`;
    return state.products.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`).join('');
}

function renderPurchases() {
    const html = state.purchases.map(r => `
        <tr>
            <td><input type="date" class="cell-input" value="${r.date}" oninput="updateRow('purchases', '${r.id}', 'date', this.value)"></td>
            <td><select class="cell-input" onchange="updateRow('purchases', '${r.id}', 'prodId', this.value)">${getProductOptionsHTML(r.prodId)}</select></td>
            <td><input type="number" class="cell-input" value="${r.qty || ''}" placeholder="選填" oninput="updateRow('purchases', '${r.id}', 'qty', this.value)"></td>
            <td><input type="number" class="cell-input" value="${r.amount || ''}" placeholder="填寫金額" oninput="updateRow('purchases', '${r.id}', 'amount', this.value)"></td>
            <td><input type="text" class="cell-input" value="${r.note}" placeholder="填寫備註" oninput="updateRow('purchases', '${r.id}', 'note', this.value)"></td>
            <td><button class="btn-danger" onclick="delRow('purchases', '${r.id}')">刪除</button></td>
        </tr>
    `).join('');
    document.getElementById('tb-purchases').innerHTML = html || '<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-tertiary)">尚無紀錄。</td></tr>';
}

function renderSales() {
    const html = state.sales.map(r => `
        <tr>
            <td><input type="date" class="cell-input" value="${r.date}" oninput="updateRow('sales', '${r.id}', 'date', this.value)"></td>
            <td><select class="cell-input" onchange="updateRow('sales', '${r.id}', 'prodId', this.value)">${getProductOptionsHTML(r.prodId)}</select></td>
            <td><input type="number" class="cell-input" value="${r.qty || ''}" placeholder="0" oninput="updateRow('sales', '${r.id}', 'qty', this.value)"></td>
            <td><input type="number" class="cell-input" value="${r.amount || ''}" placeholder="0" oninput="updateRow('sales', '${r.id}', 'amount', this.value)"></td>
            <td><input type="text" class="cell-input" value="${r.note}" placeholder="填寫備註" oninput="updateRow('sales', '${r.id}', 'note', this.value)"></td>
            <td><button class="btn-danger" onclick="delRow('sales', '${r.id}')">刪除</button></td>
        </tr>
    `).join('');
    document.getElementById('tb-sales').innerHTML = html || '<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-tertiary)">尚無紀錄。</td></tr>';
}

// --- 期末存貨 ---
function updateCustomPrice(prodId, val) {
    state.customPrice[prodId] = parseFloat(val);
    calculateDashboard();
    db.syncProducts(); 
    
    const stats = getStats();
    const s = stats[prodId];
    const remain = s.purQty - s.saleQty;
    const price = isNaN(state.customPrice[prodId]) ? s.avgCost : state.customPrice[prodId];
    const lineTotal = remain * price;
    document.getElementById(`inv-total-${prodId}`).innerText = `$${lineTotal.toFixed(2)}`;
    document.getElementById(`inv-total-${prodId}`).className = lineTotal < 0 ? 'text-right text-danger' : 'text-right';
}

function renderInventory() {
    const stats = getStats();
    const html = state.products.map(p => {
        const s = stats[p.id] || { purQty: 0, saleQty: 0, avgCost: 0 };
        const remain = s.purQty - s.saleQty;
        const currentPrice = state.customPrice[p.id] !== undefined && !isNaN(state.customPrice[p.id]) 
                             ? state.customPrice[p.id] : s.avgCost;
        const lineTotal = remain * currentPrice;
        const warnClass = remain < 0 ? 'text-danger' : '';

        return `
        <tr>
            <td style="font-weight:500">${p.name}</td>
            <td class="${warnClass}">${remain}</td>
            <td style="color: var(--text-secondary)">$${s.avgCost.toFixed(2)}</td>
            <td>
                <input type="number" step="0.1" class="cell-input" style="border: 1px dashed var(--border); background: var(--bg)" 
                       placeholder="預設為 ${s.avgCost.toFixed(1)}" value="${state.customPrice[p.id] !== undefined && !isNaN(state.customPrice[p.id]) ? state.customPrice[p.id] : ''}" 
                       oninput="updateCustomPrice('${p.id}', this.value)">
            </td>
            <td id="inv-total-${p.id}" class="text-right ${lineTotal < 0 ? 'text-danger' : ''}">$${lineTotal.toFixed(2)}</td>
        </tr>`;
    }).join('');
    document.getElementById('tb-inventory').innerHTML = html || '<tr><td colspan="5" class="text-center" style="padding: 24px; color: var(--text-tertiary)">尚無產品可盤點。</td></tr>';
}

// --- 核心計算引擎 ---
function getStats() {
    let stats = {};
    state.products.forEach(p => { 
        stats[p.id] = { purQty: p.manualQty || 0, purAmt: 0, saleQty: 0, saleAmt: 0, avgCost: 0 }; 
    });
    
    state.purchases.forEach(r => {
        if(stats[r.prodId]) stats[r.prodId].purAmt += r.amount; 
    });
    state.sales.forEach(r => {
        if(stats[r.prodId]) {
            stats[r.prodId].saleQty += r.qty;
            stats[r.prodId].saleAmt += r.amount;
        }
    });
    for(let id in stats) {
        stats[id].avgCost = stats[id].purQty > 0 ? (stats[id].purAmt / stats[id].purQty) : 0;
    }
    return stats;
}

function calculateDashboard() {
    const stats = getStats();
    
    let totalPur = 0, totalSale = 0, totalInv = 0;
    state.purchases.forEach(r => totalPur += r.amount);
    state.sales.forEach(r => totalSale += r.amount);

    state.products.forEach(p => {
        const remain = stats[p.id].purQty - stats[p.id].saleQty;
        const price = state.customPrice[p.id] !== undefined && !isNaN(state.customPrice[p.id]) 
                      ? state.customPrice[p.id] : stats[p.id].avgCost;
        totalInv += (remain * price);
    });

    const exp = state.expenses;
    const totalExp = exp.rent + exp.sup + exp.trans + exp.mark;
    const cogs = totalPur - totalInv;
    const gross = totalSale - cogs;
    const net = gross - totalExp;

    if(document.getElementById('total-purchases-ui')) document.getElementById('total-purchases-ui').innerText = `$${totalPur.toFixed(1)}`;
    if(document.getElementById('total-sales-ui')) document.getElementById('total-sales-ui').innerText = `$${totalSale.toFixed(1)}`;
    if(document.getElementById('total-inv-ui')) document.getElementById('total-inv-ui').innerText = `$${totalInv.toFixed(1)}`;

    const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});
    
    document.getElementById('rep-sales').innerText = fmt(totalSale);
    document.getElementById('rep-purchases').innerText = fmt(totalPur);
    document.getElementById('rep-end-inv').innerText = fmt(totalInv);
    document.getElementById('rep-cogs').innerText = fmt(cogs);
    
    const elGross = document.getElementById('rep-gross');
    elGross.innerText = fmt(gross);
    elGross.className = gross < 0 ? 'text-danger summary-row total' : 'text-accent summary-row total';

    document.getElementById('rep-exp-rent').innerText = fmt(exp.rent);
    document.getElementById('rep-exp-sup').innerText = fmt(exp.sup);
    document.getElementById('rep-exp-trans').innerText = fmt(exp.trans);
    document.getElementById('rep-exp-mark').innerText = fmt(exp.mark);
    document.getElementById('rep-total-exp').innerText = fmt(totalExp);

    const elNet = document.getElementById('rep-net');
    elNet.innerText = fmt(net);
    elNet.style.color = net < 0 ? '#dc2626' : 'var(--text)';

    document.getElementById('rep-capital').innerText = fmt(exp.cap);
    document.getElementById('rep-margin-gross').innerText = totalSale > 0 ? (gross / totalSale * 100).toFixed(1) + '%' : '0.0%';
    document.getElementById('rep-margin-net').innerText = totalSale > 0 ? (net / totalSale * 100).toFixed(1) + '%' : '0.0%';
    
    const roi = exp.cap > 0 ? (net / exp.cap * 100).toFixed(1) : 0;
    const elRoi = document.getElementById('rep-roi');
    elRoi.innerText = roi + '%';
    elRoi.style.color = roi < 0 ? '#dc2626' : 'var(--accent)';
}

// ==========================================
// 安全機制與編輯模式切換
// ==========================================

// 開啟網頁時，預設先鎖上 (加入唯讀 class)
document.body.classList.add('readonly-mode');

// 監聽 Supabase 登入狀態
_supabase.auth.onAuthStateChange(async (event, session) => {
    const lockBtn = document.getElementById('auth-status-btn');
    
    if (session) {
        // 🛑 安全攔截：檢查 Email 是否為唯一的管理員帳號
        if (session.user.email !== 'admin@market.local') {
            showToast("⚠️ 權限不足：此帳戶無編輯財務報表的權限！", true);
            await _supabase.auth.signOut(); // 強制登出非法帳戶
            return;
        }

        document.body.classList.remove('readonly-mode');
        lockBtn.innerHTML = '🔓 已解鎖編輯 (點擊鎖定)';
        lockBtn.onclick = logoutAdmin;
    } else {
        document.body.classList.add('readonly-mode');
        lockBtn.innerHTML = '🔒 唯讀模式 (點擊解鎖)';
        lockBtn.onclick = toggleAuthModal;
    }
});

function toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.toggle('show');
    if(modal.classList.contains('show')) document.getElementById('admin-pwd').focus();
}

// --- 專屬自訂通知函數 ---
function showToast(message, isError = false) {
    const toast = document.getElementById('custom-toast');
    toast.innerHTML = message;
    
    if (isError) toast.classList.add('error');
    else toast.classList.remove('error');
    
    toast.classList.add('show');
    
    // 3.5秒後自動平滑隱藏
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// --- 登入與登出邏輯 ---
async function loginAdmin() {
    const emailInput = 'admin@market.local'; // 絕對寫死，無視任何前端竄改
    const pwdInput = document.getElementById('admin-pwd').value;
    
    if(!pwdInput) {
        showToast("⚠️ 請輸入密碼！", true);
        return;
    }
    
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: emailInput,
        password: pwdInput
    });

    if (error) {
        showToast("⚠️ 登入失敗：密碼錯誤", true);
    } else {
        document.getElementById('admin-pwd').value = '';
        toggleAuthModal();
        showToast("🔓 登入成功！已切換至編輯模式。");
    }
}

async function logoutAdmin() {
    await _supabase.auth.signOut();
    showToast("🔒 已鎖定。系統回到唯讀模式。");
}

window.onload = function() {
    loadStateFromCloud(); 
};
