(function () {
  let client = null;

  function initSupabase() {
    if (typeof supabase === 'undefined' || typeof SUPABASE_CONFIG === 'undefined') {
      console.error('Supabase 尚未載入');
      return null;
    }
    client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    window.supabaseClient = client;
    window.isSupabaseConnected = true;
    return client;
  }

  function getClient() {
    if (!client) initSupabase();
    return client;
  }

  function ensureClient() {
    const c = getClient();
    if (!c && window.ui?.toast) window.ui.toast('無法初始化 Supabase，請重新載入頁面', 'error');
    return c;
  }

  window.posDb = { initSupabase, getClient, ensureClient };
})();
