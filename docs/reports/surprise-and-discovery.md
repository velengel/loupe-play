# Surprise & Discovery

## 2026-09-03 Story 0016 repository migration

- 既存90commitのtracked contentにはcredentialや個人dataがなかったが、全commitのauthorとcommitter metadataにGitHub profileで非公開の個人emailが入っていた。public repositoryは現行treeだけでなく履歴metadataも公開境界に含める必要がある。
- fresh cloneはglobal Git emailを継承するため、initial commitだけをnoreplyにしても再発防止にならなかった。targetのrepository local emailをnoreplyへ固定すると、repository内のlinked worktreeにも同じ設定が届く。
- system Nodeは25.9.0で、repositoryが要求する24系から外れていた。導入済みのNVM Node 24.18.0を各検証commandで明示すると、fresh cloneを変更せず再現できた。
- npm 11はViteのoptional dependency `fsevents`に未承認install scriptがあると警告した。packageを承認しなくても242 frontend tests、lint、buildは通り、この移行の再現性には影響しなかった。
- 旧sourceの最初の削除では、削除中に作られた`.DS_Store`だけが空directoryを残した。残存物、open file、Finder windowを確認してから再削除することで、cacheの残りと利用者作業を区別できた。
- LoupePlayのSQLite databaseはTauri identifierに対応するApplication Support配下にあり、repository pathを変えても移動しなかった。source削除とapplication data削除は別の境界である。
