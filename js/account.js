/**
 * 卍物所 — 我的帳戶頁（個人資料 + 會員快速訂單）
 */
(function () {
    'use strict';

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatPrice(n) {
        return 'HK$' + Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d + 'T00:00:00').toLocaleDateString('zh-HK', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
        });
    }

    function formatDateTime(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('zh-HK', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function statusLabel(status) {
        const map = {
            pending: '待確認',
            confirmed: '已確認',
            completed: '已完成',
            cancelled: '已取消'
        };
        return map[status] || status || '待確認';
    }

    function showFeedback(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = 'form-feedback show ' + type;
    }

    function renderMarketDatePicker(containerId, name) {
        const container = document.getElementById(containerId);
        if (!container || !window.WanwuAuth) return;

        const dates = WanwuAuth.MARKET_DATES || [];
        container.innerHTML = dates.map(function (d) {
            const id = containerId + '-' + d.value;
            return `
                <div class="date-option">
                    <input type="radio" name="${name}" id="${id}" value="${d.value}" required>
                    <label for="${id}">
                        <strong>${escapeHtml(d.label)}</strong>
                        ${escapeHtml(d.day)}
                    </label>
                </div>`;
        }).join('');
    }

    function buildProductOptions(products, selectedId) {
        if (!products.length) {
            return '<option value="">暫無產品</option>';
        }
        return '<option value="">請選擇產品 *</option>' + products.map(function (p) {
            const sel = String(p.id) === String(selectedId) ? ' selected' : '';
            return `<option value="${p.id}" data-price="${p.price}" data-name="${escapeAttr(p.name)}"${sel}>${escapeHtml(p.name)} — ${formatPrice(p.price)}</option>`;
        }).join('');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    async function renderAccount() {
        const container = document.getElementById('accountContent');
        if (!container || !window.WanwuAuth) return;

        const session = await WanwuAuth.requireAuth('index.html?auth=login');
        if (!session) return;

        const user = session.user;
        let profile = await WanwuAuth.getProfile(user.id);
        if (!profile) {
            await WanwuAuth.ensureProfile(user);
            profile = await WanwuAuth.getProfile(user.id);
        }

        const displayName = (profile && profile.display_name) || WanwuAuth.displayLabel(user);
        const phone = (profile && profile.phone) || '';
        const products = await WanwuAuth.fetchOrderProducts();

        container.innerHTML = `
            <div class="account-member-banner">
                <p>已登入為 <strong>${escapeHtml(displayName)}</strong>（${escapeHtml(user.email)}）</p>
                <p class="account-member-hint">快速訂單會自動使用帳戶資料，無需重複填寫聯絡欄位。</p>
            </div>

            <div class="account-grid">
                <section class="account-panel">
                    <h2 class="account-panel-title">個人資料</h2>
                    <form id="profileForm" class="account-form">
                        <div class="form-group">
                            <label for="profile_email">電郵</label>
                            <input type="email" id="profile_email" value="${escapeHtml(user.email)}" disabled>
                        </div>
                        <div class="form-group">
                            <label for="profile_name">顯示名稱</label>
                            <input type="text" id="profile_name" name="display_name" value="${escapeHtml(displayName)}" autocomplete="name">
                        </div>
                        <div class="form-group">
                            <label for="profile_phone">電話（建議填寫，方便市集聯絡）</label>
                            <input type="tel" id="profile_phone" name="phone" value="${escapeHtml(phone)}" autocomplete="tel">
                        </div>
                        <button type="submit" class="btn btn-primary">儲存變更</button>
                        <div class="form-feedback" id="profileFeedback" role="status"></div>
                    </form>
                </section>

                <section class="account-panel account-panel--order">
                    <h2 class="account-panel-title">快速預訂</h2>
                    <p class="account-hint">選擇產品與取貨日，一鍵提交至 Supabase 訂單表。</p>
                    <form id="orderForm" novalidate>
                        <div class="form-group">
                            <label for="orderProduct">購買產品 *</label>
                            <select id="orderProduct" name="product_id" required>
                                ${buildProductOptions(products)}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="orderQuantity">數量</label>
                            <input type="number" id="orderQuantity" name="quantity" min="1" max="20" value="1">
                        </div>
                        <div class="form-group">
                            <label>取貨日期 *</label>
                            <div class="date-picker" id="accountDatePicker"></div>
                        </div>
                        <div class="form-group">
                            <label for="orderNotes">備註（選填）</label>
                            <textarea id="orderNotes" name="notes" placeholder="特殊要求…"></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%">提交訂單</button>
                        <p class="form-legal-note">提交即表示您同意我們依 <a href="privacy.html">《私隱權政策》</a> 處理資料。</p>
                        <div class="form-feedback" id="orderFeedback" role="status"></div>
                    </form>
                </section>
            </div>

            <section class="account-panel account-orders-full">
                <h2 class="account-panel-title">我的訂單</h2>
                <div id="ordersList" class="reservation-list">
                    <p class="loading-placeholder">載入中…</p>
                </div>
            </section>

            <div class="account-actions">
                <button type="button" class="btn btn-secondary" id="logoutBtn">登出</button>
            </div>`;

        renderMarketDatePicker('accountDatePicker', 'pickup_date');

        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('profileFeedback');
                const btn = profileForm.querySelector('button[type="submit"]');
                btn.disabled = true;
                try {
                    await WanwuAuth.updateProfile(user.id, {
                        display_name: profileForm.display_name.value.trim(),
                        phone: profileForm.phone.value.trim()
                    });
                    showFeedback(fb, '個人資料已更新', 'success');
                } catch (err) {
                    showFeedback(fb, err.message || '更新失敗', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('orderFeedback');
                const btn = orderForm.querySelector('button[type="submit"]');
                const productSel = document.getElementById('orderProduct');
                const opt = productSel.options[productSel.selectedIndex];

                if (!productSel.value) {
                    showFeedback(fb, '請選擇產品', 'error');
                    return;
                }

                const pickup = orderForm.querySelector('input[name="pickup_date"]:checked');
                if (!pickup) {
                    showFeedback(fb, '請選擇取貨日期', 'error');
                    return;
                }

                btn.disabled = true;
                showFeedback(fb, '提交中…', 'success');

                try {
                    await WanwuAuth.createOrder({
                        product_id: Number(productSel.value),
                        product_name: opt.dataset.name || opt.textContent.split(' — ')[0],
                        unit_price: Number(opt.dataset.price) || null,
                        quantity: parseInt(orderForm.quantity.value, 10) || 1,
                        pickup_date: pickup.value,
                        notes: orderForm.notes.value.trim() || null
                    });
                    orderForm.reset();
                    orderForm.quantity.value = '1';
                    renderMarketDatePicker('accountDatePicker', 'pickup_date');
                    showFeedback(fb, '訂單已提交。我們會於市集為您備貨。', 'success');
                    loadOrders();
                } catch (err) {
                    showFeedback(fb, err.message || '提交失敗', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function () {
                await WanwuAuth.signOut();
                window.location.href = 'index.html';
            });
        }

        loadOrders();
    }

    async function loadOrders() {
        const list = document.getElementById('ordersList');
        if (!list || !window.WanwuAuth) return;

        const orders = await WanwuAuth.getMyOrders();
        const legacy = await WanwuAuth.getMyReservations();

        if (!orders.length && !legacy.length) {
            list.innerHTML = '<p class="account-empty">暫無訂單。使用上方「快速預訂」提交第一筆訂單。</p>';
            return;
        }

        let html = '';

        if (orders.length) {
            html += orders.map(function (o) {
                const total = o.unit_price ? formatPrice(Number(o.unit_price) * Number(o.quantity || 1)) : '—';
                return `
                    <article class="reservation-card">
                        <div class="reservation-card-head">
                            <strong>${escapeHtml(o.product_name)}</strong>
                            <span class="reservation-status">${escapeHtml(statusLabel(o.status))}</span>
                        </div>
                        <dl class="reservation-meta">
                            <div><dt>取貨日</dt><dd>${escapeHtml(formatDate(o.pickup_date))}</dd></div>
                            <div><dt>數量</dt><dd>${escapeHtml(String(o.quantity || 1))}</dd></div>
                            <div><dt>估計金額</dt><dd>${escapeHtml(total)}</dd></div>
                            <div><dt>提交時間</dt><dd>${escapeHtml(formatDateTime(o.created_at))}</dd></div>
                        </dl>
                        ${o.notes ? `<p class="reservation-notes">${escapeHtml(o.notes)}</p>` : ''}
                    </article>`;
            }).join('');
        }

        if (legacy.length) {
            html += '<p class="account-legacy-label">舊版預訂記錄</p>';
            html += legacy.map(function (r) {
                return `
                    <article class="reservation-card reservation-card--legacy">
                        <div class="reservation-card-head">
                            <strong>${escapeHtml(r.product_interest || '未指定產品')}</strong>
                            <span class="reservation-status">${escapeHtml(statusLabel(r.status))}</span>
                        </div>
                        <dl class="reservation-meta">
                            <div><dt>取貨日</dt><dd>${escapeHtml(formatDate(r.pickup_date))}</dd></div>
                            <div><dt>數量</dt><dd>${escapeHtml(String(r.quantity || 1))}</dd></div>
                            <div><dt>提交時間</dt><dd>${escapeHtml(formatDateTime(r.created_at))}</dd></div>
                        </dl>
                    </article>`;
            }).join('');
        }

        list.innerHTML = html;
    }

    document.addEventListener('DOMContentLoaded', function () {
        renderAccount();
    });
})();
