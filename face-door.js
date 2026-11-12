/* =====================================================
   BaseHome - Smart Door (Face ID + Stranger Siren + Auto Light)
   ===================================================== */
(() => {
    'use strict';

    const ADMIN_USER      = 'admin';
    const ADMIN_PASS      = '1234';  
    const DOOR_PIN        = '1234';  
    const MATCH_DISTANCE  = 0.5;     
    const KNOWN_FRAMES    = 2;       
    const STRANGER_FRAMES = 5;       // Số khung hình liên tiếp nhận diện là người lạ thì hú còi
    const DOOR_OPEN_MS    = 5000;    
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let faces = {};
    try { faces = JSON.parse(localStorage.getItem('bh_faces') || '{}'); } catch (e) { faces = {}; }
    const saveFaces = () => { try { localStorage.setItem('bh_faces', JSON.stringify(faces)); } catch (e) {} };

    let modelsReady = false, modelsLoading = false;

    function log(message, isError, device = 'Front Door') {
        if (typeof window.addLog !== 'function') return;
        const time = typeof window.getCurrentTime === 'function' ? window.getCurrentTime() : new Date().toLocaleTimeString();
        try {
            window.addLog(device, message.toUpperCase(),
                isError ? 'var(--danger-text)' : 'var(--success-text)', time);
        } catch (e) { console.warn(e); }
    }

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
            case 'NotAllowedError': return 'Camera permission blocked';
            case 'NotReadableError': return 'Camera in use by another app';
            case 'NotFoundError': return 'No camera found';
            default: return 'Cannot open camera: ' + (err && err.message);
        }
    }

    // =====================================================
    // 1. MÀN HÌNH KHÓA (FACE GATE)
    // =====================================================
    let gateStream = null, gateKnownCount = 0, gateLastName = '';

    async function startGateCamera() {
        const video = $('fgVideo');
        const status = $('fgStatus');
        if (!video) return;
        try {
            if (status) status.textContent = 'Starting camera…';
            gateStream = await getCamera();
            video.srcObject = gateStream;
            if (status) status.textContent = 'Loading models…';
            await loadModels();
            if (status) status.textContent = 'Ready – looking for your face...';
            startGateLoop();
        } catch (err) {
            gateStream = null;
            if (status) status.textContent = cameraError(err);
        }
    }

    function stopGateCamera() {
        if (gateStream) gateStream.getTracks().forEach(t => t.stop());
        gateStream = null;
        const video = $('fgVideo');
        if (video) video.srcObject = null;
    }

    async function startGateLoop() {
        const video = $('fgVideo');
        const status = $('fgStatus');
        const banner = $('fgBanner');

        while (gateStream) {
            try {
                if (modelsReady && video && video.readyState >= 2) {
                    const det = await detect(video);
                    if (!det) {
                        gateKnownCount = 0;
                        gateLastName = '';
                        if (status) status.textContent = 'Nobody at the camera';
                    } else if (!Object.keys(faces).length) {
                        if (status) status.textContent = 'No face registered. Use password.';
                    } else {
                        const { name } = bestMatch(det.descriptor);
                        if (name) {
                            gateKnownCount = (name === gateLastName) ? gateKnownCount + 1 : 1;
                            gateLastName = name;
                            if (status) status.textContent = `✅ Recognized: ${name}`;
                            if (gateKnownCount >= KNOWN_FRAMES) {
                                if (banner) { banner.textContent = `Welcome, ${name}! Entering dashboard...`; banner.style.display = 'block'; }
                                log('Face ID Login Success: ' + name, false, 'Security Gate');
                                await sleep(800);
                                loginSuccessAndEnterDashboard();
                                break;
                            }
                        } else {
                            gateKnownCount = 0;
                            gateLastName = '';
                            if (status) status.textContent = '⚠ Unrecognized face (Stranger).';
                        }
                    }
                }
            } catch (e) {}
            await sleep(500);
        }
    }

    function loginSuccessAndEnterDashboard() {
        stopGateCamera();
        try { sessionStorage.setItem('bh_auth', '1'); } catch(e) {}
        
        document.documentElement.classList.add('bh-authed');
        const gate = $('faceGate');
        if (gate) gate.style.display = 'none';

        if (typeof window.toggleDevice === 'function') {
            window.toggleDevice('light', true);
        }
        try { localStorage.setItem('bh_light_auto', 'on'); } catch (e) {}
        log('Living Room Light auto-turned ON', false, 'System');

        setTimeout(() => { startDashboardCamera(); }, 300);
    }

    // =====================================================
    // 2. DASHBOARD SMART DOOR & CAMERA (CÓ HÚ CÒI KHI CÓ NGƯỜI LẠ)
    // =====================================================
    let dashStream = null, dashLoopRunning = false, adminMode = false, doorOpen = false;
    let dashKnown = 0, dashStranger = 0, dashLastName = '';
    let strangerAlarmTriggered = false;

    function setDashboardStatus(text, cls) {
        const s = $('fdStatus'), v = $('fdVideo');
        if (s) { s.textContent = text; s.className = 'fd-status ' + (cls || ''); }
        if (v) v.className = cls || '';
    }

    function openDoor(reason) {
        if (doorOpen) return;
        doorOpen = true;
        const doorEl = $('fdDoor');
        const iconEl = $('fdIcon');
        
        if (doorEl) { doorEl.textContent = '🔓 Door open – ' + reason; doorEl.classList.add('open'); }
        if (iconEl) iconEl.className = 'fa-solid fa-door-open';
        log('Door opened (' + reason + ')', false, 'Front Door');

        if (typeof window.toggleDevice === 'function') window.toggleDevice('light', true);
        try { localStorage.setItem('bh_light_auto', 'on'); } catch (e) {}

        setTimeout(() => {
            doorOpen = false;
            if (doorEl) { doorEl.textContent = '🔒 Door closed'; doorEl.classList.remove('open'); }
            if (iconEl) iconEl.className = 'fa-solid fa-door-closed';
        }, DOOR_OPEN_MS);
    }

    function handleDashboardFace(det) {
        if (adminMode) { setDashboardStatus('Manage mode – auto door paused'); return; }
        if (!det) { 
            dashKnown = dashStranger = dashLastName = 0; 
            strangerAlarmTriggered = false;
            setDashboardStatus('Nobody at the door'); 
            return; 
        }
        if (!Object.keys(faces).length) { setDashboardStatus('No faces registered yet'); return; }

        const { name } = bestMatch(det.descriptor);
        if (name) {
            dashStranger = 0;
            strangerAlarmTriggered = false;
            dashKnown = (name === dashLastName) ? dashKnown + 1 : 1;
            dashLastName = name;
            setDashboardStatus('✅ Welcome, ' + name, 'ok');
            
            if (typeof window.toggleDevice === 'function') window.toggleDevice('light', true);
            if (dashKnown >= KNOWN_FRAMES) openDoor('Face ID: ' + name);
        } else {
            dashKnown = 0; dashLastName = '';
            dashStranger++;
            setDashboardStatus('⚠ Stranger at the door!', 'bad');
            
            // XỬ LÝ KHI CÓ NGƯỜI LẠ ĐỨNG TRƯỚC CỬA: HÚ CÒI CẢNH BÁO
            if (dashStranger >= STRANGER_FRAMES && !strangerAlarmTriggered) {
                strangerAlarmTriggered = true;
                log('SECURITY ALERT: Stranger detected at door!', true, 'Front Door');
                if (typeof window.playKeypadSiren === 'function') {
                    window.playKeypadSiren(4); // Hú còi 4 giây
                }
            }
        }
    }

    async function dashboardLoop() {
        if (dashLoopRunning) return;
        dashLoopRunning = true;
        while (dashStream) {
            try {
                if (modelsReady && $('fdVideo').readyState >= 2) {
                    handleDashboardFace(await detect($('fdVideo')));
                }
            } catch (e) {}
            await sleep(400);
        }
        dashLoopRunning = false;
    }

    async function startDashboardCamera() {
        try {
            setDashboardStatus('Starting camera…');
            dashStream = await getCamera();
            $('fdVideo').srcObject = dashStream;
            $('fdCamBtn').textContent = 'Stop camera';
            try { localStorage.removeItem('bh_cam_off'); } catch (e) {}
        } catch (err) {
            dashStream = null;
            setDashboardStatus(cameraError(err), 'bad');
            return;
        }
        try {
            setDashboardStatus('Loading recognition models…');
            await loadModels();
            setDashboardStatus('Ready – face ID active');
            dashboardLoop();
        } catch (err) {
            setDashboardStatus('Cannot load models', 'bad');
        }
    }

    function stopDashboardCamera() {
        if (dashStream) dashStream.getTracks().forEach(t => t.stop());
        dashStream = null;
        $('fdVideo').srcObject = null;
        $('fdCamBtn').textContent = 'Start camera';
        dashKnown = dashStranger = 0;
        setDashboardStatus('Camera is off');
        try { localStorage.setItem('bh_cam_off', '1'); } catch (e) {}
    }

    // ---------- PIN & QUẢN LÝ ADMIN ----------
    function tryPin(pin) {
        if (pin === DOOR_PIN) {
            openDoor('PIN');
            return true;
        }
        return false;
    }
    window.BaseHomeDoor = { tryPin };

    function toggleAdmin() {
        if (adminMode) { adminMode = false; $('fdAdmin').hidden = true; return; }
        const pass = window.prompt('Admin password:');
        if (pass !== ADMIN_PASS) return;
        adminMode = true;
        $('fdAdmin').hidden = false;
        renderList();
    }

    function renderList() {
        const box = $('fdList');
        if (!box) return;
        box.innerHTML = '';
        Object.keys(faces).forEach(n => {
            const row = document.createElement('div');
            row.className = 'fd-person';
            row.innerHTML = `👤 ${n} <button onclick="delete faces['${n}']; localStorage.setItem('bh_faces', JSON.stringify(faces)); location.reload();">Delete</button>`;
            box.appendChild(row);
        });
    }

    async function enroll() {
        const name = $('fdName').value.trim();
        const msg = $('fdEnrollMsg');
        if (!name || !dashStream) { msg.textContent = 'Enter name & start dashboard camera first.'; return; }
        
        const samples = [];
        for (let i = 0; i < 5; i++) {
            msg.textContent = `Capturing... (${i+1}/5)`;
            const det = await detect($('fdVideo'));
            if (det) samples.push(Array.from(det.descriptor));
            await sleep(500);
        }
        if (samples.length >= 3) {
            faces[name] = samples;
            saveFaces();
            renderList();
            msg.textContent = `Saved "${name}" successfully!`;
            log('Face registered: ' + name, false, 'Front Door');
        } else {
            msg.textContent = 'Capture failed. Try better lighting.';
        }
    }

    function checkStoredLightState() {
        try {
            if (localStorage.getItem('bh_light_auto') === 'on') {
                if (typeof window.toggleDevice === 'function') window.toggleDevice('light', true);
            }
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', () => {
        checkStoredLightState(); 

        try {
            if (sessionStorage.getItem('bh_auth') === '1') {
                const gate = $('faceGate');
                if (gate) gate.style.display = 'none';
                setTimeout(() => startDashboardCamera(), 300);
            } else {
                startGateCamera();
            }
        } catch (e) {
            startGateCamera();
        }

        $('fgCamBtn')?.addEventListener('click', () => { if (!gateStream) startGateCamera(); });
        $('fgForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = $('fgUser').value.trim();
            const p = $('fgPass').value.trim();
            if (u === ADMIN_USER && p === ADMIN_PASS) {
                log('Password Login Success', false, 'Security Gate');
                loginSuccessAndEnterDashboard();
            } else {
                const msg = $('fgMsg');
                if (msg) msg.textContent = 'Invalid username or password! (admin / 1234)';
            }
        });

        $('fgLogout')?.addEventListener('click', () => {
            try { sessionStorage.removeItem('bh_auth'); } catch(e) {}
            location.reload();
        });

        $('fdCamBtn')?.addEventListener('click', () => dashStream ? stopDashboardCamera() : startDashboardCamera());
        $('fdManageBtn')?.addEventListener('click', toggleAdmin);
        $('fdPinBtn')?.addEventListener('click', () => {
            tryPin($('fdPin').value.trim());
            $('fdPin').value = '';
        });
        $('fdEnrollBtn')?.addEventListener('click', enroll);
    });
})();