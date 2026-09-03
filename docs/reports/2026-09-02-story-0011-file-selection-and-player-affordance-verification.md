# Story 0011 検証記録: 曲を選びやすく、再生状態を読み取りやすくする

## 結論

個別ファイル選択と再生UIの実装は`PASS`。WAV、MP3、FLACを複数選択し、選択したpathだけを一つのファイルライブラリとして保存・再オープンする境界を追加した。フォルダ一括選択は残している。

UIでは「曲を選ぶ」と「フォルダを選ぶ」を用途ごとに分けた。Listenでは現在位置を大きな時刻として独立させ、前曲、再生・一時停止、次曲に記号と文字を併記した。自動検査、release build、320px / 1440pxのReact実描画は`PASS`。native dialogの実操作、実WebViewの表示、可聴音は`UNVERIFIED`として分ける。

## 変更の根拠

- `d407127 docs: start file selection and player affordance story`: Story 0011と用語を実装前に記録した。
- `70608ad docs: decide scoped file libraries and player hierarchy`: scope、identity、再オープン、UI階層をADR 0020で決めた。
- `30f7440 test: define file selection and player affordance behavior`: ファイル選択、exact-file scope、再オープン、記号、時刻、responsive layoutのREDを保存した。
- `f5e440d feat: open exact music files with clearer player controls`: Tauri / Rust境界とReact UIを実装した。
- `e413fc5 fix: keep source actions compact on narrow screens`: 最初の320px描画で見つかった縦方向の間延びを、追加のREDから修正した。
- [Tauri Dialog API](https://v2.tauri.app/reference/javascript/dialog/)は、`multiple`、`directory`、filter、複数選択時の戻り値の根拠にした。
- [Tauri File System plugin](https://v2.tauri.app/plugin/file-system/)は、command permissionだけでは任意pathのscopeが付与されないため、明示選択した各fileだけを検証する根拠にした。
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)と[Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)は、44px相当の操作領域と見えるfocus indicatorを保つ基準にした。
- [MDN `aria-hidden`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden)は、可視記号を装飾として扱い、accessible nameを文字ラベルへ一本化する根拠にした。

## Test-first証拠

実装前の対象実行では、frontendはファイル選択API、UI、scope、時刻・記号の契約が未実装で4 testsが失敗した。Rustはexact-file boundaryが未定義でcompile errorになった。CSSの狭幅契約も実装前に3 testsが失敗した。

最初の320px描画では、横向きの`flex-basis`がheadingの縦積み後に高さとして働き、選択カードが間延びした。`flex-basis: auto`を要求するtestが1件失敗することを確認してから修正し、対象3 testsをGREENへ戻した。

## 自動検査

| 層 | コマンド | 結果 |
|---|---|---|
| frontend regression | `npm test` | `PASS`: 30 files、229 tests |
| lint | `npm run lint` | `PASS`: warningなし |
| frontend production | `npm run build` | `PASS`: TypeScript + Vite |
| Rust unit / SQLite | `cargo test --manifest-path src-tauri/Cargo.toml` | `PASS`: 36 passed、1 external-fixture test ignored |
| Rust format | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | `PASS` |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | `PASS` |
| Rust compile | `cargo check --manifest-path src-tauri/Cargo.toml` | `PASS` |
| macOS release bundle | `npm run tauri build` | `PASS`: `.app`とaarch64 DMG |
| whitespace | `git diff --check` | `PASS` |
| secret / personal data | tracked fileと差分のpattern scan | `PASS`: token、秘密鍵、実値入りenv、個人音源、DBを未追跡 |

## UI review

| 対象 | 結果 | 証拠 |
|---|---|---|
| Library入口 320px | `PASS` | 320 × 1000のChromium実描画で、二つの操作が一列に並び、用途の補足とdesktop専用説明が横切れしないことを実見した。初回描画で見つけた過大な高さは修正後に再描画した。 |
| Library入口 1440px | `PASS` | 1440 × 1000のChromium実描画で、曲の直接選択をprimary、folder一括選択をsecondaryとして同じ行で区別できることを実見した。 |
| Listen 320px | `PASS` | 非個人の一時component fixtureを320 × 1000で描画した。長い曲名はellipsisになり、`0:05 / 0:33`、mode切替、seek、三つのtransport、音量が横overflowせず収まった。fixtureとPNGは追跡していない。 |
| Listen 1440px | `PASS` | 同じfixtureを1440 × 1000で描画し、曲名と時刻が左右に分離し、▶付きprimary操作と⏮ / ⏭付きsecondary操作の階層を実見した。native WKWebViewの証拠にはしない。 |
| keyboard / accessible name | `PASS` | DOM testで操作順、記号の`aria-hidden`、明示ラベルを固定し、CSS testで3pxの`focus-visible` outlineと44px相当のtargetを固定した。 |

## 実アプリ検証

`npm run tauri build`でrelease `.app`とDMGを生成した。release process、WindowServer上の1062 × 685 window、WebKit main frameのload / paintは確認できた。

一方、このGUIセッションではSystem Eventsがprocessを見つけてもwindowを0件と返し、画面captureも画像を返さなかった。通常の`open`による再起動とfrontmost化でも変わらず、Terminal経由の起動もOS側で完了しなかった。このため、native file dialogから外部fixtureを選ぶ操作、実WebView上の時刻とtransport、可聴再生は`UNVERIFIED`のままにする。

公式のin-app browserもtrusted code pathの解決エラーで開始できなかった。UI reviewはインストール済みChromium headless shellを用いたReact実描画であり、native operationと同一視しない。

## Surprise & Discovery

- Tauriのfile dialogが追加するscopeは、複数fileの共通parentではなく明示選択した各pathである。folder Libraryへ読み替えず、exact-file metadata commandを分けることで、利用者が選んでいない隣の音源へ権限と処理を広げずに済んだ。
- 既存schemaを変更しなくても、画面へ出さずpathとして扱わない仮想rootと、各fileの絶対pathをlocal-only source identifierに使えば、別folderの同名fileを一つのLibraryで区別できた。適用済みmigrationのbyte列は変更していない。
- 320pxでgridを一列にするだけでは十分ではなかった。親が縦flexへ変わると、desktop向け`flex-basis`が高さになった。実描画と狭幅専用testの両方が必要だった。
- process、WindowServer window、WebView loadが確認できても、Accessibility treeとcaptureが得られなければ実操作の証拠にはならない。起動、React描画、native操作を別の層に保った。

## 残るリスク

- native dialogと実WebViewの一続きの操作は未検証である。ロックされておらずAccessibility windowを列挙できるGUIセッションで、複数folderからのfile選択、一覧、再生、終了後の自動再オープンを確認する必要がある。
- Persisted Scopeは過去に選んだfile / folderも保持しうる。現在はscopeの確認・解除UIがない。
- ファイルライブラリは新しい選択で置き換える。追加・削除を個別管理するLibrary履歴UIは別Storyである。
- Windows / WebView2でのdialog、codec、installer、実スピーカーの可聴音は未検証である。
