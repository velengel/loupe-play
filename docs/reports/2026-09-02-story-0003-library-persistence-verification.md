# Story 0003: 永続ライブラリの検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

選んだ音楽フォルダ、安定した Track identity、走査時点の metadata と path を SQLite に保存し、完成した snapshot だけを公開する境界を実装した。再起動後は保存済み一覧を再生不可で復元し、利用者が native dialog から明示的に再接続する。実装 commit は `bde5726` である。

自動検査、実 SQLite 制約、macOS debug app bundle、process / WindowServer / WebView の起動、外部fixtureの WAV / MP3 / FLAC metadata parse は `PASS` とした。実装済みであることと、現在の GUI セッションで見て操作できたことは分ける。macOS がロック中だったため、visible UI、native dialog、選択後の DB readback、終了後の保存済み一覧、再接続、可聴音は `UNVERIFIED` のままにする。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0003、ADR 0006〜0011、Track identity、Track observation、Library Publication、Folder Generation、再接続などの用語を、実装または判断より先に記録した。 |
| テストファースト | PASS | `3ac6270` で永続化・再走査・再起動表示の失敗テストを先に保存した。レビューで見つけた identity、公開順、generation、metadata failure、commit projection も RED を確認してから GREEN にした。 |
| Frontend 自動検査 | PASS | `npm test`: 15 files / 116 tests。`npm run lint` と `npm run build` も成功した。 |
| Rust 自動検査 | PASS | 通常の `cargo test`: 27 passed / 1 ignored。`cargo check`、`cargo clippy --all-targets -- -D warnings`、`cargo fmt --check` も成功した。ignored の1件はrepo外の実音源を明示指定する検証用である。 |
| SQLite migration | PASS | 分離Bundle IDの初回起動で migration v1 / v2 が `success=1`。read-only確認connectionは `foreign_keys=1`、integrityは `ok`、FK違反0件だった。`foundation_health` は1件、未選択の library table は0件である。 |
| 保存境界 | PASS | 未公開 snapshot、snapshot-scoped Track observation、最後の publication INSERT、global publication sequence、rootごとのgeneration競合拒否を実 SQLite と repository test で確認した。 |
| Track identity | PASS | root、source、source identifier の自然identityから canonical UUID を読み直し、再走査で再利用する。mapping 欠落、空ID、継承プロパティは fail-closed にした。 |
| Metadata failure | PASS | missing / invalid tags はファイル名へfallbackし、properties が読める場合は duration と再生可能性を保つ。scope、symlink、形式、音声構造の失敗は1曲へ隔離し、再生可能に見せない。 |
| 実codec parser | PASS | repo外の180秒fixtureで WAV、MP3、FLAC を1件ずつ読み、content type、fallback title、missing-tags、約180秒の duration を確認した。音源は追跡していない。 |
| Library UI / accessibility | PASS | 階層、missing / unknown、主操作の再接続、成功後focus、named region、heading level、長いmetadata、busy / live領域を component test と独立レビューで確認した。絶対pathはDOMとaccessible nameへ出さない。 |
| 320px / 1440px renderer | PASS | Chromium mockで `innerWidth=320` と420px media queryを確認し、320 / 1440とも横overflow 0、viewport外要素0、private path hit 0、page error 0だった。Tauri / WKWebView の証拠にはしない。 |
| Web 開発サーバ | PASS | `npm run dev -- --host 127.0.0.1` を維持し、`http://127.0.0.1:1420/` は HTTP 200 を返した。 |
| macOS debug app bundle | PASS | commit `bde5726` から署名なし `.app` を分離targetへ生成した。Bundle IDは `com.loupe-play.desktop.story3-smoke-20260902a`、実行ファイルSHA-256は `f6c1106762d11e4af32a5c3cf99f1e6bdd65f832dedad095975890be9fb6817b` だった。 |
| macOS process / WebView 起動 | PASS | 分離app process、WindowServerのmain window record 1枚、1062 × 685、WebKit main frameのload完了、AppConfig DB作成を確認した。WindowServer記録は `onscreen=1`、WebKit logはwindowを `visible=1 / occluded=1` と報告した。 |
| macOS visible UI / native dialog / 選択後DB | UNVERIFIED | GUIセッションのfrontmostが `loginwindow`、画面収録も無効だった。WindowServer recordを利用者が見て操作できた証拠へ昇格しない。したがって3曲の選択、publication row、選択後FK readbackは未確認である。 |
| 保存済み一覧の実再起動 / 再接続 | UNVERIFIED | appの終了・再起動と同じDBのmigration再利用までは確認したが、選択済みlibraryを実WebViewで表示し、dialogから再接続する操作は未確認である。 |
| macOS WKWebView再生 | UNVERIFIED | parser層とaudio controllerはPASS。native dialog後のasset URL、WAV / MP3 / FLACの可聴音は確認していない。 |
| Windows / WebView2 | UNVERIFIED | drive letter、UNC、大小文字、Unicode正規化、長いpath、MSVC build、WebView2 codecをmacOSから推定しない。 |
| 機密情報 | PASS | 音源、DB、env、key containerは追跡対象0件。代表的なtoken、private key、credential assignmentのscanも一致0件だった。 |
| 独立レビュー | PASS | data / security、UI / accessibility、MVP整合性の3系統で確認し、P0 / P1なしへ収束した。既知P2は下記へ残す。 |

