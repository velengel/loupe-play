# Story 0001: Tauri + React 基盤の検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

React のベース画面、Tauri shell、事前ロードした SQLite、利用者が選んだフォルダの WAV / MP3 / FLAC 検出、native audio controls への URL 配線は実装済みである。自動検査、macOS 向け release build、desktop window の実起動、SQLite の実書き込み・読戻しは `PASS` とした。

実装済みであることと、各 OS で実際に操作できたことは分ける。native folder dialog を使った実音源の再生、320px / 1440px の実描画、Windows build、WebView2 codec、installer は証拠がないため `UNVERIFIED` のままにする。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0001、ADR 0001〜0004、ユビキタス言語を実装前または判断前に記録した。 |
| テストファースト履歴 | PASS | `871b84a`、`f8ffc32`、`8df786e`、`9e0ae57`、`7903fdb` が、各実装より前の失敗テストを保持する。 |
| Frontend 自動検査 | PASS | `npm test`: 7 files / 40 tests、`npm run lint`、`npm run build` が成功した。 |
| Responsive 静的契約 | PASS | 320px の下限、1440px の上限、長い path / name の省略、内向き focus ring、phone 幅の縦積みを自動テストで固定した。 |
| Rust / Tauri build | PASS | `cargo fmt --check`、Rust test 1件、`cargo check`、`tauri build --no-bundle` が成功した。 |
| macOS desktop 起動 | PASS | `target/debug/loupe-play` が起動し、on-screen window 1枚を確認した。CoreGraphics 上の観測 bounds は 1062 × 685 だった。 |
| SQLite 実往復 | PASS | AppConfig の DB に `_sqlx_migrations` と `foundation_health` があり、health row は `id=1`、probe 長 47 だった。probe の実値は表示・記録していない。 |
| npm dependency audit | PASS | `npm audit --audit-level=high` は 0 vulnerabilities だった。 |
| 機密情報 | PASS | 各 commit 前の staged scan と最終 HEAD scanで、代表的な token、key、private key、credential assignment の一致はなかった。実値入り `.env`、`.npmrc`、key container は ignore 済みである。 |
| 独立レビュー | PASS | SQL / capability / lifecycle と UI / responsive の2系統で再レビューし、MUST 残件なしまで収束した。 |
| 320px / 1440px 実描画 | UNVERIFIED | in-app browser の起動依存で内部エラーになり、画面 capture を得られなかった。source と静的契約だけを PASS とする。 |
| native dialog / 実音源再生 | UNVERIFIED | 有効な WAV / MP3 / FLAC fixture は repo 外で用意したが、native dialog の自動操作と音の確認はできなかった。 |
| Windows / WebView2 / installer | UNVERIFIED | macOS 環境のため、MSVC link、Windows 起動、codec、seek、installer を確認していない。 |

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
npm audit --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --no-bundle
npm run tauri dev
git diff --check
```

Tauri の release executable は `src-tauri/target/release/loupe-play` に生成された。これは生成物であり、Git では追跡しない。

## テストファーストの区切り

- `871b84a`: React component が存在しない状態で、最初の画面契約を赤にした。
- `f8ffc32`: folder scan、SQLite round trip、Tauri migration、audio URL 配線を赤にした。
- `8df786e`: SQL lifecycle と、folder / audio の状態・focus を赤にした。
- `9e0ae57`: gateway の single-flight と production CSP を赤にした。
- `7903fdb`: busy live region、同一曲の再読込、主操作の順序を赤にした。
- `40e6b7b`: 上記を満たす desktop foundation を実装し、緑へ戻した。

## 一次情報と採用理由

- [React: Build a React app from scratch](https://react.dev/learn/build-a-react-app-from-scratch) と [Vite: Getting Started](https://vite.dev/guide/) は、framework を追加しない React + TypeScript 基盤と現行 toolchain を選ぶ根拠にした。
- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) は migration、preload、`Database.get` の正しい lifecycle、[Dialog plugin](https://v2.tauri.app/plugin/dialog/) と [Asset Protocol](https://v2.tauri.app/security/asset-protocol/) は利用者が選んだ path だけを動的 scope へ入れる根拠にした。
- [Tauri CSP](https://v2.tauri.app/security/csp/) は production と development の policy を分け、production から inline style / eval を外す根拠にした。
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) は README の Windows 準備と、macOS で証明できない範囲を分ける根拠にした。
- [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md)、[Config basics](https://learn.chatgpt.com/docs/config-file/config-basic.md)、[Rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md) は、repo の作業規約と user-level command permission を混ぜない Codex 初期設定の根拠にした。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、短い文と長い文を交互に置き、同じ接続を連続させないための参照にした。

## Surprise & Discovery

- SQL plugin の `Database.close()` は、引数を省くとその instance だけでなく全 pool を閉じる。frontend には close 権限を出さず、plugin の app-exit 処理へ任せた。
- `plugins.sql.preload` を設定すると、Tauri の生成 macro が plugin 設定を埋め込むため、app crate に `serde_json` の直接依存が必要になった。Rust test が先に不足を検出した。
- Dialog plugin の動的 scope は、一つのセッションで別フォルダを選ぶたびに累積する。画面は最後の選択だけを扱うが、以前の scope は app 終了まで残る。このリスクは ADR 0003 へ明記した。
- React StrictMode は development で Effect を追加実行する。SQLite check を single-flight にし、成功・失敗後は再試行できるようにした。
- `com.loupe-play.app` は `.app` 終端と紛らわしいため、bundle identifier を `com.loupe-play.desktop` へ変えた。
- source 上で responsive に見えても、長い曲一覧では player までの Tab 数が増える。player を一覧より前に置き、選択後に focus する構造へ変えた。
- `git grep` の option と revision の順序を崩すと、検査自体が失敗しても「一致なし」に見えやすい。staged scan の正しい形を `AGENTS.md` へ固定し、差分の目視を残した。

## 次に実機で見る一点

Windows で `npm run tauri dev` を起動し、同じフォルダに置いた WAV、MP3、FLAC について、検出、再生、一時停止、seek、error 表示を順に確認する。ここが得られるまで、codec と Windows operation を `PASS` へ上げない。
