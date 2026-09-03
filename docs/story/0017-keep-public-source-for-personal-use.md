# Story 0017: 公開ソースを個人利用のまま保つ

## Context（背景）

LoupePlayのリポジトリはGitHubでpublicとして公開されている。
しかし、publicという設定だけでは、第三者へソースコードの改変や再配布を許諾したことにはならない。
利用者はLoupePlayを自分だけで使うことを望んでおり、第三者による再利用や商用利用を認める必要がない。

`LICENSE`を置かないだけでは、意図的な判断なのか決め忘れなのかを閲覧者が区別できない。
READMEと判断記録に、公開範囲と利用許諾の境界を明記する。

## Definition of Done（完了の定義）

- リポジトリに`LICENSE`を追加しない。
- READMEに、このソースコードをオープンソースとして利用許諾していないことを明記する。
- GitHubの利用規約や適用法令による閲覧とforkの範囲は、独自の利用許諾と区別する。
- 依存ライブラリには、それぞれのライセンスが適用されることを明記する。
- 判断理由、却下案、将来の見直し条件をADRへ記録する。
- PR本文を日本語で記述し、判断と検証結果を反映する。

## To Do（やること）

- [x] 現行README、manifest、依存関係のlicense表記を確認する。
- [x] GitHubの公式文書で、public repositoryに`LICENSE`がない場合の扱いを確認する。
- [x] 判断をADRへ記録する。
- [x] Understanding Gateを`Passed`にする。
- [x] READMEに利用条件がないことを検査し、期待する失敗を確認する。
- [x] READMEへ利用条件を明記する。
- [x] 文書リンク、`LICENSE`の不在、差分、機密情報を検証する。
- [x] PR本文を日本語で作成する。

## Concern（懸念）

- public repositoryでは、GitHubの利用規約により第三者がソースを閲覧し、GitHub上でforkできる。アクセス自体を本人だけに制限するには、repositoryをprivateへ変更する別の判断が必要になる。
- `LICENSE`がなければ一般的なOSSとして再利用できないため、第三者からの利用や貢献は期待しにくい。
- 将来ライセンスを付与すれば、その時点から第三者利用を認められる。ただし、一度付与したライセンスに基づいて取得された権利は、後から単純に取り消せない。
- 依存ライブラリのライセンスはこの判断で変わらない。将来アプリを第三者へ配布する場合は、配布物に必要なnoticeを別途確認する。

## Understanding Gate（実装前理解確認）

- Status: `Passed`
- Reason: public repositoryで第三者へ許す利用範囲を決める判断であり、後からライセンスを取り消しても過去の許諾を回収できないため。
- Questions: 第三者による改変、再配布、商用利用、非公開の派生版をどこまで許すかを問うた。
- User explanation: LoupePlayは自分が使うだけにしたい。
- Misalignment / Resolution: public repositoryではGitHub上の閲覧とforkが残る。以前にpublicで問題ないと確認した意図と合わせ、sourceは閲覧可能なまま、第三者へ追加の利用許諾を与えない境界として記録した。
- Unresolved: sourceへのアクセス自体も本人だけに制限したくなった場合は、repositoryのprivate化を別途判断する。

検証結果は、このStoryの完了時にPR本文へ記録する。
