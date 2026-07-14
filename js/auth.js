/**
 * 卍物所 — Supabase Auth（Google OAuth + Email）
 * 包含：LocalStorage 零延遲加載 (Optimistic UI) 解決方案
 */
(function () {
    'use strict';

    let authListeners = [];

    function getClient() {
        if (typeof getSupabaseClient === 'function') {
            return getSupabaseClient();
        }
        return null;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function displayLabel(user) {
        if (!user) return '';
        const meta = user.user_metadata || {};
        return meta.display_name || meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : '用戶');
    }

    // ✨ 核心修改：更新 Header 時，同步管理 LocalStorage
    function updateHeader(session) {
        const el = document.getElementById('headerAuth');
        if (!el) return;

        if (session && session.user) {
            const name = displayLabel(session.user);
            // 寫入快取，供下次秒速載入
            localStorage.setItem('session_username', name); 
            el.innerHTML = `<a href="account.html" class="header-auth-link">${escapeHtml(name)}</a>`;
        } else {
            // 如果驗證失敗或未登入，強制清除假數據，確保安全
            localStorage.removeItem('session_username'); 
            el.innerHTML = `<button type="button" class="header-auth-btn" id="openAuthBtn">登入</button>`;
            const btn = document.getElementById('openAuthBtn');
            if (btn) btn.addEventListener('click', function () { openAuthModal('login'); });
        }
    }

    function notifyListeners(session) {
        authListeners.forEach(function (fn) { fn(session); });
    }

    async function getSession() {
        const client = getClient();
        if (!client) return null;
        const { data } = await client.auth.getSession();
        
        // ✨ 安全核實：如果 Supabase 話無登入，但本地有假資料，即刻清走佢
        if (!data.session) {
            localStorage.removeItem('session_username');
        }
        return data.session || null;
    }

    function isAuthCallback() {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        return hash.includes('access_token') || search.includes('code=');
    }

    async function requireAuth(redirectUrl) {
        let session = await getSession();
        if (!session && isAuthCallback()) {
            await new Promise(function (r) { setTimeout(r, 600); });
            session = await getSession();
        }
        if (!session) {
            localStorage.removeItem('session_username'); // 保險清除
            const dest = redirectUrl || 'index.html?auth=login';
            window.location.href = dest;
            return null;
        }
        await ensureProfile(session.user);
        return session;
    }

    function onAuthStateChange(fn) {
        authListeners.push(fn);
    }

    function getRedirectUrl() {
        const path = window.location.pathname.replace(/[^/]+$/, '');
        return window.location.origin + path + 'account.html';
    }

    async function signUpWithEmail(email, password, displayName) {
        const client = getClient();
        if (!client) throw new Error('無法連線至認證服務');

        const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { display_name: displayName || '' }
            }
        });
        if (error) throw error;

        if (data.user && data.session) {
            await ensureProfile(data.user);
        }
        return data;
    }

    async function signInWithEmail(email, password) {
        const client = getClient();
        if (!client) throw new Error('無法連線至認證服務');

        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });
        if (error) throw error;
        return data;
    }

    async function signInWithGoogle() {
        const client = getClient();
        if (!client) throw new Error('無法連線至認證服務');

        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: getRedirectUrl() }
        });
        if (error) throw error;
    }

    async function resetPassword(email) {
        const client = getClient();
        if (!client) throw new Error('無法連線至認證服務');

        const path = window.location.pathname.replace(/[^/]+$/, '');
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + path + 'account.html'
        });
        if (error) throw error;
    }

    // ✨ 核心修改：確保登出時資料乾淨，並跳轉回首頁
    async function signOut() {
        const client = getClient();
        if (!client) return;
        
        // 1. 即刻剷走本地名稱緩存
        localStorage.removeItem('session_username'); 
        
        // 2. 請求後端徹底登出
        await client.auth.signOut();
        
        // 3. 強制刷新並跳轉到首頁，確保帳戶頁面無法被 Back 鍵惡意回看
        window.location.replace('index.html');
    }

    async function ensureProfile(user) {
        const client = getClient();
        if (!client || !user) return;

        const { data: existing } = await client
            .from('wanwu_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

        if (existing) return;

        const meta = user.user_metadata || {};
        await client.from('wanwu_profiles').insert({
            id: user.id,
            display_name: meta.display_name || meta.full_name || meta.name || user.email.split('@')[0],
            avatar_url: meta.avatar_url || meta.picture || null
        });
    }

    async function getProfile(userId) {
        const client = getClient();
        if (!client) return null;

        const { data, error } = await client
            .from('wanwu_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.warn('[卍物所] profile 讀取失敗', error);
            return null;
        }
        return data;
    }

    async function updateProfile(userId, fields) {
        const client = getClient();
        if (!client) throw new Error('無法連線至資料庫');

        const { data, error } = await client
            .from('wanwu_profiles')
            .update({
                display_name: fields.display_name,
                phone: fields.phone || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        
        // 若用戶改名，同步更新 LocalStorage
        if (data && data.display_name) {
            localStorage.setItem('session_username', data.display_name);
            updateHeader(await getSession()); 
        }
        
        return data;
    }

    async function getMyReservations() {
        const client = getClient();
        if (!client) return [];

        const { data, error } = await client
            .from('wanwu_market_reservations')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[卍物所] 預訂讀取失敗', error);
            return [];
        }
        return data || [];
    }

    const MARKET_DATES = [
        { value: '2026-08-22', label: '8 月 22 日', day: '週六' },
        { value: '2026-08-23', label: '8 月 23 日', day: '週日' },
        { value: '2026-09-12', label: '9 月 12 日', day: '週六' },
        { value: '2026-09-13', label: '9 月 13 日', day: '週日' }
    ];

    async function fetchOrderProducts() {
        const client = getClient();
        if (!client) return [];

        const { data, error } = await client
            .from('wanwu_products')
            .select('id, name, price')
            .eq('is_available', true)
            .order('sort_order', { ascending: true });

        if (error) {
            console.warn('[卍物所] 產品讀取失敗', error);
            return [];
        }
        return data || [];
    }

    async function createOrder(order) {
        const client = getClient();
        if (!client) throw new Error('無法連線至資料庫');

        const session = await getSession();
        if (!session || !session.user) throw new Error('請先登入');

        const { data, error } = await client
            .from('wanwu_orders')
            .insert({
                user_id: session.user.id,
                product_id: order.product_id || null,
                product_name: order.product_name,
                quantity: order.quantity,
                unit_price: order.unit_price,
                pickup_date: order.pickup_date,
                notes: order.notes || null
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async function getMyOrders() {
        const client = getClient();
        if (!client) return [];

        const { data, error } = await client
            .from('wanwu_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[卍物所] 訂單讀取失敗', error);
            return [];
        }
        return data || [];
    }

    function showAuthFeedback(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = 'form-feedback show ' + type;
    }

    function setAuthTab(tab) {
        const loginPanel = document.getElementById('authLoginPanel');
        const registerPanel = document.getElementById('authRegisterPanel');
        const tabs = document.querySelectorAll('.auth-tab');
        if (!loginPanel || !registerPanel) return;

        const isLogin = tab === 'login';
        loginPanel.hidden = !isLogin;
        registerPanel.hidden = isLogin;
        tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === tab);
            t.setAttribute('aria-selected', t.dataset.tab === tab ? 'true' : 'false');
        });
    }

    function openAuthModal(tab) {
        const overlay = document.getElementById('authModal');
        
        // 【修復 1】：如果該頁面（例如私隱權頁）沒有登入視窗的 HTML，自動跳轉去主頁並呼叫視窗
        if (!overlay) {
            window.location.href = 'index.html?auth=login';
            return;
        }

        setAuthTab(tab || 'login');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }


    function closeAuthModal() {
        const overlay = document.getElementById('authModal');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function setupAuthModal() {
        const overlay = document.getElementById('authModal');
        if (!overlay) return;

        const closeBtn = document.getElementById('authModalClose');
        if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeAuthModal();
        });

        document.querySelectorAll('.auth-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                setAuthTab(tab.dataset.tab);
            });
        });

        const googleBtns = document.querySelectorAll('[data-auth-google]');
        googleBtns.forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const fb = document.getElementById('authFeedback');
                try {
                    showAuthFeedback(fb, '正在導向 Google…', 'success');
                    await signInWithGoogle();
                } catch (err) {
                    showAuthFeedback(fb, err.message || 'Google 登入失敗', 'error');
                }
            });
        });

        const loginForm = document.getElementById('authLoginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('authFeedback');
                const btn = loginForm.querySelector('button[type="submit"]');
                btn.disabled = true;
                try {
                    await signInWithEmail(
                        loginForm.email.value.trim(),
                        loginForm.password.value
                    );
                    showAuthFeedback(fb, '登入成功', 'success');
                    closeAuthModal();
                    window.location.href = 'account.html';
                } catch (err) {
                    showAuthFeedback(fb, err.message || '登入失敗', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        const registerForm = document.getElementById('authRegisterForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('authFeedback');
                const btn = registerForm.querySelector('button[type="submit"]');

                if (!registerForm.agree.checked) {
                    showAuthFeedback(fb, '請先同意私隱權政策及數據安全聲明', 'error');
                    return;
                }
                if (registerForm.password.value !== registerForm.password_confirm.value) {
                    showAuthFeedback(fb, '兩次輸入的密碼不一致', 'error');
                    return;
                }

                btn.disabled = true;
                try {
                    const result = await signUpWithEmail(
                        registerForm.email.value.trim(),
                        registerForm.password.value,
                        registerForm.display_name.value.trim()
                    );
                    if (result.session) {
                        showAuthFeedback(fb, '註冊成功', 'success');
                        closeAuthModal();
                        window.location.href = 'account.html';
                    } else {
                        showAuthFeedback(fb, '註冊成功，請查收確認電郵後登入', 'success');
                    }
                } catch (err) {
                    showAuthFeedback(fb, err.message || '註冊失敗', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        const forgotLink = document.getElementById('authForgotLink');
        if (forgotLink) {
            forgotLink.addEventListener('click', async function (e) {
                e.preventDefault();
                const fb = document.getElementById('authFeedback');
                const loginForm = document.getElementById('authLoginForm');
                const email = loginForm ? loginForm.email.value.trim() : '';
                if (!email) {
                    showAuthFeedback(fb, '請先輸入電郵地址', 'error');
                    return;
                }
                try {
                    await resetPassword(email);
                    showAuthFeedback(fb, '重設密碼連結已發送至您的電郵', 'success');
                } catch (err) {
                    showAuthFeedback(fb, err.message || '發送失敗', 'error');
                }
            });
        }
    }

    function setupMobileNav() {
        const toggle = document.querySelector('.nav-toggle');
        const nav = document.querySelector('.nav-links');
        if (!toggle || !nav) return;

        toggle.addEventListener('click', function () {
            nav.classList.toggle('open');
        });
        nav.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { nav.classList.remove('open'); });
        });
    }

        function initAuth() {
        setupMobileNav();
        setupHeaderScroll();
        setupAuthModal();

        const client = getClient();
        if (!client) {
            console.warn('[卍物所] 請填寫 Supabase 參數');
            updateHeader(null);
            return;
        }

        // 監聽後端 Auth 狀態改變
        client.auth.onAuthStateChange(async function (event, session) {
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem('session_username');
            }
            if (session && session.user) {
                await ensureProfile(session.user);
            }
            updateHeader(session);
            notifyListeners(session);
        });

        // 啟動時向後端拿 Session 覆核
        getSession().then(function (session) {
            updateHeader(session);
        });

        // 【修復 2】：檢查網址是否有 ?auth=login，打開視窗後 1 秒清除網址尾巴
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'login') {
            openAuthModal('login');
            
            setTimeout(function() {
                // 利用 History API 清除參數，畫面不會閃爍或重新載入
                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
            }, 1000);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeAuthModal();
        });
    }


    function setupHeaderScroll() {
        const header = document.querySelector('.site-header');
        if (!header || header.classList.contains('scrolled')) return;
        window.addEventListener('scroll', function () {
            header.classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });
    }

    window.WanwuAuth = {
        getClient: getClient,
        getSession: getSession,
        requireAuth: requireAuth,
        onAuthStateChange: onAuthStateChange,
        signUpWithEmail: signUpWithEmail,
        signInWithEmail: signInWithEmail,
        signInWithGoogle: signInWithGoogle,
        resetPassword: resetPassword,
        signOut: signOut, // ✨ 已經升級
        ensureProfile: ensureProfile,
        getProfile: getProfile,
        updateProfile: updateProfile,
        getMyReservations: getMyReservations,
        fetchOrderProducts: fetchOrderProducts,
        createOrder: createOrder,
        getMyOrders: getMyOrders,
        MARKET_DATES: MARKET_DATES,
        openAuthModal: openAuthModal,
        closeAuthModal: closeAuthModal,
        displayLabel: displayLabel
    };

    document.addEventListener('DOMContentLoaded', initAuth);
})();

async function handleSecureAuth(actionType, email, password) {
    const token = await new Promise((resolve) => {
        grecaptcha.ready(function() {
            grecaptcha.execute('6LfioU8tAAAAAK4aGAkpu2RDA9nSQO-xVCDUsqJI', {action: 'submit'})
                .then(function(token) { resolve(token); });
        });
    });

    const response = await fetch('https://ysohdkbkhnsyowvzdlvn.supabase.co/functions/v1/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    
    const verification = await response.json();

    if (!verification.success) {
        throw new Error('機器人驗證失敗，請重新嘗試。');
    }

    const client = window.WanwuAuth.getClient();
    if (actionType === 'signup') {
        return await client.auth.signUp({ email, password });
    } else {
        return await client.auth.signInWithPassword({ email, password });
    }
}
