/**
 * 卍物所 — Supabase Auth（Google OAuth + Email）
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

    function updateHeader(session) {
        const el = document.getElementById('headerAuth');
        if (!el) return;

        if (session && session.user) {
            const name = displayLabel(session.user);
            el.innerHTML = `
                <a href="account.html" class="header-auth-link">${escapeHtml(name)}</a>`;
        } else {
            el.innerHTML = `
                <button type="button" class="header-auth-btn" id="openAuthBtn">登入</button>`;
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

    async function signOut() {
        const client = getClient();
        if (!client) return;
        await client.auth.signOut();
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
        if (!overlay) return;
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
            console.warn('[卍物所] 請在 supabase-config.js 填寫 Supabase Project URL 與 anon key。詳見 SUPABASE_AUTH_SETUP.md');
            updateHeader(null);
            const params = new URLSearchParams(window.location.search);
            if (params.get('auth') === 'login') openAuthModal('login');
            return;
        }

        client.auth.onAuthStateChange(async function (event, session) {
            if (session && session.user) {
                await ensureProfile(session.user);
            }
            updateHeader(session);
            notifyListeners(session);
        });

        getSession().then(function (session) {
            updateHeader(session);
        });

        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'login') {
            openAuthModal('login');
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
        signOut: signOut,
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
