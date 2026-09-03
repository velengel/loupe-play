# Story 0012 検証記録: Noteの時間文脈とヘルプ

## 対象

- Branch: `feature/file-picker-affordance`
- Story: [0012](../story/0012-readable-note-context-and-help.md)
- ADR: [0021](../ADR/0021-present-note-context-and-task-first-help.md)
- Test-first commit: `c76d0fd`
- Implementation commit: `a7ab936`

## 調査と採用理由

- [ONS: Plain language](https://service-manual.ons.gov.uk/content/writing-for-users/plain-language): 利用者が必要な情報だけを、taskが分かる見出しと短いsectionで示す根拠にした。
- [Microsoft Style Guide: Writing step-by-step instructions](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions): 少数の手順、一手順一操作、短いtask見出しを採用する根拠にした。
- [W3C Technique H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102.html): native `dialog`でmodal背景、focus、Escape、呼出元への復帰を扱う根拠にした。
- [WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): 構造化された長めの内容では見出しへfocusし、見える閉じるbuttonを置き、`aria-describedby`で全内容を一続きに読ませない根拠にした。

この調査から、ヘルプは「まず聴く」「聴き直す」「メモを使い分ける」「保存について」の四つに限定した。機能一覧をそのまま写さず、普段のtask順にした。

## Test-firstの証拠

実装前の`c76d0fd`で、repository projection、Note表示とseek、Help dialog、responsive CSSのtestを追加した。REDでは4 filesが失敗し、`8 failed / 18 passed`だった。失敗理由は、PlayEvent位置がrepositoryから返らないこと、ISO日時の生表示、Help入口とdialogがないこと、狭幅規約がないことに限られていた。

実装後の対象testは次のとおり。

```text
Test Files  4 passed (4)
Tests      26 passed (26)
```

対象:

- `src/lib/note-repository.test.ts`
- `src/components/NotePanel.test.tsx`
- `src/App.test.tsx`
- `src/styles.story-0012.test.ts`

## 自動検査

2026-09-02に次を実行した。

| 検査 | 結果 |
| --- | --- |
| `npm test -- --run` | PASS: 31 files、235 tests |
| `npm run lint` | PASS |
| `npm run build` | PASS: 45 modules |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | PASS |
| `npm run test:rust` | PASS: 36 passed、1 external fixture test ignored |
| `npm run check:rust` | PASS |
| `npm run tauri build -- --no-bundle` | PASS |
| `git diff --check` | PASS |
| secret-pattern scan | PASS: token、API key、秘密鍵patternなし |

## 実描画

個人の音源やDBを使わず、repo外へ置く非個人fixtureをReact componentへ渡した。Chromiumの実描画を320 x 1000と1440 x 1000で確認した。

| 画面 | 320px | 1440px | 確認結果 |
| --- | --- | --- | --- |
| ヘッダー | `loupe-story-0012-home-320.png` | - | 保存statusと44pxの`?`が分離し、page overflowなし |
| Help modal | `loupe-story-0012-help-320.png` | `loupe-story-0012-help-1440.png` | 外周余白、閉じるbutton、四section、縦scroll領域、背景modal化を確認 |
| Note一覧 | `loupe-story-0012-note-320.png` | `loupe-story-0012-note-1440.png` | `再生区間 1:12–1:48`が記録日時より強く、操作対象44px以上、page overflowなし |

画像は`/private/tmp`にだけ置き、commitしていない。SHA-256は順に次のとおり。

- Home 320: `5897b9cde82245e9dd8e267837a055c2fd0716fc0650f4a5cd043424972b9d74`
- Help 320: `bbc4ac7cb2388d6866c7c913720fb1adf71d7cf2599df4a30a197f3330a57c36`
- Help 1440: `39a9f4eed8f73f71575e97420eece7f9ed448a4ebff6a055e88b7c65cf0df13a`
- Note 320: `85602ef193b33ab090a852be6653a4022aa27ca78742a4afd2b23f0356819a26`
- Note 1440: `740e49f315edea84d9ea55f5ffdbc8592036ae4e340db44a1eac1fa93567e247`

## Release成果物

`npm run tauri build -- --no-bundle`でmacOS向けrelease executableを作成した。

- Path: `src-tauri/target/release/loupe-play`
- Size: 17,136,896 bytes
- SHA-256: `d47889d244d533e3c8a2579fa474ca4ac8d6342e967608d7a60bd837f261c000`

## 未検証

- 今回変更したHelp dialogのmacOS native WebView上での実クリック、Escape、focus移動は未検証。component testとChromium描画はPASS、release executableのbuildはPASSとして証拠を分ける。
- 実音源で再生区間buttonを押した時の可聴seekは未検証。`NotePanel`が区間の先頭位置をcallbackへ渡す境界はcomponent testで確認した。
- Windows build、WebView2、320px相当のWindows window操作、screen reader読み上げは未検証。
