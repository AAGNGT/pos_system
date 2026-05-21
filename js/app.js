(function () {
  const STAFF_KEY = 'pos_staff';
  let mode = 'sale';
  let categories = [];
  let products = [];
  let activeCategoryId = null;
  let productSearch = '';
  let sortBy = 'default';

  function getStaff() {
    try {
      return JSON.parse(sessionStorage.getItem(STAFF_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setStaff(staff) {
    sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    updateStaffUI();
  }

  function ctx() {
    return { getMode: () => mode, getStaff, reloadProducts: loadProducts };
  }

  function updateStaffUI() {
    const s = getStaff();
    const el = document.getElementById('sidebarUser');
    if (el) el.textContent = s ? `${s.display_name} (${s.role})` : '未登入';
  }

  function placeholderImg(name) {
    const t = encodeURIComponent((name || '商品').slice(0, 8));
    return `https://placehold.co/200x200/e2e8f0/64748b?text=${t}`;
  }

  function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    let list = [...products];
    if (activeCategoryId) list = list.filter((p) => p.category_id === activeCategoryId);
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    if (sortBy === 'price_asc') list.sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') list.sort((a, b) => b.price - a.price);
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

    if (!list.length) {
      grid.innerHTML = '<p class="pos-order__empty" style="grid-column:1/-1">沒有商品</p>';
      return;
    }

    const invModes = ['restock', 'return', 'damage'];
    grid.innerHTML = list.map((p) => `
      <article class="pos-product-card" data-id="${p.id}">
        <div class="pos-product-card__img">
          <img src="${p.image_url || placeholderImg(p.name)}" alt="${p.name}" loading="lazy">
          <span class="pos-product-card__stock">${p.stock_count}</span>
          <span class="pos-product-card__price">$${Number(p.price).toFixed(2)}</span>
        </div>
        <div class="pos-product-card__body">
          <p class="pos-product-card__name">${p.name}</p>
          <p class="pos-product-card__code">${p.code}</p>
        </div>
      </article>`).join('');

    grid.querySelectorAll('.pos-product-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const product = products.find((x) => x.id === id);
        if (!product) return;
        if (mode === 'sale') {
          window.posCart.add(product, 1);
        } else if (invModes.includes(mode)) {
          window.posModes.inventory.selectProduct(product);
        }
      });
    });
  }

  function renderCategoryPills() {
    const bar = document.getElementById('categoryPills');
    if (!bar) return;
    const pills = [{ id: null, name: 'All' }, ...categories];
    bar.innerHTML = pills.map((c) => `
      <button type="button" class="pos-pill ${activeCategoryId === c.id ? 'active' : ''}" data-cat="${c.id ?? ''}">${c.name}</button>
    `).join('');
    bar.querySelectorAll('.pos-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.cat;
        activeCategoryId = v === '' ? null : Number(v);
        bar.querySelectorAll('.pos-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts();
      });
    });
  }

  function renderCart() {
    const items = window.posCart.getItems();
    const list = document.getElementById('cartItems');
    const discount = Number(document.getElementById('fieldDiscount')?.value || 0);
    const { subtotal, discount: disc, total } = window.posCart.totals(discount);
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '<p class="pos-order__empty">Empty</p>';
    } else {
      list.innerHTML = items.map((i) => `
        <div class="pos-cart-line">
          <div class="pos-cart-line__info">
            <p class="pos-cart-line__name">${i.name}</p>
            <p class="pos-cart-line__meta">$${i.unit_price.toFixed(2)} × ${i.qty}</p>
          </div>
          <div class="pos-cart-line__qty">
            <button type="button" data-dec="${i.product_id}">−</button>
            <span>${i.qty}</span>
            <button type="button" data-inc="${i.product_id}">+</button>
          </div>
          <strong>$${i.line_total.toFixed(2)}</strong>
        </div>`).join('');
      list.querySelectorAll('[data-inc]').forEach((b) => {
        b.addEventListener('click', () => {
          const item = items.find((x) => x.product_id === Number(b.dataset.inc));
          if (item) window.posCart.setQty(item.product_id, item.qty + 1);
        });
      });
      list.querySelectorAll('[data-dec]').forEach((b) => {
        b.addEventListener('click', () => {
          const item = items.find((x) => x.product_id === Number(b.dataset.dec));
          if (item) window.posCart.setQty(item.product_id, item.qty - 1);
        });
      });
    }

    const subEl = document.getElementById('sumSubtotal');
    const discEl = document.getElementById('sumDiscount');
    const totEl = document.getElementById('sumTotal');
    const chargeBtn = document.getElementById('btnCharge');
    if (subEl) subEl.textContent = `$${subtotal.toFixed(2)}`;
    if (discEl) discEl.textContent = `-$${disc.toFixed(2)}`;
    if (totEl) totEl.textContent = `$${total.toFixed(2)}`;
    if (chargeBtn) {
      chargeBtn.textContent = `Charge $${total.toFixed(2)}`;
      chargeBtn.disabled = mode !== 'sale' || !items.length;
    }
  }

  function updateModeUI() {
    const badge = document.getElementById('orderModeBadge');
    const labels = { sale: 'SALE', restock: 'RESTOCK', return: 'RETURN', damage: 'DAMAGE' };
    if (badge) badge.textContent = labels[mode] || mode.toUpperCase();

    const showProducts = ['sale', 'restock', 'return', 'damage'].includes(mode);
    document.getElementById('productArea')?.classList.toggle('hidden', !showProducts);
    document.getElementById('altPanels')?.classList.toggle('hidden', showProducts);

    const checkout = document.getElementById('saleCheckout');
    const invPanel = document.getElementById('invPanel');
    if (checkout) checkout.style.display = mode === 'sale' ? 'block' : 'none';
    if (invPanel) invPanel.style.display = ['restock', 'return', 'damage'].includes(mode) ? 'block' : 'none';

    const chargeBtn = document.getElementById('btnCharge');
    if (chargeBtn) chargeBtn.style.display = mode === 'sale' ? 'block' : 'none';

    document.querySelectorAll('.pos-nav__item[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const panels = ['history', 'dashboard', 'settings', 'staff', 'eod', 'products'];
    panels.forEach((p) => {
      const el = document.getElementById(`panel${p.charAt(0).toUpperCase() + p.slice(1)}`);
      if (el) el.classList.toggle('active', mode === p);
    });
    if (mode === 'history') window.posModes.management.renderHistory();
    if (mode === 'dashboard') window.posModes.management.renderDashboard();
    if (mode === 'settings') window.posModes.management.renderSettings();
    if (mode === 'staff') window.posModes.management.renderStaff();
    if (mode === 'eod') window.posModes.management.renderEod();
    if (mode === 'products') {
      const el = document.getElementById('panelProducts');
      if (el && !el.dataset.loaded) {
        el.dataset.loaded = '1';
        el.innerHTML = '<p>商品資料管理：</p><iframe src="manager.html" style="width:100%;height:70vh;border:1px solid #e2e8f0;border-radius:12px;margin-top:12px"></iframe>';
      }
    }
  }

  function setMode(m) {
    if (m === 'logout') {
      sessionStorage.removeItem(STAFF_KEY);
      showLoginModal();
      return;
    }
    if (m === 'dark') return;
    mode = m;
    updateModeUI();
    if (['sale', 'restock', 'return', 'damage'].includes(mode)) renderProducts();
  }

  async function loadProducts() {
    products = await window.posApi.fetchProducts();
    renderProducts();
  }

  async function init() {
    if (!window.posDb.initSupabase()) {
      window.ui.toast('無法連接 Supabase', 'error');
      return;
    }
    window.ui.setLoading(true);
    try {
      categories = await window.posApi.fetchCategories();
      await loadProducts();
      renderCategoryPills();
      activeCategoryId = categories.find((c) => c.slug === 'keychain')?.id ?? null;
      renderCategoryPills();
      renderProducts();
    } catch (e) {
      window.ui.toast(`載入失敗: ${e.message}（請確認已執行 database_migration.sql）`, 'error');
    } finally {
      window.ui.setLoading(false);
    }

    window.posCart.onCartChange(renderCart);
    renderCart();

    document.getElementById('btnClear')?.addEventListener('click', () => window.posCart.clear());
    document.getElementById('fieldDiscount')?.addEventListener('input', renderCart);
    document.getElementById('btnCharge')?.addEventListener('click', () => window.posModes.sale.checkout(ctx()));
    document.getElementById('btnRefresh')?.addEventListener('click', loadProducts);
    document.getElementById('orderSearch')?.addEventListener('input', (e) => {
      productSearch = e.target.value.trim();
      renderProducts();
    });
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderProducts();
    });

    document.querySelectorAll('.pos-nav__item[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    document.getElementById('darkToggle')?.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const on = document.body.classList.contains('dark');
      document.getElementById('darkToggle').classList.toggle('on', on);
      localStorage.setItem('pos_dark', on ? '1' : '0');
    });
    if (localStorage.getItem('pos_dark') === '1') {
      document.body.classList.add('dark');
      document.getElementById('darkToggle')?.classList.add('on');
    }

    window.posModes.inventory.bind(ctx());

    if (!getStaff()) showLoginModal();
    else updateStaffUI();
    setMode('sale');
  }

  async function showLoginModal() {
    const modal = document.getElementById('loginModal');
    const sel = document.getElementById('loginStaff');
    const staff = await window.posApi.fetchStaff();
    sel.innerHTML = staff.map((s) => `<option value="${s.id}">${s.display_name} (${s.role})</option>`).join('');
    modal.classList.add('active');
  }

  async function doLogin() {
    const id = Number(document.getElementById('loginStaff').value);
    const pin = document.getElementById('loginPin').value;
    const row = await window.posApi.verifyStaff(id, pin);
    if (!row) {
      window.ui.toast('PIN 錯誤', 'error');
      return;
    }
    setStaff(row);
    document.getElementById('loginModal').classList.remove('active');
    window.ui.toast(`歡迎，${row.display_name}`, 'success');
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnLogin')?.addEventListener('click', doLogin);
    init();
  });

  window.posApp = { setMode, getStaff, ctx };
})();
