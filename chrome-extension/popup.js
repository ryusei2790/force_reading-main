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

// ── ユーティリティ ────────────────────────────────────────

/**
 * メッセージ欄にテキストを表示する。
 *
 * @param {string} text - 表示するメッセージ
 * @param {"success"|"error"|""} type - スタイルクラス
 */
function showMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = type;
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
    } else {
      articleEmpty.style.display = "block";
    }
  } catch (err) {
    console.error("[Blog-Read-Forced] 記事取得失敗:", err);
  }
}

/**
 * ポップアップ表示時に保存済みの設定を反映し、未読記事を取得する。
 */
async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY_GAS_URL, STORAGE_KEY_INTERVAL]);
  const gasUrl = result[STORAGE_KEY_GAS_URL];
  const interval = result[STORAGE_KEY_INTERVAL];

  if (gasUrl) {
    gasUrlInput.value = gasUrl;
    await loadOldestArticle(gasUrl);
  }

  // 保存済みの通知間隔をセレクトボックスに反映（未設定時はデフォルト60分）
  intervalSelect.value = String(interval || 60);
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

  setDisabled(registerBtn, true);
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
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.status === "ok") {
      showMessage("登録しました！", "success");
    } else {
      showMessage(`エラー: ${data.message || "不明"}`, "error");
    }
  } catch (err) {
    showMessage("登録に失敗しました", "error");
    console.error("[Blog-Read-Forced] POST 失敗:", err);
  } finally {
    setDisabled(registerBtn, false);
  }
});

// ── エントリーポイント ────────────────────────────────────
init();
