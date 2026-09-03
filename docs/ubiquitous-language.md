# ユビキタス言語

言葉の揺れは、同じ画面や作業を別物に見せる。`loupe-play` では、コード、Story、ADR、会話で次の意味を共有する。

## 実装前理解確認ゲート

- 同義語: Understanding Gate
- 意味: 重要な変更について、Codexの説明を材料に利用者が目的、判断軸、守る制約を自分の言葉で説明し、共有理解を確認してからRED testとproduction実装へ進む停止条件。
- 使われ方: ドメイン概念、data ownership、schema、権限、失敗境界、外部service、交換可能性などを変えるStoryで`Required`とする。局所的で意味を変えない変更は、理由を残して`Skipped`にできる。
- 参考リンク: [Story 0015](story/0015-explain-critical-understanding-before-implementation.md)、[ADR 0024](ADR/0024-require-self-explanation-for-critical-implementation.md)、[運用の正本](development/implementation-understanding-gate.md)

## LoupePlay

- 意味: このリポジトリで開発するアプリケーションとプロジェクトの名前。
- 使われ方: README のタイトルと画面の製品名には `LoupePlay`、package 名とリポジトリ識別子には `loupe-play` を使う。
- 参考リンク: [プロダクト仕様](../first-instruction.md)

## アプリアイコン

- 意味: 虫眼鏡と再生記号を重ね、LoupePlayをデスクトップやブラウザタブで識別する図柄。
- 使われ方: `src-tauri/icons/app-icon.svg`を意匠の正本とし、Tauri向け生成iconとbrowser faviconで共有する。
- 参考リンク: [ADR 0022](ADR/0022-reuse-app-icon-as-browser-favicon.md)

## 学習クイズ

- 意味: LoupePlayの設計判断とドメイン概念を、自動採点と根拠付きfeedbackで確かめる個人用HTML。
- 使われ方: `.mydocs/`に置き、アプリ機能や共有仕様へ混ぜず、現在checkoutのADRと用語へ戻る入口として使う。
- 参考リンク: [Story 0014](story/0014-domain-decisions-quiz.md)、[ADR 0023](ADR/0023-keep-domain-quiz-local-and-source-grounded.md)

## ベース画面

- 意味: React アプリケーションが正しく起動したと確認するための、最小のルート画面。将来のプロダクト仕様は含まない。
- 使われ方: 初期表示のテスト、Story 0001、起動確認で使う。
- 参考リンク: [Story 0001](story/0001-react-base.md)

## Listen モード

- 同義語: Listen
- 意味: 音楽鑑賞に使う既定のモード。練習・分析用の操作を前面に出さず、普通に聴く体験を守る。
- 使われ方: 再生、一時停止、シーク、前後曲への移動など、日常の鑑賞操作をまとめる。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0012](ADR/0012-listen-queue-and-transport.md)、[ADR 0013](ADR/0013-share-one-audio-session-between-listen-and-practice.md)

## 再生キュー

- 同義語: Listen Queue
- 意味: 最新の表示中 Library Snapshot から導出した、現在再生可能な Track の決定的な順序。保存済み一覧そのものやDB rowの順番ではない。
- 使われ方: Listen の前後曲と自動次曲を、画面に見える階層順で選ぶ。再接続が必要な Track、`missing`、`unknown` は含めない。
- 参考リンク: [ADR 0012](ADR/0012-listen-queue-and-transport.md)

## 現在曲

- 同義語: Current Track、Now Playing
- 意味: 音声セッションが現在開いている Track。保存済みライブラリに存在するだけの Track や、利用不可になった過去の選択とは区別する。
- 使われ方: Listen と Practice が共有する曲、表示中のmetadata、前後移動の基準を指す。
- 参考リンク: [ADR 0012](ADR/0012-listen-queue-and-transport.md)

## Practice モード

