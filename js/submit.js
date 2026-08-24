// =====================================================================
// 卍物所 - submit.js 專屬購物車與預訂邏輯 (升級：標題提示 + 確認視窗 + 雙軌優惠系統)
// =====================================================================

document.addEventListener('DOMContentLoaded', function() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const form = document.getElementById('cartReserveForm');
    const cartContainer = document.getElementById('dynamicCartContainer');
    const totalDisplay = document.getElementById('cartTotalDisplay');
    const feedback = document.getElementById('reserveFeedback');

    // 優惠全域變數宣告
    let appliedPetDiscount = 0;     // 甜點·萌寵優惠已套用金額
    let appliedNinjuanDiscount = 0; // 寧磚優惠已套用金額
    let appliedDiscountDesc = '';   // 記錄優惠描述 (用來寫入備註)

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

    // --- 4. 載入產品與生成購物車 UI ---
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
                    
                    // 簡單輕量的系列判斷
                    const isNinjuan = productName.includes('寧磚') || (product.series && product.series.includes('寧磚'));
                    const accessoriesText = isNinjuan 
                        ? '📦 包裝盒、麻繩、卡片、碎紙' 
                        : '🎁 透明包裝盒、掛繩、麻繩';

                    const itemHtml = `
                        <div class="cart-item" data-id="${product.id}" data-name="${productName}" data-price="${price}">
                            <div class="cart-item-info" style="display: flex; align-items: center; gap: 14px; flex: 1;">
                                <!-- 縮圖容器 -->
                                <div class="zoomable-thumb-wrapper" data-full="${imgSrc}" data-title="${productName}" title="點擊放大圖片">
                                    <img src="${imgSrc}" alt="${productName}">
                                    <div class="zoom-overlay-btn"><span>🔍</span></div>
                                </div>
                                
                                <div style="flex: 1;">
                                    <h4 style="margin: 0 0 2px 0;">${productName}</h4>
                                    
                                    <!-- 價錢在左，描述縮小字體緊隨其後 -->
                                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                                        <div class="cart-item-price" style="font-weight: 600; color: var(--accent);">HK$${price}</div>
                                        <div style="font-size: 0.72rem; color: var(--text-secondary); background: var(--bg); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border);">
                                            ${accessoriesText}
                                        </div>
                                    </div>
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
                updatePromoState(); // 初始化優惠狀態
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

    // --- 核心：雙卡片獨立優惠檢測與按鈕狀態更新 ---
    // --- 核心：雙卡片獨立優惠檢測與按鈕狀態更新 (具備保持已套用狀態機制) ---
    function updatePromoState() {
        let totalNinjuanQty = 0;
        let totalPetQty = 0;
        let rawTotal = 0;

        if (cartContainer) {
            cartContainer.querySelectorAll('.cart-item').forEach(item => {
                const qty = parseInt(item.querySelector('.qty-display').innerText, 10) || 0;
                const price = parseFloat(item.dataset.price) || 0;
                const name = item.dataset.name || '';

                rawTotal += price * qty;
                if (name.includes('萌寵') || name.includes('甜點') || name.includes('貓爪')) {
                    totalPetQty += qty;
                } else if (name.includes('寧磚')) {
                    totalNinjuanQty += qty;
                }
            });
        }

        const potentialPetDisc = Math.floor(totalPetQty / 2) * 10;        // 甜點·萌寵：買兩件減 $10 (可累加)
        const potentialNinjuanDisc = Math.floor(totalNinjuanQty / 4) * 20; // 寧磚：買四件減 $20 (可累加)

        // 清除紅字提示
        const warningEl = document.getElementById('promoWarningMsg');
        if (warningEl) warningEl.textContent = '';

        // --- 卡片 1 (甜點·萌寵系列) 狀態維護 ---
        const status1 = document.getElementById('promoStatus1');
        const btn1 = document.getElementById('btnApplyPromo1');
        const card1 = document.getElementById('promoCard1');

        if (potentialPetDisc > 0) {
            // 如果已經達標，計算當前應得的最大折扣
            const currentMaxPetDisc = potentialPetDisc;
            
            // 如果之前已經套用過，或者數量增加，自動更新為最新可享折扣（支援累加升級）
            if (appliedPetDiscount > 0) {
                appliedPetDiscount = currentMaxPetDisc; // 自動累加更新
            }

            if (status1) {
                status1.innerHTML = appliedPetDiscount > 0 
                    ? `<span style="color: #059669; font-weight: 600;">已套用優惠！買 ${totalPetQty} 件 (已減 $${appliedPetDiscount})</span>`
                    : `<span style="color: #059669; font-weight: 600;">已符合！買 ${totalPetQty} 件 (可減 $${potentialPetDisc})</span>`;
            }
            if (btn1) {
                btn1.disabled = false;
                if (appliedPetDiscount > 0) {
                    btn1.textContent = '已套用 ✓';
                    btn1.style.background = '#059669';
                    btn1.style.color = '#fff';
                } else {
                    btn1.textContent = '套用優惠';
                    btn1.style.background = 'transparent';
                    btn1.style.color = 'var(--text)';
                }
            }
            if (card1) card1.style.borderColor = '#059669';
        } else {
            // 數量不足，強制清空該優惠
            if (status1) status1.textContent = '不適用（需買滿 2 件，可累加）';
            if (btn1) {
                btn1.disabled = true;
                btn1.textContent = '套用優惠';
                btn1.style.background = 'transparent';
                btn1.style.color = 'var(--text)';
            }
            if (card1) card1.style.borderColor = 'var(--border)';
            appliedPetDiscount = 0;
        }

        // --- 卡片 2 (寧磚系列) 狀態維護 ---
        const status2 = document.getElementById('promoStatus2');
        const btn2 = document.getElementById('btnApplyPromo2');
        const card2 = document.getElementById('promoCard2');

        if (potentialNinjuanDisc > 0) {
            const currentMaxNinjuanDisc = potentialNinjuanDisc;
            
            if (appliedNinjuanDiscount > 0) {
                appliedNinjuanDiscount = currentMaxNinjuanDisc; // 自動累加更新
            }

            if (status2) {
                status2.innerHTML = appliedNinjuanDiscount > 0
                    ? `<span style="color: #059669; font-weight: 600;">已套用優惠！買 ${totalNinjuanQty} 件 (已減 $${appliedNinjuanDiscount})</span>`
                    : `<span style="color: #059669; font-weight: 600;">已符合！買 ${totalNinjuanQty} 件 (可減 $${potentialNinjuanDisc})</span>`;
            }
            if (btn2) {
                btn2.disabled = false;
                if (appliedNinjuanDiscount > 0) {
                    btn2.textContent = '已套用 ✓';
                    btn2.style.background = '#059669';
                    btn2.style.color = '#fff';
                } else {
                    btn2.textContent = '套用優惠';
                    btn2.style.background = 'transparent';
                    btn2.style.color = 'var(--text)';
                }
            }
            if (card2) card2.style.borderColor = '#059669';
        } else {
            if (status2) status2.textContent = '不適用（需買滿 4 件，可累加）';
            if (btn2) {
                btn2.disabled = true;
                btn2.textContent = '套用優惠';
                btn2.style.background = 'transparent';
                btn2.style.color = 'var(--text)';
            }
            if (card2) card2.style.borderColor = 'var(--border)';
            appliedNinjuanDiscount = 0;
        }

        // --- 組合總折扣與備註描述 ---
        const totalDiscount = appliedPetDiscount + appliedNinjuanDiscount;
        let descArr = [];
        let summaryParts = [];

        if (appliedPetDiscount > 0) {
            descArr.push(`甜點萌寵系列優惠（減 $${appliedPetDiscount}）`);
            summaryParts.push(`甜點萌寵系列減 $${appliedPetDiscount}`);
        }
        if (appliedNinjuanDiscount > 0) {
            descArr.push(`寧磚系列優惠（減 $${appliedNinjuanDiscount}）`);
            summaryParts.push(`寧磚系列減 $${appliedNinjuanDiscount}`);
        }
        
        appliedDiscountDesc = descArr.length > 0 
            ? `[已套用優惠項目：${summaryParts.join(' ＋ ')}，總共折減 HK$${totalDiscount}]` 
            : '';

        // 更新總金額顯示 (絕不亂跳原價)
        const finalTotal = Math.max(0, rawTotal - totalDiscount);
        if (totalDisplay) {
            if (totalDiscount > 0) {
                totalDisplay.innerHTML = `<span style="font-size: 0.85rem; text-decoration: line-through; color: var(--text-tertiary); margin-right: 6px;">HK$${rawTotal}</span>HK$${finalTotal}`;
            } else {
                totalDisplay.innerText = 'HK$' + rawTotal;
            }
        }
    }


    // 綁定兩張卡片的「套用優惠」按鈕點擊事件
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'btnApplyPromo1') {
            let totalPetQty = 0;
            cartContainer.querySelectorAll('.cart-item').forEach(item => {
                const qty = parseInt(item.querySelector('.qty-display').innerText, 10) || 0;
                const name = item.dataset.name || '';
                if (name.includes('萌寵') || name.includes('甜點') || name.includes('貓爪')) totalPetQty += qty;
            });
            const disc = Math.floor(totalPetQty / 2) * 10;

            if (appliedPetDiscount > 0) {
                appliedPetDiscount = 0;
                e.target.textContent = '套用優惠';
                e.target.style.background = 'transparent';
                e.target.style.color = 'var(--text)';
            } else {
                appliedPetDiscount = disc;
                e.target.textContent = '已套用 ✓';
                e.target.style.background = '#059669';
                e.target.style.color = '#fff';
            }
            updatePromoState();
        }

        if (e.target && e.target.id === 'btnApplyPromo2') {
            let totalNinjuanQty = 0;
            cartContainer.querySelectorAll('.cart-item').forEach(item => {
                const qty = parseInt(item.querySelector('.qty-display').innerText, 10) || 0;
                const name = item.dataset.name || '';
                if (name.includes('寧磚')) totalNinjuanQty += qty;
            });
            const disc = Math.floor(totalNinjuanQty / 4) * 20;

            if (appliedNinjuanDiscount > 0) {
                appliedNinjuanDiscount = 0;
                e.target.textContent = '套用優惠';
                e.target.style.background = 'transparent';
                e.target.style.color = 'var(--text)';
            } else {
                appliedNinjuanDiscount = disc;
                e.target.textContent = '已套用 ✓';
                e.target.style.background = '#059669';
                e.target.style.color = '#fff';
            }
            updatePromoState();
        }
    });

    // 確保購物車加減時同步更新優惠狀態
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

                let totalPetQty = 0;
                let totalNinjuanQty = 0;
                cartContainer.querySelectorAll('.cart-item').forEach(item => {
                    const q = parseInt(item.querySelector('.qty-display').innerText, 10) || 0;
                    const name = item.dataset.name || '';
                    if (name.includes('萌寵') || name.includes('甜點') || name.includes('貓爪')) totalPetQty += q;
                    else if (name.includes('寧磚')) totalNinjuanQty += q;
                });

                if (Math.floor(totalPetQty / 2) * 10 === 0) appliedPetDiscount = 0;
                if (Math.floor(totalNinjuanQty / 4) * 20 === 0) appliedNinjuanDiscount = 0;

                updatePromoState();
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

    // --- 6. 處理表單提交 (加入未啟用優惠防呆檢測與確認視窗) ---
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (feedback) feedback.innerHTML = ''; 

            try {
                // 🛑 防呆檢查：如果符合優惠條件，但用戶未點擊「套用優惠」
                let totalPetQtyCheck = 0;
                let totalNinjuanQtyCheck = 0;
                cartContainer.querySelectorAll('.cart-item').forEach(item => {
                    const qty = parseInt(item.querySelector('.qty-display').innerText, 10) || 0;
                    const name = item.dataset.name || '';
                    if (name.includes('萌寵') || name.includes('甜點') || name.includes('貓爪')) {
                        totalPetQtyCheck += qty;
                    } else if (name.includes('寧磚')) {
                        totalNinjuanQtyCheck += qty;
                    }
                });

                const potentialPetDiscCheck = Math.floor(totalPetQtyCheck / 2) * 10;
                const potentialNinjuanDiscCheck = Math.floor(totalNinjuanQtyCheck / 4) * 20;
                const warningEl = document.getElementById('promoWarningMsg');

                if ((potentialPetDiscCheck > 0 && appliedPetDiscount === 0) || (potentialNinjuanDiscCheck > 0 && appliedNinjuanDiscount === 0)) {
                    if (warningEl) {
                        warningEl.textContent = '⚠️ 必須要啟用咗可以啟用嘅優惠先可以繼續！請先點擊上方優惠卡片嘅「套用優惠」按鈕。';
                        warningEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    throw new Error('必須要啟用咗可以啟用嘅優惠先可以繼續。');
                }

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

                const rawNotes = document.getElementById('notes') ? document.getElementById('notes').value.trim() : '';
                
                // 自動將優惠資訊寫入備註
                let notes = rawNotes;
                const totalDiscount = appliedPetDiscount + appliedNinjuanDiscount;
                if (totalDiscount > 0 && appliedDiscountDesc) {
                    notes = notes ? `${notes} | ${appliedDiscountDesc}` : appliedDiscountDesc;
                }

                const cartItemsDOM = cartContainer.querySelectorAll('.cart-item');
                let itemsToInsert = [];
                let totalQty = 0;
                let summaryArr = [];
                let rawTotalAmount = 0;
                
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
                            rawTotalAmount += (price * qty);
                            summaryArr.push(`${name} (x${qty})`);
                        }
                    }
                });

                if (itemsToInsert.length === 0) {
                    throw new Error('您的購物車是空的，請至少選擇一項產品。');
                }

                const totalAmount = Math.max(0, rawTotalAmount - totalDiscount);
                const productSummaryString = summaryArr.join('，');

                // 彈出確認視窗
                showCheckoutConfirmModal({
                    customerName: isLoggedIn ? '已登入會員' : customerName,
                    phone: isLoggedIn ? '會員綁定電話' : phone,
                    email: email || '未提供',
                    pickupDate: selectedDate,
                    summaryList: summaryArr,
                    rawTotal: rawTotalAmount,
                    discount: totalDiscount,
                    totalAmount: totalAmount,
                    notes: notes || '無'
                }, async () => {
                    await executeOrderSubmission({
                        isLoggedIn, customerName, phone, email, selectedDate, notes, itemsToInsert, totalAmount, productSummaryString
                    });
                });

            } catch (err) {
                console.error("錯誤:", err);
                const warningEl = document.getElementById('promoWarningMsg');
                if (!warningEl || !warningEl.textContent) {
                    displayMsg(err.message || '提交失敗，請檢查資料後再試。', 'error');
                }
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
        let discountRow = data.discount > 0 ? `<div style="margin-bottom: 6px; color: #059669;"><strong>🎉 優惠折扣：</strong> - HK$${data.discount}</div>` : '';

        bodyEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>👤 姓名 / 身份：</strong> ${escapeHtml(data.customerName)}</div>
            <div style="margin-bottom: 8px;"><strong>📞 電話號碼：</strong> ${escapeHtml(data.phone)}</div>
            <div style="margin-bottom: 8px;"><strong>📅 取貨日期：</strong> <span style="color: var(--accent); font-weight: 600;">${escapeHtml(data.pickupDate)}</span></div>
            <div style="margin-bottom: 8px;"><strong>🛍️ 購買貨品：</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${data.summaryList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
            <div style="margin-bottom: 8px;"><strong>💬 備註：</strong> ${escapeHtml(data.notes)}</div>
            ${discountRow}
            <div style="border-top: 1px solid var(--border); padding-top: 10px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600;">總計金額 (到付)：</span>
                <span style="font-size: 1.2rem; font-weight: 700; color: var(--accent);">HK$${data.totalAmount}</span>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        const btnConfirm = document.getElementById('btnConfirmCheckout');
        const btnCancel = document.getElementById('btnCancelCheckout');

        btnConfirm.disabled = false;
        btnConfirm.textContent = '確認提交預訂';

        btnCancel.onclick = function() {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        btnConfirm.onclick = async function() {
            btnConfirm.disabled = true;
            btnConfirm.textContent = '處理中...';
            
            modal.style.display = 'none';
            document.body.style.overflow = '';
            
            if (onConfirm) {
                await onConfirm();
            }
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
            appliedPetDiscount = 0;
            appliedNinjuanDiscount = 0;
            appliedDiscountDesc = '';
            updatePromoState();

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