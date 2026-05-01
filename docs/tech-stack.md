# 技術選定 — Blog-Read-Forced

## 選定方針

- **コストゼロ**で運用できること
- **サーバー管理不要**（インフラレスな構成）
- 個人利用に必要な機能を**最小構成**で実現

---

## 技術スタック一覧

| レイヤー | 技術 | バージョン | 役割 |
|---------|------|-----------|------|
| バックエンド | Google Apps Script (GAS) | - | HTTPエンドポイント・スプレッドシート操作・LINEへの通知送信 |
| データベース | Google スプレッドシート | - | 記事データの永続保存 |
| ブラウザ拡張 | Chrome Extensions (Manifest V3) | MV3 | 通知・タブ操作・記事登録UI |
| 言語 | JavaScript (ES2020+) | - | GAS・Chrome拡張ともに共通言語 |
| モバイル連携 | iPhoneショートカット | iOS 16+ | URLをGASへPOSTする自動化 |
| LINE通知 | LINE Messaging API | - | スマホへの記事通知・既読リンクの配信 |

---

## 各技術の選定理由と何ができるか

### Google Apps Script (GAS)

**何者か**
Googleが提供するサーバーレスのJavaScript実行環境。GoogleドライブやSheetsと直接連携できる。

**選定理由**
- Googleアカウントだけで無料で使える
- `doPost()` / `doGet()` でWebエンドポイントを公開できる（サーバー不要）
- `SpreadsheetApp` でスプレッドシートを直接操作できる
- 時間トリガーでLINE通知を定期実行できる
- デプロイするだけでURLが発行され、外部からHTTPリクエストを受け取れる

**このプロジェクトでやること**

| 関数 | 処理 |
|------|------|
| `doPost()` | iPhoneやChrome拡張からの記事URLを受け取り、スプレッドシートに保存 |
| `doGet()` | 未読記事の取得 / 既読更新（markRead）/ 記事削除（delete）をアクションで切り替え |
| `notifyLineArticle()` | 最古の未読記事を取得し、既読リンク付きでLINEに通知（時間トリガーから呼ばれる） |
| `setupLineNotifyTrigger()` | LINE通知の時間トリガーを登録（GASエディタから1回だけ手動実行） |

---

### Google スプレッドシート

**何者か**
Googleのクラウドスプレッドシート。GASから直接読み書きでき、DBとして使える。

**選定理由**
- 無料
- GASと完全に統合されており、追加設定なしで使える
- 人間が直接データを確認・編集できる（デバッグが簡単）
- 個人利用規模のデータ量なら性能として十分

**代替案との比較**

| 選択肢 | コスト | 管理 | 可視性 | 結論 |
|--------|--------|------|--------|------|
| Googleスプレッドシート | 無料 | 不要 | 見やすい | **採用** |
| Firebase / Supabase | 無料枠あり | 設定が必要 | 要管理画面 | 個人用には過剰 |
| MySQL / PostgreSQL | サーバー代 | サーバー管理 | 要クライアント | 明らかに過剰 |

---

### Chrome Extensions (Manifest V3)

**何者か**
Chromeブラウザの機能を拡張する公式の仕組み。JS/HTML/CSSで実装する。

**選定理由**
- Chromeブラウザへの通知・タブ操作などブラウザAPIを使うには拡張機能しかない
- Manifest V3はChromeの現行標準（V2は廃止予定）
- Service Workerベースで、ブラウザ起動中はバックグラウンドで動作できる

**このプロジェクトで使うAPI**

| API | 用途 |
|-----|------|
| `chrome.alarms` | 設定間隔（デフォルト60分）でアラームを登録・発火 |
| `chrome.notifications` | デスクトップ通知の表示 |
| `chrome.tabs` | 通知クリック時に記事URLを新タブで開く |
| `chrome.storage.local` | GAS URL・通知間隔・最終通知日時を拡張内に保存 |
| `chrome.runtime.sendMessage` | popupからbackground.jsへテスト通知を依頼 |

**ファイル構成**

| ファイル | 役割 |
|---------|------|
| `manifest.json` | 拡張の設定・権限定義 |
| `background.js` | Service Worker。アラーム登録・通知表示・既読更新 |
| `popup.html` | ツールバーのUI |
| `popup.js` | 記事登録・スキップ・設定変更・テスト通知のロジック |

---

### LINE Messaging API

**何者か**
LINEが提供するBot向けAPIで、公式アカウントからメッセージを送信できる。

**選定理由**
- スマホで一番見るアプリがLINEなので通知に気づきやすい
- broadcastで友だち全員（＝自分）に送信する最小構成で使える
- GASから `UrlFetchApp.fetch()` で直接叩けるのでサーバー不要
- 月1000通まで無料（個人利用なら超過しない）

**このプロジェクトでの使い方**

| 項目 | 内容 |
|------|------|
| エンドポイント | `POST https://api.line.me/v2/bot/message/broadcast` |
| 認証 | チャネルアクセストークン（GASスクリプトプロパティで管理） |
| メッセージ形式 | テキスト（記事タイトル・URL・残り未読件数・既読リンクを含む） |
| 既読リンクの仕組み | GASの `doGet(?action=markRead&url=...)` URLをメッセージに含める |

---

### JavaScript (ES2020+)

**何者か**
GASおよびChrome拡張の実装言語。

**選定理由**
- GASはJavaScriptしか選択肢がない
- Chrome拡張もJS/HTML/CSSのみで実装する
- 1つの言語で全コンポーネントを書けるため学習コストが最小

**主に使う機能**

| 機能 | 用途 |
|------|------|
| `async/await` | GASへのfetchを非同期処理 |
| `fetch()` | Chrome拡張からGASへHTTPリクエスト |
| `JSON.stringify/parse` | データのシリアライズ・デシリアライズ |
| `encodeURIComponent()` | 既読リンクのURL生成時にArticle URLをエンコード |

---

### iPhoneショートカット

**何者か**
iOS標準搭載の自動化ツール。アプリ不要でHTTPリクエストなどのアクションを組み合わせられる。

**選定理由**
- 追加アプリ不要（iOS標準）
- 共有シートから直接URLを受け取れる
- HTTPリクエスト（POST）をGUIで設定できる
- 個人ツールとしての利便性が高い

**このプロジェクトでの動作フロー**

```
① Safari/Chromeで記事を開く
② 共有ボタン → ショートカットを選択
③ URLを受け取る（タイトルは取得不可）
④ JSON形式でGASへPOST送信
⑤ 完了通知を表示
```

---

## 技術間の関係図

```
[iPhone ショートカット]
  共有 → POST(url, source)
         ↓
[GAS doPost()]
  重複チェック → URLをスプレッドシートに保存
         ↓
[Google スプレッドシート]
  タイトル | URL | 日時 | ステータス | ソース
         ↑                    ↑
[GAS doGet()]            [GAS doGet(?action=markRead)]
  最古の未読1件取得            該当URLを既読に更新
  ↑                               ↑
[Chrome拡張 background.js]   [Chrome通知クリック / LINEの既読リンクタップ]
  設定間隔でGETリクエスト
  → 通知表示
  → クリックで記事を開く + markRead

[GAS 時間トリガー]
  → notifyLineArticle()
       → 最古の未読1件取得
       → markReadリンクを生成
       → LINE broadcast送信
            ↓
       [スマホのLINE]
         記事URL + 既読リンク

[Chrome拡張 popup.js]
  現在タブのURL/タイトル → POST → GAS doPost()
  スキップボタン → GAS doGet(?action=delete) → 記事削除
```
