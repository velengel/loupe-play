# Story 0015: 重要な境界を自分の言葉で説明してから実装する

## Context（背景）

LoupePlayは、Storyで要求を、ADRで判断理由を、テストで期待する振る舞いを残してきた。記録は増えた。だが、記録が存在することと、その変更で何を守るのかを利用者とCodexが同じように理解していることは一致しない。

このずれがTrack identity、Library Publication、音源scope、再生区間のような境界へ入ると、テストは誤った前提を精密に固定してしまう。voice-workbenchとkoji-todoには、重要な概念や不可逆な判断を実装する前に、利用者自身の言葉で理解を確かめるゲートがある。LoupePlayにも、現在のStory → ADR → test firstを壊さず、その間へ同じ役割を置く。

## Definition of Done（完了の定義）

- `AGENTS.md`の必須順序を、Story → ADR / 用語 → 実装前理解確認ゲート → RED test → 実装として明示する。
- ゲートが必要な重要変更と、省略できる局所変更を、判断例とともに一つの正本文書へ定義する。
- Codexが先に目的、守る境界、選択肢、受け入れる不利を説明し、その後に利用者が自分の言葉で答える質問を最大三問だけ行う。
- 二択、暗記、「理解しましたか」「実装してよいですか」だけの確認を合格証拠にしない。
- 利用者が依頼文ですでに同じ内容を説明している場合は、その説明を回答として使い、同じ質問を繰り返さない。
- `Passed`または理由付きの`Skipped`になるまで、失敗するtestとproduction実装を始めない。ずれが残る場合は`Blocked`としてStory / ADRを直す。
- 判定、理由、利用者の説明の要約、残った不一致を、対象Storyの`Understanding Gate（実装前理解確認）`へ残す。
- workflow contract testを先に失敗させ、`AGENTS.md`、正本文書、Story template、README、ユビキタス言語の接続を検証する。
- 変更に合ったtest、build、secret-pattern check、`git diff --check`が通る。

## To Do（やること）

- [x] voice-workbenchとkoji-todoの現行ゲートを一次資料として比較する。
- [x] LoupePlayで止める変更、省略する変更、質問と記録の境界をADRへ記録する。
- [x] 新しい用語をユビキタス言語へ追加する。
- [x] workflow contractの失敗するtestを書く。
- [x] 実装前理解確認ゲートの正本文書とStory templateを作る。
- [x] `AGENTS.md`の必須順序とREADMEの開発ルールを更新する。
- [x] contract test、全test、lint、build、文書link、secret patternを検証する。
- [x] 検証記録を残し、作業境界でcommitする。

## Concern（懸念）

- 全変更へ定型質問を課すと、回答が儀式になり、重要な境界が埋もれる。省略にも理由を要求するが、局所的で交換可能な修正は止めない。
- 利用者に実装識別子を暗記させると、プロダクト判断ではなく知識試験になる。問うのは価値、境界、選ばなかった案、失敗時に守るものとする。
- Codexが先に十分な説明をせず回答だけを求めると、責任を利用者へ移してしまう。根拠とtrade-offの説明を質問より先に置く。
- 会話の全文をStoryへ複製すると、文書が読みにくくなり、不要な個人情報も残りうる。説明は判断に必要な要約だけを記録する。
- ゲート導入そのものにはまだゲートが存在しない。Story 0015とADR 0024をbootstrap記録とし、最初の適用対象はこの変更後に始める重要Storyとする。

## Understanding Gate（実装前理解確認）

- Status: `Bootstrap`
- Reason: このStoryがゲート自体を導入するため、導入前の規則を遡及適用しない。
- Shared understanding: 利用者の依頼から、対象は全実装詳細ではなく「重要な部分」であり、実装前に利用者自身が理解を説明すること、voice-workbenchとkoji-todoと同種の停止条件をLoupePlayへ持ち込むことを確認した。
- First enforced use: Story 0015完了後に開始する、適用条件へ該当するStory。
