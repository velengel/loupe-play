# Story 0005: Practice モードの検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

ListenとPracticeを別playerにせず、一つのmedia elementと音声セッションの二つの操作面として実装した。現在曲、再生位置、再生・一時停止の意図、音量を保ったままPracticeへ入り、前後5秒、音程を保つ速度変更、A-Bループを使える。Listenへ戻るとrateを1へ戻し、loopをOFFにする。A・Bと診断値は残る。

実装は `a048a82` である。frontend自動検査、Rust自動検査、320px / 1440pxのChromium描画、macOS debug app bundle、process / WindowServer / WebView起動は `PASS` とした。実装、Web renderer、native process、可聴操作を同じ証拠にはしない。native windowのcaptureに失敗したため、実Tauri画面の可視操作と可聴ループは `UNVERIFIED` のままにする。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0005、ADR 0013、Listen、Practice、A-Bループ、再生速度を、実装より先に記録した。 |
| テストファースト | PASS | 最初のfocused runは5 filesで10 failed / 50 passedだった。親見出し、曲末競合、load / rate error競合、accessible nameも、各修正前のREDを確認した。 |
| Frontend 自動検査 | PASS | `npm test`: 17 files / 136 tests。`npm run lint` と `npm run build` も成功した。 |
| Rust 自動検査 | PASS | 通常の `cargo test`: 27 passed / 1 ignored。`cargo check`、`cargo clippy -- -D warnings`、`cargo fmt -- --check` も成功した。Rustとmetadata parserはこのStoryで変更していない。 |
| 音声セッション継続 | PASS | modeをmediaのkey、source URL、source effectへ含めない。切替でnode、位置、音量、再生意図を保ち、`pause()` と `load()` を呼ばないcomponent testがある。 |
| Practice操作 | PASS | ±5秒を0〜durationへclampし、0.50x〜1.00xの9候補をpitch preservationより後ではなく先に設定する。A・Bは現在位置へ置き、`A < B` のときだけloopをONにできる。 |
| Listen復帰 | PASS | rate 1の適用に成功した場合だけListenへ移り、loopをOFFにする。A・B、位置、再生状態、音量、診断値は保持する。rate適用失敗時はPracticeに留まる。 |
| Track変更 | PASS | Practice表示、音量、Story 0004の再生意図は保つ。新しいTrackの位置、rate、A・B、loop、診断値、Track固有errorはsource-scoped resetで初期化する。 |
| A-B loop競合 | PASS | 描画frameと `timeupdate` は同じcontrollerを使う。Listen復帰直後の旧frameを同期refで止める。有効なPractice loopは、Bがdurationと一致し、`seeking → pause → ended` が同一taskで並んでも次曲へ渡さない。 |
| 失敗回復 / privacy | PASS | load errorは遅いplay rejectionとrate rejectionより優先し、再読込を残す。raw error、絶対path、asset URLは画面とaccessible nameへ出さない。 |
| Keyboard / accessibility | PASS | native button、range、selectを使い、44px以上の主要操作領域とfocus ringを持つ。mode移動は遷移先を名前にしたaction buttonとし、player region、親見出し、再生操作groupは現在modeへ揃える。 |
| 320px / 1440px renderer | PASS | 一時的な決定論的component fixtureをPlaywrightで320 × 1000と1440 × 1000のviewportに描画し、320 × 1804と1440 × 1517のfull-page画像を実見した。横切れはなく、長いtitle / metadataはellipsis、phoneではPractice操作が1列へ移る。fixtureと画像は追跡していない。native WKWebViewの証拠にはしない。 |
| Web 開発サーバ | PASS | `npm run dev -- --host 127.0.0.1` を維持し、`http://127.0.0.1:1420/` はHTTP 200を返した。 |
| macOS debug app bundle | PASS | commit `a048a82` から署名なし `.app` を生成した。Bundle IDは `com.loupe-play.desktop.story5-smoke-20260902a`。実行ファイルは48,027,320 bytes、SHA-256は `6c8d7cdd0016b53ad89e960c8b4f5b2db52f8addca44212237d7277b3e2ae90a` だった。 |
| macOS process / WebView / WindowServer | PASS | app PID 93577とWebKit WebContent PID 93581を確認した。WindowServerにはowner PID 93577、layer 0、alpha 1、1062 × 685のon-screen window recordが1件あった。smoke後はapp processを終了した。 |
| macOS visible UI / native操作 / 可聴音 | UNVERIFIED | Accessibilityはprocessを認識したがwindow countは0だった。WindowServer ID 5969のcaptureも `could not create image from window` で失敗した。folder選択、実Track、mode継続、速度、A-B、曲末loopを、人が見て聴いた証拠へ昇格しない。 |
| Windows / WebView2 | UNVERIFIED | MSVC build、WebView2描画、codec再生、path差異、A-B loop精度はmacOSから推定しない。 |
| 機密情報 | PASS | tracked fileと差分へ、音源、DB、env、key container、代表的なtoken / private key / credential assignmentがないことを確認した。 |
| 独立レビュー | PASS | async / media lifecycleとdesigner / accessibilityの2系統で確認した。発見した2件のP1と2件のaccessibility P2をtest-firstで修正し、P0 / P1なしへ収束した。 |

