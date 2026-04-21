/**
 * Blog-Read-Forced — popup.js
 *
 * ポップアップの UI ロジック。
 * - GAS URL の保存・読み込み
 * - 現在タブの URL / タイトルを GAS に POST して記事を登録
 */

/** @type {string} ストレージキー: GAS WebアプリURL */
const STORAGE_KEY_GAS_URL = "gasUrl";

/** @type {string} ストレージキー: 通知間隔（分） */
const STORAGE_KEY_INTERVAL = "notifyIntervalMinutes";

/** @type {string} ストレージキー: 最終通知日時 */
const STORAGE_KEY_LAST_NOTIFIED = "lastNotifiedAt";

/** @type {HTMLInputElement} */
const gasUrlInput = /** @type {HTMLInputElement} */ (document.getElementById("gas-url-input"));

/** @type {HTMLButtonElement} */
const saveUrlBtn = /** @type {HTMLButtonElement} */ (document.getElementById("save-url-btn"));

/** @type {HTMLButtonElement} */
const registerBtn = /** @type {HTMLButtonElement} */ (document.getElementById("register-btn"));

/** @type {HTMLElement} */
const messageEl = /** @type {HTMLElement} */ (document.getElementById("message"));

/** @type {HTMLElement} */
const articleCard = /** @type {HTMLElement} */ (document.getElementById("article-card"));

/** @type {HTMLAnchorElement} */
const articleTitle = /** @type {HTMLAnchorElement} */ (document.getElementById("article-title"));

/** @type {HTMLElement} */
const articleEmpty = /** @type {HTMLElement} */ (document.getElementById("article-empty"));

/** @type {HTMLSelectElement} */
const intervalSelect = /** @type {HTMLSelectElement} */ (document.getElementById("interval-select"));

/** @type {HTMLElement} */
const lastNotifiedEl = /** @type {HTMLElement} */ (document.getElementById("last-notified"));

/** @type {HTMLElement} */
const unreadCountEl = /** @type {HTMLElement} */ (document.getElementById("unread-count"));

/** @type {HTMLButtonElement} */
const skipBtn = /** @type {HTMLButtonElement} */ (document.getElementById("skip-btn"));

/** @type {HTMLButtonElement} */
const helpBtn = /** @type {HTMLButtonElement} */ (document.getElementById("help-btn"));

/** @type {HTMLElement} */
const helpModal = /** @type {HTMLElement} */ (document.getElementById("help-modal"));

/** @type {HTMLButtonElement} */
const modalCloseBtn = /** @type {HTMLButtonElement} */ (document.getElementById("modal-close-btn"));

/** @type {HTMLButtonElement} */
const testNotifyBtn = /** @type {HTMLButtonElement} */ (document.getElementById("test-notify-btn"));

// ── ユーティリティ ────────────────────────────────────────

/**
 * メッセージ欄にテキストを表示する（showMessageWithFade へのエイリアス）。
 *
 * @param {string} text - 表示するメッセージ
 * @param {"success"|"error"|""} type - スタイルクラス
 */
function showMessage(text, type = "") {
  showMessageWithFade(text, type);
}

/**
 * ボタンの活性 / 非活性を切り替える。
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} disabled
 */
function setDisabled(btn, disabled) {
  btn.disabled = disabled;
}

/**
 * ボタンにローディングスピナーを表示 / 解除する。
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.classList.add("btn-loading");
  } else {
    btn.classList.remove("btn-loading");
  }
}

/** @type {number|undefined} メッセージフェードアウト用タイマーID */
let fadeTimer;

/**
 * メッセージ欄にテキストを表示し、成功メッセージは2秒後に自動フェードアウトする。
 *
 * @param {string} text - 表示するメッセージ
 * @param {"success"|"error"|""} type - スタイルクラス
 */
function showMessageWithFade(text, type = "") {
  clearTimeout(fadeTimer);
  messageEl.textContent = text;
  messageEl.className = type;
  messageEl.classList.remove("fade-out");

  if (type === "success") {
    fadeTimer = setTimeout(() => {
      messageEl.classList.add("fade-out");
    }, 2000);
  }
}

// ── 初期化 ───────────────────────────────────────────────

/**
 * GAS doGet() を呼び出し、最古の未読記事をポップアップに表示する。
 *
 * @param {string} gasUrl
 */
async function loadOldestArticle(gasUrl) {
  try {
    const res = await fetch(gasUrl, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === "ok" && data.url) {
      articleTitle.textContent = data.title || data.url;
      articleTitle.href = data.url;
      articleCard.style.display = "block";
      skipBtn.style.display = "block";

      // 未読件数を表示
      if (data.unreadCount != null) {
        unreadCountEl.textContent = `未読: ${data.unreadCount} 件`;
        unreadCountEl.style.display = "block";
      }
    } else {
      articleEmpty.style.display = "block";
      unreadCountEl.textContent = "未読: 0 件";
      unreadCountEl.style.display = "block";
    }
  } catch (err) {
    console.error("[Blog-Read-Forced] 記事取得失敗:", err);
  }
}

/**
 * ポップアップ表示時に保存済みの設定を反映し、未読記事を取得する。
 */
