# ADR 0012: 可視ライブラリ順と再生意図で Listen を進める

## Status

Accepted

## Context（背景）

Story 0002 の音声基盤は、一つの Track の再生、seek、速度、A-B ループを観察できる。Story 0003 のライブラリは、Track identity と走査時点の情報を分け、利用不可の Track も黙って消さずに表示する。Listen へ前後曲と自動次曲を加えるには、「次」の順番、利用不可 Track の扱い、手動移動で再生を続けるか、非同期 event が遅れたときの所有者を決めなければならない。

`HTMLMediaElement.play()` は Promise を返し、source変更や停止と競合して拒否されうる。`ended` も task として通知される。volume は0から1の範囲外を受け付けない。画面側が source と操作意図を識別せずに event の到着順だけを信じると、古い音源が現在曲を進めたり、停止したつもりの次曲が再生されたりする。

## Decision（決定とその理由）

- 再生キューは、最新の表示中 Library Snapshot から導出する。access が `granted` で presence が `present` の Track だけを含める。再接続が必要な一覧、`missing`、`unknown` は見せ続けるが、再生順には入れない。
- キュー順は LibraryTree と同じにする。各階層で直下 Track を relative path 順に並べ、その後、名前順の子folderを depth-first でたどる。`snapshot.tracks` やDB rowの偶然の順を契約にしない。一つの純粋関数から画面順と隣接 Track を確認できるようにする。
- 現在位置は配列indexではなく Track identity で解決する。再走査で同じTrackのmetadataやpathが更新されても隣接関係を再計算でき、現在Trackが利用不可になった場合は既存の選択契約どおりplayerを閉じるためである。
- 前buttonは常に一つ前、次buttonは常に一つ次のTrackへ移る。数秒再生済みなら先頭へ戻る慣習、末尾から先頭へのwrap、repeat、shuffleは採用しない。
- 手動の前後移動は直前の再生意図を引き継ぐ。再生中なら新しいmediaが再生可能になった後に一度だけ `play()` を要求し、一時停止中なら0秒で止めておく。ライブラリ一覧からの明示選択と同じTrackの再選択は、一時停止状態で開く。
- `ended` は同じsourceについて一度だけ処理する。次Trackがあれば、0秒からの再生意図を付けて選ぶ。末尾なら現在Trackを終了位置で停止させる。読込失敗や `play()` 拒否では自動skipしない。
- Listen component と transport DOM は Track 変更を越えて保つ。media elementだけをsource identityで交換し、位置、速度、A-B、診断値、Track固有errorを初期化する。音量は Listen component の0〜1の状態として保持し、新しいmediaへ毎回適用する。アプリ再起動を越える永続化はしない。
- source変更には単調増加のrequest identityを付ける。event handlerとended処理は、自分が開始したsource identityと現在のidentityが一致するときだけ反映する。`play()` Promiseには別の単調増加tokenを付け、source変更、pause、ended、load failure、再読込で旧tokenを無効化する。自動再生要求もrequestごとに一度だけ消費する。
- 再生意図は、media eventから遅れて分かる再生状態とは別にsourceごとに追跡する。未解決の `play()`、`pause` event待ち、次音源のloading中でも、連続した前後移動へ直前の利用者意図を渡すためである。media load failureは遅れて届いた同じsourceの `play()` rejectionより優先し、再読込の導線を消さない。
- 明示的な一覧選択だけ、Listen の再生buttonへfocusを移す。前後buttonは押したbuttonのfocusを保ち、自動次曲はfocusを変更しない。loading中の再生buttonと境界上の前後buttonは `aria-disabled` とhandler guardで操作を止め、focus対象から外さない。seekは値がない間だけnative `disabled`にする。buttonとnative `input type="range"` を使い、独自ARIA sliderは作らない。seekには現在時刻と総時間の分かる accessible value、volumeには割合の可視labelを与える。
- live regionは現在曲の変更だけに使う。loading、ready、時刻、音量、playing状態は繰り返し読み上げず、errorだけをalertにする。再読込中もretry buttonを同じDOMに残し、そのbuttonのfocusを奪わない。
- Listen は custom controls に一本化する。`audio[controls]`、5秒移動、速度、A-B、診断値を同時に表示しない。後者は同じ音声セッションを使う Practice Story で戻す。
- 読込と再生の失敗文は分類済みの固定文にし、raw error、asset URL、絶対pathを画面とlogへ出さない。再読込は現在Trackを保ち、同じ音量を再適用する。

参考:

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html)
- [WAI-ARIA Authoring Practices: Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- [React: `useRef`](https://react.dev/reference/react/useRef)
- [ADR 0005](0005-html-media-audio-validation-controller.md)

## Rejected Options（却下した選択肢）

- `snapshot.tracks` の配列順をそのまま再生する: persistenceや走査の都合で変わり、画面に見える順と一致する保証がない。
- missing または unknown を自動で飛ばし続ける: 利用不可を隠し、壊れたTrackが続くと停止理由と現在地が分からなくなる。最初からqueueへ含めないが、選んだTrackのload失敗はその場で止める。
- 末尾で先頭へ戻る: 連続再生はできるが、repeatの選択をしていない利用者の意図を推測する。repeatは別機能として扱う。
- 前buttonを「一定秒数より後なら曲頭」と兼用する: 一般的な慣習ではあるが、前Trackへ移る要件と操作結果が時間で変わる。最小Storyでは明示的な隣接移動に固定する。
- Trackごとにplayer component全体をremountする: 古いeventをDOM寿命で隔離できるが、音量、transportのfocus、再生継続意図まで失う。
- 同じmedia elementの `src` だけを上書きする: transportは残るが、旧resourceのeventと新resourceのeventをDOM identityで分けられない。media elementだけを交換し、handlerでもsource identityを検査する。
- 音量をnative controlsへ任せる: UIが二重になり、element交換後の値もブラウザ依存になる。Listenの状態を正とする。
- load失敗を自動skipする: 手を離して聴ける可能性は増えるが、連続失敗が利用者の選択なしにライブラリを走査し続ける。初期実装は現在曲で止める。
- 音量をSQLiteまたはlocalStorageへ保存する: 再起動後も便利だが、設定のscopeと初期値を別に決める必要がある。このStoryでは実行中だけ保持する。

## Consequences（結果）

- 表示順と再生順が揃い、利用不可 Track は一覧に残したまま安全に除外できる。
- source変更のたびにmedia elementは新しくなるが、Listenの音量とtransportは残る。旧eventと旧Promiseを二重に防ぐ識別コードが増える。
- mediaの現在状態に加えて再生意図を保持するため、同期する状態が一つ増える。`play()`、pause、load failure、ended、source変更の順序を競合テストで固定しなければならない。
- 自動次曲はmediaが再生可能になるまで待つため、Track間に無音時間が生じる。gapless再生は保証しない。
- browserの自動再生制約やcodec失敗で連続再生が止まることがある。現在曲と固定エラーを残すため、原因を見失わず手動で再試行できる。
- 音量値0〜1をmediaへ適用できても、OS側の音量、mute、volume lock、可聴出力までは保証しない。desktop実機証拠が別に要る。
- 自動遷移がfocusを奪わないため、現在曲の視覚表示だけが変わる。支援技術へは現在曲の変化を短いstatusで伝え、長いmetadataを繰り返し読み上げない。
- Practiceへ移るときはmediaとAudio Sessionを共有し、Listenで隠した速度・loop操作を再び出す必要がある。モード切替時にelementを作り直さない設計が次Storyの制約になる。
