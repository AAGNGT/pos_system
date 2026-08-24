(function () {
    'use strict';

    function formatPrice(n) {
        return 'HK$' + Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d + 'T00:00:00').toLocaleDateString('zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    }

    function showCustomAlert(message, callback) {
        const overlay = document.getElementById('customAlertModal');
        const msgEl = document.getElementById('customAlertMessage');
        const btn = document.getElementById('customAlertBtn');

        if (msgEl) msgEl.textContent = message;
        if (overlay) {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        if (btn) {
            btn.onclick = function() {
                if (overlay) overlay.classList.remove('open');
                document.body.style.overflow = '';
                if (callback) callback();
            };
        }
    }

    async function loadOrderDetail() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('id');
        const trackCode = urlParams.get('code') || urlParams.get('track_code'); 

        let client = null;
        if (typeof getSupabaseClient === 'function') {
            client = getSupabaseClient();
        } else if (window.supabaseClient) {
            client = window.supabaseClient;
        } else if (typeof supabase !== 'undefined' && typeof SUPABASE_CONFIG !== 'undefined') {
            client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        }

        if (!client) {
            showCustomAlert('無法連接資料庫，請檢查網絡或設定。', () => { window.location.href = 'index.html'; });
            return;
        }

        const lockScreen = document.getElementById('orderLockScreen');
        const realContent = document.getElementById('orderRealContent');

        // 先檢查當前登入者是否為管理員
        let currentSession = null;
        let isAdmin = false;
        if (window.WanwuAuth) {
            currentSession = await WanwuAuth.getSession();
            if (currentSession && currentSession.user && currentSession.user.email === 'admin@market.local') {
                isAdmin = true;
            }
        }

        // ==========================================
        // 情況 A：透過追蹤碼查詢 (訪客或管理員點擊訪客單)
        // ==========================================
        if (trackCode) {
            const cleanCode = trackCode.trim().toUpperCase();
            const verifiedKey = `wanwu_verified_${cleanCode}`;
            const isVerified = localStorage.getItem(verifiedKey) === 'true';

            // 如果是管理員，或者本地已經驗證過電話，直接解鎖並渲染
            if (isAdmin || isVerified) {
                if (lockScreen) lockScreen.style.display = 'none';
                if (realContent) realContent.style.display = 'block';
                await fetchAndRenderGuestOrder(client, cleanCode);
                return;
            }

            // 未驗證的訪客：顯示鎖定屏
            if (lockScreen) lockScreen.style.display = 'flex';
            if (realContent) realContent.style.display = 'none';

            const inputPhone = document.getElementById('initialPhoneInput');
            const errorMsg = document.getElementById('initialErrorMsg');
            const btnVerify = document.getElementById('btnInitialVerify');

            if (btnVerify) {
                btnVerify.onclick = async function() {
                    const enteredPhone = (inputPhone.value || '').trim();
                    if (!enteredPhone) {
                        errorMsg.textContent = '請輸入電話號碼。';
                        errorMsg.style.display = 'block';
                        return;
                    }

                    btnVerify.disabled = true;
                    btnVerify.textContent = '驗證中...';
                    errorMsg.style.display = 'none';

                    try {
                        const { data, error } = await client
                            .rpc('get_guest_order_by_tracking', { p_code: cleanCode });

                        const orderData = (data && data.length > 0) ? data[0] : null;

                        if (error || !orderData) {
                            throw new Error('找不到此追蹤碼的預訂記錄。');
                        }

                        const realPhone = (orderData.customer_phone || orderData.phone || '').trim();

                        if (enteredPhone === realPhone) {
                            localStorage.setItem(verifiedKey, 'true');
                            if (lockScreen) lockScreen.style.display = 'none';
                            if (realContent) realContent.style.display = 'block';
                            await renderOrderData(client, orderData, true, false);
                        } else {
                            throw new Error('電話號碼不正確，請重試。');
                        }
                    } catch (err) {
                        errorMsg.textContent = err.message;
                        errorMsg.style.display = 'block';
                        inputPhone.value = '';
                    } finally {
                        btnVerify.disabled = false;
                        btnVerify.textContent = '確認並加載訂單';
                    }
                };
            }

        } 
        // ==========================================
        // 情況 B：透過訂單 ID 查詢 (已註冊會員或管理員看會員單)
        // ==========================================
        else if (orderId) {
            if (lockScreen) lockScreen.style.display = 'none';
            if (realContent) realContent.style.display = 'block';

            const session = await WanwuAuth.requireAuth('index.html?auth=login');
            if (!session) return;

            const authClient = WanwuAuth.getClient() || client;
            let query = authClient.from('wanwu_orders').select('*').eq('id', orderId);

            if (!isAdmin) {
                query = query.eq('user_id', session.user.id);
            }

            const { data: orderData, error } = await query.single();
            if (error || !orderData) {
                showCustomAlert('無法讀取該訂單或您沒有權限', () => { window.location.href = 'account.html'; });
                return;
            }

            await renderOrderData(authClient, orderData, false, isAdmin);
        } else {
            showCustomAlert('找不到訂單編號或追蹤碼', () => { window.location.href = 'index.html'; });
        }
    }

    async function fetchAndRenderGuestOrder(client, cleanCode) {
        const { data } = await client.rpc('get_guest_order_by_tracking', { p_code: cleanCode });
        if (data && data.length > 0) {
            let sessionCheck = null;
            let isAdmin = false;
            if (window.WanwuAuth) {
                sessionCheck = await WanwuAuth.getSession();
                if (sessionCheck && sessionCheck.user && sessionCheck.user.email === 'admin@market.local') {
                    isAdmin = true;
                }
            }
            await renderOrderData(client, data[0], true, isAdmin);
        } else {
            window.location.href = 'index.html';
        }
    }

    // --- ✨ 核心渲染函數（已加入管理員檢視標籤組件） ---
    async function renderOrderData(client, order, isGuest, isAdmin) {
        if (isGuest) {
            const mainContent = document.querySelector('.order-detail-page #orderRealContent .section-inner');
            if (mainContent && !document.getElementById('guestNoticeBanner')) {
                const banner = document.createElement('div');
                banner.id = 'guestNoticeBanner';
                banner.style.cssText = `
                    background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; 
                    padding: 16px 20px; border-radius: 12px; margin-bottom: 24px; 
                    font-size: 0.95rem; line-height: 1.6; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                `;
                banner.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                        <span style="font-size: 1.5rem; line-height: 1;">📌</span>
                        <div style="flex: 1;">
                            <strong>這是您的訪客訂單追蹤頁面！</strong><br>
                            請將此頁面加入<strong>瀏覽器書籤</strong>，或複製您的追蹤碼（<strong>#${escapeHtml(order.tracking_code)}</strong>），以便日後隨時回來查看最新備貨進度。
                        </div>
                    </div>
                `;
                mainContent.insertBefore(banner, mainContent.firstChild);
            }
        }

        const displayOrderIdEl = document.getElementById('displayOrderId');
        if (displayOrderIdEl) displayOrderIdEl.textContent = isGuest ? `#${order.tracking_code} (訪客預訂)` : `#${order.id}`;
        
        const displayOrderDateEl = document.getElementById('displayOrderDate');
        if (displayOrderDateEl) {
            const rawDate = order.created_at ? order.created_at.split('T')[0] : '';
            displayOrderDateEl.textContent = `訂單日期：${formatDate(rawDate)}`;
        }

        const displayNameEl = document.getElementById('displayName');
        if (displayNameEl) displayNameEl.textContent = escapeHtml(order.customer_name);

        const displayPhoneEl = document.getElementById('displayPhone');
        if (displayPhoneEl) displayPhoneEl.textContent = escapeHtml(order.customer_phone || order.phone);

        const displayPickupDateEl = document.getElementById('displayPickupDate');
        if (displayPickupDateEl) displayPickupDateEl.textContent = formatDate(order.pickup_date);
        
        const isAlipay = order.notes && order.notes.includes('支付寶');
        const displayPaymentMethodEl = document.getElementById('displayPaymentMethod');
        if (displayPaymentMethodEl) displayPaymentMethodEl.textContent = isAlipay ? '線上交易（支付寶）' : '到付（即場現金）';

        // 渲染狀態標籤與管理員檢視標籤
        const statusMap = { pending: '待確認', processing: '處理中', ready: '已完成備貨', completed: '已完成', cancelled: '已取消' };
        const statusClassMap = { pending: 'status-pending', processing: 'status-processing', ready: 'status-ready', completed: 'status-completed', cancelled: 'status-cancelled' };
        const sClass = statusClassMap[order.status] || 'status-pending';
        const sLabel = statusMap[order.status] || '待確認';
        
        const titleEl = document.querySelector('.order-detail-title');
        if (titleEl && !document.getElementById('displayOrderStatus')) {
            titleEl.innerHTML += `<span id="displayOrderStatus" style="margin-left: 14px; transform: translateY(-2px); display: inline-flex;"><span class="reservation-status ${sClass}">${sLabel}</span></span>`;
            
            // 🛡️ 如果是管理員檢視，自動加上管理員標籤組件
            if (isAdmin) {
                titleEl.innerHTML += `<span style="margin-left: 8px; transform: translateY(-2px); display: inline-flex;"><span class="reservation-status" style="background: #111; color: #fff; border: 1px solid #333;">🛡️ 管理員檢視</span></span>`;
            }
        }

        // 渲染商品列表
        const productListEl = document.getElementById('orderProductList');
        const displaySubtotal = document.getElementById('displaySubtotal');
        const displayTotal = document.getElementById('displayTotal');
        
        let totalAmount = 0;
        if (productListEl && order) {
            let orderItems = [];
            if (order.id) {
                const { data: itemsData } = await client.from('wanwu_order_items').select('*').eq('order_id', order.id);
                if (itemsData && itemsData.length > 0) orderItems = itemsData;
            }

            let productsHtml = '';
            if (orderItems.length > 0) {
                orderItems.forEach(item => {
                    const price = parseFloat(item.unit_price) || 0; 
                    const itemTotal = price * item.quantity;
                    totalAmount += itemTotal;
                    productsHtml += `
                        <div class="product-card" style="display: flex; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--border);">
                            <div>
                                <h4 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--text);">${escapeHtml(item.product_name)}</h4>
                                <span style="font-size: 0.85rem; color: var(--text-secondary); background: var(--bg-elevated); padding: 4px 8px; border-radius: 6px;">數量：${item.quantity}</span>
                            </div>
                            <div style="font-weight: 600; color: var(--text); font-size: 1.1rem;">HK$${itemTotal}</div>
                        </div>
                    `;
                });
            } else {
                const rawProductStr = order.order_summary || order.product_name || order.product_interest || '未知產品';
                const rawQty = order.quantity || 1;
                rawProductStr.split('，').forEach(prodName => {
                    productsHtml += `
                        <div class="product-card" style="display: flex; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--border);">
                            <div style="flex: 1;"><h4 style="margin: 0; font-size: 1rem; color: var(--text);">${escapeHtml(prodName.trim())}</h4></div>
                            <div style="font-weight: 600; color: var(--text);">-</div>
                        </div>
                    `;
                });
                totalAmount = order.total_amount || (168 * rawQty); 
            }

            productListEl.innerHTML = productsHtml;
            if (displaySubtotal) displaySubtotal.textContent = formatPrice(totalAmount);
            if (displayTotal) displayTotal.textContent = formatPrice(totalAmount);
        }

        // 進度條處理
        const progressContainer = document.querySelector('.order-progress-container');
        if (progressContainer) progressContainer.setAttribute('data-status', order.status || 'pending');

        if (order.status === 'cancelled') {
            document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('completed', 'active', 'pending'));
            const hintContainer = document.querySelector('.progress-hint');
            if (hintContainer) {
                hintContainer.innerHTML = `<div style="padding: 16px; border-radius: 12px; background: rgba(161, 161, 170, 0.08); border: 1px dashed #a1a1aa; color: #71717a; font-weight: 500; font-size: 0.85rem; text-align: center;">此訂單已取消。若有任何疑問，請隨時聯絡我們客服。</div>`;
            }
        } else {
            let currentStep = 1;
            if (order.status === 'processing') currentStep = 2;
            if (order.status === 'ready') currentStep = 3;
            if (order.status === 'completed') currentStep = 4;

            document.querySelectorAll('.progress-step').forEach(step => {
                const stepNum = parseInt(step.getAttribute('data-step'));
                step.classList.remove('completed', 'active', 'pending');
                if (stepNum < currentStep) step.classList.add('completed');
                else if (stepNum === currentStep) step.classList.add('active');
                else step.classList.add('pending');
            });
        }

        const btnPrint = document.getElementById('btnPrintReceipt');
        if (btnPrint) {
            btnPrint.onclick = () => window.print();
        }
    }

    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    document.addEventListener('DOMContentLoaded', loadOrderDetail);
})();