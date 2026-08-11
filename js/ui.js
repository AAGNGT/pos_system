(function () {
  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toast(message, type = 'info') {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `pos-toast pos-toast--${type}`;
    el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">✖</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 3200);
  }

  function setLoading(active, title = '載入中...') {
    let overlay = document.getElementById('posLoadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'posLoadingOverlay';
      overlay.className = 'pos-loading';
      overlay.innerHTML = '<div class="pos-loading__card"><div class="pos-loading__spinner"></div><p id="posLoadingTitle"></p></div>';
      document.body.appendChild(overlay);
    }
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
    const t = overlay.querySelector('#posLoadingTitle');
    if (t) t.textContent = title;
    overlay.classList.toggle('active', !!active);
    overlay.style.zIndex = '10000';
  }

  // ==========================================
  // 🌟 全域共用的 Modal 動畫開關功能
  // ==========================================
  function openModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('is-leaving');
    modalElement.classList.add('active');
    modalElement.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => modalElement.classList.add('is-anim-in'));
    });
  }

  function closeModal(modalElement, callback) {
    // 防呆：如果已經關閉，就不重複執行
    if (!modalElement || !modalElement.classList.contains('active')) {
      if (typeof callback === 'function') callback();
      return;
    }
    
    modalElement.classList.remove('is-anim-in');
    modalElement.classList.add('is-leaving');
    
    // 等待 240ms 讓 CSS 縮放與淡出動畫播完後，再從畫面上徹底隱藏
    setTimeout(() => {
      modalElement.classList.remove('active', 'is-leaving');
      modalElement.setAttribute('aria-hidden', 'true');
      if (typeof callback === 'function') callback();
    }, 240); 
  }

  // ==========================================
  // 🌟 終極優化：全域監聽「點擊背景關閉視窗」
  // ==========================================
  document.addEventListener('click', (e) => {
    // e.target 會精準抓到滑鼠點擊的最上層元素
    // 如果點擊的剛好是帶有 'pos-modal' 的最外層半透明黑色背景
    if (e.target.classList.contains('pos-modal') && e.target.classList.contains('active')) {
      
      // 防止強制登入視窗被意外關閉 (如果需要的話，可以保留這層防護)
      if (e.target.id === 'loginModal') return; 

      closeModal(e.target);
    }
  });

  // 匯出到 window.ui 給全域使用
  window.ui = { toast, setLoading, escapeHtml, openModal, closeModal };
})();