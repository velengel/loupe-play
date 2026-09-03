# ADR 0015: メモを恒久Trackと確認済みPlayEventへ分けて所有する

## Status

Accepted

## Context（背景）

プロダクト仕様にはTrack Note、Listening Note、Timestamp Note / Markerの三種類がある。MarkerはStory 0006で恒久Trackと整数時刻へ接続した。残る二種はどちらも本文を持つが、Track Noteは曲そのもの、Listening Noteは一回の聴取・練習という異なる時間範囲を表す。

Listening Noteの親となるPlayEventは後続の履歴Storyに見える。しかし仮のsession IDへ保存すると、PlayEvent実装時に移送や孤児解決が必要になる。未再生のTrack選択をPlayEventとして作れば移送は避けられるが、生ログを水増しする。

## Decision（決定とその理由）

- migration version 4で `play_events`、`track_notes`、`listening_notes` を同時に追加する。PlayEvent schemaはADR 0017の最終形を先に用意し、Listening Noteは確認済みPlayEventへだけ保存する。
- Track Noteは `track_identities(id)` を `ON DELETE RESTRICT` で参照する。Listening Noteは `play_event_id` と `track_id` の組で、同じTrackのPlayEventへ接続する。所有確認を一つのINSERT条件と外部キーで行えるよう、PlayEventは `(id, track_id)` の一意性を持つ。
- Noteは `id`、所有identity、`body`、`created_at`、`updated_at`、nullableな `deleted_at` を持つ。bodyはtrim後に空ならrepositoryとDBの両方で拒否する。複数Noteを許し、active一覧は `created_at DESC, id DESC` とする。
- create / update / soft delete / restoreは一つの変更文を `RETURNING` でreadbackする。Listening Noteのcreateは `INSERT ... SELECT` でPlayEventとTrackの一致を同じ文の条件にする。
- UIは一つの折りたたみ「メモ」面にTrack NoteとListening Noteを置く。Track Noteは現在Trackがあれば使える。Listening Noteは現在Trackで確認された直近PlayEventがある時だけ使え、なければ「再生すると書けます」と示す。
- MarkerはPracticeの時刻メモとして既存面を保つ。三つの入力欄をListenへ常時展開しない。
- 二種とも作成、一覧、inline編集、inline削除確認、直後の復元を提供する。raw errorは分類した固定文へ変換し、音声状態を所有しない。

参考:

- [プロダクト仕様](../../first-instruction.md)
- [ADR 0008](0008-separate-track-identity-from-snapshot-observations.md)
- [ADR 0014](0014-persist-markers-on-track-identity.md)
- [ADR 0017](0017-record-contiguous-playback-segments.md)

## Rejected Options（却下した選択肢）

- Listening Noteを直接Trackへだけ接続する: 日ごとの感想は残るが、どの再生・練習で生まれたかを後から復元できない。
- 仮の `listening_sessions` tableを作り、後でPlayEventへ移す: migrationと所有関係を二度作り、Noteの孤児化や重複を生む。
- Note作成時に未再生PlayEventを作る: UIは常に有効になるが、「再生した区間」という生ログの意味を壊す。
- Trackごとに一つのTrack Noteだけを持つ: 上書き型は簡単だが、異なる時期の観察と作成日時を失う。まず複数を使ってから削る。
- bodyを任意にする: Markerは時刻だけでも意味があるが、位置を持たないNoteは空rowに意味がない。
- 三種類を一つのpolymorphic tableへ入れる: queryはまとめやすいが、nullableな親列とapplication側CHECKが増え、所有の違いがschemaから読めなくなる。
- 三入力欄をListenへ常設する: 作成は一手早いが、普通に聴く面をメモ操作で圧迫する。

## Consequences（結果）

- Listening Noteは実際の再生区間へ結び付く。再生前には書けないため、選曲直後の感想を残すには一度再生を始める必要がある。
- PlayEvent実装の一部をNote UIより先に作る。Story順は見た目上前後するが、後から親を移送する複雑さを避けられる。
- Noteを複数許すため、同じ本文の重複も保存できる。mutation中の二重送信はUIで防ぐが、別操作としての重複は自動統合しない。
- soft deleteで誤操作を戻せる一方、削除済み本文はDBに残る。通常一覧と検索はactiveだけを対象にする。
- `listening_notes` に `track_id` を重ねる。冗長性は増えるが、composite foreign keyによりPlayEventとNoteのTrack一致をDBで保証できる。
- 三種が実利用で使われなければ、後続Storyで削除または統合できる。初期schemaは永続的なUI維持の約束ではない。
