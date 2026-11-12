
/* =====================================================
   BaseHome - Local Demo Mode
   Website simulation - No ESP32 / No MQTT required
   ===================================================== */

(() => {
    'use strict';

    const DEMO_PIN = '1234';
    const MAX_WRONG_PIN = 3;

    const $ = id => document.getElementById(id);

    // Security state
    let securityMode = 'HOME';
    let wrongPinCount = 0;

    // Original functions from script.js
    const originalToggle = window.toggleDevice;

    const DEVICE_NAMES = {
        light: 'Living Room Light',
        fan: 'Smart Fan',
        heater: 'Heater'
    };

    const deviceModes = {
        light: 'MANUAL',
        fan: 'MANUAL',
        heater: 'MANUAL'
    };

    /* =========================
       CSS
    ========================= */

    function injectStyles() {
        if ($('demoBridgeStyles')) return;

        const css = `
            .card.temp-hot {
                border-color: #ef4444;
                background: #fef2f2;
            }

            .card.temp-hot .card-value {
                color: #dc2626;
            }

            body.dark-mode .card.temp-hot {
                background: #3b1f26;
            }

            .fa-fire.heater-on {
                color: #ef4444;
            }

            .sec-panel {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid var(--border-color);
            }

            .sec-row {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 12px;
                font-size: 14px;
                font-weight: 600;
            }

            .sec-mode {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 700;
            }

            .sec-home {
                background: var(--success-bg);
                color: var(--success-text);
            }

            .sec-away {
                background: #dbeafe;
                color: #1e40af;
            }

            .sec-alarm {
                background: var(--danger-bg);
                color: var(--danger-text);
            }

            .sec-motion {
                margin-left: auto;
                font-size: 12px;
                color: var(--text-sub);
            }

            .sec-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .sec-actions button {
                border: 1px solid var(--border-color);
                background: var(--card-bg);
                color: var(--text-main);
                padding: 8px 14px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 13px;
            }

            .sec-actions button.primary {
                background: var(--primary);
                border-color: var(--primary);
                color: #fff;
            }

            .sec-actions input {
                flex: 1;
                min-width: 90px;
                max-width: 140px;
                border: 1px solid var(--border-color);
                background: var(--bg-color);
                color: var(--text-main);
                padding: 8px 12px;
                border-radius: 20px;
                font-size: 13px;
            }

            #alarmBanner {
                display: none;
                align-items: center;
                gap: 10px;
                background: #dc2626;
                color: white;
                padding: 14px 18px;
                border-radius: 14px;
                margin-bottom: 20px;
                font-weight: 700;
            }

            #alarmBanner.show {
                display: flex;
                animation: alarmBlink 1s infinite;
            }

            @keyframes alarmBlink {
                50% { opacity: .65; }
            }
        `;

        const style = document.createElement('style');
        style.id = 'demoBridgeStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* =========================
       ACTIVITY HISTORY
    ========================= */

    function addHistory(message, isError = false) {
        if (typeof window.addLog !== 'function') return;

        let time = new Date().toLocaleTimeString();

        if (typeof window.getCurrentTime === 'function') {
            time = window.getCurrentTime();
        }

        try {
            window.addLog(
                'Security',
                message.toUpperCase(),
                isError
                    ? 'var(--danger-text)'
                    : 'var(--success-text)',
                time
            );
        } catch (error) {
            console.warn('Cannot add activity log:', error);
        }
    }

    /* =========================
       KEYPAD MESSAGE
    ========================= */

    function showMessage(message) {
        if (typeof window.setKeypadMessage === 'function') {
            window.setKeypadMessage(message);
        } else {
            console.log(message);
        }
    }

    /* =========================
       SECURITY MODE
    ========================= */

    function setSecurityMode(mode, message) {
        securityMode = mode;

        const modeElement = $('secMode');
        const banner = $('alarmBanner');

        if (modeElement) {
            modeElement.textContent = mode;
            modeElement.className =
                'sec-mode sec-' + mode.toLowerCase();
        }

        if (banner) {
            banner.classList.toggle('show', mode === 'ALARM');
        }

        showMessage(message);
        addHistory(message, mode === 'ALARM');
    }

    /* =========================
       PIN CHECK
    ========================= */

    function disarmSecurity() {
        const input = $('pinInput');

        if (!input) return;

        const pin = input.value.trim();

        if (!pin) {
            showMessage('Enter PIN first');
            input.focus();
            return;
        }

        if (pin === DEMO_PIN) {
            wrongPinCount = 0;
            input.value = '';

            setSecurityMode(
                'HOME',
                'System disarmed - HOME mode'
            );

        } else {
            wrongPinCount++;
            input.value = '';

            if (wrongPinCount >= MAX_WRONG_PIN) {
                setSecurityMode(
                    'ALARM',
                    'ALARM! 3 wrong PIN attempts'
                );
            } else {
                showMessage(
                    'Wrong PIN! Attempts: ' +
                    wrongPinCount + '/3'
                );

                addHistory('Wrong PIN entered', true);
            }
        }
    }

    /* =========================
       DEVICE CONTROL
    ========================= */

    function updateActiveCount() {
        const devices = ['light', 'fan', 'heater'];

        const active = devices.filter(device => {
            const toggle = $(device + 'Toggle');
            return toggle && toggle.checked;
        }).length;

        const count = $('activeCount');

        if (count) {
            count.innerHTML =
                `${active} <span style="font-size:14px;font-weight:normal;color:var(--text-sub);">/ 3 devices</span>`;
        }
    }

    function setDeviceUI(key, on, mode = 'MANUAL') {
        const toggle = $(key + 'Toggle');
        const badge = $(key + 'Badge');

        if (!toggle) return;

        toggle.checked = !!on;
        deviceModes[key] = mode;

        if (badge) {
            badge.className =
                'badge-status ' + (on ? 'badge-on' : 'badge-off');

            badge.textContent =
                (on ? 'ON' : 'OFF') + ' · ' + mode;
        }

        if (key === 'fan' && $('fanIcon')) {
            $('fanIcon').classList.toggle('spinning', !!on);
        }

        if (key === 'heater' && $('heaterIcon')) {
            $('heaterIcon').classList.toggle('heater-on', !!on);
        }

        updateActiveCount();
    }

    // Keep the existing device controls from script.js
    window.toggleDevice = function(type, state = null) {
        const toggle = $(type + 'Toggle');

        if (!toggle) return;

        if (state !== null) {
            toggle.checked = state;
        }

        if (originalToggle) {
            originalToggle(type, state);
        }

        setDeviceUI(
            type,
            toggle.checked,
            deviceModes[type] || 'MANUAL'
        );

        addDeviceHistory(type, toggle.checked);
    };

    function addDeviceHistory(type, on) {
        if (typeof window.addLog !== 'function') return;

        let time = new Date().toLocaleTimeString();

        if (typeof window.getCurrentTime === 'function') {
            time = window.getCurrentTime();
        }

        try {
            window.addLog(
                DEVICE_NAMES[type] || type,
                on ? 'ON' : 'OFF',
                on ? 'var(--success-text)' : 'var(--danger-text)',
                time
            );
        } catch (error) {
            console.warn(error);
        }
    }

    function setAllAuto() {
        ['light', 'fan', 'heater'].forEach(device => {
            const toggle = $(device + 'Toggle');

            if (!toggle) return;

            // Demo AUTO mode: preserve current ON/OFF state
            setDeviceUI(
                device,
                toggle.checked,
                'AUTO'
            );
        });

        showMessage('All devices set to AUTO');
        addHistory('All devices set to AUTO');
    }

    /* =========================
       CREATE WEBSITE UI
    ========================= */

    function injectUI() {
        const grid = document.querySelector('.devices-grid');

        if (!grid) {
            console.warn('Cannot find .devices-grid');
            return;
        }

        // Add Heater if missing
        if (!$('heaterToggle')) {
            grid.insertAdjacentHTML('beforeend', `
                <div class="device-item">
                    <div class="device-top">
                        <span class="device-name">
                            <i class="fa-solid fa-fire" id="heaterIcon"></i>
                            Heater
                        </span>

                        <label class="switch">
                            <input type="checkbox" id="heaterToggle">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <span class="badge-status badge-off"
                          id="heaterBadge">
                        OFF
                    </span>
                </div>
            `);

            $('heaterToggle').addEventListener('change', () => {
                window.toggleDevice('heater');
            });
        }

        // Add Security panel
        if (!$('secMode')) {
            grid.insertAdjacentHTML('afterend', `
                <div class="sec-panel">

                    <div class="sec-row">
                        <span>
                            <i class="fa-solid fa-shield-halved"></i>
                            Security
                        </span>

                        <span class="sec-mode sec-home" id="secMode">
                            HOME
                        </span>

                        <span class="sec-motion" id="motionChip">
                            <i class="fa-solid fa-person-walking"></i>
                            <span id="motionText">No motion</span>
                        </span>
                    </div>

                    <div class="sec-actions">

                        <button type="button" id="armBtn">
                            Arm (AWAY)
                        </button>

                        <input
                            id="pinInput"
                            type="password"
                            inputmode="numeric"
                            maxlength="8"
                            placeholder="PIN"
                        >

                        <button
                            type="button"
                            id="disarmBtn"
                            class="primary">
                            Disarm
                        </button>

                        <button type="button" id="autoBtn">
                            All AUTO
                        </button>

                    </div>
                </div>
            `);
        }

        // Add alarm banner
        const header = document.querySelector('.container header');

        if (header && !$('alarmBanner')) {
            header.insertAdjacentHTML('afterend', `
                <div id="alarmBanner">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    ALARM: 3 incorrect PIN attempts!
                </div>
            `);
        }

        // Security buttons
        if ($('armBtn')) {
            $('armBtn').addEventListener('click', () => {
                wrongPinCount = 0;

                if ($('pinInput')) {
                    $('pinInput').value = '';
                }

                setSecurityMode(
                    'AWAY',
                    'System armed - AWAY mode'
                );
            });
        }

        if ($('disarmBtn')) {
            $('disarmBtn').addEventListener('click', disarmSecurity);
        }

        if ($('autoBtn')) {
            $('autoBtn').addEventListener('click', setAllAuto);
        }

        // Press Enter in PIN field to disarm
        if ($('pinInput')) {
            $('pinInput').addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    disarmSecurity();
                }
            });
        }
    }

    /* =========================
       STATUS LABEL
    ========================= */

    function setDemoStatus() {
        const strong = document.querySelector('.status-badge strong');
        const dot = document.querySelector('.status-dot');

        if (strong) {
            strong.textContent = 'Demo Mode';
        }

        if (dot) {
            dot.style.backgroundColor = '#22c55e';
            dot.style.boxShadow = '0 0 0 3px #22c55e33';
        }
    }

    /* =========================
       INITIALIZE
    ========================= */

    function init() {
        injectStyles();
        injectUI();
        setDemoStatus();
        updateActiveCount();

        console.log('BaseHome Local Demo Mode started.');
        console.log('Demo Security PIN: ' + DEMO_PIN);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
