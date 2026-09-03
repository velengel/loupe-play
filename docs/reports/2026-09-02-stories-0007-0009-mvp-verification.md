# Stories 0007–0009: メモ・検索・再生履歴の検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

初期MVPの実装は、三種類のメモを残し、現在のライブラリから探し、曲またはMarker位置へ戻り、その再生区間をPlayEventとして保存できるところまでつながった。

主実装は `4efdaf5` と `9e128d4`、既存DBの起動互換性修正は `90e8681`、responsive reviewの修正は `5a007fe` である。自動検査、新規・既存SQLite、320px / 1440px renderer、macOS release app bundle、process / WebView / WindowServer起動を `PASS` とした。自分の実音源を聴く操作、終了後の手動readback、Windows、独立エージェントの最終レビューは `UNVERIFIED` とする。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0007–0009、ADR 0015–0018、Track Note、Listening Note、Play Event、再生区間、メモ検索、検索結果を実装前または判断前に記録した。 |
| テストファースト | PASS | PlayEvent / Noteのschema・repository・recorder・runtime・UIをREDにした。検索はrepository・UI・Track navigation・metadata後seekをREDにした。実装後に見つかった同一時刻のlibrary再公開とmigration byte driftも、再現REDから直した。 |
| Frontend | PASS | `npm test -- --run`: 28 files / 219 tests。`npm run build` と `npm run lint` も成功した。 |
| Rust / SQLite | PASS | `cargo test`: 34 passed / 1 ignored。`cargo fmt -- --check`も成功した。実SQLiteでNote所有、PlayEvent制約、current publication、literal wildcard、soft delete除外を実行した。ignoredはrepo外の実codec fixtureを要求する既存testである。 |
| Note ownership | PASS | Track Noteは恒久Track identity、Listening Noteは同じTrackの確認済みPlayEventへ属する。空本文、別Track event、削除済みrowを拒否し、二種とも作成・一覧・編集・削除・復元を持つ。 |
| PlayEvent | PASS | `playing`で開始し、pause / ended / Track / mode / rate / loop / manual seek / retry / failure / unmountで区切る。queueはclose→startを直列化し、loop wrapとprogress観測では書かない。次のstart前に未完了eventを`recovered_at`で回収する。 |
| Search SQL | PASS | 一つの共有SQLをfrontendとRust実SQLite testで使う。最新publicationのTrackだけへjoinし、activeなTrack Note / Listening Note / Markerとmetadataを`UNION ALL`する。`!`、`%`、`_`をescapeしたpattern一つだけをbindし、100件で止める。 |
| Privacy / failure | PASS | 検索DTOは種別、Track identity、表示metadata、要約、日時、任意位置だけを返す。SQLはpath、root、source identifierを選ばない。UIはraw DB error、SQL、絶対pathを表示しない。 |
| Navigation / concurrency | PASS | Marker結果は独立したseek request identityを持ち、対象Trackのmetadata後に一度だけ適用する。duration超過は曲末へclampする。query変更、遅い応答、Track変更、同一folder / selectedAtの再公開を世代で隔離する。 |
| Keyboard / controls | PASS | native search input / button、結果button、Note input / textarea / buttonを使う。検索成功時は最初の結果、Trackを開いた後は再生buttonへfocusを移す。Noteと検索の操作面は44px以上へ揃えた。 |
| 320px / 1440px renderer | PASS | 決定論的fixtureを320 × 900と1440 × 1000の実viewportで描画した。full-page PNGは320 × 2279 / 150,353 bytesと1440 × 1961 / 185,876 bytes。長い本文、日時、二種のNote、検索結果に横切れはなく、320pxでは入力・結果・操作が一列になる。画像とfixtureは追跡していない。 |
| 既存DB migration | PASS | canonical AppConfig DBを削除せず起動した。`_sqlx_migrations` はversion 1–4をすべて`success = 1`で保持し、`PRAGMA foreign_key_check`は0件だった。 |
| Web開発サーバー | PASS | PID 4210が`127.0.0.1:1420`をLISTENし、sandbox外のloopback確認でHTTP 200を返した。 |
| macOS release app | PASS | commit `5a007fe`から`.app`だけを生成した。実行ファイルは16,836,416 bytes、SHA-256は`33ab8e85af2ac0866de9a36f93f93e21ee2bec5608d30d6b788d9d90a0f541e4`。最終起動はapp PID 51944、WebContent PID 51947、WindowServer上の1062 × 685 window 1枚で、アプリは起動したままにした。 |
| DMG | FAIL | `bundle_dmg.sh`で包装に失敗した。`.app`限定buildは成功しており、今回の「触って動かす」成果物は`.app`を正とする。 |
| native visible UI / 実音源 / 再起動手動操作 | UNVERIFIED | WindowServerのwindow recordはあるが、capture APIはwindow / rectとも画像を返さなかった。個人の音楽folderは選ばず、可聴再生、Note・検索・履歴の手動readbackを自動検査と同一視しない。 |
| Windows / WebView2 | UNVERIFIED | Windows build、WebView2描画、codec、SQLite、focusはmacOSから推定しない。 |
| 独立レビュー | UNVERIFIED | repository / schema / UIの並列担当は利用上限に達した。local reviewとdesigner reviewでmigration互換性、publication競合、Note操作面を修正したが、別エージェントの最終判定には置き換えない。 |
| 機密情報 | PASS | tracked fileと差分へ、代表的なtoken、access key、private keyを示すパターンがないことを確認した。DB、音源、responsive fixture、PNGはcommitしていない。 |

