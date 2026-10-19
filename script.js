// Switch between tabs
function switchTab(tabId, element) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar a').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  element.classList.add('active');
}

// Toggle devices, record actions, and handle fan spinning effect
function toggleDevice(deviceName, isChecked, statusId, iconId) {
  const statusEl = document.getElementById(statusId);
  const iconEl = document.getElementById(iconId);
  const timeString = new Date().toLocaleTimeString();

  if (isChecked) {
    statusEl.innerText = "Turned ON";
    statusEl.classList.add('on');
    
    if (deviceName === 'Ventilation Fan') {
      iconEl.classList.add('fan-spinning'); // Bật hiệu ứng quạt xoay
    } else {
      iconEl.style.color = "#2ecc71";
    }
    
    addLog(`[${timeString}] ${deviceName} has been TURNED ON.`);
  } else {
    statusEl.innerText = "Turned OFF";
    statusEl.classList.remove('on');
    
    if (deviceName === 'Ventilation Fan') {
      iconEl.classList.remove('fan-spinning'); // Tắt hiệu ứng quạt xoay
      iconEl.style.color = "#7f8c8d";
    } else {
      iconEl.style.color = "#7f8c8d";
    }
    
    addLog(`[${timeString}] ${deviceName} has been TURNED OFF.`);
  }
}

// Add history record to logs tab
function addLog(message) {
  const ul = document.getElementById('logList');
  const li = document.createElement('li');
  li.innerText = message;
  ul.prepend(li);
}

// Automatically log system startup with exact real-time when opening page
window.addEventListener('DOMContentLoaded', () => {
  const startupTime = new Date().toLocaleTimeString();
  addLog(`[${startupTime}] System initialized successfully.`);
});

// Toggle Dark/Light Mode
function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const themeIcon = document.getElementById('themeIcon');
  if (document.body.classList.contains('dark-mode')) {
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
  } else {
    themeIcon.classList.remove('fa-sun');
    themeIcon.classList.add('fa-moon');
  }
}

// Initialize Live Chart.js with dynamic real-time moving capability
const ctx = document.getElementById('myChart').getContext('2d');

const initialTimes = [];
const now = new Date();
for (let i = 4; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 3000);
  initialTimes.push(d.toLocaleTimeString());
}

const myChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: initialTimes,
    datasets: [{
      label: 'Temperature (°C)',
      data: [27.0, 27.5, 28.0, 28.2, 28.5],
      borderColor: '#e74c3c',
      tension: 0.3,
      fill: false
    }, {
      label: 'Humidity (%)',
      data: [60, 62, 63, 64, 65],
      borderColor: '#3498db',
      tension: 0.3,
      fill: false
    }]
  },
  options: { 
    responsive: true,
    scales: {
      y: {
        beginAtZero: false
      }
    }
  }
});

// Automatically update sensor values, shift chart data, and check temperature alerts every 3 seconds
setInterval(() => {
  const currentTimeStr = new Date().toLocaleTimeString();
  // Giả lập nhiệt độ dao động ngẫu nhiên (có lúc vượt 30°C để test cảnh báo)
  const newTemp = parseFloat((27 + Math.random() * 4.5).toFixed(1));
  const newHumi = Math.floor(60 + Math.random() * 10);

  // Update card text values
  document.getElementById('tempVal').innerText = newTemp;
  document.getElementById('humiVal').innerText = newHumi;

  // Kiểm tra cảnh báo quá nhiệt (> 30°C)
  const tempCard = document.getElementById('tempCard');
  if (newTemp > 30.0) {
    tempCard.classList.add('card-warning');
  } else {
    tempCard.classList.remove('card-warning');
  }

  // Shift chart labels and data
  myChart.data.labels.push(currentTimeStr);
  myChart.data.labels.shift();

  myChart.data.datasets[0].data.push(newTemp);
  myChart.data.datasets[0].data.shift();

  myChart.data.datasets[1].data.push(newHumi);
  myChart.data.datasets[1].data.shift();

  myChart.update();
}, 3000);