## 保存したもの、保存しないもの

SQLite は、選択したroot path、Trackのrelative pathと現在のabsolute path、source identity、表示用metadata、duration、公開順を保存する。Track identityと走査ごとのobservationは別tableである。音源バイナリ、OSのfile permission、再生音、tokenは保存しない。

通常読込は `library_publications.sequence DESC` の先頭だけを見る。途中で失敗したsnapshotや、同じbase generationから遅れて完了したstale snapshotは表示しない。過去の完成snapshotと未公開snapshotは削除せず残るため、将来cleanupを加える場合は参照閉包を別途設計する。

## テストファーストの区切り

- 最初の Story 0003 境界は、保存済みlibrary、metadata fallback、再走査、permission-required UIが未実装の状態で失敗した。
- Track identityをsnapshot rowから分ける前は、Rust 5件とrepository 1件が失敗した。
- publication sequenceをsnapshot準備順から分ける前は、repository 5件とRust 3件が失敗した。
- `invalid-tags` retry前はRust側がcompile RED、frontend側が未知failureとして拒否した。
- folder generation導入前はrepository 7件、Rust 4件、gateway 1件が失敗した。
- publication直前の完了時刻とcanonical mappingのfail-closed化では2件、継承key拒否では1件のREDを確認した。
- pinned Lofty が要求するRust下限をREADMEとmanifestが公開していないREDを確認し、`rust-version = "1.89"` とtoolchain contractを追加した。
- 実装後はfrontend 116件、Rust通常27件、外部fixture 1件がGREENになった。

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
cargo test
cargo check
cargo clippy --all-targets -- -D warnings
cargo fmt --check
git diff --check

CARGO_TARGET_DIR=/private/tmp/loupe-play-story3-target \
  npm run tauri -- build --debug --bundles app --no-sign \
  --config '{"identifier":"com.loupe-play.desktop.story3-smoke-20260902a"}'

LOUPE_PLAY_REAL_AUDIO_FIXTURE_DIR=/path/to/external-fixture \
  cargo test \
  audio_metadata::tests::lofty_reads_external_real_codec_fixtures_without_committing_media \
  -- --ignored --exact
