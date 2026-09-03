# Story 0002: 音声基盤の検証記録

検証日: 2026-09-02（Asia/Tokyo）

## 結論

再生状態、精密 seek、0.50x〜1.00x の速度、音程維持指示、A-B ループ、境界超過と着地点誤差、source 変更時の分離を実装した。純粋ロジックと React adapter の自動テスト、production build、Rust、macOS debug app bundle の生成、desktop window の起動は `PASS` である。

ただし、実装済みであることと、WebView が音を正しく出したことは同じではない。macOS の WKWebView で WAV、MP3、FLAC を実際に鳴らす操作、0.5x の聴感、長尺 seek、20周の実ループは自動操作の境界を越えたため `UNVERIFIED` とする。Windows / WebView2 も未確認である。

## 証拠の層

| 層 | 状態 | 根拠 |
|---|---|---|
| Story / ADR / 用語 | PASS | Story 0002、ADR 0005、ユビキタス言語を実装前または判断前に記録した。 |
| テストファースト | PASS | `0fdd6c4` で音声セッションの失敗テストを実装より先に固定した。独立レビューの回帰も、失敗理由を確認してから修正した。 |
| Frontend 自動検査 | PASS | `npm test`: 8 files / 65 tests。`npm run lint` と `npm run build` も成功した。 |
| 音声セッション | PASS | source ごとの初期化、古い非同期結果の無視、失敗時の完全 reset、seek clamp、速度、A-B、診断値を DOM 非依存テストで確認した。 |
| React adapter | PASS | play の成功・拒否、pause、±5秒、slider、同一・別 source の element 置換、古い play Promise、rAF 主経路、native seek との競合を確認した。 |
| Accessibility | PASS | 操作 group、focus、disabled 状態を固定した。周回ごとに長文を通知しないよう、診断値は非 live の `note` とした。 |
| Responsive 静的契約 | PASS | shrink 可能な control 群と、420px 以下の縦積みを CSS 契約で固定した。 |
| Base renderer 実描画 | PASS | Chromium renderer の未選択状態を320 × 800と1440 × 900で確認し、横 overflow と階層崩れがないことを確認した。Tauri / WKWebView の証拠にはしない。 |
| 選択済み renderer 実描画 | UNVERIFIED | in-app Browser は内部 bootstrap error、standalone Chromium の mock 実行は一時スクリプト実行の承認境界で停止した。静的契約とコードレビューを実描画へ昇格しない。 |
| Web 開発サーバ | PASS | `npm run dev -- --host 127.0.0.1` が起動し、`http://127.0.0.1:1420/` は HTTP 200 を返した。 |
| Rust / debug app bundle | PASS | Rust test 1件、`cargo check`、署名なし debug `.app` bundle の生成が成功した。 |
| macOS desktop 起動 | PASS | debug app process と、WindowServer 上の on-screen window 1枚を確認した。観測 bounds は 1062 × 685 だった。 |
| 生成 fixture | PASS | repo 外の OS 一時領域に、WAV、MP3、FLAC、長尺 FLAC を生成し、FFprobe で codec・長さ・sample rate を確認した。 |
| macOS WKWebView codec / 可聴音 | UNVERIFIED | native folder dialog から fixture を選び、再生音まで確認する操作証拠を取得できなかった。 |
| macOS pitch / 長尺 seek / 実ループ | UNVERIFIED | controller の指示と計測ロジックは PASS。実際の音程、1500秒 seek、20周の可聴挙動は未確認である。 |
| Windows / WebView2 | UNVERIFIED | macOS の実装・build から codec、timing、操作を推定しない。 |

## 生成 fixture

FFmpeg 8.0.1 で、外部素材を使わず生成した。すべて 48 kHz、mono である。生成物は追跡せず、大小文字が混ざる拡張子も `.gitignore` の実動作テストで遮断する。

| fixture | codec | 長さ | bytes | SHA-256 |
|---|---:|---:|---:|---|
| `loupe-play-440hz-180s.wav` | PCM S16LE | 180秒 | 17,280,078 | `e9c8aa0827de4be562b973e6bb0d38225b8b485fb75f810c918897c2407a6e85` |
| `loupe-play-440hz-180s.mp3` | MP3 | 180秒 | 2,880,812 | `04b1a2e755a29f2b70253b6e8f93f233e52a81f2593d783cbdf2a10602807e17` |
| `loupe-play-440hz-180s.flac` | FLAC | 180秒 | 2,369,533 | `f6dcc6a7a0aff142bfd0e3f6d921e942319e5a04fdc519757a9e0ab32255b555` |
| `loupe-play-chirp-1800s.flac` | FLAC | 1800秒 | 85,528,552 | `1bead1f2d9984b13fb43fcc2f5044ad3ac57353ae611c56aa2204750a78bbb2f` |

