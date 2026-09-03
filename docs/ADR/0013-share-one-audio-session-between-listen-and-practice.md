# ADR 0013: Listen と Practice で一つの音声セッションを共有する

## Status

Accepted

## Context（背景）

Listenは日常のtransportを、Practiceは速度、前後5秒、A-Bループを前面に出す。しかしプロダクト仕様は、耳へ引っかかった現在曲と再生位置を保ってPracticeへ潜ることを求める。現在の `ListenPlayer` は `playbackRequest.id` とTrack identityでsourceを識別し、source変更時だけmedia elementを交換する。modeをsource identityへ含めたり、別componentへ切り替えたりすると、同じTrackでも `load()`、pause、位置0へのresetが起きる。

`playbackRate` は現在の再生速度であり、1.0が通常速度である。`preservesPitch` がtrueなら、1.0以外でもuser agentは元の音程を保つ処理を行う。animation frame callbackは予約後に個別のhandleを持ち、cancel対象になるが、切替eventとcleanupの間にcallbackが残る可能性はcomponent側で閉じる必要がある。

## Decision（決定とその理由）

- ListenとPracticeを、一つのpersistent player、同じ `HTMLAudioElement`、同じsource identity、同じ音声セッションの二つの操作面として扱う。modeはReact stateで持つが、mediaの `key`、source URL、source effectの依存に含めない。
- 起動時とplayerのremount時はListenにする。mode切替buttonは同じDOMを保ち、切替時にfocusを移さない。PracticeのままTrackを替えた場合はPractice表示を保つ。modeの寿命とTrack固有の音声セッションを分けるためである。
- mode切替buttonは、現在状態を押下状態で表すtoggleではなく、遷移先を「Practiceへ切り替える」「Listenへ戻る」と示すactionとして公開する。現在modeは画面見出しとplayer regionで示し、再生操作groupのaccessible nameもmodeへ合わせる。
- Practiceへ入る操作はmediaへ命令しない。位置、再生状態、未解決のplay要求、音量、rate、A・B、loop状態をそのまま見せる。通常はListenがrate 1、loop OFFであるため、最初のPracticeもその状態から始まる。
- Listenへ戻る操作は、同じmediaへpitch preservationを有効にしてからrate 1を同期的に適用する。成功した場合だけmodeをListenへ変え、音声セッションのrateを1、loopをOFFへする。A・Bと診断値は保持する。Practiceへ再び入ってもloopは自動でONにしない。
- rate 1への適用に失敗した場合はPracticeに留まり、固定した速度エラーを表示する。画面だけListenへ戻して、低速または未知のrateを普通の再生として扱わない。ただし同じsourceにload failureがある間は、再試行可能なload errorをrate errorより優先して保持する。
- Track変更、同Trackの明示的な再選択、retry、load failureは、既存のsource-scoped resetを使う。位置0、rate 1、A・Bなし、loop OFF、診断値なし、Track固有errorなしに戻す。volumeとmodeはplayerの状態なので保つ。前後曲と自動次曲の再生意図はADR 0012を変えない。
- Practiceは、前後5秒、仕様にある9つのrate preset、A設定、B設定、loop ON / OFF、clear、A・Bとloop状態、補足的な診断値を表示する。任意rate入力は初期操作数を増やすため採用せず、必要性を利用後に判断する。native controlsはどちらのmodeにも表示しない。
- AとBは、buttonを押した時点のmedia `currentTime` へ置く。BはAより後のときだけ保持し、loopは両点が揃ったときだけ切り替える。不正順序は固定文で示し、pathやraw errorは出さない。独自seek、A/B変更、clear、source reset、mode切替では保留中のloop着地を破棄する。
- loop境界は、Practiceかつplayingかつloop ONの間だけ、`requestAnimationFrame` と `timeupdate` の両方から同じcontrollerで観測する。modeはstateに加えて `modeRef` へevent handler内で同期してから切り替え、予約済みcallbackも最初にrefを検査する。effect cleanupだけに依存しない。
- 有効なPractice loopは、そのsourceの `ended` も所有する。Bがmedia durationと一致すると、end-of-media taskは `timeupdate` のあとに `pause` や `ended` を通知できる。所有判定は一時的なplaying、seeking、loop callbackの稼働flagではなく、現在source、Practice、妥当なA・B、loop ONという宣言状態で行う。先にAへseek済みでも、`pause` が先行してもqueueへ渡さず、未観測なら同じ境界controllerでもう一度確認する。loopがOFFのときだけADR 0012の自動次曲へ渡す。
- B到達時は `currentTime = A` とし、mediaがseeking中なら重ねて命令しない。source、A、pending landingが一致する `seeked` だけ着地診断へ反映する。境界超過と着地誤差は可聴精度の保証ではなく、Story 0002と同じ補助観測として表示し、live regionにはしない。
- `AudioFoundationLab` は別mediaとnative controlsを持つ技術検証componentなので、必要なloop controllerを現在のplayerへtest-firstで移したあと削除する。音声セッションの純粋関数は継続利用する。

