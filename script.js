let currentTemp = 28.5;
let currentHumidity = 65;

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString();
}

window.addEventListener('DOMContentLoaded', () => {
    const currentTime = getCurrentTime();
    const tableBody = document.getElementById('logTableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td>Living Room Light</td>
                <td><span style="color: var(--success-text); font-weight: 600;">TURNED ON</span></td>
                <td style="color: var(--text-sub);">${currentTime}</td>
            </tr>
            <tr>
                <td>DHT22 Sensor</td>
                <td><span style="color: var(--primary); font-weight: 600;">SYNCED</span></td>
                <td style="color: var(--text-sub);">${currentTime}</td>
            </tr>
        `;
    }
});

// Chart.js Setup
const ctx = document.getElementById('sensorChart').getContext('2d');
const sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['13:10', '13:15', '13:20', '13:25', '13:30', '13:35'],
        datasets: [
            {
                label: 'Temperature (°C)',
                data: [27.0, 27.5, 28.0, 28.2, 28.5, 28.5],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.08)',
                tension: 0.3,
                fill: true
            },
            {
                label: 'Humidity (%)',
                data: [68, 67, 66, 65, 65, 65],
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.08)',
                tension: 0.3,
                fill: true
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
            y: { grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } }
        }
    }
});

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');

    if (isDark) {
        if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
        if (themeText) themeText.innerText = 'Light';
        sensorChart.options.scales.y.grid.color = '#334155';
    } else {
        if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
        if (themeText) themeText.innerText = 'Dark';
        sensorChart.options.scales.y.grid.color = '#f1f5f9';
    }
    sensorChart.update();
}

function toggleDevice(type, state = null) {
    const now = getCurrentTime();
    let toggleInput = document.getElementById(type + 'Toggle');
    if (!toggleInput) return;
    if (state !== null) toggleInput.checked = state;

    let isChecked = toggleInput.checked;
    let badge = document.getElementById(type + 'Badge');

    if (type === 'light') {
        let name = 'Living Room Light';
        if (isChecked) {
            if (badge) { badge.className = 'badge-status badge-on'; badge.innerText = 'ON'; }
            addLog(name, 'TURNED ON', 'var(--success-text)', now);
        } else {
            if (badge) { badge.className = 'badge-status badge-off'; badge.innerText = 'OFF'; }
            addLog(name, 'TURNED OFF', 'var(--danger-text)', now);
        }
    } else if (type === 'fan') {
        let name = 'Smart Fan';
        let fanIcon = document.getElementById('fanIcon');
        if (isChecked) {
            if (badge) { badge.className = 'badge-status badge-on'; badge.innerText = 'ON'; }
            if (fanIcon) fanIcon.classList.add('spinning');
            addLog(name, 'TURNED ON', 'var(--success-text)', now);
        } else {
            if (badge) { badge.className = 'badge-status badge-off'; badge.innerText = 'OFF'; }
            if (fanIcon) fanIcon.classList.remove('spinning');
            addLog(name, 'TURNED OFF', 'var(--danger-text)', now);
        }
    } else if (type === 'heater') {
        let name = 'Heater';
        let heaterIcon = document.getElementById('heaterIcon');
        if (isChecked) {
            if (badge) { badge.className = 'badge-status badge-on'; badge.innerText = 'ON'; }
            if (heaterIcon) heaterIcon.classList.add('heater-on');
            addLog(name, 'TURNED ON', 'var(--success-text)', now);
        } else {
            if (badge) { badge.className = 'badge-status badge-off'; badge.innerText = 'OFF'; }
            if (heaterIcon) heaterIcon.classList.remove('heater-on');
            addLog(name, 'TURNED OFF', 'var(--danger-text)', now);
        }
    }

    updateActiveCount();
}

function updateActiveCount() {
    let lightOn = document.getElementById('lightToggle')?.checked ? 1 : 0;
    let fanOn = document.getElementById('fanToggle')?.checked ? 1 : 0;
    let heaterOn = document.getElementById('heaterToggle')?.checked ? 1 : 0;
    let total = lightOn + fanOn + heaterOn;
    const elem = document.getElementById('activeCount');
    if (elem) {
        elem.innerHTML = `${total} <span style="font-size: 14px; font-weight: normal; color: var(--text-sub);">/ 3 devices</span>`;
    }
}

function addLog(device, status, color, time) {
    const tableBody = document.getElementById('logTableBody');
    if (!tableBody) return;
    const newRow = `
        <tr>
            <td>${device}</td>
            <td><span style="color: ${color}; font-weight: 600;">${status}</span></td>
            <td style="color: var(--text-sub);">${time}</td>
        </tr>
    `;
    tableBody.insertAdjacentHTML('afterbegin', newRow);
}

function updateSensorData(temp, humidity) {
    currentTemp = temp;
    currentHumidity = humidity;
    const timeString = getCurrentTime();

    const tempElem = document.getElementById('tempValue');
    const humElem = document.getElementById('humidityValue');
    if (tempElem) tempElem.innerText = parseFloat(temp).toFixed(1) + ' °C';
    if (humElem) humElem.innerText = parseInt(humidity) + ' %';

    const aiMessage = document.getElementById('aiMessage');
    if (aiMessage) {
        if (temp > 28.5) {
            aiMessage.innerHTML = `<span style="color: #f97316; font-weight: 600;">[AI Warning]</span> Temperature is rising (${temp}°C). Recommended to turn on the Smart Fan for cooling.`;
        } else {
            aiMessage.innerHTML = `System environment is stable. Temperature (${temp}°C) and humidity (${humidity}%) are at optimal levels.`;
        }
    }

    if (sensorChart.data.labels.length > 8) {
        sensorChart.data.labels.shift();
        sensorChart.data.datasets[0].data.shift();
        sensorChart.data.datasets[1].data.shift();
    }

    sensorChart.data.labels.push(timeString);
    sensorChart.data.datasets[0].data.push(parseFloat(temp));
    sensorChart.data.datasets[1].data.push(parseInt(humidity));
    sensorChart.update();
}

setInterval(() => {
    let randomTemp = (27 + Math.random() * 2.5).toFixed(1);
    let randomHumidity = Math.floor(63 + Math.random() * 5);
    updateSensorData(randomTemp, randomHumidity);
}, 3000);

// --- CHATBOT THÔNG MINH ĐỌC HIỂU WEBSITE (KHÔNG CẦN API KEY) ---
function toggleChatbot() {
    const chatWin = document.getElementById('chatbotWindow');
    if (chatWin) chatWin.style.display = chatWin.style.display === 'flex' ? 'none' : 'flex';
}

function handleKeyPress(e) {
    if (e.key === 'Enter') sendChatMessage();
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const userMsg = input.value.trim();
    if (!userMsg) return;

    appendMessage(userMsg, 'user');
    input.value = '';

    // Hiển thị trạng thái đang trả lời
    const loadingId = appendMessage(isVietnamese(userMsg) ? "BaseHome AI đang xử lý..." : "BaseHome AI is thinking...", 'bot loading');

    setTimeout(() => {
        removeMessage(loadingId);
        const reply = analyzeWebQuery(userMsg);
        appendMessage(reply, 'bot');
    }, 600); // Giả lập độ trễ thông minh 0.6 giây
}

// Bộ não phân tích câu hỏi dựa trên dữ liệu thời gian thực của website
// Trả lời bằng tiếng Việt nếu người dùng gõ tiếng Việt (có dấu), ngược lại trả lời tiếng Anh
function isVietnamese(msg) {
    return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(msg.toLowerCase());
}

function analyzeWebQuery(msg) {
    const text = msg.toLowerCase();
    const vi = isVietnamese(text);

    // Lấy trạng thái hiện tại trên web
    const isLightOn = document.getElementById('lightToggle')?.checked;
    const isFanOn = document.getElementById('fanToggle')?.checked;
    const isHeaterOn = document.getElementById('heaterToggle')?.checked;
    const activeCount = document.getElementById('activeCount')?.innerText || '1/3';
    const isDarkMode = document.body.classList.contains('dark-mode');

    // 1. Điều khiển thiết bị
    if (text.includes('turn on the light') || text.includes('turn on light') || text.includes('bật đèn') || text.includes('mở đèn')) {
        toggleDevice('light', true);
        return vi ? 'Đã bật đèn phòng khách thành công cho bạn!' : 'The living room light is now ON!';
    }
    if (text.includes('turn off the light') || text.includes('turn off light') || text.includes('tắt đèn')) {
        toggleDevice('light', false);
        return vi ? 'Đã tắt đèn phòng khách!' : 'The living room light is now OFF!';
    }
    if (text.includes('turn on the fan') || text.includes('turn on fan') || text.includes('bật quạt') || text.includes('mở quạt')) {
        toggleDevice('fan', true);
        return vi ? 'Đã bật quạt thông minh!' : 'The smart fan is now ON!';
    }
    if (text.includes('turn off the fan') || text.includes('turn off fan') || text.includes('tắt quạt')) {
        toggleDevice('fan', false);
        return vi ? 'Đã tắt quạt thông minh!' : 'The smart fan is now OFF!';
    }
    if (text.includes('turn on the heater') || text.includes('turn on heater') || text.includes('bật máy sưởi') || text.includes('bật sưởi') || text.includes('mở sưởi')) {
        toggleDevice('heater', true);
        return vi ? 'Đã bật máy sưởi!' : 'The heater is now ON!';
    }
    if (text.includes('turn off the heater') || text.includes('turn off heater') || text.includes('tắt máy sưởi') || text.includes('tắt sưởi')) {
        toggleDevice('heater', false);
        return vi ? 'Đã tắt máy sưởi!' : 'The heater is now OFF!';
    }

    // 2. Hỏi về nhiệt độ / độ ẩm / thời tiết
    if (text.includes('temperature') || text.includes('hot') || text.includes('cold') || text.includes('weather') || text.includes('nhiệt độ') || text.includes('nóng') || text.includes('lạnh') || text.includes('thời tiết')) {
        return vi ? `Nhiệt độ phòng hiện tại là ${currentTemp}°C. ${currentTemp > 28.5 ? 'Thời tiết hơi ấm, bạn có thể bật quạt để làm mát nhé!' : 'Mức nhiệt rất dễ chịu.'}` : `The room temperature is ${currentTemp}°C. ${currentTemp > 28.5 ? 'It is a bit warm, you could turn on the fan to cool down!' : 'The temperature is comfortable.'}`;
    }
    if (text.includes('humidity') || text.includes('độ ẩm') || text.includes('ẩm')) {
        return vi ? `Độ ẩm không khí trong phòng hiện tại đang là ${currentHumidity}%.` : `The room humidity is ${currentHumidity}%.`;
    }

    // 3. Hỏi về trạng thái đèn, quạt & máy sưởi
    if (text.includes('light') || text.includes('đèn')) {
        return vi ? `Đèn phòng khách hiện đang ${isLightOn ? 'ĐANG BẬT (ON)' : 'Đang TẮT (OFF)'}.` : `The living room light is ${isLightOn ? 'ON' : 'OFF'}.`;
    }
    if (text.includes('fan') || text.includes('quạt')) {
        return vi ? `Quạt thông minh hiện đang ${isFanOn ? 'ĐANG BẬT & QUAY (ON)' : 'Đang TẮT (OFF)'}.` : `The smart fan is ${isFanOn ? 'ON and spinning' : 'OFF'}.`;
    }
    if (text.includes('heater') || text.includes('sưởi')) {
        return vi ? `Máy sưởi hiện đang ${isHeaterOn ? 'ĐANG BẬT (ON)' : 'Đang TẮT (OFF)'}.` : `The heater is ${isHeaterOn ? 'ON' : 'OFF'}.`;
    }

    // 4. Hỏi về tổng quan / báo cáo / thiết bị hoạt động
    if (text.includes('overview') || text.includes('report') || text.includes('status') || text.includes('devices') || text.includes('tổng quan') || text.includes('báo cáo') || text.includes('tình hình') || text.includes('thiết bị')) {
        return vi ? `📊 Báo cáo nhanh BaseHome:\n- Nhiệt độ: ${currentTemp}°C | Độ ẩm: ${currentHumidity}%\n- Đèn: ${isLightOn ? 'Bật' : 'Tắt'} | Quạt: ${isFanOn ? 'Bật' : 'Tắt'} | Máy sưởi: ${isHeaterOn ? 'Bật' : 'Tắt'}\n- Thiết bị hoạt động: ${activeCount}` : `📊 BaseHome quick report:\n- Temperature: ${currentTemp}°C | Humidity: ${currentHumidity}%\n- Light: ${isLightOn ? 'On' : 'Off'} | Fan: ${isFanOn ? 'On' : 'Off'} | Heater: ${isHeaterOn ? 'On' : 'Off'}\n- Active devices: ${activeCount}`;
    }

    // 5. Hỏi về giao diện (Dark/Light mode)
    if (text.includes('theme') || text.includes('dark mode') || text.includes('interface') || text.includes('giao diện') || text.includes('sáng') || text.includes('tối') || text.includes('dark mode')) {
        return vi ? `Giao diện website hiện đang ở chế độ ${isDarkMode ? 'Tối (Dark Mode)' : 'Sáng (Light Mode)'}.` : `The website is currently in ${isDarkMode ? 'Dark Mode' : 'Light Mode'}.`;
    }

    // 6. Các câu hỏi linh hoạt chung
    if (text.includes('chào') || /\bhi\b/.test(text) || text.includes('hello')) {
        return vi ? 'Xin chào! Tôi là quản gia ảo của BaseHome. Tôi có thể giúp gì cho hệ thống nhà thông minh của bạn?' : 'Hello! I am the BaseHome virtual assistant. How can I help with your smart home system?';
    }

    // Phản hồi mặc định thông minh nếu không khớp từ khóa
    return vi ? `Tôi đã ghi nhận câu hỏi "${msg}". Hiện tại hệ thống BaseHome đang ghi nhận nhiệt độ ${currentTemp}°C, độ ẩm ${currentHumidity}%, đèn ${isLightOn ? 'bật' : 'tắt'}, quạt ${isFanOn ? 'bật' : 'tắt'} và máy sưởi ${isHeaterOn ? 'bật' : 'tắt'}. Bạn có muốn tôi bật/tắt thiết bị nào không?` : `I noted your question "${msg}". BaseHome currently shows temperature ${currentTemp}°C, humidity ${currentHumidity}%, light ${isLightOn ? 'on' : 'off'}, fan ${isFanOn ? 'on' : 'off'} and heater ${isHeaterOn ? 'on' : 'off'}. Would you like me to turn any device on or off?`;
}

function appendMessage(text, sender) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.innerText = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function removeMessage(element) {
    if (element) element.remove();
}