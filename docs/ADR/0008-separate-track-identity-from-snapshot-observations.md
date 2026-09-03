# ADR 0008: Track identity と走査時点の観測を分ける

## Status

Accepted

## Context（背景）

ADR 0007 は、再走査中の部分書込みを公開しないため、Track row を `library_snapshots` ごとに追記すると決めた。ところが、snapshot row の主キーは `(library_snapshot_id, id)` であり、同じ論理 Track が走査のたびに複数の物理 row を持つ。

プロダクト仕様では、Track に Track Note と Marker を結び付け、Track から生じる Play Event に Listening Note を結び付ける。これらが snapshot row を直接参照すると、再走査のたびに参照先を移す必要がある。逆に `tracks.id` だけを参照しても、現在の schema ではその値が単独で一意ではないため、SQLite の外部キーで整合性を保証できない。

音源の場所や metadata は再走査で変わりうる観測値だが、利用者が同じ曲へ残した Marker、Note、履歴の所属先は変わってはならない。後続 Story が依存する前に、恒久 identity と snapshot observation の境界を固定する。

## Decision（決定とその理由）

- `track_identities` を恒久 Track の親 table とする。`id` は globally unique な UUID、`music_folder_id` は所属 root、`source` と `source_identifier` は音源を root 内で再発見するための identity として保存する。
- `(music_folder_id, source, source_identifier)` を一意にする。同じ root の同じ local relative path を再走査した場合は、新しい UUID を採用せず既存 identity を再利用する。
- snapshot ごとの `tracks` は、その走査で観測した path、表示用 metadata、format、更新時刻を持つ observation とする。`id` は `track_identities.id` を引き継ぎ、folder、source、source identifier を含む複合外部キーで identity と一致することを SQLite に検証させる。
- repository は folder を確定したあと、各 Track identity を `INSERT ... ON CONFLICT DO NOTHING` で用意し、natural identity で確定済み UUID を読み直してから snapshot observation を挿入する。保存結果は確定した folder id と Track id の対応を呼出元へ返し、同時操作で提案 UUID が負けても画面と DB の identity を一致させる。
- 後続の Track Note、Marker、Play Event は snapshot observation ではなく `track_identities(id)` を参照する。snapshot はライブラリ表示を安全に公開する単位であり、利用者が蓄積する情報の所有者にはしない。

この決定は ADR 0007 の「Track の UUID は論理 identity として snapshot 間で引き継ぐ」を、SQLite が直接保証できる形へ具体化する。完成 snapshot だけを最後の一文で公開する方針と、音源バイナリを保存しない方針は変えない。

## Rejected Options（却下した選択肢）

- Track Note、Marker、Play Event に `(library_snapshot_id, track_id)` を持たせる: 再走査で新しい snapshot が公開されるたびに利用者データの参照を移す必要があり、途中失敗時の所有関係も複雑になる。
- 子 table に `track_id` だけを保存し、外部キーを設けない: application の不具合や将来の migration で存在しない Track を参照しても DB が拒否できない。
- `tracks.id` を table 全体で一意にする: 同じ Track の複数 snapshot observation を同時に保持できず、ADR 0007 の追記型公開境界を壊す。
- path 全体を Track identity にする: root の保存 path と重複し、folder の再接続先が変わった場合に同じ Track を再発見しにくい。初期 local source では root identity と relative な source identifier を組み合わせる。
- file content hash を identity にする: rename 追従には役立つが、大きな音源を全走査で読み切る I/O と、tag 編集で hash が変わる扱いを初期 MVP に持ち込む。rename 検出は別の観測と意思決定を必要とする。

## Consequences（結果）

- 同じ root と source identity の Track は再走査を越えて一つの UUID を持ち、Marker、Note、履歴が安定した外部キーを使える。
- identity を用意してから snapshot を公開するため、失敗した走査が未参照の `track_identities` row を残す場合がある。通常読込には公開 snapshot だけを使うので画面には現れないが、将来の cleanup は子 table と公開 snapshot の参照を確認する必要がある。
- Track 一件ごとに identity の insert と select が増える。Story 0003 は正しさを優先し、大規模ライブラリでの batch 化や index 調整は実測後に扱う。
- local file の rename は新しい source identifier として別 Track になる。Marker や Note の自動移行は行わず、content fingerprint 等を導入する場合は誤結合リスクを含む新しい ADR を必要とする。
- `tracks` という table 名は snapshot observation を表す既存名として残る。コードと文書では、恒久の `Track identity` と `Track observation` を区別する。
