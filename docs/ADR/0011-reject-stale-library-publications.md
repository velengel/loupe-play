# ADR 0011: 古いライブラリ世代からの公開を拒否する

## Status

Accepted

## Context（背景）

ADR 0009 は publication の完了順を database sequence で決め、異なる snapshot の公開順が準備順と逆転しても最後の成功を選べるようにした。しかし同じ root を二つの instance が並行走査すると、どちらも走査開始前の同じ完成 snapshot を base にする。

例えば A と B が S0 を読み、B が新しい Track Y を含む S1 を先に公開したあと、A が S0 を基にした snapshot を公開すると、publication 順としては A が最新になる。A は Y の存在を知らないため、Y の identity と古い observation は DB に残っても、通常読込から消える。これは「未検出 Track を黙って削除せず、missing または unknown として保持する」という Story 0003 の境界を、並行操作時に破る。

commit 直前に最新 snapshot を読み直して merge しても、その読込と publication INSERT の間に別操作が入れる。JavaScript SQL API から一つの connection transaction を所有しない条件では、競合検査と公開を一つの database constraint にまとめる必要がある。

## Decision（決定とその理由）

- `library_publications` は `music_folder_id` と `folder_generation` を持つ。初回公開を generation 1 とし、以後は走査開始時に読んだ同 root の generation に 1 を足して公開を試みる。
- `(music_folder_id, folder_generation)` を UNIQUE にする。同じ base generation を読んだ並行操作は同じ次 generation を挿入するため、最初の publication だけが成功し、後発の古い snapshot は一意制約で拒否される。
- publication は `(library_snapshot_id, music_folder_id)` から snapshot の同じ folder を複合外部キーで参照する。別 root の generation を誤って使う publication を DB が拒否する。
- repository の読込結果は internal な `folderGeneration` を含める。新しい root は 0、公開済み root は最後の publication row の値を使う。画面へは storage generation を表示しない。
- repository の保存入力は `expectedFolderGeneration` を必須とする。最後の publication INSERT は `expectedFolderGeneration + 1` を bind し、UNIQUE violation を操作失敗として呼出元へ返す。失敗した snapshot と identity row は未公開のため通常読込へ現れない。
- 異なる root はそれぞれ generation を進められる。全 root を横断した「最後に成功した選択」は、ADR 0009 の global publication sequence で決める。
- 実 SQLite test と stateful repository test で、同じ base から二つの snapshot を作った場合、先に公開した一つだけが成功し、もう一つが最新ライブラリを上書きしないことを固定する。

## Rejected Options（却下した選択肢）

- stale snapshot も完了順どおり公開する: publication 順は正しくても、最新 snapshot で既知 Track が黙って消える。
- commit 直前に最新 Tracks を再読込して merge するだけ: read と INSERT が別 statement のため、その間の publication を取りこぼす競合が残る。
- app instance ごとの in-memory mutex: 同じ process には効くが、複数 instance や将来の別 window を直列化できない。
- lock row を `SELECT` 後に `UPDATE` する: connection を跨ぐ複数 statement では lock ownership と transaction 境界を保証できない。
- `music_folders.current_snapshot_id` を条件付き UPDATE する: stale 検出はできるが、全 root の完了順を別途採番する必要がある。publication INSERT の unique generation なら stale 検出と global sequence を同じ最終 statement に置ける。
- stale operation を最新 snapshot と自動 merge して再試行する: path、metadata、partial scan のどちらを優先するかが利用者の見ていないところで変わる。初期 MVP は安全に失敗し、再走査を明示的にやり直す。

## Consequences（結果）

- 同じ root の並行操作が、互いに知らない Track を完成 snapshot から黙って消すことを防げる。
- 競合に負けた操作は画面で一般的な走査失敗として扱われ、直前 snapshot を保持する。他 instance の最新状態を自動取込はしないため、利用者は再走査または再起動が必要になる。
- stale operation が用意した unpublished snapshot、observation、未参照 identity は残りうる。表示の正しさを cleanup 成功へ依存させず、保持整理は後続 Story とする。
- folder generation は storage concurrency token であり、Track identity や利用者向け revision number ではない。UI・メモ・履歴のドメイン語として露出させない。
- generation は一つずつ増えるため、極端に長期間の利用では integer 上限を考える必要がある。SQLite signed 64-bit の範囲と走査頻度から初期 MVP では実用上の制約にならない。
