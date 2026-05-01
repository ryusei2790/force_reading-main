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

【記事の通知 — Chrome】
Chrome拡張 background.js（Service Worker）
  └─ chrome.alarms: 設定間隔（デフォルト60分）で発火
       └─ GAS doGet() にGETリクエスト
            └─ スプレッドシートから最古の未読記事1件取得 → JSON返却
                 └─ chrome.notifications.create() → デスクトップ通知表示
                      └─ 通知クリック
                           ├─ chrome.tabs.create({ url }) → 記事を新タブで開く
                           └─ GAS doGet(?action=markRead&url=...) → 既読に更新

【記事の通知 — LINE】
GAS 時間トリガー → notifyLineArticle()
  └─ スプレッドシートから最古の未読記事1件取得
       └─ ScriptApp.getService().getUrl() で自GAS URLを取得
            └─ markReadリンクを生成:
               {gasUrl}?action=markRead&url={encodedArticleUrl}
                 └─ LINE Messaging API broadcast でメッセージ送信
                      └─ スマホのLINEに通知
                           ├─ 記事URLをタップ → ブラウザで記事を開く
                           └─ 「既読にする」リンクをタップ
                                └─ GAS doGet(?action=markRead&url=...) → 既読に更新
```

---

## 2. GAS 仕様

### 2-1. doPost（記事の保存）

| 項目 | 内容 |
|------|------|
| HTTPメソッド | POST |
| Content-Type | application/json |
| リクエストボディ | `{ "url": "https://...", "title": "記事タイトル", "source": "iPhone" }` |
| title の扱い | 空の場合は `url` をタイトル代わりに使用 |
| バリデーション | `url` が必須。なければエラー返却 |
| 重複チェック | 同じURLで未読の記事が既存の場合は `status: "duplicate"` を返す |
| 書き込み先 | スプレッドシートの末尾に `appendRow()` |
| 成功レスポンス | `{ "status": "ok", "message": "保存しました" }` |
| 重複レスポンス | `{ "status": "duplicate", "message": "この記事は既に登録されています" }` |
| 失敗レスポンス | `{ "status": "error", "message": "urlが不正です" }` |

**処理フロー**
```
① e.postData.contents を JSON.parse()
② title = data.title || data.url
③ url のバリデーション（空ならエラー）
④ 重複チェック（同URLで未読が存在したらduplicate返却）
⑤ sheet.appendRow([title, url, new Date(), "未読", "", source])
⑥ JSON レスポンスを返却
```

### 2-2. doGet（記事の取得・既読更新・削除）

| action | 処理 | 必須パラメータ |
|--------|------|--------------|
| なし（デフォルト） | 最古の未読記事を1件返す | なし |
| `markRead` | 指定URLの記事を既読に更新する | `url` |
| `delete` | 指定URLの未読記事を行ごと削除する | `url` |

**デフォルト（記事取得）レスポンス**

| 状態 | レスポンス |
|------|-----------|
| 未読あり | `{ "status": "ok", "title": "...", "url": "https://...", "unreadCount": N }` |
| 未読なし | `{ "status": "empty", "unreadCount": 0 }` |

**処理フロー（記事取得）**
```
① sheet.getDataRange().getValues() で全行取得
② D列 === "未読" の行だけ filter()（登録順）
③ unread.length === 0 なら { status: "empty" } 返却
④ unread[0]（最古の記事）を返却
⑤ { status: "ok", title: picked[0], url: picked[1], unreadCount: unread.length } 返却
```

### 2-3. LINE通知関連の関数

| 関数 | 役割 |
|------|------|
| `getLineToken()` | スクリプトプロパティから LINE_CHANNEL_ACCESS_TOKEN を取得 |
| `sendLineMessage(text)` | LINE Messaging API broadcast でテキスト送信 |
| `notifyLineArticle()` | 最古の未読記事を取得してLINEに通知（トリガーのエントリーポイント） |
| `setupLineNotifyTrigger(intervalHours)` | 時間トリガーを登録（GASエディタから1回だけ手動実行） |
| `removeLineNotifyTrigger()` | 登録済みトリガーを全削除 |

**notifyLineArticle() の処理フロー**
```
① LINE_CHANNEL_ACCESS_TOKEN の存在確認（なければスキップ）
② スプレッドシートから最古の未読記事1件取得
③ 未読0件なら何もしない
④ ScriptApp.getService().getUrl() で自GAS URLを取得
⑤ markReadリンクを生成: {gasUrl}?action=markRead&url={encodedUrl}
⑥ メッセージ文字列を組み立てる
⑦ LINE Messaging API broadcast で送信
```

**LINEメッセージのフォーマット**
```
📖 読むべき記事があります！

