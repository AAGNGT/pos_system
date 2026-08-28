(function () {
  const DISPLAY_ID = 1;
  let channel = null;
  let storeName = 'POS 商店';
  let displayCartLayout = 'default';
  let categoryMap = {}; // 儲存分類資料的字典

  const tickerVals = new WeakMap();
  function animateValue(el, endVal, formatFn, duration = 450) {
    if (!el) return;
    const startVal = tickerVals.get(el) || 0;
    if (startVal === endVal) {
      el.textContent = formatFn(endVal);
      return;
    }
    tickerVals.set(el, endVal);
    const startTime = performance.now();
    const step = (currentTime) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4); 
      const current = startVal + (endVal - startVal) * ease;
      el.textContent = formatFn(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = formatFn(endVal);
      }
    };
    requestAnimationFrame(step);
  }

  function formatMoney(n) {
    const val = Number(n) || 0;
    const absVal = Math.abs(val);
    return `${val < 0 ? '-' : ''}$${absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(2)}`;
  }

  function showImageEnlargeOverlay(src, titleText) {
    let overlay = document.getElementById('displayImageOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'displayImageOverlay';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: '9999', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', opacity: '0',
        transition: 'opacity 0.3s ease', cursor: 'zoom-out', backdropFilter: 'blur(8px)'
      });

      const img = document.createElement('img');
      img.id = 'displayOverlayImg';
      Object.assign(img.style, {
        maxWidth: '85%', maxHeight: '75%', objectFit: 'contain',
        borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        transform: 'scale(0.9)', transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
      });

      const title = document.createElement('p');
      title.id = 'displayOverlayTitle';
      Object.assign(title.style, {
        color: '#fff', fontSize: '2.5rem', marginTop: '24px', fontWeight: 'bold',
        textShadow: '0 4px 12px rgba(0,0,0,0.6)', fontFamily: 'var(--font-heading)'
      });

      overlay.appendChild(img);
      overlay.appendChild(title);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', () => {
        overlay.style.opacity = '0';
        img.style.transform = 'scale(0.9)';
        setTimeout(() => overlay.style.display = 'none', 300);
      });
    }

    document.getElementById('displayOverlayImg').src = src;
    document.getElementById('displayOverlayTitle').textContent = titleText;
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    overlay.style.opacity = '1';
    document.getElementById('displayOverlayImg').style.transform = 'scale(1)';
  }

  function formatDiscountMoney(n) {
    const v = Math.max(0, Number(n) || 0);
    if (!v) return '';
    const s = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
    return `-$${s}`;
  }

  let errorSeq = 0;
  const errorIds = new Set();
  let productCatalog = [];

  function dismissError(id) {
    const root = document.getElementById('displayErrors');
    const item = root?.querySelector(`[data-error-id="${id}"]`);
    if (item) item.remove();
    errorIds.delete(id);
    if (root && !root.children.length) root.classList.remove('show');
  }

  function showError(msg) {
    const root = document.getElementById('displayErrors');
    if (!root) return;
    const id = `err-${++errorSeq}`;
    errorIds.add(id);
    const item = document.createElement('div');
    item.className = 'cdisp__error-item';
    item.dataset.errorId = id;
    item.innerHTML = `
      <span class="cdisp__error-msg">${escapeHtml(msg)}</span>
      <button type="button" class="cdisp__error-dismiss" aria-label="關閉通知">×</button>
    `;
    item.querySelector('.cdisp__error-dismiss')?.addEventListener('click', () => dismissError(id));
    root.appendChild(item);
    root.classList.add('show');
  }

  let currentDisplayPhase = 'idle';

  function closeImageEnlargeOverlay() {
    const overlay = document.getElementById('displayImageOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.style.opacity = '0';
    }
  }

  function setView(phase) {
    if (currentDisplayPhase !== phase) {
      currentDisplayPhase = phase;
      closeImageEnlargeOverlay();
    }
    document.querySelectorAll('.cdisp-view').forEach((v) => {
      v.classList.toggle('active', v.dataset.view === phase);
    });
    const status = document.getElementById('displayStatus');
    if (status) {
      const labels = { idle: '歡迎光臨', cart: '購物中', checkout: '結帳處理中', thankyou: '交易完成' };
      status.textContent = labels[phase] || phase;
    }
  }

  function renderCart(state) {
    const list = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');
    const items = Array.isArray(state.items) ? state.items : [];
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '<p style="text-align:center;color:#64748b;font-size:1.2rem">尚無商品</p>';
    } else {
      const thumb = window.posProductThumb;

      const generateItemHtml = (i, delay) => {
        const imgSrc = thumb?.thumbSrc?.(i, productCatalog) || thumb?.svgPlaceholder?.(i.name) || '';
        const fallback = thumb?.svgPlaceholder?.(i.name) || '';

        let priceSectionHtml = '';
        if (Number(i.unit_price) !== 0 || Number(i.line_total) !== 0) {
          const isNegative = Number(i.line_total) < 0;
          const totalColorStyle = isNegative ? 'color: #ef4444 !important; font-weight: 900; text-shadow: 0 0 10px rgba(239, 68, 68, 0.4);' : '';
          const unitPriceColor = isNegative ? 'color: #ef4444 !important;' : '';

          priceSectionHtml = `
            <div style="display: flex; align-items: center; gap: 16px; margin-left: auto;">
              <div style="background: var(--c-logo-bg); border: 1px solid var(--c-border-line); border-radius: 8px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                <p class="cdisp-cart__meta" style="margin: 0; font-size: clamp(0.95rem, 1.5vw, 1.15rem); color: var(--c-text-sub); font-weight: 600; letter-spacing: 0.05em;">
                  ${i.qty} &times; <span style="${unitPriceColor}">${formatMoney(i.unit_price)}</span>
                </p>
              </div>
              <span class="cdisp-cart__line-total" style="margin: 0; ${totalColorStyle}">${formatMoney(i.line_total)}</span>
            </div>
          `;
        } else {
          priceSectionHtml = `
            <div style="display: flex; align-items: center; gap: 16px; margin-left: auto;">
              <div style="background: var(--c-logo-bg); border: 1px solid var(--c-border-line); border-radius: 8px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                <p class="cdisp-cart__meta" style="margin: 0; font-size: clamp(0.95rem, 1.5vw, 1.15rem); color: var(--c-text-sub); font-weight: 600; letter-spacing: 0.05em;">
                  ${i.qty} 件
                </p>
              </div>
            </div>
          `;
        }

        return `
        <div class="cdisp-cart__item" style="animation-delay: ${delay}s;">
          <img class="cdisp-cart__thumb" src="${safeImgAttr(imgSrc)}" data-fallback="${safeImgAttr(fallback)}" alt="${escapeHtml(i.name)}" loading="lazy" style="cursor: zoom-in; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          <div class="cdisp-cart__info">
            <p class="cdisp-cart__name">${escapeHtml(i.name)}</p>
            <p class="cdisp-cart__meta">${escapeHtml(i.code || '')}</p>
          </div>
          ${priceSectionHtml}
        </div>
        `;
      };

      if (displayCartLayout === 'grouped') {
        
        // 1. 初始化分類群組 (智慧歸類邏輯)
        const displayGroups = {};
        
        items.forEach(i => {
          const catalogItem = productCatalog.find(p => Number(p.id) === Number(i.product_id));
          const dbCategoryName = catalogItem && catalogItem.category_id ? (categoryMap[catalogItem.category_id] || '') : '';
          
          let groupName = '其他項目';
          let groupColor = '#64748b'; // 灰色 (預設/未分類/裝飾)

          // 智慧歸類判斷
          if (dbCategoryName.includes('擴香石') || dbCategoryName.includes('甜點') || dbCategoryName.includes('萌寵')) {
            groupName = '產品系列';
            groupColor = '#16a34a'; // 綠色
          } else if (dbCategoryName.includes('優惠') || dbCategoryName.includes('創業')) {
            groupName = '🌟創業優惠';
            groupColor = '#ef4444'; // 紅色
          }

          if (!displayGroups[groupName]) {
            displayGroups[groupName] = { color: groupColor, items: [] };
          }
          displayGroups[groupName].items.push(i);
        });

        let html = '';
        let globalIndex = 0;

        // 2. 指定畫面上的顯示順序
        const renderOrder = ['產品系列', '🌟創業優惠', '其他項目'];

        renderOrder.forEach(gName => {
          if (displayGroups[gName] && displayGroups[gName].items.length > 0) {
            const catColor = displayGroups[gName].color;
            html += `
              <div style="margin-top: 16px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid ${catColor}; display: flex; align-items: center; gap: 8px; animation: cdispFadeIn 0.3s ease;">
                <span style="width: 14px; height: 14px; border-radius: 50%; background: ${catColor}; box-shadow: 0 0 8px ${catColor}66;"></span>
                <h3 style="margin: 0; font-size: 1.25rem; color: ${catColor}; font-weight: 700; letter-spacing: 0.05em; font-family: var(--font-heading);">${gName}</h3>
              </div>
            `;
            displayGroups[gName].items.forEach(i => {
              html += generateItemHtml(i, globalIndex * 0.05);
              globalIndex++;
            });
          }
        });

        list.innerHTML = html;

      } else {
        list.innerHTML = items.map((i, index) => generateItemHtml(i, index * 0.05)).join('');
      }

      list.querySelectorAll('.cdisp-cart__thumb').forEach((img) => {
        img.addEventListener('error', () => {
          const fb = img.dataset.fallback;
          if (fb && img.src !== fb) img.src = fb;
        }, { once: true });
        
        img.addEventListener('click', () => {
          showImageEnlargeOverlay(img.src, img.alt);
        });
      });
    }

    const discount = Math.max(0, Number(state.discount) || 0);
    const discountWrap = document.getElementById('cartDiscountWrap');
    const discountEl = document.getElementById('cartDiscount');
    const footerRow = document.getElementById('cartFooterRow');
    if (discount > 0) {
      discountWrap?.classList.remove('hidden');
      footerRow?.classList.remove('cdisp-cart__footer-row--single');
      if (discountEl) animateValue(discountEl, discount, formatDiscountMoney);
    } else {
      discountWrap?.classList.add('hidden');
      footerRow?.classList.add('cdisp-cart__footer-row--single');
    }
    if (totalEl) animateValue(totalEl, state.total, formatMoney);
  }

  function renderCheckout(state) {
    const el = document.getElementById('checkoutAmount');
    if (el) animateValue(el, state.total, formatMoney);
  }

  let qrCodeInstance = null; 

  function renderThankYou(state) {
    const total = document.getElementById('thankTotal');
    const received = document.getElementById('thankReceived');
    const change = document.getElementById('thankChange');
    
    if (total) animateValue(total, state.total, formatMoney);
    if (received) animateValue(received, state.amount_received, formatMoney);
    if (change) animateValue(change, state.change_amount, formatMoney);

    const orderCodeEl = document.getElementById('displayOrderCode');
    const qrContainer = document.getElementById('qrcode');
    
    if (state.order_code && qrContainer) {
      if (orderCodeEl) orderCodeEl.textContent = `單號: ${state.order_code}`;
      
      const receiptUrl = `https://hkrss.dpdns.org/track.html?id=${state.order_code}`;
      
      qrContainer.innerHTML = ''; 
      
      qrCodeInstance = new QRCode(qrContainer, {
        text: receiptUrl,
        width: 210,
        height: 210,
        colorDark: "#1d1d1f",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  const promoData = [
    { img: 'https://dryvaibjsetigszkzxuh.supabase.co/storage/v1/object/public/product/dis1.png', title: '在線落單・預訂', desc: '維園市集即場售賣預訂。為確保您在市集現場等候時間更短，放心選購心儀產品，體驗安心無憂的預訂服務。' },
    { img: 'https://dryvaibjsetigszkzxuh.supabase.co/storage/v1/object/public/product/dis2.png', title: '線上客服・數據安全', desc: '即時為您解答問題，貼心協助每一步。採用多重加密技術，嚴格保障您的個人隱私與資料安全。' },
    { img: 'https://dryvaibjsetigszkzxuh.supabase.co/storage/v1/object/public/product/dis3.png', title: '訂單追蹤與管理', desc: '輕鬆管理個人帳戶資訊，全面掌握您的訂單與偏好。實時查看處理進度，讓購物過程更透明。' }
  ];
  let promoInterval = null;
  let currentIdx = 0;

  function renderPromo() {
    const item = promoData[currentIdx];
    const promoImage = document.getElementById('promoImage');
    const promoTitle = document.getElementById('promoTitle');
    const promoDesc = document.getElementById('promoDesc');

    if (!promoImage || !promoTitle || !promoDesc) return;

    promoImage.classList.remove('animate-slide-in-left');
    promoTitle.parentElement.classList.remove('animate-slide-in-right');
    
    void promoImage.offsetWidth; 
    
    promoImage.src = item.img;
    promoTitle.textContent = item.title;
    promoDesc.textContent = item.desc;
    
    promoImage.classList.add('animate-slide-in-left');
    promoTitle.parentElement.classList.add('animate-slide-in-right');
  }

  function startPromoSlider() {
    if (promoInterval) return;
    renderPromo();
    promoInterval = setInterval(() => {
      currentIdx = (currentIdx + 1) % promoData.length;
      renderPromo();
    }, 6000); 
  }

  function stopPromoSlider() {
    if (promoInterval) {
      clearInterval(promoInterval);
      promoInterval = null;
    }
    currentIdx = 0;
  }

  function render(state) {
    if (!state) return;
    const phase = state.phase || 'idle';
    setView(phase);

    const isPromoActive = state.is_promo_active === true;
    const normalScreen = document.getElementById('idleScreenNormal');
    const promoScreen = document.getElementById('idleScreenPromo');

    if (phase === 'idle' && isPromoActive) {
      if (normalScreen) normalScreen.classList.add('hidden');
      if (promoScreen) promoScreen.classList.remove('hidden');
      startPromoSlider();
    } else {
      if (normalScreen) normalScreen.classList.remove('hidden');
      if (promoScreen) promoScreen.classList.add('hidden');
      stopPromoSlider();
    }

    if (phase === 'cart') renderCart(state);
    if (phase === 'checkout') renderCheckout(state);
    if (phase === 'thankyou') renderThankYou(state);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function safeImgAttr(url) {
    const s = String(url || '');
    if (/^\s*javascript:/i.test(s)) return '';
    return s.replace(/"/g, '&quot;');
  }

  async function loadCategories(client) {
    try {
      const { data, error } = await client.from('pos_categories').select('id, name');
      if (!error && data) {
        data.forEach(c => categoryMap[c.id] = c.name);
      }
    } catch (_) {}
  }

  async function loadProductCatalog(client) {
    try {
      const { data, error } = await client
        .from('pos_products')
        .select('id, code, name, image_url, category_id')
        .eq('is_active', true);
      if (error) throw error;
      productCatalog = data || [];
    } catch (_) {
      productCatalog = [];
    }
  }

  async function loadSettings(client) {
    try {
      const { data } = await client.from('pos_settings').select('key, value');
      if (data) {
        const settings = {};
        data.forEach(r => { settings[r.key] = r.value; });
        
        if (settings.display_cart_layout) {
          displayCartLayout = settings.display_cart_layout;
        }

        if (settings.store_name) {
          storeName = settings.store_name;
          const el = document.getElementById('storeName');
          if (el) el.textContent = storeName;
        }
        
        if (settings.display_theme === 'nature') {
          document.body.classList.add('theme-nature');
        } else {
          document.body.classList.remove('theme-nature');
        }
      }
    } catch (_) { /* ignore */ }
  }

  async function loadInitial(client) {
    const { data, error } = await client
      .from('pos_display_state')
      .select('*')
      .eq('id', DISPLAY_ID)
      .maybeSingle();
    if (error) throw error;
    render(data || { phase: 'idle', items: [] });
  }

  function subscribeRealtime(client) {
    channel = client
      .channel('pos-display-main')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_display_state', filter: `id=eq.${DISPLAY_ID}` },
        (payload) => {
          render(payload.new || payload.old);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_settings' },
        (payload) => {
          const row = payload.new;
          if (row) {
            if (row.key === 'display_theme') {
              if (row.value === 'nature') {
                document.body.classList.add('theme-nature');
              } else {
                document.body.classList.remove('theme-nature');
              }
            }
            else if (row.key === 'store_name') {
              storeName = row.value;
              const el = document.getElementById('storeName');
              if (el) el.textContent = storeName;
            }
            else if (row.key === 'display_cart_layout') {
              displayCartLayout = row.value;
              window.location.reload(); 
            }
          }
        }
      )
      .subscribe((status) => {
        const el = document.getElementById('displayStatus');
        if (status === 'SUBSCRIBED' && el) {
          el.textContent = el.textContent || '連線中...';
        }
      });
  }

  async function init() {
    if (!window.posDb?.initSupabase?.()) {
      showError('無法連接 Supabase，請檢查 config.js');
      setView('idle');
      return;
    }
    const client = window.posDb.getClient();
    await loadSettings(client);
    await loadCategories(client);
    await loadProductCatalog(client);
    try {
      await loadInitial(client);
      subscribeRealtime(client);
    } catch (e) {
      showError(`載入失敗: ${e.message}`);
      setView('idle');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => {
    if (channel) channel.unsubscribe();
  });
})();