# LoupePlay

音楽を聴く。気になったら、覗き込む。

LoupePlay は、普段のリスニングから、気になった瞬間の観察・反復・練習へそのまま移れるローカル音楽プレイヤーです。Tauri + React + SQLite で、Listen、Practice、Marker、三種類のメモ、横断検索、再生・練習履歴までをローカルに実装しています。

## 現在できること

- Tauri のデスクトップウィンドウで React UI を開く。
- SQLite へ一時的な probe を書き、同じ値を読み戻して接続を確認する。
- WAV、MP3、FLAC を一つ以上直接選ぶか、ユーザーが選んだフォルダだけを走査し、候補を表示する。
- 選択ルート、Track identity、相対パス、表示用メタデータをローカル SQLite に保存し、元のフォルダ階層として表示する。
- 一度選んだ最近の音楽ファイルまたは音楽フォルダを、次回起動時にnative dialogなしで検証し直して開く。
- 自動再オープンできない場合も保存済みライブラリを残し、native dialogから再接続する。
- 再走査で見つからない曲を消さず、利用不可または未確認として残す。
- 一覧から一つを選び、現在曲の情報を見ながら、独自の操作面で再生・一時停止・seek・音量変更をする。
- 画面と同じ順序で、利用できる前後の曲へ移る。再生中は次の曲でも再生を続け、曲の終了時は末尾まで自動で進む。
- 読込や自動再生に失敗した曲を勝手に飛ばさず、その曲を保ったまま再試行する。
- 現在曲、再生位置、再生状態、音量を保ったまま Practice へ切り替える。
- Practice で前後5秒移動、音程を保つ0.50x〜1.00xの速度変更、A-Bループ、補助的なループ診断を使う。
- Listen へ戻ると通常速度へ戻してループを止める。A・B地点は残るため、再び Practice へ入って再開できる。
- Practiceで現在位置へMarkerを作り、時刻、名前、メモを編集する。Markerを選ぶと同じ音声のその位置へ戻れる。
- Markerは再走査と再起動を越えてTrackへ残る。削除前には画面内で確認し、直後なら元へ戻せる。
- 曲全体のTrack Noteと、一回の確認済み再生へ属するListening Noteを、折りたたみ式の「メモ」面で作成・編集・削除・復元する。Listening Noteには対象の再生区間を表示し、その先頭へ移動できる。
- 現在公開中のライブラリにあるTrack metadata、Track Note、Listening Note、Markerを、日本語を含むliteralな部分一致で横断検索する。
- 検索結果からTrackを開き、Markerならmedia metadataを待って保存位置へ移る。現在の曲長を越える位置は曲末へ収める。
- 確認済みの連続再生をPlayEventとして保存する。Listen / Practice、速度、loop、手動seekの境界を区別し、異常終了した未完了eventは次回開始時に回収する。
- ヘッダー右上の`?`から、聴き始め方、Practice、メモの使い分け、ローカル保存の短いヘルプを開く。

native dialogで一度選んだ音楽ファイルまたはフォルダのfile-system / asset scopeはローカルに保存します。次回起動時は、明示選択したファイルだけを検証するか、最近の音楽フォルダを再走査します。fileやfolderの移動・削除、外付けドライブの未接続、OS権限変更などで開けない場合は、保存済みの曲を再生不可の状態で残し、「再接続」から選び直せます。SQLiteには選択した範囲、曲の手がかり、表示用メタデータ、絶対pathを保存します。音源バイナリはDBやリポジトリへ複製しません。

## 必要な環境

- Node.js 24.15 以上、25 未満
- npm 11 以上
- Rust stable 1.89 以上
- Tauri v2 の OS 別 prerequisites

Windows では Microsoft C++ Build Tools、WebView2、Rust の MSVC toolchain が必要です。準備は [Tauri の Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) に従ってください。macOS では Xcode Command Line Tools が必要です。

## 初回セットアップ

リポジトリルートで依存関係を導入します。

```bash
npm install
```

