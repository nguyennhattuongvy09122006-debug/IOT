/* =====================================================
   BaseHome - Smart Door (Face ID login + Face ID door + PIN)
   Giao diện nằm sẵn trong index.html + style.css.
   File này chỉ chứa LOGIC (gắn vào các phần tử có sẵn).
   Cần: face-api.js (nạp trong index.html) + script.js (addLog)
   ===================================================== */

(() => {
    'use strict';

    // ---------- CẤU HÌNH ----------
    const ADMIN_USER      = 'admin';
    const ADMIN_PASS      = '1234';  // mật khẩu đăng nhập + quản lý khuôn mặt
    const DOOR_PIN        = '1234';  // mã PIN mở cửa
    const MAX_TRIES       = 3;       // sai bao nhiêu lần thì báo động + khóa
    const LOCK_SECONDS    = 10;
    const MATCH_DISTANCE  = 0.5;     // nhỏ = khắt khe hơn (0.4 - 0.6)
    const KNOWN_FRAMES    = 3;       // nhận ra liên tiếp ~1.2s
    const STRANGER_FRAMES = 6;       // người lạ liên tiếp ~2.4s thì hú còi
    const DOOR_OPEN_MS    = 5000;    // cửa mở bao lâu
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let faces = {};
    try { faces = JSON.parse(localStorage.getItem('bh_faces') || '{}'); } catch (e) { faces = {}; }
    const saveFaces = () => { try { localStorage.setItem('bh_faces', JSON.stringify(faces)); } catch (e) {} };

    let authed = false, modelsReady = false, modelsLoading = false;
    let audioCtx = null;

    // ---------- TIỆN ÍCH ----------
    function log(message, isError, device = 'Front Door') {
        if (typeof window.addLog !== 'function') return;
        const time = typeof window.getCurrentTime === 'function' ? window.getCurrentTime() : new Date().toLocaleTimeString();
        try {
            window.addLog(device, message.toUpperCase(),
                isError ? 'var(--danger-text)' : 'var(--success-text)', time);
        } catch (e) { console.warn(e); }
    }

    function siren(seconds) {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'square';
        osc.connect(gain); gain.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        gain.gain.setValueAtTime(0.15, t);
        for (let i = 0; i < seconds * 4; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t + i * 0.25);
        gain.gain.setValueAtTime(0.15, t + seconds);
        gain.gain.linearRampToValueAtTime(0, t + seconds + 0.05);
        osc.start(t); osc.stop(t + seconds + 0.1);
    }

    // Còi + banner đỏ của dashboard (#alarmBanner)
    function alarm(text, seconds = 5) {
        siren(seconds);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        log(text, true);

        const banner = $('alarmBanner');
        if (!banner) return;
        const old = banner.innerHTML;
        const wasShown = banner.classList.contains('show');
        banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + text;
        banner.classList.add('show');
        setTimeout(() => {
            banner.innerHTML = old;
            if (!wasShown) banner.classList.remove('show');
        }, seconds * 1000 + 500);
    }

    // ---------- NHẬN DIỆN (dùng chung cho cổng đăng nhập + cửa) ----------
    const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const detect = video => faceapi.detectSingleFace(video, opts()).withFaceLandmarks().withFaceDescriptor();

    function bestMatch(desc) {
        let best = { name: null, dist: 9 };
        for (const [name, list] of Object.entries(faces)) {
            for (const d of list) {
                const dist = faceapi.euclideanDistance(desc, d);
                if (dist < best.dist) best = { name, dist };
            }
        }
        if (best.dist > MATCH_DISTANCE) best.name = null;
        return best;
    }

    async function loadModels() {
        if (modelsReady) return;
        if (modelsLoading) { while (modelsLoading) await sleep(200); return; }
        modelsLoading = true;
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            modelsReady = true;
        } finally { modelsLoading = false; }
    }

    // Mở camera: không bị treo vô hạn nếu trình duyệt đang chờ cấp quyền / camera bị app khác giữ
    function getCamera(ms = 10000) {
        return new Promise((resolve, reject) => {
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; reject(new Error('timeout')); }, ms);
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
                .then(st => {
                    clearTimeout(timer);
                    if (timedOut) st.getTracks().forEach(t => t.stop());
                    else resolve(st);
                })
                .catch(err => { clearTimeout(timer); if (!timedOut) reject(err); });
        });
    }

    function cameraError(err) {
        switch (err && err.name) {
            case 'NotAllowedError':
                return 'Camera permission blocked – click the lock icon next to the address bar, allow Camera, then press Retry';
            case 'NotReadableError':
                return 'Camera is in use by another app/tab (Zoom, Teams, Camera app…) – close it, then press Retry';
            case 'NotFoundError':
                return 'No camera found on this device';
            default:
                if (err && err.message === 'timeout')
                    return 'No response from camera – click Allow in the browser popup (top-left, near the address bar), or close other apps using the camera, then press Retry';
                return 'Cannot open camera: ' + (err && err.message);
        }
    }

    function cameraProblem() {
        if (typeof faceapi === 'undefined') return 'face-api.js not loaded (check Internet)';
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'Camera needs HTTPS or localhost';
        return '';
    }

    // =====================================================
    //  A. CỔNG ĐĂNG NHẬP DASHBOARD
    // =====================================================
    let gateStream = null, gateTries = 0, gateLocked = false;
    let gKnown = 0, gStranger = 0, gLast = '', gAlarmCool = 0;

    function gateStatus(text, cls) {
        const s = $('fgStatus'), v = $('fgVideo');
        if (s) { s.textContent = text; s.className = 'fg-status ' + (cls || ''); }
        if (v) v.className = cls || '';
    }

    function gateAlarm(text, seconds = 5) {
        siren(seconds);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        log(text, true, 'Dashboard Login');
        const b = $('fgBanner');
        if (!b) return;
        b.textContent = '⚠ ' + text;
        b.classList.add('show');
        setTimeout(() => b.classList.remove('show'), seconds * 1000 + 500);
    }

    function gateHandle(det) {
        if (!det) { gKnown = gStranger = 0; gLast = ''; gateStatus('Look at the camera to log in'); return; }
        if (!Object.keys(faces).length) {
            gateStatus('No faces registered yet – log in with password, then add faces in Smart Door → Manage faces');
            return;
        }
        const { name } = bestMatch(det.descriptor);
        if (name) {
            gStranger = 0;
            gKnown = (name === gLast) ? gKnown + 1 : 1;
            gLast = name;
            gateStatus('✅ Welcome, ' + name, 'ok');
            if (gKnown >= KNOWN_FRAMES) unlock('Face ID: ' + name);
        } else {
            gKnown = 0; gLast = '';
            gStranger++;
            gateStatus('⚠ Unknown face – access denied', 'bad');
            if (gStranger >= STRANGER_FRAMES && Date.now() > gAlarmCool) {
                gAlarmCool = Date.now() + 8000;
                gStranger = 0;
                gateAlarm('ALERT: unknown person trying to log in');
            }
        }
    }

    async function gateLoop() {
        while (gateStream && !authed) {
            try {
                if ($('fgVideo').readyState >= 2) gateHandle(await detect($('fgVideo')));
            } catch (e) { console.error(e); }
            await sleep(400);
        }
    }

    async function startGateCamera() {
        const problem = cameraProblem();
        if (problem) { gateStatus(problem + ' – use password', 'bad'); return; }
        try {
            gateStatus('Starting camera… (click Allow if the browser asks)');
            gateStream = await getCamera();
            $('fgVideo').srcObject = gateStream;
        } catch (err) {
            gateStream = null;
            gateStatus(cameraError(err), 'bad');
            return;
        }
        try {
            gateStatus('Loading recognition models…');
            await loadModels();
        } catch (err) {
            gateStatus('Cannot load models (need Internet) – use password', 'bad');
            return;
        }
        gateStatus('Look at the camera to log in');
        gateLoop();
    }

    function stopGateCamera() {
        if (gateStream) gateStream.getTracks().forEach(t => t.stop());
        gateStream = null;
    }

    function onGatePassword(e) {
        e.preventDefault();
        if (gateLocked) return;
        const user = $('fgUser').value.trim(), pass = $('fgPass').value;
        $('fgPass').value = '';
        if (user === ADMIN_USER && pass === ADMIN_PASS) { gateTries = 0; unlock('password'); return; }

        gateTries++;
        const g = $('faceGate');
        g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');

        if (gateTries >= MAX_TRIES) {
            gateLocked = true;
            $('fgBtn').disabled = true;
            gateAlarm('ALARM: too many wrong passwords');
            let s = LOCK_SECONDS;
            $('fgMsg').textContent = `Locked. Try again in ${s}s`;
            const t = setInterval(() => {
                s--;
                if (s <= 0) {
                    clearInterval(t);
                    gateLocked = false; gateTries = 0;
                    $('fgBtn').disabled = false;
                    $('fgMsg').textContent = '';
                } else $('fgMsg').textContent = `Locked. Try again in ${s}s`;
            }, 1000);
        } else {
            siren(2);
            $('fgMsg').textContent = `Wrong username or password (${gateTries}/${MAX_TRIES})`;
        }
    }

    function unlock(method) {
        if (authed) return;
        authed = true;
        try { sessionStorage.setItem('bh_auth', '1'); } catch (e) {}
        stopGateCamera();
        document.documentElement.classList.add('bh-authed');
        log('Login (' + method + ')', false, 'Dashboard Login');
        startDoorCamIfWanted();
    }

    // =====================================================
    //  B. CỬA THÔNG MINH (card Smart Door)
    // =====================================================
    let stream = null, loopRunning = false, adminMode = false, doorOpen = false;
    let known = 0, stranger = 0, lastName = '', alarmCool = 0;

    function setStatus(text, cls) {
        const s = $('fdStatus'), v = $('fdVideo');
        if (s) { s.textContent = text; s.className = 'fd-status ' + (cls || ''); }
        if (v) v.className = cls || '';
    }

    function openDoor(reason) {
        if (doorOpen) return;
        doorOpen = true;
        $('fdDoor').textContent = '🔓 Door open – ' + reason;
        $('fdDoor').classList.add('open');
        $('fdIcon').className = 'fa-solid fa-door-open';
        log('Door opened (' + reason + ')', false);
        if (typeof window.setKeypadMessage === 'function') window.setKeypadMessage('Door opened: ' + reason);

        // >>> NỐI PHẦN CỨNG Ở ĐÂY (ESP32 / servo / khóa điện từ) <<<
        // fetch('http://IP_ESP32/open');
        // mqttClient.publish('basehome/door', 'OPEN');

        setTimeout(() => {
            doorOpen = false;
            $('fdDoor').textContent = '🔒 Door closed';
            $('fdDoor').classList.remove('open');
            $('fdIcon').className = 'fa-solid fa-door-closed';
            // fetch('http://IP_ESP32/close');
        }, DOOR_OPEN_MS);
    }

    function handle(det) {
        if (adminMode) { setStatus('Manage mode – auto door paused'); return; }
        if (!det) { known = stranger = 0; lastName = ''; setStatus('Nobody at the door'); return; }
        if (!Object.keys(faces).length) { setStatus('No faces registered yet (Manage faces → add)'); return; }

        const { name } = bestMatch(det.descriptor);
        if (name) {
            stranger = 0;
            known = (name === lastName) ? known + 1 : 1;
            lastName = name;
            setStatus('✅ Welcome, ' + name, 'ok');
            if (known >= KNOWN_FRAMES) openDoor('Face ID: ' + name);
        } else {
            known = 0; lastName = '';
            stranger++;
            setStatus('⚠ Stranger at the door…', 'bad');
            if (stranger >= STRANGER_FRAMES && Date.now() > alarmCool) {
                alarmCool = Date.now() + 8000;
                stranger = 0;
                alarm('ALERT: stranger at the front door!');
            }
        }
    }

    async function loop() {
        if (loopRunning) return;
        loopRunning = true;
        while (stream) {
            try {
                if (modelsReady && $('fdVideo').readyState >= 2) handle(await detect($('fdVideo')));
            } catch (e) { console.error(e); }
            await sleep(400);
        }
        loopRunning = false;
    }

    async function startCamera() {
        const problem = cameraProblem();
        if (problem) { setStatus(problem, 'bad'); return; }
        try {
            setStatus('Starting camera… (click Allow if the browser asks)');
            stream = await getCamera();
            $('fdVideo').srcObject = stream;
            $('fdCamBtn').textContent = 'Stop camera';
            try { localStorage.removeItem('bh_cam_off'); } catch (e) {}
        } catch (err) {
            stream = null;
            setStatus(cameraError(err), 'bad');
            return;
        }
        try {
            setStatus('Loading recognition models…');
            await loadModels();
            setStatus('Ready – look at the camera');
            loop();
        } catch (err) {
            setStatus('Cannot load models (need Internet)', 'bad');
        }
    }

    function stopCamera() {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null;
        $('fdVideo').srcObject = null;
        $('fdCamBtn').textContent = 'Start camera';
        known = stranger = 0;
        setStatus('Camera is off');
        try { localStorage.setItem('bh_cam_off', '1'); } catch (e) {}
    }

    function startDoorCamIfWanted() {
        if (!authed) return;
        let off = false;
        try { off = localStorage.getItem('bh_cam_off') === '1'; } catch (e) {}
        if (!off && !stream) startCamera();
    }

    // ---------- PIN ----------
    let pinTries = 0, pinLocked = false;

    function pinMsg(text, color) {
        const m = $('fdPinMsg');
        if (m) { m.textContent = text; m.style.color = color || 'var(--text-sub)'; }
        if (typeof window.setKeypadMessage === 'function' && text) window.setKeypadMessage(text);
    }

    function tryPin(pin) {
        if (pinLocked) return false;
        if (pin === DOOR_PIN) {
            pinTries = 0;
            pinMsg('Correct PIN – door opened', 'var(--success-text)');
            openDoor('PIN');
            return true;
        }
        pinTries++;
        if (pinTries >= MAX_TRIES) {
            pinLocked = true;
            alarm('ALARM: 3 wrong door PIN attempts');
            let s = LOCK_SECONDS;
            pinMsg(`Locked. Try again in ${s}s`, 'var(--danger-text)');
            const t = setInterval(() => {
                s--;
                if (s <= 0) { clearInterval(t); pinLocked = false; pinTries = 0; pinMsg(''); }
                else pinMsg(`Locked. Try again in ${s}s`, 'var(--danger-text)');
            }, 1000);
        } else {
            siren(2);
            log('Wrong door PIN', true);
            pinMsg(`Wrong PIN (${pinTries}/${MAX_TRIES})`, 'var(--danger-text)');
        }
        return false;
    }

    function submitPin() {
        const input = $('fdPin');
        tryPin(input.value.trim());
        input.value = '';
    }

    // Cho keypad.js gọi: phím C = mở cửa bằng PIN đang nhập
    window.BaseHomeDoor = { tryPin };

    // ---------- QUẢN LÝ KHUÔN MẶT ----------
    function toggleAdmin() {
        if (adminMode) { adminMode = false; $('fdAdmin').hidden = true; return; }
        const pass = window.prompt('Admin password:');
        if (pass === null) return;
        if (pass !== ADMIN_PASS) { pinMsg('Wrong admin password', 'var(--danger-text)'); siren(2); return; }
        adminMode = true;
        $('fdAdmin').hidden = false;
        renderList();
    }

    function renderList() {
        const box = $('fdList');
        box.innerHTML = '';
        const names = Object.keys(faces);
        if (!names.length) { box.textContent = 'No one registered.'; return; }
        names.forEach(n => {
            const row = document.createElement('div');
            row.className = 'fd-person';
            const label = document.createElement('span');
            label.textContent = `👤 ${n} (${faces[n].length} samples)`;
            const del = document.createElement('button');
            del.textContent = 'Delete';
            del.onclick = () => { delete faces[n]; saveFaces(); renderList(); };
            row.append(label, del);
            box.appendChild(row);
        });
    }

    async function enroll() {
        const name = $('fdName').value.trim();
        const msg = $('fdEnrollMsg');
        if (!name) { msg.textContent = 'Enter a name first.'; return; }
        if (!stream) { msg.textContent = 'Start the camera first.'; return; }
        if (!modelsReady) { msg.textContent = 'Models still loading, wait a moment.'; return; }

        $('fdEnrollBtn').disabled = true;
        const samples = [];
        for (let i = 0; i < 5; i++) {
            msg.textContent = `Look at the camera, turn your head slightly… (${samples.length}/5)`;
            const det = await detect($('fdVideo'));
            if (det) samples.push(Array.from(det.descriptor));
            await sleep(500);
        }
        $('fdEnrollBtn').disabled = false;

        if (samples.length < 3) { msg.textContent = 'Could not see the face clearly. Try better lighting.'; return; }
        faces[name] = (faces[name] || []).concat(samples);
        saveFaces();
        renderList();
        $('fdName').value = '';
        msg.textContent = `Saved ${samples.length} samples for "${name}".`;
        log('Face registered: ' + name, false);
    }

    // =====================================================
    //  KHỞI TẠO: gắn sự kiện vào các phần tử có sẵn trong index.html
    // =====================================================
    function bindUI() {
        $('fgForm')?.addEventListener('submit', onGatePassword);
        $('fgCamBtn')?.addEventListener('click', () => { stopGateCamera(); startGateCamera(); });
        $('fgLogout')?.addEventListener('click', () => {
            try { sessionStorage.removeItem('bh_auth'); } catch (e) {}
            location.reload();
        });

        $('fdCamBtn')?.addEventListener('click', () => stream ? stopCamera() : startCamera());
        $('fdManageBtn')?.addEventListener('click', toggleAdmin);
        $('fdPinBtn')?.addEventListener('click', submitPin);
        $('fdPin')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
        $('fdEnrollBtn')?.addEventListener('click', enroll);
    }

    function init() {
        try { authed = sessionStorage.getItem('bh_auth') === '1'; } catch (e) {}
        bindUI();
        if (authed) {
            document.documentElement.classList.add('bh-authed');
            startDoorCamIfWanted();
        } else {
            startGateCamera();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();