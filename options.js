const DEFAULT_INTERVAL_MIN = 5;
const MAX_INTERVAL_MIN = 10080;   // 7일
const MAX_INTERVAL_MINUTES = 60;  // 분 단위 최대
const MAX_INTERVAL_HOURS = 168;   // 시간 단위 최대 (7일)

document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('test').addEventListener('click', testConnection);
document.getElementById('checkNow').addEventListener('click', checkNow);
document.getElementById('clearNotified').addEventListener('click', clearNotified);
document.getElementById('testNotification').addEventListener('click', testNotification);
document.getElementById('intervalUnit').addEventListener('change', function () {
  const val = document.getElementById('intervalValue');
  val.max = this.value === 'hour' ? MAX_INTERVAL_HOURS : MAX_INTERVAL_MINUTES;
  if (this.value === 'hour' && parseInt(val.value, 10) > MAX_INTERVAL_HOURS) val.value = MAX_INTERVAL_HOURS;
  if (this.value === 'min' && parseInt(val.value, 10) > MAX_INTERVAL_MINUTES) val.value = MAX_INTERVAL_MINUTES;
});

loadOptions();

async function testNotification() {
  const status = document.getElementById('status');
  status.textContent = '테스트 알림 보내는 중...';
  status.className = 'status';
  const timeoutMs = 5000;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION' }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('응답 없음 (서비스 워커 확인 필요)')), timeoutMs)
      ),
    ]);
    if (result && result.error) {
      status.textContent = '테스트 알림 실패: ' + result.error;
      status.className = 'status err';
    } else {
      status.textContent = '테스트 알림을 보냈습니다. 바탕화면/알림 센터를 확인하세요.';
      status.className = 'status ok';
    }
  } catch (e) {
    status.textContent = '테스트 알림 실패: ' + (e.message || e) + ' — chrome://extensions 에서 이 확장의 "서비스 워커" 링크를 눌러 콘솔을 확인하세요.';
    status.className = 'status err';
  }
}

function clearNotified() {
  const status = document.getElementById('status');
  chrome.storage.local.remove('imwebCancelNotifiedOrderNos', () => {
    status.textContent = '알림 이력 초기화됨. 「지금 확인」 누르면 취소 접수 건이 있으면 알림이 뜹니다.';
    status.className = 'status ok';
  });
}

async function checkNow() {
  const status = document.getElementById('status');
  status.textContent = '취소 접수 확인 중...';
  status.className = 'status';
  try {
    await chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
    status.textContent = '확인 완료. 취소 접수 건이 있으면 알림이 뜹니다. (콘솔에서 건수 확인 가능)';
    status.className = 'status ok';
  } catch (e) {
    status.textContent = '확인 실패: ' + (e.message || e);
    status.className = 'status err';
  }
}

function loadOptions() {
  chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin'], (data) => {
    const def = (typeof IMWEB_CREDENTIALS !== 'undefined' && IMWEB_CREDENTIALS) ? IMWEB_CREDENTIALS : {};
    document.getElementById('apiKey').value = data.apiKey || def.apiKey || '';
    document.getElementById('apiSecret').value = data.apiSecret || def.apiSecret || '';
    const totalMin = data.intervalMin ?? DEFAULT_INTERVAL_MIN;
    const valueEl = document.getElementById('intervalValue');
    const unitEl = document.getElementById('intervalUnit');
    if (totalMin >= 60 && totalMin % 60 === 0) {
      valueEl.value = Math.min(MAX_INTERVAL_HOURS, Math.floor(totalMin / 60));
      valueEl.max = MAX_INTERVAL_HOURS;
      unitEl.value = 'hour';
    } else {
      valueEl.value = Math.min(MAX_INTERVAL_MINUTES, totalMin);
      valueEl.max = MAX_INTERVAL_MINUTES;
      unitEl.value = 'min';
    }
  });
}

function saveOptions() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiSecret = document.getElementById('apiSecret').value.trim();
  const unit = document.getElementById('intervalUnit').value;
  const val = parseInt(document.getElementById('intervalValue').value, 10) || 1;
  const intervalMin = unit === 'hour'
    ? Math.max(60, Math.min(MAX_INTERVAL_MIN, val * 60))
    : Math.max(1, Math.min(MAX_INTERVAL_MINUTES, val));

  const status = document.getElementById('status');
  if (!apiKey || !apiSecret) {
    status.textContent = 'API Key와 Secret을 모두 입력해 주세요.';
    status.className = 'status err';
    return;
  }

  chrome.storage.local.set({ apiKey, apiSecret, intervalMin }, () => {
    status.textContent = '저장되었습니다. 백그라운드에서 주기적으로 확인합니다.';
    status.className = 'status ok';
    chrome.runtime.sendMessage({ type: 'SCHEDULE_POLL' }).catch(() => {});
  });
}

async function testConnection() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiSecret = document.getElementById('apiSecret').value.trim();
  const status = document.getElementById('status');

  if (!apiKey || !apiSecret) {
    status.textContent = 'API Key와 Secret을 입력한 뒤 테스트해 주세요.';
    status.className = 'status err';
    return;
  }

  status.textContent = '연결 중...';
  status.className = 'status';

  try {
    const url = `https://api.imweb.me/v2/auth?key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 200 && data.access_token) {
      status.textContent = '연결 성공! API가 정상 동작합니다.';
      status.className = 'status ok';
    } else {
      status.textContent = '연결 실패: ' + (data.message || data.msg || JSON.stringify(data));
      status.className = 'status err';
    }
  } catch (e) {
    status.textContent = '연결 실패: ' + e.message;
    status.className = 'status err';
  }
}
