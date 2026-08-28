(function () {
  const STAFF_KEY = 'pos_staff';
  let mode = 'sale';
  let categories = [];
  let products = [];
  let activeCategoryId = null; 
  let productSearch = '';
  let sortBy = 'default';
  
  const ORDER_PIN_KEY = 'pos_order_pinned';
  let isOrderPinned = localStorage.getItem(ORDER_PIN_KEY) !== '0'; 
  let currentProductClickAction = 'focus';
  let currentForceOrderPinned = ''; // 💡 保存從伺服器抓到的強制狀態
  
  let isPromoPlaying = false; // 💡 新增：追蹤客顯屏宣傳狀態

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

  function roleLabel(role) {
    return role === 'ADMIN' ? '管理員' : '員工';
  }

  function updateStaffUI() {
    const s = getStaff();
    const el = document.getElementById('sidebarUser');
    const header = document.getElementById('headerUser');
    const text = s ? `${s.display_name} ${roleLabel(s.role)} ` : '未登入';
    if (el) el.textContent = text;
    if (header) header.textContent = text;

    const isAdmin = s && s.role === 'ADMIN';
    const restrictedBtns = document.querySelectorAll('.pos-nav__item[data-mode="products"], .pos-nav__item[data-mode="settings"]');
    
    restrictedBtns.forEach((btn) => {
      const iconSpan = btn.querySelector('.pos-nav__icon');
      const mode = btn.dataset.mode;
      if (!isAdmin) {
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.style.background = 'transparent'; 
        if (iconSpan) iconSpan.textContent = '🔒';
      } else {
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.background = '';
        if (iconSpan) {
          if (mode === 'products') iconSpan.textContent = '🗄️';
          if (mode === 'settings') iconSpan.textContent = '⚙️'; 
        }
      }
    });
  }

  const PIN_KEY = 'pos_sidebar_pinned';
  const RAIL_BREAKPOINT = 1100;

  function isSidebarPinned() {
    return document.body.classList.contains('sidebar-pinned');
  }

  function updateSidebarRail() {
    if (!isSidebarPinned()) {
      document.body.classList.remove('sidebar-rail');
      return;
    }
    const rail = window.innerWidth < RAIL_BREAKPOINT;
    document.body.classList.toggle('sidebar-rail', rail);
  }

  function updatePinButton() {
    const btn = document.getElementById('btnSidebarPin');
    if (!btn) return;
    const pinned = isSidebarPinned();
    btn.classList.toggle('is-pinned', pinned);
    btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    btn.title = pinned ? '取消釘選' : '釘選選單';
  }

  function setSidebarPinned(pinned) {
    const sidebar = document.getElementById('posSidebar');
    if (!pinned && sidebar) {
      sidebar.style.transition = 'none';
    }
    document.body.classList.toggle('sidebar-pinned', pinned);
    localStorage.setItem(PIN_KEY, pinned ? '1' : '0');
    
    if (pinned) {
      sidebar?.classList.add('open');
      document.body.classList.add('sidebar-open');
      document.getElementById('btnOpenMenu')?.setAttribute('aria-expanded', 'true');
    } else {
      closeSidebar();
      if (sidebar) {
        setTimeout(() => {
          sidebar.style.transition = '';
        }, 50);
      }
    }
    
    updateSidebarRail();
    updatePinButton();
  }

  function toggleSidebarPin() {
    setSidebarPinned(!isSidebarPinned());
  }

  function openSidebar() {
    if (isSidebarPinned()) return;
    document.getElementById('posSidebar')?.classList.add('open');
    document.getElementById('sidebarBackdrop')?.classList.add('active');
    document.getElementById('btnOpenMenu')?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    if (isSidebarPinned()) return;
    document.getElementById('posSidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
    document.getElementById('btnOpenMenu')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-open');
  }

  const MODE_LABELS = {
    sale: '收銀台', restock: '入貨', return: '退貨', damage: '報銷',
    products: '數據庫管理', history: '交易紀錄', dashboard: '營業概況',
    settings: '系統設定', staff: '員工管理', eod: '營業日結單'
  };

  const MODE_BADGES = {
    sale: '售賣', restock: '入貨', return: '退貨', damage: '報銷'
  };

  function placeholderImg(name) {
    return window.posProductThumb?.svgPlaceholder?.(name) || 'images.png';
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
      grid.innerHTML = '<p class="pos-order__empty" style="grid-column:1/-1">找不到符合的產品</p>';
      return;
    }
    const invModes = ['restock', 'return', 'damage'];
    grid.innerHTML = list.map((p) => `
      <article class="pos-product-card" data-id="${p.id}">
        <div class="pos-product-card__img">
          <img src="${p.image_url || placeholderImg(p.name)}" alt="${p.name}" loading="lazy">
          <span class="pos-product-card__stock">${p.stock_count}</span>
          <span class="pos-product-card__price">${Number(p.price) < 0 ? '-' : ''}$${Math.abs(Number(p.price)).toFixed(2)}</span>
        </div>
        <div class="pos-product-card__body">
          <p class="pos-product-card__name">${p.name}</p>
          <p class="pos-product-card__code">${p.code}</p>
        </div>
      </article>`).join('');
    
      grid.querySelectorAll('.pos-product-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const id = Number(card.dataset.id);
        const product = products.find((x) => x.id === id);
        if (!product) return;
        
        if (mode === 'sale') {
          if (currentProductClickAction === 'focus' && typeof focusProductCard === 'function') {
            focusProductCard(card, product); 
          } else {
            window.posCart.add(product, 1);  
          }
        } else if (invModes.includes(mode)) {
          window.posModes.inventory.selectProduct(product);
        }
      });
    });

  }

  function renderCategoryPills() {
    const bar = document.getElementById('categoryPills');
    if (!bar) return;
    const pills = [{ id: null, name: '全部' }, ...categories];
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
      list.innerHTML = '<p class="pos-order__empty">購物車是空的</p>';
    } else {
      list.innerHTML = items.map((i) => `
        <div class="pos-cart-line">
          <div class="pos-cart-line__info">
            <p class="pos-cart-line__name">${i.name}</p>
            <p class="pos-cart-line__meta">${i.unit_price < 0 ? '-' : ''}$${Math.abs(i.unit_price).toFixed(2)} × ${i.qty}</p>
          </div>
          <div class="pos-cart-line__qty">
            <button type="button" data-dec="${i.product_id}">-</button>
            <span>${i.qty}</span>
            <button type="button" data-inc="${i.product_id}">+</button>
          </div>
          <strong>${i.line_total < 0 ? '-' : ''}$${Math.abs(i.line_total).toFixed(2)}</strong>
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
      chargeBtn.textContent = `結帳 $${total.toFixed(2)}`;
      chargeBtn.disabled = mode !== 'sale' || !items.length;
    }
  }

  function focusProductCard(originalCard, product) {
    let overlay = document.getElementById('posFocusOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'posFocusOverlay';
      overlay.className = 'pos-focus-overlay';
      document.body.appendChild(overlay);
    }
    
    const rect = originalCard.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = 'pos-product-clone';
    
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    
    clone.innerHTML = `
      <div class="pos-clone-hero" id="cloneHero" style="height: ${rect.width}px;">
        <img src="${product.image_url || placeholderImg(product.name)}">
        <div class="pos-hero-overlay" id="cloneHeroOverlay">
          <h3 class="pos-clone-title">${product.name}</h3>
          <p class="pos-clone-price">$${Number(product.price).toFixed(2)}</p>
        </div>
      </div>
      
      <div class="pos-clone-controls" id="cloneControls">
        <div class="pos-pill-ctrl">
          <button id="btnFocusMinus">-</button>
          <span id="focusQtyDisplay">1</span>
          <button id="btnFocusPlus">+</button>
        </div>
        <button class="pos-btn-charge" id="btnConfirmAdd" style="border-radius: 999px; padding: 14px; font-size: 16px;">
          加入購物車
        </button>
      </div>
    `;
    
    document.body.appendChild(clone);
    originalCard.style.opacity = '0'; 
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('active');
        
        const targetWidth = 360;
        const heroHeight = 340;  
        const controlsHeight = 160; 
        const targetHeight = heroHeight + controlsHeight; 
        
        const centerX = (window.innerWidth - targetWidth) / 2;
        const centerY = (window.innerHeight - targetHeight) / 2;
        
        clone.style.top = `${centerY}px`;
        clone.style.left = `${centerX}px`;
        clone.style.width = `${targetWidth}px`;
        clone.style.height = `${targetHeight}px`;
        
        clone.querySelector('#cloneHero').style.height = `${heroHeight}px`;
        
        clone.classList.add('is-focused');
      });
    });
    
    const closeFocus = () => {
      overlay.classList.remove('active');
      clone.classList.remove('is-focused');
      
      clone.querySelector('#cloneHeroOverlay').style.opacity = '0';
      clone.querySelector('#cloneControls').style.opacity = '0';
      
      clone.style.top = `${rect.top}px`;
      clone.style.left = `${rect.left}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      
      clone.querySelector('#cloneHero').style.height = `${rect.width}px`;
      
      setTimeout(() => {
        clone.remove();
        originalCard.style.opacity = '1'; 
      }, 400);
    };

    overlay.onclick = closeFocus;
    clone.onclick = (e) => e.stopPropagation();
    
    let currentQty = 1;
    const qtyDisplay = clone.querySelector('#focusQtyDisplay');
    
    clone.querySelector('#btnFocusMinus').onclick = (e) => {
      e.stopPropagation();
      if (currentQty > 1) {
        currentQty--;
        qtyDisplay.textContent = currentQty;
      }
    };

    clone.querySelector('#btnFocusPlus').onclick = (e) => {
      e.stopPropagation();
      currentQty++;
      qtyDisplay.textContent = currentQty;
    };
    
    clone.querySelector('#btnConfirmAdd').onclick = (e) => {
      e.stopPropagation();
      window.posCart.add(product, currentQty); 
      closeFocus();
    };
  }

  function updateOrderPinUI() {
    const btn = document.getElementById('btnOrderPin');
    const alwaysShowModes = ['sale', 'restock', 'return', 'damage'];
    const isMainMode = alwaysShowModes.includes(mode);

    if (btn) {
      btn.style.display = isMainMode ? 'none' : 'flex';
      btn.classList.toggle('is-pinned', isOrderPinned);
    }
    
    const shouldShowOrder = isMainMode || isOrderPinned;
    document.body.classList.toggle('hide-order-panel', !shouldShowOrder);
  }

  function updateModeUI() {
    const badge = document.getElementById('orderModeBadge');
    if (badge) badge.textContent = MODE_BADGES[mode] || MODE_LABELS[mode] || mode;
    
    updateOrderPinUI();

    const showProducts = ['sale', 'restock', 'return', 'damage'].includes(mode);
    document.getElementById('productArea')?.classList.toggle('hidden', !showProducts);
    document.getElementById('altPanels')?.classList.toggle('hidden', showProducts);
    
    const checkout = document.getElementById('saleCheckout');
    const invPanel = document.getElementById('invPanel');
    if (checkout) checkout.style.display = mode === 'sale' ? 'block' : 'none';
    if (invPanel) invPanel.style.display = ['restock', 'return', 'damage'].includes(mode) ? 'block' : 'none';
    
    const cartLockOverlay = document.getElementById('cartLockOverlay');
    if (cartLockOverlay) {
      cartLockOverlay.classList.toggle('hidden', mode === 'sale');
    }

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
        el.innerHTML = '<p>載入中...</p><iframe src="manager.html" style="width:100%;height:70vh;border:1px solid #e2e8f0;border-radius:12px;margin-top:12px"></iframe>';
      }
    }
  }

  function setMode(m) {
    if (m === 'logout') {
      sessionStorage.removeItem(STAFF_KEY);
      closeSidebar();
      showLoginModal();
      return;
    }
    if (m === 'dark') return;
    
    const s = getStaff();
    const restrictedModes = ['products', 'settings']; 
    if (restrictedModes.includes(m) && s && s.role !== 'ADMIN') {
      window.ui.toast('權限不足', 'error');
      return; 
    }
    
    mode = m;
    closeSidebar();
    
    const headerLabel = document.getElementById('headerModeLabel');
    if (headerLabel) headerLabel.textContent = MODE_LABELS[m] || m;
    updateModeUI();
    if (['sale', 'restock', 'return', 'damage'].includes(mode)) renderProducts();
  }

  async function loadProducts() {
    products = await window.posApi.fetchProducts();
    window.posProductCatalog = products;
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
      
      activeCategoryId = null; // 預設全部分類
      
      renderCategoryPills();
      renderProducts();
    } catch (e) {
      window.ui.toast(`載入錯誤: ${e.message} (請確保 database_migration.sql 已執行)`, 'error');
    } finally {
      window.ui.setLoading(false);
    }
    
    window.posCart.onCartChange(renderCart);
    renderCart();
    document.getElementById('btnClear')?.addEventListener('click', () => window.posCart.clear());
    window.posOnDiscountApplied = () => {
      renderCart();
      window.posDisplaySync?.syncFromRegister?.();
    };
    window.posDiscountModal?.bind?.();
    
    const resetModal = document.getElementById('resetDisplayModal');
    const openResetModal = () => window.ui.openModal(resetModal);
    const closeResetModal = () => window.ui.closeModal(resetModal);
    
    document.getElementById('btnResetDisplay')?.addEventListener('click', openResetModal);
    document.getElementById('btnResetDisplayCancel')?.addEventListener('click', closeResetModal);
    
    document.getElementById('btnResetDisplayConfirm')?.addEventListener('click', async () => {
      closeResetModal();
      await window.posDisplaySync?.resetDisplay?.();
      window.ui.toast('客顯屏已重設為閒置狀態', 'success');
    });

    // 💡 新增：客顯屏宣傳按鈕邏輯
    const btnTogglePromo = document.getElementById('btnTogglePromo');
    function updatePromoBtnUI() {
      if (!btnTogglePromo) return;
      if (isPromoPlaying) {
        btnTogglePromo.textContent = '暫停宣傳';
        btnTogglePromo.style.background = '#f59e0b';
      } else {
        btnTogglePromo.textContent = '播放宣傳';
        btnTogglePromo.style.background = '#8b5cf6';
      }
    }
    
    if (btnTogglePromo) {
      btnTogglePromo.addEventListener('click', async () => {
        const cartItems = window.posCart?.getItems?.() || [];
        // 【防呆機制】：如果有訂單，拒絕播放
        if (cartItems.length > 0) {
          window.ui.toast('當前有訂單正在處理中，無法播放宣傳動畫。', 'error');
          return;
        }

        isPromoPlaying = !isPromoPlaying;
        updatePromoBtnUI();
        
        if (window.posDisplaySync?.setPromoActive) {
          await window.posDisplaySync.setPromoActive(isPromoPlaying);
        }
      });
    }

    // 接收來自 display-sync 觸發的自動中斷防呆事件
    window.addEventListener('posPromoStopped', () => {
      if (isPromoPlaying) {
        isPromoPlaying = false;
        updatePromoBtnUI();
      }
    });
    
    const notePopover = document.getElementById('notePopover');
    const fieldNote = document.getElementById('fieldNote');
    const btnToggleNote = document.getElementById('btnToggleNote');
    const syncNoteBtn = () => {
      if (!btnToggleNote) return;
      const has = !!(fieldNote?.value?.trim());
      btnToggleNote.classList.toggle('has-note', has);
      btnToggleNote.textContent = has ? '已套用備註' : '新增備註';
    };
    const openNote = () => {
      notePopover?.classList.remove('hidden');
      notePopover?.setAttribute('aria-hidden', 'false');
      fieldNote?.focus();
    };
    const closeNote = () => {
      notePopover?.classList.add('hidden');
      notePopover?.setAttribute('aria-hidden', 'true');
      syncNoteBtn();
    };
    btnToggleNote?.addEventListener('click', openNote);
    document.getElementById('btnNoteDone')?.addEventListener('click', closeNote);
    document.getElementById('notePopoverBackdrop')?.addEventListener('click', closeNote);
    fieldNote?.addEventListener('input', syncNoteBtn);
    syncNoteBtn();
    
    window.posModes.sale?.bindCheckoutModal?.(ctx());
    window.posModes.sale?.bindChargeButton?.();
    
    document.getElementById('btnOrderPin')?.addEventListener('click', () => {
    if (currentForceOrderPinned === 'true' || currentForceOrderPinned === 'false') {
        window.ui.toast('管理員已強制鎖定購物車面板顯示狀態', 'error');
        return;
      }
      isOrderPinned = !isOrderPinned;
      localStorage.setItem(ORDER_PIN_KEY, isOrderPinned ? '1' : '0');
      updateOrderPinUI();
    });

    document.getElementById('btnOpenMenu')?.addEventListener('click', () => {
      if (isSidebarPinned()) {
        document.body.classList.toggle('sidebar-rail');
        if (!document.body.classList.contains('sidebar-rail') && window.innerWidth < RAIL_BREAKPOINT) {
          document.body.classList.add('sidebar-rail');
        } else if (window.innerWidth >= RAIL_BREAKPOINT) {
          document.body.classList.remove('sidebar-rail');
        }
        updateSidebarRail();
        return;
      }
      const open = document.getElementById('posSidebar')?.classList.contains('open');
      if (open) closeSidebar();
      else openSidebar();
    });
    
    document.getElementById('btnSidebarPin')?.addEventListener('click', toggleSidebarPin);
    window.addEventListener('resize', updateSidebarRail);
    if (localStorage.getItem(PIN_KEY) === '1') {
      setSidebarPinned(true);
    } else {
      updatePinButton();
    }
    
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeSidebar);
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSidebar();
        window.posModes.sale.closeCheckoutModal?.();
        document.getElementById('notePopover')?.classList.add('hidden');
        document.getElementById('discountModal')?.classList.add('hidden');
        window.posDiscountModal?.close?.();
        if(resetModal) window.ui.closeModal(resetModal); 
      }
    });
    
    document.getElementById('orderSearch')?.addEventListener('input', (e) => {
      productSearch = e.target.value.trim();
      renderProducts();
    });
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderProducts();
    });
    document.querySelectorAll('.pos-nav__item[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
      });
    });

    const settings = await window.posApi.fetchSettings();
    const forceDark = settings.force_dark_mode;
    
    currentForceOrderPinned = settings.force_order_pinned || '';
    currentProductClickAction = settings.product_click_action || 'focus';

    if (currentForceOrderPinned === 'true') {
      isOrderPinned = true;
    } else if (currentForceOrderPinned === 'false') {
      isOrderPinned = false;
    } else {
      isOrderPinned = localStorage.getItem(ORDER_PIN_KEY) !== '0';
    }
    updateOrderPinUI();

    if (forceDark === 'true') {
      document.body.classList.add('dark');
      document.getElementById('darkToggle')?.classList.add('on');
    } else if (forceDark === 'false') {
      document.body.classList.remove('dark');
      document.getElementById('darkToggle')?.classList.remove('on');
    } else if (localStorage.getItem('pos_dark') === '1') {
      document.body.classList.add('dark');
      document.getElementById('darkToggle')?.classList.add('on');
    }
    
    document.getElementById('darkToggle')?.addEventListener('click', () => {
      if (forceDark === 'true' || forceDark === 'false') {
        window.ui.toast('管理員已強制鎖定主題色彩，無法切換', 'error');
        return;
      }
      document.body.classList.toggle('dark');
      const on = document.body.classList.contains('dark');
      document.getElementById('darkToggle').classList.toggle('on', on);
      localStorage.setItem('pos_dark', on ? '1' : '0');
    });
    
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem(STAFF_KEY);
        closeSidebar();
        window.location.reload(); 
      });
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
    sel.innerHTML = staff.map((s) => `<option value="${s.id}">${s.display_name} ${roleLabel(s.role)}</option>`).join('');
    
    window.ui.openModal(modal);
  }

  async function doLogin() {
    const id = Number(document.getElementById('loginStaff').value);
    const pin = document.getElementById('loginPin').value;
    const row = await window.posApi.verifyStaff(id, pin);
    if (!row) {
      window.ui.toast('PIN 碼錯誤', 'error');
      return;
    }
    
    const settings = await window.posApi.fetchSettings();
    const defaultPayment = settings.default_payment || '現金';
    const fieldPayment = document.getElementById('fieldPayment');
    if (fieldPayment) {
      fieldPayment.value = defaultPayment;
    }

    const forceDark = settings.force_dark_mode;

    currentForceOrderPinned = settings.force_order_pinned || '';
    currentProductClickAction = settings.product_click_action || 'focus';

    if (settings.maintenance_mode === 'true' && row.role !== 'ADMIN') {
      window.ui.toast('系統維護中 (僅限 ADMIN 登入)', 'error');
      return; 
    }
    
    setStaff(row);
    window.ui.closeModal(document.getElementById('loginModal'));
    window.ui.toast(`登入成功！歡迎回來 ${row.display_name}`, 'success');
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnLogin')?.addEventListener('click', doLogin);
    init();
    document.getElementById('loginPin')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
      e.preventDefault();
      doLogin();
      }
    });
  });

  window.posApp = {
    setMode, getStaff, ctx, openSidebar, closeSidebar, roleLabel,
    toggleSidebarPin, setSidebarPinned, isSidebarPinned,
  };
})(); 