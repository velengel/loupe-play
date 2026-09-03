# Story 0016: LoupePlayをFile Provider外の開発領域へ移す

## Context（背景）

LoupePlayはiCloud Drive配下にあり、GitのobjectやworktreeがFile Providerの同期状態に影響されうる。
現在のリポジトリは全fileがdownload済みで、mainはcleanであり、通常のGit読取も完了している。
ただしremoteがなく、このMacだけが履歴の正本になっている。
全90commitにはGitHub profileで非公開の個人emailがauthorとcommitterのmetadataとして入っているため、既存履歴をpublic remoteへ送らない。

開発を続ける配置は`$HOME/Developer/active/loupe-play`とする。
現行tracked treeから個人emailを含まない新しいinitial commitを作り、publicなGitHub remoteへpushしてからfresh cloneする。
過去のcommit単位の経緯は移さず、現行StoryとADRを判断の正本として引き継ぐ。

## Definition of Done（完了の定義）

- 現行tracked treeを個人emailを含まないinitial commitにし、publicなGitHub remoteへ保存する。
- `$HOME/Developer/active/loupe-play`をremoteからfresh cloneし、公開snapshotのHEAD、tracked tree、branch、remoteを照合する。
- 新cloneのrepository local Git emailをGitHub noreplyへ固定し、今後のworktreeでも個人emailを使わない。
- ignored fileのうち、`.mydocs`のHTML成果物だけをchecksum付きで新配置へ複製する。
- `node_modules`、`dist`、`src-tauri/target`、Tauri生成schema、AndroidとiOSの派生iconは移さず、新配置で必要なものを再生成する。
- 新配置でdependency install、test、lint、frontend build、Rust testとcheckを実行し、結果を層別に記録する。
- Tauriのapplication identifierを変えず、OSのAppConfig directoryにあるdatabaseの所在地を変更しない。
- Codexのrepository path設定を新配置へ切り替える前にbackupを作り、切替後の設定を検証する。
- repository内の`.worktrees/`をGit管理対象から外し、新配置でlinked worktreeを作成して削除できることを確認する。
- 新配置、GitHub remote、`.mydocs`、testとbuild、Codex設定、linked worktreeを確認してから、旧iCloud配置を完全削除する。
- 移行manifestへ新旧path、公開snapshot commit、検証結果、削除条件を記録する。

## To Do（やること）

- [x] 現行repository、worktree、File Provider状態、ignored file、dangling objectを読取だけで確認する。
- [x] 移行判断をADRへ記録する。
- [x] Understanding Gateを`Passed`にする。
- [x] tracked fileと履歴を機密情報patternで確認する。
- [x] 現行tracked treeから個人emailを含まないpublic snapshotを作る。
- [x] GitHub remoteを作成し、snapshotのmainをpushして到達可能性を確認する。
- [x] remoteから新配置へfresh cloneし、`.mydocs`を複製する。
- [x] dependency、test、lint、frontend build、Rust testとcheckを検証する。
- [x] 新配置のrepository内でlinked worktreeを作成し、Git操作を確認してから片付ける。
- [x] Codex設定をbackupして新pathへ切り替える。
- [x] 移行manifestとSurprise & Discoveryを更新する。
- [x] 旧iCloud配置を完全削除し、pathが存在しないことを確認する。
- [x] 差分、機密情報、Git状態を確認し、作業境界でcommitする。

## Concern（懸念）

- public repositoryには現行のcode、Story、ADR、verification report、今後のcommit metadataが公開される。過去90commitは公開しない。
- fresh cloneはtracked fileしか復元しない。`.mydocs`を別に保全し、その他のignored生成物を混ぜない。
- `src-tauri/target`だけで7.6 GBあるため、複製すると検証時間とdisk使用量が増える。buildで再生成できることを確認し、移行対象から外す。
- filesystem上のdirectory移動だけでは、remoteから再構築できることを証明できない。cloneとsourceの照合を完了条件にする。
- 旧配置を削除すると、過去90commitは回復できない。利用者はStoryとADRで判断を追えることを優先し、このcommit単位の履歴喪失を受け入れる。
- `LICENSE`は未決である。public化はsourceの閲覧可能性を変えるが、第三者へ許す再利用条件は別の判断として残る。

## Understanding Gate（実装前理解確認）

- Status: `Passed`
- Reason: 外部serviceへの初回公開、repositoryの正本、rollback、local-only成果物の保全境界を決めるため。
- Questions: GitHubでの公開境界と、旧配置および過去履歴を残す条件を問うた。
- User explanation: GitHubはpublicとし、個人emailを含む過去commitは公開しない。現行StoryとADRがあれば判断を追えるため、移行検証後は過去履歴を含むiCloud配置を完全削除してよい。
- Misalignment / Resolution: なし。
- Unresolved: `LICENSE`による第三者の再利用条件は、この移行では決めない。

検証結果は[Story 0016 verification report](../reports/2026-09-03-story-0016-repository-migration-verification.md)に記録する。
