document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.local.get(['lastCheckAt', 'apiKey'], (data) => {
  const summary = document.getElementById('summary');
  const lastCheck = document.getElementById('lastCheck');
  const hasKey = data.apiKey || (typeof IMWEB_CREDENTIALS !== 'undefined' && IMWEB_CREDENTIALS && IMWEB_CREDENTIALS.apiKey);
  if (!hasKey) {
    summary.textContent = '설정에서 API Key와 Secret을 입력해 주세요.';
  } else {
    summary.textContent = '취소 접수(승인 대기) 건 발생 시 데스크톱 알림을 표시합니다.';
  }
  if (data.lastCheckAt) {
    const d = new Date(data.lastCheckAt);
    lastCheck.textContent = '마지막 확인: ' + d.toLocaleString('ko-KR');
  } else {
    lastCheck.textContent = '아직 확인 이력이 없습니다.';
  }
});
