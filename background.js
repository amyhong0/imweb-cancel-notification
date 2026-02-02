/**
 * 아임웹 취소 주문 알림 - 백그라운드 서비스
 * 주기적으로 아임웹 API로 주문 목록을 조회하고, 취소 접수(승인 대기) 건 발생 시 데스크톱 알림을 띄웁니다.
 */
try { importScripts('credentials.default.js'); } catch (_) {}

const IMWEB_API_BASE = 'https://api.imweb.me/v2';
const STORAGE_KEY_NOTIFIED = 'imwebCancelNotifiedOrderNos';
const STORAGE_LAST_CHECK = 'lastCheckAt';
const ALARM_NAME = 'imwebCancelPoll';
const CLAIM_STATUS_CANCEL_REQUEST = 'CANCEL_REQUEST';

function getEffectiveCredentials(data) {
  if (data.apiKey && data.apiSecret) return { apiKey: data.apiKey, apiSecret: data.apiSecret };
  if (typeof IMWEB_CREDENTIALS !== 'undefined' && IMWEB_CREDENTIALS.apiKey && IMWEB_CREDENTIALS.apiSecret) {
    return { apiKey: IMWEB_CREDENTIALS.apiKey, apiSecret: IMWEB_CREDENTIALS.apiSecret };
  }
  return null;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin'], (data) => {
    const cred = getEffectiveCredentials(data);
    if (cred && (data.intervalMin || 5)) {
      schedulePoll(data.intervalMin || 5);
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin'], (data) => {
    const cred = getEffectiveCredentials(data);
    if (cred && (data.intervalMin || 5)) {
      schedulePoll(data.intervalMin || 5);
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkCancelOrders();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCHEDULE_POLL') {
    chrome.storage.local.get(['intervalMin'], (data) => {
      schedulePoll(data.intervalMin || 5);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'CHECK_NOW') {
    checkCancelOrders()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message) }));
    return true;
  }
  if (msg.type === 'TEST_NOTIFICATION') {
    showTestNotification()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message) }));
    return true;
  }
});

