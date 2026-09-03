# Story 0004: Listen モードの検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

表示中の Library Snapshot から、利用できる Track だけを画面と同じ順序で並べ、現在曲、再生・一時停止、seek、音量、前後曲、自動次曲を一つの Listen 操作面へまとめた。通常のリスニングに不要な速度、5秒移動、A-Bループ、診断値はまだ見せない。実装は `9922c93`、`d8bd04a`、`6660c66`、`330f031`、競合修正は `9dd371a`、狭幅修正は `2a7e406` である。

frontend自動検査、Rust自動検査、実codec parser、320px / 1440pxのChromium描画、macOS debug app bundle、process / WindowServer / WebView起動は `PASS` とした。実装されていること、Web rendererで描画できること、native画面を人が見て実音源を操作できたことは分ける。現在のGUIセッションではnative windowをcaptureできなかったため、visible UI、folder選択、再接続、可聴再生は `UNVERIFIED` のままにする。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0004、ADR 0012、再生キュー、現在曲を、実装より先に記録した。 |
| テストファースト | PASS | queue、volume、custom player、library連携、responsive contractを、それぞれ未実装または旧挙動で失敗する状態から始めた。非同期レビューで見つけた再生意図、load failure、retry世代の競合も、再現テストのREDを確認してからGREENにした。 |
| Frontend 自動検査 | PASS | `npm test`: 17 files / 123 tests。`npm run lint` と `npm run build` も成功した。 |
| Rust 自動検査 | PASS | 通常の `cargo test`: 27 passed / 1 ignored。`cargo check`、`cargo clippy --all-targets -- -D warnings`、`cargo fmt --check` も成功した。 |
| 実codec parser | PASS | repo外の180秒fixtureを期待する相対配置へ複製し、明示的なignored testだけを実行した。WAV、MP3、FLACの3形式を1件ずつ読み、testは1 passedだった。音源は追跡していない。 |
| 再生キュー | PASS | 表示中snapshotの `granted` かつ `present` のTrackだけを、直下Track、その後に子folderをdepth-firstでたどる決定順へ置く。現在位置は配列indexではなくTrack identityで解決し、先頭と末尾はwrapしない。 |
| Listen transport | PASS | native controlsを隠し、現在曲、再生・一時停止、seek、音量、前後曲を一つの操作面へ置いた。手動移動は直前の再生意図を運び、一覧からの明示選択は停止状態で開く。 |
| 自動次曲と失敗 | PASS | `ended` は現在sourceで一度だけ処理する。次曲は読込可能になってから再生し、末尾は停止する。loadまたはplay失敗は現在曲を保ち、固定文と再試行方法を出し、自動skipしない。 |
| 非同期競合 | PASS | source identityとは別にplay Promise tokenと再生意図を持つ。source変更、pause、ended、load failure、retryで旧tokenを無効化し、旧sourceや旧retryの結果が現在状態を上書きしない。 |
| Privacy / security | PASS | playback URLは権限が `granted` で存在する明示選択Trackにだけ生成する。絶対path、asset URL、raw errorをDOM、accessible name、logへ出さず、Tauriの静的asset scopeとCSPを広げていない。 |
| Keyboard / focus | PASS | native buttonとrangeを使う。明示的な一覧選択だけ再生buttonへfocusを移し、前後button、自動次曲、retryは既存focusを奪わない。transportの操作領域は44px以上である。 |
| 320px / 1440px renderer | PASS | Playwrightで実viewportを320 × 1000と1440 × 1000に固定した画像を確認した。320pxでも境界と3つのtransport buttonは収まり、長いtitle、artist、albumはellipsisとなり、focus ringは切れなかった。native WKWebViewの証拠にはしない。 |
| Web 開発サーバ | PASS | `npm run dev -- --host 127.0.0.1` を維持し、`http://127.0.0.1:1420/` はHTTP 200を返した。 |
| macOS debug app bundle | PASS | commit `2a7e406` から署名なし `.app` を生成した。Bundle IDは `com.loupe-play.desktop.story4-smoke-20260902a`。実行ファイルは48,027,320 bytes、SHA-256は `a6103b250c85eed11bff6c5e3a8319842144883679bb98057369346bebee57b5` だった。 |
| macOS process / WebView / WindowServer | PASS | app processとWebKit WebContent processを確認した。WindowServerにはowner PIDとlayer 0、alpha 1、1062 × 685のon-screen window recordがあった。smoke後はapp processを終了した。 |
| macOS visible UI / native操作 / 可聴音 | UNVERIFIED | Accessibilityはprocessを認識したがwindowを列挙できず、WindowServer window captureも失敗した。native dialog、実Track選択、Listen操作、再起動、再接続、WAV / MP3 / FLACの可聴音を、人が見て操作した証拠へ昇格しない。 |
| Windows / WebView2 | UNVERIFIED | MSVC build、WebView2の描画、codec再生、Windowsのpath差異はmacOSから推定しない。 |
| 機密情報 | PASS | tracked fileと差分へ、音源、DB、env、key container、代表的なtoken / private key / credential assignmentがないことを確認した。 |
| 独立レビュー | PASS | data / security、async / queue、designer / accessibilityの3系統で確認し、P0 / P1なしへ収束した。残るP2は下記へ分離した。 |

