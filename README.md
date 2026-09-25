# SPIXD Print Layout Editor

SPIXD PrintのレイアウトXMLをブラウザ上で確認・編集するためのWebツールです。

## Preview 0.2

- レイアウトXMLをファイル選択またはドラッグ＆ドロップで読み込み
- `bkcolor` を印刷面の背景色として表示
- `photo` / `img` の座標とサイズをプレビュー
- 読み込んだ要素とXML値を一覧表示
- 写真枠・画像レイヤーをドラッグして移動
- 右下ハンドルまたは数値入力でサイズ変更
- XML座標から実寸mmの目安を表示
- 背景色を編集
- 編集結果をSPIXD形式のXMLとしてダウンロード
- XMLはサーバーに送信せず、ブラウザ内だけで解析

## 開発

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## ビルド

```bash
npm run build
```
