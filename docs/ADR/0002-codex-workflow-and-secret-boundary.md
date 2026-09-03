# ADR 0002: Codex の作業規約と機密情報の境界をリポジトリに置く

## Status

Accepted

## Context（背景）

ユーザーレベルの Codex 設定だけでは、このリポジトリが要求する Story、ADR、テストファースト、コミット形式を、別の環境や将来のセッションへ確実に渡せない。反対に、ユーザー個人のモデル選択やコマンド許可までリポジトリへ複製すると、個人設定とプロジェクトの責任が混ざる。

機密情報にはもう一つ境界が要る。追跡対象から除外するだけでなく、Codex が起動したコマンドへ認証情報らしい環境変数を不用意に渡さない設定が必要である。

## Decision（決定とその理由）

- 永続的なリポジトリ規約はルートの `AGENTS.md` に置く。Codex はプロジェクトルートから作業ディレクトリまでの `AGENTS.md` を読み、近い階層の指示を優先するためである。
- `.codex/config.toml` では `shell_environment_policy.ignore_default_excludes = false` だけを設定する。名前に `KEY`、`SECRET`、`TOKEN` などを含む環境変数の既定除外を有効にする。
- モデル、承認ポリシー、sandbox、ユーザーレベルの `prefix_rule` はリポジトリで上書きしない。利用環境や管理ポリシーに属するためである。
- `.env`、`.npmrc`、秘密鍵と証明書コンテナ、生成物を `.gitignore` から除外する。ローカル音源の拡張子は、大小文字を区別する Git 環境でも WAV、MP3、FLAC の全表記を遮断する。コミット前には staged 差分と `git check-ignore` の実動作を別途検査する。

参考:

- [OpenAI Docs: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md)
- [OpenAI Docs: Config basics](https://learn.chatgpt.com/docs/config-file/config-basic.md)
- [OpenAI Docs: Rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md)

## Rejected Options（却下した選択肢）

- ユーザーレベルの指示だけに置く: 他の利用者や別環境へリポジトリ固有の約束が伝わらない。
- `.codex/` をすべて無視する: 安全な共通設定まで共有できなくなる。
- ユーザーレベルのコマンド許可をプロジェクトへコピーする: 個人の許可範囲をチームの既定へ広げ、環境差による誤動作を招く。
- `.gitignore` だけに頼る: 既知のファイル名しか防げず、ソースやドキュメントへ貼られた値を検出できない。

## Consequences（結果）

- 新しい Codex セッションは、リポジトリ固有の作業順序と検証条件を自動で読める。
- project config は、利用者がリポジトリを信頼した場合だけ読み込まれる。未信頼の環境では `AGENTS.md` とコミット前検査が残る防御線になる。
- 認証情報らしい名前の環境変数が必要なコマンドは、そのままでは値を受け取れない場合がある。必要性と送信先を確認したうえで、ユーザーの明示的な許可を得る。
- `.gitignore` と環境変数フィルターは万能ではない。staged 差分の確認と、漏えいが疑われる値の失効・再発行という運用は残る。