## テストファーストの区切り

- queue moduleがない最初の実行で4件がREDになり、可視順、利用可否、identity、境界を実装してGREENにした。
- volume helperがない状態で2件がREDになり、0〜1のclampとmediaへの再適用を実装した。関連するaudio session 16件がGREENになった。
- Listen componentがない状態とfocus契約がない状態をREDにし、custom transportを実装した。
- libraryが旧playerを表示する状態で6件、Appが技術検証用の旧階層を持つ状態で4件がREDになり、Listenへ統合した。
- responsive ruleがない状態と、seekがDOM順でtransportの間にある状態を、それぞれcontract testでREDにした。
- `play()`が未解決の間と次sourceのloading中に手動移動すると再生意図を落とす2件をREDにし、media状態とは別の意図を導入した。
- load errorのあとに遅いplay rejectionが再読込導線を消す2件、retry成功後に旧play rejectionが現在状態を壊す1件をREDにし、error優先度とplay tokenを直した。
- 実320px画像でmetadataの横overflowを見つけ、flex子の縮小契約がないことをtestでREDにしてから、`width` と `max-width` を加えた。

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
git diff --check

LOUPE_PLAY_REAL_AUDIO_FIXTURE_DIR=/private/tmp/loupe-play-story4-real-codecs \
  cargo test --manifest-path src-tauri/Cargo.toml \
  audio_metadata::tests::lofty_reads_external_real_codec_fixtures_without_committing_media \
  -- --ignored --exact

npm run tauri -- build --debug --bundles app --no-sign \
  --config '{"identifier":"com.loupe-play.desktop.story4-smoke-20260902a"}'

npx playwright screenshot --viewport-size='320,1000' \
  --wait-for-selector='.listen-player' --wait-for-timeout=500 \
  http://127.0.0.1:1420/ /private/tmp/loupe-listen-playwright-320-fixed.png

npx playwright screenshot --viewport-size='1440,1000' \
  --wait-for-selector='.listen-player' --wait-for-timeout=500 \
  http://127.0.0.1:1420/ /private/tmp/loupe-listen-playwright-1440-fixed.png
```

## 一次情報と採用理由

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html) は、`play()` Promise、`load()`、media eventの非同期性、volumeの範囲を実装契約にする根拠とした。
- [WAI-ARIA Authoring Practices: Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) は、独自sliderを再発明せず、native rangeへ名前と値を与える判断に使った。
- [React: `useRef`](https://react.dev/reference/react/useRef) は、描画に使わないsource identity、play token、再生意図をevent handler間で共有する根拠とした。
- [Tauri Asset Protocol](https://v2.tauri.app/security/asset-protocol/) と [Tauri scope](https://v2.tauri.app/security/scope/) は、利用者が選んだ実行中scopeだけから音源URLを作り、静的scopeを広げない確認に使った。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、短い判断と長い根拠の間隔を整える参照にした。

## 既知の残余リスク

- P2: 同じTrackの再選択と成功した再走査でmedia elementを交換し、音量を保つことは実装契約に沿うが、その組合せのcomponent testはない。
- P2: 旧play Promiseの遅延rejectionは再現済みだが、遅延resolveだけを独立させたcomponent testはない。tokenはresolveとrejectionの両方を同じ世代判定で隔離する。
- P2: 取り外した旧mediaへ送る擬似 `ended` は、実browserの旧resource eventと同じ強さの証拠ではない。自動次曲がfocusを奪わないことも個別assertではなく、実装と他のfocus testで確認している。
- P2: 320pxでartistとalbumはellipsisになる。全文はDOMとaccessible textに残るが、titleのようなtooltipはない。
- OS側の音量、mute、出力先、codec実装により、DOMのvolume値と可聴音は一致しないことがある。native実機確認が別に要る。

## Surprise & Discovery

- 連打中の再生継続は、遅れて届くmediaの再生状態では決められない。利用者が最後に要求した再生意図を、sourceごとに別管理する必要があった。
- load failureは、あとから届いた同じsourceの `play()` rejectionより強い。単純なlast-event-winsでは、再読込buttonが再生buttonへ変わってしまう。
- source identityだけでは、同じURLを再読込するretryの旧Promiseを区別できない。play要求にも独立した単調増加tokenが必要だった。
- macOS Chromeの `--window-size=320` は、CSS viewport 320pxを保証しなかった。Playwrightの `--viewport-size` で描画面を固定して初めて、狭幅の証拠として扱えた。
- `align-items: flex-start` のflex columnでは、子が内容由来のmax-content幅を取りうる。ellipsisを確実にするには、文字列自身だけでなく親へ `width: 100%` と `max-width: 100%` が要った。
- app process、WebView、WindowServer recordが揃っても、native windowをcaptureし、人が操作できた証拠にはならない。起動とvisible operationは別の検証層である。

## 次に実機で見る一点

macOSをロックしていない状態で、外部fixtureのfolderを選ぶ。ListenでWAV、MP3、FLACを順に再生し、手動次曲、自動次曲、音量保持、末尾停止、再読込を可聴音とともに一続きで記録する。
