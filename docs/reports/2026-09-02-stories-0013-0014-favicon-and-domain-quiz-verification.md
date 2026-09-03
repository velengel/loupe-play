# Stories 0013–0014 検証記録: faviconと設計判断quiz

## 対象

- Story 0013: アプリアイコンをブラウザタブにも灯す
- Story 0014: LoupePlayの境界を七つの判断で確かめる
- 検証日: 2026-09-02
- branch: `feature/file-picker-affordance`

## 結果

| 対象 | 結果 | 根拠 |
| --- | --- | --- |
| faviconの正本 | PASS | `index.html`が`src-tauri/icons/app-icon.svg`を`image/svg+xml`、`sizes="any"`で参照した。 |
| faviconのproduction解決 | PASS | `npm run build`がhash付きSVGを生成し、正本と生成物のSHA-256が一致した。 |
| quizの内容契約 | PASS | 七問、選択四問、穴埋め三問、回答位置、個別feedback、根拠行、IME guard、reduced motionをstatic verifierで確認した。 |
| quizの1280px描画 | PASS | Chromium headless shellの画像を目視し、情報階層、単一問題、選択肢の判読性を確認した。 |
| quizの320px描画 | PASS | 初回描画で横切れを検出し、responsive幅を`calc`と`max-width`へ直した後の再描画で解消を確認した。 |
| quizの全回答操作 | UNVERIFIED | Git管理外scriptからChrome remote debuggingを使う自動操作は安全審査で却下された。迂回せず、一時scriptを削除した。 |
| quizの通常Chrome表示 | PASS | 最終HTMLを通常のGoogle Chromeへ渡して開いた。 |

## Test first

1. `tests/favicon-contract.test.ts`と`tests/local-learning-artifacts.test.ts`を先に追加した。favicon linkと`.mydocs/` ignoreがないため、二件の失敗を確認した。
2. `scripts/verify-loupe-play-domain-quiz.mjs`を先に追加した。指定HTMLが存在しないため、意図した失敗を確認した。
3. 320pxの初回描画で横切れを発見した。`calc`による余白と明示的な`max-width`を要求する検査を先に追加し、既存HTMLへの失敗を確認してから幅を修正した。

## faviconの生成物

- 正本: `src-tauri/icons/app-icon.svg`
- 開発時の参照: `/src-tauri/icons/app-icon.svg`
- build時の参照: Viteが生成したhash付きSVG
- 正本とbuild assetのSHA-256: `dfd5dbb37f4c1edaa2ae9ae96a65b3209e2982c5d1251f2b086f1bf99c7c74c9`

ブラウザ専用SVG、PNG fallback、Web App Manifestは増やしていない。デスクトップとブラウザで、編集する図柄を一つに保つ。

## quizの検証境界

成果物は`.mydocs/loupe-play-domain-decisions-quiz.html`に置き、Gitへcommitしない。repositoryにはStory、ADR、用語、static verifier、この記録だけを残す。

- 最終HTML: 1,003行、38,487 bytes
- SHA-256: `b84de46c1c705c1eceda6a89ca4fb9f51638977c02159af87c80359ab2a9e621`

static verifierはquiz内のscriptを実行せず、DOMと`application/json`だけを読む。次を確認する。

- 七問の一意なpromptと、選択四問・穴埋め三問の比率
- 選択問題の正解位置`B / D / A / C`と、全選択肢の固有feedback
- 穴埋めのaccepted answerとhint
- 全参考linkの理由、存在するlocal file、完全な行範囲
- 初期表示が一問・一つのprimary actionであること
- 正本favicon、外部dependency不在、新規tabの安全属性
- IME変換中Enterのguard、reduced motion、live region
- 320pxで解釈が分かれないresponsive幅の指定

## 安全審査と再発防止

最初のbrowser verifierは、使い捨てChrome、local remote debugging port、一時profileを組み合わせて全回答経路を自動操作する予定だった。しかしGit管理外の任意script実行として安全審査に拒否された。同じ目的を別の自動操作へ迂回せず、そのscriptを削除した。

静的描画へ切り替えた最初のGoogle Chrome processは、画像保存後も専用profileを保持した。`ps`で専用profileと親PIDを照合し、その二processだけを終了した。その後は、処理終了が安定する既存のChromium headless shellで描画した。今後は、Chrome commandの終了表示だけでcleanup完了とみなさず、専用profileを持つprocessが残っていないことまで確認する。

## 参照した一次情報

- [デジタル庁デザインシステム更新履歴](https://design.digital.go.jp/dads/updates-dads/): 2026-08-19公開のv2.17.1を確認した。breadcrumbの名称変更とbeta注記が中心で、今回の単一問題表示、focus、feedback設計へ影響する変更はなかった。
- [デザイン更新履歴](https://design.digital.go.jp/dads/updates-design/): 現行のdesign側更新を確認し、外部assetを追加する要件がないことを確かめた。

## 未検証

- 全問正解と誤答を混ぜた完走、戻る、結果からの見直し、再挑戦を、実browserで操作した結果
- IME変換中のEnterを実browserで押した結果
- Windows browserのfaviconとquiz描画

これらは実装済みのcontractを否定する失敗ではない。安全に承認されたbrowser automation、または人の操作結果が得られた時点で、この記録を更新する。