`package-lock.json` と `src-tauri/Cargo.lock` は追跡済みです。依存関係を更新する目的でなければ削除しないでください。

## Web 開発サーバーを起動する

React UI だけを素早く確認する場合に使います。

```bash
npm run dev
```

起動後、ブラウザで [http://localhost:1420](http://localhost:1420) を開きます。ブラウザタブには、デスクトップアプリと同じ正本SVGがfaviconとして表示されます。停止はターミナルで `Ctrl+C` です。

ブラウザには Tauri runtime がないため、SQLite は「確認失敗」と表示され、音楽ファイル・フォルダの選択とローカル音源再生は使えません。デスクトップ機能まで確認する場合は、次のコマンドを使います。

## デスクトップアプリを起動する

```bash
npm run tauri dev
```

初回は Rust crate の compile に時間がかかります。LoupePlay のウィンドウが開いたら、次を確認できます。

1. SQLite の状態が「ローカル保存を利用できます」になる。
2. 一曲から始める場合は「曲を選ぶ」、まとめて開く場合は「フォルダを選ぶ」を選ぶ。
3. 「曲を選ぶ」では明示した WAV、MP3、FLAC だけが表示され、「フォルダを選ぶ」では元のフォルダ階層が表示される。
4. タイトル、アーティスト、アルバム、長さと、利用できない曲の状態を確認する。
5. 曲名を選び、Listen で再生・一時停止・seek・音量変更を試す。
6. 「Practiceへ切り替える」を押し、音を止めずに前後5秒移動と速度変更を試す。
7. A地点、B地点を設定してループを始める。Listenへ戻ると通常速度になり、ループだけが止まることを確認する。
8. 前後の曲へ移り、Practice表示と音量を保ちつつ、速度とA・Bが新しい曲の初期値へ戻ることを確認する。
9. Practiceで再生中にMarkerを作り、音が止まらないことを確認する。名前とメモを編集し、時刻を選んで同じ音声内を移動する。
10. Markerを削除し、直後の「元に戻す」で同じMarkerが復元されることを確認する。
11. 一曲が終わると、次の利用できる曲が一度だけ再生されることを確認する。曲末までのA-Bループ中は次の曲へ進まないことも確認する。
12. アプリを終了して起動し直す。native dialogなしで最近の音楽ファイルが検証されるか、音楽フォルダが走査され、曲とMarkerを再び選択できることを確認する。
13. 「曲を選ぶ」または「フォルダを選ぶ」を一度キャンセルし、一覧が失われないことを確認する。
14. file・folderの移動やOS権限変更で自動再オープンできない場合だけ、「再接続」から同じ範囲を選び直す。
15. 「メモ」を開き、Track Noteを書く。曲を再生してからListening Noteも書き、対象の再生区間と分単位の記録日時を確認する。再生区間を選び、同じ音声内の先頭へ移動する。
16. Noteの編集・削除・「元に戻す」を試す。
17. ヘッダー右上の`?`を開き、ヘルプをEscapeと閉じるボタンの両方で閉じられることを確認する。
18. 「過去の耳を探す」でメモ本文を検索し、結果から曲を開く。Marker結果では、その曲の保存位置へ移ることを確認する。
19. Listen、Practice、速度変更、A-Bループ、手動seek、一時停止を試し、Listening Noteが直近の確認済みPlayEventへだけ付くことを確認する。
20. アプリを終了して再起動し、再接続後もNote、Marker、検索結果、PlayEventが残ることを確認する。

検証用の記録やスクリーンショットには、repo外で生成した非個人fixtureを使います。AppConfigのDB、絶対path、個人の実曲名は添付しないでください。

停止は、起動に使ったターミナルで `Ctrl+C` です。

## 検証コマンド

```bash
npm test
npm run lint
npm run build
npm run test:rust
npm run check:rust
npm run tauri build -- --no-bundle
```

最後のコマンドは installer を作らず、現在の OS 向け release executable までを build します。Windows で動くこと、WebView2 で WAV / MP3 / FLAC が実際に再生できることは、Windows 実機で別途確認してください。

macOSでは、Tauri process / WebViewの起動、既存DBからversion 4までのSQLite migration、Note / 検索 / PlayEventを含む保存境界、release app bundle、外部fixtureを使ったWAV / MP3 / FLAC metadata parserまで確認済みです。外部テストfolderでは、scope保存後の完全終了、dialogなしの再起動、自動再走査、Track選択、play / pause状態遷移も確認済みです。個別ファイル選択、Noteの再生区間、ヘルプは自動検査、release build、320px / 1440pxのReact描画まで確認し、今回変更したヘルプのnative WebView実操作は未検証です。スピーカーからの可聴音、Windows buildとWebView2も未検証です。基盤は [Story 0001 検証記録](docs/reports/2026-09-02-story-0001-foundation-verification.md)、音声制御は [Story 0002 検証記録](docs/reports/2026-09-02-story-0002-audio-foundation-verification.md)、永続ライブラリは [Story 0003 検証記録](docs/reports/2026-09-02-story-0003-library-persistence-verification.md)、日常再生は [Story 0004 検証記録](docs/reports/2026-09-02-story-0004-listen-mode-verification.md)、掘り下げ再生は [Story 0005 検証記録](docs/reports/2026-09-02-story-0005-practice-mode-verification.md)、時刻の印は [Story 0006 検証記録](docs/reports/2026-09-02-story-0006-marker-verification.md)、メモ・検索・履歴は [Stories 0007–0009 検証記録](docs/reports/2026-09-02-stories-0007-0009-mvp-verification.md)、最近のfolder再オープンは [Story 0010 検証記録](docs/reports/2026-09-02-story-0010-recent-library-reopening-verification.md)、個別ファイル選択と再生UIは [Story 0011 検証記録](docs/reports/2026-09-02-story-0011-file-selection-and-player-affordance-verification.md)、Noteの時間文脈とヘルプは [Story 0012 検証記録](docs/reports/2026-09-02-story-0012-readable-note-context-and-help-verification.md)、faviconと個人用ドメインquizは [Stories 0013–0014 検証記録](docs/reports/2026-09-02-stories-0013-0014-favicon-and-domain-quiz-verification.md) に分けてあります。

## 利用条件

LoupePlayは個人利用のために開発しており、このリポジトリのソースコードをオープンソースとして利用許諾していません。
GitHubの利用規約や適用法令で認められる場合を除き、第三者による複製、改変、再配布、商用利用を許可する`LICENSE`は付与していません。
依存ライブラリには、それぞれのライセンスが適用されます。

判断の理由と公開リポジトリで残る閲覧範囲は、[ADR 0026](docs/ADR/0026-keep-public-source-unlicensed-for-personal-use.md)に記録しています。

## 開発ルール

- 実装前に `docs/story/` へ Story を作る。
- 判断を反映する前に `docs/ADR/` へ ADR を作る。
- 重要な概念、data ownership、権限、失敗境界などを変える場合は、[実装前理解確認ゲート](docs/development/implementation-understanding-gate.md)を`Passed`にしてからRED testへ進む。局所変更は理由付きで`Skipped`にできる。
- コードより先に失敗するテストを書き、失敗理由を確認する。
- 用語の意味は [ユビキタス言語](docs/ubiquitous-language.md) に揃える。
- コミットは prefix 付きの一行概要、`why`、`what` を持たせる。
- トークン、API キー、パスワード、秘密鍵、実値入りの `.env` や `.npmrc` はコミットしない。

詳細は [AGENTS.md](AGENTS.md)、[Story 0001](docs/story/0001-react-base.md)、[ADR 0001](docs/ADR/0001-react-application-foundation.md)、[ADR 0003](docs/ADR/0003-tauri-sqlite-and-local-audio-boundary.md) を参照してください。

実装前理解確認ゲートの導入根拠と検証結果は、[Story 0015 検証記録](docs/reports/2026-09-02-story-0015-implementation-understanding-gate-verification.md)に残しています。
