/**
 * 卍物所 — 產品、市集預訂、畫家投稿
 */
(function () {
    'use strict';

    const MARKET_DATES = [
        { value: '2026-08-22', label: '8 月 22 日', day: '週六' },
        { value: '2026-08-23', label: '8 月 23 日', day: '週日' },
        { value: '2026-09-12', label: '9 月 12 日', day: '週六' },
        { value: '2026-09-13', label: '9 月 13 日', day: '週日' }
    ];

    /** 擺檔日：key = YYYY-MM-DD */
    const STALL_DAYS = {
        '2026-08-22': { type: 'aug', title: '8月22日 · 維園設攤（週六）' },
        '2026-08-23': { type: 'aug', title: '8月23日 · 維園設攤（週日）' },
        '2026-09-12': { type: 'sep', title: '9月12日 · 維園設攤（週六）' },
        '2026-09-13': { type: 'sep', title: '9月13日 · 維園設攤（週日）' }
    };

    const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

    const SERIES_NAME = '香磚 • 寧磚';

    const FALLBACK_PRODUCTS = [
        {
            id: 1,
            series: SERIES_NAME,
            name: '寧磚 · 貓爪',
            shape: '貓爪',
            tagline: '柔軟陪伴，靜置桌角',
            description: '天然石膏擴香石，貓爪造型。柔軟陪伴，靜置書桌或床頭，滴幾滴精油，寧靜緩緩釋放。',
            price: 12,
            category: '香磚',
            image_url: null
        },
        {
            id: 2,
            series: SERIES_NAME,
            name: '寧磚 · 玫瑰',
            shape: '玫瑰',
            tagline: '綻放溫柔，留駐日常',
            description: '天然石膏擴香石，玫瑰造型。綻放溫柔，適合禮物或梳妝台，承載木質或花香精油。',
            price: 15,
            category: '香磚',
            image_url: null
        },
        {
            id: 3,
            series: SERIES_NAME,
            name: '寧磚 · 太陽花',
            shape: '太陽花',
            tagline: '明朗希望，向光而生',
            description: '天然石膏擴香石，太陽花造型。明朗希望，置於玄關或窗台，迎接每一個出發與歸來。',
            price: 15,
            category: '香磚',
            image_url: null
        },
        {
            id: 4,
            series: SERIES_NAME,
            name: '限量聯名禮盒',
            shape: null,
            tagline: '獨特收藏，限量發行',
            description: '畫家授權作品印制於寧磚與明信片，每款各一件，附署名卡。呼應萬有可能的創作精神。',
            price: 328,
            category: '禮盒',
            image_url: null
        }
    ];

    const SHAPE_EMOJI = {
        '貓爪': '🐾',
        '玫瑰': '🌹',
        '太陽花': '🌻'
    };

    let products = [];

    function initSupabase() {
        if (typeof getSupabaseClient === 'function') {
            return getSupabaseClient();
        }
        return null;
    }

    function formatPrice(n) {
        return 'HK$' + Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function productVisual(product) {
        if (product.image_url) {
            return `<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name)}" loading="lazy">`;
        }
        if (product.shape && SHAPE_EMOJI[product.shape]) {
            return `<div class="product-shape-emoji" aria-hidden="true">${SHAPE_EMOJI[product.shape]}</div>`;
        }
        return productSvg(product.category);
    }

    function productSvg(category) {
        const isGift = category === '禮盒';
        return `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="60" cy="95" rx="35" ry="8" fill="currentColor" opacity="0.15"/>
            <path d="M35 55 Q60 25 85 55 L80 85 Q60 95 40 85 Z" fill="currentColor" opacity="0.25"/>
            ${isGift ? '<rect x="42" y="48" width="36" height="28" rx="3" fill="currentColor" opacity="0.2"/>' : ''}
            <circle cx="60" cy="48" r="12" fill="currentColor" opacity="0.35"/>
        </svg>`;
    }

    async function loadProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        grid.innerHTML = '<p class="loading-placeholder">載入中…</p>';

        try {
            const client = initSupabase();
            if (client) {
                const { data, error } = await client
                    .from('wanwu_products')
                    .select('*')
                    .eq('is_available', true)
                    .order('sort_order', { ascending: true });
                if (!error && data && data.length) {
                    products = data;
                } else {
                    products = FALLBACK_PRODUCTS;
                }
            } else {
                products = FALLBACK_PRODUCTS;
            }
        } catch (e) {
            console.warn('[卍物所] 產品載入失敗，使用本地資料', e);
            products = FALLBACK_PRODUCTS;
        }

        renderProducts();
        populateProductSelects();
        updateReserveFormMode();
    }

    function renderProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        grid.innerHTML = products.map(function (p, i) {
            const visual = productVisual(p);
            const seriesLine = p.series
                ? `<div class="product-series">${escapeHtml(p.series)}</div>`
                : `<div class="product-category">${escapeHtml(p.category || '')}</div>`;
            const taglineLine = p.tagline
                ? `<p class="product-tagline">${escapeHtml(p.tagline)}</p>`
                : '';
            return `
                <article class="product-card reveal" data-product-id="${p.id}" style="transition-delay:${i * 120}ms">
                    <div class="product-visual">${visual}</div>
                    <div class="product-body">
                        ${seriesLine}
                        <h3 class="product-name">${escapeHtml(p.name)}</h3>
                        ${taglineLine}
                        <p class="product-desc">${escapeHtml(p.description || '')}</p>
                        <div class="product-price">${formatPrice(p.price)}</div>
                    </div>
                </article>`;
        }).join('');

        grid.querySelectorAll('.product-card').forEach(function (card) {
            card.addEventListener('click', function () {
                const id = Number(card.dataset.productId);
                const product = products.find(function (p) { return p.id === id; });
                if (product) openProductModal(product);
            });
        });

        observeReveals(grid.querySelectorAll('.reveal'));
    }

    function populateProductSelects() {
        const options = products.map(function (p) {
            return `<option value="${escapeAttr(p.name)}" data-id="${p.id}" data-price="${p.price}" data-name="${escapeAttr(p.name)}">${escapeHtml(p.name)} — ${formatPrice(p.price)}</option>`;
        }).join('');

        const reserveSel = document.getElementById('reserveProduct');
        if (reserveSel) {
            reserveSel.innerHTML = '<option value="">請選擇</option>' + options;
        }
    }

    async function updateReserveFormMode() {
        const guest = document.getElementById('guestContactFields');
        const banner = document.getElementById('reserveLoggedInBanner');
        const subtitle = document.getElementById('reserveFormSubtitle');
        const nameInput = document.getElementById('customer_name');
        const phoneInput = document.getElementById('phone');
        if (!guest) return;

        const session = window.WanwuAuth ? await WanwuAuth.getSession() : null;
        const loggedIn = !!(session && session.user);

        guest.classList.toggle('hidden', loggedIn);
        if (banner) banner.classList.toggle('hidden', !loggedIn);
        if (subtitle) {
            subtitle.textContent = loggedIn
                ? '已登入 — 只需選擇產品與取貨日，聯絡資料從帳戶自動帶入。'
                : '填寫以下資料，我們將於市集為您留貨。';
        }
        if (nameInput) nameInput.required = !loggedIn;
        if (phoneInput) phoneInput.required = !loggedIn;
    }

    function openProductModal(product) {
        const overlay = document.getElementById('productModal');
        const body = document.getElementById('modalBody');
        if (!overlay || !body) return;

        const visual = productVisual(product);
        const seriesLabel = product.series || product.category || '';
        const taglineHtml = product.tagline
            ? `<p class="product-tagline" style="margin-bottom:12px">${escapeHtml(product.tagline)}</p>`
            : '';
        const shapeHtml = product.shape
            ? `<p style="font-size:0.85rem;color:var(--text-tertiary);margin-bottom:16px">造型：${escapeHtml(product.shape)} · 香磚 1.0</p>`
            : '';

        body.innerHTML = `
            <div class="modal-product-visual">${visual}</div>
            <div class="product-series">${escapeHtml(seriesLabel)}</div>
            <h3 class="product-name" style="font-size:1.5rem;margin:8px 0">${escapeHtml(product.name)}</h3>
            ${taglineHtml}
            <p style="color:var(--text-secondary);line-height:1.75;margin-bottom:12px">${escapeHtml(product.description || '')}</p>
            ${shapeHtml}
            <div class="product-price" style="font-size:1.4rem;margin-bottom:16px">${formatPrice(product.price)}</div>
            <div class="modal-stall-hint">
                <p style="font-size:0.82rem;color:var(--text-tertiary);margin-bottom:8px">系列故事</p>
                <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6">香磚 • 寧磚 — 選造型，就是選自己的故事。滴幾滴精油，寧靜便進入你的空間。</p>
            </div>
            <div class="modal-stall-hint" style="margin-top:12px">
                <p style="font-size:0.82rem;color:var(--text-tertiary);margin-bottom:8px">擺檔取貨日</p>
                <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6">8/22–23、9/12–13 · 維園 · 可即場預訂留貨</p>
            </div>
            <a href="#market" class="btn btn-primary" style="width:100%;margin-top:20px" data-close-modal>即場預訂</a>`;

        body.querySelector('[data-close-modal]')?.addEventListener('click', closeProductModal);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeProductModal() {
        const overlay = document.getElementById('productModal');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function formatDateKey(y, m, d) {
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    function renderMonthCalendar(year, month) {
        const first = new Date(year, month - 1, 1);
        const daysInMonth = new Date(year, month, 0).getDate();
        const startOffset = first.getDay();
        const today = new Date();
        const monthTitle = year + ' 年 ' + month + ' 月';

        let cells = '';
        for (let i = 0; i < startOffset; i++) {
            cells += '<span class="ecal-day ecal-day--empty"></span>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const key = formatDateKey(year, month, d);
            const stall = STALL_DAYS[key];
            const classes = ['ecal-day'];
            const cellDate = new Date(year, month - 1, d);
            if (isSameDay(cellDate, today)) classes.push('ecal-day--today');
            if (stall) classes.push('ecal-day--stall-' + stall.type);
            const title = stall ? stall.title : (isSameDay(cellDate, today) ? '今日' : '');
            cells += '<span class="' + classes.join(' ') + '"' + (title ? ' title="' + escapeAttr(title) + '"' : '') + '>' + d + '</span>';
        }

        return `
            <div class="ecal">
                <div class="ecal-header">${monthTitle}</div>
                <div class="ecal-weekdays">${WEEKDAY_LABELS.map(function (w) { return '<span>' + w + '</span>'; }).join('')}</div>
                <div class="ecal-grid">${cells}</div>
            </div>`;
    }

    function renderStallCalendar() {
        const monthsEl = document.getElementById('stallCalendarMonths');
        const todayEl = document.getElementById('calendarTodayLabel');
        if (!monthsEl) return;

        const today = new Date();
        const todayStr = today.toLocaleDateString('zh-HK', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        });

        if (todayEl) {
            todayEl.innerHTML = '今日：<strong>' + escapeHtml(todayStr) + '</strong>';
        }

        monthsEl.innerHTML = renderMonthCalendar(2026, 8) + renderMonthCalendar(2026, 9);
    }

    function renderMarketDates() {
        const container = document.getElementById('marketDatePicker');
        if (!container) return;

        container.innerHTML = MARKET_DATES.map(function (d) {
            return `
                <div class="date-option">
                    <input type="radio" name="pickup_date" id="date-${d.value}" value="${d.value}" required>
                    <label for="date-${d.value}">
                        <strong>${d.label}</strong>
                        ${d.day}
                    </label>
                </div>`;
        }).join('');
    }

    async function submitReservation(e) {
        e.preventDefault();
        const form = e.target;
        const feedback = document.getElementById('reserveFeedback');
        const btn = form.querySelector('button[type="submit"]');

        const pickupDate = form.pickup_date.value;
        const productSel = form.product_interest;
        const productOpt = productSel.options[productSel.selectedIndex];
        const quantity = parseInt(form.quantity.value, 10) || 1;
        const notes = form.notes.value.trim() || null;

        if (!pickupDate) {
            showFeedback(feedback, '請選擇取貨日期。', 'error');
            return;
        }
        if (!productSel.value) {
            showFeedback(feedback, '請選擇產品。', 'error');
            return;
        }

        const session = window.WanwuAuth ? await WanwuAuth.getSession() : null;
        const loggedIn = !!(session && session.user);

        btn.disabled = true;
        showFeedback(feedback, '提交中…', 'success');

        try {
            const client = initSupabase();

            if (loggedIn && window.WanwuAuth) {
                await WanwuAuth.createOrder({
                    product_id: Number(productOpt.dataset.id) || null,
                    product_name: productOpt.dataset.name || productSel.value,
                    unit_price: Number(productOpt.dataset.price) || null,
                    quantity: quantity,
                    pickup_date: pickupDate,
                    notes: notes
                });
                form.reset();
                showFeedback(feedback, '訂單已提交。我們會於市集當日為您備貨。', 'success');
                return;
            }

            const payload = {
                customer_name: form.customer_name.value.trim(),
                phone: form.phone.value.trim(),
                email: form.email.value.trim() || null,
                pickup_date: pickupDate,
                product_interest: productSel.value || null,
                quantity: quantity,
                notes: notes
            };

            if (!payload.customer_name || !payload.phone) {
                showFeedback(feedback, '請填寫姓名及電話。', 'error');
                btn.disabled = false;
                return;
            }

            if (client) {
                const { error } = await client.from('wanwu_market_reservations').insert(payload);
                if (error) throw error;
            } else {
                saveLocal('wanwu_reservations', payload);
            }
            form.reset();
            showFeedback(feedback, '預訂已收到。我們會於市集當日為您備貨，請留意電話聯絡。', 'success');
        } catch (err) {
            console.error(err);
            if (loggedIn) {
                showFeedback(feedback, err.message || '提交失敗，請稍後再試。', 'error');
            } else {
                const payload = {
                    customer_name: form.customer_name.value.trim(),
                    phone: form.phone.value.trim(),
                    email: form.email.value.trim() || null,
                    pickup_date: pickupDate,
                    product_interest: productSel.value || null,
                    quantity: quantity,
                    notes: notes
                };
                saveLocal('wanwu_reservations', payload);
                showFeedback(feedback, '已暫存您的預訂（離線模式）。請稍後再試或於市集現場告知我們。', 'success');
            }
        } finally {
            btn.disabled = false;
            updateReserveFormMode();
        }
    }

    async function submitArtistWork(e) {
        e.preventDefault();
        const form = e.target;
        const feedback = document.getElementById('artistFeedback');
        const btn = form.querySelector('button[type="submit"]');

        const payload = {
            artist_name: form.artist_name.value.trim(),
            email: form.email.value.trim(),
            phone: form.phone.value.trim() || null,
            work_title: form.work_title.value.trim(),
            work_description: form.work_description.value.trim() || null,
            medium: form.medium.value.trim() || null,
            portfolio_url: form.portfolio_url.value.trim() || null,
            image_url: form.image_url.value.trim() || null,
            preferred_products: form.preferred_products.value || null
        };

        if (!payload.artist_name || !payload.email || !payload.work_title) {
            showFeedback(feedback, '請填寫姓名、電郵及作品名稱。', 'error');
            return;
        }

        btn.disabled = true;

        try {
            const client = initSupabase();
            if (client) {
                const { error } = await client.from('wanwu_art_submissions').insert(payload);
                if (error) throw error;
            } else {
                saveLocal('wanwu_submissions', payload);
            }
            form.reset();
            showFeedback(feedback, '投稿已收到。我們將審閱作品並聯絡您商討印制與合作細節。', 'success');
        } catch (err) {
            console.error(err);
            saveLocal('wanwu_submissions', payload);
            showFeedback(feedback, '已暫存投稿。若持續失敗，請電郵聯絡我們。', 'success');
        } finally {
            btn.disabled = false;
        }
    }

    function saveLocal(key, item) {
        try {
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            list.push({ ...item, savedAt: new Date().toISOString() });
            localStorage.setItem(key, JSON.stringify(list));
        } catch (e) { /* ignore */ }
    }

    function showFeedback(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = 'form-feedback show ' + type;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    // 修復了 setupHeader 內部嵌套的問題
    function setupHeader() {
        const header = document.querySelector('.site-header');
        const toggle = document.querySelector('.nav-toggle');
        const navMenu = document.querySelector('nav');
        const navLinks = document.querySelector('.nav-links');
    
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);
    
        window.addEventListener('scroll', function () {
            if (header) header.classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });
    
        function closeMenu() {
            if (navMenu) navMenu.classList.remove('open');
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }
    
        if (toggle && navMenu && navLinks) {
            toggle.addEventListener('click', function () {
                const isOpen = navMenu.classList.toggle('open');
                overlay.classList.toggle('open', isOpen);
                document.body.style.overflow = isOpen ? 'hidden' : '';
            });
    
            navLinks.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', closeMenu);
            });
            
            overlay.addEventListener('click', closeMenu);
        }
    }

    function observeReveals(nodes) {
        if (!nodes || !nodes.length) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            nodes.forEach(function (n) { n.classList.add('visible'); });
            return;
        }
        const io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    // 停止觀察該元素
                    io.unobserve(entry.target);
                    
                    // ✨ 將延遲時間從 250 毫秒調快到 100 毫秒，更快觸發顯示
                    setTimeout(function() {
                        entry.target.classList.add('visible');
                    }, 200);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        nodes.forEach(function (n) { io.observe(n); });
    }

    function setupReveals() {
        observeReveals(document.querySelectorAll('.reveal'));
    }

    function setupModal() {
        const overlay = document.getElementById('productModal');
        const closeBtn = document.getElementById('modalClose');
        if (closeBtn) closeBtn.addEventListener('click', closeProductModal);
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeProductModal();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeProductModal();
        });
    }

    // === 1. 頂部歡迎回來通知邏輯 ===
    async function checkWelcomeBack() {
        if (!window.WanwuAuth) return;
        
        const session = await WanwuAuth.getSession();
        
        if (session && session.user) {
            if (!sessionStorage.getItem('wanwu_welcomed')) {
                sessionStorage.setItem('wanwu_welcomed', 'true');
                
                let userName = '客人';
                if (session.user.user_metadata && session.user.user_metadata.display_name) {
                    userName = session.user.user_metadata.display_name;
                } else if (session.user.email) {
                    userName = session.user.email.split('@')[0];
                }
                
                showWelcomeToast(`${userName}，歡迎你回來！ ✨`);
            }
        }
    }

    function showWelcomeToast(message) {
        const toast = document.getElementById('welcomeToast');
        if (!toast) return;
        
        toast.textContent = message;
        
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 4000);
        }, 1200);
    }

    // 唯一的 DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        setupHeader();
        setupModal();
        // 注意這裡不呼叫 setupReveals()，留給載入畫面結束後再呼叫
        renderMarketDates();
        renderStallCalendar();
        loadProducts();

        const reserveForm = document.getElementById('reserveForm');
        const artistForm = document.getElementById('artistForm');
        if (reserveForm) reserveForm.addEventListener('submit', submitReservation);
        if (artistForm) artistForm.addEventListener('submit', submitArtistWork);

        updateReserveFormMode();
        if (window.WanwuAuth) {
            WanwuAuth.onAuthStateChange(function () {
                updateReserveFormMode();
            });
        }
        
        checkWelcomeBack();
    });

    // === 2. 加載畫面 (Loading Screen) 控制 ===

    window.addEventListener('load', function() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        // 檢查該標籤頁 (Session) 是否已經載入過
        const hasLoadedOnce = sessionStorage.getItem('wanwu_loaded_once');
        let loadTime = 3500; // 第一次進入，維持 3.5 秒的寧靜沉澱

        if (hasLoadedOnce) {
            // 如果已經進入過，將等待時間大幅縮減至 1 秒
            loadTime = 1000;
            // 加入加速 class，讓 CSS 動畫跟著變快
            loader.classList.add('fast-load');
        } else {
            // 標記為已經載入過
            sessionStorage.setItem('wanwu_loaded_once', 'true');
        }

        setTimeout(() => {
            loader.classList.add('hidden');
            
            // 載入畫面隱藏的一刻，啟動首頁的文字漸出動畫！
            setupReveals(); 
            
            setTimeout(() => {
                loader.style.display = 'none';
            }, 800);
        }, loadTime); 
    } else {
        // 防呆：如果沒有 loader，就直接執行
        setupReveals();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // 使用 window 的「捕獲階段 (Capture)」來做最高優先級的攔截
    window.addEventListener('click', function(e) {
        const toggleBtn = e.target.closest('.dropdown-toggle');
        const dropdownLink = e.target.closest('.dropdown-menu a');

        // 情境 1：如果點擊的是「更多工具」按鈕 (或是旁邊的箭頭)
        if (toggleBtn) {
            e.preventDefault();
            // 🔴 終極攔截：在事件傳遞給原本的 app.js 之前，直接在這裡砍斷！
            // 這會完美防止觸發「點擊連結就關閉手機選單」的邏輯
            e.stopPropagation();
            e.stopImmediatePropagation();

            const navDropdown = toggleBtn.closest('.nav-dropdown');
            if (navDropdown) {
                navDropdown.classList.toggle('active'); // 展開或收起子選單
            }
        } 
        // 情境 2：如果點擊的是「子選單裡的連結」(例如 追蹤市集訂單 或 畫家投稿)
        else if (dropdownLink) {
            const navDropdown = dropdownLink.closest('.nav-dropdown');
            if (navDropdown) {
                // 順手把子選單的 active 移除，這樣下次打開手機選單時，就不會預設是展開的！
                navDropdown.classList.remove('active');
            }
            // 注意：這裡我們「不攔截」事件，讓原本的 app.js 正常運作，
            // 順利幫你關閉手機的主選單並跳轉頁面。
        } 
        // 情境 3：如果點擊網頁的「其他空白地方」
        else {
            const activeDropdown = document.querySelector('.nav-dropdown.active');
            if (activeDropdown && !activeDropdown.contains(e.target)) {
                activeDropdown.classList.remove('active'); // 自動收起子選單
            }
        }
    }, true); // <--- 關鍵字 true，代表在「捕獲階段」優先執行，這是整個網站第一個被觸發的事件！
});

})();
