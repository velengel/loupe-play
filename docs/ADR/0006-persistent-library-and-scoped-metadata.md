# ADR 0006: 保存したライブラリと現在のファイル権限を分ける

## Status

Accepted（snapshot の公開方式は ADR 0007 で改訂）

## Context（背景）

Story 0001 と 0002 では、利用者が native dialog で選んだ音楽フォルダを、その実行中だけ走査して再生した。Tauri の Dialog plugin が追加する file system と asset protocol の動的 scope はアプリ再起動後に残らない。一方、Story 0003 では、選んだフォルダと Track の手がかりを SQLite へ保存し、再起動後にもライブラリを表示しなければならない。

保存した絶対パスは、現在そのパスを読める証拠ではない。また、現行 scanner は読めない子ディレクトリを黙って飛ばす。その不完全な結果と前回の一覧を単純に比較すると、権限不足をファイル削除と誤認しうる。

WAV、MP3、FLAC はタグ形式が異なり、タグ欠損や破損も起こる。音源全体を JavaScript へ読み込まずに title、artist、album、duration を得つつ、1曲の失敗でフォルダ全体を失わない境界が必要である。

## Decision（決定とその理由）

- SQLite には、音楽フォルダ、Track identity、現在の locator、ルートからの相対パス、基本メタデータを保存する。音源バイナリ、asset URL、実行中の権限 grant は保存しない。
- migration version 2 で `music_folders` と `tracks` を追加する。`music_folders` は UUID、root path、表示名、選択完了時刻を持つ。`tracks` は UUID、folder 外部キー、source、source identifier、絶対 path、`/` 区切りの relative path、file name、format、title、artist、album、duration、metadata status、更新時刻を持つ。外部キーは `ON DELETE RESTRICT` とし、format、duration、metadata status へ CHECK 制約を置く。BLOB 列は作らない。
- 一度に画面へ出すのは最後に選択を完了した一つの音楽フォルダとする。別フォルダを選んでも過去の row は削除しない。新規 root は Track の保存が終わるまで選択完了時刻を空にし、途中失敗した root が次回起動時のライブラリを上書きしない。
- Track の `id` はアプリが生成する UUID とする。同じ folder の再走査では `(music_folder_id, source, source_identifier)` の競合で既存 ID を保つ。Local の `source_identifier` は、その folder 内で scanner が組み立てた canonical relative path とする。絶対 path の文字列切り出しではなく、再帰中に path segment を持ち回り、保存時だけ `/` で結合する。
- 同じ relative path に現れたファイルは同じ Track として metadata と path を更新する。rename、別 relative path への move、別 root の選択を、根拠なく既存 Track へ再紐付けしない。
- 再起動時は SQLite だけを読み、dialog、file system、asset URL へ触れない。folder access を `permission-required`、各 Track の presence を `unknown` として表示し、利用者が folder を明示的に再選択するまで再生操作を無効にする。
- 再接続 dialog は保存した root path を `defaultPath` に使うが、選択を自動承認とはみなさない。利用者が選び直した root が保存した root と一致するときだけ、既存 library の再走査として扱う。異なる root は新しい library の選択として扱う。
- scanner は `complete` または `partial` と issue 一覧を返す。root を読めない場合は走査全体を失敗させる。子ディレクトリを読めない場合は他の場所を続けるが `partial` とする。symlink は追わない。
- 完全走査では、今回見つかった Track を `present`、保存済みだが見つからなかった Track を `missing` として、そのセッションで表示する。部分走査では、見つかった Track だけを `present`、それ以外を `unknown` とし、`missing` と断定しない。missing row は削除しない。
- presence はこの Story では永続化しない。再起動後は前回の `missing` も含めて `unknown` に戻し、再接続を求める。書き込み途中の失敗から誤った missing 状態を復元しないことを、前回結果の利便性より優先する。
- folder 選択の cancel、root 走査失敗、metadata command の全体失敗、SQLite 保存失敗では、画面上の直前 snapshot と選択中の音源を置き換えない。SQLite は row を削除せず、値は bound parameter で UPSERT する。`selected_at` は全 Track の UPSERT が終わった最後に更新する。
- metadata 抽出は小さな Tauri Rust command の後ろへ置き、Lofty 0.25 系を使う。`Probe::open(...).guess_file_type()` で内容を確認し、WAV、MPEG/MP3、FLAC だけを読む。cover art は読まず、tag と properties だけを `BestAttempt` で読む。blocking I/O は Tauri async runtime の `spawn_blocking` で WebView event loop から外す。
- Rust command は frontend から渡された任意 path を信用しない。Tauri FS scope で root と各 path が許可済みであること、canonical path が canonical root 配下であること、regular file で symlink ではないことを確認してから開く。raw error と絶対 path は画面やログへ渡さず、項目ごとの成功または分類済み失敗だけを返す。
- title、artist、album は空白だけの値を欠損として扱い、primary tag から項目ごとに利用可能な tag へ fallback する。タグを読めない曲も Track として残し、表示 title は file name の最後の拡張子を除いた stem に fallback する。artist と album は不明のまま保存できる。duration は一覧用 metadata とし、再生中は `HTMLMediaElement.duration` を正とする。
- metadata の失敗は directory scan の完全性と分ける。ファイルが存在し、タグを除いた音声 properties を確認できる場合、その Track の presence は `present` のままで metadata status を `fallback` とする。tags と properties の失敗を分ける再検証は [ADR 0010](0010-retry-audio-properties-without-tags.md) で具体化する。
- folder tree は directory table を増やさず、保存した relative path から組み立てる。画面には表示名と相対階層を使い、absolute path を通常表示、tooltip、アクセシブル名へ出さない。
- capability は固定 DB への正式な書き込みに必要な `sql:allow-execute` だけを追加する。`sql:default`、load、close、`fs:allow-read-file`、広い静的 file/asset scope は追加しない。Rust command 自身が動的 FS scope を検査する。

