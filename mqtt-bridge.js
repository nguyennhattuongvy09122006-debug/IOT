/* =====================================================
   BaseHome - mqtt-bridge.js
   Nối dashboard với ESP32 qua MQTT (HiveMQ, WebSocket bảo mật).
   Nạp SAU script.js và SAU thư viện mqtt.js.
   ===================================================== */
(() => {
    'use strict';

    // ---------- CẤU HÌNH (đổi HOME_ID cho khớp firmware) ----------
    const HOME_ID = 'group1';
    const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
    const HOT_TEMP = 30; // °C, thẻ nhiệt độ chuyển đỏ

    const T = {
        sensors: `basehome/${HOME_ID}/sensors`,
        log: `basehome/${HOME_ID}/log`,
        status: `basehome/${HOME_ID}/status`,
        control: `basehome/${HOME_ID}/control`
    };
    const DEVICE_NAMES = {
        light: 'Living Room Light',
        fan: 'Smart Fan',
        heater: 'Heater'
    };

    const $ = id => document.getElementById(id);
    let client = null;
    let brokerOk = false;
    let espOnline = null; // null = chưa biết

    // ---------- GIỮ HÀM GỐC, TẮT DỮ LIỆU NGẪU NHIÊN ----------
    const originalUpdate = window.updateSensorData;
    const originalToggle = window.toggleDevice;
    // script.js gọi updateSensorData(random) mỗi 3 giây: vô hiệu hóa nó
    window.updateSensorData = () => {};

    // ---------- CSS THÊM ----------
    function injectStyles() {
        const css = `
        .card.temp-hot{border-color:#ef4444;background:#fef2f2}
        .card.temp-hot .card-value{color:#dc2626}
        body.dark-mode .card.temp-hot{background:#3b1f26}
        .fa-fire.heater-on{color:#ef4444}
        .sec-panel{margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color)}
        .sec-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:14px;font-weight:600}
        .sec-mode{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700}
        .sec-home{background:var(--success-bg);color:var(--success-text)}
        .sec-away{background:#dbeafe;color:#1e40af}
        .sec-alarm{background:var(--danger-bg);color:var(--danger-text)}
        .sec-motion{margin-left:auto;font-size:12px;font-weight:500;color:var(--text-sub)}
        .sec-motion.active{color:#ea580c;font-weight:700}
        .sec-actions{display:flex;gap:8px;flex-wrap:wrap}
        .sec-actions button{border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-main);padding:8px 14px;border-radius:20px;cursor:pointer;font-size:13px}
        .sec-actions button:hover{background:var(--border-color)}
        .sec-actions button.primary{background:var(--primary);border-color:var(--primary);color:#fff}
        .sec-actions input{flex:1;min-width:90px;max-width:140px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);padding:8px 12px;border-radius:20px;font-size:13px;outline:none}
        #alarmBanner{display:none;align-items:center;gap:10px;background:#dc2626;color:#fff;padding:14px 18px;border-radius:14px;margin-bottom:20px;font-weight:700;font-size:14px}
        #alarmBanner.show{display:flex;animation:alarmBlink 1s infinite}
        @keyframes alarmBlink{50%{opacity:.65}}
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---------- THÊM GIAO DIỆN CÒN THIẾU ----------
    function injectUI() {
        // 1) Thiết bị Heater (bỏ qua nếu index.html đã có sẵn)
        const grid = document.querySelector('.devices-grid');
        if (grid && !$('heaterToggle')) {
            grid.insertAdjacentHTML('beforeend', `
                <div class="device-item">
                    <div class="device-top">
                        <span class="device-name"><i class="fa-solid fa-fire" id="heaterIcon"></i> Heater</span>
                        <label class="switch">
                            <input type="checkbox" id="heaterToggle">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <span class="badge-status badge-off" id="heaterBadge">OFF</span>
                </div>`);
            $('heaterToggle').addEventListener('change', () => window.toggleDevice('heater'));
        }

        // 2) Khu vực bảo mật (HOME / AWAY / ALARM)
        if (grid && !$('secMode')) {
            grid.insertAdjacentHTML('afterend', `
                <div class="sec-panel">
                    <div class="sec-row">
                        <span><i class="fa-solid fa-shield-halved"></i> Security</span>
                        <span class="sec-mode sec-home" id="secMode">HOME</span>
                        <span class="sec-motion" id="motionChip"><i class="fa-solid fa-person-walking"></i> <span id="motionText">No motion</span></span>
                    </div>
                    <div class="sec-actions">
                        <button id="armBtn">Arm (AWAY)</button>
                        <input id="pinInput" type="password" inputmode="numeric" maxlength="8" placeholder="PIN">
                        <button id="disarmBtn" class="primary">Disarm</button>
                        <button id="autoBtn">All AUTO</button>
                    </div>
                </div>`);

            $('armBtn').addEventListener('click', () => send({ cmd: 'arm' }));
            $('disarmBtn').addEventListener('click', () => {
                const pin = $('pinInput').value.trim();
                if (!pin) { $('pinInput').focus(); return; }
                send({ cmd: 'disarm', pin });
                $('pinInput').value = '';
            });
            $('autoBtn').addEventListener('click', () => send({ device: 'all', state: 'AUTO' }));
        }

        // 3) Banner cảnh báo ALARM
        const header = document.querySelector('.container header');
        if (header && !$('alarmBanner')) {
            header.insertAdjacentHTML('afterend',
                '<div id="alarmBanner"><i class="fa-solid fa-triangle-exclamation"></i> ALARM: phát hiện xâm nhập hoặc nhập sai PIN 3 lần. Nhập PIN để tắt.</div>');
        }
    }

    // ---------- GỬI LỆNH ----------
    function send(obj) {
        if (!client || !brokerOk) return false;
        client.publish(T.control, JSON.stringify(obj));
        return true;
    }

    // Bọc toggleDevice: khi đã nối MQTT thì chỉ gửi lệnh, giao diện đổi theo trạng thái ESP32
       // Bọc toggleDevice: luôn gửi lệnh nếu đã nối broker.
    // Nếu ESP32 chưa online thì vẫn đổi giao diện và ghi lịch sử (chế độ mô phỏng).
    window.toggleDevice = function (type, state = null) {
        const el = $(type + 'Toggle');
        if (!el) return;
        if (state !== null) el.checked = state;

        if (brokerOk) send({ device: type, state: el.checked ? 'ON' : 'OFF' });

        if (espOnline !== true && originalToggle) {
            originalToggle(type, state);
        }
    };

    // ---------- CẬP NHẬT GIAO DIỆN ----------
    function setDeviceUI(key, on, mode) {
        const t = $(key + 'Toggle');
        const b = $(key + 'Badge');
        if (!t) return;
        t.checked = !!on;
        if (b) {
            b.className = 'badge-status ' + (on ? 'badge-on' : 'badge-off');
            b.textContent = (on ? 'ON' : 'OFF') + (mode ? ' · ' + mode : '');
        }
        if (key === 'fan' && $('fanIcon')) $('fanIcon').classList.toggle('spinning', !!on);
        if (key === 'heater' && $('heaterIcon')) $('heaterIcon').classList.toggle('heater-on', !!on);
    }

    function setBadge() {
        const strong = document.querySelector('.status-badge strong');
        const dot = document.querySelector('.status-dot');
        let text, color;
        if (!brokerOk) { text = 'Connecting…'; color = '#f59e0b'; }
        else if (espOnline === false) { text = 'Device offline'; color = '#ef4444'; }
        else if (espOnline === null) { text = 'Waiting for device'; color = '#f59e0b'; }
        else { text = 'Connected'; color = '#22c55e'; }
        if (strong) strong.textContent = text;
        if (dot) {
            dot.style.backgroundColor = color;
            dot.style.boxShadow = `0 0 0 3px ${color}33`;
        }
    }

    function applyState(d) {
        if (espOnline === null) { espOnline = true; setBadge(); }

        // Nhiệt độ, độ ẩm, biểu đồ
        if (d.temp !== undefined && d.humi !== undefined) {
            originalUpdate(d.temp, d.humi);
            const card = $('tempValue') && $('tempValue').closest('.card');
            if (card) card.classList.toggle('temp-hot', Number(d.temp) > HOT_TEMP);

            const ai = $('aiMessage');
            if (ai) {
                ai.innerHTML = Number(d.temp) > HOT_TEMP
                    ? `<span style="color:#f97316;font-weight:600;">[AI Warning]</span> Temperature is high (${d.temp}°C). The fan should be running.`
                    : `System environment is stable. Temperature (${d.temp}°C) and humidity (${d.humi}%) are at optimal levels.`;
            }
        }

        // Thiết bị
        const devs = d.devices || {};
        Object.keys(devs).forEach(k => setDeviceUI(k, devs[k].on, devs[k].mode));

        // Số thiết bị đang bật
        const total = d.total !== undefined ? d.total : 3;
        const active = d.active !== undefined
            ? d.active
            : Object.values(devs).filter(v => v.on).length;
        const count = $('activeCount');
        if (count) {
            count.innerHTML = `${active} <span style="font-size:14px;font-weight:normal;color:var(--text-sub);">/ ${total} devices</span>`;
        }

        // Chuyển động
        const chip = $('motionChip');
        if (chip) {
            chip.classList.toggle('active', !!d.motion);
            $('motionText').textContent = d.motion ? 'Motion detected' : 'No motion';
        }

        // Chế độ bảo mật
        const mode = $('secMode');
        if (mode) {
            const m = d.alarm ? 'ALARM' : (d.armed ? 'AWAY' : 'HOME');
            mode.textContent = m;
            mode.className = 'sec-mode sec-' + m.toLowerCase();
        }
        const banner = $('alarmBanner');
        if (banner) banner.classList.toggle('show', !!d.alarm);
    }

    function applyLog(raw) {
        let device = 'System';
        let action = raw;
        try {
            const j = JSON.parse(raw);
            if (j && typeof j === 'object') {
                device = j.device || j.name || j.sensor || 'System';
                action = j.action || j.event || j.status || j.msg || j.message || JSON.stringify(j);
            } else {
                action = String(j);
            }
        } catch (e) { /* log dạng chữ thường */ }

        device = DEVICE_NAMES[device] || device;
        const up = String(action).toUpperCase();
        const color = /ALARM|WRONG|OFF|AWAY|ERR/.test(up) ? 'var(--danger-text)'
            : /ON|MOTION|HOME|AUTO/.test(up) ? 'var(--success-text)'
            : 'var(--primary)';
        addLog(device, up, color, getCurrentTime());

        // giữ bảng gọn: tối đa 40 dòng
        const body = $('logTableBody');
        while (body && body.rows.length > 40) body.deleteRow(body.rows.length - 1);
    }

    function applyStatus(raw) {
        let s = String(raw).toLowerCase();
        try {
            const j = JSON.parse(raw);
            if (j && typeof j === 'object') s = String(j.status || j.state || s).toLowerCase();
        } catch (e) { /* chữ thường */ }
        espOnline = s.includes('online');
        setBadge();
    }

    // ---------- KẾT NỐI MQTT ----------
    function connect() {
        if (typeof mqtt === 'undefined') {
            console.error('Chưa nạp thư viện mqtt.js');
            return;
        }
        client = mqtt.connect(BROKER_URL, {
            clientId: 'basehome-web-' + Math.random().toString(16).slice(2, 10),
            clean: true,
            reconnectPeriod: 3000,
            connectTimeout: 10000
        });

        client.on('connect', () => {
            brokerOk = true;
            client.subscribe([T.sensors, T.log, T.status]);
            setBadge();
        });
        ['close', 'offline', 'error'].forEach(ev =>
            client.on(ev, () => { brokerOk = false; setBadge(); })
        );

        client.on('message', (topic, payload) => {
            const text = payload.toString();
            try {
                if (topic === T.sensors) applyState(JSON.parse(text));
                else if (topic === T.log) applyLog(text);
                else if (topic === T.status) applyStatus(text);
            } catch (e) {
                console.warn('Không đọc được tin nhắn từ', topic, text, e);
            }
        });
    }

    // ---------- KHỞI ĐỘNG ----------
    injectStyles();
    injectUI();
    setBadge();
    connect();
})();