- 同義語: Practice
- 意味: 現在の曲と再生位置を保ったまま、速度変更、前後移動、マーカー、A-B ループを使って観察・反復・練習するモード。
- 使われ方: Listen 中に耳へ引っかかった瞬間を詳しく確かめるときに、同じ音声セッションのまま切り替える。Trackを替えてもmodeは保つが、速度、A・B、loopはTrackごとに初期化する。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0013](ADR/0013-share-one-audio-session-between-listen-and-practice.md)

## Track

- 同義語: 曲
- 意味: LoupePlay が参照する一つの音源と、その識別情報・メタデータをまとめたもの。音源バイナリ自体は含めない。
- 使われ方: ローカルファイル、メモ、マーカー、再生履歴を結び付ける単位として使う。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0008](ADR/0008-separate-track-identity-from-snapshot-observations.md)

## Track identity

- 同義語: 恒久 Track identity
- 意味: 再走査や metadata の変化を越えて、同じ Track を Marker、Note、Play Event と結び付ける UUID。走査時点の path や metadata そのものではない。
- 使われ方: root、Track Source、source identifier で既存 Track を再発見し、利用者が蓄積した情報の安定した外部キーとして使う。
- 参考リンク: [ADR 0008](ADR/0008-separate-track-identity-from-snapshot-observations.md)

## Track observation

- 同義語: 走査時点の Track
- 意味: 一回のライブラリ走査で確認した Track の path、format、metadata、更新時刻を、公開単位となる snapshot に所属させた記録。
- 使われ方: 完成したライブラリ表示を再起動後に復元し、失敗した再走査の途中結果を前回の表示へ混ぜないために使う。
- 参考リンク: [ADR 0007](ADR/0007-publish-complete-library-snapshots.md)、[ADR 0008](ADR/0008-separate-track-identity-from-snapshot-observations.md)

## 音楽フォルダ

- 意味: 利用者が native dialog で明示的に選んだ、ローカル音源の走査起点。ホームや Music 全体を暗黙に指す言葉ではない。
- 使われ方: WAV、MP3、FLAC の Track を見つけるときに使う。root path と、native dialog が追加した動的scopeは、次回起動時に最近の音楽フォルダを開き直すためローカルに保存する。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)、[ADR 0019](ADR/0019-persist-selected-scope-and-reopen-recent-library.md)

## ファイルライブラリ

- 同義語: 選択した曲
- 意味: 利用者がnative dialogで明示的に選んだ一つ以上のローカル音楽ファイルを、現在のLibraryとしてまとめたもの。親フォルダや、過去に選んだ全ファイルは含まない。
- 使われ方: 一曲だけ、または別々のフォルダにある複数曲を直接開くときに使う。選び直すと今回の選択集合で置き換え、再起動時は最後に完成公開した集合だけを検証し直す。
- 参考リンク: [Story 0011](story/0011-file-selection-and-player-affordance.md)、[ADR 0020](ADR/0020-treat-explicit-files-as-a-scoped-library.md)

## 最近の音楽フォルダ

- 同義語: 直近の音楽フォルダ
- 意味: SQLiteで最後に公開したLibraryが参照する、一つの音楽フォルダ。過去に選んだ全folderやOSのMusic folder全体ではない。
- 使われ方: アプリ起動時に、復元済みの動的scopeでdialogなしに走査し、すぐ開き直す対象として使う。
- 参考リンク: [Story 0010](story/0010-reopen-recent-library.md)、[ADR 0019](ADR/0019-persist-selected-scope-and-reopen-recent-library.md)

## ライブラリ

- 意味: 一つの音楽フォルダ、または明示選択した音楽ファイル群と、そこから確認してSQLiteに保存されたTrackのまとまり。音源バイナリと現在のOS権限は含めない。
- 使われ方: 最後に選択と完成公開を終えた音源のまとまりを、一覧表示、再生、再起動後の復元の単位として使う。
- 参考リンク: [Story 0003](story/0003-library-persistence.md)、[ADR 0020](ADR/0020-treat-explicit-files-as-a-scoped-library.md)

## 再生時刻

