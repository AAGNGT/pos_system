(function () {
  const DISPLAY_ID = 1;
  let channel = null;
  let storeName = 'POS 商店';

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
      const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart 緩動函數
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
    // 正確處理負數顯示，如 -$20
    return `${val < 0 ? '-' : ''}$${absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(2)}`;
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

  function setView(phase) {
    document.querySelectorAll('.cdisp-view').forEach((v) => {
      v.classList.toggle('active', v.dataset.view === phase);
    });
    const status = document.getElementById('displayStatus');
    if (status) {
      const labels = { idle: '待機', cart: '購物中', checkout: '請付款', thankyou: '多謝惠顧' };
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
      list.innerHTML = items.map((i, index) => {
        const imgSrc = thumb?.thumbSrc?.(i, productCatalog) || thumb?.svgPlaceholder?.(i.name) || '';
        const fallback = thumb?.svgPlaceholder?.(i.name) || '';
        const delay = index * 0.05;
        
        return `
        <div class="cdisp-cart__item" style="animation-delay: ${delay}s">
          <img class="cdisp-cart__thumb" src="${safeImgAttr(imgSrc)}" data-fallback="${safeImgAttr(fallback)}" alt="${escapeHtml(i.name)}" loading="lazy">
          <div class="cdisp-cart__info">
            <p class="cdisp-cart__name">${escapeHtml(i.name)}</p>
            <p class="cdisp-cart__meta">${escapeHtml(i.code || '')} × ${i.qty} @ ${formatMoney(i.unit_price)}</p>
          </div>
          <span class="cdisp-cart__line-total">${formatMoney(i.line_total)}</span>
        </div>
      `;
      }).join('');
      list.querySelectorAll('.cdisp-cart__thumb').forEach((img) => {
        img.addEventListener('error', () => {
          const fb = img.dataset.fallback;
          if (fb && img.src !== fb) img.src = fb;
        }, { once: true });
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

  let qrCodeInstance = null; // 在最外層宣告一個變數存放 QR 實例

  function renderThankYou(state) {
    const total = document.getElementById('thankTotal');
    const received = document.getElementById('thankReceived');
    const change = document.getElementById('thankChange');
    
    if (total) animateValue(total, state.total, formatMoney);
    if (received) animateValue(received, state.amount_received, formatMoney);
    if (change) animateValue(change, state.change_amount, formatMoney);

    // 處理 QR Code 顯示
    const orderCodeEl = document.getElementById('displayOrderCode');
    const qrContainer = document.getElementById('qrcode');
    
    if (state.order_code && qrContainer) {
      if (orderCodeEl) orderCodeEl.textContent = `單號: ${state.order_code}`;
      
      // 拼接對應的 track.html 網址
      const receiptUrl = `https://hkrss.dpdns.org/track.html?id=${state.order_code}`;
      
      // 清空舊的 QR Code
      qrContainer.innerHTML = ''; 
      
      // 生成新的 QR Code
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

  // -------------------------------------------------------------------------
  // 新增：宣傳輪播相關邏輯與數據
  // -------------------------------------------------------------------------
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

    // 重置動畫類別
    promoImage.classList.remove('animate-slide-in-left');
    promoTitle.parentElement.classList.remove('animate-slide-in-right');
    
    void promoImage.offsetWidth; // 觸發 reflow，確保每次切換都有滑入動畫
    
    promoImage.src = item.img;
    promoTitle.textContent = item.title;
    promoDesc.textContent = item.desc;
    
    // 套用動畫
    promoImage.classList.add('animate-slide-in-left');
    promoTitle.parentElement.classList.add('animate-slide-in-right');
  }

  function startPromoSlider() {
    if (promoInterval) return;
    renderPromo();
    promoInterval = setInterval(() => {
      currentIdx = (currentIdx + 1) % promoData.length;
      renderPromo();
    }, 6000); // 預設 6 秒切換一次
  }

  function stopPromoSlider() {
    if (promoInterval) {
      clearInterval(promoInterval);
      promoInterval = null;
    }
    currentIdx = 0;
  }

  // --------------------------------------------------------
  // 修改：主渲染函數 (結合宣傳判斷)
  // --------------------------------------------------------

  function render(state) {
    if (!state) return;
    const phase = state.phase || 'idle';
    setView(phase);

    // 【新增】：處理宣傳輪播畫面的切換
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

  async function loadProductCatalog(client) {
    try {
      const { data, error } = await client
        .from('pos_products')
        .select('id, code, name, image_url')
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
        
        // 1. 設定商店名稱
        if (settings.store_name) {
          storeName = settings.store_name;
          const el = document.getElementById('storeName');
          if (el) el.textContent = storeName;
        }
        
        // 2. 套用顯示屏風格 (若為 nature，則加上 class)
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
      // 1. 原有的：監聽購物車狀態變化
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_display_state', filter: `id=eq.${DISPLAY_ID}` },
        (payload) => {
          render(payload.new || payload.old);
        }
      )
      // 2. 新增的：監聽系統設定 (pos_settings) 變化
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_settings' },
        (payload) => {
          const row = payload.new;
          if (row) {
            // 如果更改了顯示風格
            if (row.key === 'display_theme') {
              if (row.value === 'nature') {
                document.body.classList.add('theme-nature');
              } else {
                document.body.classList.remove('theme-nature');
              }
            }
            // 順便讓「商店名稱」也能即時更新！
            else if (row.key === 'store_name') {
              storeName = row.value;
              const el = document.getElementById('storeName');
              if (el) el.textContent = storeName;
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