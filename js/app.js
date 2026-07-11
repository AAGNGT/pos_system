/**
 * 卍物所 — 產品、市集預訂、畫家投稿
 */
(function () {
    'use strict';

    const MARKET_DATES = [
        { value: '2026-08-22', label: '8 月 22 日', day: '週六' },
        { value: '2026-08-23', label: '8 月 23 日', day: '週日' }
    ];

    const FALLBACK_PRODUCTS = [
        { id: 1, name: '霧岩擴香石 · 初雪', description: '天然石膏雕刻，緩釋精油香氣，置於書桌或床頭，靜謐如初雪消融。', price: 168, category: '擴香石', image_url: null },
        { id: 2, name: '霧岩擴香石 · 暮砂', description: '暖灰調礦石肌理，適合木質與柑橘系香氛，為空間留下黃昏的溫度。', price: 188, category: '擴香石', image_url: null },
        { id: 3, name: '霧岩擴香石 · 苔痕', description: '深綠礦彩點綴，靈感來自雨後苔石，配花香或草本精油尤佳。', price: 198, category: '擴香石', image_url: null },
        { id: 4, name: '限量聯名禮盒', description: '畫家授權作品印制於擴香石與明信片，每款各一件，附署名卡。', price: 328, category: '禮盒', image_url: null }
    ];

    let supabaseClient = null;
    let products = [];

    function initSupabase() {
        if (typeof supabase === 'undefined' || typeof SUPABASE_CONFIG === 'undefined') return null;
        supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        return supabaseClient;
    }

    function formatPrice(n) {
        return 'HK$' + Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
    }

    function renderProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        grid.innerHTML = products.map(function (p, i) {
            const visual = p.image_url
                ? `<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}" loading="lazy">`
                : productSvg(p.category);
            return `
                <article class="product-card reveal" data-product-id="${p.id}" style="transition-delay:${i * 80}ms">
                    <div class="product-visual">${visual}</div>
                    <div class="product-body">
                        <div class="product-category">${escapeHtml(p.category || '')}</div>
                        <h3 class="product-name">${escapeHtml(p.name)}</h3>
                        <p class="product-desc">${escapeHtml(p.description || '')}</p>
                        <div class="product-price">${formatPrice(p.price)}<span>起</span></div>
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
            return `<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)} — ${formatPrice(p.price)}</option>`;
        }).join('');

        ['reserveProduct', 'artistProducts'].forEach(function (id) {
            const sel = document.getElementById(id);
            if (!sel) return;
            const first = sel.querySelector('option');
            sel.innerHTML = (first ? first.outerHTML : '<option value="">請選擇</option>') + options;
        });
    }

    function openProductModal(product) {
        const overlay = document.getElementById('productModal');
        const body = document.getElementById('modalBody');
        if (!overlay || !body) return;

        const visual = product.image_url
            ? `<img src="${escapeAttr(product.image_url)}" alt="">`
            : productSvg(product.category);

        body.innerHTML = `
            <div class="modal-product-visual">${visual}</div>
            <div class="product-category">${escapeHtml(product.category || '')}</div>
            <h3 class="product-name" style="font-size:1.5rem;margin:8px 0">${escapeHtml(product.name)}</h3>
            <p style="color:var(--text-secondary);line-height:1.75;margin-bottom:20px">${escapeHtml(product.description || '')}</p>
            <div class="product-price" style="font-size:1.4rem;margin-bottom:24px">${formatPrice(product.price)}</div>
            <a href="#market" class="btn btn-primary" style="width:100%" data-close-modal>即場預訂</a>`;

        body.querySelector('[data-close-modal]')?.addEventListener('click', closeProductModal);
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeProductModal() {
        const overlay = document.getElementById('productModal');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
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

        const payload = {
            customer_name: form.customer_name.value.trim(),
            phone: form.phone.value.trim(),
            email: form.email.value.trim() || null,
            pickup_date: form.pickup_date.value,
            product_interest: form.product_interest.value || null,
            quantity: parseInt(form.quantity.value, 10) || 1,
            notes: form.notes.value.trim() || null
        };

        if (!payload.customer_name || !payload.phone || !payload.pickup_date) {
            showFeedback(feedback, '請填寫姓名、電話及取貨日期。', 'error');
            return;
        }

        btn.disabled = true;
        showFeedback(feedback, '提交中…', 'success');

        try {
            const client = initSupabase();
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
            saveLocal('wanwu_reservations', payload);
            showFeedback(feedback, '已暫存您的預訂（離線模式）。請稍後再試或於市集現場告知我們。', 'success');
        } finally {
            btn.disabled = false;
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

    function setupHeader() {
        const header = document.querySelector('.site-header');
        const toggle = document.querySelector('.nav-toggle');
        const nav = document.querySelector('.nav-links');

        window.addEventListener('scroll', function () {
            if (header) header.classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });

        if (toggle && nav) {
            toggle.addEventListener('click', function () {
                nav.classList.toggle('open');
            });
            nav.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', function () { nav.classList.remove('open'); });
            });
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
                    entry.target.classList.add('visible');
                    io.unobserve(entry.target);
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

    document.addEventListener('DOMContentLoaded', function () {
        setupHeader();
        setupModal();
        setupReveals();
        renderMarketDates();
        loadProducts();

        const reserveForm = document.getElementById('reserveForm');
        const artistForm = document.getElementById('artistForm');
        if (reserveForm) reserveForm.addEventListener('submit', submitReservation);
        if (artistForm) artistForm.addEventListener('submit', submitArtistWork);
    });
})();
