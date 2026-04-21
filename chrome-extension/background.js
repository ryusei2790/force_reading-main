/**
 * Blog-Read-Forced — Service Worker (background.js)
 *
 * 設定された間隔（デフォルト60分）で未読記事を登録日が古い順で取得し、
 * デスクトップにポップアップ通知を表示する。
 * 通知クリック時に記事URLを新しいタブで開く。
 */

/** @type {string} アラームの識別名 */
const ALARM_NAME = "daily-article";

/** @type {string} ストレージキー: GAS WebアプリURL */
const STORAGE_KEY_GAS_URL = "gasUrl";

/** @type {string} ストレージキー: 通知間隔（分） */
const STORAGE_KEY_INTERVAL = "notifyIntervalMinutes";

/** @type {number} デフォルトの通知間隔（分） */
const DEFAULT_INTERVAL_MINUTES = 60;

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
 * chrome.storage.local から通知間隔（分）を取得する。
 *
 * @returns {Promise<number>} 通知間隔（分）。未設定の場合はデフォルト値
 */
async function getIntervalMinutes() {
  const result = await chrome.storage.local.get(STORAGE_KEY_INTERVAL);
  return result[STORAGE_KEY_INTERVAL] || DEFAULT_INTERVAL_MINUTES;
}

/**
 * 指定した間隔でアラームを（再）登録する。
 * 既存のアラームがあれば削除してから作り直す。
 *
 * @param {number} intervalMinutes - 通知間隔（分）
 */
async function registerAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: intervalMinutes,
  });
  console.info(`[Blog-Read-Forced] 通知間隔を ${intervalMinutes} 分に設定しました。`);
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
 * ユーザーが設定した間隔（デフォルト60分）で通知を繰り返す。
 */
chrome.runtime.onInstalled.addListener(async () => {
  const interval = await getIntervalMinutes();
  await registerAlarm(interval);
});

/**
 * ポップアップから通知間隔が変更されたときにアラームを再登録する。
 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes[STORAGE_KEY_INTERVAL]) {
    const newInterval = changes[STORAGE_KEY_INTERVAL].newValue || DEFAULT_INTERVAL_MINUTES;
    await registerAlarm(newInterval);
  }
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