## 再現用の生成手順

生成先は repo 外に置く。検証後は一時ディレクトリごと削除する。

```bash
fixture_dir="$(mktemp -d /private/tmp/loupe-play-audio.XXXXXX)"

ffmpeg -hide_banner -loglevel error \
  -f lavfi -i sine=frequency=440:sample_rate=48000:duration=180 \
  -ac 1 -map_metadata -1 -c:a pcm_s16le \
  "$fixture_dir/loupe-play-440hz-180s.wav"

ffmpeg -hide_banner -loglevel error \
  -i "$fixture_dir/loupe-play-440hz-180s.wav" \
  -map_metadata -1 -c:a libmp3lame -b:a 128k \
  "$fixture_dir/loupe-play-440hz-180s.mp3"

ffmpeg -hide_banner -loglevel error \
  -i "$fixture_dir/loupe-play-440hz-180s.wav" \
  -map_metadata -1 -c:a flac \
  "$fixture_dir/loupe-play-440hz-180s.flac"

ffmpeg -hide_banner -loglevel error \
  -f lavfi \
  -i "aevalsrc=0.15*sin(2*PI*(220*t+0.05*t*t)):s=48000:d=1800" \
  -ac 1 -map_metadata -1 -c:a flac \
  "$fixture_dir/loupe-play-chirp-1800s.flac"
```

## desktop 手動確認手順

1. `npm run tauri dev` を起動する。
2. 「音楽フォルダを選ぶ」から生成先を選ぶ。4件だけが表示されることを確認する。
3. WAV、MP3、180秒 FLAC を一つずつ選ぶ。総時間が有限値になり、再生、一時停止、再開で現在位置が進むことを確認する。
4. 1.00x と 0.50x を切り替える。`preservesPitch` が有効であることと、440 Hz の音程が聴感上変わらないことを別々に記録する。
5. 長尺 FLAC を選び、slider で1500秒付近へ移動する。seek 完了後に再生を再開できることを確認する。
6. Aを10秒、Bを12秒に置き、20周する。周回数、境界超過の直近・最大、着地点誤差の直近・最大を記録する。数値を可聴 gap そのものとは扱わない。
7. ループ中に別の曲を選ぶ。同じ曲を選び直す。読込失敗後に再試行する。それぞれ、位置0秒、1.00x、A・Bなし、診断値なしへ戻ることを確認する。
8. 320px と1440pxで、横方向の欠落、controls の重なり、focus ring、Tab順を確認する。

## 実行した主要コマンド

```text
npm test
npm run lint
npm run build
npm run test:rust
npm run check:rust
npm run tauri -- build --debug --bundles app --no-sign
npm run tauri dev
git diff --check
git -c core.ignoreCase=false check-ignore --no-index --stdin
```

## 独立レビュー

音声 API / race と、テスト / privacy / accessibility の2系統で確認した。指摘された source 切替競合、読込失敗時の状態残留、非有限 duration、無関係な `seeked` の誤計測、成功系と rAF のテスト不足、大小文字拡張子の漏れ、live region の過剰通知を修正し、P0 / P1 なしへ収束した。

狭幅・広幅についてはCSS契約と未選択のrenderer実描画を確認した。選択済み音声 controls の実描画だけは `UNVERIFIED` であり、独立レビューがその証拠を代替したとは扱わない。

## Surprise & Discovery

- 同じ React component の `<audio>` で `src` だけを替えると、古い resource の event が新しい source の event として届きうる。曲の選択と一覧からの再選択では element ごと作り直す方が、状態機械の identity と揃った。
- A-B の `currentTime = A` と利用者の native seek は、同じ `seeking` / `seeked` を通る。Aから1 ms以内を狙った seekだけを保留中のループ着地として扱い、それ以外を破棄する必要があった。
- `role="status"` は明示した `aria-live` を外しても暗黙に polite live region になる。短区間の診断値には `note` が適していた。
- `.gitignore` の `*.wav` は、Git の大小文字設定によって `SAMPLE.WAV` を遮断しない。scanner が大小文字を問わないなら、ignore も同じ境界に合わせなければならない。
- bare dev executable と debug `.app` はどちらも WindowServer 上で起動できたが、このセッションから native dialog とWebViewの実操作証拠は得られなかった。desktop起動と実操作を同じ `PASS` にまとめてはいけない。

## 次に実機で見る一点

Windows で同じ4 fixtureを開き、0.50x・A=10秒・B=12秒で20周する。codecの成功、音程、境界超過、着地点誤差を一つの記録に残す。ここまで、WebView2の音声基盤は `UNVERIFIED` とする。