参考:

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource)
- [HTML Standard: animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)
- [React: `useRef`](https://react.dev/reference/react/useRef)
- [ADR 0005](0005-html-media-audio-validation-controller.md)
- [ADR 0012](0012-listen-queue-and-transport.md)

## Rejected Options（却下した選択肢）

- ListenとPracticeに別々のplayer componentを置く: 操作面は分かれるが、media node、position、play Promise、volumeを引き渡す同期が増え、切替時の無音と競合を生む。
- modeをmedia elementの `key` に含める: Reactが確実に別nodeへ交換するため、現在位置を保つ要件に反する。
- modeをsource effectの依存に入れ、切替時に `load()` する: 同じURLでもresource lifecycleをやり直し、再生中の音を止める。
- Listenへ戻ってもrateとloopを保つ: 再び普通に聴く操作で0.8xや短区間loopが続き、モードの意味を裏切る。
- Listenへ戻るたびにA・Bをclearする: 驚きは少ないが、少し聴き直してから同じ区間へ戻る操作を増やす。点は保持し、loopだけ明示的に再開させる。
- Listen復帰のrate resetに失敗しても画面だけ切り替える: 表示と実音が食い違う。Practiceに留まる方を選ぶ。
- PracticeのままTrackを替えたらListenへ戻す: Track固有状態を安全にresetできるなら、練習を続ける利用者のmode選択まで取り消す理由がない。
- `timeupdate` だけでloopする: backgroundの安全網にはなるが、可視時の通知間隔では短区間の境界超過が大きくなりうる。
- animation frameのeffect cleanupだけでListen復帰を止める: cleanup前に予約済みcallbackが走る窓を閉じられない。
- 任意rate入力を初期画面へ加える: 細かい調整はできるが、候補値で満たせる最初の練習動線と狭幅UIを複雑にする。

## Consequences（結果）

- 利用者は再生中でも停止中でも、音切れ、位置reset、音量変化なしにPracticeへ移り、同じ曲を詳しく聴ける。
- 一つのcomponentがListenとPracticeの両方の操作とloop lifecycleを所有する。別player間の同期は不要になるが、componentの責務とtest量は増える。
- Listen復帰はrateとloopを安全な既定へ戻す一方、A・Bを保持する。Practiceへ戻る操作は短くなるが、loopを再度ONにする一操作が必要である。
- modeRef、stateRef、source identity、play token、pending landingという複数の非描画状態を整合させる必要がある。古いcallbackとPromiseの競合testが継続的に必要になる。
- requestAnimationFrameは非表示時に抑制されうるため、timeupdateを安全網として残す。それでもA-B loopの可聴精度は保証されず、macOS WKWebViewとWindows WebView2の実機評価が残る。
- 曲末をBにしたloopは `ended` を次曲へ渡さないため、通常の自動次曲と明確に排他的になる。loop状態の同期を誤ると曲末で停止し続けるか次Trackへ漏れるので、専用の競合testを維持する。
- load failureとrate failureが同時に起きた場合はload recoveryだけを主操作として見せる。原因を同時表示しない分、rate failureの詳細は失うが、再生不能なsourceを再試行できない状態にはしない。
- presetだけでは、利用者が必要とする細かい速度へ届かない可能性がある。初期利用で不足が分かったときに、入力方法と範囲を別の判断として追加する。
- Practiceのまま次Trackへ進んでもrateとloopは持ち越さない。連続練習には安全だが、各TrackでrateとA・Bを設定し直す操作が必要になる。