📰 {記事タイトル}
🔗 {記事URL}

残り未読: {N} 件

✅ 既読にする
{gasUrl}?action=markRead&url={encodedArticleUrl}
```

### 2-4. デプロイ設定

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
├── manifest.json   # 拡張の設定・権限定義（Manifest V3）
├── background.js   # Service Worker（アラーム・通知・既読更新）
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
① インストール時: chrome.alarms.create("daily-article", { periodInMinutes: 設定値 })
   → 設定間隔（デフォルト60分）で繰り返し発火するアラームを登録

② chrome.alarms.onAlarm.addListener:
   → GAS doGet() へ fetch()
   → data.status === "empty" なら何もしない
   → data.status === "ok" なら chrome.notifications.create()
   → articleUrl を chrome.storage.local に保存

③ chrome.notifications.onClicked.addListener:
   → chrome.tabs.create({ url: articleUrl }) で記事を開く
   → GAS doGet(?action=markRead&url=...) で既読に更新

④ chrome.storage.onChanged.addListener:
   → 通知間隔が変更されたらアラームを再登録
```

### 3-4. popup.js の主な機能

| 機能 | 処理 |
|------|------|
| GAS URL 保存 | 入力値を chrome.storage.local に保存 |
| 記事登録 | 現在タブの URL/タイトルを GAS へ POST |
| 未読記事表示 | 起動時に GAS doGet() を叩いて最古の未読記事を表示 |
| スキップ | GAS doGet(?action=delete&url=...) で記事を削除し次の記事を読み込む |
| 通知間隔設定 | セレクトボックスで変更 → chrome.storage.local に保存 |
| テスト通知 | background.js にメッセージを送って即座に通知を発火（既読にならない） |

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

| 列 | カラム名 | 型 | 初期値 | 更新タイミング |
|----|---------|-----|--------|--------------|
| A | タイトル | String | url の値 | 登録時 |
| B | URL | String | 必須 | 登録時 |
| C | 登録日時 | Date | `new Date()` | 登録時 |
| D | ステータス | String | `"未読"` | Chrome通知クリック / LINEの既読リンクタップ時に「既読」へ更新 |
| E | メモ | String | `""` | 将来用 |
| F | ソース | String | リクエスト値 | 登録時 |

---

## 6. ストレージ使い分け

| 保存先 | API | 寿命 | 用途 |
|--------|-----|------|------|
| 変数 | `const` / `let` | 実行中のみ | 処理中の一時データ |
| Chrome Storage | `chrome.storage.local` | 拡張を削除するまで | GAS URL・通知間隔・最終通知日時 |
| Google スプレッドシート | GAS + Sheets API | 手動削除まで | 記事データ（永続DB） |
| GAS スクリプトプロパティ | `PropertiesService` | 手動削除まで | LINE_CHANNEL_ACCESS_TOKEN |

---

## 7. エラーハンドリング方針

| エラー | 発生箇所 | 対処 |
|--------|---------|------|
| urlが空 | GAS doPost() | `{ status: "error", message: "urlが不正です" }` を返す |
| 重複URL | GAS doPost() | `{ status: "duplicate" }` を返す |
| 未読記事なし | GAS doGet() | `{ status: "empty" }` を返す。Chrome拡張・LINEトリガーともにスキップ |
| GASへのfetch失敗 | Chrome拡張 background.js | 警告通知を表示してconsole.errorに記録 |
| GASへのfetch失敗 | popup.js | UIにエラーメッセージを表示 |
| LINEトークン未設定 | notifyLineArticle() | console.warnに記録してスキップ |
| LINE broadcast失敗 | sendLineMessage() | HTTPステータスコードをconsole.errorに記録 |
