# Story 0010: 最近の音楽フォルダをすぐ開く

## Context（背景）

LoupePlay は選んだ音楽フォルダと Track を保存できるが、再起動すると毎回 native dialog で同じフォルダを選び直さなければならない。個人で日常的に使うプレイヤーとしては、明示的に一度選んだフォルダを次回からすぐ開けることの方が重要である。

また、React の Web 開発サーバーにもデスクトップ版と同じ「音楽フォルダを選ぶ」が表示される。ブラウザには Tauri の dialog、SQLite、file system がないため、この操作は必ず失敗する。利用できない操作を利用できるように見せたことが、実アプリの不具合との区別を難しくした。

この Story では、Tauri で一度選んだ最近の音楽フォルダを次回起動時に dialog なしで開き直す。同時に、ブラウザ版ではデスクトップ専用機能だと最初から分かる表示へ改める。複数ライブラリの切替・権限管理画面・バックグラウンド監視までは広げない。

## Definition of Done（完了の定義）

- デスクトップ版で音楽フォルダを一度選ぶと、アプリを終了して起動し直したとき、native dialog なしで最近の音楽フォルダを走査し、Track を選択・再生できる。
- 起動時の scope 復元、folder 走査、metadata、SQLite 公開のいずれかが失敗しても、前回の保存済みライブラリを失わず「再接続が必要」として表示する。
- React StrictMode を含む同時 hydration で、同じ最近の音楽フォルダを重複走査・重複公開しない。
- ブラウザ版はデスクトップアプリが必要だと明示し、動作しないフォルダ選択操作を実行できない。
- 外部の個人音源、絶対パス、AppConfig の SQLite、token や認証情報を fixture と commit に含めない。
- scope 復元、失敗時の保持、browser capability、single-flight を、実装前に失敗するテストで固定する。
- README、ADR、ユビキタス言語、検証記録が新しい起動方法と制約に一致する。
- frontend test、lint、build、Rust test、Rust check、secret-pattern check、`git diff --check` が通る。
- macOS の実アプリで、許可された外部テストフォルダの初回選択、終了、再起動、自動再オープンを確認する。

## To Do（やること）

- [x] Tauri の Dialog、File System、Asset Protocol、Persisted Scope の一次情報を確認する。
- [x] 最近の音楽フォルダの scope と失敗時 fallback を ADR に記録する。
- [x] 自動再オープン、single-flight、browser capability の失敗するテストを書く。
- [x] Tauri の動的 file-system / asset scope を再起動後に復元する。
- [x] 保存済みの最近の音楽フォルダを、dialog なしで安全に再走査する。
- [x] scope または走査の失敗時に、保存済み snapshot へ戻す。
- [x] ブラウザ版の誤操作を防ぎ、デスクトップ版の起動方法を示す。
- [x] README と検証記録を更新する。
- [x] 自動検査と実アプリ再起動の証拠を残す。

## Verification（検証）

自動再オープン、single-flight、fallback、browser capability のRED→GREEN、frontend 222 tests、Rust 34 tests、lint、frontend build、Rust check、release `.app` / DMG buildは`PASS`。macOSのrelease appで、外部テストfolderの再接続、file-system / asset scopeの保存、完全終了、dialogなしの再起動、4 Trackの再走査、Track選択、mediaのplay/pause状態遷移も`PASS`。スピーカーからの可聴音、正確な320px browser viewport、Windows / WebView2は`UNVERIFIED`。証拠と制約は[Story 0010 検証記録](../reports/2026-09-02-story-0010-recent-library-reopening-verification.md)に分けた。

## Concern（懸念）

- Persisted Scope は利便性と引き換えに、利用者が dialog で選んだ file-system / asset scope をアプリ終了後も保持する。静的に Home 全体を許可せず、明示選択した範囲だけに留める。
- plugin 導入前に選んだ既存フォルダの scope は遡って保存できない。その場合だけ一度再接続し、以降の起動で復元する。
- 起動時に完全走査と metadata 抽出を行うため、大きなライブラリでは表示まで時間がかかる。増分走査や進捗表示は実測後の Story とする。
- 外付けドライブの未接続、folder の移動・削除、OS 権限変更では自動再オープンに失敗する。保存済み一覧を消さず、手動再接続へ戻れる必要がある。
- ブラウザ版はUI確認には使えるが、ローカル保存・folder dialog・音源再生の動作証拠にはならない。
