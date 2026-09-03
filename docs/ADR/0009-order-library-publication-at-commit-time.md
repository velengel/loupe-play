# ADR 0009: ライブラリの公開順を完了時に採番する

## Status

Accepted; same-root stale publication refined by ADR 0011

## Context（背景）

ADR 0007 は、不完全な走査を隠すために snapshot を未公開で用意し、全 Track observation の保存後に公開すると決めた。また wall clock に依存しない順序として、`library_snapshots.sequence` を snapshot 作成時に採番していた。

この順序は操作が直列なら正しい。しかし二つの app instance や、将来の重複操作で A、B の順に snapshot を用意し、B、A の順に保存を完了すると、A が最後に成功しても B の sequence が大きい。`ORDER BY snapshots.sequence DESC` は B を選び、保存成功として画面へ返した A と、再起動後の表示が一致しない。

公開順は走査を始めた時刻でも snapshot を用意した時刻でもなく、全 observation が揃って公開可能になった順序でなければならない。最終操作を複数 statement や wall clock の比較へ戻さず、SQLite の一文で公開と順序を確定する。

## Decision（決定とその理由）

- 未公開データは `library_snapshots` と snapshot-scoped `tracks` に用意する。snapshot 自体には公開時刻も公開順も持たせない。
- `library_publications` を完成 snapshot の公開記録とする。`sequence INTEGER PRIMARY KEY AUTOINCREMENT`、一意な `library_snapshot_id`、`selected_at` を持つ。同じ root の stale publication を拒否する generation は [ADR 0011](0011-reject-stale-library-publications.md) で具体化する。
- 全 Track observation を挿入したあと、最後の一文で `library_publications` へ row を挿入する。この INSERT が成功した時点を commit point とし、同じ statement が database 内の単調増加 sequence を採番する。
- 読込は `library_publications` から snapshot と folder を join し、`publications.sequence DESC` の先頭だけを選ぶ。root 指定の読込も同じ公開順を使う。
- `selected_at` は利用者向けの完了時刻として publication に保存する。最新判定には使わない。
- repository test と実 SQLite test で、A、B の順に準備し B、A の順に公開した場合、A が最新として読まれることを固定する。

この決定は ADR 0007 の公開マーカーを、snapshot row の nullable column から独立した publication row へ置き換える。追記型 snapshot、最後の一文だけでの公開、未公開途中結果を読まないこと、削除を補償処理に使わないことは変えない。

## Rejected Options（却下した選択肢）

- snapshot 作成時の sequence をそのまま公開順に使う: 完了順が逆転した競合を正しく表せない。
- `selected_at` の wall clock で並べる: 時計の巻き戻り、精度の衝突、instance 間の時刻差を再導入する。
- 公開時に snapshot の sequence を `MAX(sequence) + 1` で更新する: 読取と更新が別 statement になり、同時公開で競合する。SQLite の AUTOINCREMENT INSERT に順序確定を任せる方が境界が小さい。
- app を単一 instance に制限し、schema は変えない: 現在の UI だけなら発生確率を下げられるが、DB の正しさを window 数や event timing の暗黙条件へ依存させる。
- 公開前に以前の publication を削除する: 途中失敗時の復元先を失い、cleanup 成功へ安全性を依存させる。

## Consequences（結果）

- 並行走査の開始順や処理時間にかかわらず、最後に publication INSERT を成功させた snapshot が再起動後に選ばれる。
- snapshot、observation、publication の三段階になり、join と migration は一つ増える。公開の正しさを application timing ではなく DB 制約と一文の INSERT で説明できる。
- process termination や保存失敗では publication のない snapshot が残りうる。通常読込には現れず、将来 cleanup を行う場合も公開済み row を削除しない確認が必要になる。
- `library_publications` は過去の完成状態も保持するため増え続ける。snapshot retention は Story 0003 では導入せず、容量観測後の別 Story と ADR にする。
- `AUTOINCREMENT` は publication INSERT の直列化点になる。公開頻度はフォルダ走査完了ごとであり、高頻度ログではないため初期 MVP では許容する。
