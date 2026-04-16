# タスク管理ツール

Windows向けのローカルタスク管理ツール。ブラウザベースのUIとPowerShellバックエンドで動作し、外部依存なしで使用可能。

## 起動方法

`起動.bat` をダブルクリックするとサーバーが起動し、ブラウザでアプリが開きます。

## 機能一覧

| 機能 | 説明 |
|------|------|
| プロジェクト | タスクをグループ化して管理。カラーラベル、README、フォルダリンク付き。ドラッグ&ドロップで並び替え可能 |
| タスク | 親子階層、ステータス、優先度、担当者、期限、タグで管理。カラムヘッダーのソートとドラッグ&ドロップの並び替えに対応 |
| テンプレート | プロジェクト作成時にタスクとREADMEを自動生成するテンプレート。Markdown README付き。テンプレート自体とテンプレート内のタスクをドラッグ&ドロップで並び替え可能 |
| メモ | Markdownエディタ付きのメモ機能 |
| アラーム | 指定日時に通知。日次・週次・月次の繰り返し設定可能 |
| ポモドーロ | 作業/休憩タイマー。サイクル数やインターバルをカスタマイズ可能 |
| ゴミ箱 | 削除したタスク・プロジェクトを復元可能。完全削除も可能 |
| アーカイブ | 完了したタスク・プロジェクトを一覧から非表示にして保管 |

## 技術構成

- **フロントエンド**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **バックエンド**: PowerShell 5.1 (Windows標準) HTTPサーバー
- **データ保存**: JSONファイル (データベース不要)
- **通知**: Windows Toast通知 (WinRT API)
- **アイコン**: Lucide Icons (CDN)

## ファイル構成

```
タスク管理ツール/
├── members.json      # メンバーリスト (担当者の選択肢)
├── 起動.bat          # 起動バッチ
├── startup.ps1       # 起動スクリプト (ポートチェック、サーバー起動、ブラウザ起動)
├── server.ps1        # バックエンドサーバー (HTTP API + 通知)
├── config.json       # 設定ファイル
├── index.html        # メインページ
├── js/               # フロントエンドJavaScript
│   ├── api.js        #   APIクライアント
│   ├── router.js     #   SPAルーター
│   ├── store.js      #   データキャッシュ管理
│   ├── projects.js   #   プロジェクト管理
│   ├── tasks.js      #   タスク管理
│   ├── alarm.js      #   アラーム管理
│   ├── pomodoro.js   #   ポモドーロタイマー
│   ├── memo.js       #   メモ管理
│   ├── filters.js    #   タスクフィルタ
│   ├── templates.js  #   テンプレート管理
│   ├── archive.js    #   アーカイブ管理
│   ├── trash.js      #   ゴミ箱管理
│   ├── utils.js      #   ユーティリティ (Modal, Toast, 日付フォーマットなど)
│   └── config.js     #   自動生成 (ポート番号)
├── css/              # スタイルシート
│   ├── reset.css     #   CSSリセット
│   ├── theme.css     #   カラーテーマ変数
│   ├── layout.css    #   レイアウト
│   ├── components.css#   UIコンポーネント
│   └── task-list.css #   タスク一覧テーブル
└── data/             # データファイル (自動生成)
    ├── projects.json
    ├── tasks.json
    ├── templates.json
    ├── memos.json
    └── personal/     # 個人データ (config.jsonで変更可能)
        ├── alarms.json
        └── pomodoro.json
```

## config.json 設定項目

```json
{
  "port": 7890,
  "browser": "msedge",
  "dataDir": "./data",
  "dataPaths": {
    "projects":  "./data",
    "tasks":     "./data",
    "templates": "./data",
    "memos":     "./data",
    "alarms":    "./data/personal",
    "pomodoro":  "./data/personal"
  }
}
```

| キー | 説明 | デフォルト値 |
|------|------|-------------|
| `port` | サーバーのポート番号 | `7890` |
| `browser` | 起動時に開くブラウザ (`msedge`, `chrome`, `firefox` など) | `msedge` |
| `dataDir` | データ保存先のデフォルトディレクトリ。`dataPaths` で個別指定しない場合に使用 | `./data` |
| `dataPaths` | データファイルの保存先を種別ごとに指定するオブジェクト | (下記参照) |

### dataPaths の種別

| キー | 内容 | 共有/個人 | デフォルト |
|------|------|-----------|-----------|
| `projects` | プロジェクト情報 | 共有向き | `./data` |
| `tasks` | タスク一覧 | 共有向き | `./data` |
| `templates` | プロジェクトテンプレート | 共有向き | `./data` |
| `memos` | メモ | 共有向き | `./data` |
| `alarms` | アラーム設定 | 個人向き | `./data/personal` |
| `pomodoro` | ポモドーロ設定・タイマー状態 | 個人向き | `./data/personal` |

パスは相対パス (`./data`) でも絶対パス (`C:\Data`) でもネットワークパス (`\\server\share\data`) でも指定可能です。相対パスは `config.json` のあるディレクトリが基準になります。未指定の場合は `dataDir` の値が使用されます。

## members.json (メンバーリスト)

タスクの担当者として選択できるメンバーを定義します。文字列の配列で記述します。

```json
[
  "田中太郎",
  "鈴木花子",
  "佐藤一郎"
]
```

このファイルを編集するとタスク作成/編集時やフィルターの担当者選択肢に反映されます (サーバー再起動不要)。

## API エンドポイント

ベースURL: `http://localhost:{port}/api`

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/ping` | サーバー応答確認 |
| GET | `/members` | メンバーリスト取得 |
| GET | `/shutdown` | サーバー停止 |
| GET/POST/PUT/DELETE | `/projects[/{id}]` | プロジェクトCRUD |
| PUT | `/projects/reorder` | プロジェクトの並び替え (`[{id, sortOrder}, ...]`) |
| GET/POST/PUT/DELETE | `/tasks[/{id}]` | タスクCRUD |
| PUT | `/tasks/reorder` | タスクの並び替え (`[{id, sortOrder}, ...]`) |
| GET/POST/PUT/DELETE | `/alarms[/{id}]` | アラームCRUD |
| GET/POST/PUT/DELETE | `/memos[/{id}]` | メモCRUD |
| GET/POST/PUT/DELETE | `/templates[/{id}]` | テンプレートCRUD |
| PUT | `/templates/reorder` | テンプレートの並び替え (`[{id, sortOrder}, ...]`) |
| GET/PUT | `/pomodoro/settings` | ポモドーロ設定 |
| GET/PUT | `/pomodoro/state` | ポモドーロ状態 |
