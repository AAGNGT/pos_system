document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. 網站/聊天系統 Supabase (負責讀寫對話) ---
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : window.supabaseClient;
    if (!client) {
        console.error("無法連接 Supabase，請檢查設定。");
        return;
    }

    // --- 2. POS 系統 Supabase (負責唯讀驗證訂單) ---
    const POS_SUPABASE_URL = 'https://dryvaibjsetigszkzxuh.supabase.co';
    const POS_SUPABASE_KEY = 'sb_publishable_rUaICkdFf6_6aAtxgvI90Q__shoTcRA';
    const posClient = supabase.createClient(POS_SUPABASE_URL, POS_SUPABASE_KEY);

    // 🌟 跨庫驗證核心函數：改為呼叫安全的 RPC 函數 (繞過前端 RLS 限制)
    async function verifyPosOrder(orderId, inputTotal) {
        const { data, error } = await posClient.rpc('verify_pos_order', { 
            p_order_id: orderId, 
            p_total: Number(inputTotal) 
        });

        if (error) {
            console.error("RPC 呼叫錯誤:", error);
            throw new Error('無法連接驗證系統，請稍後再試。');
        }

        if (!data.success) {
            // 如果驗證失敗 (例如找不到單號或金額錯)，拋出後端設定好的錯誤訊息
            throw new Error(data.error);
        }

        return data;
    }

    // --- 🔔 提示音效設定 ---
    const notifySound = new Audio(NOTIFY_SOUND_BASE64); // 確保 NOTIFY_SOUND_BASE64 在其他地方已定義
    notifySound.preload = 'auto';
    notifySound.volume = 0.2; 

    // DOM 綁定
    const unauthorizedView = document.getElementById('unauthorizedView');
    const mainChatContainer = document.getElementById('mainChatContainer');
    const verifyModal = document.getElementById('verificationModal');
    const verifyForm = document.getElementById('verifyForm');
    const verifyFeedback = document.getElementById('verifyFeedback');
    
    const adminSidebar = document.getElementById('adminSidebar');
    const adminTicketList = document.getElementById('adminTicketList');

    const displayIdentity = document.getElementById('displayIdentity');
    const summaryOrderCode = document.getElementById('summaryOrderCode');
    const summaryTicketStatus = document.getElementById('summaryTicketStatus');
    const chatHistory = document.getElementById('chatHistory');
    
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');

    let currentTicketId = null;
    let currentUser = null;
    let isAdmin = false;
    let pendingOrderId = null;
    let realtimeChannel = null;       
    let globalAdminChannel = null;    
    let typingTimeout = null;
    let verifyAttempts = 0;

    // 🌟 顯示未授權畫面的共用函數
    function showUnauthorized() {
        if (unauthorizedView) unauthorizedView.style.display = 'block';
        if (mainChatContainer) mainChatContainer.style.display = 'none';
        if (verifyModal) verifyModal.style.display = 'none';
        if (adminSidebar) adminSidebar.style.display = 'none';
        if (document.getElementById('welcomeView')) document.getElementById('welcomeView').style.display = 'none';
    }

    // --- 1. 系統初始化 ---
    async function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const ticketIdParam = urlParams.get('ticket_id');
        const orderIdParam = urlParams.get('order_id');
        const tokenParam = urlParams.get('token');

        const { data: { session } } = await client.auth.getSession();
        if (session) {
            currentUser = session.user;
            if (currentUser.email === 'admin@market.local') {
                isAdmin = true;
            }
        }

        if (isAdmin) {
            displayIdentity.textContent = '🛡️ 系統管理員 (Admin)';
            displayIdentity.style.color = '#991b1b';
            verifyModal.style.display = 'none';
            if (unauthorizedView) unauthorizedView.style.display = 'none';
            adminSidebar.style.display = 'flex';
            mainChatContainer.style.display = 'flex';
            
            await loadAdminTicketList();
            setupAdminGlobalSubscription(); 
            
            if (ticketIdParam) {
                currentTicketId = ticketIdParam;
                loadChatRoom(currentTicketId);
            } else {
                chatHistory.innerHTML = '<div style="text-align:center; color:#999; margin-top:20px;">請從左側選擇一個對話以開始。</div>';
            }
            return; 
        } else if (currentUser) {
            displayIdentity.textContent = '👤 註冊會員 (Member)';
            displayIdentity.style.color = '#059669';
        } else {
            displayIdentity.textContent = '👁️ 訪客 (Guest)';
        }

        // 🌟 情況 1：完全沒有參數 (正常從主頁或直接點擊進入) -> 顯示迎賓與分流畫面
        if (!ticketIdParam && !orderIdParam) {
            if (verifyModal) verifyModal.style.display = 'none';
            if (mainChatContainer) mainChatContainer.style.display = 'none';
            if (adminSidebar) adminSidebar.style.display = 'none';
            if (unauthorizedView) unauthorizedView.style.display = 'none';
            
            const welcomeView = document.getElementById('welcomeView');
            if (welcomeView) welcomeView.style.display = 'block';
            return;
        }

        // 🌟 情況 2：帶有 ticket_id 參數
        if (ticketIdParam) {
            currentTicketId = ticketIdParam;
            const isVerifiedGuest = sessionStorage.getItem('verified_guest_' + ticketIdParam);

            if (tokenParam || currentUser || isVerifiedGuest) {
                if (tokenParam) {
                    sessionStorage.setItem('verified_guest_' + ticketIdParam, 'true');
                    window.history.replaceState({}, document.title, `contact.html?ticket_id=${ticketIdParam}`);
                }
                loadChatRoom(currentTicketId);
            } else {
                // 🚨 沒有 Token 也沒有登入紀錄 -> 直接顯示未授權
                showUnauthorized();
            }
        } 
        // 🌟 情況 3：帶有 order_id 參數
        else if (orderIdParam) {
            pendingOrderId = orderIdParam;
            const expectedOrderToken = sessionStorage.getItem('chat_token_order_' + pendingOrderId);

            if (currentUser) {
                try {
                    const { data: newTicketId, error } = await client.rpc('get_or_create_ticket', { 
                        p_order_id: pendingOrderId, 
                        p_phone: '已驗證身份' // 🌟 補上 p_phone 參數，避免 400 錯誤
                    });
                    if (error) throw error;
                    currentTicketId = newTicketId;
                    window.history.replaceState({}, document.title, `contact.html?ticket_id=${currentTicketId}`);
                    loadChatRoom(currentTicketId);
                } catch (err) {
                    showUnauthorized(); 
                }
            } else if (tokenParam && tokenParam === expectedOrderToken) {
                sessionStorage.removeItem('chat_token_order_' + pendingOrderId);
                try {
                    // 已有 token 免驗證直接進入
                    const { data: newTicketId, error } = await client.rpc('get_or_create_ticket', { 
                        p_order_id: pendingOrderId, 
                        p_phone: '已驗證身份' // 🌟 補上 p_phone 參數，避免 400 錯誤
                    });
                    if (error) throw error;
                    currentTicketId = newTicketId;
                    sessionStorage.setItem('verified_guest_' + currentTicketId, 'true');
                    window.history.replaceState({}, document.title, `contact.html?ticket_id=${currentTicketId}`);
                    loadChatRoom(currentTicketId);
                } catch (err) {
                    showUnauthorized();
                }
            } else {
                // 🌟 帶有訂單號碼但未驗證身份 -> 彈出金額驗證視窗
                if (document.getElementById('welcomeView')) document.getElementById('welcomeView').style.display = 'none';
                if (unauthorizedView) unauthorizedView.style.display = 'none';
                
                verifyModal.style.display = 'flex';
                const modalDesc = document.querySelector('#verificationModal p');
                if(modalDesc) {
                    modalDesc.innerHTML = '請輸入您電子收據上的「實付總額」，以便我們為您尋找對應的訂單與對話。';
                }
            }
        }
    }

    // --- 2. 處理驗證表單 (跨庫驗證版) ---
    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // 容錯支援：如果 HTML input id 還是 verify_phone，就抓它，否則抓 verify_amount
        const amountInput = document.getElementById('verify_amount') || document.getElementById('verify_phone');
        const totalAmount = amountInput.value.trim();
        
        verifyFeedback.textContent = '跨庫驗證中...';
        verifyFeedback.style.color = 'var(--text-secondary)';

        try {
            let orderIdToVerify = pendingOrderId;
            
            // 如果只有 ticketId 但需要重新驗證，查出背後的 orderId
            if (currentTicketId && !pendingOrderId) {
                const { data: ticket } = await client.from('wanwu_chat_tickets').select('order_id').eq('id', currentTicketId).single();
                if (ticket) orderIdToVerify = ticket.order_id;
            }

            // 1. 向 POS 系統驗證 (自動排除以 GUEST 開頭的純訪客一般查詢)
            if (orderIdToVerify && !orderIdToVerify.startsWith('GUEST-')) {
                await verifyPosOrder(orderIdToVerify, totalAmount);
            }

            // 2. POS 驗證通過後，在網站聊天系統配對房間
            if (pendingOrderId) {
                const { data: ticketId, error } = await client.rpc('get_or_create_ticket', { 
                    p_order_id: pendingOrderId, 
                    p_phone: `實付總額:$${totalAmount}` // 將金額寫入 guest_phone 欄位供後台辨識
                });
                if (error) throw new Error(error.message);
                currentTicketId = ticketId;
            }

            sessionStorage.setItem('verified_guest_' + currentTicketId, 'true');
            verifyModal.style.display = 'none';
            verifyAttempts = 0; // 重置計數
            window.history.replaceState({}, document.title, `contact.html?ticket_id=${currentTicketId}`);
            loadChatRoom(currentTicketId);
        } catch (err) {
            // 🌟 防線 3：驗證失敗超過三次直接封鎖
            verifyAttempts++;
            if (verifyAttempts >= 3) {
                showUnauthorized();
            } else {
                verifyFeedback.textContent = err.message || `驗證失敗，請重試 (剩餘 ${3 - verifyAttempts} 次機會)。`;
                verifyFeedback.style.color = '#991b1b';
            }
        }
    });

