# AGENTS.md

このファイルは `loupe-play` で作業する Codex と開発者の共通ルールである。より深い階層に `AGENTS.md` または `AGENTS.override.md` がある場合、その範囲では近いファイルを優先する。

## 必須の作業順序

1. 変更を始める前に `docs/story/` へ Story を作る。
2. Story には `Context（背景）`、`Definition of Done（完了の定義）`、`To Do（やること）`、`Concern（懸念）` を書く。
3. 判断を実装へ反映する前に `docs/ADR/` へ ADR を作る。ADR には `Context（背景）`、`Decision（決定とその理由）`、`Rejected Options（却下した選択肢）`、`Consequences（結果）` を書き、受け入れるリスクとデメリットも隠さない。
4. 新しい用語や意味の変更は `docs/ubiquitous-language.md` に反映する。各語には見出し語、必要な場合だけ同義語、意味、使われ方、参考リンクを記す。
5. StoryとADRの判断を材料に、[実装前理解確認ゲート](docs/development/implementation-understanding-gate.md)の要否を判定し、対象Storyへ記録する。
6. ゲートが`Required`なら、Codexが根拠とtrade-offを説明した後、利用者自身の言葉で答える質問を最大3問行う。`Passed`になるまで次へ進まない。局所変更は理由を記録して`Skipped`にでき、ずれが残る場合は`Blocked`にする。
7. `Passed`または`Skipped`の後、コードの実装より先に期待する振る舞いを表すテストを書く。失敗を確認してから、通すための最小の実装へ進む。
8. 実装後はテスト、型検査を含むビルド、差分検査、機密情報検査を行う。完了した To Do は Story で更新する。

ドキュメントだけの変更にはアプリケーションテストを増やさなくてよい。ただし、リンク、差分、書式など、その変更に合った検証は行う。

## 実装前の理解確認

ドメイン概念、状態遷移、identifier、data ownership、schema、権限、privacy、費用、外部service、失敗境界、rollback、interface、交換可能性を変える場合は、実装前理解確認ゲートを`Required`とする。単なるtypo、意味を変えない文言・format、既存判断を変えない局所的で交換可能な実装だけなら`Skipped`にできる。迷う場合は`Required`を選ぶ。

Codexは質問の前に、目的、守るinvariant、採用案と主な却下案、受け入れる不利、未確定点を説明する。質問は最大3問とし、「理解しましたか」「実装してよいですか」、二択、用語暗記、説明の復唱だけで済ませない。

依頼文や直前の会話に、目的、判断軸、制約について利用者自身の言葉による説明がすでにあれば、その内容を回答として評価する。同じ質問を繰り返さない。判定と説明の要約はStoryの`Understanding Gate（実装前理解確認）`へ残し、会話全文や不要な個人情報は保存しない。

## 開発コマンド

- 依存関係の導入: `npm install`
- 開発サーバー: `npm run dev`
- テスト: `npm test`
- 本番ビルドと型検査: `npm run build`

コマンドを増やした場合は `package.json` と `README.md` を同時に更新する。

## コミット

作業の区切りごとにコミットする。メッセージは次の三段構成にする。

```text
<prefix>: <概要を1行で>

why: <必要だった理由>

what: <実際に変えたもの>
```

`prefix` は変更の性質に合わせて `docs`、`test`、`feat`、`fix`、`refactor`、`chore`、`build`、`ci` から選ぶ。テストファーストを履歴に残すための失敗中の `test:` コミットは許容するが、直後の実装コミットで成功へ戻す。

コミット前には、少なくとも次を確認する。

- `git diff --check`
- `git diff --cached --name-only`
- `git diff --cached`
- 変更に対応するテストとビルド
- staged ファイルに秘密鍵、API キー、トークン、パスワード、実値入りの接続情報がないこと

## 機密情報

トークン、API キー、パスワード、秘密鍵、実値入りの `.env` や `.npmrc` は、理由を問わずコミットしない。サンプルが必要なら `.env.example` に無効なプレースホルダーだけを書く。

機密値を見つけた場合は、出力やドキュメントへ転記せず、staged 状態から外してユーザーへ報告する。すでに外部へ共有された可能性がある値は、ファイルから消すだけで安全になったと判断しない。

staged ファイルの代表的な credential pattern は、次の順序でファイル名だけを検査する。出力が空であることを確認する。

```bash
git grep --cached -lI -E \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'gh[pousr]_[A-Za-z0-9_]{20,}' \
  -e 'sk-[A-Za-z0-9]{20,}' \
  -e '-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----' \
  -e '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*[^[:space:]]{12,}' \
  -- .
```

これは既知 pattern の補助検査であり、`git diff --cached` の目視確認を置き換えない。

## 完了記録

実装中に初めて分かった事実や判断は `Surprise & Discovery` として完了報告に含める。リポジトリ固有の詳細は `docs/reports/`、Story、ADR、またはこのファイルへ残し、グローバルメモリには検索用の短いフックと正本の所在だけを渡す。
