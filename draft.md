# ⚡ Blog-Read-Forced 技術仕様書 + AI駆動エンジニアの教科書

---

## PART 1　Blog-Read-Forced 技術仕様書

---

### 1. GAS — 技術仕様

#### 1-1. doPost（記事の保存）

| 項目 | 内容 |
|------|------|
| HTTPメソッド | POST |
| Content-Type | application/json |
| リクエストボディ | `{ "url": "https://...", "source": "iPhone" }` ※titleは任意（iPhoneからは送らない） |
| 処理の流れ | ① JSONパース → ② `title = data.title \|\| data.url`（titleが空ならurlで代用） → ③ バリデーション（url必須） → ④ スプレッドシート末尾に追記 → ⑤ JSONレスポンス返却 |
| 成功レスポンス | `{ "status": "ok", "message": "保存しました" }` |
| 失敗レスポンス | `{ "status": "error", "message": "urlが不正です" }` |
| 使用するGASメソッド | `SpreadsheetApp.openById()` / `getSheetByName()` / `appendRow([])` |

#### 1-2. doGet（記事の取得）

| 項目 | 内容 |
|------|------|
| Hut()` |
| MIMEタイプ設定 | `ContentService.MimeType.JSON` を必ず指定 |

#### 1-3. GAS Webアプリのデプロイ設定

| 項目 | 内容 |
|------|------|
| 実行ユーザー | 自分（スプレッドシートオーナーとして実行） |
| アクセス権限 | 全員（匿名ユーザーを含む） |
| 更新方法 | 「デプロイを管理」→「編集」→「新しいバージョン」でURLを変えずに更新 |

---

### 2. Chrome拡張 — 技術仕様

#### 2-1. ファイル構成

| ファイル名 | 役割 |
|-----------|------|
| `manifest.json` | 拡張機能の設定ファイル。権限・アイコン・background・popupを定義 |
| `background.js` | Service Worker。alarmの登録・発火時にfetch→通知表示を担当 |
| `popup.html` | ツールバークリック時に開くUI（登録// 4. 通知クリック → タブで記事を開く
chrome.notifications.onClicked → chrome.tabs.create({ url: articleUrl })
```

#### 2-3. host_permissions（CORS対策）

> ⚠️ Chrome拡張からGASへfetchするには `manifest.json` に `host_permissigle.com/*"
]
```

---

### 3. iPhoneショートカット — 技術仕様

> ⚠️ **ChromeからURLを共有する場合、タイトルは取得できない。** タイトルが空の場合はGAS側でURLをタイトル代わりに使う（`title = data.title || data.url`）。

| 順番 | アクション名 | 設定内容 |
|------|-------------|---------|
| ① | ショートカットの入力を受け取る | 入力タイプ：**URL**（ChromeからはURLのみ渡ってくる） |
| ② | 変数を設定 | 変数名「pageURL」= 入力のURL |
| ③ | 辞書 | キー：url → pageURL、キー：source → "iPhone"（固定）、**title は送らない** |
| ④ | URLのコンテンツを取得 | URL：GASのWebアプリURL、メソッド：POST、本文：辞書（JSON） |
| ⑤ | 通知を表示 | 本文：「登lStorage` / `sessionStorage` | タブを閉じても残る | ユーザー設定・トークンの一時保存 |
| Chrome Storage | `chrome.storage.local/sync` | 拡張を消すまで | Chrome拡張専用。syncは複数端末同期 |
| スプレッドシート | GAS + Google Sheets | 手動削除まで | 個人ツールのDB代わり。視覚的に確認できる |
| クラウドDB | Firebase / Supabase / MySQL | サービス継続中 | 複数ユーザー・大量データ・本番プロダクト |

> 💡 **本プロジェクトの使い分け**
> - 記事データ → Googleスプレッドシート
> - GASのURL設定 → `chrome.storage.local`
> - 通知用の一時データ → 変数

---

### 5. データ保存の書き方パターン

#### ① 変数に保存（一番基本）

```js
// 変数に値を入れる = メモリに保存
const title = "GASの使い方";   // 変更しない値
let count = 0;                  // 変更する値
count = count + 1;              // 上書き（更新）
```

#保存）
sheet.appendRow(["タイトル", "URL", new Date(), "未読", "", "iPhone"]);

// 全データを2次元配列で取得
const allRows = sheet.getDataRange().getValues();
// allRows[0] → ['タイトル', 'URL', '2025/01/15', '未読', '', 'iPhone']
```

---

## PART 3　関数・処理の流れの完全理解

> 💡 関数とは「処理をまとめた箱」。AI駆動開発でも「何をする箱か」を伝える命名と構造が全て。

---

