# ADR 0021: メモの時間文脈とtask-firstヘルプを分けて示す

## Status

Accepted

## Context（背景）

Noteの保存日時はISO 8601で保持している。現在の画面はその値を加工せず表示するため、`2026-09-02T04:20:09.598Z`のように、利用者が区別しない秒、小数秒、timezoneまで見せている。記録の新旧を読むには年月日・時・分で足りる一方、Listening Noteで本当に知りたい曲中位置は出ていない。

Listening NoteはNoteを書いた瞬間の一点ではなく、確認済みPlayEventへ属する。PlayEventは開始・終了位置を持ち、Practiceのloop中ならA-B区間も持つ。既存rowから曲中の文脈を復元できるため、Note固有の位置を新しく捏造したり、過去rowを移行したりする必要はない。

ヘルプは情報を足せばよいわけではない。利用者は仕様を読むためではなく、曲を開く、聴き直す、メモを選ぶというtaskを進めるために開く。公式のcontent guidanceは、利用者が必要とすることだけを、taskが分かる短い見出しと少数の手順で示すよう勧めている。modalは背景操作、focus、Escape、呼出元への復帰を一続きで満たす必要がある。

## Decision（決定とその理由）

- Noteの作成日時は`Intl.DateTimeFormat`を使い、利用者のlocal timezoneで`年/月/日 時:分`まで表示する。秒、小数秒、`Z`は見せず、保存済みISO値は`time[dateTime]`へ残す。相対時間にはしない。
- Track Noteの時間情報は「記録」と表示する。Track Noteは曲全体へ属するため、曲中位置やseek操作を加えない。
- Listening Note repositoryは、親PlayEventの`start_position_ms`、`end_position_ms`、`loop_start_ms`、`loop_end_ms`を既存joinとmutation後のreadbackで返す。値は0以上の整数、loopは両端がそろい開始より終了が大きい場合だけ受け入れる。
- Listening Noteは、loopが有効だったPlayEventなら「ループ区間 A–B」、それ以外は「再生区間 start–end」と表示する。終了位置がNULLなら「再生区間 startから」とし、現在位置を末尾として補完しない。
- 区間表示はbuttonにし、loopならA地点、それ以外はPlayEvent開始位置へseekする。accessible nameには移動先の時刻とListening Noteの文脈を含める。再生中のseekがPlayEventを分ける既存境界は維持する。
- ヘルプ入口はapp header右上の44px以上の`?` buttonとする。見た目は記号だけでも、`aria-label`と`title`は「ヘルプを開く」とする。local保存statusと同じheader actions領域に置く。
- modalはcustom `role="dialog"`ではなくHTML `dialog`を`showModal()`で開く。背景のinert化、Tab sequence、Escape、focus復帰をbrowser標準へ委ねる。開いた時は`tabIndex={-1}`の見出しへfocusし、構造化された複数sectionを一つの説明文字列として読ませないため`aria-describedby`は付けない。
- ヘルプ本文は「まず聴く」「聴き直す」「メモを使い分ける」「保存について」の四sectionに限定する。最初の二つは短い手順、メモは用語と使い分け、保存はlocal-onlyと選択scopeだけを説明する。
- 見出しと手順はtaskを先頭に置く。「画面について」のような抽象見出し、実装用語、全buttonの列挙、同じ説明の言い換えは置かない。
- dialogはviewport内の最大幅と最大高を持ち、本文だけを縦scroll可能にする。320pxでは外周余白を保ち、見出し、用語、button labelは横overflowさせない。

## Rejected Options（却下した選択肢）

- ISO 8601の保存値をそのまま表示する: 正確だが、記録を見分ける用途に不要な秒、小数秒、timezoneが本文より目立つ。
- 「5分前」のような相対時間だけを表示する: 直近は読みやすいが、過去のNoteを比較すると意味が変わり、再描画用timerも必要になる。
- Listening Noteへ新しい一点の`position_ms`を追加する: 書いた瞬間へ戻れるが、既存の「一回の再生区間へ属する」意味を変え、Markerと重なる。まず既に保存済みのPlayEvent文脈を見せる。
- PlayEvent開始位置だけを常に表示する: 単純だが、通常再生の終点とPracticeのloop範囲を隠し、どこを聴いたかという問いへ十分に答えない。
- Listening Noteの区間を文字だけにする: 場所は読めても聴き直すにはseek sliderを操作し直す必要がある。既存のMarkerと同じく、位置表示を移動の入口にする。
- 画面ごとの全操作を長いmanualとして載せる: 一通りは網羅できるが、困っているtaskを探しにくく、UI変更のたびに古くなる。
- custom overlayへARIA属性とfocus trapを手作業で実装する: styling自由度は高いが、背景のinert化、Escape、focus復帰を重複実装する。対応済みWebViewではnative `dialog`の方が境界を少なくできる。

## Consequences（結果）

- 作成日時は短くなり、曲中の位置情報と役割が競合しない。OSのtimezoneを変えると表示時刻は変わるが、保存値と並び順は変わらない。
- 過去のListening Noteにもmigrationなしで再生区間が現れる。適用済みmigrationのbyte列を変更せず、親PlayEventとの関係をそのまま使える。
- loop中のListening NoteはA-Bを優先して見せるため、周回後にend位置がstart位置より前へ戻っても意味が崩れない。ただしloop回数はPlayEventにないため表示しない。
- open中のPlayEventへNoteを書いた直後は終了位置がNULLである。同じ画面を開いたままeventが閉じてもNote readbackは自動更新せず、次のloadまで「開始位置から」と表示されうる。
- 区間buttonを再生中に押すと手動seekになり、既存方針どおりPlayEventが分割される。Note閲覧が履歴へ影響しうることを受け入れる。
- native `dialog`により背景操作とfocusは揃うが、WebView実装差はrelease appで確認する必要がある。見出しfocus、close、Escape、focus復帰はcomponent testでも固定する。
- ヘルプは短く探しやすい一方、エラー回復、検索仕様、履歴の内部条件などは説明しない。通常操作で迷う内容が新しく見つかった時だけsection追加を再検討する。

## References

- [ONS Content Style Guide: Plain language](https://service-manual.ons.gov.uk/content/writing-for-users/plain-language)
- [Microsoft Style Guide: Writing step-by-step instructions](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions)
- [W3C Technique H102: Creating modal dialogs with the HTML dialog element](https://www.w3.org/WAI/WCAG22/Techniques/html/H102.html)
- [WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [ADR 0015](0015-own-notes-by-track-and-confirmed-play-event.md)
- [ADR 0017](0017-record-contiguous-playback-segments.md)
- [ADR 0018](0018-treat-applied-migration-text-as-immutable.md)
