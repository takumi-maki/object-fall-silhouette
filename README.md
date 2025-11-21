# Object Fall Silhouette

MediaPipe を使用した人体輪郭抽出とインタラクティブな落下オブジェクトのシステム。カメラ映像から人の輪郭を抽出し、落下する星との衝突判定を行うインタラクティブ展示です。

## 機能

- MediaPipe Selfie Segmentation による人体輪郭抽出
- リアルタイムの衝突判定（3 層の輪郭線検出）
- 色相環に沿った 12 色のカラーサイクル
- 衝突時のサイズ変化と跳ね返りアニメーション
- 星の回転エフェクト

## 必要な環境

- Node.js（推奨: v18 以上）
- npm または yarn
- Web カメラ

## ローカルでの立ち上げ方法

### 1. リポジトリのクローン

```bash
git clone https://github.com/takumi-maki/object-fall-silhouette.git
cd object-fall-silhouette
```

### 2. 必要なライブラリのインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスしてください。

### 4. カメラの許可

初回アクセス時にカメラの使用許可を求められるので、「許可」を選択してください。

## その他のコマンド

```bash
# ビルド（本番環境用）
npm run build

# ビルドしたファイルのプレビュー
npm run preview

# ESLintによるコードチェック
npm run lint
```

## 使用技術

- React 19
- TypeScript
- Vite
- MediaPipe Selfie Segmentation
- Canvas API

## ライセンス

MIT
