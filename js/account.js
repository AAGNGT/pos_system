/**
 * 卍物所 — 我的帳戶頁（完美整合版）
 * 包含：個人資料 + 密碼修改 + 模糊鎖定預訂 + 新版訂單查詢 (已加入會員/訪客分類與管理員檢視支援)
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
            cancelled: '已取消',
            processing: '處理中',
            ready: '已完成備貨'
        };
        return map[status] || status || '待確認';
    }

    function showFeedback(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = 'form-feedback show ' + type;
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

        // 讀取當前用戶的所有登入身份類型
        const identities = user.identities || [];
        const hasEmail = identities.some(id => id.provider === 'email');
        const hasGoogle = identities.some(id => id.provider === 'google');

        // 生成管理員/會員橫幅
        let bannerHtml = '';
        if (user.email === 'admin@market.local') {
            bannerHtml = `
            <div class="account-member-banner admin-banner" style="background: #353232; border: 1px solid rgb(93, 93, 99); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 20px 24px; border-radius: 16px; box-shadow: 0 16px 40px rgba(131, 131, 131, 0.15);">
                <div>
                    <p style="color: #ffffff; font-family: 'Noto Serif TC', serif; font-size: 0.95rem; font-weight: 500; letter-spacing: 0.15em; margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--accent); font-size: 1.1rem; line-height: 1;">❖</span> 管理員模式
                    </p>
                    <p style="margin: 0; color: #86868b; font-size: 0.82rem; letter-spacing: 0.05em;">
                        已登入為 <strong style="color: #e5e5ea; font-weight: 500;">${escapeHtml(displayName)}</strong> 
                        <span style="opacity: 0.6;">（${escapeHtml(user.email)}）</span>
                    </p>
                </div>
                <a href="admin.html" class="btn" style="background: #ffffff; color: #000000; border: none; padding: 12px 28px; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.1em; border-radius: 999px; transition: transform 0.2s ease;">進入控制台</a>
            </div>`;
        } else {
            bannerHtml = `
            <div class="account-member-banner">
                <p>已登入為 <strong>${escapeHtml(displayName)}</strong>（${escapeHtml(user.email)}）</p>
            </div>`;
        }

        // 寫入主畫面內容
        container.innerHTML = `
            ${bannerHtml}

            <div class="account-grid">
                <!-- 左側：個人資料及密碼設定 -->
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

                    <div class="auth-status-card">
                        <div class="auth-status-header">
                            <div class="auth-status-title">
                                <div class="auth-status-dot ${hasEmail ? 'active-email' : ''}"></div>
                                <span style="color: ${hasEmail ? 'var(--text)' : 'var(--text-tertiary)'}">本機電子郵件</span>
                            </div>
                            <span class="auth-status-badge ${hasEmail ? 'active-email' : ''}">
                                ${hasEmail ? '已驗證' : '未啟用'}
                            </span>
                        </div>
                        
                        ${hasEmail ? `
                        <div class="auth-status-action-row">
                            <button type="button" id="btnTogglePasswordEdit" class="auth-status-edit-btn">編輯密碼</button>
                        </div>
                        <div id="passwordEditSection" class="password-edit-form hidden">
                            <form id="passwordChangeForm" novalidate>
                                <div class="form-group">
                                    <label for="old_password">原有密碼</label>
                                    <input type="password" id="old_password" required autocomplete="current-password">
                                </div>
                                <div class="form-group">
                                    <label for="new_password">新密碼（最少 6 位字元）</label>
                                    <input type="password" id="new_password" required autocomplete="new-password">
                                </div>
                                <div class="form-group">
                                    <label for="confirm_new_password">確認新密碼</label>
                                    <input type="password" id="confirm_new_password" required autocomplete="new-password">
                                </div>
                                <button type="submit" class="btn btn-primary" style="width:100%; padding: 10px; font-size: 0.85rem;">確認變更密碼</button>
                                <div class="form-feedback" id="passwordFeedback" role="status"></div>
                            </form>
                        </div>
                        ` : ''}
                    </div>

                    <div class="auth-status-card">
                        <div class="auth-status-header">
                            <div class="auth-status-title">
                                <div class="auth-status-dot ${hasGoogle ? 'active-google' : ''}"></div>
                                <span style="color: ${hasGoogle ? 'var(--text)' : 'var(--text-tertiary)'}">Google 帳戶連結</span>
                            </div>
                            <span class="auth-status-badge ${hasGoogle ? 'active-google' : ''}">
                                ${hasGoogle ? '已連結' : '未啟用'}
                            </span>
                        </div>
                    </div>
                </section>

                <!-- 右側：被鎖定的快速預訂區塊 -->
                <section class="account-panel account-panel--order" style="position: relative; overflow: hidden;">
                    <h2 class="account-panel-title">⚡ 快速預訂</h2>
                    
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); background: rgba(255, 255, 255, 0.7); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; text-align: center; padding: 20px;">
                        <div style="font-size: 3rem; margin-bottom: 8px;">🔒</div>
                        <h4 style="color: #991b1b; margin-bottom: 8px; font-family: 'Noto Serif TC', serif; font-size: 1.2rem; font-weight: 600;">技術問題，正在維護中</h4>
                        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5;">此區塊的快速預訂功能暫時關閉。<br>如需訂購，請點擊下方按鈕。</p>
                        <a href="submit.html" class="btn btn-primary" style="text-decoration: none; padding: 12px 28px; box-shadow: 0 4px 6px rgba(153, 27, 27, 0.2);">📝 前往下單預訂</a>
                    </div>

                    <div style="pointer-events: none; opacity: 0.3; user-select: none;">
                        <p class="account-hint">選擇產品與取貨日，一鍵提交至 Supabase 訂單表。</p>
                        <div class="form-group">
                            <label style="display:block; margin-bottom:8px; font-weight: 500;">購買產品 *</label>
                            <select style="width:100%; padding:12px; border-radius:6px; border:1px solid #ccc; background:#f9f9f9;" disabled><option>寧磚 · 貓爪</option></select>
                        </div>
                        <div class="form-group" style="margin-top:20px;">
                            <label style="display:block; margin-bottom:8px; font-weight: 500;">數量</label>
                            <input type="number" value="1" style="width:100%; padding:12px; border-radius:6px; border:1px solid #ccc; background:#f9f9f9;" disabled>
                        </div>
                        <div class="form-group" style="margin-top:20px;">
                            <label style="display:block; margin-bottom:8px; font-weight: 500;">取貨日期 *</label>
                            <input type="date" style="width:100%; padding:12px; border-radius:6px; border:1px solid #ccc; background:#f9f9f9;" disabled>
                        </div>
                        <button style="width:100%; padding:14px; margin-top:24px; background:#e5e7eb; color:#9ca3af; border:none; border-radius:6px; font-weight:600;" disabled>提交訂單</button>
                    </div>
                </section>
            </div>

            <!-- 下方：我的訂單列表 -->
            <section class="account-panel account-orders-full">
                <h2 class="account-panel-title">我的訂單記錄</h2>
                <div id="ordersList" class="reservation-list">
                    <p class="loading-placeholder">載入中…</p>
                </div>
            </section>

            <div class="account-actions">
                <button type="button" class="btn btn-secondary" id="logoutBtn">登出</button>
            </div>
        `;

        // --- 綁定：個人資料更新 ---
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

        // --- 綁定：密碼編輯展開與收合 ---
        const btnTogglePasswordEdit = document.getElementById('btnTogglePasswordEdit');
        const passwordEditSection = document.getElementById('passwordEditSection');
        if (btnTogglePasswordEdit && passwordEditSection) {
            btnTogglePasswordEdit.addEventListener('click', function () {
                const isHidden = passwordEditSection.classList.toggle('hidden');
                btnTogglePasswordEdit.textContent = isHidden ? '編輯密碼' : '取消編輯';
            });
        }

        // --- 綁定：變更密碼表單提交 ---
        const passwordChangeForm = document.getElementById('passwordChangeForm');
        if (passwordChangeForm) {
            passwordChangeForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('passwordFeedback');
                const btnSubmit = passwordChangeForm.querySelector('button[type="submit"]');
                
                const oldPassword = document.getElementById('old_password').value;
                const newPassword = document.getElementById('new_password').value;
                const confirmNewPassword = document.getElementById('confirm_new_password').value;

                if (!oldPassword || !newPassword || !confirmNewPassword) {
                    showFeedback(fb, '請填寫所有密碼欄位', 'error');
                    return;
                }
                if (newPassword.length < 6) {
                    showFeedback(fb, '新密碼長度至少需要 6 位字元', 'error');
                    return;
                }
                if (newPassword !== confirmNewPassword) {
                    showFeedback(fb, '兩次輸入的新密碼不一致', 'error');
                    return;
                }

                btnSubmit.disabled = true;
                showFeedback(fb, '正在安全驗證並變更密碼…', 'success');

                try {
                    const client = WanwuAuth.getClient();
                    if (!client) throw new Error('無法連線至認證服務');

                    const { error: signInError } = await client.auth.signInWithPassword({
                        email: user.email, password: oldPassword
                    });
                    if (signInError) throw new Error('原有密碼不正確，請重新輸入');

                    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
                    if (updateError) throw updateError;

                    showFeedback(fb, '密碼已成功更新！', 'success');
                    passwordChangeForm.reset();
                    
                    setTimeout(() => {
                        passwordEditSection.classList.add('hidden');
                        if (btnTogglePasswordEdit) btnTogglePasswordEdit.textContent = '編輯密碼';
                        fb.className = 'form-feedback';
                        fb.textContent = '';
                    }, 2500);

                } catch (err) {
                    showFeedback(fb, err.message || '變更失敗，請稍後再試', 'error');
                } finally {
                    btnSubmit.disabled = false;
                }
            });
        }

        // --- 綁定：登出 ---
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function () {
                await WanwuAuth.signOut();
                window.location.href = 'index.html';
            });
        }

        // 載入訂單
        loadOrders(user);
    }

    // ✨ 完美分類與支援管理員檢視的載入訂單函數
    async function loadOrders(user) {
        const list = document.getElementById('ordersList');
        if (!list || !window.WanwuAuth) return;

        const client = WanwuAuth.getClient();
        if (!client) return;

        let query = client.from('wanwu_orders').select('*').order('created_at', { ascending: false });

        // 如果不是管理員，只撈取自己的訂單
        if (user.email !== 'admin@market.local') {
            query = query.eq('user_id', user.id);
        }

        const { data: allOrders, error } = await query;
        const legacy = await WanwuAuth.getMyReservations(); // 保留舊版相容

        if ((!allOrders || allOrders.length === 0) && !legacy.length) {
            list.innerHTML = '<p class="account-empty">暫無訂單記錄。請前往 <a href="submit.html" style="color: #991b1b; text-decoration: underline;">下單預訂</a>。</p>';
            return;
        }

        let html = '';
        const statusClassMap = {
            'pending': 'status-pending',
            'processing': 'status-processing',
            'ready': 'status-ready',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled'
        };

        if (allOrders && allOrders.length > 0) {
            // 分類：已註冊會員訂單 (user_id 有值) vs 未註冊訪客訂單 (user_id 為空)
            const memberOrders = allOrders.filter(o => o.user_id !== null);
            const guestOrders = allOrders.filter(o => o.user_id === null);

            // 1. 渲染已註冊會員訂單
            if (memberOrders.length > 0) {
                html += `<h3 style="font-size: 1.05rem; margin: 16px 0 12px; color: var(--text); font-family: 'Noto Serif TC', serif;">👤 已註冊會員訂單</h3>`;
                html += memberOrders.map(function (o) {
                    const total = o.total_amount != null ? formatPrice(o.total_amount) : (o.unit_price ? formatPrice(Number(o.unit_price) * Number(o.quantity || 1)) : '—');
                    const statusClass = statusClassMap[o.status] || 'status-pending';
                    const summary = o.order_summary || o.product_name || '多項產品';

                    return `
                        <article class="reservation-card ${statusClass}">
                            <div class="reservation-card-head">
                                <strong>${escapeHtml(summary)}</strong>
                                <span class="reservation-status ${statusClass}">${escapeHtml(statusLabel(o.status))}</span>
                            </div>
                            <dl class="reservation-meta">
                                <div><dt>取貨日</dt><dd>${escapeHtml(formatDate(o.pickup_date))}</dd></div>
                                <div><dt>總金額</dt><dd>${escapeHtml(total)}</dd></div>
                                <div><dt>提交時間</dt><dd>${escapeHtml(formatDateTime(o.created_at))}</dd></div>
                            </dl>
                            ${o.notes ? `<p class="reservation-notes">${escapeHtml(o.notes)}</p>` : ''}
                            <div style="margin-top: 16px; text-align: right; padding-top: 12px; border-top: 1px solid var(--border);">
                                <a href="order-detail.html?id=${o.id}" class="btn btn-secondary" style="padding: 6px 16px; font-size: 0.82rem;">🔍 查看詳情</a>
                            </div>
                        </article>`;
                }).join('');
            }

            // 2. 渲染未註冊訪客預訂 (管理員或該訪客可見)
            if (guestOrders.length > 0) {
                html += `<h3 style="font-size: 1.05rem; margin: 28px 0 12px; color: var(--text); font-family: 'Noto Serif TC', serif;">🌐 未註冊訪客預訂 (透過追蹤碼)</h3>`;
                html += guestOrders.map(function (o) {
                    const total = o.total_amount != null ? formatPrice(o.total_amount) : '—';
                    const statusClass = statusClassMap[o.status] || 'status-pending';
                    const summary = o.order_summary || o.product_name || '多項產品';

                    return `
                        <article class="reservation-card ${statusClass}" style="border-style: dashed; background: rgba(0,0,0,0.01);">
                            <div class="reservation-card-head">
                                <strong>${escapeHtml(summary)} (#${escapeHtml(o.tracking_code || 'N/A')})</strong>
                                <span class="reservation-status ${statusClass}">${escapeHtml(statusLabel(o.status))}</span>
                            </div>
                            <dl class="reservation-meta">
                                <div><dt>客戶名稱</dt><dd>${escapeHtml(o.customer_name || '訪客')}</dd></div>
                                <div><dt>追蹤碼</dt><dd><code style="background:var(--bg-elevated); padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(o.tracking_code)}</code></dd></div>
                                <div><dt>總金額</dt><dd>${escapeHtml(total)}</dd></div>
                            </dl>
                            <div style="margin-top: 16px; text-align: right; padding-top: 12px; border-top: 1px solid var(--border);">
                                <a href="order-detail.html?code=${escapeHtml(o.tracking_code)}" class="btn btn-secondary" style="padding: 6px 16px; font-size: 0.82rem;">🔍 查看詳情</a>
                            </div>
                        </article>`;
                }).join('');
            }
        }

        if (legacy && legacy.length) {
            html += '<p class="account-legacy-label">舊版預訂記錄（訪客轉換）</p>';
            html += legacy.map(function (r) {
                const statusClass = statusClassMap[r.status] || 'status-pending';
                return `
                    <article class="reservation-card reservation-card--legacy ${statusClass}">
                        <div class="reservation-card-head">
                            <strong>${escapeHtml(r.product_interest || '未指定產品')}</strong>
                            <span class="reservation-status ${statusClass}">${escapeHtml(statusLabel(r.status))}</span>
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

    // 啟動渲染
    document.addEventListener('DOMContentLoaded', function () {
        renderAccount();
    });
})();
