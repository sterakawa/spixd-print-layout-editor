# SPIXD Print Layout Editor

SPIXD PrintのレイアウトXMLをブラウザ上で確認・編集するためのWebツールです。

## Preview 0.1

- レイアウトXMLをファイル選択またはドラッグ＆ドロップで読み込み
- `bkcolor` を印刷面の背景色として表示
- `photo` / `img` の座標とサイズをプレビュー
- 読み込んだ要素とXML値を一覧表示
- XMLはサーバーに送信せず、ブラウザ内だけで解析

次の段階で、ドラッグ移動、リサイズ、要素追加、XML書き出しを実装します。

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