async function init() {
  const result = await chrome.storage.local.get([
    STORAGE_KEY_GAS_URL,
    STORAGE_KEY_INTERVAL,
    STORAGE_KEY_LAST_NOTIFIED,
  ]);
  const gasUrl = result[STORAGE_KEY_GAS_URL];
  const interval = result[STORAGE_KEY_INTERVAL];
  const lastNotified = result[STORAGE_KEY_LAST_NOTIFIED];

  if (gasUrl) {
    gasUrlInput.value = gasUrl;
    await loadOldestArticle(gasUrl);
  }

  // 保存済みの通知間隔をセレクトボックスに反映（未設定時はデフォルト60分）
  intervalSelect.value = String(interval || 60);

  // 最終通知日時を表示
  if (lastNotified) {
    const date = new Date(lastNotified);
    lastNotifiedEl.textContent = `最終通知: ${date.toLocaleString("ja-JP")}`;
  } else {
    lastNotifiedEl.textContent = "最終通知: まだ通知されていません";
  }
}

// ── イベントハンドラ ─────────────────────────────────────

/**
 * 「URL を保存」ボタンのクリックハンドラ。
 * 入力した GAS URL を chrome.storage.local に保存する。
 */
saveUrlBtn.addEventListener("click", async () => {
  const url = gasUrlInput.value.trim();
  if (!url) {
    showMessage("URL を入力してください", "error");
    return;
  }

  // GAS URLの形式バリデーション
  if (!url.startsWith("https://script.google.com/")) {
    showMessage("GAS URL は https://script.google.com/ で始まる必要があります", "error");
    return;
  }

  setDisabled(saveUrlBtn, true);
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_GAS_URL]: url });
    showMessage("URL を保存しました", "success");
  } catch (err) {
    showMessage("保存に失敗しました", "error");
    console.error(err);
  } finally {
    setDisabled(saveUrlBtn, false);
  }
});

/**
 * 通知間隔セレクトボックスの変更ハンドラ。
 * 選択値を chrome.storage.local に保存する。
 * background.js が storage.onChanged で検知してアラームを再登録する。
 */
intervalSelect.addEventListener("change", async () => {
  const minutes = Number(intervalSelect.value);
  await chrome.storage.local.set({ [STORAGE_KEY_INTERVAL]: minutes });
  showMessage(`通知間隔を変更しました`, "success");
});

/**
 * 「この記事を登録」ボタンのクリックハンドラ。
 * アクティブなタブの URL とタイトルを GAS に POST する。
 */
registerBtn.addEventListener("click", async () => {
  const gasUrl = gasUrlInput.value.trim();
  if (!gasUrl) {
    showMessage("先に GAS URL を保存してください", "error");
    return;
  }

  setLoading(registerBtn, true);
  showMessage("登録中...");

  try {
    // 現在タブの情報を取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showMessage("タブ情報を取得できませんでした", "error");
      return;
    }

    // GAS へ POST
    const res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || "",
        source: "Chrome拡張",
      }),
    });

    if (!res.ok) {
      const errorMsg =
        res.status === 403
          ? "GAS URL が正しくないか、アクセス権限がありません"
          : res.status === 404
            ? "GAS URL が見つかりません。デプロイ設定を確認してください"
            : `サーバーエラー (HTTP ${res.status})`;
      showMessage(errorMsg, "error");
      return;
    }

    const data = await res.json();
    if (data.status === "ok") {
      showMessage("登録しました！", "success");
    } else if (data.status === "duplicate") {
      showMessage("この記事は既に登録されています", "error");
    } else {
      showMessage(`エラー: ${data.message || "不明"}`, "error");
    }
  } catch (err) {
    showMessage("通信に失敗しました。ネットワークを確認してください", "error");
    console.error("[Blog-Read-Forced] POST 失敗:", err);
  } finally {
    setLoading(registerBtn, false);
  }
});

/**
 * 「スキップ」ボタンのクリックハンドラ。
 * 表示中の未読記事をGASから削除し、次の記事を読み込む。
 */
skipBtn.addEventListener("click", async () => {
  const gasUrl = gasUrlInput.value.trim();
  const articleUrl = articleTitle.href;
  if (!gasUrl || !articleUrl || articleUrl === "#") return;

  setLoading(skipBtn, true);
  showMessage("削除中...");

  try {
    const deleteUrl = `${gasUrl}?action=delete&url=${encodeURIComponent(articleUrl)}`;
    const res = await fetch(deleteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.status === "ok") {
      showMessage("記事をスキップしました", "success");
      // UIをリセットして次の記事を読み込む
      articleCard.style.display = "none";
      articleEmpty.style.display = "none";
      skipBtn.style.display = "none";
      await loadOldestArticle(gasUrl);
    } else {
      showMessage(data.message || "削除に失敗しました", "error");
    }
  } catch (err) {
    showMessage("通信に失敗しました", "error");
    console.error("[Blog-Read-Forced] 削除失敗:", err);
  } finally {
    setLoading(skipBtn, false);
  }
});

/**
 * ヘルプモーダルの表示 / 非表示。
 */
helpBtn.addEventListener("click", () => {
  helpModal.style.display = "block";
});

modalCloseBtn.addEventListener("click", () => {
  helpModal.style.display = "none";
});

helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = "none";
  }
});

/**
 * 「テスト通知を送信」ボタンのクリックハンドラ。
 * background.js にメッセージを送り、テスト通知を発火させる。
 */
testNotifyBtn.addEventListener("click", async () => {
  setDisabled(testNotifyBtn, true);
  showMessage("テスト通知を送信中...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "testNotification" });
    if (response.success) {
      showMessage("テスト通知を送信しました", "success");
    } else {
      showMessage(response.error || "テスト通知に失敗しました", "error");
    }
  } catch (err) {
    showMessage("テスト通知に失敗しました", "error");
    console.error("[Blog-Read-Forced] テスト通知失敗:", err);
  } finally {
    setDisabled(testNotifyBtn, false);
  }
});

// ── エントリーポイント ────────────────────────────────────
init();