async function getAccessToken(apiKey, apiSecret) {
  const url = `${IMWEB_API_BASE}/auth?key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 200 && data.access_token) return data.access_token;
  return null;
}

async function fetchOrders(accessToken, fromTs, toTs, page = 1) {
  const url = `${IMWEB_API_BASE}/shop/orders?order_date_from=${fromTs}&order_date_to=${toTs}&limit=100&page=${page}`;
  const res = await fetch(url, {
    headers: { 'access-token': accessToken },
  });
  const data = await res.json();
  if (data.code !== 200) return { list: [], hasMore: false };
  const raw = data.data || data;
  const list = Array.isArray(raw)
    ? raw
    : (raw && (raw.list || raw.orders || raw.data || raw.items || (Array.isArray(raw.data) ? raw.data : []))) || [];
  const arr = Array.isArray(list) ? list : [];
  return {
    list: arr,
    hasMore: arr.length >= 100,
  };
}

/**
 * 주문의 품목 목록(prod-orders)을 조회합니다.
 * API 응답 구조가 data.list / data.items / 배열 등 다양할 수 있어 여러 형태 처리.
 */
async function fetchProdOrders(accessToken, orderNo) {
  const url = `${IMWEB_API_BASE}/shop/orders/${orderNo}/prod-orders`;
  const res = await fetch(url, {
    headers: { 'access-token': accessToken },
  });
  const data = await res.json();
  if (data.code !== 200 || !data.data) return [];
  const raw = data.data;
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    list = raw.list || raw.items || raw.data || [];
    if (!Array.isArray(list)) list = [];
  }
  return list;
}

/** 품목의 claim 상태가 취소 접수인지 확인 (claim_status 또는 claimStatus) */
function isCancelRequestClaim(item) {
  const status = (item.claim_status || item.claimStatus || '').toString().toUpperCase();
  return status === CLAIM_STATUS_CANCEL_REQUEST;
}

/**
 * 주문에 취소 접수(승인 대기) 품목이 있는지 확인합니다.
 * @param {boolean} debug - true면 해당 주문의 품목 claim 관련 필드를 콘솔에 출력 (취소접수 값 확인용)
 */
async function hasCancelRequest(accessToken, order, debug = false) {
  const orderNo = order.order_no || order.orderNo;
  if (!orderNo) return false;
  const items = await fetchProdOrders(accessToken, orderNo);
  if (debug && items.length > 0) {
    items.forEach((item, i) => {
      const claimKeys = Object.keys(item).filter((k) => /claim|status|cancel/i.test(k));
      const vals = {};
      claimKeys.forEach((k) => { vals[k] = item[k]; });
      console.log('[imweb-cancel] 주문', orderNo, '품목', i + 1, vals);
    });
  }
  return items.some(isCancelRequestClaim);
}

async function checkCancelOrders() {
  const data = await chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin', STORAGE_KEY_NOTIFIED]);
  const cred = getEffectiveCredentials(data);
  if (!cred) return;
  const { apiKey, apiSecret } = cred;

  const token = await getAccessToken(apiKey, apiSecret);
  if (!token) return;

  const now = Math.floor(Date.now() / 1000);
  const daysBack = 7;
  const fromTs = now - daysBack * 24 * 60 * 60;
  const maxOrdersToCheck = 100;
  const allOrders = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) {
    const { list, hasMore: more } = await fetchOrders(token, fromTs, now, page);
    allOrders.push(...(list || []));
    hasMore = more && (list || []).length >= 100;
    page++;
    if (allOrders.length >= maxOrdersToCheck) break;
  }

  const cancelRequestOrders = [];
  const toCheck = allOrders.slice(0, maxOrdersToCheck);
  const debugFirstN = 3; // 처음 N개 주문에 대해 품목 claim 필드 로그 (취소접수 값 확인용)
  for (let i = 0; i < toCheck.length; i++) {
    const order = toCheck[i];
    try {
      const doDebug = i < debugFirstN;
      const isCancelRequest = await hasCancelRequest(token, order, doDebug);
      if (isCancelRequest) cancelRequestOrders.push(order);
    } catch (e) {
      console.warn('[imweb-cancel] order', order.order_no || order.orderNo, e);
    }
  }

  console.log('[imweb-cancel] 주문', toCheck.length, '건 확인, 취소 접수', cancelRequestOrders.length, '건');

  await chrome.storage.local.set({ [STORAGE_LAST_CHECK]: Date.now() });

  const notified = new Set((data[STORAGE_KEY_NOTIFIED] || []));
  const newOnes = cancelRequestOrders.filter((o) => {
    const no = o.order_no || o.orderNo;
    return no && !notified.has(String(no));
  });

  console.log('[imweb-cancel] 새로 알림할 건수:', newOnes.length, newOnes.length ? newOnes.map((o) => o.order_no || o.orderNo) : '');

  for (const order of newOnes) {
    showCancelRequestNotification(order);
    notified.add(String(order.order_no || order.orderNo));
  }

  if (newOnes.length > 0) {
    await chrome.storage.local.set({ [STORAGE_KEY_NOTIFIED]: Array.from(notified) });
  }
}

function showCancelRequestNotification(order) {
  const orderNo = order.order_no || order.orderNo || '';
  const title = '터콰이즈필드 주문 취소 접수 알림';
  const message = `주문번호 ${orderNo} 취소가 접수되었습니다. 관리자 페이지에서 승인해 주세요.`;

  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title,
      message,
      priority: 2,
      requireInteraction: true,
    },
    (id) => {
      if (chrome.runtime.lastError) {
        console.error('[imweb-cancel] 알림 생성 실패:', chrome.runtime.lastError.message);
      } else {
        console.log('[imweb-cancel] 알림 표시됨:', id);
      }
    }
  );
}

/** 설정 페이지에서 '테스트 알림' 클릭 시 호출. Chrome 알림이 동작하는지 확인용 */
function showTestNotification() {
  return new Promise((resolve, reject) => {
    let settled = false;
    function done(err, result) {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    }
    const t = setTimeout(() => {
      if (!settled) {
        console.warn('[imweb-cancel] 테스트 알림 콜백이 호출되지 않음 (타임아웃). Chrome 알림 권한을 확인하세요.');
        done(new Error('알림 콜백 타임아웃 — Chrome/OS 알림 허용 여부를 확인하세요.'));
      }
    }, 3000);
    chrome.notifications.create(
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon128.png'),
        title: '터콰이즈필드 주문 취소 접수 알림 (테스트)',
        message: '이 알림이 보이면 확장 프로그램 알림이 정상 동작하는 것입니다.',
        priority: 2,
        requireInteraction: true,
      },
      (id) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) {
          console.error('[imweb-cancel] 테스트 알림 실패:', chrome.runtime.lastError.message);
          done(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[imweb-cancel] 테스트 알림 표시됨:', id);
          done(null);
        }
      }
    );
  });
}

// 확인 간격: 1분 ~ 10080분(7일). Chrome alarm은 분 단위만 지원
const MIN_INTERVAL_MIN = 1;
const MAX_INTERVAL_MIN = 10080; // 7일

function schedulePoll(intervalMin) {
  const clamped = Math.max(MIN_INTERVAL_MIN, Math.min(MAX_INTERVAL_MIN, Number(intervalMin) || MIN_INTERVAL_MIN));
  chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: clamped });
  checkCancelOrders();
}
