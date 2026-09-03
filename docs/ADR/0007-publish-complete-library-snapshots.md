# ADR 0007: 完成したライブラリスナップショットだけを公開する

## Status

Accepted; publication ordering refined by ADR 0009

## Context（背景）

ADR 0006 は、folder と全 Track の保存を終えたあとに `selected_at` を更新し、その時刻を保存完了の印にすると決めた。この順序は、新しい folder の初回保存では途中結果を隠せる。ところが、すでに選択済みの folder を再走査すると、古い `selected_at` を残したまま同じ Track row を一件ずつ更新する。途中で一件が失敗した場合、次回起動は古い選択時刻と新旧が混ざった Track 群を読み、失敗した操作を部分的に公開してしまう。

現在の `@tauri-apps/plugin-sql` 2.4.1 の JavaScript API は、pool に対する `execute` と `select` を公開する。複数の `execute` が同じ connection の transaction に束縛される API はない。そのため、JavaScript から `BEGIN`、複数の書き込み、`COMMIT` を個別に送っても、ひとまとまりの transaction になるとは保証できない。

ライブラリは音源を再生する入口であり、「保存できた」と表示する状態と、再起動後に復元される状態が一致する必要がある。失敗時に前回の完成状態へ戻れる境界を、単一 connection の暗黙の仮定なしで作る。

## Decision（決定とその理由）

- `music_folders` は root の identity と表示名だけを持つ。走査ごとの完成状態は、UUID を持つ `library_snapshots` と、その snapshot に属する Track row として追記する。
- 完成状態の公開マーカーと順序は [ADR 0009](0009-order-library-publication-at-commit-time.md) で具体化する。新しい snapshot と全 Track observation を用意したあと、最後の一文で publication row を挿入する。読込は publication のある snapshot だけを対象にする。
- publication は DB 内で完了時に単調増加する `sequence` を持つ。読込は `sequence DESC` で最後の完成状態を選ぶ。`selected_at` は利用者向けの記録であり、時計の巻き戻りや同一時刻に左右される選択順には使わない。
- Track の UUID は論理 identity として snapshot 間で引き継ぐ。物理 row の主キーは `(library_snapshot_id, id)`、同一 snapshot 内の source identity は `(library_snapshot_id, source, source_identifier)` で一意にする。これにより、再走査中に前回 snapshot の row を上書きしない。
- folder、未公開 snapshot、Track の途中 row は、公開マーカーが立たない限り通常の読込に現れない。既存 root の再走査が途中失敗しても、前回の公開済み snapshot をそのまま復元する。
- Story 0003 では古い snapshot を自動削除しない。削除の安全性、保持数、容量表示は、実際の利用量を観測してから別の意思決定として扱う。

この決定は、ADR 0006 の「`music_folders.selected_at` を最後に更新し、同じ folder の Track row を UPSERT する」という保存方式を置き換える。音源バイナリを保存しないこと、root ごとの Track identity、明示的な再接続、不完全走査時に未確認 Track を保持する方針は変えない。

参考:

- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/)
- `node_modules/@tauri-apps/plugin-sql/dist-js/index.js`（導入済み 2.4.1 の `execute` / `select` 境界）
- Cargo registry の `tauri-plugin-sql-2.4.1/src/wrapper.rs`（各 `execute` が pool に問い合わせる実装）

## Rejected Options（却下した選択肢）

- 現行の row UPSERT 順序だけを維持する: 新規 root の途中失敗は隠せるが、既存 root では前回の公開済み row 自体を途中まで変更するため、問題を解けない。
- JavaScript から `BEGIN` と `COMMIT` を別々の `execute` で送る: 各呼び出しが同じ pool connection を使う保証がなく、transaction の所有者を固定できない。
- `selected_at` の wall clock だけで最新 snapshot を決める: 時計の補正や複数 instance の時刻差により、最後に成功した操作より古い snapshot を選びうる。
- SQL plugin と別に Rust 側で同じ SQLite ファイルを開き、専用 transaction command を作る: 原子的にはできるが、connection、migration、busy handling の責任が二重になる。Story 0003 の保存境界には追記型 snapshot で十分である。
- 途中失敗時に書いた Track を `DELETE` して元へ戻す: cleanup 自身も途中失敗しうる。失敗した操作を公開しない条件を、補償処理の成功に依存させない。
- ライブラリ全体を一つの JSON として一行へ保存する: 一文で置換できる一方、外部キー、format や duration の CHECK、将来の Track 単位検索を失う。

## Consequences（結果）

- 保存成功を返した画面と、再起動後に読む snapshot は一致する。途中失敗では前回の完成 snapshot が残る。
- 同じ Track が snapshot ごとに複数 row を持つため、DB 容量は再走査回数に応じて増える。Story 0003 ではデータ喪失を避ける方を優先し、保持・圧縮は後続の観測と ADR を必要とする。
- Track の論理 UUID と DB row の一意性を分けるため、query と migration は一段増える。repository test では、公開前の snapshot が読込対象にならないことと、既存 root の失敗後も前回 snapshot を読めることを検証する。
- 公開マーカーは一文で挿入されるが、storage failure や process termination により未公開 snapshot が残りうる。通常表示には出ないが、将来 cleanup を導入する場合は公開済み snapshot と参照関係を確認してから扱う。
