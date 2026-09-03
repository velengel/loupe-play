# Story 0006: Marker の検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

Markerは、Practiceで音を止めずに置ける。時刻、名前、メモを後から直し、選べば同じmediaの位置へ戻れる。保存先はsnapshot observationではなく恒久Track identityであり、再走査後も所属を失わない。削除は確認を挟むsoft deleteとし、直後なら同じIDを復元する。

実装は `7513113`、接続を閉じる永続性testは `e2a1a6f` である。frontend 180件、Rust 31件、実SQLite制約、320px / 1440pxのChromium描画、macOS debug app bundle、process / WebView / WindowServer起動を `PASS` とした。一方、実Tauri画面でのfolder選択、実音源を聴きながらのMarker操作、終了後のDB再読込は `UNVERIFIED` である。保存コードがあることと、人が実際に再起動して戻れたことは同じ証拠ではない。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0006、ADR 0014、Marker、マーカー位置を実装前に記録した。実装中に判明したSQLite storage class、原子的readback、完了通知、media readiness、focusの判断もADRへ戻した。 |
| テストファースト | PASS | migration、repository、gateway、panel、ListenPlayer統合を実装前にREDにした。型親和性、原子的readback、duration clamp、再mount競合、古いreload、media未準備時focusも、それぞれ失敗を確認してから修正した。 |
| Frontend 自動検査 | PASS | `npm test`: 20 files / 180 tests。`npm run lint` と `npm run build` も成功した。 |
| Rust 自動検査 | PASS | `cargo test`: 31 passed / 1 ignored。`cargo check`、`cargo clippy --all-targets -- -D warnings`、`cargo fmt -- --check` も成功した。ignoredはrepo外の実音声fixtureを要求する既存testである。 |
| SQLite schema | PASS | migration v3は `markers` を `track_identities` へ `ON DELETE RESTRICT` で接続する。実SQLite testで重複時刻、未知Track、負値、小数、空文字 / BLOBの削除日時、soft delete / restore、親削除、`foreign_key_check` を検査した。 |
| Repository / gateway | PASS | 全値をbindし、create / update / soft delete / restoreを各一つの `RETURNING` 文でreadbackする。0行、複数行、不正rowを拒否する。runtime gatewayの5操作は固定 `sqlite:loupe-play.db` だけを開く。 |
| Marker操作 | PASS | buttonを押した瞬間のfiniteな `currentTime` を整数msへ丸め、0〜durationへclampする。作成・編集・削除・復元はmediaの `play()`、`pause()`、`load()`、source、rate、A-B、volumeを変更しないcomponent testを持つ。 |
| 非同期境界 | PASS | loadとmutationをTrack / generation / sequenceで隔離する。閉じたpanelの保存完了は現在panelを待たせず再読込させる。古い再読込が後の保存を巻き戻す順序をdeferred PromiseでREDにし、全listener通知後の新しいsequenceで無効化した。 |
| 失敗 / privacy | PASS | load、save、delete、restoreは固定文を表示し、既存音声と成功済み一覧を保つ。絶対path、SQL、raw exceptionをDOM、accessible name、consoleへ出さないtestがある。 |
| Keyboard / accessibility | PASS | native button / input / textarea、inline削除確認、Undo、同時刻Markerを区別するaccessible nameを使う。編集、取消、失敗、削除、復元で利用可能な操作へfocusを戻す。media未準備時はdisabledな時刻buttonではなく編集buttonへ戻す。 |
| 320px / 1440px renderer | PASS | 決定論的component fixtureを320 × 1000と1440 × 1000のviewportで描画し、320 × 1864と1440 × 1465のfull-page PNGを実見した。横切れはなく、狭幅ではMarker入力と操作が一列へ移る。fixtureと画像は追跡していない。native WKWebViewの証拠にはしない。 |
| Web 開発サーバ | PASS | `npm run dev -- --host 127.0.0.1` を維持し、`http://127.0.0.1:1420/` はHTTP 200を返した。 |
| macOS debug app bundle | PASS | commit `7513113` から署名なし `.app` を生成した。Bundle IDは `com.loupe-play.desktop.story6-smoke-20260902a`。実行ファイルは48,027,288 bytes、SHA-256は `9b6131f2ca92836e583402999326eb7f6f1a65f90bf96c6c34fa14b14483b38e` だった。 |
| macOS process / WebView / WindowServer | PASS | app PID 25977とWebKit WebContent PID 25980を確認した。WindowServerにはowner PID 25977、layer 0、alpha 1、1180 × 760のon-screen window recordが1件あった。smoke後は両processの終了を確認した。 |
| macOS visible UI / native操作 / 可聴音 | UNVERIFIED | native windowをcaptureして操作していない。実Trackでの作成、再生継続、seek、編集、削除復元、アプリ終了後の再読込を、人が見て聴いた証拠へ昇格しない。 |
| Windows / WebView2 | UNVERIFIED | MSVC build、WebView2描画、codec再生、focus、SQLite runtime差はmacOSから推定しない。 |
| 機密情報 | PASS | tracked fileと差分へ、音源、DB、env、key container、代表的なtoken / private key / credential assignmentがないことをファイル名だけ返す検索で確認した。 |
| 独立レビュー | PASS | repository / schema / UIの3系統で確認した。2系統から得たP1、原子的readback、SQLite型、media readiness、競合、focusをtest-firstで修正した。最終再実行はエージェント利用上限で中断したため、focused 17件と全180件のGREEN、Rust 31件、local P0 / P1 auditで収束を確認した。 |

