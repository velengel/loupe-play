# ADR 0025: remoteとfresh cloneを経由して開発配置を移す

## Status

Accepted

## Context（背景）

LoupePlayのGit repositoryはiCloud Drive配下にあり、remoteを持たない。
現時点では全fileがdownload済みで、main、index、object databaseを読める。
それでもFile Providerの同期状態は将来変わりうるため、並列worktreeを増やす開発の正本にはしない。

移行では、Git履歴、ignored local artifact、dependencyとbuild output、OSが管理するapplication dataを区別する必要がある。
これらをdirectory単位でまとめて移すと、何が再構築可能で何が一台にしかないのかを検証できない。

全90commitのauthorとcommitter metadataには、GitHub profileで非公開の個人emailが含まれている。
tracked fileと全到達可能履歴の内容からcredential、個人音源、database、実在する個人pathは検出されなかったが、このemailだけで既存履歴をそのままpublicにする理由はない。

## Decision（決定とその理由）

- GitHubにpublicな`velengel/loupe-play`を作成する。
- 既存`.git`はremoteへ送らない。現行tracked treeと移行判断文書から、GitHubのnoreply emailを使う新しいinitial commitを作る。
- fresh cloneのrepository local Git emailをGitHub noreplyへ固定する。global Git emailは他repositoryへ影響するため変更しない。
- push前にpublic snapshotを機密情報patternで確認する。
- 新しい開発配置は`$HOME/Developer/active/loupe-play`とし、remoteからfresh cloneする。
- 作成用repositoryとcloneはHEAD commit、tracked tree、branch、remoteで照合する。旧repositoryとはtracked treeの内容を照合する。
- ignored local artifactのうち、再生成できない`.mydocs`のHTMLだけをchecksum付きでcloneへ複製する。
- `node_modules`、`dist`、`src-tauri/target`、Tauri生成schema、AndroidとiOSの派生iconは移行しない。必要な生成物は新配置でcommandから作り直す。
- Tauriのidentifier `com.loupe-play.desktop`を維持する。repository pathを変えても、OSのAppConfig directoryとSQLite databaseを移動しない。
- repository内の`.worktrees/`をignoreし、新配置でlinked worktreeを作成してGit操作を確認する。
- Codex設定のrepository pathはclone検証後にbackupを取って切り替える。
- 新配置、remote、`.mydocs`、testとbuild、Codex設定、linked worktreeの検証後、旧iCloud repositoryを完全削除する。
- 旧履歴の恒久bundleは作らない。削除後はGitHubのpublic snapshotと新配置を復元元とする。

## Rejected Options（却下した選択肢）

- Finderや`mv`でrepository全体を新pathへ移す: 速いが、remoteから履歴とtracked treeを再構築できることを確認できない。
- `cp`や`rsync`で`.git`を含むdirectoryを複製する: ignored build outputとFile Provider metadataまで運びやすく、新配置が同期状態から独立した証拠にならない。
- 既存履歴をそのままpublicへpushする: 90commitすべてのmetadataから個人emailが公開される。
- 既存履歴のemailを書き換えてpublicへpushする: commit単位の経緯は残るが、全commit hashが変わり、公開前の追加検証も増える。現行StoryとADRを正本にできるため採用しない。
- 既存履歴のbundleを恒久保存する: commit単位のrollbackは増えるが、利用者は移行完了後の履歴削除を受け入れている。
- ignored fileをすべて捨てる: `.mydocs`のHTMLはbuild commandから同じ内容を再生成する契約がない。
- ignored fileをすべて複製する: 7.6 GBのRust build outputを含み、古いabsolute pathやcacheを新配置へ持ち込む。
- dangling blobを新snapshotへ追加する: 3個とも現行StoryとADRの旧版であり、現行文書より古い。

## Consequences（結果）

- GitHub repositoryの作成と初回pushは外部状態を変更する。Understanding Gateで公開境界を確認してから実行する。
- public snapshotには個人email入りの過去履歴が含まれない。
- 新配置はtracked sourceから始まるため、dependency installとbuildの時間が必要になる。
- `.mydocs`はclone後もignored fileであり、GitHubからは復元できない。移行manifestにchecksumと保全先を残す。
- application databaseはrepository外に残る。新配置から起動して同じidentifierを使う限り、path移行だけではdatabaseを複製しない。
- 旧iCloud配置の削除後、過去90commitとdangling blobは回復できない。現行StoryとADRを残す代わりに、commit単位の作業過程を失う。
- `LICENSE`はこのADRで決めない。public repositoryに再利用条件が明記されない状態は別Storyで見直せる。