// ==========================================
    // 🌟 處理迎賓畫面 (Welcome View) 的兩種選擇
    // ==========================================

    const welcomeOrderForm = document.getElementById('welcomeOrderForm');
    if (welcomeOrderForm) {
        welcomeOrderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = welcomeOrderForm.querySelector('button[type="submit"]');
            const orderIdInput = document.getElementById('welcome_order_id');
            const feedback = document.getElementById('welcomeOrderFeedback');

            const orderId = orderIdInput ? orderIdInput.value.trim() : '';

            if (!orderId) {
                feedback.textContent = "請輸入訂單編號。";
                return;
            }

            // 🛡️ 防呆機制：鎖定按鈕，防止重複送出
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
            submitBtn.innerHTML = '🔄 查詢中，請稍候...';

            feedback.textContent = '系統連線中...';
            feedback.style.color = '#64748b';

            try {
                // 1. 直接向網站聊天資料庫請求建立/載入房間 (已移除實付總額 POS 驗證)
                const { data: ticketId, error } = await client.rpc('get_or_create_ticket', { 
                    p_order_id: orderId, 
                    p_phone: '由代碼直接進入' // 備註欄位改為通用提示
                });
                
                if (error) throw new Error(error.message);

                // 2. 儲存驗證狀態
                sessionStorage.setItem('verified_guest_' + ticketId, 'true');
                
                // 🚀 3. 無縫進入聊天室 (不重新整理網頁)
                currentTicketId = ticketId;
                window.history.pushState({}, document.title, `contact.html?ticket_id=${currentTicketId}`);
                loadChatRoom(currentTicketId);

            } catch (err) {
                feedback.textContent = err.message || '找不到相符的訂單，請確認編號是否正確。';
                feedback.style.color = '#dc2626';
            } finally {
                // ⏳ 冷卻機制：3 秒後才允許再次點擊
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                    submitBtn.innerHTML = originalText;
                }, 3000);
            }
        });
    }
    // --- 3. 管理員：載入工單列表 ---
    async function loadAdminTicketList() {
        const { data: tickets, error } = await client
            .from('wanwu_chat_tickets')
            .select(`
                id, status, order_id, updated_at,
                wanwu_chat_messages ( content, sender_type, read_at, created_at )
            `)
            .order('updated_at', { ascending: false });

        if (error) {
            adminTicketList.innerHTML = `<div style="padding: 20px; color: red;">載入失敗</div>`;
            return;
        }

        if (tickets.length === 0) {
            adminTicketList.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">目前沒有任何查詢記錄</div>`;
            return;
        }

        adminTicketList.innerHTML = tickets.map(t => {
            const displayCode = t.order_id ? `訂單 #${t.order_id}` : `ID: ${t.id.split('-')[0]}`;
            const timeStr = new Date(t.updated_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
            const statusIcon = t.status === 'open' ? '🟢' : (t.status === 'resolved' ? '✅' : '⚫');
            const isActive = t.id === currentTicketId ? 'active' : '';
            
            let unreadCount = 0;
            let latestMsg = '尚無對話';
            
            if (t.wanwu_chat_messages && t.wanwu_chat_messages.length > 0) {
                const sortedMsgs = t.wanwu_chat_messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                if (sortedMsgs[0].sender_type !== 'system') {
                    latestMsg = sortedMsgs[0].content;
                    if(latestMsg.length > 15) latestMsg = latestMsg.substring(0, 15) + '...';
                }
                
                unreadCount = sortedMsgs.filter(m => (m.sender_type === 'customer' || m.sender_type === 'guest') && m.read_at === null).length;
            }

            const badgeHtml = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';

            return `
                <div class="ticket-item ${isActive}" onclick="window.selectAdminTicket('${t.id}', event)">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div class="ticket-item-title">${statusIcon} ${displayCode}</div>
                        <div class="ticket-item-meta">${timeStr}</div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size: 0.82rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${escapeHtml(latestMsg)}</div>
                        ${badgeHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    function setupAdminGlobalSubscription() {
        if (globalAdminChannel) return;
        globalAdminChannel = client.channel('admin_global')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'wanwu_chat_tickets' }, () => {
                loadAdminTicketList();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wanwu_chat_messages' }, payload => {
                if (payload.new.sender_type !== 'admin' && payload.new.sender_type !== 'system') {
                    notifySound.play().catch(e => console.log('音效播放被攔截:', e));
                    loadAdminTicketList(); 
                }
            })
            .subscribe();
    }

    window.selectAdminTicket = function(ticketId, event) {
        currentTicketId = ticketId;
        window.history.replaceState({}, document.title, `contact.html?ticket_id=${ticketId}`);
        loadChatRoom(ticketId);
        
        document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active'));
        if(event && event.currentTarget) event.currentTarget.classList.add('active');
    };

    // --- 4. 載入單一聊天室資料與自動已讀 ---
    async function loadChatRoom(ticketId) {
        verifyModal.style.display = 'none';
        if (document.getElementById('welcomeView')) document.getElementById('welcomeView').style.display = 'none';
        if (unauthorizedView) unauthorizedView.style.display = 'none';
        mainChatContainer.style.display = 'flex';
        chatHistory.innerHTML = '<div class="message system"><div class="bubble">載入中...</div></div>';
        
        try {
            const { data: ticket, error: ticketError } = await client
                .from('wanwu_chat_tickets')
                .select('status, id, order_id')
                .eq('id', ticketId)
                .single();
            if (ticketError || !ticket) throw new Error("無效的查詢 ID 或權限不足");

            const displayCode = ticket.order_id ? `#${ticket.order_id}` : ticket.id.split('-')[0].toUpperCase();
            summaryOrderCode.textContent = displayCode;
            summaryTicketStatus.textContent = ticket.status === 'open' ? '🟢 處理中' : (ticket.status === 'resolved' ? '✅ 已解決' : '⚫ 已關閉');

            const { data: messages, error: msgError } = await client
                .from('wanwu_chat_messages')
                .select('*')
                .eq('ticket_id', ticketId)
                .eq('is_visible', 1)
                .order('created_at', { ascending: true });

            if (msgError) throw msgError;

            renderMessages(messages);
            markMessagesAsRead(messages);

            if (ticket.status !== 'closed') {
                messageInput.disabled = false;
                sendBtn.disabled = false;
                setupTypingIndicator();
            } else {
                messageInput.disabled = true;
                sendBtn.disabled = true;
                messageInput.placeholder = "此查詢已關閉。";
            }

            subscribeToRealtime(ticketId);
        } catch (err) {
            console.error("載入聊天室失敗：", err);
            showUnauthorized();
        }
    }

    async function markMessagesAsRead(messages) {
        const unreadIds = messages.filter(m => {
            const isMine = (isAdmin && m.sender_type === 'admin') || (!isAdmin && (m.sender_type === 'customer' || m.sender_type === 'guest'));
            return !isMine && m.sender_type !== 'system' && m.read_at === null;
        }).map(m => m.id);

        if (unreadIds.length > 0) {
            await client.from('wanwu_chat_messages')
                .update({ read_at: new Date().toISOString() })
                .in('id', unreadIds);
            
            if (isAdmin) loadAdminTicketList(); 
        }
    }

    // --- 5. 渲染對話訊息 ---
    function renderMessages(messages) {
        chatHistory.innerHTML = ''; 
        if (messages.length === 0) {
            chatHistory.innerHTML = '<div style="text-align:center; color:#999; margin-top:20px;">開始你們的對話...</div>';
            return;
        }
        messages.forEach(msg => appendMessageToUI(msg));
        scrollToBottom();
    }

    function appendMessageToUI(msg) {
        const msgDiv = document.createElement('div');
        msgDiv.id = `msg-${msg.id}`; 
        let bubbleClass = 'message ';
        let senderName = '';
        let isMine = false;

        if (isAdmin) {
            if (msg.sender_type === 'admin') {
                bubbleClass += 'self';
                senderName = '我 (客服)';
                isMine = true;
            } else if (msg.sender_type === 'system') {
                bubbleClass += 'system';
            } else {
                bubbleClass += 'other';
                senderName = msg.sender_type === 'customer' ? '會員' : '訪客';
            }
        } else {
            if (msg.sender_type === 'customer' || msg.sender_type === 'guest') {
                bubbleClass += 'self';
                senderName = '我';
                isMine = true;
            } else if (msg.sender_type === 'system') {
                bubbleClass += 'system';
            } else {
                bubbleClass += 'other';
                senderName = '客服專員';
            }
        }
        
        msgDiv.className = bubbleClass;
        const timeStr = new Date(msg.created_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
        const safeContent = escapeHtml(msg.content);

        let ticksHtml = '';
        if (isMine && msg.id && msg.sender_type !== 'system') {
            const isRead = msg.read_at !== null;
            const tickClass = isRead ? 'read' : 'unread';
            ticksHtml = `<span class="tick-icon ${tickClass}" id="tick-${msg.id}">✓</span>`;
        }

        if (msg.sender_type === 'system') {
            msgDiv.innerHTML = `<div class="bubble">${safeContent}</div>`;
        } else {
            msgDiv.innerHTML = `
                ${bubbleClass.includes('other') ? `<span class="sender-name">${senderName}</span>` : ''}
                <div class="bubble">${safeContent}</div>
                <div class="message-meta">
                    <span class="time">${timeStr}</span>
                    ${ticksHtml}
                </div>
            `;
        }
        chatHistory.appendChild(msgDiv);
    }

// --- 6. 發送訊息 (防刷屏機制版) ---
    let lastMessageTime = 0;
    const MESSAGE_COOLDOWN_MS = 2500; // 設定每 2.5 秒只能發送一則訊息

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        if (!content || !currentTicketId) return;

        // 🛡️ 1. 檢查發送頻率 (防刷屏)
        const now = Date.now();
        if (now - lastMessageTime < MESSAGE_COOLDOWN_MS) {
            const waitSeconds = Math.ceil((MESSAGE_COOLDOWN_MS - (now - lastMessageTime)) / 1000);
            
            // 產生一個本地系統提示泡泡 (不寫入資料庫)
            const warningMsg = { 
                id: 'spam-warning-' + now, 
                content: `⚠️ 發送太頻繁，請等待 ${waitSeconds} 秒後再試。`, 
                sender_type: 'system', 
                created_at: new Date().toISOString() 
            };
            appendMessageToUI(warningMsg);
            scrollToBottom();

            // 鎖定發送按鈕
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
            setTimeout(() => {
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
            }, MESSAGE_COOLDOWN_MS - (now - lastMessageTime));
            
            return;
        }

        // 🛡️ 2. 更新最後發送時間，並在發送期間鎖定按鈕防止連按
        lastMessageTime = now;
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.7';

        let finalSenderType = 'guest';
        if (isAdmin) finalSenderType = 'admin';
        else if (currentUser) finalSenderType = 'customer';

        // 先在畫面上渲染自己發送的訊息 (Optimistic UI)
        const tempId = 'temp-' + Date.now();
        const tempMsg = { id: tempId, content: content, sender_type: finalSenderType, created_at: new Date().toISOString(), read_at: null };
        appendMessageToUI(tempMsg);
        scrollToBottom();
        
        messageInput.value = '';
        messageInput.focus();

        // 將訊息寫入資料庫
        const { data: insertedMsg, error } = await client.from('wanwu_chat_messages').insert([{
            ticket_id: currentTicketId,
            sender_type: finalSenderType,
            sender_id: currentUser ? currentUser.id : null,
            content: content
        }]).select().single();

        // 恢復發送按鈕狀態
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';

        if (error) {
            // 寫入失敗的本地提示
            const errorMsg = { 
                id: 'err-' + Date.now(), 
                content: `❌ 訊息發送失敗，請檢查網路連線。`, 
                sender_type: 'system', 
                created_at: new Date().toISOString() 
            };
            appendMessageToUI(errorMsg);
            scrollToBottom();
        } else if (insertedMsg) {
            // 寫入成功，更新臨時 ID 為真實 ID，並加上未讀勾號
            const msgEl = document.getElementById(`msg-${tempId}`);
            if (msgEl) msgEl.id = `msg-${insertedMsg.id}`;
            const tickEl = document.getElementById(`tick-${tempId}`);
            if (tickEl) {
                tickEl.id = `tick-${insertedMsg.id}`;
                tickEl.className = 'tick-icon unread'; 
            }
        }
    });
    // --- 7. 單一房間 Realtime 監聽 ---
    function subscribeToRealtime(ticketId) {
        if (realtimeChannel) client.removeChannel(realtimeChannel);

        realtimeChannel = client.channel(`room:${ticketId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wanwu_chat_messages', filter: `ticket_id=eq.${ticketId}` }, payload => {
                const isMyMessage = (isAdmin && payload.new.sender_type === 'admin') || (!isAdmin && (payload.new.sender_type === 'customer' || payload.new.sender_type === 'guest'));
                
                if (!isMyMessage) {
                    appendMessageToUI(payload.new);
                    scrollToBottom();
                    if (!isAdmin) notifySound.play().catch(e => console.log('音效被攔截:', e));
                    if (payload.new.sender_type !== 'system' && payload.new.read_at === null) {
                        client.from('wanwu_chat_messages')
                            .update({ read_at: new Date().toISOString() })
                            .eq('id', payload.new.id)
                            .then(({ error }) => {
                                if (error) console.error("更新已讀時間失敗:", error);
                            });
                    }
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wanwu_chat_messages', filter: `ticket_id=eq.${ticketId}` }, payload => {
                if (payload.new.read_at) {
                    const tickEl = document.getElementById(`tick-${payload.new.id}`);
                    if (tickEl) tickEl.className = 'tick-icon read';
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wanwu_chat_tickets', filter: `id=eq.${ticketId}` }, payload => {
                const isOtherTyping = isAdmin ? payload.new.customer_is_typing : payload.new.admin_is_typing;
                if (isOtherTyping) {
                    typingIndicator.style.display = 'block';
                    scrollToBottom();
                } else {
                    typingIndicator.style.display = 'none';
                }
            })
            .subscribe();
    }

    function setupTypingIndicator() {
        messageInput.addEventListener('input', () => {
            if (!currentTicketId) return;
            const fieldToUpdate = isAdmin ? { admin_is_typing: true } : { customer_is_typing: true };
            const fieldToClear = isAdmin ? { admin_is_typing: false } : { customer_is_typing: false };
            
            client.from('wanwu_chat_tickets').update(fieldToUpdate).eq('id', currentTicketId).then();
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                client.from('wanwu_chat_tickets').update(fieldToClear).eq('id', currentTicketId).then();
            }, 2000);
        });
    }

    function scrollToBottom() { chatHistory.scrollTop = chatHistory.scrollHeight; }
    function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    init();
});