# Story 0008: 過去の耳を横断検索する

## Context（背景）

Marker、Track Note、Listening Noteを残せても、曲を一つずつ開かなければ過去の観察へ戻れない。LoupePlayが探したいのは音源ファイルだけではなく、「ゴーストノート」と書いた過去の自分の耳である。

初期MVPでは日本語形態素解析や検索indexを先回りしない。現在公開中のライブラリだけを対象に、SQLiteのliteralな部分一致で三種類のメモと関連metadataを横断し、結果からTrackまたはMarker時刻へ移る。

## Definition of Done（完了の定義）

- Track title / artist / album、Track Note本文、Listening Note本文、Marker label / bodyを一つの検索欄から日本語を含めて部分一致検索できる。
- `%`、`_`、escape文字はwildcardでなく利用者が入力した文字として検索する。trim後の空入力はDBを読まず、100 code pointsを越える入力は固定文で拒否する。
- 検索対象は現在公開中のLibrary Snapshotと、その恒久Track identityに属するactiveなメモだけである。削除済みNote / Marker、過去snapshot、別folderの非公開Trackを混ぜない。
- 結果はメモ種別、曲名、本文の要約、作成日時、存在する場合は時刻を持つ。DTO、DOM、accessible nameへ絶対pathやsource identifierを含めない。
- 結果から現在または別のTrackを開ける。Marker結果ではmedia準備後に保存位置へseekし、現在durationを越える場合はclampする。
- 遅い検索結果、Track変更、library再公開が交差しても、古い結果やseekを現在状態へ適用しない。
- native input / buttonを使い、loading、0件、失敗、keyboard focus、320px / 1440pxを確認する。
- repository、gateway、component、Track navigation、Marker seekのtestを実装前にREDにしてGREENにする。

## To Do（やること）

- [x] 検索範囲、literal一致、上限、結果DTO、navigationをADRへ記録する。
- [x] メモ検索と検索結果の用語を追加する。
- [x] repositoryのliteral queryとpublication scopeをREDにする。
- [x] 検索UI、競合、privacy、結果navigationをREDにする。
- [x] search repository、gateway、workspace UI、pending seekを実装する。
- [x] 自動検査、responsive、desktop起動の証拠を層別して残す。
- [ ] 独立レビューで検索範囲、SQL、競合、navigation、privacyを確認する。

## Concern（懸念）

- SQLite `LIKE` のASCII大小文字規則と日本語の単純code point一致には限界がある。初期の部分一致だと明記し、tokenizerを導入したように見せない。
- wildcardをescapeしないと、`%`や`_`の検索が全件または意図しない一致になる。queryを文字列連結せず、escape済みpatternをbindする。
- snapshot observationと恒久Track identityを雑にjoinすると、同じTrackが過去snapshot分だけ重複する。最新publicationを一件に固定してから検索対象へjoinする。
- 別TrackのMarker結果はmedia loadより先にseekできない。Track選択とseek要求を別identityで持ち、現在sourceのmetadata後に一度だけ適用する。
