(function () {
  function getField() {
    return document.getElementById('fieldDiscount');
  }
  function getDiscountValue() {
    return Math.max(0, Number(getField()?.value || 0));
  }
  function formatDiscountLabel(amount) {
    if (!amount) return '新增折扣';
    const s = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
    return `折扣 -$${s}`;
  }
  function setDiscountAmount(amount) {
    const field = getField();
    const value = Math.max(0, Number(amount) || 0);
    if (field) field.value = String(value);
    syncDiscountButton();
    if (typeof window.posOnDiscountApplied === 'function') {
      window.posOnDiscountApplied(value);
    }
    return value;
  }
  function syncDiscountButton() {
    const btn = document.getElementById('btnOpenDiscount');
    if (!btn) return;
    const amount = getDiscountValue();
    btn.textContent = formatDiscountLabel(amount);
    btn.classList.toggle('has-value', amount > 0);
  }
  function openDiscountModal() {
    const modal = document.getElementById('discountModal');
    const input = document.getElementById('discountInput');
    const errorMsg = document.getElementById('discountErrorMsg');
    const btnConfirm = document.getElementById('btnDiscountConfirm');
    
    if (!modal) return;
    const current = getDiscountValue();
    if (input) input.value = current ? String(current) : '';
    
    if (errorMsg) errorMsg.classList.add('hidden');
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.style.opacity = '1';
    }
    
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    input?.focus();
    input?.select();
  }
  function closeDiscountModal() {
    const modal = document.getElementById('discountModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  function applyDiscount() {
    const input = document.getElementById('discountInput');
    const raw = String(input?.value || '').trim();
    const amount = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    setDiscountAmount(amount);
    closeDiscountModal();
  }
  function clearDiscount() {
    const input = document.getElementById('discountInput');
    if (input) input.value = '';
    setDiscountAmount(0);
    closeDiscountModal();
  }
  function bindDiscountModal() {
    document.getElementById('btnOpenDiscount')?.addEventListener('click', openDiscountModal);
    document.getElementById('btnDiscountCancel')?.addEventListener('click', closeDiscountModal);
    document.getElementById('discountModalBackdrop')?.addEventListener('click', closeDiscountModal);
    document.getElementById('btnDiscountConfirm')?.addEventListener('click', applyDiscount);
    document.getElementById('btnDiscountClear')?.addEventListener('click', clearDiscount);
    
    const input = document.getElementById('discountInput');
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !document.getElementById('btnDiscountConfirm').disabled) {
        e.preventDefault();
        applyDiscount();
      }
    });
    
    // 實時監聽異常折扣
    input?.addEventListener('input', (e) => {
      const val = Math.max(0, Number(e.target.value) || 0);
      const subtotal = window.posCart.totals(0).subtotal;
      const errorMsg = document.getElementById('discountErrorMsg');
      const btnConfirm = document.getElementById('btnDiscountConfirm');

      if (val > subtotal) {
        if (errorMsg) {
          errorMsg.textContent = `錯誤：折扣金額不能大於小計 ($${subtotal.toFixed(2)})`;
          errorMsg.classList.remove('hidden');
        }
        if (btnConfirm) {
          btnConfirm.disabled = true;
          btnConfirm.style.opacity = '0.5';
        }
      } else {
        if (errorMsg) errorMsg.classList.add('hidden');
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.style.opacity = '1';
        }
      }
    });

    syncDiscountButton();
  }
  window.posDiscountModal = {
    bind: bindDiscountModal,
    syncButton: syncDiscountButton,
    getValue: getDiscountValue,
    close: closeDiscountModal,
  };
})();