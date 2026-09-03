# Story 0010 検証記録: 最近の音楽フォルダをすぐ開く

## 結論

Story 0010の主経路は`PASS`。macOSのrelease appで、一度native dialogから明示選択した外部テストfolderのfile-system / asset scopeが保存され、完全終了後の次回起動ではdialogなしに4 Trackを再走査できた。Track選択後はListenプレイヤーが開き、playで操作表示が「一時停止」へ変わり、pauseへ戻せた。

scope復元・走査に失敗した場合は前回snapshotを`permission-required`で保持する。ブラウザ版はローカル保存を失敗扱いせず「デスクトップアプリで利用できます」と示し、folder選択を無効にする。スピーカーからの可聴音、正確な320px browser viewport、Windows / WebView2は`UNVERIFIED`のまま分ける。

## 変更の根拠

- `e5ae502 docs: define recent library reopening`: Story 0010、ADR 0019、最近の音楽フォルダの用語を先に確定した。
- `51d4462 test: define recent library reopening`: 実装前に、auto-reopen、single-flight、fallback、browser capabilityの3 failureを確認した。
- `5b6b50c feat: reopen the recent music library`: Persisted Scope、起動時再走査、browser / desktop runtime境界を実装した。
- [Tauri Persisted Scope](https://v2.tauri.app/plugin/persisted-scope/)は、動的file-system / asset scopeを保存・復元し、FS pluginより後へ登録する公式の根拠として使った。
- [Tauri Asset protocol scope](https://v2.tauri.app/security/asset-protocol/)は、`convertFileSrc`で音源をWebViewへ渡す場合に`protocol-asset` featureも復元する根拠として使った。
- [Tauri File System plugin](https://v2.tauri.app/plugin/file-system/)は、permissionだけでpath scopeは付与されず、明示的scopeが別に必要だと確認するため使った。
- [Tauri Dialog API](https://v2.tauri.app/reference/javascript/dialog/)は、選択pathが実行中のfile-system / asset scopeへ加わる一方、通常は再起動時に消える境界の根拠として使った。

## Test-first証拠

実装前の対象実行:

```text
npm test -- --run src/platform/tauri-foundation.story-0010.test.ts src/App.test.tsx
Test Files 2 failed
Tests 3 failed | 7 passed
```

failureは、保存済みrootへの`readDir`が0回、browserが「ローカル保存を確認できません」を表示したために発生した。実装後は対象29 testsと全frontend 222 testsが通った。

## 自動検査

| 層 | コマンド | 結果 |
|---|---|---|
| Story 0010 + regression | `npm test` | `PASS`: 29 files、222 tests |
| lint | `npm run lint` | `PASS`: warningなし |
| frontend production | `npm run build` | `PASS`: TypeScript + Vite |
| Rust unit / SQLite | `npm run test:rust` | `PASS`: 34 passed、1 external-fixture test ignored |
| Rust compile | `npm run check:rust` | `PASS`: persisted-scope 2.3.8を含む |
| macOS release bundle | `npm run tauri build` | `PASS`: `.app` とaarch64 DMG |
| whitespace | `git diff --check` | `PASS` |
| secret / personal path | repository secret-pattern scan | `PASS`: 外部テストfolderのpath・音源・DBを未追跡 |

## 実アプリ検証

対象は`src-tauri/target/release/bundle/macos/LoupePlay.app`。repo外の利用許可済みテストfolderを使い、pathとTrack名は本記録へ残していない。

1. plugin導入前に選んだ既存folderは、設計どおり`再接続が必要`で表示された。
2. native folder sheetから同じfolderを明示選択した。
3. `音楽フォルダの走査が完了しました`、4 Track、検索面、選択可能なTrackをAccessibility treeで確認した。
4. AppConfigに`.persisted-scope`と`.persisted-scope-asset`の両方が作られた。実内容は表示・commitしていない。
5. LoupePlayを完全終了し、停止を確認してから同じrelease appを起動した。
6. native sheetは出ず、`音楽フォルダの走査が完了しました`、通常の`音楽フォルダを選ぶ`、4 Trackへ戻った。
7. Trackを選ぶとListenプレイヤー、現在位置 / 総時間、Listen再生操作が現れた。
8. play後にボタンが`一時停止`へ遷移し、pause操作を完了した。可聴音を独立には採取していない。

## UI review

- 1440 x 1200 browser screenshot: `PASS`。browser専用説明、disabled folder button、階層、余白、contrastを目視した。
- 320px指定のChrome CLI screenshot: `UNVERIFIED`。macOS headless Chromeの最小window幅と画像幅が一致せず、既存420px media queryの発火を信頼できなかった。
- 公式のアプリ内browser接続も、環境のtrusted code path設定で開始できなかった。このため、320pxを`PASS`とは主張しない。
- affected controlはReact testでdisabledと説明文を固定し、CSSでは420px以下でapp header、library heading、primary buttonを縦積み・全幅にする既存契約を確認した。

## Surprise & Discovery

- 添付画像と同じ失敗は、ブラウザ版がデスクトップ版と同じfolder操作を見せていたことで再現できた。native `.app` のfolder dialog自体は動いており、原因を「folderが開けない」一つにまとめたUIが診断を難しくしていた。
- TauriのDialogはfile-system scopeだけでなくasset scopeも追加する。再起動後に一覧だけでなく音源を再生するには、Persisted Scopeの`protocol-asset` featureまで必要だった。
- persisted-scope導入前の選択は遡って復元されない。一度再接続すると両scope fileが作られ、その次の完全起動からauto-reopenが成立した。
- macOS folder sheetはGo to Folderで移動した後も`Open`の明示確定が必要だった。automation中の`再接続しています`は走査遅延ではなく、sheetがまだ開いていた状態だった。
- 完全終了直後の過度に速い再openでLaunchServicesが一度だけ`kLSNoExecutableErr`を返したが、bundle内のarm64 executableは存在し、通常の再openは成功した。scope復元と別のOS起動層として記録する。

## 残るリスク

- Persisted Scopeは過去にdialogで選んだscopeも保持しうる。現在はscope確認・解除UIがない。
- 起動ごとに完全走査とmetadata抽出を行うため、大きなlibraryの起動時間は未計測。
- 320px、Windows / WebView2、外付けdrive未接続からのfallback、実スピーカーの可聴音は別の実機証拠が必要。
