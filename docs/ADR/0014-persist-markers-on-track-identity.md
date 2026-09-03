# ADR 0014: Marker を恒久 Track identity の整数時刻へ保存する

## Status

Accepted

## Context（背景）

LoupePlayのMarkerは、練習用の位置と鑑賞中のタイムスタンプメモを一つにした概念である。Story 0005のA・Bは一時的な音声セッションへ属するが、Markerはアプリ再起動とライブラリ再走査を越えて残る必要がある。

ADR 0007と0008により、`tracks` はsnapshotごとの観測、`track_identities` は再走査を越える親として分かれている。HTML mediaの `currentTime` は秒の浮動小数であり、仕様のMarkerは `position_ms` を持つ。保存、並び順、再選択の境界で単位を固定しなければ、同じ位置が別の値になりうる。

Marker操作は音を聴きながら行う。DB書込みや編集面がmedia lifecycleを所有すると、作成した瞬間に停止したり、遅い応答が別Trackへ混ざったりする。永続情報と音声制御の責務を分ける必要がある。

## Decision（決定とその理由）

- migration version 3で `markers` tableを追加する。列は `id`、`track_id`、`position_ms`、nullableな `label` / `body`、`created_at`、`updated_at`、nullableな `deleted_at` とする。Markerは `track_identities(id)` を `ON DELETE RESTRICT` で参照し、snapshot observationへは接続しない。
- `position_ms` は0以上のsafe integerとし、DBでも `INTEGER NOT NULL CHECK (typeof(position_ms) = 'integer' AND position_ms >= 0)` を課す。SQLiteの型親和性だけでは小数を拒否できないため、storage classも検査する。mediaのdurationがfiniteになるまでは位置操作を無効にする。mediaから作るときはfiniteな `currentTime` を0〜durationへclampし、秒を `Math.round(seconds * 1000)` で一度だけ整数化する。保存値からseekするときは1000で割り、現在mediaのdurationへ再度clampする。ファイル差し替えで長さが変わっても、保存値を黙って書き換えない。
- labelとbodyはtrimし、空白だけなら`NULL`へ正規化する。両方が`NULL`でもMarkerを作れる。時刻そのものが印として意味を持つためである。画面では時刻を必ず表示し、labelがなければ「無題のマーカー」と説明する。
- 同じTrack、同じ `position_ms` の複数Markerを許す。一意制約は置かない。一覧は `position_ms ASC, created_at ASC, id ASC` の決定順とし、`(track_id, deleted_at, position_ms, created_at, id)` に非一意indexを置く。
- repositoryはTauri SQL pluginの固定済み `sqlite:loupe-play.db` 接続を使い、全ての値をbindする。作成IDと時刻は依存として注入できるようにする。create / update / soft delete / restoreはそれぞれ一つの変更文を `RETURNING` で読み、返った一rowの所有、位置、nullable値、削除状態を検証する。書込み成功後の別SELECT失敗を保存失敗と誤認しないためである。create / update / restoreは検証済みMarkerを返し、deleteも返却rowを内部検証する。gatewayはpathやTrack observationを渡さず、Track identityとMarker DTOだけを公開する。
- `deleted_at` は `NULL`、または空でないTEXTだけを許すCHECKを課す。空文字やBLOBを「削除済み」と解釈しない。
- Marker panelはPracticeの間だけmountする。開いた時とTrack identity変更時に一覧をloadする。loadとmutationは単調増加generationとTrack identityで隔離し、unmountまたは別Trackの遅い結果を表示しない。一つのpanelではmutation中に次のmutationを受け付けず、順序の曖昧さを避ける。mutation完了時は同じgateway / Trackを開いている全panelへ完了だけを通知して再loadする。自分自身も再loadすることで、先に始まった別panel由来のloadが後の保存結果を巻き戻さない。新panelの初回loadは旧Promiseを待たせず、未解決PromiseでPracticeが永久に読込中になることを避ける。
- 作成はbuttonを押した瞬間のmedia `currentTime` を読む。再生中でも `pause()`、`load()`、source交換、mode変更を行わない。label / bodyの入力も音声セッションから独立させる。
- Markerの時刻buttonは、ListenPlayerがすでに持つseek境界を呼ぶ。再生・一時停止の意図、rate、A-B、volumeを変えない。編集ではlabel / bodyを変更でき、「現在位置を使う」を明示した場合だけ保存位置を取り直す。
- 削除は一件ごとに、時刻とlabelを含むinline確認へ進んだ後で `deleted_at` を設定する。通常loadは `deleted_at IS NULL` だけを返す。削除直後のpanelは対象を保持して「元に戻す」を出し、復元は `deleted_at = NULL` と `updated_at` 更新で同じIDを戻す。hard deleteと一括削除はこのStoryへ入れない。
- 同時刻の複数Markerはlabelと同時刻内の順番をaccessible nameへ含め、操作を区別する。編集開始時は最初の入力へ移し、編集終了、削除取消・失敗、削除成功、復元成功では、編集button、削除button、Undo、復元rowで利用可能な操作へfocusを戻す。media未準備で時刻buttonが無効な場合は編集buttonへ戻す。
- 失敗時は現在の音声と成功済み一覧を保持し、load、save、delete、restoreを分類した固定文だけを表示する。SQL、絶対path、raw exceptionはDOM、accessible name、consoleへ出さない。
- ListenではMarker panelを表示しない。MarkerはPracticeだけのデータではないが、初期の作成・編集面を日常再生へ常設しないというプロダクト原則を優先する。後続の検索結果からはListenでも時刻へ移れる設計を別Storyで加える。

