# Story 0013: アプリアイコンをブラウザタブにも灯す

## Context（背景）

LoupePlayのデスクトップアプリには、虫眼鏡と再生記号を重ねた固有のアイコンがある。ところがReact画面の`index.html`にはfaviconがなく、開発サーバーやブラウザ確認では、タブだけがLoupePlayの顔を失っている。

同じ意匠を置くために別ファイルを手で複製すると、将来アプリアイコンを更新したとき、デスクトップとブラウザが静かにずれる。既にある正本を、Viteの開発・本番buildの両方でfaviconとして解決する。

## Definition of Done（完了の定義）

- ブラウザタブがLoupePlayのアプリアイコンと同じSVGをfaviconとして参照する。
- faviconの`type`と任意サイズ対応がHTMLに明示される。
- デスクトップ用とブラウザ用に、編集対象となるアイコンを二重管理しない。
- favicon契約を、実装前に失敗するtestで固定する。
- Viteのproduction build後もfavicon assetが生成物へ解決される。
- frontend test、lint、build、secret-pattern check、`git diff --check`が通る。

## To Do（やること）

- [x] 既存アプリアイコンとHTML / Vite / Tauriのasset境界を確認する。
- [x] faviconの正本と参照方法をADRに記録する。
- [x] favicon契約の失敗するtestを書く。
- [x] `index.html`から正本SVGをfaviconとして参照する。
- [x] test、build、生成物、実ブラウザ表示を検証する。
- [x] READMEと検証記録を更新する。

## Concern（懸念）

- faviconはブラウザcacheに長く残る。実装が正しくても古いタブでは以前の表示が残りうるため、検証は新しいbrowser contextでも行う。
- SVG faviconへ対応しない古いbrowserは対象外とする。必要性が生じる前にPNG fallbackやWeb App Manifestを増やさない。
- faviconはmacOS DockやWindows taskbarのアイコンを置き換えない。正本SVGの意匠を変える場合は、Tauri向けICNS / ICO / PNGの再生成が別途必要になる。
