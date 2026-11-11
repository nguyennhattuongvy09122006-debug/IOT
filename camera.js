(() => {
    const chartCard = document.getElementById('sensorChart')?.closest('.card');
    if (!chartCard) return;

    const style = document.createElement('style');
    style.textContent = `
        .cam-btn{border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-main);padding:8px 16px;border-radius:20px;cursor:pointer;font-size:13px}
        .cam-btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}
        .cam-btn:disabled{opacity:.45;cursor:not-allowed}`;
    document.head.appendChild(style);

    chartCard.insertAdjacentHTML('beforebegin', `
        <div class="card" id="cameraCard">
            <div class="box-title">
                <span>Live Camera</span>
                <i class="fa-solid fa-video" style="color: var(--text-sub);"></i>
            </div>
            <div style="position:relative;background:#0f172a;border-radius:12px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                <video id="camVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:contain;display:none;"></video>
                <canvas id="camOverlay" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;"></canvas>
                <span id="camPlaceholder" style="color:#94a3b8;font-size:14px;"><i class="fa-solid fa-video-slash"></i> Camera is off</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
                <button id="camStartBtn" class="cam-btn primary">Turn on camera</button>
                <button id="camStopBtn" class="cam-btn" disabled>Turn off</button>
                <button id="camFlipBtn" class="cam-btn" disabled>Switch camera</button>
            </div>
            <p id="camMsg" class="card-desc"></p>
        </div>`);

    const $ = id => document.getElementById(id);
    let stream = null;
    let facing = 'user'; // 'user' = camera trước, 'environment' = camera sau

    function setUI(on) {
        $('camVideo').style.display = on ? 'block' : 'none';
        $('camOverlay').style.display = on ? 'block' : 'none';
        $('camPlaceholder').style.display = on ? 'none' : 'inline';
        $('camStartBtn').disabled = on;
        $('camStopBtn').disabled = !on;
        $('camFlipBtn').disabled = !on;
    }

    function stop() {
        stopDetect();
        $('camMsg').textContent = '';
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null;
        $('camVideo').srcObject = null;
        setUI(false);
    }

    async function start() {
        $('camMsg').textContent = '';
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            $('camMsg').textContent = 'This browser does not support the camera, or the page is not running on HTTPS.';
            return;
        }
        try {
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing },
                audio: false
            });
            $('camVideo').srcObject = stream;
            setUI(true);
            loadModel().then(m => { if (m && stream) startDetect(); });
        } catch (err) {
            stop();
            if (err.name === 'NotAllowedError') $('camMsg').textContent = 'Camera access was not allowed. Please allow it in the browser settings.';
            else if (err.name === 'NotFoundError') $('camMsg').textContent = 'No camera was found on this device.';
            else $('camMsg').textContent = 'Could not open the camera: ' + err.message;
        }
    }

    // ---------- NHẬN DẠNG NGƯỜI (TensorFlow.js + COCO-SSD) ----------
    let model = null;
    let detectTimer = null;
    let busy = false;
    let personNow = false;
    let lastLogAt = 0;
    const LOG_GAP = 10000; // ms, tránh ghi lịch sử liên tục

    async function loadModel() {
        if (model) return model;
        if (typeof cocoSsd === 'undefined') {
            $('camMsg').textContent = 'The detection library could not be loaded (Internet is required).';
            return null;
        }
        $('camMsg').textContent = 'Loading the person detection model...';
        model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        $('camMsg').textContent = '';
        return model;
    }

    function drawBoxes(people) {
        const video = $('camVideo');
        const canvas = $('camOverlay');
        const cw = video.clientWidth, ch = video.clientHeight;
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);
        const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
        const dx = (cw - video.videoWidth * scale) / 2;
        const dy = (ch - video.videoHeight * scale) / 2;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#22c55e';
        ctx.fillStyle = '#22c55e';
        ctx.font = '14px sans-serif';
        people.forEach(p => {
            const [x, y, w, h] = p.bbox;
            ctx.strokeRect(dx + x * scale, dy + y * scale, w * scale, h * scale);
            ctx.fillText('Person ' + Math.round(p.score * 100) + '%', dx + x * scale + 4, dy + y * scale + 16);
        });
    }

    async function detect() {
        const video = $('camVideo');
        if (!model || !stream || video.readyState < 2) return;
        const found = await model.detect(video);
        const people = found.filter(o => o.class === 'person' && o.score > 0.6);
        drawBoxes(people);
        $('camMsg').textContent = people.length ? (people.length === 1 ? '1 person detected' : people.length + ' people detected') : 'No person detected';

        const now = Date.now();
        if (people.length && !personNow && now - lastLogAt > LOG_GAP) {
            const away = ($('secMode') && $('secMode').textContent === 'AWAY') ? ' (AWAY)' : '';
            if (typeof addLog === 'function') {
                addLog('Camera', 'PERSON DETECTED' + away, 'var(--danger-text)', getCurrentTime());
            }
            lastLogAt = now;
        }
        personNow = people.length > 0;
    }

    function startDetect() {
        stopDetect();
        detectTimer = setInterval(async () => {
            if (busy) return;
            busy = true;
            try { await detect(); } catch (e) { console.warn('Detection error:', e); }
            busy = false;
        }, 400);
    }

    function stopDetect() {
        clearInterval(detectTimer);
        detectTimer = null;
        personNow = false;
        const c = $('camOverlay');
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }

    $('camStartBtn').addEventListener('click', start);
    $('camStopBtn').addEventListener('click', stop);
    $('camFlipBtn').addEventListener('click', () => {
        facing = facing === 'user' ? 'environment' : 'user';
        start();
    });
})();