- 同義語: 現在位置、Playback Time
- 意味: 現在曲の先頭から実際に再生・seekしている位置。曲全体の長さである総時間とは分けて読む。
- 使われ方: ListenとPracticeのnow-playing領域で主要情報として表示し、seekの現在値とMarkerを置く位置の基準にする。
- 参考リンク: [Story 0011](story/0011-file-selection-and-player-affordance.md)、[ADR 0020](ADR/0020-treat-explicit-files-as-a-scoped-library.md)

## トランスポート操作

- 同義語: Transport Controls、再生操作
- 意味: 現在曲の再生・一時停止と、再生キューの前後曲へ移動する操作群。
- 使われ方: ListenとPracticeで同じ音声セッションを動かす。可視ラベルと装飾記号を併記し、状態に応じて再生と一時停止を切り替える。
- 参考リンク: [ADR 0012](ADR/0012-listen-queue-and-transport.md)、[ADR 0020](ADR/0020-treat-explicit-files-as-a-scoped-library.md)

## Library Publication

- 同義語: ライブラリ公開
- 意味: 全 Track observation の保存を終えた library snapshot を、通常読込へ見せる最後の一文の記録。
- 使われ方: 完了時に database sequence を採番し、並行した走査でも最後に公開された完成状態を再起動後に選ぶために使う。
- 参考リンク: [ADR 0009](ADR/0009-order-library-publication-at-commit-time.md)、[ADR 0011](ADR/0011-reject-stale-library-publications.md)

## Folder Generation

- 同義語: ライブラリ世代
- 意味: 同じ音楽フォルダの完成 snapshot が何回公開されたかを表す、DB 内部の単調増加 concurrency token。
- 使われ方: 同じ完成状態から始まった並行走査のうち一つだけを公開し、古い base からの結果が既知 Track を隠すことを防ぐ。利用者向けの版番号としては表示しない。
- 参考リンク: [ADR 0011](ADR/0011-reject-stale-library-publications.md)

## 再接続

- 意味: 自動再オープンできなかった保存済みの音楽フォルダを、native dialog で利用者がもう一度選び、file system と再生の権限を得直す操作。
- 使われ方: scopeが復元できない、folderが移動した、OS権限が変わった場合に、保存済み Track を再び走査・再生可能にするときに使う。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)、[ADR 0019](ADR/0019-persist-selected-scope-and-reopen-recent-library.md)

## 完全走査

- 同義語: Complete Scan
- 意味: 選択した音楽フォルダと、symlink を除く全ての子ディレクトリを、読取失敗なく確認できた走査。
- 使われ方: 今回見つからなかった保存済み Track を `missing` と判断できる場合に使う。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)

## 部分走査

- 同義語: Partial Scan
- 意味: root は開けたが、一つ以上の子ディレクトリを確認できなかった走査。
- 使われ方: 見つかった Track は利用できる一方、未検出 Track を削除済みとは断定できず `unknown` として保つ場合に使う。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)

## Presence

- 同義語: Track Presence
- 意味: 今回の走査で Track のファイルを確認できたかを表す `present`、`missing`、`unknown` の区分。現在の OS 権限とは別の状態である。
- 使われ方: 完全走査と部分走査で、未検出 Track の意味を分けるために使う。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)

## Metadata Fallback

- 同義語: メタデータfallback
- 意味: 音声 properties は確認できるが、基本タグがない、またはタグだけを解析できない Track を捨てず、file name の stem を表示 title として使う状態。
- 使われ方: `missing-tags` と `invalid-tags` を1曲へ隔離し、library 全体を表示し続けるために使う。音声構造も確認できない `invalid-metadata` は再生可能にはしない。
- 参考リンク: [ADR 0006](ADR/0006-persistent-library-and-scoped-metadata.md)、[ADR 0010](ADR/0010-retry-audio-properties-without-tags.md)

## 音源候補

- 同義語: AudioTrackCandidate
- 意味: 選択した音楽フォルダで見つかった対応拡張子のファイル。永続化された Track になる前の、名前とローカルパスだけを持つ候補。
- 使われ方: 基盤段階の一覧表示と再生技術確認に使う。Track のメタデータや音源バイナリを DB へ保存したとはみなさない。
- 参考リンク: [Story 0001](story/0001-react-base.md)

