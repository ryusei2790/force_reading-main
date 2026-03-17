/**
 * Blog-Read-Forced — Service Worker (background.js)
 *
 * 毎日12:00に未読記事をランダム取得してデスクトップ通知を表示する。
 * 通知クリック時に記事URLを新しいタブで開く。
 */

/** @type {string} アラームの識別名 */
const ALARM_NAME = "daily-article";

/** @type {string} ストレージキー: GAS WebアプリURL */
const STORAGE_KEY_GAS_URL = "gasUrl";

/** @type {string} 通知IDのプレフィックス */
const NOTIFICATION_ID = "blog-read-forced";

/**
 * chrome.storage.local から GAS の URL を取得する。
 *
 * @returns {Promise<string|null>} GAS の URL。未設定の場合は null
 */
async function getGasUrl() {
  const result = await chrome.storage.local.get(STORAGE_KEY_GAS_URL);
  return result[STORAGE_KEY_GAS_URL] || null;
}

/**
 * GAS doGet() にリクエストして未読記事を 1 件取得する。
 *
 * @param {string} gasUrl - GAS ウェブアプリの URL
 * @returns {Promise<{status: string, title?: string, url?: string}>}
 */
async function fetchRandomArticle(gasUrl) {
  const res = await fetch(gasUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`GAS fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * デスクトップ通知を表示する。
 * 通知クリック時に開けるよう articleUrl を保持する。
 *
 * @param {string} title - 通知に表示する記事タイトル
 * @param {string} articleUrl - クリック時に開く URL
 */
function showNotification(title, articleUrl) {
  // クリック時に URL を参照できるよう storage に保存
  chrome.storage.local.set({ pendingArticleUrl: articleUrl });

  chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icon128.png",
    title: "今日の記事",
    message: title,
    contextMessage: "クリックして読む",
    requireInteraction: true,
  });
}

/**
 * アラーム発火時のメイン処理。
 * GAS から未読記事を取得し、あれば通知を表示する。
 */
async function onAlarm() {
  const gasUrl = await getGasUrl();
  if (!gasUrl) {
    console.warn("[Blog-Read-Forced] GAS URL が設定されていません。popup から設定してください。");
    return;
  }

  try {
    const data = await fetchRandomArticle(gasUrl);

    if (data.status === "empty") {
      console.info("[Blog-Read-Forced] 未読記事がありません。");
      return;
    }

    if (data.status === "ok" && data.url) {
      showNotification(data.title || data.url, data.url);
    }
  } catch (err) {
    console.error("[Blog-Read-Forced] 記事取得に失敗しました:", err);
  }
}

// ── イベントリスナー ──────────────────────────────────────

/**
 * 拡張インストール / アップデート時にアラームを登録する。
 * periodInMinutes: 1440 = 24時間ごとに発火。
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: 180, // 3時間ごと
  });
  console.info("[Blog-Read-Forced] 3時間ごとに通知します。");
});

/**
 * アラーム発火時のリスナー。
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    onAlarm();
  }
});

/**
 * 通知クリック時のリスナー。
 * storage に保存した URL を新しいタブで開く。
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;

  const result = await chrome.storage.local.get(["pendingArticleUrl", STORAGE_KEY_GAS_URL]);
  const url = result.pendingArticleUrl;
  const gasUrl = result[STORAGE_KEY_GAS_URL];

  if (url) {
    chrome.tabs.create({ url });
    chrome.notifications.clear(NOTIFICATION_ID);
    chrome.storage.local.remove("pendingArticleUrl");

    // GAS に既読更新リクエストを送信
    if (gasUrl) {
      const markUrl = `${gasUrl}?action=markRead&url=${encodeURIComponent(url)}`;
      fetch(markUrl).catch((err) =>
        console.error("[Blog-Read-Forced] 既読更新に失敗しました:", err)
      );
    }
  }
});

// ── ユーティリティ ────────────────────────────────────────

/**
 * 次の12:00 (正午) の Unix タイムスタンプ (ms) を返す。
 * 現在時刻がすでに12:00を過ぎていれば翌日の12:00を返す。
 *
 * @returns {number}
 */
function getNextNoonTimestamp() {
  const now = new Date();
  const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (noon <= now) {
    noon.setDate(noon.getDate() + 1);
  }
  return noon.getTime();
}
