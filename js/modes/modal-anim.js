(function () {
  // 共用：開啟彈窗動畫
  function openModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('is-leaving');
    modalElement.classList.add('active');
    modalElement.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => modalElement.classList.add('is-anim-in'));
    });
  }

  // 共用：關閉彈窗動畫 (支援回呼函數 callback)
  function closeModal(modalElement, callback) {
    if (!modalElement || !modalElement.classList.contains('active')) {
      if (typeof callback === 'function') callback();
      return;
    }
    modalElement.classList.remove('is-anim-in');
    modalElement.classList.add('is-leaving');
    
    // 等待 240ms 讓 CSS 縮放與淡出動畫播完，再正式隱藏
    setTimeout(() => {
      modalElement.classList.remove('active', 'is-leaving');
      modalElement.setAttribute('aria-hidden', 'true');
      if (typeof callback === 'function') callback();
    }, 240); 
  }

  // 註冊到全域 UI 工具中
  window.ui = window.ui || {};
  window.ui.openModal = openModal;
  window.ui.closeModal = closeModal;
})();