## Track Source

- 同義語: TrackSource
- 意味: Track の音源がどこから来たかを表す区分。初期値は Local であり、将来の外部サービスを理由に初期実装を複雑にしない。
- 使われ方: 音源固有の参照方法と、メモや履歴のドメイン情報を分離するときに使う。
- 参考リンク: [プロダクト仕様](../first-instruction.md)

## Marker

- 同義語: タイムスタンプメモ、Timestamp Note
- 意味: 恒久Track identityの曲中時刻に置かれ、必要なら名前と本文を持つもの。練習用マーカーと鑑賞用メモを別概念に分けず、同じ時刻へ複数置ける。
- 使われ方: Practiceで再生を止めずに気になった瞬間へ印を置く。時刻から同じmediaへ戻る、観察内容を編集する、後から検索するために使う。削除は一件を確認して非表示にし、直後に復元できる。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0014](ADR/0014-persist-markers-on-track-identity.md)

## マーカー位置

- 同義語: `position_ms`
- 意味: Track先頭からMarkerまでを、0以上の整数ミリ秒で永続化した位置。音声セッションが一時的に扱う秒の浮動小数とは区別する。
- 使われ方: 作成時のmedia位置を一度だけ丸めて保存し、一覧の決定順とMarker選択時のseek先に使う。現在の音源が短くなっていた場合、seek時だけdurationへclampする。
- 参考リンク: [ADR 0014](ADR/0014-persist-markers-on-track-identity.md)

## Track Note

- 意味: Track 全体へ付ける、時間位置を持たないメモ。
- 使われ方: 恒久Track identityへ、曲全体の印象や後で参照したい目的を複数残す。本文が空のNoteは作らない。曲中位置を持たないため、一覧では記録日時だけを添える。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0015](ADR/0015-own-notes-by-track-and-confirmed-play-event.md)、[ADR 0021](ADR/0021-present-note-context-and-task-first-help.md)

## Listening Note

- 意味: 一回の聴取または練習セッションへ付けるメモ。
- 使われ方: `playing`を確認して保存された現在TrackのPlay Eventへ、その日に気付いたことやセッションごとに変わる感想を残す。Trackを選んだだけの未再生状態へは作らない。一覧では親Play Eventの再生区間を示し、その先頭へ戻れる。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0015](ADR/0015-own-notes-by-track-and-confirmed-play-event.md)、[ADR 0021](ADR/0021-present-note-context-and-task-first-help.md)

## Play Event

- 同義語: PlayEvent
- 意味: Listen または Practiceで、Track、mode、速度、有効loopが一定だった連続再生区間を、位置と時刻とともに残す生ログ。
- 使われ方: `playing`で開始し、pause、終了、Track・mode・速度・loop・手動seekの境界で閉じる。後から聴取や練習を解釈できるよう、早すぎる集計をせず保存する。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0017](ADR/0017-record-contiguous-playback-segments.md)

## 再生区間

- 同義語: Playback Segment
- 意味: 一つのPlay Eventが表す、Track、mode、再生速度、有効loop区間が変わらない連続した実再生。
- 使われ方: mediaの`playing`で始まり、条件変更、手動seek、pause、ended、失敗、Track変更で閉じる。loop wrapと時刻更新では分けない。Listening Noteでは曲中の文脈として開始・終了位置を示し、PracticeのloopがあればA-B区間を優先する。
- 参考リンク: [ADR 0017](ADR/0017-record-contiguous-playback-segments.md)、[ADR 0021](ADR/0021-present-note-context-and-task-first-help.md)

## 記録日時

- 意味: Noteを最初に保存した暦上の時刻。曲中の再生位置とは別の時間である。
- 使われ方: DBでは並び順と機械的な読戻しのためISO 8601で保持し、画面では利用者のlocal timezoneによる年月日・時・分まで表示する。
- 参考リンク: [ADR 0021](ADR/0021-present-note-context-and-task-first-help.md)

