/* ============================================================
   keypad.js - Bàn phím số 4x4 ảo trên giao diện (giống keypad thật)
   - Bấm số: nhập PIN (hiện dấu * trên màn hình LCD ảo)
   - *  : xóa PIN đang nhập
   - #  : xác nhận (gọi nút Disarm có sẵn, gửi lệnh disarm + PIN tới ESP32)
   - A  : Arm (AWAY)
   - B  : All AUTO
   Dùng lại các nút/ô có sẵn từ mqtt-bridge.js: #pinInput, #armBtn, #disarmBtn, #autoBtn, #secMode
   ============================================================ */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);

    const KEYS = [
        ['1', '2', '3', 'A'],
        ['4', '5', '6', 'B'],
        ['7', '8', '9', 'C'],
        ['*', '0', '#', 'D']
    ];

    function injectStyles() {
        const css = `
        .kp-wrap{margin-top:16px;max-width:300px}
        .kp-screen{background:#0f172a;color:#86efac;font-family:'Courier New',monospace;font-size:16px;line-height:1.6;padding:10px 14px;border-radius:10px;margin-bottom:12px;min-height:56px}
        .kp-screen.alarm{color:#fca5a5}
        .kp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;background:#1e293b;border-radius:14px}
        .kp-grid button{height:46px;border:none;border-radius:8px;font-size:18px;font-weight:600;cursor:pointer;color:#0f172a;background:#4dd0e1}
        .kp-grid button.kp-red{background:#e11d48;color:#fff}
        .kp-grid button.kp-off{opacity:.5;cursor:default}
        .kp-grid button:active{transform:scale(.96)}
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function build() {
        const actions = document.querySelector('.sec-actions');
        const pin = $('pinInput');
        if (!actions || !pin || $('kpScreen')) return false;

        let html = '<div class="kp-wrap"><div class="kp-screen" id="kpScreen"><div id="kpLine1">Mode: HOME</div><div id="kpLine2">Enter PIN + #</div></div><div class="kp-grid">';
        KEYS.forEach(row => row.forEach(k => {
            const isDigit = k >= '0' && k <= '9';
            const unused = (k === 'C' || k === 'D');
            html += '<button type="button" data-key="' + k + '" class="' + (isDigit ? '' : 'kp-red') + (unused ? ' kp-off' : '') + '">' + k + '</button>';
        }));
        html += '</div></div>';
        actions.insertAdjacentHTML('afterend', html);

        const line1 = $('kpLine1'), line2 = $('kpLine2'), screen = $('kpScreen');
        const showPin = () => { line2.textContent = pin.value ? 'PIN: ' + '*'.repeat(pin.value.length) : 'Enter PIN + #'; };

        document.querySelector('.kp-grid').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-key]');
            if (!btn) return;
            const k = btn.dataset.key;
            if (k >= '0' && k <= '9') {
                if (pin.value.length < 8) pin.value += k;
                showPin();
            } else if (k === '*') {
                pin.value = '';
                showPin();
            } else if (k === '#') {
                if (!pin.value) { line2.textContent = 'Enter PIN first'; return; }
                const btnDisarm = $('disarmBtn');
                if (btnDisarm) btnDisarm.click();      // gửi lệnh disarm + PIN, rồi ô PIN tự xóa
                line2.textContent = 'Checking...';
            } else if (k === 'A') {
                if ($('armBtn')) $('armBtn').click();
                line2.textContent = 'Arm sent';
            } else if (k === 'B') {
                if ($('autoBtn')) $('autoBtn').click();
                line2.textContent = 'All AUTO sent';
            }
        });
        pin.addEventListener('input', showPin);

        // Dòng 1 của màn hình: theo dõi chế độ HOME / AWAY / ALARM
        const mode = $('secMode');
        const syncMode = () => {
            const m = (mode.textContent || '').trim().toUpperCase();
            const alarm = m.indexOf('ALARM') >= 0;
            line1.textContent = alarm ? '!! ALARM !!' : 'Mode: ' + m;
            screen.classList.toggle('alarm', alarm);
        };
        if (mode) {
            syncMode();
            new MutationObserver(syncMode).observe(mode, { childList: true, characterData: true, subtree: true, attributes: true });
        }

        // Dòng 2: hiện kết quả mới nhất từ Activity History (ESP32 gửi về)
        const logBody = $('logTableBody');
        if (logBody) {
            new MutationObserver(() => {
                const row = logBody.rows[0];
                const text = row && row.cells[1] ? row.cells[1].textContent.toUpperCase() : '';
                if (text.indexOf('WRONG') >= 0) line2.textContent = 'Wrong PIN!';
                else if (text.indexOf('ALARM') >= 0) line2.textContent = 'Wrong PIN x3';
                else if (text.indexOf('DISARM') >= 0) line2.textContent = 'Disarmed';
            }).observe(logBody, { childList: true });
        }
        return true;
    }

    // mqtt-bridge.js tạo khu vực Security, nên đợi cho tới khi nó xuất hiện (tối đa ~5 giây)
    function init() {
        injectStyles();
        if (build()) return;
        let tries = 0;
        const timer = setInterval(() => {
            if (build() || ++tries > 50) clearInterval(timer);
        }, 100);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();