# ADR 0024: 重要な変更では自己説明をRED testより前のゲートにする

## Status

Accepted

## Context（背景）

LoupePlayの作業順序は、Story、ADR、ユビキタス言語、失敗するtest、production実装である。この順序は意図と振る舞いを外へ残せる。一方、Codexが文書を生成し、利用者が承認するだけでも進めるため、両者が目的、所有、失敗境界を同じように説明できるかは観測していない。

すべての変更を同じ深さで確認する必要はない。文言修正や局所的なrefactorまで止めれば、質問はすぐ儀式になる。だが、音源scope、恒久identity、snapshot公開、再生区間、権限、永続dataのような判断は、前提のずれをtestへ固定する前に見つける価値が高い。

## Decision（決定とその理由）

- Storyと必要なADR / ユビキタス言語を用意した後、失敗するtestを書く前に、`実装前理解確認ゲート`の要否を判定する。
- 次のどれかを変える場合は`Required`とする。
  - 利用者が安全な変更を判断するために必要なドメイン概念、状態遷移、システム構造。
  - identifier、data ownership、保存期間、schema、migration、公開単位。
  - 権限、privacy、機密情報、課金、外部service、失敗境界、復旧とrollback。
  - interface、依存方向、交換可能性、複数機能が依存するinvariant。
  - 利用者体験の意味を変え、元へ戻してもdataや意図を回復しにくい判断。
- typo、意味を変えない文言・format、既存判断を変えない局所的な交換可能実装は`Skipped`にできる。迷う場合は、理由を失ったとき安全な変更が難しくなるかで判定し、難しくなるなら`Required`とする。
- `Required`ではCodexが、背景、守る価値とinvariant、採用案と主な却下案、受け入れるrisk、未確定点を先に説明する。必要なら関係を小さな図や例で示す。
- 説明後、利用者自身の言葉を引き出す質問を最大三問行う。質問はそのStoryで荷重を支える目的、判断軸、制約だけに絞り、二択、用語暗記、Codexの文章の復唱、単なる実装許可にしない。
- 依頼文や直前の会話ですでに必要な自己説明がある場合は、それを回答として評価する。確認済みの内容を質問し直さない。
- 回答をStory / ADRのinvariantと照合する。十分に一致すれば`Passed`、ずれがあれば根拠を示して修正し、三問以内で解消できなければ`Blocked`とする。`Passed`または`Skipped`になるまでRED testとproduction実装へ進まない。
- 対象Storyへ`Understanding Gate（実装前理解確認）`を追加し、Status、要否の理由、質問、回答の判断上必要な要約、解消したずれ、残る未確定点を記録する。会話全文や不要な個人情報は保存しない。
- 正本は`docs/development/implementation-understanding-gate.md`、作成入口は`docs/templates/story.md`とする。`AGENTS.md`は必須順序と正本へのlinkだけを持つ。
- このゲートを定義するStory 0015は`Bootstrap`と記録し、導入後に開始する重要Storyから強制する。

## Rejected Options（却下した選択肢）

- 全変更で同じ三問を行う: 局所修正まで止まり、質問の回答が作業開始の合言葉になる。
- 「理解しましたか」「実装してよいですか」と尋ねる: 自分の言葉による説明がなく、前提のずれを観測できない。
- Codexが説明した内容をそのまま復唱させる: 記憶は測れても、利用場面で判断を再構成できるかは分からない。
- StoryとADRがあれば共有理解もあるとみなす: 意図は外部化できるが、人が理解した証拠にはならない。
- 実装後のwalkthroughだけで確認する: ずれた前提がtest、schema、UIへ入った後になり、戻す費用が増える。
- 会話全文をStoryへ保存する: 監査材料は増えるが、判断に不要な文と個人情報が正本へ混ざる。
- 利用者の依頼文に十分な説明があっても定型質問を繰り返す: 観測済みの理解を無視し、ゲートを儀式化する。

## Consequences（結果）

- 重要な変更は、実装開始までに一往復以上増える。利用者の回答が必要な間は、意図的に作業が止まる。
- Codexは質問する前に、選択肢と不利を利用者の判断できる粒度で説明する責任を負う。
- 利用者は細かなcodeではなく、何を守り、なぜ別案を選ばず、失敗時にどの境界を守るかを説明できる状態で実装へ進める。
- 認識のずれを、失敗するtestやproduction codeへ固定する前に発見できる。
- `Required`と`Skipped`の判定には裁量が残る。理由をStoryへ残すことで、過剰な省略と過剰な停止の両方を後から見直せる。
- Storyへ短い記録が増える。会話全文ではなく判断の要約だけに限定し、意図の所在を読む負担を抑える。
- bootstrapの例外はStory 0015だけである。以後の重要変更で自己説明が未完了なら、期限や実装容易性を理由に迂回しない。

## References

- `voice-workbench/AGENTS.md`と`docs/ADR/0090-check-understanding-before-implementation.md`: 概念・意図・全体設計の判断軸を最大三問で確認し、局所変更では省略する先行運用。
- `koji-todo/AGENTS.md`と`docs/quality/investigation-hypothesis-and-understanding-gates.md`: dataの意味、権限、費用、rollback困難性を停止条件にし、観測事実と推測を分ける先行運用。
