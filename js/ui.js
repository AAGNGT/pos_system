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
    el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">×</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    stack.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 3200);
  }

  function setLoading(active, title = '載入中') {
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

  window.ui = { toast, setLoading, escapeHtml };
})();
