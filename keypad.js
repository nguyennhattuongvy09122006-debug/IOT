/* =====================================================
   BaseHome - Virtual 4x4 Keypad
   Giao diện keypad nằm sẵn trong index.html (#basehomeKeypad).
   File này chỉ gắn logic cho các phím.
   Phím số nhập vào ô PIN (#pinInput) của mục Security.
     A = Arm (AWAY)   B = All AUTO   C = Mở cửa bằng PIN
     * = Xóa PIN      # = Disarm
   ===================================================== */

(() => {
    'use strict';

    const $ = id => document.getElementById(id);

    let message = 'Enter PIN';

    // Hiển thị thông báo trên màn hình keypad (các file khác gọi được)
    window.setKeypadMessage = function (text) {
        message = text;
        const screen = $('keypadMessage');
        if (screen) screen.textContent = message;
    };

    function updateScreen() {
        const mode = $('secMode');
        const pin = $('pinInput');

        if ($('keypadMode') && mode) {
            $('keypadMode').textContent = 'SECURITY: ' + mode.textContent.trim();
        }
        if ($('keypadMessage')) {
            $('keypadMessage').textContent = message;
        }
        if ($('keypadDisplay')) {
            const value = pin ? pin.value : '';
            $('keypadDisplay').textContent = value ? '*'.repeat(value.length) : '----';
        }
    }

    function handleKey(key) {
        const pin = $('pinInput');

        if (!pin) {
            message = 'Security panel not ready';
            updateScreen();
            return;
        }

        // Phím số: nhập PIN
        if (/^[0-9]$/.test(key)) {
            if (pin.value.length < 8) pin.value += key;
            message = 'Enter PIN';
            updateScreen();
            return;
        }

        switch (key) {
            case '*':
                pin.value = '';
                message = 'PIN cleared';
                break;

            case '#':
                $('disarmBtn')?.click();      // xác nhận PIN và Disarm
                break;

            case 'A':
                pin.value = '';
                $('armBtn')?.click();         // Arm: chuyển sang AWAY
                break;

            case 'B':
                $('autoBtn')?.click();        // chuyển tất cả thiết bị sang AUTO
                break;

            case 'C':                         // mở cửa bằng PIN đang nhập
                if (window.BaseHomeDoor) {
                    const ok = window.BaseHomeDoor.tryPin(pin.value.trim());
                    pin.value = '';
                    message = ok ? 'Door opened' : 'Wrong door PIN';
                } else {
                    message = 'Door module not loaded';
                }
                break;

            case 'D':
                message = 'D key is not assigned';
                break;
        }

        updateScreen();
    }

    // Theo dõi #secMode và #pinInput (do mqtt-bridge.js tạo ra)
    function attachObservers() {
        const mode = $('secMode');
        const pin = $('pinInput');

        if (mode && !mode.dataset.kp) {
            mode.dataset.kp = '1';
            new MutationObserver(updateScreen).observe(mode, {
                childList: true, characterData: true, subtree: true
            });
        }
        if (pin && !pin.dataset.kp) {
            pin.dataset.kp = '1';
            pin.addEventListener('input', updateScreen);
        }
        return !!(mode && pin);
    }

    function start() {
        const panel = $('basehomeKeypad');
        if (!panel) return;

        panel.querySelectorAll('[data-key]').forEach(button => {
            button.addEventListener('click', () => handleKey(button.dataset.key));
        });

        if (attachObservers()) {
            updateScreen();
        } else {
            const obs = new MutationObserver(() => {
                if (attachObservers()) {
                    obs.disconnect();
                    updateScreen();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();