# ADR 0017: 条件が一定の連続再生区間をPlayEventとして記録する

## Status

Accepted

## Context（背景）

LoupePlayはListenとPracticeを一つのmedia elementで連続させる。再生開始だけを回数にすると、mode、速度、loop、途中終了の違いを失う。一方、`timeupdate`やanimation frameごとに保存すれば、DB書込みが音声処理を圧迫し、同じ利用を大量rowへ分割する。

HTML media event、React state、Tauri SQLは別々の非同期境界を持つ。Trackを替えた直後に旧Trackのcloseが返ることも、process終了でcloseが完了しないこともある。画面の現在値だけで後から補正しない記録方式が必要である。

## Decision（決定とその理由）

- PlayEventを、Track、mode、playback rate、有効loop区間が一定の「再生区間」と定義する。HTML mediaの `playing` eventで開始し、requestや選択だけでは作らない。
- schemaは `id`、`track_id`、`started_at`、nullableな `ended_at`、`start_position_ms`、nullableな `end_position_ms`、`mode`、`playback_rate`、nullableな `loop_start_ms` / `loop_end_ms`、nullableな `closed_reason` / `recovered_at` / `active_slot` を持つ。
- positionは0以上のINTEGER storage class、modeは `listen | practice`、rateはfiniteで0より大きいREALまたはINTEGER、loopは両方NULLか `0 <= start < end`、終了時刻と位置は両方NULLまたは両方非NULLとCHECKする。
- 正常なopen rowだけ `active_slot = 1` とし、partial unique indexで一つに制限する。次のstart前に残ったopen rowへ `recovered_at` を設定し、`active_slot`をNULLにする。未知の終了時刻・位置を `ended_at` / `end_position_ms`へ捏造しない。
- startとcloseは固定DB gatewayを通し、recorderのPromise chainへimmutableなsnapshotとして積む。UIはDB完了を待って音を止めない。旧Trackのcloseもqueue順に実行し、現在Trackでないという理由で捨てない。
- mode変更、成功したrate変更、有効loopのON / OFF、手動seekは再生中のsegmentをsplitする。A・Bを置いてもloopが無効なら条件は変わらない。loop wrap、`timeupdate`、animation frame、volume変更ではsplitしない。
- pause、ended、source変更、load failure、retry、unmountでcloseする。同じevent IDのcloseはrecorderが一回だけqueueへ積み、repositoryも `ended_at IS NULL AND recovered_at IS NULL` を条件にする。
- Listening Noteへは、現在Trackで最後に開始できたPlayEvent IDを渡す。pause後も同じTrackを表示している間は直近eventへ書ける。Track変更時は即時に破棄する。

参考:

- [プロダクト仕様](../../first-instruction.md)
- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html)
- [React `useRef`](https://react.dev/reference/react/useRef)
- [SQLite Partial Indexes](https://www.sqlite.org/partialindex.html)
- [ADR 0013](0013-share-one-audio-session-between-listen-and-practice.md)

## Rejected Options（却下した選択肢）

- play button押下で開始する: autoplay拒否やload failureでも再生履歴が残る。実際の `playing` を境界にする。
- 一回のTrack選択を一つのeventにする: mode、rate、loopの途中変化が一rowへ混ざり、どの条件で何秒聴いたか解釈できない。
- `timeupdate`ごとにpositionを書き換える: crash時の位置は近くなるが、不要な高頻度writeが音声利用中に続く。
- mode / rate / loopを別event tableへ記録する: 完全なevent sourcingに近づくが、初期の解釈とListening Noteの親に必要な粒度を越える。
- source変更後に旧closeを無視する: 現在UIの汚染は避けられるが、旧eventが正常操作でもopenのまま残る。
- 次回起動時刻をstale eventの終了時刻にする: rowは閉じるが、実際に聴いていない時間を履歴へ加える。
- unmountでcloseが必ず完了すると仮定する: desktop process終了では非同期writeを待てない。recoveryなしではopen rowが増える。
- global mutable stateへ現在eventを置く: 複数componentとtest間で所有が曖昧になる。recorder instanceをaudio sessionへ注入する。

## Consequences（結果）

- 一回の連続再生でも、Practiceへ入り0.8xにしloopをONにすれば複数PlayEventになる。これは再生回数ではなく条件付き区間なので意図した増加である。
- mode / rate / loop変更時にmediaを止めなくても、DB上では旧closeと新startがqueue順に並ぶ。保存遅延中のprocess終了では最後のsegmentがrecovery対象になりうる。
- 手動seekは前後の区間を分ける。loop wrapは分けないため、反復回数そのものはPlayEventだけから直接は分からない。
- pause直後のListening Noteは直近eventへ付く。別Trackを選ぶと前Trackのevent IDを即時に捨てるため、後から前Trackの感想を書くには前Trackを開いて再生するか検索から既存Noteを見る必要がある。
- `recovered_at` のあるrowは再生時間を確定できない。将来集計は正常closeと分け、終了位置を推定しない必要がある。
- frontendが書込み権限を持つ既存方針を継続する。network、file scope、別DB権限は増えない。
