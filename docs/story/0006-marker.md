# Story 0006: 気になった時刻へ Marker を残す

## Context（背景）

Story 0005で、現在曲と再生位置を保ったままPracticeへ入り、速度変更とA-Bループで一部分を聴き直せるようになった。しかし、見つけた場所は音声セッションを離れると失われる。プロダクト仕様では、練習用の印と鑑賞中のタイムスタンプメモを別機能にせず、一つのMarkerとして現在位置へ置き、再起動後にも戻れることを求める。

Track observationは再走査ごとに増えるため、Markerはsnapshot rowではなくADR 0008の恒久Track identityへ属さなければならない。このStoryではMarkerの作成、一覧、選択、編集、削除と復元までを縦に通す。Track Note、Listening Note、横断検索、波形表示、shortcutは後続Storyへ残す。

## Definition of Done（完了の定義）

- migration version 3でMarkerを恒久Track identityへ外部キー接続し、未知Track、負の位置、不正な削除状態をSQLiteが拒否する。
- MarkerはUUID、Track identity、整数ミリ秒の位置、任意のlabel / body、作成・更新日時、内部の削除日時を持つ。labelとbodyは空白をnullableへ正規化し、両方なしも許す。
- 同じTrackの同じ位置へ複数のMarkerを作れる。一覧は位置、作成日時、UUIDの決定順で返す。
- Practiceで現在のmedia位置へMarkerを作成できる。作成は再生、一時停止、速度、A-Bループ、media sourceを変えない。
- Marker一覧に時刻、label、bodyを表示する。Markerの時刻を選ぶと、同じmediaの再生状態を変えず、その位置へseekする。現在durationを越える保存位置はmedia境界へclampする。
- Markerのlabel / bodyを編集でき、明示操作で位置をその時点のmedia位置へ更新できる。
- 一件の削除は対象を画面内で確認してからsoft deleteする。削除直後は復元操作を示し、復元後は元のMarkerとして一覧へ戻る。
- Track変更、Practiceの出入り、遅いload / mutation、失敗が交差しても、旧TrackのMarkerやerrorが現在Trackへ現れない。
- DBやgatewayの失敗は絶対path、SQL、raw errorを出さず、現在の音声と既存Markerを保った固定文で示す。
- native button / input / textareaを使い、keyboard、focus、accessible name、320px / 1440pxの読みやすさを確認する。ListenではMarker編集面を表示しない。
- schema、repository、gateway、component、統合、responsiveのtestを実装前にREDにし、再起動相当の再読込を含めてGREENにする。
- `npm run dev` を維持し、frontend、Rust、migration整合性、build、desktop起動の結果を層別して残す。

## To Do（やること）

- [x] プロダクト仕様、Track identity、Tauri SQL migration、SQLite外部キーの境界を確認する。
- [x] Markerの所有、時刻単位、順序、再生継続、削除と復元、非同期境界をADRに記録する。
- [x] Markerとマーカー位置の用語を更新する。
- [x] migration、repository、gatewayの失敗するtestを書く。
- [x] Marker panelとListenPlayer連携の失敗するtestを書く。
- [x] SQLite repository、runtime gateway、Practice UIを実装する。
- [x] 自動検査、320px / 1440px、desktop起動の証拠を層別して残す。
- [x] 独立レビューで、永続性、FK、競合、削除復元、path privacy、keyboard、狭幅表示を確認する。

## Concern（懸念）

- snapshotごとのTrack rowを親にすると、再走査でMarkerの所属先を失う。恒久Track identityだけを参照し、外部キーと実SQLite testの両方で孤児を防ぐ。
- HTML mediaは秒の浮動小数、永続Markerは整数ミリ秒である。変換位置を一つにしないと、作成と再選択で丸め方が揺れる。
- 作成時に再生を止めると、耳へ引っかかった直後の流れを壊す。現在位置だけを同期的に採り、DB書込みは音声命令から分離する。
- Practiceを閉じた後やTrack変更後に旧load / mutationが完了しうる。Track identityとrequest generationを検査しないと、別曲へMarkerやerrorが混ざる。
- hard deleteは誤操作から戻せない。soft deleteと直後の復元を採る一方、削除済みrowを通常一覧と後続検索から必ず除外する責任が増える。
- labelとbodyの両方を任意にすると、無題Markerが並びうる。時刻を常に主表示し、空値をエラーにしない。

## Verification（検証）

[Story 0006 検証記録](../reports/2026-09-02-story-0006-marker-verification.md)に、RED、SQLite制約、frontend / Rust、renderer、macOS debug app、未検証の実操作を層別して残す。