## テストファーストの区切り

- mode actionとPractice UIがない状態で、5 filesの60件中10件をREDにした。media継続、±5秒、rate、A-B、旧frame、Track変更、responsive契約を実装してGREENにした。
- player内だけPracticeへ変わり、親の画面見出しがListenのままだった。App testをREDにし、modeだけを親へ通知して見出しを変え、source URLを作り直さないようにした。
- Bが曲末にあると `timeupdate` 後の `ended` が次曲へ漏れた。回帰testをREDにし、有効loopが `ended` を所有するようにした。
- `seeking → pause → ended` が同じReact commitより先に続くと、一時flagが落ちてqueueへ漏れた。三eventを同じ `act` で発火してREDにし、宣言済みloop状態で所有判定するようにした。
- load failure中にListen復帰のrate設定も失敗すると、rate errorがload errorを上書きした。reducerとcomponentの2件をREDにし、再読込できるload errorを優先した。
- mode移動buttonの変化する名前と `aria-pressed` がtoggle契約として食い違い、Practiceでも再生操作groupがListen名だった。2件をREDにし、action buttonと動的group名へ直した。

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check

npm run tauri -- build --debug --bundles app --no-sign \
  --config '{"identifier":"com.loupe-play.desktop.story5-smoke-20260902a"}'

npx playwright screenshot --viewport-size='320,1000' \
  --wait-for-selector='html[data-fixture-ready="true"]' \
  --wait-for-timeout=500 --full-page \
  http://127.0.0.1:1420/story5-visual.html \
  /private/tmp/loupe-practice-playwright-320-fixed.png

npx playwright screenshot --viewport-size='1440,1000' \
  --wait-for-selector='html[data-fixture-ready="true"]' \
  --wait-for-timeout=500 --full-page \
  http://127.0.0.1:1420/story5-visual.html \
  /private/tmp/loupe-practice-playwright-1440-fixed.png
```

## 一次情報と採用理由

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html) は、media elementの状態、`play()`、`pause`、`timeupdate`、`ended` が非同期に交差する境界を実装契約にする根拠とした。
- [HTML Standard: animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames) は、予約済みcallbackのhandleと取消だけに頼らず、実行時にも現在modeを確認する根拠とした。
- [React: `useRef`](https://react.dev/reference/react/useRef) は、再描画へ使わないmode、source、play request、loop callbackのidentityをevent handler間で同期共有する根拠とした。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、短い結論と根拠のまとまりを整える参照にした。

## 既知の残余リスク

- P2: `seeking → pause → ended` でも次曲へ漏れないことは固定したが、その後の `seeked` でAへ着地し、再生を継続する可聴挙動までは自動testで固定していない。
- P2: Practiceでrate、A・B、診断値を作った後の同一source retryはreducer上で全初期化する。componentを通した組合せtestはない。
- P2: animation frameと `timeupdate` が隣接して同じ境界を観測しても、media `seeking` で二重seekを抑える。`wrapCount` が一度だけであることを二つのcallbackを並べたtestでは直接固定していない。
- A-B loopはHTML mediaとWebViewの通知間隔に依存する。表示した境界超過と着地点誤差は補助観測であり、可聴精度の合格保証ではない。
- 320pxでは長いtitle、artist、albumをellipsisする。全文はDOMとaccessible textに残るが、title以外にtooltipはない。

## Surprise & Discovery

- modeはsource identityではない。見た目の切替をmediaのkeyへ混ぜると、同じ曲でもresource lifecycleを再開し、耳へ引っかかった瞬間を失う。
- React effectのcleanupだけでは、すでに予約されたframe callbackを閉じ切れない。切替event内でmode refを先に変え、callback自身も同期値を見る必要があった。
- Bが曲末と一致すると、Aへseekした後でもend-of-media由来の `ended` が届きうる。さらに `pause` が先行すると一時的なloop稼働flagは落ちる。queue所有権はevent順ではなく、Practice、source、妥当なA・B、loop ONという宣言状態から決める必要があった。
- load failureはrate failureより行動上の優先度が高い。last-event-winsにすると、通常速度へ戻せなかったという副次エラーが、音源を再読込する唯一の操作を消してしまう。
- component内のmodeだけを変えると、画面の大見出しはListenのまま残った。親へmodeだけを通知し、URL生成やmedia lifecycleへ戻さない境界が必要だった。
- 一時fixtureが不正なasset URLを使うと、見た目は描画できてもload error状態の画像になる。決定論的な有効media状態を作り、証拠画像の状態自体を確認し直す必要があった。

## 次に実機で見る一点

macOSをロックしていない状態で、一曲を再生したままPracticeへ入る。0.80xで曲末までのA-Bを動かし、位置と音量が切れず、次曲へ漏れず、Listenへ戻ると1.00xになる一続きの可聴操作を確認する。
