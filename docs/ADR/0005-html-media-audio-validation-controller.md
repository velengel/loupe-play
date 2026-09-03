# ADR 0005: HTML media の上に計測可能な音声制御を置く

## Status

Accepted

## Context（背景）

Story 0001 は、利用者が選んだローカルファイルを Tauri の asset protocol から `HTMLAudioElement` へ渡した。native controls で再生とシークを試すことはできる。だが Story 0002 では、速度を落としても音程を保てるか、A-B ループがどれほど境界を越えるか、曲を替えたときに前曲の状態が残らないかまで観察しなければならない。

`timeupdate` だけを使えば簡単に見える。しかし、その通知頻度は処理負荷に応じておよそ 4 Hz から 66 Hz まで変わりうる。250 ms 近い間隔は、短いフレーズを反復する境界として無視できない。一方、最初から Web Audio と独自 decode・time stretch へ移ると、長い音源をメモリへ載せる問題と、ブラウザごとの差を自前で引き受ける。

## Decision（決定とその理由）

- Story 0002 の音声 source と decode は `HTMLAudioElement` に任せる。Story 0001 の asset URL をそのまま使え、長いファイルを JavaScript のメモリへ全展開せずに済むためである。
- media element と画面の間に、小さな音声セッションの状態機械と React adapter を置く。位置、長さ、再生状態、速度、A・B、ループ状態、エラー、診断値は DOM から独立した状態としてテストし、`play()`、`pause()`、`currentTime`、`playbackRate` への指示だけを adapter が担う。
- 曲の選択と、一覧で同じ曲を選び直す操作をそれぞれ新しい音声セッションとみなし、React の `key` で `HTMLAudioElement` ごと作り直す。位置を 0 秒、速度を 1.0x、A・B とループを未設定、エラーと診断値を空へ戻す。古い resource の event、`play()` Promise、描画 callback が新しい source の操作として扱われる競合を、DOM の寿命でも分離するためである。非同期結果にも session identity を持たせ、現在のセッションにだけ反映する。読込失敗後の「音源を再読み込み」は同じ element を使うが、`load()` より先に同じ初期状態へ戻す。
- 再生は利用者のボタン操作から `play()` を呼び、返る Promise を処理する。解決前に再生中と断定せず、拒否時は絶対パスや media error の生メッセージを出さない。
- シークは `fastSeek()` ではなく、秒単位の `currentTime` を使う。前後 5 秒と slider の目標値は 0 から有限な `duration` の範囲へ収め、metadata が得られるまでは操作を無効にする。`fastSeek()` は速さと引き換えに精度を落とす API であり、練習区間の指定には合わない。
- 速度の候補値はプロダクト仕様の 0.50x、0.60x、0.70x、0.75x、0.80x、0.85x、0.90x、0.95x、1.00x とする。変更時は `preservesPitch = true` を明示してから `playbackRate` を設定し、対応する古い WebKit では vendor prefix も feature detection で補う。
- A-B ループは `A < B` のときだけ有効にする。再生中かつ画面が可視なら `requestAnimationFrame` ごとに `currentTime >= B` を検出し、精密シークと同じ `currentTime = A` で戻す。`timeupdate` でも同じ境界判定を行い、描画 callback が抑制された場合の安全網にする。media element が seek 中なら重複して戻さない。
- 各周回で、検出時の `currentTime - B` を境界超過、`seeked` 後の `|currentTime - A|` を着地点誤差として記録する。画面には周回数、直近値、最大値をミリ秒で表示する。これは JavaScript が観測した値であり、可聴音の誤差そのものとは断定しない。
- native controls も同じ media element を seek できるため、ループ復帰後に保留した着地点計測は、`seeking` 時点の目標が A の 1 ms 以内である場合だけ維持する。それ以外の seek、ループの変更・解除、独自 controls の seek、読込失敗、再試行、source 変更では破棄する。1 ms は整数ミリ秒で記録する診断値へ浮動小数点の差を持ち込まないための識別幅であり、ループ品質の合格閾値ではない。
- ループ診断値は可視の補足情報として `note` にし、live region にはしない。短い区間では周回ごとに長い診断文が更新され、読み上げの待ち行列が再生操作を妨げるためである。読込・再生エラーと読込状態は、引き続き即時に伝える。
- 合格とする誤差の閾値は先に決めない。macOS の WKWebView と Windows の WebView2 で実音源を測り、練習時の聴感と数値を得てから、標準 API を本採用するか、音声処理層を置き換えるかを判断する。
- `canPlayType()` は診断値に留める。WAV、MP3、FLAC はそれぞれ実ファイルについて、有限な長さ、`play()` の成功、位置の進行、可聴出力、一時停止・再開、長いファイルでの seek を OS ごとに確認する。
- codec 確認には権利上安全な試験音を一時ディレクトリへ生成し、生成物と絶対パスはコミットしない。個人音源を使った追加確認でも、ファイル名やパスを報告へ転記しない。
- Tauri の静的 asset scope は広げない。native dialog で選ばれたフォルダだけを実行時 scope に加える現在の境界を保つ。

