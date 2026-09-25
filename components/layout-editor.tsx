"use client";

import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  LayoutLayer,
  parseLayoutXml,
  previewSize,
  PrintLayout,
  serializeLayoutXml,
} from "@/lib/layout-xml";

const CANVAS_WIDTH = 413;
const CANVAS_HEIGHT = 622;
const MM_PER_UNIT = 25.4 / 100;

type PointerAction = {
  mode: "move" | "resize";
  index: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  scaleX: number;
  scaleY: number;
};

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

function toMillimeters(value: number): string {
  return (value * MM_PER_UNIT).toFixed(1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function LayoutEditor() {
  const inputId = useId();
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [fileName, setFileName] = useState("idprintKG.xml");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const pointerAction = useRef<PointerAction | null>(null);

  useEffect(() => {
    fetch("/samples/idprintKG.xml")
      .then((response) => {
        if (!response.ok) throw new Error("サンプルXMLを読み込めませんでした。");
        return response.text();
      })
      .then((xml) => {
        setLayout(parseLayoutXml(xml));
        setSelectedIndex(0);
      })
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
      setSelectedIndex(0);
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

  function beginPointerAction(
    event: ReactPointerEvent<HTMLDivElement>,
    index: number,
    mode: "move" | "resize",
  ) {
    if (!layout) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedIndex(index);

    const layer = layout.layers[index];
    const size = previewSize(layer);
    const canvas = event.currentTarget.closest(".print-canvas");
    const canvasRect = canvas?.getBoundingClientRect();

    pointerAction.current = {
      mode,
      index,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layer.startX ?? 0,
      startY: layer.startY ?? 0,
      startWidth: size.width,
      startHeight: size.height,
      scaleX: canvasRect ? CANVAS_WIDTH / canvasRect.width : 1,
      scaleY: canvasRect ? CANVAS_HEIGHT / canvasRect.height : 1,
    };
  }

  function continuePointerAction(event: ReactPointerEvent<HTMLDivElement>) {
    const action = pointerAction.current;
    if (!action) return;

    const deltaX = Math.round((event.clientX - action.startClientX) * action.scaleX);
    const deltaY = Math.round((event.clientY - action.startClientY) * action.scaleY);

    setLayout((current) => {
      if (!current) return current;
      const layers = [...current.layers];
      const layer = { ...layers[action.index] };

      if (action.mode === "move") {
        layer.startX = clamp(action.startX + deltaX, 0, CANVAS_WIDTH - action.startWidth);
        layer.startY = clamp(action.startY + deltaY, 0, CANVAS_HEIGHT - action.startHeight);
      } else {
        layer.width = clamp(action.startWidth + deltaX, 10, CANVAS_WIDTH - action.startX);
        layer.height = clamp(action.startHeight + deltaY, 10, CANVAS_HEIGHT - action.startY);
      }

      layers[action.index] = layer;
      return { ...current, layers };
    });
  }

  function endPointerAction(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerAction.current = null;
  }

  function updateSelectedLayer(field: keyof LayoutLayer, value: number | null) {
    if (selectedIndex === null) return;
    setLayout((current) => {
      if (!current) return current;
      const layers = [...current.layers];
      layers[selectedIndex] = { ...layers[selectedIndex], [field]: value };
      return { ...current, layers };
    });
  }

  function updateBackgroundColor(value: string) {
    setLayout((current) => current ? { ...current, backgroundColor: value } : current);
  }

  function downloadXml() {
    if (!layout) return;
    const xml = serializeLayoutXml(layout);
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName.toLowerCase().endsWith(".xml") ? fileName : `${fileName}.xml`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const selectedLayer = selectedIndex === null ? null : layout?.layers[selectedIndex] ?? null;
  const selectedSize = selectedLayer ? previewSize(selectedLayer) : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">SPIXD PRINT</p>
          <h1>Layout Editor</h1>
        </div>
        <span className="version-chip">Preview 0.2</span>
      </header>

      <section className="intro">
        <div>
          <p className="step-label">STEP 02</p>
          <h2>印刷面を見ながら配置する</h2>
          <p>枠をドラッグして移動し、右下のハンドルでサイズを変更できます。</p>
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
                    className={`layout-layer layer-${layer.type} ${selectedIndex === index ? "is-selected" : ""}`}
                    key={`${layer.type}-${index}`}
                    style={{
                      left: layer.startX ?? 0,
                      top: layer.startY ?? 0,
                      width: size.width,
                      height: size.height,
                      zIndex: index + 1,
                    }}
                    title={layer.type === "img" ? layer.text : label}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label}を選択して移動`}
                    onClick={() => setSelectedIndex(index)}
                    onPointerDown={(event) => beginPointerAction(event, index, "move")}
                    onPointerMove={continuePointerAction}
                    onPointerUp={endPointerAction}
                    onPointerCancel={endPointerAction}
                  >
                    <span>{label}</span>
                    {layer.type === "img" ? <small>{fileNameFromUrl(layer.text)}</small> : null}
                    <div
                      className="resize-handle"
                      aria-hidden="true"
                      onPointerDown={(event) => beginPointerAction(event, index, "resize")}
                      onPointerMove={continuePointerAction}
                      onPointerUp={endPointerAction}
                      onPointerCancel={endPointerAction}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <p className="preview-caption">枠をドラッグして移動。右下の四角をドラッグしてリサイズ。空欄の寸法はプレビューのみ3:4で補完します。</p>
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

          <div className="editor-section">
            <div className="section-title">
              <div>
                <span className="panel-kicker">EDIT</span>
                <h4>{selectedLayer && selectedIndex !== null ? layerName(selectedLayer, selectedIndex) : "要素を選択"}</h4>
              </div>
              {selectedLayer ? <span className={`layer-badge badge-${selectedLayer.type}`}>{selectedLayer.type}</span> : null}
            </div>

            {selectedLayer && selectedSize ? (
              <div className="field-grid">
                {([
                  ["startX", "X座標", selectedLayer.startX],
                  ["startY", "Y座標", selectedLayer.startY],
                  ["width", "幅", selectedLayer.width],
                  ["height", "高さ", selectedLayer.height],
                ] as const).map(([field, label, value]) => (
                  <label className="number-field" key={field}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min="0"
                      value={value ?? ""}
                      placeholder="auto"
                      onChange={(event) => updateSelectedLayer(field, event.target.value === "" ? null : Number(event.target.value))}
                    />
                  </label>
                ))}
                <div className="physical-size">
                  <span>実寸の目安</span>
                  <strong>{toMillimeters(selectedSize.width)} × {toMillimeters(selectedSize.height)} mm</strong>
                  <small>100dpi相当として換算</small>
                </div>
              </div>
            ) : <p className="empty-selection">プレビュー上の枠を選択してください。</p>}
          </div>

          <div className="summary">
            <div>
              <span>背景色</span>
              <strong className="color-value">
                <input
                  className="color-picker"
                  type="color"
                  aria-label="背景色"
                  value={layout?.backgroundColor ?? "#ffffff"}
                  onChange={(event) => updateBackgroundColor(event.target.value)}
                />
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
                <button
                  className={`layer-row ${selectedIndex === index ? "is-active" : ""}`}
                  key={`row-${layer.type}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className={`layer-badge badge-${layer.type}`}>{layer.type}</span>
                  <strong>{layerName(layer, index)}</strong>
                  <small>
                    X {layer.startX ?? 0} / Y {layer.startY ?? 0}<br />
                    W {layer.width ?? "auto"} / H {layer.height ?? "auto"}
                    {(layer.width === null || layer.height === null) && ` (表示 ${size.width}×${size.height})`}
                  </small>
                </button>
              );
            })}
          </div>

          <button className="download-button" type="button" onClick={downloadXml} disabled={!layout}>
            編集したXMLをダウンロード
          </button>
        </aside>
      </section>

      <footer>
        <span>SPIXD Print Layout Editor</span>
        <span>座標値と空欄値を維持したSPIXD形式で書き出します</span>
      </footer>
    </main>
  );
}
