# Story 0004: Listen モードで普通に聴く

## Context（背景）

Story 0002 では、再生、精密 seek、速度変更、A-B ループを検証する音声基盤を作った。Story 0003 では、選んだ音楽フォルダを階層のあるライブラリとして保存し、再接続後に Track を開けるようにした。しかし現在の操作面は技術検証用である。native controls と独自操作が重なり、前後の曲、音量、自動連続再生もないため、普通のプレイヤーとしては使えない。

この Story では、現在曲の情報と日常的な transport を一つの Listen 操作面へまとめる。速度変更、5秒移動、A-B ループ、診断値は、次の Practice Story まで前面に出さない。shuffle、repeat、playlist、音量の永続化にも広げない。

## Definition of Done（完了の定義）

- 選択した現在曲の title、artist、album、現在位置、総時間を、絶対pathを出さず表示する。
- 一つの操作面から再生、一時停止、任意位置への seek、音量変更ができる。native audio controls は重複表示しない。
- 前の曲と次の曲は、画面に見えるライブラリ順で、現在利用できる Track だけを移動する。先頭と末尾では該当操作を無効にする。
- 再生中の手動移動は次の Track でも再生を続ける。一時停止中の移動と一覧からの明示選択は、勝手に再生しない。
- Track の終了時は次の Track を一度だけ選び、読込可能になってから再生する。末尾では停止し、先頭へ戻らない。
- Track を替えると位置、速度、A-B ループ、エラーを初期化する。音量はアプリ実行中の Track 変更と同じ Track の再読込を越えて保つ。
- 古い音源の event と `play()` Promise は、現在曲や現在の再生状態を変えない。
- 読込または自動再生に失敗しても現在曲を保持し、安全な文言と再試行方法を表示する。失敗した Track を無限に自動skipしない。
- button と range input はマウスと標準キーボード操作で使える。明示的な一覧選択だけが再生buttonへfocusを移し、自動次曲はfocusを奪わない。
- queue、音量、遷移競合、Listen UI に、実装前に失敗するテストがある。
- `npm run dev` を維持し、frontend test、lint、build、Rust test、狭幅と広幅の検証結果を残す。

## To Do（やること）

- [x] プロダクト仕様、既存音声セッション、HTML media、seek slider の契約を確認する。
- [x] 再生キュー、遷移時の再生意図、音量、focus、末尾の扱いを ADR に記録する。
- [x] 再生キューと現在曲の用語をユビキタス言語へ追加する。
- [x] queue、volume、Listen component、library連携の失敗するテストを書く。
- [x] Listen の現在曲表示と custom transport を実装する。
- [x] 前後曲、自動次曲、再生意図、古い非同期結果の隔離を実装する。
- [x] 既存の音声基盤テストを、Listen と次の Practice で再利用できる境界へ整える。
- [x] 自動検査、320px / 1440px、desktop起動、実音源の証拠を層別して残す。
- [x] 独立レビューで、操作競合、path privacy、キーボード、狭幅表示を確認する。

## Concern（懸念）

- `ended`、`canplay`、`play()` Promise は非同期である。連打、再走査、旧elementの遅延結果で二曲進んだり、停止中に再生が始まったりしない識別が要る。
- Track ごとに player component 全体を作り直すと、古いeventは隔離しやすい一方、音量とfocusまで失う。media element と Listen 操作面の寿命を分ける必要がある。
- browser が自動再生を拒否する場合がある。失敗を無視したり、次々と別Trackへ進めたりしない。
- 保存済み一覧の順番と再生順がずれると、次曲が予想できない。生のDB配列順ではなく、画面と同じ決定的な順序を一つの関数から導く。
- 音量rangeを変えても、OSやWebViewが出力音量を上書きする場合がある。DOM値の適用と可聴音の実機確認を分ける。
- 長いtitle、artist、albumと全transportが320pxで収まり、44px程度の操作領域とfocus ringを保つ必要がある。
