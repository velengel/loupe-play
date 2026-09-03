# ADR 0003: Tauri、SQLite、ローカル音源の境界を選ぶ

## Status

Accepted

## Context（背景）

LoupePlay は Windows を優先するローカル音楽プレイヤーであり、ブラウザのタブだけでは、デスクトップアプリとしての起動、ローカル音楽フォルダ、アプリ固有の永続データを一つの配布単位にできない。初期仕様は Tauri + React + SQLite を第一候補としているが、採用にはファイル権限、音声再生、データベースの境界を狭く保てる根拠が必要だった。

最も危険なのは、再生を簡単にするためにホームディレクトリ全体を読めるようにすることだろう。ところが Tauri の Dialog プラグインは、利用者が選んだパスを File System と asset protocol のスコープへ動的に追加できる。広い静的許可は要らない。

## Decision（決定とその理由）

- デスクトップシェルに Tauri v2 を採用し、既存の React + Vite ルートへ `src-tauri/` を加える。別の `loupe-play` ディレクトリは作らない。
- bundle identifier は `com.loupe-play.desktop` とする。プロジェクト slug を保ちつつ、macOS の bundle 拡張子と紛らわしい `.app` 終端を避ける。
- 永続化には公式 SQL プラグインの SQLite backend を使う。Rust 側で migration を登録し、DB は `sqlite:loupe-play.db` として OS の AppConfig 領域へ置く。設定の `plugins.sql.preload` もこの一つに固定し、frontend は `Database.get` で事前ロード済み接続だけを参照する。
- 最初の DB 確認は `SELECT 1` ではなく、一行の probe を UPSERT し、同じ statement の `RETURNING` で値を読み戻す。ディスクへの書き込みと読み出しを確かめつつ、並列確認が互いの probe を上書きして誤判定する時間差を作らないためである。
- フォルダ選択には公式 Dialog プラグイン、再帰走査には公式 File System プラグインを使う。権限は `dialog:allow-open` と `fs:allow-read-dir` に絞る。
- 選択時は `recursive: true` とし、そのセッションで利用者が選んだフォルダと配下だけを動的スコープへ加える。静的な asset scope は空にし、ホーム、Music、全ファイルを許可しない。
- WAV、MP3、FLAC の候補は拡張子を大文字小文字を区別せず検出する。symlink は追わず、読めないサブディレクトリがあっても他の走査を続ける。
- 音声要素の URL は `convertFileSrc` で作る。ファイル全体を JavaScript のメモリへ読み込む Blob 方式を避け、長い音源の seek と range access を WebView に任せる。
- capability は `core:path:allow-join`、`dialog:allow-open`、`fs:allow-read-dir`、`sql:allow-select` だけから始める。`core:default` と、任意 DB の load・close を含む `sql:default` は使わない。SQL plugin の `select` command は `RETURNING` を含む statement の結果も取得できるため、基盤確認だけの段階では `sql:allow-execute` も加えない。
- DB、Dialog、FS、asset URL は TypeScript の gateway の後ろへ置く。自動テストは gateway を差し替えて振る舞いを検証し、実プラグインと codec はデスクトップの手動 smoke test で確かめる。
- React StrictMode が開発時に Effect を再実行しても、進行中の DB 確認は一つの Promise を共有する。完了後や失敗後の再実行は許し、永久に失敗を cache しない。
- frontend から DB pool を close しない。SQL plugin がアプリ終了時に事前ロード済み pool を閉じるためであり、引数なしの `Database.close()` が全 pool を閉じる境界も公開しない。
- production CSP は外部接続と音源用 asset protocol だけを追加し、inline style と eval を許可しない。Vite が style を注入する開発時だけ、別の `devCsp` で inline style と eval を受け入れる。
- フォルダの許可は再起動後に持ち越さず、基盤段階では毎回選び直す。永続 handle と再許可は、ライブラリ再開の Story で別に判断する。

参考:

- [Tauri: Create a Project](https://v2.tauri.app/start/create-project/)
- [Tauri: SQL plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri: Dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri: File System readDir](https://v2.tauri.app/reference/javascript/fs/#readdir)
- [Tauri: Asset Protocol](https://v2.tauri.app/security/asset-protocol/)
- [Tauri: convertFileSrc](https://v2.tauri.app/reference/javascript/api/namespacecore/#convertfilesrc)
- [Tauri: Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows)
- [React: StrictMode](https://react.dev/reference/react/StrictMode)

## Rejected Options（却下した選択肢）

- ブラウザだけで基盤を終える: React UI は確認できるが、Windows デスクトップ、OS のフォルダ選択、AppConfig の SQLite を検証できない。
- Electron: Chromium を同梱することで codec 差を減らせる可能性はあるが、最初の基盤として配布サイズとランタイムの負担が大きい。Tauri の成立性を先に小さく測る。
- `$HOME/**/*`、`$AUDIO/**/*`、`**/*` の静的許可: 実装は単純になるが、利用者が選んでいないファイルまで読み取り可能になる。
- 音源全体を `readFile` で読み、Blob URL にする: 小さな fixture では動いても、長い音源を JavaScript メモリへ複製し、seek とメモリ使用量の評価を歪める。
- Rust で独自の SQLite command 群を先に作る: SQL プラグインが migration と parameter binding を提供しており、基盤確認には境界が重い。
- frontend から `Database.load` と `Database.close` を呼ぶ: 任意の接続文字列を渡せる権限と全 pool を閉じる権限が必要になり、事前ロードで固定できる DB 境界を広げる。
- 選択フォルダの権限を最初から永続化する: 再起動時の再許可、移動・削除、Windows パスの扱いを先回りし、Story 0001 の成立性確認を広げすぎる。

## Consequences（結果）

- ローカル音源は利用者の明示操作で初めて読める。アプリ起動時に音楽フォルダを勝手に走査しない。
- 同じセッションで別のフォルダを選ぶと、Dialog plugin が追加した動的 scope は終了まで累積する。画面は最後に選んだフォルダだけを扱うが、以前の選択を scope から外す仕組みは基盤段階では持たない。この権限窓は再起動で閉じ、解除 API の導入はライブラリ再開の Story で再判断する。
- 再起動後はフォルダを選び直す必要がある。初期の使い勝手は下がるが、永続権限の設計を証拠なしに固定せずに済む。
- asset protocol を有効にするため、Content Security Policy（CSP）の `media-src` に `asset:` と `http://asset.localhost` を許可する。静的 scope を空にし、動的 scope と組み合わせて境界を保つ。
- SQLite の schema 変更は migration 番号で前進させる責任が生じる。初期テーブルも後から直接書き換えない。
- 事前ロード時の migration が失敗すると、React を表示する前に Tauri の setup が失敗する。画面内の「SQLite 確認失敗」では回復できないため、migration の実適用を build 後の desktop smoke で確認し、将来は専用の回復導線を別 Story で設計する。
- frontend が侵害された場合、許可された SQL command から LoupePlay の DB 内容を変更されるリスクは残る。一方、事前ロードしていない別の SQLite 接続を frontend から作る経路は閉じる。
- jsdom のテストは URL の配線までしか証明しない。WAV、MP3、FLAC の decode、音、seek、A-B loop の精度は WKWebView と Windows WebView2 で別々に実測する必要がある。
- macOS では Tauri の build と起動を確認できるが、Windows の MSVC link、WebView2、ファイルダイアログ、codec、installer は確認できない。Windows 実機の証拠が得られるまで `UNVERIFIED` と記録する。
