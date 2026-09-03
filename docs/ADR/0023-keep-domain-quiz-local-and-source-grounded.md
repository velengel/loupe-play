# ADR 0023: ドメインquizをlocal-onlyかつ根拠付きで作る

## Status

Accepted

## Context（背景）

利用者が確かめたいのは、LoupePlayの設計判断とドメインで重要な部分である。現在の文書には用語、判断、却下案、受け入れた不利が分かれており、単純な用語問題だけでは設計の因果を学べない。

quizは個人の理解のために使う。アプリ本体の機能でも、共有する仕様書でもない。回答状態を含むinteractive artifactを製品履歴へ入れず、現在checkoutの一次資料へ戻れるようにする。

## Decision（決定とその理由）

- quizは`.mydocs/loupe-play-domain-decisions-quiz.html`へ置き、`.mydocs/`をGit ignoreする。Story、ADR、再実行可能なstatic verifier、検証記録だけをrepositoryへ残す。
- タイトルは「LoupePlayは何を残し、どこで区切る？ 設計判断とドメインクイズ」とする。中心にあるのは機能数ではなく、選択範囲、恒久identity、完成公開、音声session、記録の所有、位置の単位、再生区間という境界だからである。
- 普通の難度で七問とし、multiple-choice四問、fill-in-the-blank三問を混ぜる。用語のrecognitionから始め、具体的な失敗場面で設計を選ぶ問題へ進める。
- 出題範囲は、明示選択した音源scope、Track identityとobservation、Listen / Practiceの共有音声session、Marker位置の整数ミリ秒、Marker / Track Note / Listening Note、PlayEvent、Library Publicationとする。toolchainやmigration番号の暗記は問わない。
- multiple-choiceの正解位置を固定せず、もっともらしい誤解をdistractorにする。選択肢ごとに、どの境界を取り違えたかを固有のfeedbackで返す。
- fill-inは`Track identity`、`0以上の整数ミリ秒`、`Library Publication`の短い語句を答えとし、Unicode正規化、trim、英字case、空白の差を吸収した明示的なaccepted-answerだけで採点する。曖昧なkeyword判定はしない。
- 一問ずつ進め、回答済みstateは同じpage sessionで保持する。不正解でも正解と理由を示して次へ進め、戻ってもscoreを二重計上しない。完了時は誤答だけへ直接戻れるようにする。
- 参考linkは回答後だけ示す。repository固有の答えは、現在checkoutのADRまたはユビキタス言語へ、検証した`Lstart-Lend`付きrelative linkを張る。各linkに「理由」を添え、新規tabで開く。
- HTMLは外部dependencyを持たず、LoupePlayのdark themeと正本faviconを使う。bodyと操作は16px以上、focusを可視化し、statusを色だけに頼らせない。
- static verifierは`scripts/verify-loupe-play-domain-quiz.mjs`へ置き、HTMLのscriptを実行せずDOMと`application/json`の問題dataだけを読む。七問、形式比率、決定的な正解、初期一問、primary action、reference属性、line range、IME guard、reduced motion、responsive幅を検査する。
- Git管理外の任意scriptからChrome remote debuggingを操作する検証は行わない。安全審査で拒否された場合に再試行や別の自動操作へ迂回せず、許可済みChromium headless shellによる1280px / 320pxの静的描画、static verifier、通常Chromeでの成果物表示へ分ける。自動化できなかった回答操作は検証記録で`UNVERIFIED`とする。

## Rejected Options（却下した選択肢）

- quizをアプリ画面へ組み込む: 学習には使えるが、音楽を聴く製品のruntime、navigation、test責務を増やす。
- quiz HTMLをcommitする: 共有と再現は容易になるが、個人学習artifactという既定境界を越え、行番号driftへの継続保守を約束する。
- 全問をmultiple-choiceにする: 操作は軽いが、Track identity、Marker、PlayEventという中核語を自力で想起できるか確認できない。
- 全問をfill-inにする: recallは強いが、設計trade-offをscenarioで比較しにくく、表記ゆれのaccepted-answer管理も増える。
- ADR番号、table名、migration番号を問う: 探せば分かる実装索引であり、利用者が設計判断を再現する力へつながりにくい。
- source linkを最初から表示する: 根拠へ戻りやすいが、回答前に正解を露出し、active recallを弱める。
- remote repository URLを推測して張る: checkoutと一致する保証がない。確認済みのlocal sourceを正とする。
- static verifierをquizと同じ`.mydocs/`へ一時配置する: 検証内容が履歴に残らず、artifactの隣に補助fileを残しやすい。安全なread-only検証器だけを`scripts/`へ残す。
- Git管理外のbrowser verifierからChrome remote debuggingを操作する: 全回答経路を自動化できるが、任意script実行とlocal port接続を組み合わせ、安全審査の境界を越える。却下後にAppleScript等へ迂回もしない。

## Consequences（結果）

- 七問でLoupePlayの主要な境界を横断できる一方、metadata fallback、soft delete、loop診断、stale publication競合、検索仕様などは直接出題しない。
- 誤答にも固有の説明と根拠が付くため、点数より設計の因果を学べる。その分、HTMLと検証codeは単純な問題一覧より長くなる。
- quizはcommitされないため、別checkoutや別端末には自動で共有されない。必要なら明示的にHTMLを持ち出す。
- local file linkは現在のrepositoryへ戻れるが、Markdownを表示するbrowserの挙動と将来の行番号変更に依存する。
- celebration animationは理解の報酬になる一方、motionに弱い利用者へ負担を与えうる。`prefers-reduced-motion`では動きを止め、同じ正解文と静的な視覚強調を残す。
- static contractと実描画は再現可能になるが、正解・誤答・戻る・完了を通す実browser操作は、承認済みのbrowser automationが利用できるまで未検証として残る。
