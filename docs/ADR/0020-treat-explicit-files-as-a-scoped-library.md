# ADR 0020: 明示選択したファイルを一つの scoped Library として扱う

## Status

Accepted

## Context（背景）

LoupePlay の Library は、一つの音楽フォルダを root にして子孫を完全走査する前提で作られている。利用者が一曲だけ聴きたい場合でも、その親フォルダを選ぶ必要があり、フォルダ内の別の音源まで取込と権限の対象になる。

Tauri Dialog は `directory: false` と `multiple: true` を組み合わせると複数ファイルを返す。Dialog が動的 scope へ加えるのは明示選択した path であり、File System plugin は command permission だけでは任意 path を読めない。個別ファイル選択を親フォルダ走査へ読み替えると、利用者の選択より広い範囲を扱うか、scope不足で失敗するかのどちらかになる。

既存DBは `music_folders.root_path` を Library identity として使い、その配下の相対pathを Track source identifier にしている。別々のフォルダにある複数ファイルには共通rootがなく、同名ファイルも存在しうる。ただし、適用済みmigrationを変更したり、Marker、Note、Play Eventが参照する Track identityを作り直したりするほどの機能差ではない。

UIにも別の問題がある。Listen は曲名を強く見せる一方、現在位置と総時間を小さな一行に置き、トランスポート操作を文字だけで表している。機能は存在するが、再生状態と次に押せる操作が形から伝わらない。

## Decision（決定とその理由）

- フォルダ選択とファイル選択を、同じ Library を作る別々の入口として表示する。ファイル選択は Tauri Dialog の `directory: false`、`multiple: true`、WAV / MP3 / FLAC filter を使い、一つ以上を選べるようにする。
- ファイル選択で扱う範囲は、利用者が明示選択したpathだけとする。親フォルダの `readDir` や再帰走査は行わず、File System / asset protocol / Persisted Scopeにも親フォルダを追加しない。
- 明示選択したファイル群を「ファイルライブラリ」とする。新しく選び直したときは、以前のファイル群へ追加せず、今回選んだ集合で現在のLibraryを置き換える。再起動時だけ、最後に完成公開した集合をそのまま検証し直す。
- 既存DBでは、ファイルライブラリの source key として予約済みの仮想値 `loupe-play:selected-files:v1` を `music_folders.root_path` に保存する。この値を実在pathとして開かず、画面やログにも表示しない。コード上では folder Library と file Library のkindを導出し、legacyなtable名を利用者向け概念へ漏らさない。
- ファイルライブラリの Track source identifier は、ローカルDB内に限って選択ファイルのpathとする。同名ファイルでもidentityを分け、同じファイルを再選択したときはMarker、Note、Play Eventが結び付く恒久Track identityを再利用する。表示用の`relativePath`はfile nameに限定し、source identifierと絶対pathをUI、例外、テストfixture、検証記録へ出さない。
- Rustに、選択ファイルを一件ずつ検証するmetadata commandを追加する。各pathが動的scope内にあり、symlinkでない通常ファイルで、拡張子とcontent probeがWAV / MP3 / FLACとして一致する場合だけ再生可能にする。共通root配下であることは要求しない。
- 再起動時はPersisted Scopeが復元した各pathを再検証する。一件でもscopeを失った場合は完成snapshotを公開せず、直前の保存済みLibraryを`permission-required`として保持する。削除、読取不能、偽装形式などfile固有の失敗はそのTrackを`unknown`に隔離し、他の選択ファイルを利用可能にする。
- 再接続はLibrary kindに従う。folder Libraryはfolder dialog、file Libraryは複数file dialogを再度開き、利用者が現在扱う集合を明示し直す。
- ファイルとフォルダの入口には、装飾記号と「曲を選ぶ」「フォルダを選ぶ」という可視ラベルを併記する。用途の短い補足を同じ操作面に置き、ブラウザでは両方を無効化してデスクトップ専用だと示す。
- Listenの時刻は曲名と同じnow-playing領域に置き、現在位置を大きいtabular numerals、総時間を補助情報として表示する。狭い画面では時刻を曲名の下へ送り、どちらも横overflowさせない。
- 前の曲、再生 / 一時停止、次の曲には `⏮`、`▶` / `⏸`、`⏭` を可視ラベルと併記する。記号は`aria-hidden="true"`としてaccessible nameを重複させず、buttonの操作名は状態に合わせた文字列で保つ。
- 主操作の再生 / 一時停止を中央の強いbutton、前後曲を二次buttonにする。全操作は44 CSS px以上の高さと、背景から判別できる3pxのfocus outlineを持たせる。