## テストファーストの区切り

- Marker実装が存在しない状態で、migration、repository、gateway、Practice UI、media不変条件をREDにした。
- SQLiteの `INTEGER` 宣言だけでは `1.5` が保存でき、nullableな削除日時も空文字やBLOBを受け付けた。実SQLite testをREDにし、`typeof(position_ms) = 'integer'` と削除日時のstorage classをCHECKした。
- mutation後に別SELECTを行うと、変更だけ成功してreadbackだけ失敗した状態を「保存失敗」と表示する。0行と複数行を含むrepository testをREDにし、一つの `RETURNING` 文を成功境界にした。
- media metadata前の位置作成と、保存位置が短くなったdurationを越える経路をREDにした。準備前は位置操作を無効化し、作成とseekの双方を現在durationへclampした。
- Practiceを閉じる前のmutationが未解決だと、再び開いたpanelを待たせ続ける案にはできなかった。新panelは即loadし、旧mutationの完了通知でもう一度読むようにした。
- 旧panelの完了通知で始まったloadが、新panel自身の保存より後に返ると新しいMarkerが消えた。17件中1件のfocused REDで順序を固定し、自分自身も含む完了通知で新しいload sequenceを発行した。
- media未準備中の復元は、消えるUndoからdisabledな時刻buttonへfocusを戻そうとした。focusがbodyへ落ちるREDを追加し、利用可能な編集buttonへ戻した。

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check

npm run tauri -- build --debug --bundles app --no-sign \
  --config '{"identifier":"com.loupe-play.desktop.story6-smoke-20260902a"}'
```

## 一次情報と採用理由

- [HTML Standard: media elements](https://html.spec.whatwg.org/multipage/media.html) は、`currentTime`、duration、seekと再生状態を別の境界として扱う根拠にした。
- [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) は、固定DB接続、bind値、migrationとfrontend plugin境界の根拠にした。
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html) は、恒久Track identityへの外部キーと親削除拒否を実SQLiteで検査する根拠にした。
- [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html) は、型名だけに依存せずCHECK制約を明示する判断に使った。
- [文章のリズム](https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432) は、依頼に従い、結論、具体的な失敗、判断の転回を同じ調子で並べないために参照した。

## 既知の残余リスク

- 同時刻Markerの移動・編集・削除buttonは一意な名前を持つが、削除確認group名は時刻だけである。確認中は対象labelを本文に表示するものの、同時刻の確認領域まで一意にする改善余地がある。
- 通常状態の320px / 1440pxは実見したが、focus ring、編集中、削除確認、Undo、load error、極端な長文を個別の画像では確認していない。
- 実SQLiteファイルを閉じ、別接続で同じMarkerを読む自動testはある。実 `.app` を終了し、同じAppConfig DBを再度開いてMarkerを選ぶ一続きの操作は未確認である。
- `RETURNING` を使えるSQLite runtimeを前提とする。現在のmacOS bundleとtest runtimeでは通るが、Windows bundleは別に確認する必要がある。

## Surprise & Discovery

- SQLiteの型名は、整数だけを保存する保証ではなかった。`INTEGER` 列へ小数を渡しても、値が整数へ変換できなければREALのまま残る。位置の不変条件にはstorage classの検査が必要だった。
- 書込み成功とreadback成功を別のSQLへ分けると、画面には失敗、DBには成功という一番扱いにくい境界が生まれた。`RETURNING` は往復を減らすだけでなく、利用者へ成功を知らせる単位を一つにした。
- unmount後のPromiseを無視するだけでは足りなかった。閉じた間に保存は成功しているため、新しいpanelへ結果を混ぜず、「状態が変わった」という通知だけを渡す必要があった。
- その通知も、他panelだけへ送ると逆転した。古い通知loadの後に自分が保存しても新しいload sequenceが始まらず、DBは正しいのに画面だけ古くなる。完了通知は自分自身の既知状態も検証し直す役割を持つ。
- accessibilityの条件は単独ではなく組合せで崩れた。時刻buttonを無効化する判断と、Undo後に時刻へfocusを戻す判断は、それぞれ妥当でも同時には成立しなかった。

## 次に実機で見る一点

実音源を再生したままPracticeへ入り、Markerを作る。音が止まらないことを聴き、アプリを終了して再起動し、再接続後に同じMarkerを選んで同じ位置へ戻れることを一続きで確認する。
