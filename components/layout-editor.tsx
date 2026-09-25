"use client";

import { ChangeEvent, DragEvent, useEffect, useId, useState } from "react";
import {
  LayoutLayer,
  parseLayoutXml,
  previewSize,
  PrintLayout,
} from "@/lib/layout-xml";

const CANVAS_WIDTH = 413;
const CANVAS_HEIGHT = 622;

function layerName(layer: LayoutLayer, index: number): string {
  if (layer.type === "photo") return `PHOTO ${index + 1}`;
  if (layer.type === "img") return `IMG ${index + 1}`;
  return `${layer.type.toUpperCase()} ${index + 1}`;
}

function fileNameFromUrl(value: string): string {
  if (!value) return "画像URLなし";
  try {
    return new URL(value).pathname.split("/").filter(Boolean).at(-1) ?? value;
  } catch {
    return value;
  }
}

export function LayoutEditor() {
  const inputId = useId();
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [fileName, setFileName] = useState("idprintKG.xml");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetch("/samples/idprintKG.xml")
      .then((response) => {
        if (!response.ok) throw new Error("サンプルXMLを読み込めませんでした。");
        return response.text();
      })
      .then((xml) => setLayout(parseLayoutXml(xml)))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。");
      });
  }, []);

  async function loadFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setError("XMLファイルを選んでください。");
      return;
    }

    try {
      const xml = await file.text();
      setLayout(parseLayoutXml(xml));
      setFileName(file.name);
      setError("");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">SPIXD PRINT</p>
          <h1>Layout Editor</h1>
        </div>
        <span className="version-chip">Preview 0.1</span>
      </header>

      <section className="intro">
        <div>
          <p className="step-label">STEP 01</p>
          <h2>レイアウトXMLを読み込む</h2>
          <p>既存のXMLを選ぶと、背景色と配置データを印刷面に再現します。</p>
        </div>
        <div className="coordinate-note">
          <span>座標面</span>
          <strong>{CANVAS_WIDTH} × {CANVAS_HEIGHT}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="preview-panel panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">PRINT PREVIEW</span>
              <h3>{fileName}</h3>
            </div>
            <span className="status-dot">読み込み済み</span>
          </div>

          <div className="canvas-stage">
            <div
              className="print-canvas"
              style={{ backgroundColor: layout?.backgroundColor ?? "#ffffff" }}
              aria-label="印刷レイアウトのプレビュー"
            >
              {layout?.layers.map((layer, index) => {
                const size = previewSize(layer);
                const label = layerName(layer, index);
                return (
                  <div
                    className={`layout-layer layer-${layer.type}`}
                    key={`${layer.type}-${index}`}
                    style={{
                      left: layer.startX ?? 0,
                      top: layer.startY ?? 0,
                      width: size.width,
                      height: size.height,
                      zIndex: index + 1,
                    }}
                    title={layer.type === "img" ? layer.text : label}
                  >
                    <span>{label}</span>
                    {layer.type === "img" ? <small>{fileNameFromUrl(layer.text)}</small> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="preview-caption">高さ・幅が空欄の写真枠は、プレビュー上のみ3:4で補完しています。</p>
        </div>

        <aside className="control-panel panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">IMPORT</span>
              <h3>XMLファイル</h3>
            </div>
          </div>

          <label
            className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
            htmlFor={inputId}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="upload-icon" aria-hidden="true">↑</span>
            <strong>XMLをここにドロップ</strong>
            <span>またはクリックしてファイルを選択</span>
            <input
              id={inputId}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleFileChange}
            />
          </label>

          {error ? <p className="error-message" role="alert">{error}</p> : null}

          <div className="summary">
            <div>
              <span>背景色</span>
              <strong className="color-value">
                <i style={{ backgroundColor: layout?.backgroundColor ?? "#fff" }} />
                {layout?.backgroundColor.toUpperCase() ?? "—"}
              </strong>
            </div>
            <div>
              <span>配置要素</span>
              <strong>{layout?.layers.length ?? 0}</strong>
            </div>
            <div>
              <span>写真枠</span>
              <strong>{layout?.layers.filter((layer) => layer.type === "photo").length ?? 0}</strong>
            </div>
            <div>
              <span>画像レイヤー</span>
              <strong>{layout?.layers.filter((layer) => layer.type === "img").length ?? 0}</strong>
            </div>
          </div>

          <div className="layer-list">
            <p>読み込んだ要素</p>
            {layout?.layers.map((layer, index) => {
              const size = previewSize(layer);
              return (
                <div className="layer-row" key={`row-${layer.type}-${index}`}>
                  <span className={`layer-badge badge-${layer.type}`}>{layer.type}</span>
                  <strong>{layerName(layer, index)}</strong>
                  <small>
                    X {layer.startX ?? 0} / Y {layer.startY ?? 0}<br />
                    W {layer.width ?? "auto"} / H {layer.height ?? "auto"}
                    {(layer.width === null || layer.height === null) && ` (表示 ${size.width}×${size.height})`}
                  </small>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      <footer>
        <span>SPIXD Print Layout Editor</span>
        <span>次の段階：ドラッグ移動・リサイズ・XML書き出し</span>
      </footer>
    </main>
  );
}
