# ADR 0022: アプリアイコンの正本SVGをfaviconにも使う

## Status

Accepted

## Context（背景）

Tauri向けアイコン群は`src-tauri/icons/`にあり、`app-icon.svg`が1024 x 1024の座標系でLoupePlayの意匠を定義している。`index.html`にはfavicon宣言がなく、ブラウザ確認時のタブは製品を識別できない。

`public/favicon.svg`を新設すれば一般的な配置にはなるが、同じ図柄の編集対象が増える。ViteはHTMLから参照したsource assetを開発時に配信し、production buildでは出力へ解決できる。

## Decision（決定とその理由）

- faviconの正本は`src-tauri/icons/app-icon.svg`とする。ブラウザ専用の図柄を複製しない。
- `index.html`の`head`に、`rel="icon"`、`type="image/svg+xml"`、`sizes="any"`を持つlinkを置き、root-relativeな`/src-tauri/icons/app-icon.svg`を参照する。
- production buildではViteのHTML asset処理に任せ、hash付きの生成assetへ解決する。固定された出力ファイル名をapplication codeへ持ち込まない。
- PNG fallback、Apple Touch Icon、Web App Manifest、mask iconは追加しない。現在の要求はブラウザタブのfaviconであり、installable web appや単色maskの設計ではない。
- testはHTMLをDOMとして読み、属性順や改行へ依存せず、正本SVGへのhref、type、sizesを固定する。build後は`dist/index.html`と生成assetの存在も確認する。

## Rejected Options（却下した選択肢）

- `public/favicon.svg`へSVGを複製する: 配信経路は単純だが、アプリアイコン変更時に二つの編集対象がずれうる。
- `icon.png`だけをfaviconにする: 広い互換性は得られるが、複数解像度でSVGより鮮明さを落とし、正本ではなく生成物を参照する。
- SVGとPNGのlinkを両方置く: fallbackは増えるが、現行対象で必要性を確認しておらず、browserごとにどちらが選ばれたか検証境界も増える。
- SVGをdata URLとしてHTMLへ埋め込む: 単一ファイルになる一方、同じpathを参照する関係が見えず、アイコン更新をHTMLへ複製する。
- `manifest.json`を追加する: installable web appのname、start URL、display mode、maskable iconまで別の意思決定を要求し、faviconだけの目的を越える。

## Consequences（結果）

- デスクトップアプリとブラウザタブが一つのSVG意匠を共有し、見た目のdriftを減らせる。
- source tree内のTauri assetをfrontend HTMLが参照する依存が生まれる。ディレクトリ構成を変える場合、contract testとHTMLを同時に更新する必要がある。
- build出力のasset名はViteが決めるためcache bustingを得られる一方、生成名を文書や外部linkの固定URLには使えない。
- SVG非対応の古いbrowserではfaviconが表示されない可能性がある。LoupePlayの現行Tauri / 開発browser対象では、この互換性を引き受ける。
- 多色で角丸背景を持つ正本SVGはfaviconには適するが、単色mask iconへそのまま流用できない。
