const DEFAULT_INTERVAL_MIN = 5;

document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('test').addEventListener('click', testConnection);

loadOptions();

function loadOptions() {
  chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin'], (data) => {
    const def = (typeof IMWEB_CREDENTIALS !== 'undefined' && IMWEB_CREDENTIALS) ? IMWEB_CREDENTIALS : {};
    document.getElementById('apiKey').value = data.apiKey || def.apiKey || '';
    document.getElementById('apiSecret').value = data.apiSecret || def.apiSecret || '';
    document.getElementById('intervalMin').value = data.intervalMin ?? DEFAULT_INTERVAL_MIN;
  });
}

function saveOptions() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiSecret = document.getElementById('apiSecret').value.trim();
  const intervalMin = Math.max(1, Math.min(60, parseInt(document.getElementById('intervalMin').value, 10) || DEFAULT_INTERVAL_MIN));

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
