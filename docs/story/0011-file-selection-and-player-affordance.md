# Story 0011: 曲を選びやすく、再生状態を読み取りやすくする

## Context（背景）

一曲だけ聴きたい場合でも、現在の LoupePlay は音楽フォルダを選ばなければならない。フォルダ内の対応音源をまとめて取り込む動線しかなく、利用者が聴きたいファイルを直接指定する素朴な操作に応えられていない。

Listen の再生機能は動く。しかし、現在位置と曲の長さは大きな曲名から離れた小さな一行に収まり、再生・一時停止・前後曲のボタンも文字だけである。操作を読むまで役割が伝わらず、再生中か停止中か、あとどれくらい聴けるかという判断にも視線移動が要る。

この Story では、フォルダ選択に加えて一つ以上の音楽ファイルを直接選べるようにする。同時に、Listen の時刻とトランスポート操作を視覚的な階層、記号、状態差で読み取りやすくする。ライブラリ履歴の管理、音源のコピー、外部サービスからの取込、再生画面全体のテーマ変更までは広げない。

## Definition of Done（完了の定義）

- デスクトップ版で WAV、MP3、FLAC を一つ以上選び、選んだファイルだけを Library として一覧・選択・再生できる。
- ファイル選択をキャンセルした場合と、対応音源を選ばなかった場合に、現在の Library を失わない。
- 明示選択したファイルだけに file-system / asset scope を限定し、親フォルダ全体を暗黙に走査しない。
- 最近選んだファイルの Library は、既存の最近の音楽フォルダと同じ失敗時境界を保って再起動後に開き直せる。
- フォルダ選択とファイル選択が別の操作として見分けられ、ブラウザ版ではどちらもデスクトップ専用だと分かる。
- Listen の現在位置を主要情報として表示し、曲の長さとの関係を一目で読める。
- 再生・一時停止・前の曲・次の曲に、文字だけへ依存しない記号と明示的な accessible name がある。
- 再生中と一時停止中で、主操作のラベル、記号、視覚状態が一致する。
- 320px とワイド画面で、長い曲名、時刻、ボタンラベルが横方向へ page overflow しない。
- キーボードの focus order が操作順と一致し、各操作に見える focus indicator がある。
- 個人音源、絶対パス、SQLite、token、認証情報を fixture と commit に含めない。
- ファイル選択境界、失敗時の保持、表示階層、記号の accessible name、responsive layout を、実装前に失敗するテストで固定する。
- frontend test、lint、build、Rust test、Rust check、secret-pattern check、`git diff --check` が通る。
- macOS の実アプリでファイル選択、再生操作、320px相当とワイド幅の表示を確認し、証拠を検証記録へ残す。

## To Do（やること）

- [x] Tauri Dialog の複数ファイル選択と scope、WCAG の target / focus、装飾記号の accessible name に関する一次情報を確認する。
- [x] ファイル Library の identity、再オープン、権限境界と UI の優先順位を ADR に記録する。
- [x] ファイル選択と再生操作・responsive layout の失敗するテストを書く。
- [x] 選択した音楽ファイルだけを metadata 検証し、完成 snapshot として公開する。
- [x] ファイル Library を再起動後に安全に開き直し、失敗時は保存済み一覧を保持する。
- [x] フォルダとファイルの選択操作を、用途が読み取れる UI にする。
- [x] Listen の時刻表示とトランスポート操作を再設計する。
- [x] README、ユビキタス言語、検証記録を更新する。
- [ ] 自動検査と macOS 実アプリでの表示・操作を検証する。

## Verification（検証）

Test-firstのRED、frontend 229 tests、Rust 36 tests、lint、frontend build、Rust format / check、release `.app` / DMG、320px / 1440pxのReact実描画は`PASS`。実描画で見つかった320pxの選択カードの間延びは、再現テストをREDにしてから修正した。

このGUIセッションでは、release appのprocess、WindowServer上のwindow、WebView loadまでは確認できたが、Accessibilityがnative windowを列挙できなかった。native file dialogでの実選択、実WebViewでの再生操作、可聴音は`UNVERIFIED`のまま分ける。証拠と残余リスクは[Story 0011 検証記録](../reports/2026-09-02-story-0011-file-selection-and-player-affordance-verification.md)に残す。

## Concern（懸念）

- 複数ファイルは別々のフォルダから選べる。既存の「一つの音楽フォルダを root にした Library」に無理に見せると、親フォルダへ権限を広げたり Track identity を不安定にしたりする。
- 選択ファイルの絶対 path はローカル DB と OS scope に残る。画面、ログ、テスト、検証記録には露出させない。
- 同名ファイルを複数選べるため、file name だけを identity に使えない。表示名と恒久 Track identity を分ける必要がある。
- 記号は見た目だけで意味が一意になるとは限らない。可視ラベルを残し、装飾記号を accessibility tree から隠して、操作名を重複させない。
- 時刻を大きくしても、長い曲名や小さい画面を押し出してはならない。320pxでは自然な改行、ワイド画面では曲名と時刻の明確な分離が要る。
- UI の視認性は自動テストだけでは完了しない。実際の WebView を狭い幅とワイド幅で確認する。
