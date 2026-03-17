# システム構成・仕様 — Blog-Read-Forced

## 1. システム全体フロー

```
【記事の登録】
iPhone Safari/Chrome
  └─ 共有ボタン → iPhoneショートカット
       └─ POST { url, source: "iPhone" }
            └─ GAS doPost()
                 └─ Googleスプレッドシートに appendRow()

Chrome（ブラウザ）
  └─ 拡張アイコンクリック → popup.html
       └─ popup.js: chrome.tabs.query() で現在タブ取得
            └─ POST { url, title, source: "Chrome拡張" }
                 └─ GAS doPost()
                      └─ Googleスプレッドシートに appendRow()

【記事の通知】
Chrome拡張 background.js（Service Worker）
  └─ chrome.alarms: 毎日12:00に発火
       └─ GAS doGet() にGETリクエスト
            └─ スプレッドシートから未読で一番古いもの1件取得 → JSON返却
                 └─ chrome.notifications.create() → デスクトップ通知表示
                      └─ 通知クリック → chrome.tabs.create({ url }) → 記事を開く
```

---

## 2. GAS 仕様

### 2-1. doPost（記事の保存）

| 項目 | 内容 |
|------|------|
| HTTPメソッド | POST |
| Content-Type | application/json |
| リクエストボディ | `{ "url": "https://...", "title": "記事タイトル", "source": "iPhone" }` |
| title の扱い | 空の場合は `url` をタイトル代わりに使う |
| バリデーション | `url` が必須。なければエラー返却 |
| 書き込み先 | スプレッドシートの末尾に `appendRow()` |
| 成功レスポンス | `{ "status": "ok", "message": "保存しました" }` |
| 失敗レスポンス | `{ "status": "error", "message": "urlが不正です" }` |

**処理フロー**
```
① e.postData.contents を JSON.parse()
② title = data.title || data.url
③ url のバリデーション（空ならエラー）
④ sheet.appendRow([title, url, new Date(), "未読", "", source])
⑤ JSON レスポンスを返却
```

### 2-2. doGet（記事の取得）

| 項目 | 内容 |
|------|------|
| HTTPメソッド | GET |
| レスポンス形式 | JSON |
| 取得ロジック | D列が「未読」の行だけを抽出 → ランダムで1件選択 |
| 未読なし時 | `{ "status": "empty" }` を返す |
| 成功レスポンス | `{ "status": "ok", "title": "...", "url": "https://..." }` |
| MIMEタイプ | `ContentService.MimeType.JSON` を必ず指定 |

**処理フロー**
```
① sheet.getDataRange().getValues() で全行取得
② D列 === "未読" の行だけ filter()
③ unread.length === 0 なら { status: "empty" } 返却
④ Math.random() でランダムに1行選択
⑤ { status: "ok", title: picked[0], url: picked[1] } 返却
```

### 2-3. デプロイ設定

| 項目 | 設定値 |
|------|--------|
| 実行ユーザー | 自分（スプレッドシートオーナー） |
| アクセス権限 | 全員（匿名ユーザー含む） |
| URL更新方法 | 「デプロイを管理」→「編集」→「新しいバージョン」でURLを維持したまま更新 |

---

## 3. Chrome拡張 仕様

### 3-1. ファイル構成

```
chrome-extension/
├── manifest.json   # 拡張の設定・権限定義
├── background.js   # Service Worker（アラーム・通知）
├── popup.html      # ツールバーのUI
├── popup.js        # popup のロジック
└── icon.png        # 拡張アイコン
```

### 3-2. manifest.json の主要設定

```json
{
  "manifest_version": 3,
  "permissions": ["alarms", "notifications", "tabs", "storage"],
  "host_permissions": ["https://script.google.com/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

> `host_permissions` にGASのドメインを追加しないと、Chrome拡張からのfetchがCORSエラーになる。

### 3-3. background.js の処理フロー

```
① インストール時: chrome.alarms.create("daily", { periodInMinutes: 1440 })
   → 毎日同じ時刻に発火するアラームを登録

② chrome.alarms.onAlarm.addListener:
   → GAS doGet() へ fetch()
   → data.status === "empty" なら何もしない
   → data.status === "ok" なら chrome.notifications.create()

③ chrome.notifications.onClicked.addListener:
   → chrome.tabs.create({ url: articleUrl }) で記事を開く
```

### 3-4. popup.js の処理フロー

```
① ボタンクリック
② chrome.tabs.query({ active: true, currentWindow: true })
   → 現在タブの url と title を取得
③ fetch(GAS_URL, { method: "POST", body: JSON.stringify({ url, title, source: "Chrome拡張" }) })
④ 成功 → メッセージ表示「登録しました！」
   失敗 → エラー表示
```

---

## 4. iPhoneショートカット 仕様

| ステップ | アクション | 設定内容 |
|---------|-----------|---------|
| ① | ショートカットの入力を受け取る | 入力タイプ：URL |
| ② | 変数を設定 | 変数名「pageURL」= 入力のURL |
| ③ | 辞書 | `url`: pageURL、`source`: "iPhone"（titleは送らない） |
| ④ | URLのコンテンツを取得 | URL: GASのWebアプリURL、メソッド: POST、本文: 辞書(JSON) |
| ⑤ | 通知を表示 | 本文: 「登録しました」 |

> iPhoneのChromeからURLを共有した場合、タイトルは取得できない。GAS側で `title = data.title || data.url` で吸収する。

---

## 5. データ仕様（スプレッドシート）

### カラム定義

| 列 | カラム名 | 型 | 初期値 | 例 |
|----|---------|-----|--------|-----|
| A | タイトル | String | url の値 | 「GASの使い方」 |
| B | URL | String | 必須 | `https://example.com/...` |
| C | 登録日時 | Date | `new Date()` | `2025/01/15 12:30` |
| D | ステータス | String | `"未読"` | `"未読"` / `"既読"` |
| E | メモ | String | `""` | （将来用） |
| F | ソース | String | リクエスト値 | `"iPhone"` / `"Chrome拡張"` |

### ステータス管理

- 初期値は全て `"未読"`
- 読んだ後はスプレッドシートを直接開いてD列を `"既読"` に変更（現状は手動）
- `doGet()` はD列が `"未読"` の行のみを対象にする

---

## 6. ストレージ使い分け

| 保存先 | API | 寿命 | 用途 |
|--------|-----|------|------|
| 変数 | `const` / `let` | 実行中のみ | 処理中の一時データ |
| Chrome Storage | `chrome.storage.local` | 拡張を削除するまで | GASのWebアプリURL設定値 |
| Google スプレッドシート | GAS + Sheets API | 手動削除まで | 記事データ（永続DB） |

---

## 7. エラーハンドリング方針

| エラー | 発生箇所 | 対処 |
|--------|---------|------|
| urlが空 | GAS doPost() | `{ status: "error", message: "urlが不正です" }` を返す |
| 未読記事なし | GAS doGet() | `{ status: "empty" }` を返す。Chrome拡張側で通知をスキップ |
| GASへのfetch失敗 | Chrome拡張 | console.error に記録。ユーザーへのフィードバックは行わない |
| GASへのfetch失敗 | popup.js | UIにエラーメッセージを表示 |
