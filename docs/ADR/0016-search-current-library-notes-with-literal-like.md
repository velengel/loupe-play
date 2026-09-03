# ADR 0016: 現在ライブラリのメモをliteral LIKEで横断検索する

## Status

Accepted

## Context（背景）

三種類のメモは恒久Track identityへ属するが、画面へ表示する曲情報は公開中のLibrary Snapshotにある。同じTrackには過去snapshotのobservationが複数ありうる。検索範囲を決めずにjoinすると結果が重複し、非公開folderの過去メモまで混ざる。

日本語全文検索はtokenizerと配布runtimeの差を伴う。初期MVPの要求は日本語を含む単純な部分一致であり、先にFTS indexを導入する根拠はまだない。

## Decision（決定とその理由）

- 検索対象は最新 `library_publications.sequence` が指す一つのsnapshotと、そのobservationのTrack identityに限定する。
- Track metadata、Track Note、Listening Note、Markerを `UNION ALL` した安全な検索結果DTOとして返す。種別は `track`、`track-note`、`listening-note`、`marker` とし、Track identity、表示title / artist / album、要約、作成日時、Markerだけの `position_ms` を持つ。path、relative path、source identifierは選択も返却もしない。
- queryはtrimし、Unicode code pointsで1〜100文字だけ受け付ける。各行の対象文字列へ `LIKE $pattern ESCAPE '!'` を使い、`!`、`%`、`_` をescapeしてから `%...%` をbindする。SQL文字列へ入力を連結しない。
- SQLite既定のLIKEを使う。日本語は同じcode point列の部分一致、ASCIIはSQLite既定の大小文字非区別となる。この差を初期仕様として受け入れる。
- 削除済みNote / Markerは除く。Listening NoteはPlayEvent経由でも同じTrackであることをcomposite外部キーが保証する。
- 結果は `created_at DESC, kind ASC, id ASC` の決定順とし、初期上限を100件にする。高度なrankingやhighlightは行わない。
- result navigationはworkspaceが所有する。Track結果はTrackを開き、Marker結果はTrack選択と別identityのseek requestを発行する。media metadata後に現在Trackとrequest identityを再確認して一度だけseekする。

参考:

- [プロダクト仕様](../../first-instruction.md)
- [SQLite LIKE](https://www.sqlite.org/lang_expr.html#the_like_glob_regexp_match_and_extract_operators)
- [SQLite Query Planner](https://www.sqlite.org/queryplanner.html)
- [ADR 0007](0007-publish-complete-library-snapshots.md)
- [ADR 0008](0008-separate-track-identity-from-snapshot-observations.md)

## Rejected Options（却下した選択肢）

- SQLite FTS5を初期採用する: rankingやindexは得られるが、日本語tokenizerの選定と各bundleでのextension確認が先に必要になる。
- applicationへ全Noteを読み出してfilterする: SQLは簡単だが、件数と本文を無制限にfrontendへ渡し、publication scopeも重ねて実装する。
- `%${query}%` を直接作るだけにする: bindしても `%` と `_` はwildcardのままになり、literal検索にならない。
- 全folderと過去snapshotを検索する: 永続メモは見つかるが、現在画面から開けないTrackや重複observationが結果へ混ざる。
- 結果へpathを含めてnavigationする: Track identityで選べるのに、個人pathをDOMへ近付ける必要がない。
- metadataとメモを別の検索欄にする: queryを二度入力させ、「過去の耳を探す」一つの行為を分ける。

## Consequences（結果）

- 日本語の語形、表記ゆれ、全半角、ひらがな・カタカナは正規化しない。実利用で不足が分かれば、query normalizationまたはFTSを別ADRで選ぶ。
- `%`、`_`、`!` 自体を探せる一方、利用者がwildcard検索を行う機能はない。
- 現在非公開のfolderにあるメモは検索できない。folderを再び公開すれば同じ恒久Track identityのメモが検索対象へ戻る。
- 最大100件、日付順であり、関連度順ではない。初期利用量には十分でも、蓄積後にpaginationやrankingが必要になりうる。
- Marker結果の別Track navigationはmedia loadを待つ。結果buttonを押した瞬間にはseek完了していないため、loadingとfocusを明示する必要がある。
