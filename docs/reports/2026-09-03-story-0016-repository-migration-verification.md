# Story 0016 repository migration verification

Status: PASS

Observed: 2026-09-03 JST

## 移行結果

LoupePlayの開発正本をiCloud Drive配下から`$HOME/Developer/active/loupe-play`へ移した。
GitHub repositoryはpublicであり、既存90commitを含まない一つのsource snapshotから開始した。

- Source: `$HOME/Documents/Active/Programming/loupe-play`（削除済み）
- Target: `$HOME/Developer/active/loupe-play`
- Remote: `git@github.com:velengel/loupe-play.git`
- Public initial commit: `bdfb3159da315fece55d04829a637ec394f8eb8b`
- Public initial tree: `69b5a7875ec120f0ab67da228d9377a71e727e9c`

## Understanding Gate

公開対象は現行tracked source、Story、ADR、verification report、今後のcommit metadataとした。
既存90commitにはGitHub profileで非公開の個人emailがauthorとcommitterとして含まれていたため、公開しなかった。

利用者は、現行StoryとADRから判断を追えることを優先し、移行検証後に旧履歴とiCloud sourceを完全削除する不利を受け入れた。
第三者へ許す再利用条件は未決であり、`LICENSE`はこの移行で追加していない。

## 公開snapshotの監査

- 既存repositoryの到達可能な90commit、155 tracked file、commit message、過去のfile pathを確認した。
- credential provider固有pattern、private key、credential assignment、個人absolute path、本文中のemailは一致0件だった。
- 音源、SQLite database、`.env`、`.npmrc`、key containerはtracked historyに存在しなかった。
- test内の`/private/secret.wav`などは、個人pathやSQL errorをUIへ漏らさない境界を検査する架空fixtureだった。
- public snapshotでは末尾空行を除いた`.codex/config.toml`と`first-instruction.md`以外、移行元のtracked contentを維持した。
- public initial commitのauthorとcommitterはGitHub noreply emailである。
- targetのrepository local `user.email`もGitHub noreplyへ固定し、共通Git directoryを使うlinked worktreeへ適用した。global Git emailは他repositoryへ影響するため変更していない。
- `npm audit --json`: PASS。176 dependency、既知脆弱性0件。
- `cargo-audit`: UNVERIFIED。commandが導入されていなかったため、Rust testとcheckを実行証拠とした。

## Remoteとfresh clone

GitHubは`velengel/loupe-play`を`PUBLIC`、default branchを`main`として返した。
remoteのmainはinitial commit `bdfb3159da315fece55d04829a637ec394f8eb8b`だけを含む。

targetをremoteからfresh cloneした。
targetのHEADとtreeは作成用repositoryに一致し、`git fsck --full`はfindingなしで完了した。
targetと`.git/config`にはFile Provider flagがなく、`dataless` fileも存在しなかった。

## Local-only artifact

旧sourceの`.mydocs`にあるHTML 2件だけをtargetへ複製した。
どちらも`.gitignore`の`.mydocs/`規則に一致し、Git statusへ現れない。

| File | SHA-256 |
| --- | --- |
| `.mydocs/loupe-play-domain-decisions-quiz.html` | `b84de46c1c705c1eceda6a89ca4fb9f51638977c02159af87c80359ab2a9e621` |
| `.mydocs/visual-guides/260902-loupe-play-visual-guide.html` | `26c7d0f6b18508dc12939dd5281b8b1d9993769cb008b3263c053351983ff9ae` |

`node_modules`、`dist`、`src-tauri/target`、Tauri生成schema、AndroidとiOSの派生iconは複製しなかった。
新cloneでdependencyとbuild outputを再生成した。

## Application verification

repository要件はNode 24である。
login shellのNode 25.9.0は範囲外だったため、導入済みのNode 24.18.0とnpm 11.16.0を明示して検証した。

| Layer | Command | Result |
| --- | --- | --- |
| Dependency restore | `npm ci` | PASS。124 package追加、audit対象125 package、脆弱性0件 |
| Frontend test | `npm test` | PASS。34 files、242 tests |
| Lint | `npm run lint` | PASS |
| Frontend build | `npm run build` | PASS。45 modules transformed |
| Rust test | `npm run test:rust` | PASS。36 passed、0 failed、実音源を要する1件はignored |
| Rust check | `npm run check:rust` | PASS |

`npm ci`はViteのdevelopment-only optional dependencyである`fsevents`のinstall scriptが未承認だと警告した。
承認操作は行わず、test、lint、buildが通ることで今回のrestoreに不要だと確認した。

native app起動、可聴音、physical interaction、Windows buildはこのpath移行では再観測していない。
過去のnative evidenceと今回のsource build evidenceを同一視しない。

## Repository-internal worktree

`.worktrees/`をtracked treeから除外するcontract testを先に追加した。
追加前は期待どおり失敗し、`.gitignore`追加後はPASSした。

targetの`.worktrees/migration-smoke`へdetached linked worktreeを作成した。
HEAD `bdfb315`、clean status、共通Git directoryがtargetの`.git`であることを確認し、`git worktree remove`で片付けた。

続いて`.worktrees/complete-repository-migration`へ`docs/complete-repository-migration` branchを作成した。
これは移行完了文書をmainから分離してcommitする実作業worktreeである。

## Codex path

`$HOME/.codex/config.toml`のproject entryを旧pathから新pathへ置換した。
変更前のbackupは次にある。

`$HOME/.codex/backups/config.toml.before-loupe-play-migration-20260903-2232`

`codex --version`は`codex-cli 0.153.0`を返し、新pathのentryが1件、旧pathのentryが0件であることを確認した。
過去session、memory、verification reportにある旧pathは履歴として書き換えていない。

## Application data

Tauri identifier `com.loupe-play.desktop`は変更していない。
使用中のSQLite databaseは`$HOME/Library/Application Support/com.loupe-play.desktop/loupe-play.db`にあり、repository外に残った。
過去のsmoke test databaseもApplication Support配下にあり、旧sourceの削除対象ではなかった。

## 旧sourceの削除

削除直前に旧sourceがcleanなmainだけを持ち、Git lock、dataless file、追加worktree、保持processがないことを確認した。
旧sourceは7.8 GiBで、主な容量は再生成可能な`src-tauri/target`だった。

最初の削除では、File ProviderまたはFinderが削除中に作った4個の`.DS_Store`と空directoryだけが36 KiB残った。
`.git`、tracked source、build artifactは削除済みだった。

open fileがなく、Finderは利用者所有のPreview Documents windowだけを開いており、旧LoupePlay windowがないことを確認した。
利用者所有windowは閉じなかった。
残った`.DS_Store`を削除し、旧source pathが存在しないことを再確認した。

## 復元境界

旧90commit、3個のdangling blob、旧`.git`は削除済みであり、復元対象ではない。
現在の復元元はGitHubのpublic mainとtarget cloneである。
`.mydocs`はtargetだけにあるignored artifactなので、target自体を削除する前には別の保全判断が必要になる。

## References

- GitHub Docs, [About repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories)
- GitHub Docs, [Setting your commit email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
- GitHub Docs, [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
