// =====================================================================
// 卍物所 - submit.js 專屬購物車與預訂邏輯 (升級：標題統一提示 + 提交前確認視窗)
// =====================================================================

document.addEventListener('DOMContentLoaded', function() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const form = document.getElementById('cartReserveForm');
    const cartContainer = document.getElementById('dynamicCartContainer');
    const totalDisplay = document.getElementById('cartTotalDisplay');
    const feedback = document.getElementById('reserveFeedback');

    // --- 0. 動態注入縮圖動畫、放大鏡按鈕與標題提示的專屬 CSS ---
    const customStyle = document.createElement('style');
    customStyle.innerHTML = `
        @keyframes thumbFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        .zoomable-thumb-wrapper {
            position: relative;
            width: 48px;
            height: 48px;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
            cursor: pointer;
            flex-shrink: 0;
            background: var(--bg-elevated);
            animation: thumbFadeIn 0.4s ease forwards;
            transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .zoomable-thumb-wrapper img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease, filter 0.3s ease;
            display: block;
        }
        .zoom-overlay-btn {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        .zoom-overlay-btn span {
            font-size: 0.85rem;
            transform: scale(0.7);
            transition: transform 0.25s ease;
        }
        .zoomable-thumb-wrapper:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .zoomable-thumb-wrapper:hover img {
            transform: scale(1.1);
            filter: brightness(0.9);
        }
        .zoomable-thumb-wrapper:hover .zoom-overlay-btn {
            opacity: 1;
        }
        .zoomable-thumb-wrapper:hover .zoom-overlay-btn span {
            transform: scale(1);
        }
        /* 統一放置在「選擇產品」標題旁的官方指引樣式 */
        .products-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 8px;
        }
        .products-section-header h3 {
            margin: 0;
            font-size: 1.1rem;
        }
        .global-zoom-hint {
            font-size: 0.82rem;
            color: var(--text-secondary);
            background: var(--bg-elevated);
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid var(--border);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
    `;
    document.head.appendChild(customStyle);

    // --- 1. 基礎互動 (手機版漢堡選單) ---
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
    }

    // --- 2. 醒目的系統信息方框 ---
    function displayMsg(msg, type) {
        if (!feedback) return;
        const bgColor = type === 'success' ? '#ecfdf5' : '#fef2f2';
        const textColor = type === 'success' ? '#065f46' : '#991b1b';
        const borderColor = type === 'success' ? '#a7f3d0' : '#fecaca';
        const icon = type === 'success' ? '✅' : '⚠️';
        
        feedback.innerHTML = `
            <div style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; padding: 16px; border-radius: 8px; margin-top: 16px; text-align: left; display: flex; align-items: flex-start; gap: 12px; font-weight: 500; line-height: 1.5; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <span style="font-size: 1.25rem; line-height: 1;">${icon}</span>
                <span>${msg}</span>
            </div>
        `;
        feedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function saveLocal(key, data) {
        try {
            let existing = JSON.parse(localStorage.getItem(key)) || [];
            if (!Array.isArray(existing)) existing = [];
            existing.push(data);
            localStorage.setItem(key, JSON.stringify(existing));
        } catch (e) {
            console.error('LocalStorage 儲存失敗', e);
        }
    }

    // --- 3. 綁定 HTML 中已經存在的日期選擇器 ---
    const datePicker = document.getElementById('marketDatePicker');
    let selectedDate = ''; 
    if (datePicker) {
        datePicker.addEventListener('click', function(e) {
            const chip = e.target.closest('.date-chip');
            if (chip) {
                datePicker.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                selectedDate = chip.getAttribute('data-value');
            }
        });
    }

    // --- 4. 自動為「3. 選擇產品」標題旁邊注入統一指引，並載入產品 UI ---
       // --- 4. 載入產品與生成購物車 UI (指引已在 HTML 寫好，這裡只需專注載入產品) ---
    async function loadProducts() {
        if (!client) {
            if (cartContainer) cartContainer.innerHTML = '<p style="color:red;">無法連接資料庫，請稍後再試。</p>';
            return;
        }
        
        try {
            const { data, error } = await client.from('wanwu_products').select('*').eq('is_available', true).order('sort_order');
            if (error || !data) throw error;
            
            if (cartContainer) {
                cartContainer.innerHTML = '';
                data.forEach(product => {
                    const price = parseFloat(product.price) || 0;
                    const imgSrc = product.image_url || product.image || 'Logo.jpg';
                    const productName = product.name;

                    const itemHtml = `
                        <div class="cart-item" data-id="${product.id}" data-name="${productName}" data-price="${price}">
                            <div class="cart-item-info" style="display: flex; align-items: center; gap: 14px; flex: 1;">
                                <!-- 🖼️ 帶動畫與放大鏡按鈕的縮圖容器 -->
                                <div class="zoomable-thumb-wrapper" data-full="${imgSrc}" data-title="${productName}" title="點擊放大圖片">
                                    <img src="${imgSrc}" alt="${productName}">
                                    <div class="zoom-overlay-btn">
                                        <span>🔍</span>
                                    </div>
                                </div>
                                
                                <div>
                                    <h4 style="margin: 0 0 2px 0;">${productName}</h4>
                                    <div class="cart-item-price">HK$${price}</div>
                                </div>
                            </div>
                            <div class="cart-controls">
                                <button type="button" class="btn-qty btn-minus">-</button>
                                <span class="qty-display">0</span>
                                <button type="button" class="btn-qty btn-plus">+</button>
                            </div>
                        </div>
                    `;
                    cartContainer.insertAdjacentHTML('beforeend', itemHtml);
                });

                initImageZoomModal();
            }
        } catch (e) {
            if (cartContainer) cartContainer.innerHTML = '<p style="color:red;">載入產品失敗。</p>';
        }
    }
    loadProducts();


    // 處理圖片點擊放大彈窗的函數
    function initImageZoomModal() {
        let zoomModal = document.getElementById('productZoomModal');
        if (!zoomModal) {
            const modalHtml = `
                <div id="productZoomModal" role="dialog" aria-modal="true" style="display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.75); z-index: 99999; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; background: var(--bg-card, #fff); padding: 24px; border-radius: 20px; max-width: 90%; max-height: 90%; box-shadow: 0 25px 50px rgba(0,0,0,0.35); text-align: center; animation: thumbFadeIn 0.3s ease;">
                        <button type="button" id="closeZoomModal" style="position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 1.8rem; cursor: pointer; color: var(--text);">&times;</button>
                        <img id="zoomedImage" src="" alt="產品大圖" style="max-width: 100%; max-height: 70vh; height: auto; border-radius: 12px; display: block; margin: 0 auto; object-fit: contain;">
                        <p id="zoomedImageTitle" style="margin-top: 16px; font-weight: 600; font-size: 1.1rem; color: var(--text);"></p>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            zoomModal = document.getElementById('productZoomModal');
        }

        const zoomedImage = document.getElementById('zoomedImage');
        const zoomedTitle = document.getElementById('zoomedImageTitle');
        const closeBtn = document.getElementById('closeZoomModal');

        document.querySelectorAll('.zoomable-thumb-wrapper').forEach(wrapper => {
            wrapper.addEventListener('click', () => {
                const fullSrc = wrapper.getAttribute('data-full');
                const title = wrapper.getAttribute('data-title');
                
                zoomedImage.src = fullSrc;
                zoomedTitle.textContent = title;
                zoomModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            });
        });

        const closeZoom = () => {
            zoomModal.style.display = 'none';
            document.body.style.overflow = '';
        };

        if (closeBtn) closeBtn.onclick = closeZoom;
        zoomModal.onclick = (e) => {
            if (e.target === zoomModal) closeZoom();
        };
    }

    // 綁定購物車加減按鈕
    if (cartContainer) {
        cartContainer.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-plus') || e.target.classList.contains('btn-minus')) {
                e.preventDefault();
                const itemDiv = e.target.closest('.cart-item');
                const qtySpan = itemDiv.querySelector('.qty-display'); 
                let qty = parseInt(qtySpan.innerText, 10) || 0;

                if (e.target.classList.contains('btn-plus') && qty < 20) qty++;
                if (e.target.classList.contains('btn-minus') && qty > 0) qty--;

                qtySpan.innerText = qty;
                
                let total = 0;
                cartContainer.querySelectorAll('.cart-item').forEach(item => {
                    total += parseFloat(item.dataset.price) * parseInt(item.querySelector('.qty-display').innerText, 10);
                });
                if (totalDisplay) totalDisplay.innerText = 'HK$' + total;
            }
        });
    }

    // --- 5. 判斷登入狀態並隱藏訪客欄位 ---
    let isLoggedIn = false;
    async function checkLogin() {
        try {
            if (window.WanwuAuth) {
                const session = await WanwuAuth.getSession();
                isLoggedIn = !!(session && session.user);
            }
            if (isLoggedIn) {
                const guestFields = document.getElementById('guestContactFields');
                const loggedInBanner = document.getElementById('reserveLoggedInBanner');
                if (guestFields) guestFields.style.display = 'none';
                if (loggedInBanner) loggedInBanner.classList.remove('hidden');
            }
        } catch (e) {
            console.log("登入狀態檢查失敗", e);
        }
    }
    checkLogin();

    // --- 6. 處理表單提交 (加入最後確認視窗 Modal) ---
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (feedback) feedback.innerHTML = ''; 

            try {
                if (!selectedDate) {
                    throw new Error('請選擇取貨日期。');
                }

                let customerName = '';
                let phone = '';
                let email = null;
                if (!isLoggedIn) {
                    customerName = document.getElementById('customer_name') ? document.getElementById('customer_name').value.trim() : '';
                    phone = document.getElementById('phone') ? document.getElementById('phone').value.trim() : '';
                    email = document.getElementById('email') ? document.getElementById('email').value.trim() : null;
                    if (!customerName || !phone) {
                        throw new Error('請填寫姓名及電話。');
                    }
                }

                const notes = document.getElementById('notes') ? document.getElementById('notes').value.trim() : '';

                const cartItemsDOM = cartContainer.querySelectorAll('.cart-item');
                let itemsToInsert = [];
                let totalQty = 0;
                let summaryArr = [];
                let totalAmount = 0;
                
                cartItemsDOM.forEach(item => {
                    const qtySpan = item.querySelector('.qty-display'); 
                    if (qtySpan) {
                        const qty = parseInt(qtySpan.innerText, 10) || 0;
                        if (qty > 0) {
                            const id = parseInt(item.dataset.id);
                            const name = item.dataset.name;
                            const price = parseFloat(item.dataset.price);
                            
                            itemsToInsert.push({ product_id: id, product_name: name, quantity: qty, unit_price: price });
                            totalQty += qty;
                            totalAmount += (price * qty);
                            summaryArr.push(`${name} (x${qty})`);
                        }
                    }
                });

                if (itemsToInsert.length === 0) {
                    throw new Error('您的購物車是空的，請至少選擇一項產品。');
                }

                const productSummaryString = summaryArr.join('，');

                // 彈出「最後確定視窗」讓用戶核對金額、貨品、取貨日期與聯絡資料
                showCheckoutConfirmModal({
                    customerName: isLoggedIn ? '已登入會員' : customerName,
                    phone: isLoggedIn ? '會員綁定電話' : phone,
                    email: email || '未提供',
                    pickupDate: selectedDate,
                    summaryList: summaryArr,
                    totalAmount: totalAmount,
                    notes: notes || '無'
                }, async () => {
                    await executeOrderSubmission({
                        isLoggedIn, customerName, phone, email, selectedDate, notes, itemsToInsert, totalAmount, productSummaryString
                    });
                });

            } catch (err) {
                console.error("錯誤:", err);
                displayMsg(err.message || '提交失敗，請檢查資料後再試。', 'error');
            }
        });
    }

    // --- 顯示最後確定視窗 (Checkout Confirm Modal) 的函數 ---
    function showCheckoutConfirmModal(data, onConfirm) {
        let modal = document.getElementById('checkoutConfirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="checkoutConfirmModal" role="dialog" aria-modal="true" style="display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); z-index: 99999; padding: 20px; box-sizing: border-box;">
                    <div style="background: var(--bg-card, #fff); width: 100%; max-width: 480px; border-radius: 20px; padding: 28px 24px; box-shadow: 0 25px 50px rgba(0,0,0,0.25); text-align: left; box-sizing: border-box; animation: thumbFadeIn 0.3s ease;">
                        <div style="text-align: center; margin-bottom: 16px;">
                            <span style="font-size: 2.5rem; line-height: 1;">📋</span>
                            <h3 style="font-family: 'Noto Serif TC', serif; font-size: 1.35rem; margin: 8px 0 4px; color: var(--text);">請最後核對您的預訂資料</h3>
                            <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">確認無誤後請點擊下方按鈕完成提交</p>
                        </div>

                        <div id="confirmModalBody" style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 0.92rem; line-height: 1.6; color: var(--text);">
                            <!-- 動態填入內容 -->
                        </div>

                        <div style="display: flex; gap: 12px;">
                            <button type="button" id="btnCancelCheckout" style="flex: 1; padding: 12px; border-radius: 10px; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; color: #374151; font-weight: 600;">返回修改</button>
                            <button type="button" id="btnConfirmCheckout" style="flex: 1; padding: 12px; border-radius: 10px; border: none; cursor: pointer; background: var(--accent, #991b1b); color: #fff; font-weight: 600;">確認提交預訂</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('checkoutConfirmModal');
        }

        const bodyEl = document.getElementById('confirmModalBody');
        bodyEl.innerHTML = `
            <div style="margin-bottom: 10px;"><strong>👤 姓名 / 身份：</strong> ${escapeHtml(data.customerName)}</div>
            <div style="margin-bottom: 10px;"><strong>📞 電話號碼：</strong> ${escapeHtml(data.phone)}</div>
            <div style="margin-bottom: 10px;"><strong>📅 取貨日期：</strong> <span style="color: var(--accent); font-weight: 600;">${escapeHtml(data.pickupDate)}</span></div>
            <div style="margin-bottom: 10px;"><strong>🛍️ 購買貨品：</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${data.summaryList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
            <div style="margin-bottom: 10px;"><strong>💬 備註：</strong> ${escapeHtml(data.notes)}</div>
            <div style="border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600;">總計金額 (到付)：</span>
                <span style="font-size: 1.2rem; font-weight: 700; color: var(--accent);">HK$${data.totalAmount}</span>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        const btnConfirm = document.getElementById('btnConfirmCheckout');
        const btnCancel = document.getElementById('btnCancelCheckout');

        const newBtnConfirm = btnConfirm.cloneNode(true);
        const newBtnCancel = btnCancel.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

        document.getElementById('btnCancelCheckout').onclick = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        document.getElementById('btnConfirmCheckout').onclick = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            if (onConfirm) onConfirm();
        };
    }

    // --- 實際執行資料庫寫入的提交函數 ---
    async function executeOrderSubmission(orderData) {
        const btn = document.getElementById('btnSubmitCart') || form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        displayMsg('訂單處理中，請稍候...', 'success');

        try {
            if (!navigator.onLine || !client) {
                const payload = { pickup_date: orderData.selectedDate, quantity: orderData.itemsToInsert.reduce((a, b) => a + b.quantity, 0), notes: orderData.notes };
                if (!orderData.isLoggedIn) {
                    const randomDigits = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                    payload.tracking_code = 'AA' + randomDigits;
                    payload.customer_name = orderData.customerName;
                    payload.phone = orderData.phone;
                    payload.email = orderData.email;
                    payload.product_interest = orderData.productSummaryString;
                    displayMsg(`已暫存您的預訂（離線模式）。您的追蹤碼是 <strong>${payload.tracking_code}</strong>，請稍後連線時重試。`, 'success');
                } else {
                    payload.order_summary = orderData.productSummaryString;
                    payload.total_amount = orderData.totalAmount;
                    displayMsg('已暫存您的預訂（離線模式）。請稍後連線時重試，成功後可於「我的帳戶」查詢。', 'success');
                }
                
                saveLocal('wanwu_reservations', payload);
                form.reset();
                return;
            }

            if (!orderData.isLoggedIn) {
                const randomDigits = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const trackingCode = 'AA' + randomDigits;

                const orderPayload = {
                    user_id: null,
                    customer_name: orderData.customerName,
                    customer_phone: orderData.phone,
                    customer_email: orderData.email,
                    pickup_date: orderData.selectedDate,
                    order_summary: orderData.productSummaryString,
                    total_amount: orderData.totalAmount,
                    tracking_code: trackingCode,
                    notes: orderData.notes,
                    status: 'pending'
                };

                const { data: orderDataRes, error: orderError } = await client.from('wanwu_orders').insert([orderPayload]).select();
                if (orderError) throw orderError;

                const newOrderId = orderDataRes[0].id;
                const finalItems = orderData.itemsToInsert.map(item => ({
                    order_id: newOrderId,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }));
                const { error: itemsError } = await client.from('wanwu_order_items').insert(finalItems);
                if (itemsError) throw itemsError;

                displayMsg(`🎉 預訂成功！期待在市集見到您。<br><br>您的專屬追蹤碼是：<strong style="font-size:1.2em; color:#d97706; letter-spacing: 2px;">${trackingCode}</strong><br><br>👉 <a href="order-detail.html?code=${trackingCode}" style="color:#991b1b; text-decoration:underline; font-weight:600; font-size:1.05em;">點擊這裡直接查看您的訂單追蹤進度</a><br><span style="font-size:0.85em; color:#666; display:inline-block; margin-top:6px;">(建議將該頁面加入瀏覽器書籤以便日後查看，請截圖保存您的追蹤碼)</span>`, 'success');

            } else {
                const orderPayload = {
                    order_summary: orderData.productSummaryString, 
                    total_amount: orderData.totalAmount,
                    pickup_date: orderData.selectedDate, 
                    notes: orderData.notes
                };
                const { data: orderDataRes, error: orderError } = await client.from('wanwu_orders').insert([orderPayload]).select();
                if (orderError) throw orderError;
                
                const newOrderId = orderDataRes[0].id;
                const finalItems = orderData.itemsToInsert.map(item => ({
                    order_id: newOrderId, 
                    product_id: item.product_id, 
                    product_name: item.product_name,
                    quantity: item.quantity, 
                    unit_price: item.unit_price
                }));
                const { error: itemsError } = await client.from('wanwu_order_items').insert(finalItems);
                if (itemsError) throw itemsError;

                displayMsg(`🎉 預訂成功！期待在市集見到您。<br><br>📝 您可以隨時前往 <a href="account.html" style="color:#991b1b; text-decoration:underline; font-weight:600;">我的帳戶</a> 查看詳細的訂單記錄及追蹤最新狀態。`, 'success');
            }
            
            form.reset();
            cartContainer.querySelectorAll('.qty-display').forEach(el => el.innerText = '0');
            if (totalDisplay) totalDisplay.innerText = 'HK$0';
            document.querySelectorAll('#marketDatePicker .date-chip').forEach(c => c.classList.remove('active'));
            selectedDate = '';

        } catch (err) {
            console.error("錯誤:", err);
            displayMsg(err.message || '提交失敗，請稍後再試。', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

});
