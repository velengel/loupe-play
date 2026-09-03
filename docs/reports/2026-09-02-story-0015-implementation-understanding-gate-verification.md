# Story 0015 検証記録: 実装前理解確認ゲート

## 対象

- Story: [0015](../story/0015-explain-critical-understanding-before-implementation.md)
- ADR: [0024](../ADR/0024-require-self-explanation-for-critical-implementation.md)
- 運用の正本: [実装前理解確認ゲート](../development/implementation-understanding-gate.md)
- branch: `feature/implementation-understanding-gate`
- 検証日: 2026-09-02

## 結果

ゲートは、Story / ADR / 用語の後、RED testの前へ入った。重要変更ではCodexが判断材料を先に説明し、利用者自身の言葉による最大三問の回答をStory / ADRと照合する。局所変更は理由付きの`Skipped`、ずれが残れば`Blocked`になる。

| 観点 | 結果 | 根拠 |
| --- | --- | --- |
| 必須順序 | PASS | `AGENTS.md`でStory → ADR / 用語 → 理解確認 → RED test → 実装の順になった。 |
| 適用範囲 | PASS | ドメイン概念、data ownership、schema、権限、費用、外部service、失敗境界、rollback、交換可能性を`Required`の対象にした。 |
| 儀式化の抑止 | PASS | 局所変更の`Skipped`、既出回答の再利用、二択・暗記・単なる許可質問の禁止を明記した。 |
| 停止条件 | PASS | `Passed`または`Skipped`までRED testを始めず、三問以内でずれが解けなければ`Blocked`にする。 |
| 永続記録 | PASS | Story templateにStatus、Reason、Questions、User explanation、Misalignment / Resolution、Unresolvedを置いた。 |
| 機械契約 | PASS | `tests/implementation-understanding-gate-contract.test.ts`が順序、語句、正本、template、README、用語集の接続を検証した。 |

## 先行運用との比較

`voice-workbench/AGENTS.md`とADR 0090は、概念、意図、所有、失敗境界、security、cost、replaceabilityを変える計画で、根拠と選択肢を説明してから最大三問を行う。局所的で交換可能な実装は省略する。

`koji-todo/AGENTS.md`と`docs/quality/investigation-hypothesis-and-understanding-gates.md`は、dataの意味、履歴、権限、費用、rollback困難性を停止条件にし、質問を単なる実装許可にしない。

LoupePlayは二つの共通部分を採った。ただし既存のStory → ADR → test firstを置き換えず、ADR / 用語の後、RED testの前へ一つの判定として差し込んだ。

## Test first

production側の文書を変更する前に、workflow contract testを追加した。初回は四件すべて失敗した。

- `AGENTS.md`に正本へのlinkがなく、ゲートがADRとRED testの間に存在しなかった。
- 最大三問、自己説明、`Passed / Skipped / Blocked`が必須ルールになっていなかった。
- 運用の正本文書とStory templateが存在しなかった。
- READMEからゲートへ到達できなかった。

運用本体の追加後、同じ四件が通った。

## 検証結果

- focused contract: 1 file / 4 tests PASS
- frontend全体: 34 files / 241 tests PASS
- `npm run lint`: PASS
- `npm run build`: PASS、45 modules transformed
- `git diff --check`: PASS
- staged credential pattern scan: 該当なし
- Rust test / check: NOT RUN。Rust code、Cargo manifest、Tauri権限を変更していないため対象外とした。

## 証拠の限界

contract testは、文書の所在、入口、順序、status、記録欄を検出できる。将来の質問がそのStoryで本当に重要な判断へ絞られているか、利用者の説明がinvariantを捉えているかは、文字列の存在だけでは判定できない。

この部分はStoryとADRを根拠にCodexが照合し、合っている点とずれた点を利用者へ返す。`Passed`を自動生成された合言葉にはしない。

## Surprise & Discovery

二つの先行運用は、質問数を増やすことで理解を厚くしてはいなかった。止める変更を選び、質問を最大三問へ削っていた。LoupePlayでも重要なのは質問の常設ではなく、Track identityやLibrary Publicationのように、理由を失うと安全な変更が難しくなる境界を選ぶことである。