### 6. 関数の3つの種類と使い分け

| 種類 | 書き方 | 使いどき |
|------|--------|---------|
| 通常の関数（function宣言） | `function fetchArticle() { ... }` | GASで使う。トリガー設定の対象にもなる |
| アロー関数（モダンJS） | `const notify = () => { ... }` | Chrome拡張・フロントで言 | GETを受け取り未読記事をランダム返却 |
| GAS | `getUnreadRows(sheet)` | function宣言 | シートから未読行だけを配列で返す |
| GAS | `pickRandom(rows)` | function宣言 | 配列からランダムで1要素を返す |
| background | `setupDailyAlarm()` | アロー関数 | 毎日12時` | アロー関数 | `chrome.notifications.create`で通知を表示 |
| popup | `registerCurrentTab()` | async関数 | 現在タブのURL/タイトルを取得しGASへPOST |

---

### 8. データ処理の基本パターン（GASで必ず使う）

#### パターンA：全行取得 → 絞り込み → ランダム選択

```js
const rows = sheet.getDataRange().getValues();
// == "未読");

// ランダムで1行選ぶ
const randomIndex = Math.floor(Math.random() * unread.length);
const picked = unread[randomIndex];
// picked = ['記事タイトル', 'https://...', ...]
```

#### パターンB：非同期でAPIを叩く（fetchの書き方）

```js
async function fetchArticle(gasUrl) {
  const response = await fetch(gasUrl);   // GASへリクエスト
  const data = await response.json();     // JSON文字列 → オブジェクトに変換

  if (data.status === "empty") {
    return null;  // 未読なし
  }
  return data;  // { title: '...', url: 'https://...' };

  return ContentService
    .createTextOutput(JSON.stringify(result))  // オブジェクト → JSON文字列
    .setMimeType(ContentService.MimeType.JSON); // Content-TypeをJSONに設定
}
```

---

## PART 4　データ出力の場所と方法

> 💡 「出力」とはデータを人間や別のプログラムが読める形にして届けること。場所が違えば書き方が全く違うtions.create()` | タイトル＋本文＋アイコン | 毎日12時の記事通知（メイン機能） |
| ブラウザのタブ | `chrome.tabs.create()` | URLを開く | 通知クリック時に記事URLをタブで開く |
| ポップアップUI | DOM操作 / `innerHTML` | HTML表示 | 登録完了フィードバック・エラー表示 |
| APIレ# ① デスクトップ通知（Chrome拡張）

```js
chrome.notifications.create('blog-notify', {
  type: "basic",
  iconUrl: "icon.png",
  title: data.title,       // 記事タイトル
  message: "クリックして読む ▶",
});
```

#### ② 新しいタブで記事を開く（Chrome拡張）

```js
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: articleUrl });
});
```

#### ③ ポップアップUIへの出力（DOM操作）

```js
const msg = document.getElementById("message");

// 成功メッセージを表示
msg.textContent = "登録しました！ ✅";
msg.style.color = "gr0], url: picked[1] };
return ContentService
  .createTextOutput(JSON.stringify(output))
  .setMimeType(ContentService.MimeType.JSON);
```

---

## PART 5　AI駆動開発エンジニアになるために

---

### 11. AIに伝えるべき「コードの地図」4要素

> 💡 AIはコードを書く。エンジニアは「何を・どこで・どうやって・なぜ」を設計する。この4要素を伝えられると、AIが一発で正確なコードを出す。

| 要素 | 意味 | 例（本プロジェクト） |
|------|------|-------------------|
| ① 何を | 関数・機能の名前と目的 | 「未読記事をランダムで1件取得するdoGet関数を書いて」 |
| ② どこで | 実行環境・ファイル | 「GASのコードとして。スプレッドシートのD列がステータス」 |
| ③ どうやって | 入出力・デ | ポップアップ上で右クリック →「検証」→ Consoleタブ |
| fetchの通信エラー | Chrome DevTools | Networkタブでリクエスト/レスポンスの中身を確認 |
| GASへのPOST確認 | curl / Postman | `curl -X POST -d '{...}' GAS_URL` をターミナルで実行 |

---

### ✅ まとめ：AI駆動エンジニアの思考フロー

1. **「何を保存するか？」** → 保存場所を決める（変数 / Storage / スプレッドシート / DB）
2. **「どう処理するか？」** → 関数に分解する（取得・絞り込み・ランダム選択・更新）
3. **「どこに出力するか？」** → 出力先を決める（通知 / タブ / UI / APIレスポンス）
4. **「AIに何を伝えるか？」** → 何を・どこで・どうやって・なぜ の4要素を明確にする
5. **「動かなかったら？」** → デバッグの場所を知っていれば怖くない
