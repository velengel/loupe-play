# ADR 0018: 適用済みmigrationの本文を不変にする

## Status

Accepted

## Context（背景）

Tauri SQL pluginは起動時に登録済みmigrationを確認する。初期desktop bundleが適用したversion 1は、その後 `Vec` を複数要素へ整形した際にSQLの字下げだけが変わった。SQLiteへ渡る意味は同じでも、既存DBでは `migration 1 was previously applied but has been modified` となり、plugin初期化前にアプリが終了した。

新規DBだけを使うschema testでは、この互換性破壊を検出できなかった。

## Decision（決定とその理由）

- 一度bundleへ含めたmigrationは、version、description、SQL本文のbyte列を不変として扱う。空白だけの整形も行わない。
- version 1を最初のbundleに入っていた本文へ戻し、その文字列をraw equality testで固定する。
- schemaを変える場合は既存versionを書き換えず、新しいversionを追加する。
- migration testは新規DBの最終schemaだけでなく、既存versionの本文不変性と、既存DBからの起動を確認する。

参考:

- [Tauri SQL plugin: Migrations](https://v2.tauri.app/plugin/sql/#migrations)
- [Story 0001](../story/0001-react-base.md)
- [Story 0003](../story/0003-library-persistence.md)

## Rejected Options（却下した選択肢）

- 既存DBを削除して起動する: 起動は戻るが、保存済みlibrary、Marker、Note、PlayEventを失う。
- pluginのmigration管理tableを直接書き換える: 利用者データではなくplugin内部状態へ依存し、将来のplugin更新と整合しない。
- 正規化したSQLだけをtestする: schema上の同値性は確認できても、pluginが保存した適用済み本文との互換性を守れない。

## Consequences（結果）

- Rustコードの字下げとmigration SQL内の字下げが一致しない箇所を受け入れる。
- 適用済みSQLの可読性改善や名前変更はできない。必要なら新しいmigrationと補足documentationを追加する。
- 新規DBと既存DBの両方をrelease前に確認する手間が増える。その代わり、保存済みデータを削除せず起動互換性を検証できる。