```

外部fixtureは次の相対配置を使う。

```text
root-wave.wav
Session/session-mp3.mp3
Session/session-flac.flac
```

## SQLite readback

分離appの初回起動直後に、read-only接続で次を確認した。

```text
migration 1 create_foundation_health_table success=1
migration 2 create_music_library_tables success=1
foreign_keys=1
integrity_check=ok
foreign_key_check violations=0
foundation_health=1
music_folders=0
track_identities=0
library_snapshots=0
library_publications=0
tracks=0
```

`tracks` のcolumnはTEXTとINTEGERだけで、BLOBはない。0件なのはnative dialogを操作できなかったためであり、選択後の保存成功を示す証拠には使わない。

## 一次情報と採用理由

- [Tauri Dialog plugin](https://v2.tauri.app/plugin/dialog/) は、native dialogが選択pathをruntime scopeへ加える境界に使った。
- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) は、migration、preload、bound execute / selectの実装根拠にした。
- [Tauri Asset Protocol](https://v2.tauri.app/security/asset-protocol/) と [Tauri scope](https://v2.tauri.app/security/scope/) は、空の静的asset scopeと、利用者が選んだ実行中scopeを分ける根拠にした。
- [Tauri commands](https://v2.tauri.app/develop/calling-rust/) と [`spawn_blocking`](https://docs.rs/tauri/latest/tauri/async_runtime/fn.spawn_blocking.html) は、metadata I/Oをfrontendやasync runtime threadへ置かない根拠にした。
- [`lofty::Probe`](https://docs.rs/lofty/0.25.1/lofty/probe/struct.Probe.html)、[`ParseOptions`](https://docs.rs/lofty/0.25.1/lofty/config/struct.ParseOptions.html)、[`TaggedFileExt`](https://docs.rs/lofty/0.25.1/lofty/file/trait.TaggedFileExt.html) は、extensionだけを信じずcontentをprobeし、tag失敗時だけproperties-onlyで再試行する根拠にした。
- [Rust `std::fs`](https://doc.rust-lang.org/std/fs/index.html) は、path検査と後続openの間にあるTOCTOUを残余リスクとして扱う根拠にした。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、短い文と長い文の間隔を整える参照にした。

## 既知の残余リスク

- P2: Rust側はscope、symlink、canonical descendantを確認したあと、pathnameを形式probeとmetadata parseで開き直す。検査とopenの間にローカルfileを差し替えるTOCTOUは残る。descriptor-relative I/Oへ広げず、ADR 0010で受容した。
- 実際に壊れたtagを持つMP3 / FLACは未検証である。properties-only retryの制御は自動テスト済みだが、特定の破損実体を推定しない。
- Windowsで同じfolderを異なる文字列表現にした場合、現在のgeneration排他はSQLite上で同じ `root_path` になる範囲に限られる。
- snapshotとpublicationは追記型で増え続ける。retentionとcleanupは利用量を観測してから別Storyで扱う。

## Surprise & Discovery

- 公開順をwall clockやsnapshot準備順へ置くと、並行操作の完了順と再起動後の表示がずれる。最後のpublication INSERTに順序とgeneration競合を集約すると、表示済みの勝者を補償削除なしで保てた。
- tag parse失敗と音声properties失敗は同じ「読めない」ではない。tagsを外した再試行に成功すれば、file name fallbackのままdurationと再生可能性を保てる。
- Chromeの `--window-size=320` はCSS viewport 320pxの証拠にならなかった。Playwright contextで `innerWidth`、media query、全要素geometryを同時に測る必要があった。
- desktop process、on-screen window、WebView loadがPASSでも、GUIセッションが `loginwindow` ならnative操作は証明できない。起動、描画、操作、DB readbackを同じPASSへまとめてはいけない。
- 実音源をcommitせずにcodec parserを再検証するには、明示的な外部fixture testをignoredで持ち、実行時だけdirectoryを渡す方法が使える。
- 直接依存をpinしていても、READMEのtoolchain下限は自動では追従しない。Lofty 0.25.1のMSRV 1.89をCargo manifestとテストにも置くことで、案内の古さを検出できる。

## 次に実機で見る一点

macOSをロックしていない状態で、外部fixture 3件のfolderを選ぶ。3件の階層・duration・選択を確認して終了し、再起動後に3件が再生不可で残ること、同じfolderへ再接続すると選択可能へ戻ること、DBのpublicationとFK readbackが一致することを一続きで記録する。
