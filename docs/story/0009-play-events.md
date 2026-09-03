# Story 0009: 再生と練習の生ログを残す

## Context（背景）

ListenとPracticeは同じaudio elementを共有し、速度とループを切り替えられる。しかし、現在の状態は画面を閉じると消え、後から「どの曲をどの区間で練習したか」を解釈できない。早い段階で再生回数へ集約すると、途中終了、部分再生、0.7xの反復を区別できなくなる。

PlayEventは高頻度なtelemetryではなく、条件のそろった連続再生区間である。HTML mediaの`playing`を確認した時だけ開始し、Track、mode、rate、有効loop、手動seekの境界で閉じる。Listening Noteの親でもあるため、schemaと最小記録基盤をStory 0007より先に実装し、履歴としての完了をこのStoryで検証する。

## Definition of Done（完了の定義）

- migration version 4でPlayEventを恒久Track identityへ接続し、started / ended時刻、start / end位置、listen / practice、playback rate、nullableなloop区間、内部の終了理由とrecovery状態を保存する。
- `playing`を確認した時だけ一件を開始する。再生request、metadata load、Track選択だけでは作らない。
- 連続区間はTrack、mode、rate、有効なloop設定が一定である。これらの変更と手動seekでは旧区間を閉じ、再生継続中なら新しい区間を始める。
- pause、ended、Track変更、retry / load failure、component unmountで現在区間を閉じる。`timeupdate`、animation frame、loop wrapではDBへ書かない。
- start / end位置は0以上の整数msへ丸め、media durationへclampする。loopは両端があり `start < end` の場合だけ保存する。
- 書込みは開始順を保つqueueで直列化し、Track変更後も旧Trackのcloseを捨てない。各eventは最大一回だけcloseする。
- crash等で `ended_at IS NULL` のrowが残った場合、次のstart前に`recovered_at`を設定する。観測できなかった終了時刻や位置は捏造しない。
- 現在Trackの直近PlayEvent identityをListening Noteへ渡せる。raw DB error、path、source URLをUIへ出さない。
- repository、recorder、ListenPlayer統合、異常順序のtestを実装前にREDにしてGREENにする。
- 再接続相当、frontend / Rust / build、desktop起動を層別して記録する。

## To Do（やること）

- [x] 再生区間、開始・終了境界、queue、crash recoveryをADRへ記録する。
- [x] Play Eventと再生区間の用語を更新する。
- [x] schemaとrepositoryの失敗するtestを書く。
- [x] recorderの順序、重複close、recoveryの失敗するtestを書く。
- [x] ListenPlayer event、mode / rate / loop / seek境界をREDにする。
- [x] PlayEvent repository、runtime gateway、serialized recorderを実装する。
- [x] 自動検査、DB再接続、desktop起動の証拠を層別して残す。
- [ ] 独立レビューで欠落、過剰ログ、競合、異常終了を確認する。

## Concern（懸念）

- React state更新とmedia eventは同じ順序で届かない。event handlerは描画値だけでなく同期refから現在条件を採り、保存queueへimmutableなsnapshotを渡す。
- modeやrate変更中も音は止まらない。旧close完了をawaitしてUIを止めず、queueの中でclose→startの順を守る。
- loop wrapのseekを手動seekと誤認すると周回ごとにeventが増える。UIが発行した手動seekだけをsegment境界にし、`seeking` event自体では分割しない。
- crash時の正確な終了位置は分からない。次回起動時刻を`ended_at`へ入れず、`recovered_at`だけで不完全さを明示する。
- page lifecycleでunmount closeを送ってもprocess終了前に完了する保証はない。recoveryを必須にし、正常closeと異常終了を同一視しない。