## 主要な境界

Listening Noteは、曲を選んだだけでは書けない。mediaの`playing`を確認してPlayEventが保存された後だけ、そのevent IDへ接続する。履歴を増やすための架空セッションは作らない。

PlayEventはprogress logではない。条件のそろった連続再生区間である。mode、rate、有効loop、手動seekが変われば旧区間を閉じ、音が続いていれば次を開く。loop wrapは同じ区間の内部に残す。

検索は全文検索indexではない。現在公開中のsnapshotだけを、SQLite既定のliteralな部分一致で探す。日本語の正規化やrankingを実装したようには扱わない。

## 実行した主要コマンド

```text
npm test -- --run
npm run build
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check

npm run tauri build -- --bundles app
npx playwright screenshot --viewport-size="320,900" --full-page ...
npx playwright screenshot --viewport-size="1440,1000" --full-page ...
```

## 一次情報と採用理由

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html) は、requestではなく`playing`を確認済み再生の開始とし、metadata後にseekする根拠にした。
- [Tauri SQL plugin: Migrations](https://v2.tauri.app/plugin/sql/#migrations) は、migrationをversion順に登録し、plugin初期化で適用する境界の根拠にした。
- [SQLite LIKE](https://www.sqlite.org/lang_expr.html#the_like_glob_regexp_match_and_extract_operators) は、`LIKE ... ESCAPE`とSQLite既定の大小文字規則を採用する根拠にした。
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html) は、Listening NoteとPlayEventの同一Track所有をDBでも拒否する根拠にした。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、結論、失敗、判断の転回を単調に並べないために参照した。

## Surprise & Discovery

- 適用済みmigrationは、SQLとして同じでも空白が変われば別物になった。新規DBのschema testは通り、既存DBだけがplugin初期化前に終了した。versionだけでなく生文字列を固定するtestが必要だった。
- library publicationの時刻だけでは、同一ミリ秒の再公開を区別しきれない。検索surface専用のepochを持たせると、folder IDと時刻が同じでも古い結果を捨てられた。
- 検索だけをresponsiveにしても体験は揃わない。隣のNote buttonがnative defaultの約30pxに戻っていた。320pxで一つの縦動線として見ることで、component単体のGREENでは見えない差が出た。
- macOSのWindowServerはwindowを報告しても、現在の権限境界ではwindow ID / rect captureが画像を返さなかった。process、window record、見える画面、操作、可聴音は別の証拠として残す必要がある。

## 次に人が行うStory

First InstructionのStory 9は、数日をかける実利用である。開いたままの`.app`で自分の音楽folderへ再接続し、普通の鑑賞、ドラム練習、DTM reference観察を行う。使った機能、使わなかった機能、詰まった操作を記録する。Story 10の削除・統合は、その観測前に決めない。
