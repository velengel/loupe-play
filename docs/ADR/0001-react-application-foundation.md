# ADR 0001: React アプリケーションの基盤を選ぶ

## Status

Accepted

## Context（背景）

空のリポジトリには、画面を表示する仕組みだけでなく、型、開発サーバー、本番ビルド、自動テストを同じ入口から扱える土台が必要だった。一方で、`loupe-play` の具体的なプロダクト要件はまだ決まっていない。ルーティングやサーバー機能まで選ぶと、最初の一歩が将来の構成を必要以上に縛る。

## Decision（決定とその理由）

- UI は React と TypeScript で作る。コンポーネント境界を持ちつつ、公開前の間違いを型で減らせるためである。
- 開発サーバーと本番ビルドには Vite を使う。React の公式ドキュメントが、既存のフレームワークを使わない構成の開始手段として Vite を案内しており、最小のクライアントアプリを作りやすい。
- パッケージ管理には npm と `package-lock.json` を使う。この環境に Node.js と npm があり、追加のパッケージマネージャーを前提にせず再現できる。
- テストには Vitest、jsdom、Testing Library を使う。Vite と TypeScript の設定を共有しながら、内部実装ではなく利用者から見える役割と表示を検証できる。
- 静的検査には、現行の Vite React TypeScript テンプレートが採用する Oxlint を使う。初期構成を公式テンプレートから離しすぎず、検査時間を短く保つ。
- 最初の画面は LoupePlay の目的を示しつつ、Listen や Practice の完成した操作を装わないベース画面に留める。

参考:

- [React: Build a React app from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Vite: Getting Started](https://vite.dev/guide/)
- [Vitest: Getting Started](https://vitest.dev/guide/)
- [Testing Library: React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vite: react-ts template](https://github.com/vitejs/vite/tree/v8.2.2/packages/create-vite/template-react-ts)

## Rejected Options（却下した選択肢）

- Create React App: React の公式ドキュメントで非推奨となっており、新しい基盤の開始点にしない。
- Next.js などのフルスタックフレームワーク: サーバーレンダリング、ルーティング、データ取得の要件がない段階では、決定範囲が広すぎる。
- JavaScript のみの構成: 初期ファイルは減るが、コンポーネントやデータの契約を後から型付けする移行コストが生じる。
- スナップショット中心のテスト: 小さな見た目の変更で大きな差分が生じやすく、利用者が認識できる振る舞いの保証が弱い。
- `create-vite` を作業ディレクトリへ直接実行する: テストより先に `App.tsx` を生成し、既存の Story がある非空ディレクトリの扱いも必要になる。公式テンプレートの構成を参照しつつ、設定、失敗するテスト、実装の順で手動配置する。

## Consequences（結果）

- `npm run dev`、`npm test`、`npm run build` を主要な入口として揃えられる。
- React、Vite、テスト環境の依存関係と更新作業を引き受ける。ロックファイルを正とし、更新は別の Story と判断記録を伴わせる。
- この ADR はフロントエンド基盤だけを決める。デスクトップシェル、永続化、ローカルファイル境界は別の ADR で決める。
- jsdom を含む現行ツール群が要求する Node.js の範囲を満たす必要がある。対応バージョンは `package.json` と `README.md` に明記する。
- Testing Library は利用者視点の検証を促すが、ブラウザ固有のレイアウトや描画品質までは保証しない。必要になった時点で実ブラウザ検証を追加する。
