# Story 0005: 現在の音を保ったまま Practice へ潜る

## Context（背景）

Story 0004 で、選んだ Track を Listen モードから普通に聴けるようになった。速度、前後5秒、A-Bループの制御ロジックは Story 0002 の音声基盤にあるが、現在の Listen 操作面には出していない。別のplayerへ切り替えてこれらを再利用すると、耳へ引っかかった瞬間の位置、再生中か停止中か、音量、未解決の `play()` を失う。

この Story では、同じ音声セッションとmedia elementを保ったまま、Practiceの操作面だけを開く。マーカーの保存は次のStory、任意速度入力、波形、shortcut、loop精度の合否判断は今回へ含めない。

## Definition of Done（完了の定義）

- 起動時とplayerの再生成時はListenで始まり、現在曲から一つのbuttonでPracticeへ切り替え、同じbuttonでListenへ戻れる。
- モード切替でmedia element、source URL、現在位置、再生・一時停止の意図、音量を変えず、`pause()`、`load()`、再選択、focus移動を発生させない。
- Practiceでは前後5秒を0秒から総時間へclampして移動できる。
- 0.50x〜1.00xの候補から速度を選べる。音程維持を有効にしてから速度を適用し、失敗時は固定文を表示する。
- 現在位置へA地点とB地点を置き、`A < B` の区間だけをON / OFFできる。A・Bと現在のloop状態をpathなしで確認し、まとめてclearできる。
- 有効なloopは再生中だけ、描画frameと `timeupdate` の両方からB地点を監視してA地点へ戻す。Listenへ戻った直後の古いcallbackはloopさせない。
- B地点が曲末と一致しても、有効なloopが `ended` を所有し、次Trackへ進めない。
- Listenへ戻ると、同じ位置・再生状態・音量のまま速度を1.00xへ戻し、loopをOFFにする。A・Bは保持するが、Practiceへ戻っても自動でONにしない。
- PracticeのままTrackを替えた場合、Practice表示は保つ。新しいTrackは位置0、速度1.00x、A・Bなし、loop OFF、診断値なしで始まり、音量とStory 0004の再生意図だけを保つ。
- ListenではPractice操作とloop診断を表示しない。Practiceでもnative audio controlsは表示しない。
- mode continuity、5秒移動、速度、A-B、旧callback、Track変更、responsive表示に、実装前に失敗するtestがある。
- `npm run dev` を維持し、frontend test、lint、build、Rust test、320px / 1440px、desktop起動の結果を層別して残す。

## To Do（やること）

- [x] プロダクト仕様、既存Listen、音声セッション、HTML media、animation frameの契約を確認する。
- [x] モードと音声セッションの寿命、Listen復帰、Track変更、loop監視、focusをADRに記録する。
- [x] Listen、Practice、音声セッション、A-Bループの用語を更新する。
- [x] mode continuity、Practice操作、loop競合、Track変更の失敗するtestを書く。
- [x] ListenPlayerへPractice操作とloop controllerを統合する。
- [x] Story 0002の未使用検証componentを、移植後に削除する。
- [x] 自動検査、320px / 1440px、desktop起動の証拠を層別して残す。
- [x] 独立レビューで、音声継続、旧callback、path privacy、キーボード、狭幅表示を確認する。

## Concern（懸念）

- modeをmediaの `key` やsource effectへ混ぜると、見た目だけの切替でresourceを開き直し、位置と再生状態を失う。
- React stateの更新より前に、予約済みのanimation frame callbackが走ることがある。effect cleanupだけでなく、event handlerから同期的に読めるmode identityが必要である。
- `playbackRate = 1` 自体もWebViewに拒否されうる。Listenへ戻ったと表示しながら低速再生を続けない、fail-closedの切替が要る。
- `timeupdate` とanimation frameが同じ境界を観測すると、同じ周回で二度seekする可能性がある。mediaの `seeking` と保留中の着地を共有して重複を抑える。
- Practiceのまま前後曲へ移る場合、modeを保つ一方、前Trackのrateやloopを持ち越してはいけない。modeとTrack固有状態の寿命を分ける。
- 320pxでListen transport、音量、mode切替、Practice操作を一度に見せると密度が上がる。操作を意味ごとに分け、44px程度の領域とfocus ringを保つ。
