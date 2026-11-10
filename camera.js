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
                <video id="camVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none;"></video>
                <span id="camPlaceholder" style="color:#94a3b8;font-size:14px;"><i class="fa-solid fa-video-slash"></i> Camera đang tắt</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
                <button id="camStartBtn" class="cam-btn primary">Bật camera</button>
                <button id="camStopBtn" class="cam-btn" disabled>Tắt</button>
                <button id="camFlipBtn" class="cam-btn" disabled>Đổi camera</button>
            </div>
            <p id="camMsg" class="card-desc"></p>
        </div>`);

    const $ = id => document.getElementById(id);
    let stream = null;
    let facing = 'user'; // 'user' = camera trước, 'environment' = camera sau

    function setUI(on) {
        $('camVideo').style.display = on ? 'block' : 'none';
        $('camPlaceholder').style.display = on ? 'none' : 'inline';
        $('camStartBtn').disabled = on;
        $('camStopBtn').disabled = !on;
        $('camFlipBtn').disabled = !on;
    }

    function stop() {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null;
        $('camVideo').srcObject = null;
        setUI(false);
    }

    async function start() {
        $('camMsg').textContent = '';
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            $('camMsg').textContent = 'Trình duyệt không hỗ trợ camera, hoặc trang chưa chạy trên HTTPS.';
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
        } catch (err) {
            stop();
            if (err.name === 'NotAllowedError') $('camMsg').textContent = 'Bạn chưa cho phép truy cập camera. Hãy cho phép trong cài đặt trình duyệt.';
            else if (err.name === 'NotFoundError') $('camMsg').textContent = 'Không tìm thấy camera trên thiết bị này.';
            else $('camMsg').textContent = 'Không mở được camera: ' + err.message;
        }
    }

    $('camStartBtn').addEventListener('click', start);
    $('camStopBtn').addEventListener('click', stop);
    $('camFlipBtn').addEventListener('click', () => {
        facing = facing === 'user' ? 'environment' : 'user';
        start();
    });
})();