参考:

- [プロダクト仕様](../../first-instruction.md)
- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/)
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)
- [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html)
- [SQLite PRAGMA foreign_key_check](https://www.sqlite.org/pragma.html#pragma_foreign_key_check)
- [ADR 0008](0008-separate-track-identity-from-snapshot-observations.md)
- [ADR 0013](0013-share-one-audio-session-between-listen-and-practice.md)

## Rejected Options（却下した選択肢）

- snapshotごとの `tracks` rowを参照する: 再走査のたびに新しい親rowが生まれ、Markerを移送する処理と途中失敗時の整合性が必要になる。
- pathまたはsource identifierだけをMarkerへ複製する: 外部キーで存在を保証できず、folderの違いと再走査のidentity判断をMarker側で再実装することになる。
- positionを秒の `REAL` で保存する: media APIとは同じ単位だが、比較、表示、将来のexportで浮動小数の表現差を持ち回る。初期仕様どおり整数ミリ秒を境界にする。
- `(track_id, position_ms)` を一意にする: 同じ瞬間へ、演奏上の印と鑑賞メモなど複数の観察を残せない。
- Marker作成時に一時停止する: 入力はしやすいが、聴取の流れを暗黙に変える。再生継続を初期値とし、利用後に必要なら別の設定として判断する。
- 作成時のlabelまたはbodyを必須にする: 印だけを素早く置く操作を妨げる。無題でも時刻を主表示にすれば選択できる。
- 画面だけへoptimistic追加し、永続化を後から扱う: 速く見えるが、保存失敗したMarkerを成功したように扱う。DB成功後に一覧へ反映する。
- 変更文の後に別SELECTでrowを検証する: 二文目だけ失敗するとDB変更済みなのに失敗表示となり、再試行で重複や画面との逆転を生む。一つの `RETURNING` 文で変更とreadbackを同じ成功境界にする。
- 閉じたpanelのmutationが完了するまで、再び開いたpanelの初回loadを待たせる: 順序は単純になるが、旧Promiseが解決しないとPracticeを永久に利用できない。先に現在のDB状態を読み、完了通知後に再読込する。
- 一件を即時hard deleteする: 実装は短いが、誤操作を戻せない。soft deleteと直後の復元を採る。
- 削除確認にnative dialogや `window.confirm` を使う: focusとtestの制御が環境に依存する。対象を保ったinline確認にする。
- Marker panelをListenへ常設する: 作成は早くなるが、普通に聴く画面を分析操作で圧迫する。まずPractice内に置く。
- 精密な波形timelineを先に作る: 位置の保存とseekに不要であり、Story 0006を描画技術の検証へ広げる。

## Consequences（結果）

- Markerは再走査と再起動を越えて同じTrackへ残り、現在のsnapshotに依存しない。
- millisecondへ丸めるため、作成時のmedia位置と最大0.5ms異なりうる。実際のseek着地はdecoderとWebViewにも依存し、sample精度は保証しない。
- SQLiteのstorage classをCHECKするため、数値として比較可能でもREAL値の位置や空文字の削除日時はmigration境界で拒否する。
- 作成は音を止めないため、label / bodyを入力してからbuttonを押すまで再生位置が進む。利用者がbuttonを押した瞬間をMarker位置とする。
- 同位置の重複を許すため、誤って連打したMarkerも別rowになる。mutation中の操作抑止は同じrequestの二重送信を防ぐが、意図した複数作成までは禁止しない。
- soft deleteで誤操作から戻せる一方、削除済みcontentはローカルDBに残る。通常一覧と後続検索は必ず除外し、永久削除やretentionが必要になれば別の判断を行う。
- frontendから固定DBへのexecute権限は既存のまま使う。Marker追加のためにfile scope、network、別DB load権限は増やさない。
- Practice componentへ永続操作が加わる。media lifecycleとはgatewayで分けられるが、Track変更と遅いPromiseを隔離するtestを維持する必要がある。
- `RETURNING` を使えるSQLite runtimeが前提になる。Tauri SQLが束ねるSQLiteと自動testでこの境界を維持し、将来DB backendを変える場合は同じ原子的readback契約を再検証する。
- WindowsとmacOSでSQLiteの論理契約は共通でも、WebViewのseek着地とfocusの実挙動は各OSで確認が残る。