## Rejected Options（却下した選択肢）

- 選択ファイルの親フォルダを通常の音楽フォルダとして走査する: 一曲を選んでも同じフォルダの全曲を取り込み、明示選択よりscopeと処理範囲を広げる。
- ファイル選択を一件だけに制限し、一時的な再生にする: DBとLibraryから外れた別の再生経路が必要になり、Marker、Note、Play Event、前後曲、再起動時復元を利用できない。
- 選択ファイルをアプリのsandboxへコピーする: scopeは単純になるが、音源バイナリを二重保持し、容量、削除、原本更新の意味が変わる。LoupePlayは音源を保持しないという境界にも反する。
- 共通rootを持つようにファイル選択を一つのフォルダへ限定する: DB構造には合うが、native dialogで個別ファイルを選ぶ利点を不必要に狭める。
- file nameをTrack source identifierにする: 別フォルダに同名ファイルがあるとidentityが衝突し、メモや履歴を誤った音源へ結び付ける。
- file Library専用に既存のLibrary関連tableを再構築するmigrationを追加する: 名前は整うが、全FK依存を移行するリスクが今回の機能価値に比べて大きい。仮想source keyを局所化し、将来複数Library履歴を設計するときに一般化する。
- アイコンだけの円形トランスポートにする: 見た目は簡潔だが、記号の解釈に依存する。可視ラベルを残し、記号を形の手掛かりとして加える。
- 時刻だけを単純に大きくする: 長い曲名と競合し、320pxでoverflowや不自然な縮小を起こす。情報階層とresponsive配置を一緒に決める。

## Consequences（結果）

- 一曲だけでも、複数フォルダに散らばった曲でも、選んだファイルだけをLoupePlayで扱える。フォルダ一括取込は従来どおり残る。
- 最近のファイルライブラリも再起動後に開き直せる。各ファイルのPersisted Scopeが残るため操作は減るが、選択履歴に応じてOS上の到達可能pathが増えうる。scopeの確認・解除UIはまだない。
- 同じファイルを再選択すると恒久Track identityを再利用できる。一方、pathを変更したファイルは別Trackとみなされ、旧Marker、Note、Play Eventを自動移行しない。
- 絶対pathは既にTrack observationへ保存しており、source identifierにも重ねて保存される。DBはローカル専用のまま保ち、画面、log、fixture、exportへ持ち出さない責務が強くなる。
- `music_folders`に仮想source keyが一件入るため、DBのtable名とドメイン概念は完全には一致しない。実在pathとして使わない分岐とテストを必要とし、複数Library履歴を導入するときには一般化を再検討する。
- 一部ファイルの削除や破損は他の曲を巻き込まないが、scope不足はLibrary全体を再接続状態に戻す。権限の有無を利用者の明示操作へ結び付けるため、この不便を受け入れる。
- 時刻とトランスポートの意味は読み取りやすくなる。記号と文字を併記するため、アイコンだけのUIより横幅を使い、320pxでは三つのbuttonを均等幅にせず主操作を一行分強く見せるresponsive調整が必要になる。

## References

- [Tauri Dialog JavaScript API](https://v2.tauri.app/reference/javascript/dialog/)
- [Tauri Dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri File System plugin](https://v2.tauri.app/plugin/file-system/)
- [W3C: Understanding Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C: Understanding Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [MDN: `aria-hidden`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden)
- [ADR 0006](0006-persistent-library-and-scoped-metadata.md)
- [ADR 0018](0018-treat-applied-migration-text-as-immutable.md)
- [ADR 0019](0019-persist-selected-scope-and-reopen-recent-library.md)