参考:

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource)
- [MDN: `HTMLMediaElement.play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
- [MDN: `currentTime`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)
- [MDN: `fastSeek()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/fastSeek)
- [MDN: `playbackRate`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
- [MDN: `preservesPitch`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch)
- [MDN: `timeupdate`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event)
- [MDN: `requestAnimationFrame()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [Tauri: Webview Versions](https://v2.tauri.app/reference/webview-versions/)
- [Tauri: Asset Protocol Scope](https://v2.tauri.app/security/asset-protocol/)
- [Microsoft: Windows apps supported codecs](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/supported-codecs)

## Rejected Options（却下した選択肢）

- native controls だけで Story 0002 を終える: 基本操作はできるが、音程維持の明示、A・B、境界超過、曲変更時の状態を LoupePlay 側で検証できない。
- ループ診断値を周回ごとに live region で通知する: 数値を即時に読める一方、短い区間では同じ長文を連続して読み上げ、再生操作へのフィードバックを埋めてしまう。
- `timeupdate` だけで A-B ループする: 実装は小さいが、通知間隔が負荷依存で、境界超過の原因と上限を制御できない。
- `setInterval()` だけで高頻度監視する: 描画と同期せず、非表示時にはブラウザごとの timer throttling を受ける。可視時の主経路にしない。
- `fastSeek()` でループ開始点へ戻る: 対応範囲が狭いうえ、API 自身が精度との交換を明示している。
- `AudioBufferSourceNode` へ音源全体を decode する: loop point は細かく指定できるが、長いファイルを丸ごとメモリへ decode し、同 API の速度変更には音程補正もない。
- Rust、AudioWorklet、FFmpeg で decode と time stretch を先に自作する: 制御力は増すが、標準 media element が要件を満たすかを測る前に、codec、buffering、seek、音声処理の責任を広げる。
- macOS の成功を採用判断にする: LoupePlay が最優先する Windows WebView2 の codec と timing を証明できない。

## Consequences（結果）

- Listen と Practice の後続 Story は、同じ音声 source と位置を共有しながら、画面ごとの操作だけを分けられる。
- custom controls と native controls が技術検証中だけ並ぶ。動作比較と volume の退路にはなるが、操作が重複するため、Listen / Practice の本 UI では一本化する。
- 選択と再読み込みのたびに media element を作り直すため、native controls が内部にだけ保持する volume なども初期化されうる。検証中は古い source の event を遮断する方を優先し、永続させる音量は後続 Story で LoupePlay の状態として扱う。
- 可視ウィンドウでは描画周期に近い間隔で境界を観測できる。ただし `requestAnimationFrame` は非表示時に停止・抑制され、seek の実完了にも遅延がある。A-B ループの精度保証ではなく、現在の WebView を採否判定するための方式である。
- ループ診断値の更新は自動では読み上げられない。スクリーンリーダー利用者は `note` へ移動して現在値を確認する必要があるが、短区間の反復中も操作に必要な通知を聞き取れる。
- `preservesPitch = true` は、標準上の要求を WebView へ伝える。音質、アタックの崩れ、特定速度での安定性までは保証しないため、試験音と実音楽で聴感確認が残る。
- Windows の codec 一覧に MP3、FLAC、LPCM/WAV があっても、個々の WebView2 とファイルの decode 成功は別である。Windows 実機証拠が得られるまで `UNVERIFIED` とする。
- 標準 media element が精度または音質を満たさない場合、音声処理層を置き換える費用が生じる。この Story の診断値と手動記録が、その費用を払う根拠になる。

## Validation Result（検証結果）

2026-09-02 時点で、音声セッションと React adapter の自動テスト、production build、macOS debug app bundle、desktop window の起動は `PASS` である。fixture はWAV、MP3、FLAC、長尺FLACをrepo外へ生成し、FFprobeで形式と長さを確認した。

macOS WKWebViewでの実再生、可聴音、0.5xの音程、長尺seek、20周の実ループは `UNVERIFIED` である。Windows / WebView2も未確認であり、標準 media element を最終採用したとはまだ判断しない。証拠と再現手順は [Story 0002 検証記録](../reports/2026-09-02-story-0002-audio-foundation-verification.md)を正とする。
