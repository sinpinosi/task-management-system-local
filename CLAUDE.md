# CLAUDE.md - プロジェクトガイドライン

## プロジェクト概要

Windows向け完全オフラインタスク管理ツール。ブラウザUI + PowerShellサーバーで動作。

## 設計原則（厳守事項）

1. **完全オフライン動作** - インターネット接続を前提としない。CDN、外部API、リモートリソースの参照は禁止。
2. **ダウンロード・インストール不要** - npm, pip, Node.js 等の追加ツールを必要としない。package.jsonを追加しない。
3. **Windows標準機能のみ使用** - PowerShell 5.1、標準ブラウザ(Edge)、WinRT APIなど、Windowsをインストール後すぐに使える機能だけで動作すること。
4. **外部ライブラリはベンダリング** - 必要なライブラリ(例: Lucide Icons)はjs/vendor/にファイルとして同梱する。CDNリンクは使わない。

## 技術スタック（変更不可）

- フロントエンド: Vanilla JavaScript (ES6+), HTML5, CSS3（フレームワーク禁止）
- バックエンド: PowerShell 5.1 HTTPサーバー（server.ps1）
- データ保存: JSONファイル（データベース不要）
- 通知: Windows Toast通知（WinRT API）

## やってはいけないこと

- npm install / pip install / パッケージマネージャの使用
- CDNやリモートURLからのスクリプト・スタイル読み込み
- React, Vue, Svelte 等のフレームワーク導入
- Node.js, Python, .NET等の追加ランタイムを前提とする変更
- package.json, node_modules の追加
- fetch()でインターネット上のリソースにアクセス
- ビルドステップ（webpack, vite, esbuild等）の追加

## ファイル構成ルール

- 新しいJSファイルは js/ 直下に配置
- 外部ライブラリは js/vendor/ にベンダリング
- CSSファイルは css/ 直下に配置
- データファイルは data/ 以下（.gitignoreで除外済み）

## 起動方法

`起動.bat` をダブルクリック → PowerShellサーバー起動 → ブラウザ自動オープン
