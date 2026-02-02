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
  if (data.code !== 200 || !data.data || !data.data.list) return { list: [], hasMore: false };
  return {
    list: data.data.list,
    hasMore: (data.data.list || []).length >= 100,
  };
}

async function fetchProdOrders(accessToken, orderNo) {
  const url = `${IMWEB_API_BASE}/shop/orders/${orderNo}/prod-orders`;
  const res = await fetch(url, {
    headers: { 'access-token': accessToken },
  });
  const data = await res.json();
  if (data.code !== 200 || !data.data) return [];
  const list = Array.isArray(data.data) ? data.data : (data.data.list || []);
  return list;
}

async function hasCancelRequest(accessToken, order) {
  const items = await fetchProdOrders(accessToken, order.order_no);
  return items.some((item) => (item.claim_status || '').toUpperCase() === CLAIM_STATUS_CANCEL_REQUEST);
}

async function checkCancelOrders() {
  const data = await chrome.storage.local.get(['apiKey', 'apiSecret', 'intervalMin', STORAGE_KEY_NOTIFIED]);
  const cred = getEffectiveCredentials(data);
  if (!cred) return;
  const { apiKey, apiSecret } = cred;

  const token = await getAccessToken(apiKey, apiSecret);
  if (!token) return;

  const now = Math.floor(Date.now() / 1000);
  const daysBack = 3;
  const fromTs = now - daysBack * 24 * 60 * 60;
  const maxOrdersToCheck = 50;
  const allOrders = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5 && allOrders.length < maxOrdersToCheck) {
    const { list, hasMore: more } = await fetchOrders(token, fromTs, now, page);
    allOrders.push(...(list || []));
    hasMore = more;
    page++;
  }

  const cancelRequestOrders = [];
  const toCheck = allOrders.slice(0, maxOrdersToCheck);
  for (const order of toCheck) {
    const isCancelRequest = await hasCancelRequest(token, order);
    if (isCancelRequest) cancelRequestOrders.push(order);
  }

  await chrome.storage.local.set({ [STORAGE_LAST_CHECK]: Date.now() });

  const notified = new Set((data[STORAGE_KEY_NOTIFIED] || []));
  const newOnes = cancelRequestOrders.filter((o) => !notified.has(String(o.order_no)));

  for (const order of newOnes) {
    showCancelRequestNotification(order);
    notified.add(String(order.order_no));
  }

  if (newOnes.length > 0) {
    await chrome.storage.local.set({ [STORAGE_KEY_NOTIFIED]: Array.from(notified) });
  }
}

function showCancelRequestNotification(order) {
  const orderNo = order.order_no || '';
  const total = order.total_price != null ? Number(order.total_price).toLocaleString() : '';
  const title = '아임웹 취소 접수 알림';
  const message = total
    ? `주문번호 ${orderNo} (${total}원) 취소 접수됨. 승인해 주세요.`
    : `주문번호 ${orderNo} 취소 접수됨. 승인해 주세요.`;

  chrome.notifications.create({
    type: 'basic',
    title,
    message,
    priority: 2,
    requireInteraction: true,
  });
}

function schedulePoll(intervalMin) {
  chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, Math.min(60, intervalMin)) });
  checkCancelOrders();
}
