# ADR 0026: 個人利用の公開ソースに利用許諾を付与しない

## Status

Accepted

## Context（背景）

LoupePlayはGitHubのpublic repositoryで公開している。
GitHubの公式文書では、`LICENSE`がない場合は既定の著作権法が適用され、権利者はソースコードに関する権利を保持すると説明されている。
一方、GitHubの利用規約により、public repositoryの利用者にはGitHub上で閲覧し、forkする範囲が認められる。

LoupePlayは利用者自身が使うためのアプリである。
第三者による改変、再配布、商用利用、非公開の派生版を許す必要はない。

## Decision（決定とその理由）

- LoupePlayに`LICENSE`を追加しない。
- `package.json`と`Cargo.toml`にもLoupePlay自身のlicense識別子を追加しない。
- READMEに、このリポジトリをオープンソースとして利用許諾していないことを明記する。
- GitHubの利用規約や適用法令で認められる行為と、権利者が追加で許諾する複製、改変、再配布、商用利用を区別する。
- 依存ライブラリには、それぞれのライセンスが適用されることをREADMEに明記する。
- 将来、第三者への配布や共同開発を始める場合は、その時点の目的からライセンスを選び直す。

この判断は、sourceをpublicのまま閲覧可能にする既存方針と、第三者へ再利用を許諾しない個人利用の方針を両立させる。

参考情報は[GitHubのLicensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)と[Choose a License](https://choosealicense.com/)で確認した。

## Rejected Options（却下した選択肢）

- MIT Licenseを付与する: 著作権表示を残せば、第三者による改変、再配布、商用利用、非公開の派生版を許す。個人だけで使うという目的を越えるため採用しない。
- Apache License 2.0を付与する: permissiveな再利用に加えて明示的なpatent licenseを扱えるが、第三者利用を許す前提が目的と合わない。
- GNU GPLv3を付与する: 配布される派生版にも同じlicenseを求められるが、第三者による利用と再配布自体は許すため採用しない。
- 独自の「本人だけ利用可能」というlicenseを書く: 標準licenseより解釈が難しく、現在は既定の著作権で必要な境界を保てるため追加しない。
- repositoryをprivateにする: sourceへのアクセスも本人だけに制限できる。ただし、publicで問題ないという既存判断とは異なる外部状態変更になるため、このStoryでは行わない。

## Consequences（結果）

- LoupePlayはpublic repositoryのままだが、オープンソースではない。
- 第三者には、GitHubの利用規約や適用法令を越える複製、改変、再配布、商用利用を許諾しない。
- `LICENSE`を探す閲覧者にはREADMEから意図が伝わる。
- OSSとしての利用、派生開発、外部貢献は促進しない。
- 依存ライブラリのlicenseと、LoupePlay自身の利用許諾は別に扱う。
- 将来アプリを第三者へ配布する場合は、LoupePlay自身のlicenseだけでなく、同梱する依存物のnotice要件も確認する。
- sourceへのアクセスを本人だけに制限する場合は、GitHub repositoryをprivateへ変更する別の判断が必要になる。
