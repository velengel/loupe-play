# Story 0012: メモの時間を読み分け、ヘルプから迷いを解く

## Context（背景）

メモ一覧は作成日時をISO 8601の生値で表示している。秒、小数秒、timezoneまで正確ではあるが、普段の利用で知りたいのは「いつ頃書いたか」であり、機械保存の精度ではない。長い時刻文字列が本文や操作より目立ち、320pxではカードの横幅も使う。

もう一つの時間が隠れている。Listening Noteは一回のPlayEvent、つまり曲中の連続再生区間に属する。しかし画面にはメモの作成日時しか出ず、曲のどこを聴いていた時の記録か分からない。Track Noteは曲全体、Listening Noteは再生区間、Markerは一点の時刻という違いも、画面だけでは読み取りにくい。

LoupePlayにはまとまったヘルプがない。機能を増やすほど、ListenとPractice、三種類のメモ、ローカル保存の境界を利用者が推測しなければならなくなる。このStoryでは、メモの二つの時間を分け、右上の`?`から最小限のヘルプを開けるようにする。チュートリアル、設定画面、外部ドキュメント、利用状況に応じて変わるヘルプまでは広げない。

## Definition of Done（完了の定義）

- Track NoteとListening Noteの作成日時は、利用者のlocal timezoneで年月日・時・分まで表示し、秒、小数秒、timezone記号を見せない。
- 省略しても`time`要素の`dateTime`には保存済みISO値を保ち、機械可読性を失わない。
- Listening Noteは親PlayEventの開始位置と、確定済みなら終了位置を「再生区間」として表示する。終了位置が未確定なら「開始位置から」と示す。
- Listening Noteの再生区間の先頭を選ぶと、現在のTrackをその位置へ移せる。Track Noteは曲全体なので位置操作を持たない。
- 既存のListening Noteもschema変更なしにPlayEventの位置を読み出せる。path、source URL、内部IDは画面へ出さない。
- ヘッダー右上に44px以上の`?`ボタンがあり、accessible nameから「ヘルプを開く」と分かる。
- ヘルプはmodal `dialog`として開き、背景を操作不能にする。開いた時は見出しへfocusし、Escapeまたは閉じるbuttonで閉じ、focusを`?`へ戻す。
- ヘルプは「まず聴く」「聴き直す」「メモを使い分ける」「保存について」の順で、画面名、主要操作、用語を一通り説明する。重複する前置きや網羅的な仕様列挙は置かない。
- 320pxとワイド画面でmodal、長いNote本文、再生区間、操作が横方向へpage overflowしない。modal本文は画面内で縦scrollできる。
- Noteの日時・再生区間、seek、dialogのopen / close / focus、responsive layoutを、実装前に失敗するtestで固定する。
- frontend test、lint、build、Rust test、Rust format / lint / check、secret-pattern check、`git diff --check`が通る。
- 320pxとワイド幅でNote一覧とヘルプを実描画し、検証記録へ証拠と未検証事項を分けて残す。

## To Do（やること）

- [x] ヘルプ文章、手順、modal dialogの一次情報を調査する。
- [x] 日時の表示粒度、Listening Noteの再生区間、seek、ヘルプ構造をADRに記録する。
- [x] 作成日時、再生区間、dialog操作、狭幅layoutの失敗するtestを書く。
- [x] Note repositoryから親PlayEventの開始・終了位置を安全に返す。
- [x] Note一覧の日時と再生区間を再設計する。
- [x] ヘッダーの`?`と、最小限の構造化ヘルプmodalを実装する。
- [x] ユビキタス言語とREADMEを更新する。
- [x] 自動検査、320px / ワイド幅の実描画、release buildを検証記録へ残す。

検証結果は[Story 0012 検証記録](../reports/2026-09-02-story-0012-readable-note-context-and-help-verification.md)に分けて残す。

## Concern（懸念）

- Listening NoteはPlayEvent全体に属し、Noteを書いた瞬間の一点を保存するものではない。区間の先頭・末尾を、Note固有のtimestampのように誤解させない表現が必要である。一点へ残す用途はMarkerとして説明する。
- 再生中のPlayEventは終了位置がまだない。存在しない末尾を現在位置で補わず、「開始位置から」として未確定のまま見せる。
- 作成日時はlocal timezoneで表示するため、同じDBでもOSのtimezone設定が変われば見え方が変わる。保存値と並び順はUTCのISO値のまま維持する。
- HTML `dialog`はfocus制御と背景のinert化を簡単にするが、test環境の実装差がある。製品をcustom modalへ寄せず、test側で必要なDOM APIだけを再現する。
- ヘルプは増やすほど探しにくく、実装とずれやすい。操作開始、画面の役割、三種類のメモ、ローカル保存に限定し、詳細仕様の写経にしない。
- `?`だけでは意味を読めない利用者がいる。見た目は記号でも、buttonのaccessible nameとtooltipは「ヘルプを開く」と明示する。
