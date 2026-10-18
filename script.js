// Chức năng chuyển đổi qua lại giữa các Tab
function switchTab(tabId, element) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar a').forEach(el => el.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  element.classList.add('active');
}

// Chức năng bật/tắt thiết bị và ghi log
function toggleDevice(deviceName, isChecked, statusId, iconId) {
  const statusEl = document.getElementById(statusId);
  const iconEl = document.getElementById(iconId);
  const timeString = new Date().toLocaleTimeString();

  if (isChecked) {
    statusEl.innerText = "Đang bật";
    statusEl.classList.add('on');
    iconEl.style.color = "#2ecc71";
    addLog(`[${timeString}] ${deviceName} đã được BẬT.`);
  } else {
    statusEl.innerText = "Đang tắt";
    statusEl.classList.remove('on');
    iconEl.style.color = "#3498db";
    addLog(`[${timeString}] ${deviceName} đã được TẮT.`);
  }
}

// Thêm dòng lịch sử vào Tab Nhật ký
function addLog(message) {
  const ul = document.getElementById('logList');
  const li = document.createElement('li');
  li.innerText = message;
  ul.prepend(li);
}

// Khởi tạo Biểu đồ Chart.js
const ctx = document.getElementById('myChart').getContext('2d');
const myChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['11:10', '11:11', '11:12', '11:13', '11:14'],
    datasets: [{
      label: 'Nhiệt độ (°C)',
      data: [27.0, 27.5, 28.0, 28.2, 28.5],
      borderColor: '#e74c3c',
      tension: 0.3
    }, {
      label: 'Độ ẩm (%)',
      data: [60, 62, 63, 64, 65],
      borderColor: '#3498db',
      tension: 0.3
    }]
  },
  options: { responsive: true }
});

// Giả lập dữ liệu cảm biến tự động thay đổi mỗi 5 giây
setInterval(() => {
  const randomTemp = (27 + Math.random() * 3).toFixed(1);
  const randomHumi = Math.floor(60 + Math.random() * 10);

  document.getElementById('tempVal').innerText = randomTemp;
  document.getElementById('humiVal').innerText = randomHumi;
}, 5000);
// Tự động ghi log hệ thống khởi động với giờ thực tế ngay khi mở trang
window.addEventListener('DOMContentLoaded', () => {
  const currentTime = new Date().toLocaleTimeString();
  addLog(`[${currentTime}] Hệ thống khởi động thành công.`);
});