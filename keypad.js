/* =====================================================
   BaseHome - Virtual 4x4 Keypad (With Audio, Stranger Siren & Lockout)
   ===================================================== */

(() => {
    'use strict';

    const $ = id => document.getElementById(id);

    const CORRECT_PIN = '1234';
    const MAX_TRIES = 3;
    const LOCK_SECONDS = 10;

    let message = 'Enter PIN';
    let currentInput = '';
    let wrongAttempts = 0;
    let isLocked = false;
    let audioCtx = null;

    // --- HỆ THỐNG ÂM THANH (BEEP & SIREN) ---
    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // Âm thanh bấm phím ngắn (Beep)
    function playBeep(freq = 800, duration = 0.05) {
        try {
            const ctx = getAudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    // Còi hú cảnh báo khi nhập sai 3 lần hoặc có sự cố bảo mật (Siren)
    window.playKeypadSiren = function(seconds = 3) {
        try {
            const ctx = getAudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'square';
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const t = ctx.currentTime;
            gain.gain.setValueAtTime(0.2, t);
            
            // Tạo tiếng hú thay đổi tần số qua lại
            for (let i = 0; i < seconds * 4; i++) {
                osc.frequency.setValueAtTime(i % 2 === 0 ? 600 : 900, t + i * 0.25);
            }
            
            gain.gain.setValueAtTime(0.2, t + seconds);
            gain.gain.linearRampToValueAtTime(0, t + seconds + 0.05);
            
            osc.start(t);
            osc.stop(t + seconds + 0.1);
        } catch (e) {
            console.warn('Siren error:', e);
        }
    };

    window.setKeypadMessage = function (text) {
        message = text;
        const screen = $('keypadMessage');
        if (screen) screen.textContent = message;
    };

    function updateScreen() {
        const msgEl = $('keypadMessage');
        const dispEl = $('keypadDisplay');

        if (msgEl) msgEl.textContent = message;
        if (dispEl) {
            dispEl.textContent = currentInput ? '*'.repeat(currentInput.length) : '----';
        }
    }

    // Xử lý khóa bàn phím 10 giây khi sai 3 lần
    function triggerLockout() {
        isLocked = true;
        let remaining = LOCK_SECONDS;
        window.playKeypadSiren(3); // Hú còi 3 giây cảnh báo

        const timer = setInterval(() => {
            remaining--;
            message = `LOCKED (${remaining}s)`;
            updateScreen();
            if (remaining <= 0) {
                clearInterval(timer);
                isLocked = false;
                wrongAttempts = 0;
                message = 'Enter PIN';
                updateScreen();
            }
        }, 1000);
    }

    function handleKey(key) {
        if (isLocked) {
            playBeep(300, 0.1); // Tiếng từ chối khi đang khóa
            return;
        }

        playBeep(); // Phát tiếng bíp khi bấm phím

        // Phím số: nhập PIN
        if (/^[0-9]$/.test(key)) {
            if (currentInput.length < 8) currentInput += key;
            message = 'Enter PIN';
            updateScreen();
            return;
        }

        switch (key) {
            case '*': // Xóa PIN
                currentInput = '';
                message = 'PIN cleared';
                break;

            case '#': // Xác nhận mã PIN
                if (currentInput.length > 0) {
                    if (currentInput === CORRECT_PIN) {
                        message = 'Access Granted';
                        wrongAttempts = 0;
                        if (typeof window.BaseHomeDoor === 'object' && window.BaseHomeDoor.tryPin) {
                            window.BaseHomeDoor.tryPin(currentInput);
                        }
                    } else {
                        wrongAttempts++;
                        message = `Wrong PIN (${wrongAttempts}/${MAX_TRIES})`;
                        if (wrongAttempts >= MAX_TRIES) {
                            triggerLockout();
                            return;
                        }
                    }
                    currentInput = '';
                } else {
                    message = 'Disarmed';
                }
                break;

            case 'A': // Arm (AWAY)
                currentInput = '';
                message = 'Security: AWAY';
                break;

            case 'B': // All AUTO
                currentInput = '';
                message = 'Devices: AUTO';
                break;

            case 'C': // Mở cửa nhanh bằng PIN
                if (currentInput === CORRECT_PIN || (window.BaseHomeDoor && window.BaseHomeDoor.tryPin(currentInput))) {
                    message = 'Door opened';
                    wrongAttempts = 0;
                } else {
                    wrongAttempts++;
                    message = `Wrong PIN (${wrongAttempts}/${MAX_TRIES})`;
                    if (wrongAttempts >= MAX_TRIES) {
                        triggerLockout();
                        return;
                    }
                }
                currentInput = '';
                break;

            case 'D':
                message = 'Function D';
                currentInput = '';
                break;
        }

        updateScreen();
    }

    function start() {
        const panel = $('basehomeKeypad');
        if (!panel) return;

        panel.querySelectorAll('[data-key]').forEach(button => {
            button.addEventListener('click', () => handleKey(button.dataset.key));
        });

        updateScreen();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();