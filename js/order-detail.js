(async function () {
    'use strict';

    function formatPrice(n) {
        return 'HK$' + Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d + 'T00:00:00').toLocaleDateString('zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    }

    async function loadOrderDetail() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('id');

        if (!orderId) {
            alert('找不到訂單編號');
            window.location.href = 'account.html';
            return;
        }

        const session = await WanwuAuth.requireAuth('index.html?auth=login');
        if (!session) return;

        const client = WanwuAuth.getClient();
        const { data: order, error } = await client
            .from('wanwu_orders')
            .select('*')
            .eq('id', orderId)
            .eq('user_id', session.user.id)
            .single();

        if (error || !order) {
            alert('無法讀取該訂單或您沒有權限');
            window.location.href = 'account.html';
            return;
        }

        // 填入頂部資訊
        document.getElementById('displayOrderId').textContent = `#${order.id}`;
        document.getElementById('displayOrderDate').textContent = `訂單日期：${formatDate(order.created_at.split('T')[0])}`;

        // 填入訂單詳情
        document.getElementById('displayPickupDate').textContent = formatDate(order.pickup_date);
        document.getElementById('displayCustomerInfo').innerHTML = `${escapeHtml(order.customer_name)}<br>${escapeHtml(order.customer_phone)}`;
        
        // 假設如果備註有提到線上交易，就顯示線上交易 (預設到付)
        const isAlipay = order.notes && order.notes.includes('支付寶');
        document.getElementById('displayPaymentMethod').textContent = isAlipay ? '線上交易（支付寶）' : '到付（即場現金）';

        // 計算金額
        const unitPrice = Number(order.unit_price) || 0;
        const qty = Number(order.quantity) || 1;
        const total = unitPrice * qty;

        document.getElementById('displaySubtotal').textContent = formatPrice(total);
        document.getElementById('displayTotal').textContent = formatPrice(total);

        // 渲染商品列表
        const productList = document.getElementById('orderProductList');
        productList.innerHTML = `
            <div class="product-item-row">
                <div class="product-item-img">🧱</div>
                <div class="product-item-info">
                    <div class="product-item-name">${escapeHtml(order.product_name)}</div>
                    <div class="product-item-meta">系列：香磚 • 寧磚</div>
                    <div class="product-item-unit-price">${formatPrice(unitPrice)}</div>
                </div>
                <div class="product-item-qty">x ${qty}</div>
                <div class="product-item-total">${formatPrice(total)}</div>
            </div>
        `;

        // 處理進度條狀態
        // 假設狀態映射: pending (已收到) -> processing (處理中) -> ready (已完成備貨) -> completed (已完成交易)
        let currentStep = 1;
        if (order.status === 'processing') currentStep = 2;
        if (order.status === 'ready') currentStep = 3;
        if (order.status === 'completed') currentStep = 4;

        const steps = document.querySelectorAll('.progress-step');
        steps.forEach(step => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            step.classList.remove('completed', 'active', 'pending');
            
            if (stepNum < currentStep) {
                step.classList.add('completed');
            } else if (stepNum === currentStep) {
                step.classList.add('active');
            } else {
                step.classList.add('pending');
            }
        });

        // --- 列印電子收據功能 ---
        const btnPrint = document.getElementById('btnPrintReceipt');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => {
                // 建立正式收據的 HTML 結構
                const receiptHTML = `
                    <!DOCTYPE html>
                    <html lang="zh-HK">
                    <head>
                        <meta charset="UTF-8">
                        <title>卍物所 電子收據 #${order.id}</title>
                        <style>
                            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                            .receipt-box { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; padding: 40px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                            .header h1 { margin: 0; font-size: 26px; letter-spacing: 4px; font-weight: 600; color: #333; }
                            .header p { margin: 8px 0 0; color: #666; font-size: 14px; letter-spacing: 1px; }
                            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; font-size: 14px; }
                            .info-grid div strong { color: #555; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                            th, td { padding: 14px 10px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
                            th { background: #f9f9f9; font-weight: 600; color: #555; border-bottom: 2px solid #ddd; }
                            .right { text-align: right; }
                            .total-row { font-size: 20px; font-weight: bold; color: #111; padding-top: 10px; }
                            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; border-top: 1px dashed #ddd; padding-top: 20px; }
                            @media print {
                                body { padding: 0; }
                                .receipt-box { border: none; box-shadow: none; padding: 20px; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="receipt-box">
                            <div class="header">
                                <h1>卍物所 WANWUSUO</h1>
                                <p>正式電子收據 / OFFICIAL E-RECEIPT</p>
                            </div>
                            <div class="info-grid">
                                <div><strong>訂單編號：</strong> #${order.id}</div>
                                <div><strong>訂單日期：</strong> ${formatDate(order.created_at.split('T')[0])}</div>
                                <div><strong>客戶名稱：</strong> ${escapeHtml(order.customer_name)}</div>
                                <div><strong>付款方式：</strong> ${isAlipay ? '線上交易（支付寶）' : '到付（即場現金）'}</div>
                                <div><strong>取貨日期：</strong> ${formatDate(order.pickup_date)}</div>
                                <div><strong>取貨地點：</strong> 維多利亞公園市集</div>
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>產品名稱</th>
                                        <th class="right">數量</th>
                                        <th class="right">單價</th>
                                        <th class="right">金額</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>${escapeHtml(order.product_name)}<br><span style="font-size:12px;color:#888;">系列：香磚 • 寧磚</span></td>
                                        <td class="right">${qty}</td>
                                        <td class="right">${formatPrice(unitPrice)}</td>
                                        <td class="right">${formatPrice(total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div class="right total-row">
                                總計：${formatPrice(total)}
                            </div>
                            <div class="footer">
                                感謝您對卍物所的支持，這是一份由系統自動生成的正式收據。<br>
                                列印時間：${new Date().toLocaleString('zh-HK')}
                            </div>
                        </div>
                        <script>
                            // 載入完畢後自動觸發瀏覽器的列印/儲存為 PDF 功能
                            window.onload = function() { window.print(); }
                        </script>
                    </body>
                    </html>
                `;

                // 開啟新分頁並寫入 HTML
                const printWin = window.open('', '_blank');
                printWin.document.open();
                printWin.document.write(receiptHTML);
                printWin.document.close();
            });
        }
        
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    document.addEventListener('DOMContentLoaded', loadOrderDetail);
})();