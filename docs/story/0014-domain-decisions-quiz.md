# Story 0014: LoupePlayの境界を七つの判断で確かめる

## Context（背景）

LoupePlayには、音源をコピーしない、完成snapshotだけを公開する、Track identityを観測から分ける、ListenとPracticeで音声を共有する、三種類の記録を使い分ける、といった判断が積み重なっている。用語だけを覚えても、失敗時に何を守る設計なのかは見えにくい。

設計判断とドメインの重要部分を、普通の難度で七問にする。正解を当てるだけで終わらせず、誤答からも「なぜその境界か」を学べる個人用のinteractive quizを作る。アプリ本体へ学習機能を追加する話には広げない。

## Definition of Done（完了の定義）

- `.mydocs/loupe-play-domain-decisions-quiz.html`に、build不要のstandalone HTMLとして保存する。
- 普通の難度で七問を出し、設計判断とドメイン概念を、境界、data flow、失敗時の判断へ進む順で扱う。
- 四問をmultiple-choice、三問を短いfill-in-the-blankとし、全問を機械的かつ決定的に採点する。
- 一度に一問だけ表示し、回答直後に正誤、明示した正解、判断理由、根拠へのlinkを示す。不正解でも次へ進める。
- fill-inではIME変換中のEnterで誤送信せず、hintを閉じた状態から開ける。
- 戻る操作、scoreの重複防止、誤答だけの見直し、完了結果、reduced motionを備える。
- 全参考linkに理由を示し、local sourceは存在と完全な`Lstart-Lend`範囲を検証する。linkは新しいtabで開く。
- LoupePlayの正本SVGをquizのfaviconにも使う。
- repository内のstatic verifierをHTMLより先に作ってREDを確認し、完成後に構造をGREENにする。1280px / 320pxの実描画を確認し、全採点経路のbrowser interactionは安全に使える自動操作の有無と結果を`PASS`または`UNVERIFIED`で分けて記録する。
- 最終HTMLをGoogle Chromeで開く。
- quizは個人学習成果物としてcommitせず、`.mydocs/`全体をignoreする。再実行可能なstatic verifierは`scripts/`へcommitする。

## To Do（やること）

- [x] 現行ADR、ユビキタス言語、quiz-creator規約から学習範囲を選ぶ。
- [x] 問数、難度、出題形式、保存境界、根拠の示し方をADRに記録する。
- [x] `.mydocs/`をGitの対象外にするtestを先に書く。
- [x] repositoryのstatic verifierを先に作り、HTML不在のREDを確認する。
- [x] 七問のstandalone quizを作る。
- [x] 全正解、誤答、fill-in、IME、戻る、完了、参考linkのbrowser検証を試み、static contractと1280px / 320px描画をGREEN、remote debuggingを使う実操作を安全審査による`UNVERIFIED`として分けて記録する。
- [x] Chromeで最終成果物を開き、Storyと検証記録を更新する。

## Concern（懸念）

- 七問で全ADRを網羅できない。初期foundationや実装APIの暗記ではなく、現在の利用体験を決める境界へ絞る。
- local Markdown linkの行番号は、文書編集でずれる。作成時点の範囲を検証するが、quizはcommitしないため長期的な追従は自動化しない。
- 派手な正解演出が説明や次操作を隠す可能性がある。演出はcontentより後ろに置き、reduced motionでも静的に同じ強さの祝福を示す。
- 個人学習成果物をcommitするとアプリの履歴へ私的な学習状態を混ぜる。`.mydocs/`をignoreし、リポジトリには作成方針、再実行可能な検証器、検証結果だけを残す。
- Git管理外の検証scriptからChromeをremote debuggingで操作する方式は、安全審査で任意script実行と判定される。再試行や別経路で迂回せず、許可済みの描画検証とstatic contractへ分け、実操作を未検証として残す。