参考:

- [Tauri: Dialog plugin](https://v2.tauri.app/reference/javascript/dialog/)
- [Tauri: SQL plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri: Asset Protocol Scope](https://v2.tauri.app/security/asset-protocol/)
- [Tauri: Command Scopes](https://v2.tauri.app/security/scope/)
- [Tauri: Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/)
- [Tauri: `spawn_blocking`](https://docs.rs/tauri/latest/tauri/async_runtime/fn.spawn_blocking.html)
- [Tauri FS: `FsExt`](https://docs.rs/tauri-plugin-fs/latest/tauri_plugin_fs/trait.FsExt.html)
- [Tauri FS: threat model](https://docs.rs/crate/tauri-plugin-fs/latest/source/SECURITY.md)
- [Lofty: supported formats](https://docs.rs/lofty/latest/lofty/)
- [Lofty: `Probe`](https://docs.rs/lofty/latest/lofty/probe/struct.Probe.html)
- [Lofty: `ParseOptions`](https://docs.rs/lofty/latest/lofty/config/struct.ParseOptions.html)
- [Lofty: `TaggedFileExt`](https://docs.rs/lofty/latest/lofty/file/trait.TaggedFileExt.html)
- [Lofty: `Accessor`](https://docs.rs/lofty/latest/lofty/tag/trait.Accessor.html)

## Rejected Options（却下した選択肢）

- 保存した path を起動時にそのまま走査・再生する: path の存在と現在の OS 権限を混同し、scope 外のファイルへ触れる。
- persisted-scope plugin で選択履歴を直ちに永続化する: 再起動時の操作は減るが、過去に選んだ folder の grant が蓄積する。まずは明示再接続を採用し、利用者が管理・解除できる仕様と一緒に再検討する。
- `$HOME/**/*`、`$AUDIO/**/*`、`**/*` の静的 scope: 再接続は不要になるが、選んでいないファイルまで読める境界になる。
- 読めない子ディレクトリを無視した結果から missing を推定する: 一覧を継続できても、権限不足を削除と誤表示する。
- missing Track を DELETE する: Marker、Note、Play Event が後から Track を参照する設計と両立せず、再出現時の手がかりも失う。
- presence と FS grant を一つの `available` 列として永続化する: セッション限定の権限を再起動後にも有効と誤認する。
- hash、inode、mtime で移動後の同一曲を推測する: 全ファイル hash の費用、Windows の identity 差、誤結合を Story 0003 に持ち込む。
- JavaScript で音源を `readFile` し、`music-metadata` や Blob URL を使う: 長尺音源を WebView のメモリへ複製し、Story 0002 の range access と seek の境界を崩す。
- Symphonia、ffprobe sidecar、形式別 parser を使う: 再生用 decoder の重複、binary 配布と subprocess 権限、形式別の例外処理が、4項目の metadata 抽出に対して大きい。
- metadata failure を folder scan failure にする: 一つの壊れたタグで正常な Track まで一覧から失う。
- directory table を作る: 空 directory の管理要件はなく、Track の relative path から必要な階層を再構築できる。
- partial scan の結果を永続的な完全 snapshot として置き換える: 見つからなかった理由が削除か読取失敗か分からず、誤った欠落を固定する。

## Consequences（結果）

- 再起動後も folder と Track metadata は見えるが、再生前に folder の再選択が一度必要になる。利便性は下がる一方、保存した path を暗黙の許可へ変えない。
- SQLite には利用者の絶対 path、folder 名、file 名、tag が入る。OS の AppConfig にだけ置き、fixture、commit、ログ、通常の画面証拠には実値を出さない責任が残る。
- 完全走査と部分走査を分けるため、UI は `missing` と `確認できない` を別に説明する。状態は増えるが、削除と権限問題を混同しない。
- presence を永続化しないため、前回 missing だった Track も再起動直後には `再接続が必要` と表示される。永続的な last-known state と原子的 scan generation は、必要性を観察してから追加する。
- plugin SQL の複数 `execute` は一つの frontend transaction ではない。当初は既存 root の一部 metadata が先に新しくなる可能性を受け入れていたが、失敗操作が再起動後に部分反映されるため、[ADR 0007](0007-publish-complete-library-snapshots.md) で追記型 snapshot と最後の単一公開マーカーへ改訂した。
- 同じ relative path の内容を差し替えると同じ Track ID を保つ。内容 fingerprint は持たないため、別の音源への置換を検出できない。rename や move は新 Track として扱い、旧 Track は missing として残る。
- Lofty は3形式を一つの interface で扱えるが、破損タグ、複数 tag、VBR duration、文字コードの差は残る。per-file fallback と実 fixture の検証を継続する。
- Rust command は file I/O の追加境界になる。Tauri plugin の dynamic scope が Rust の直接 I/Oへ自動適用されないため、scope と canonical descendant の検査を外す変更は security regression になる。
- `sql:allow-execute` により、侵害された frontend は固定済み LoupePlay DB を変更できる。任意 DB の load と close を開けず、gateway、migration、bound parameter のテストで影響範囲を抑える。
- 大きな library では逐次 metadata 抽出と複数 UPSERT が遅くなる。progress、cancellation、上限付き並行処理、batch transaction は、実測後の Story で扱う。
- Windows の drive letter、UNC、長い path、Unicode normalization の違いは実機確認が必要である。同一性の保証は同じ scanner が返した一つの root 内の relative path に限る。
