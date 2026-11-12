/* =====================================================
   BaseHome - Smart Door (Face ID + Auto Light Integration)
   ===================================================== */
(() => {
    'use strict';

    const ADMIN_USER      = 'admin';
    const ADMIN_PASS      = '1234';  
    const DOOR_PIN        = '1234';  
    const MAX_TRIES       = 3;       
    const LOCK_SECONDS    = 10;
    const MATCH_DISTANCE  = 0.5;     
    const KNOWN_FRAMES    = 3;       
    const STRANGER_FRAMES = 6;       
    const DOOR_OPEN_MS    = 5000;    
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

    const $ = id => document.getElementById(id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let faces = {};
    try { faces = JSON.parse(localStorage.getItem('bh_faces') || '{}'); } catch (e) { faces = {}; }
    const saveFaces = () => { try { localStorage.setItem('bh_faces', JSON.stringify(faces)); } catch (e) {} };

    let authed = false, modelsReady = false, modelsLoading = false;
    let audioCtx = null;

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
            case 'NotAllowedError': return 'Camera permission blocked – allow Camera in browser settings';
            case 'NotReadableError': return 'Camera is in use by another app – close it and retry';
            case 'NotFoundError': return 'No camera found';
            default: return 'Cannot open camera: ' + (err && err.message);
        }
    }

    // =====================================================
    //  CỬA THÔNG MINH & NHẬN DIỆN KHUÔN MẶT
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

        // 1. Tự động bật đèn khi nhận diện thành công
        if (typeof window.toggleDevice === 'function') {
            window.toggleDevice('light', true);
        }

        // 2. Lưu trạng thái vào localStorage để duy trì sáng đèn khi bật/tắt lại camera
        try {
            localStorage.setItem('bh_light_auto', 'on');
        } catch (e) {}

        setTimeout(() => {
            doorOpen = false;
            $('fdDoor').textContent = '🔒 Door closed';
            $('fdDoor').classList.remove('open');
            $('fdIcon').className = 'fa-solid fa-door-closed';
        }, DOOR_OPEN_MS);
    }

    function handle(det) {
        // QUAN TRỌNG: Chỉ quét tự động khi đang KHÔNG ở chế độ Manage faces (adminMode = false)
        if (adminMode) { setStatus('Manage mode – auto door paused'); return; }
        if (!det) { known = stranger = 0; lastName = ''; setStatus('Nobody at the door'); return; }
        if (!Object.keys(faces).length) { setStatus('No faces registered yet (Manage faces → add)'); return; }

        const { name } = bestMatch(det.descriptor);
        if (name) {
            stranger = 0;
            known = (name === lastName) ? known + 1 : 1;
            lastName = name;
            setStatus('✅ Welcome, ' + name, 'ok');
            if (known >= KNOWN_FRAMES) {
                openDoor('Face ID: ' + name);
            }
        } else {
            known = 0; lastName = '';
            stranger++;
            setStatus('⚠ Stranger at the door…', 'bad');
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
        try {
            setStatus('Starting camera…');
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

    // ---------- PIN & QUẢN LÝ ----------
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
            row.innerHTML = `<span>👤 ${n}</span> <button onclick="delete faces['${n}']; localStorage.setItem('bh_faces', JSON.stringify(faces)); location.reload();">Delete</button>`;
            box.appendChild(row);
        });
    }

    async function enroll() {
        const name = $('fdName').value.trim();
        const msg = $('fdEnrollMsg');
        if (!name || !stream) { msg.textContent = 'Enter name & start camera first.'; return; }
        
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
            log('Face registered: ' + name, false);
        } else {
            msg.textContent = 'Capture failed. Try better lighting.';
        }
    }

    // Khôi phục trạng thái đèn đã lưu
    function checkStoredLightState() {
        try {
            if (localStorage.getItem('bh_light_auto') === 'on') {
                if (typeof window.toggleDevice === 'function') {
                    window.toggleDevice('light', true);
                }
            }
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', () => {
        checkStoredLightState(); 

        $('fdCamBtn')?.addEventListener('click', () => stream ? stopCamera() : startCamera());
        $('fdManageBtn')?.addEventListener('click', toggleAdmin);
        $('fdPinBtn')?.addEventListener('click', () => {
            tryPin($('fdPin').value.trim());
            $('fdPin').value = '';
        });
        $('fdEnrollBtn')?.addEventListener('click', enroll);

        try {
            if (localStorage.getItem('bh_cam_off') !== '1') {
                startCamera();
            }
        } catch (e) {
            startCamera();
        }
    });
})();