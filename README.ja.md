[English](README.md) | [中文](README.zh.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Português](README.pt.md)

<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>単なるビューアではありません。AIと対話し、履歴を編集し、すべての会話を管理できます。</strong><br>
    <em>Claude Code と OpenAI Codex に対応。変更は実際のファイルに書き戻されます。</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="downloads"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  </p>
  <p align="center">
    <a href="https://arvid-pku.github.io/claude-journal/"><strong>インタラクティブガイド</strong></a> &middot;
    <a href="https://www.npmjs.com/package/claude-journal">npm</a> &middot;
    <a href="https://github.com/Arvid-pku/claude-journal/releases">リリース</a>
  </p>
</p>

<p align="center">
  <img src="figures/mainpage.png" alt="Claude Journal — ホーム" width="800">
</p>

## クイックスタート

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

[http://localhost:5249](http://localhost:5249) を開いてください。`~/.claude/projects` と `~/.codex/sessions` を自動的に検出します。

再起動後も同じコマンドを実行するだけで使えます — 再インストールは不要です。

---

## これは単なるビューアではありません

多くの会話履歴ツールは読み取り専用です。Claude Journal は違います：

### ブラウザから直接対話

<p align="center">
  <img src="figures/Talk.png" alt="ブラウザから Claude Code とチャット" width="700">
</p>

フローティング入力ボックスにメッセージを入力すると、Claude Code（または Codex）が**まったく同じ会話を再開**します — 同じセッション、同じコンテキスト。ライブファイルウォッチャーを通じてリアルタイムでレスポンスがストリーミングされます。ターミナルは不要です。

### 実際の履歴を編集

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="注釈と編集が可能なセッションビュー" width="800">
</p>

すべての変更はディスク上の実際のファイルに書き戻されます：

| 操作 | 動作内容 |
|--------|-------------|
| **セッション名の変更** | JSONL に `custom-title` を書き込みます。`claude --resume "new-name"` ですぐに反映されます。 |
| **メッセージの編集** | JSONL ファイル内のメッセージ内容を更新します。プロンプトの変更、誤字の修正、会話の整理が可能です。 |
| **メッセージの削除** | JSONL から該当行を削除します。そのメッセージは履歴から完全に消去されます。 |
| **セッションの複製** | 新しい JSONL ファイルを作成します — 実験用の完全なコピーです。 |
| **セッションの移動** | JSONL をプロジェクトディレクトリ間で移動します（衝突検出付き）。 |

すべての書き込みはアトミック（一時ファイル + リネーム）です — Claude Code が同じファイルに書き込み中でも安全です。

---

## 機能

### 注釈

メッセージやセッションにスター、ハイライト（5色）、コメント、タグ、ピン留めが可能です。Google ドキュメント風のサイドコメントと自動保存機能。サイドバーですべてのセッションの注釈を一覧表示（スター付き / ハイライト / ノート / タグ）。注釈は別ファイルに保存されるため、JSONL ファイルはクリーンなままです。

### 分析ダッシュボード

<p align="center">
  <img src="figures/Analytics.png" alt="分析ダッシュボード" width="600">
</p>

日別コスト・トークンチャート、アクティビティヒートマップ、ツール使用状況の内訳、モデル分布、コスト上位セッション。日付範囲やプロジェクト別にフィルタリング可能。Claude Code と Codex の両方に対応。

### スマート表示

- **Edit 呼び出しの差分表示** — 生のテキストの代わりに赤/緑の統合差分を表示
- **ツール呼び出しのグループ化** — 3件以上連続するツールをサマリーに折りたたみ
- **セッションタイムライン** — 最初のプロンプト、操作したファイル、ツール使用状況を示す概要カード
- **コードコピーボタン** — すべてのコードブロックをワンクリックでコピー
- **サブエージェント展開** — ネストされた Agent の会話をインラインで表示
- **メッセージタイプフィルター** — Human、Assistant、Tool Calls、Thinking、および特定のツールタイプの切り替え
- **折りたたみ可能なメッセージ** — ヘッダーをクリックして長いメッセージを折りたたみ

### マルチプロバイダー対応

Claude Code と OpenAI Codex を統一されたインターフェースで利用可能。サイドバーで折りたたみ可能なプロバイダーセクション。プロジェクトフォルダを右クリックでピン留めまたは非表示。設定でプロバイダー別にフィルタリング。

### セッション管理

セッションを右クリック：ピン留め、名前変更、複製、移動、削除、複数選択（一括削除）。プロジェクトフォルダを右クリック：トップにピン留め、非表示。

### キーボードショートカット

`?` を押すと全一覧を表示。主なショートカット：`/` 検索、`j/k` ナビゲーション、`Ctrl+E` エクスポート、`Ctrl+B` サイドバー、`g+a` 分析。

### エクスポート

Markdown または自己完結型 HTML（インライン CSS 付き、誰とでも共有可能）。

### すべてトグル可能

すべての機能は設定で無効化できます。シンプルさを好むユーザーは、アバター、タイムライン、差分表示、ツールグループ化、コードコピーボタン、タグなどをオフにできます。

---

## インストール

### グローバルインストール（推奨）

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

### その他のオプション

```bash
npx claude-journal                          # インストールせずに直接実行
claude-journal --daemon                     # バックグラウンドモード（デフォルトポート 8086）
claude-journal --status                     # 確認: Running (PID 12345) at http://localhost:5249
claude-journal --stop                       # デーモンを停止
```

ログイン時の自動起動設定：
```bash
pm2 start claude-journal -- --daemon --no-open --port 5249
pm2 save && pm2 startup
```

### デスクトップアプリ

GitHub Releases から [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases) をダウンロード。

> **macOS ユーザーへ：** アプリはコード署名されていません。macOS では _「壊れています」_ と表示されます。修正方法：
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```

<details>
<summary>Docker / ソースから</summary>

```bash
# ソースから
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start

# Docker
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 5249:5249 -e PORT=5249 claude-journal
```
</details>

### リモートアクセス

```bash
# SSH トンネル（推奨）：
ssh -L 5249:localhost:5249 user@server

# または直接アクセス用に認証付き：
claude-journal --daemon --auth user:pass --port 5249
```

VS Code Remote SSH はポートを自動転送します — ターミナルで `claude-journal` を実行するだけです。

---

## アーキテクチャ

```
claude-journal/
  server.js                Express + WebSocket サーバー（チャット、注釈、分析）
  bin/cli.js               デーモンモード対応 CLI、Node 18+ チェック
  providers/
    codex.js               Codex プロバイダー（~/.codex/ を読み取り、SQLite + JSONL）
  public/
    modules/               Vanilla JS ES モジュール（ビルドステップ不要）
      main.js              アプリ初期化、ルーティング、チャット、キーボードショートカット
      messages.js           レンダリング、差分表示、タイムライン、ツールグループ化、タグ
      sidebar.js           セッション一覧、プロジェクト管理、一括操作
      analytics.js         チャート、ヒートマップ、プロジェクトダッシュボード
      search.js            フィルター付きグローバル検索
      state.js             共有状態、ユーティリティ、差分アルゴリズム
  tray/                    Electron システムトレイアプリ（オプション）
  tests/                   Playwright E2E テスト
```

**ビルドステップ不要。** 純粋な Vanilla JS と ES モジュール。React なし、バンドラーなし、トランスパイラーなし。

---

## 仕組み

1. **サーバー**が `~/.claude/projects/` と `~/.codex/sessions/` をスキャンして会話を検出
2. **Codex プロバイダー**が Codex イベント（`function_call`、`reasoning` など）を Claude 形式に正規化
3. **WebSocket** がアクティブなセッションファイルのライブ更新を監視し、チャットメッセージを `claude`/`codex` CLI にパイプ
4. **注釈**は `annotations/` に別途保存 — 明示的に編集/削除しない限り会話ファイルは変更されません
5. **チャット**は `claude --resume <id> --print` または `codex exec resume <id> --json` をサブプロセスとして起動
6. **すべての編集**はアトミック書き込みを使用し、同時アクセスによる破損を防止

---

## 既知の制限事項と協力のお願い

Claude Journal は便利に成長したサイドプロジェクトです。粗い部分もあります：

| 制限事項 | 詳細 |
|-----------|---------|
| **Codex メッセージの編集未対応** | Codex の JSONL 形式（`event_msg`/`response_item` ラッパー）は Claude のものとは異なります。個別の Codex メッセージの編集/削除はまだ実装されていません。 |
| **コスト見積もりは概算** | API 相当のコスト（入力 + 出力トークン）を表示します。キャッシュトークンは除外されます。実際の請求額はサブスクリプションプランに依存します。 |
| **モバイルレイアウト未対応** | UI はデスクトップ専用です。サイドバーは小さな画面に適応しません。 |
| **未署名のデスクトップアプリ** | macOS では `xattr -cr` が必要です。適切なコード署名には Apple Developer 証明書（年間 $99）が必要です。 |
| **シングルユーザー専用** | ユーザーアカウントやマルチテナント対応はありません。個人マシンでの使用を想定しています。 |
| **編集中のライブ更新が不安定** | WebSocket ファイルウォッチャーが、メッセージ操作中に DOM を再構築してしまうことがあります。 |

**コントリビューション歓迎！** これらの改善にご協力いただける方は、[github.com/Arvid-pku/claude-journal](https://github.com/Arvid-pku/claude-journal) で Issue または PR を作成してください。

あると嬉しい機能のアイデア：
- モバイル対応レイアウト
- Codex メッセージ編集サポート
- .dmg の Apple コード署名
- 他のプロバイダー対応（Cursor、Windsurf、Aider など）
- セッション比較（2つの会話のサイドバイサイド差分）
- 会話の要約（セッションサマリーの自動生成）

---

## 動作要件

- **Node.js** 18 以上
- **Claude Code**（`~/.claude/projects/`）および/または **OpenAI Codex**（`~/.codex/sessions/`）

## ライセンス

MIT

---

<p align="center">
  開発者：<a href="https://github.com/Arvid-pku">Xunjian Yin</a>
</p>
