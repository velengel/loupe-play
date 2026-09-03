# Story 0007: 三種類のメモを残す

## Context（背景）

Story 0006で、曲中の時刻へMarkerを残せるようになった。だが、曲全体の印象と、その日の一回の聴取で変わる感想をMarkerへ押し込むと、時刻を持つ意味が薄れる。プロダクト仕様はTrack Note、Listening Note、Timestamp Note / Markerを一度すべて使い、実利用後に統合や削除を判断するよう求めている。

Listening NoteはPlayEventへ属する。まだ再生していない選択状態をセッションとみなすと履歴が水増しされるため、`playing`を確認して作ったPlayEventだけを親にする。この依存により、Story 0009のPlayEvent基盤を先に縦へ通し、三種類の入力面を完成させる。

## Definition of Done（完了の定義）

- migration version 4で、Track Noteを恒久Track identityへ、Listening Noteを同じTrackのPlayEventへ外部キー接続する。Marker schemaは書き換えない。
- Track NoteとListening NoteはUUID、本文、作成・更新日時、内部の削除日時を持つ。本文はtrim後に空なら拒否する。
- 同じTrackへ複数のTrack Noteを、同じPlayEventへ複数のListening Noteを作成できる。通常一覧は削除済みを除き、作成日時とUUIDの決定順で返す。
- Track NoteとListening Noteを作成、一覧、編集、削除、直後の復元まで操作できる。失敗は既存の音声と成功済みメモを保持する。
- Listening Noteは現在Trackで確認済みの直近PlayEventがある場合だけ作れる。別Trackの遅いPlayEventやNote結果を混ぜない。
- Track NoteとListening Noteは折りたためる「メモ」面に置き、Listenを常時圧迫しない。MarkerはPracticeの時刻メモとして既存面を保つ。
- 三種類の名前、所有、時刻の有無がUIとaccessible nameで区別できる。絶対path、SQL、raw errorは表示しない。
- schema、repository、gateway、component、PlayEvent連携、responsiveのtestを実装前にREDにし、再接続相当を含めてGREENにする。
- frontend、Rust、build、320px / 1440px、desktop起動を層別して記録し、`npm run dev`を維持する。

## To Do（やること）

- [x] 三種類の所有関係、PlayEvent依存、入力面、削除復元をADRへ記録する。
- [x] Track Note、Listening Note、PlayEvent関連の用語を更新する。
- [x] migrationとNote repositoryの失敗するtestを書く。
- [x] PlayEventへだけListening Noteを接続する失敗するtestを書く。
- [x] 折りたたみメモ面とTrack隔離の失敗するtestを書く。
- [x] SQLite repository、runtime gateway、Track / Listening Note UIを実装する。
- [x] 自動検査、responsive、desktop起動の証拠を層別して残す。
- [ ] 独立レビューで所有、競合、focus、privacy、Listenの圧迫を確認する。

## Concern（懸念）

- Listening Noteのためだけに未再生PlayEventを作ると、生ログの意味が壊れる。確認済み再生区間がない間は理由を示して入力を無効にする。
- Track NoteとListening Noteを常時展開すると、普通に聴く操作がメモ帳に押し下げられる。入口は一つにし、利用者が開いた時だけ二種を見せる。
- soft deleteは復元できる一方、削除済み本文がDBへ残る。通常一覧と後続検索から必ず除外する。
- 二種のCRUDは形が似ている。コード上の共通化で所有関係まで曖昧にせず、repository契約は型で分ける。
- PlayEventの切替とNote保存が交差しうる。作成開始時のPlayEvent / Track identityを固定し、現在表示への反映はgenerationで判断する。
