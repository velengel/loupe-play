# ADR 0010: タグ解析失敗時は音声 properties だけを再検証する

## Status

Accepted

## Context（背景）

ADR 0006 は、ファイルが存在し音声として読める一方でタグだけを読めない Track を、file name の title fallback で残すと決めた。現在の Lofty 呼出しは tags と properties を一度に `Probe::read()` するため、その一回が失敗すると「タグだけが破損した」のか「音声構造や duration も検証できない」のかを結果から区別できない。実装は安全側に全て `invalid-metadata` として再生不可にしており、タグ破損を一覧から使える状態で残す要件を満たさない。

一方、全ての parse failure を playable にすると、拡張子だけが音声形式に見える壊れたファイルまで asset URL へ渡す。fallback と安全性を両立するには、タグ以外の読み取りが成立するという追加の証拠が必要になる。

Lofty 0.25.1 の `ParseOptions` は `read_tags` と `read_properties` を独立に切り替えられる。失敗した候補だけを別設定で読み直し、分類を細分化する。

参考:

- [Lofty ParseOptions](https://docs.rs/lofty/0.25.1/lofty/config/struct.ParseOptions.html)
- [Lofty Probe](https://docs.rs/lofty/0.25.1/lofty/probe/struct.Probe.html)

## Decision（決定とその理由）

- 最初は従来どおり `read_tags(true)`、`read_properties(true)`、`BestAttempt`、cover art 無効で読む。
- 最初の `Probe::read()` が失敗した候補だけ、同じ supported content probe と拡張子一致を保ったまま、`read_tags(false)`、`read_properties(true)` で一度だけ再読込する。
- 再読込が成功した場合は、音声 properties を確認できたと判断し、`invalid-tags` として分類する。title は file stem、artist と album は null、duration は再読込結果を使い、Track presence は `present` のままにする。
- 再読込も失敗した場合は `invalid-metadata` とし、Track は一覧に残すが `unknown` で再生不可にする。
- `missing-tags` は、最初の読込自体は成功したが title、artist、album の基本タグが一つもない状態に限定する。`invalid-tags` と同じ表示 fallback でも、観測した理由を失わない。
- frontend は Rust から届く fallback status に既知の failure kind を必須とし、分類の欠落や未知の値を保存前に拒否する。

## Rejected Options（却下した選択肢）

- 全ての `invalid-metadata` を playable fallback にする: properties や音声構造を確認できない壊れた候補まで再生可能に見せる。
- 全ての parse failure を `unknown` にする: 安全側ではあるが、タグだけが壊れた音源も再生できないままになり、Story 0003 の fallback 要件を満たさない。
- duration を読まず tags だけ再試行する: playable と判断するための音声 properties の証拠にならない。
- JavaScript 側で tag parser を追加する: 音源を WebView メモリへ渡し、parser と失敗分類を二重に持つ。
- format ごとに壊れた tag chunk を手作業で除去する: parser 実装へ踏み込み、WAV、MP3、FLAC ごとの差と保守範囲を大きくする。

## Consequences（結果）

- タグだけを読めない音源は file name fallback で選択・再生でき、音声構造も読めない候補は引き続き fail closed になる。
- parse failure の候補だけ file open と properties parse を一度追加する。正常な大半のファイルには追加 I/O がない。
- `invalid-tags`、`missing-tags`、`invalid-metadata` の三分類を Rust、frontend validator、test で同期する必要がある。未知または欠落した分類は library write 前に拒否する。
- 再読込の間にも local file が変更される可能性はある。scope、canonical descendant、symlink の検査と pathname open の TOCTOU は別の hardening 課題として残り、この判断だけでは解消しない。
- 実タグ付き／破損タグ付き MP3 と FLAC の fixture 検証は、個人音源を commit せず生成可能な fixture を用意できるまで `UNVERIFIED` とする。