## ヘルプ

- 意味: LoupePlayで最初の再生、聴き直し、メモの使い分け、local保存の境界を短く確認するmodal。
- 使われ方: app header右上の`?`から開く。全仕様を列挙せず、利用者が次の操作を決めるために使う。
- 参考リンク: [ADR 0021](ADR/0021-present-note-context-and-task-first-help.md)

## メモ検索

- 意味: 現在公開中のライブラリにあるTrack metadata、Track Note、Listening Note、Markerを、一つの文字列で横断する検索。
- 使われ方: 過去に残した観察を日本語を含むliteralな部分一致で探し、TrackまたはMarker位置へ戻る。
- 参考リンク: [ADR 0016](ADR/0016-search-current-library-notes-with-literal-like.md)

## 検索結果

- 意味: メモ検索が返す、種別、恒久Track identity、表示metadata、要約、作成日時、任意のMarker位置だけを持つ安全な項目。
- 使われ方: 個人の絶対pathやsource identifierを画面へ渡さず、曲を開く、またはMarker時刻へ移る操作に使う。
- 参考リンク: [ADR 0016](ADR/0016-search-current-library-notes-with-literal-like.md)

## A-B ループ

- 意味: 一つの Track 上で A 地点を開始、B 地点を終了として、区間を繰り返し再生する機能。
- 使われ方: Practiceで気になったフレーズの観察と反復練習に使う。Listenへ戻るとOFFになり、A・Bを保持しても自動では再開しない。
- 参考リンク: [プロダクト仕様](../first-instruction.md)、[ADR 0013](ADR/0013-share-one-audio-session-between-listen-and-practice.md)

## 音声セッション

- 同義語: Audio Session
- 意味: 一つの音源を開いている間だけ存在する、位置、長さ、再生状態、速度、A-B ループ、エラー、診断値のまとまり。永続化する Listening Note や Play Event とは別の、一時的な制御状態である。
- 使われ方: 曲を替えたときに前曲の速度やループを持ち越さず、Listen と Practice が同じmedia、現在位置、再生状態、音量を扱うために使う。
- 参考リンク: [ADR 0005](ADR/0005-html-media-audio-validation-controller.md)、[ADR 0013](ADR/0013-share-one-audio-session-between-listen-and-practice.md)

## ループ境界超過

- 同義語: Loop Overshoot
- 意味: A-B ループ中、制御層が B 地点を検出した時刻と B 地点との差。可聴音の誤差そのものではなく、現在の WebView で境界監視方式を比較する診断値である。
- 使われ方: 各周回の直近値と最大値をミリ秒で観測し、標準 media element を採用できるか判断する。
- 参考リンク: [ADR 0005](ADR/0005-html-media-audio-validation-controller.md)

## ループ着地点誤差

- 同義語: Loop Landing Error
- 意味: B 地点から A 地点へ戻す seek が完了したとき、実際の再生位置と A 地点との差の絶対値。
- 使われ方: ループ境界超過と分けて記録し、監視の遅れと seek の着地ずれを混同しないために使う。
- 参考リンク: [ADR 0005](ADR/0005-html-media-audio-validation-controller.md)

## Story

- 同義語: ストーリー
- 意味: 背景、完了の定義、作業、懸念をひとまとまりにした開発単位。
- 使われ方: 変更を始める前に `docs/story/` へ作り、進捗と完了条件の正本として使う。
- 参考リンク: [Story 0001](story/0001-react-base.md)

## ADR

- 同義語: 意思決定記録
- 意味: 選択の背景、決定と理由、却下案、引き受ける結果を残す記録。
- 使われ方: 技術や運用の判断を実装へ反映する前に `docs/ADR/` へ追加する。
- 参考リンク: [ADR 0001](ADR/0001-react-application-foundation.md)

## 検証ゲート

- 意味: 変更を完了と判断する前に通す、テスト、ビルド、差分、機密情報の確認。
- 使われ方: Story の完了判定とコミット前の確認で使う。
- 参考リンク: [AGENTS.md](../AGENTS.md)
