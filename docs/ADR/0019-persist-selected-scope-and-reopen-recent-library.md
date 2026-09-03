# ADR 0019: 明示選択したscopeを復元して最近のライブラリを開き直す

## Status

Accepted（ADR 0006 の再起動時権限と再接続方針を改訂）

## Context（背景）

ADR 0006 は、保存した path を現在の権限と混同しないため、Tauri 終了時に動的 scope を捨て、再起動ごとに native dialog で同じ音楽フォルダを選び直す方針を採った。この境界は狭いが、個人用プレイヤーとして繰り返し使うたびに同じ操作を要求する。実利用では、一度明示的に選んだ最近の音楽フォルダを、次回からすぐ開ける利便性を優先する。

Tauri の Dialog plugin は、選択した path をその実行中の file-system と asset protocol scope に追加するが、通常は再起動時に消える。公式の Persisted Scope plugin は、その動的 scope を保存し、アプリ再開時に復元する。asset URL による音源再生には file-system scope だけでなく、`protocol-asset` feature による asset scope の復元も必要である。

一方、React の Web 開発サーバーには Tauri runtime がない。同じフォルダ選択ボタンを表示して例外にする実装は、利用できない操作を利用できるように見せ、デスクトップ版の状態と混同させる。

## Decision（決定とその理由）

- `tauri-plugin-persisted-scope` を `protocol-asset` feature 付きで導入する。Tauri Builder では、公式要件どおり `tauri_plugin_fs` の後、dialog や frontend が動き始める前に登録する。
- 永続化の対象は、利用者が native dialog で明示的に選んだため動的 scope に追加された path とする。`$HOME/**/*`、`$AUDIO/**/*`、`**/*` のような静的な広域 scope は追加しない。
- 起動時に SQLite から最後に公開した Library を読む。保存済み Library があれば、復元済み scope の下でその root を dialog なしに完全走査し、metadata を確認して、新しい完成 snapshot を公開する。成功した snapshot だけを `granted` として画面へ渡す。
- scope が復元されていない、root が存在しない、走査・metadata・SQLite 公開に失敗した場合は、例外で hydration 全体を失敗させない。直前の保存済み Library を `permission-required`、Track を `unknown` とした remembered snapshot へ戻し、再接続操作を残す。
- 起動時の自動再オープンは single-flight とし、React StrictMode や複数 consumer が同時に `loadLibrary` を呼んでも、一回の走査と公開を共有する。失敗後は in-flight state を解除し、次の呼出しや手動再接続を妨げない。
- browser / desktop の runtime capability を gateway の明示的な値として画面へ渡す。ブラウザ版は folder 操作を無効にし、「デスクトップアプリで開く」ことと起動コマンドを示す。browser の例外を通常のfolder失敗として表示しない。
- ADR 0006 のうち、保存したpathをscopeなしで利用しない、失敗時に保存済み一覧を保持する、静的な広域scopeを開かない判断は維持する。「再起動時はfile systemへ触れず毎回再接続する」と「persisted-scopeを採用しない」の判断だけを本ADRで置き換える。

## Rejected Options（却下した選択肢）

- 再起動ごとに明示再接続を続ける: 権限境界は最も狭いが、日常の個人利用で同じfolderを選び続ける負担が大きく、今回の利用目的を満たさない。
- SQLite に保存した絶対pathを独自Rust commandで毎回scopeへ追加する: plugin導入前の選択も自動承認できるが、保存値を選択履歴と同一視する独自の権限復元になる。Dialogが実際に追加したscopeを復元する公式pluginを優先する。
- Home、Music、Downloads全体を静的scopeへ追加する: 初回選択すら不要になるが、LoupePlayで選んでいない個人ファイルまでWebViewから到達可能にする。
- 保存済みTrackを走査せず即座に`present`へ戻す: 最速だが、folderやfileの移動・削除とscope復元失敗を検出せず、再生できない曲を利用可能に見せる。
- 自動再オープン失敗を通常のhydration errorにする: 原因を示せても、既に保存した一覧まで消えたように見え、手動再接続の手がかりを失う。
- ブラウザ版のボタンを残し、押した後だけ説明する: 必ず失敗する操作を有効に見せるため、実アプリのfolder選択失敗と誤認される。

## Consequences（結果）

- 一度選んだ音楽フォルダは、次回起動時にdialogなしで走査・再生できる。初回の明示選択は維持する。
- 利用者が選んだ動的scopeはアプリ終了後も残る。個人利用の操作削減を優先してこの権限継続を受け入れるが、複数folderのscope確認・解除UIがまだないため、選択履歴が増えるほど到達範囲も増えうる。
- plugin導入前の動的scopeは復元できず、既存利用者は一度だけ再接続が必要になる。DBのpathを暗黙に承認しない結果として受け入れる。
- 起動ごとに完全走査、metadata抽出、snapshot公開を行うため、folderが大きいほど初期表示が遅くなり、snapshot rowも増える。増分判定、progress、古いsnapshotのcompactionは別の判断が必要になる。
- 外付けドライブや権限変更で再オープンできなくても、保存済み一覧と関連するMarker、Note、Play Eventは残る。再接続後は恒久Track identityへ再び結び付く。
- Web開発サーバーはReactの表示確認に使えるが、SQLite、folder選択、scope復元、ローカル音源再生の検証環境ではないことが画面上でも明確になる。

## References

- [Tauri: Persisted Scope](https://v2.tauri.app/plugin/persisted-scope/)
- [Tauri: Asset protocol scope](https://v2.tauri.app/security/asset-protocol/)
- [Tauri: File System plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri: Dialog JavaScript API](https://v2.tauri.app/reference/javascript/dialog/)
- [ADR 0006](0006-persistent-library-and-scoped-metadata.md)
