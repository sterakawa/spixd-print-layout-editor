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

const MM_PER_UNIT = 25.4 / 100;
const UNITS_PER_MM = 100 / 25.4;
const PHOTO_RATIOS = [
  { value: "3:4", label: "3:4（証明写真）", width: 3, height: 4 },
  { value: "2:3", label: "2:3（一般写真）", width: 2, height: 3 },
  { value: "1:1", label: "1:1（正方形）", width: 1, height: 1 },
  { value: "4:5", label: "4:5（ポートレート）", width: 4, height: 5 },
] as const;
const PAPER_PRESETS = [
  { value: "l", label: "L判（89 × 127mm）", widthMm: 89, heightMm: 127 },
  { value: "kg", label: "KG判（102 × 152mm）", widthMm: 102, heightMm: 152 },
  { value: "2l", label: "2L判（127 × 178mm）", widthMm: 127, heightMm: 178 },
  { value: "cpl", label: "CPL・CP1500（89 × 119mm）", widthMm: 89, heightMm: 119 },
  { value: "cpkg", label: "CPKG・CP1500（100 × 148mm）", widthMm: 100, heightMm: 148 },
] as const;

type PhotoRatioValue = typeof PHOTO_RATIOS[number]["value"];
type PaperPresetValue = typeof PAPER_PRESETS[number]["value"];

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
  canvasWidth: number;
  canvasHeight: number;
};

function layerName(layers: LayoutLayer[], index: number): string {
  const layer = layers[index];
  const typeIndex = layers.slice(0, index + 1).filter((item) => item.type === layer.type).length;
  if (layer.type === "photo") return `PHOTO ${typeIndex}`;
  if (layer.type === "img") return `IMG ${typeIndex}`;
  return `${layer.type.toUpperCase()} ${typeIndex}`;
}

function fileNameFromUrl(value: string): string {
  if (!value) return "画像URLなし";
  try {
    return new URL(value).pathname.split("/").filter(Boolean).at(-1) ?? value;
  } catch {
    return value;
  }
}

function previewImageStyle(layer: LayoutLayer): { backgroundImage?: string } {
  if (layer.type !== "img" || !/^https:\/\//i.test(layer.text)) return {};
  return { backgroundImage: `url(${JSON.stringify(layer.text)})` };
}

function toMillimeters(value: number): string {
  return (value * MM_PER_UNIT).toFixed(1);
}

function toMillimeterNumber(value: number): number {
  return Number(toMillimeters(value));
}

function toXmlUnits(valueInMillimeters: number): number {
  return Math.round(valueInMillimeters * UNITS_PER_MM);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function detectPhotoRatio(width: number, height: number): PhotoRatioValue | "custom" {
  const ratio = width / height;
  const preset = PHOTO_RATIOS.find((item) => Math.abs(ratio - item.width / item.height) < 0.01);
  return preset?.value ?? "custom";
}

function detectPaperPreset(widthMm: number, heightMm: number): PaperPresetValue | "custom" {
  const preset = PAPER_PRESETS.find((item) => {
    const portrait = Math.abs(widthMm - item.widthMm) < 0.05 && Math.abs(heightMm - item.heightMm) < 0.05;
    const landscape = Math.abs(widthMm - item.heightMm) < 0.05 && Math.abs(heightMm - item.widthMm) < 0.05;
    return portrait || landscape;
  });
  return preset?.value ?? "custom";
}

type DecimalInputProps = {
  value: number | null;
  min?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  onValueChange: (value: number | null) => void;
};

function formatDecimal(value: number | null): string {
  if (value === null) return "";
  return String(Number(value.toFixed(1)));
}

function DecimalInput({
  value,
  min = 0,
  placeholder,
  allowEmpty = true,
  onValueChange,
}: DecimalInputProps) {
  const [draft, setDraft] = useState(() => formatDecimal(value));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setDraft(formatDecimal(value));
  }, [value]);

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (allowEmpty) onValueChange(null);
      else setDraft(formatDecimal(value));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(formatDecimal(value));
      return;
    }

    const committed = Math.max(min, parsed);
    onValueChange(committed);
    setDraft(formatDecimal(committed));
  }

  return (
    <input
      type="number"
      min={min}
      step="0.1"
      value={draft}
      placeholder={placeholder}
      onFocus={() => { isFocused.current = true; }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft === "") {
          if (allowEmpty) onValueChange(null);
          return;
        }
        const parsed = Number(nextDraft);
        if (Number.isFinite(parsed)) onValueChange(Math.max(min, parsed));
      }}
      onBlur={() => {
        isFocused.current = false;
        commitDraft();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(formatDecimal(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function LayoutEditor() {
  const inputId = useId();
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [fileName, setFileName] = useState("idprintKG.xml");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [paperSize, setPaperSize] = useState({ widthMm: 102, heightMm: 152 });
  const pointerAction = useRef<PointerAction | null>(null);

  const canvasWidth = toXmlUnits(paperSize.widthMm);
  const canvasHeight = toXmlUnits(paperSize.heightMm);

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
      scaleX: canvasRect ? canvasWidth / canvasRect.width : 1,
      scaleY: canvasRect ? canvasHeight / canvasRect.height : 1,
      canvasWidth,
      canvasHeight,
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
        layer.startX = clamp(action.startX + deltaX, 0, Math.max(0, action.canvasWidth - action.startWidth));
        layer.startY = clamp(action.startY + deltaY, 0, Math.max(0, action.canvasHeight - action.startHeight));
      } else {
        layer.width = clamp(action.startWidth + deltaX, 10, Math.max(10, action.canvasWidth - action.startX));
        layer.height = clamp(action.startHeight + deltaY, 10, Math.max(10, action.canvasHeight - action.startY));
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

  function updateSelectedLayerText(value: string) {
    if (selectedIndex === null) return;
    setLayout((current) => {
      if (!current) return current;
      const layers = [...current.layers];
      layers[selectedIndex] = { ...layers[selectedIndex], text: value };
      return { ...current, layers };
    });
  }

  function updateSelectedLayerInMillimeters(field: keyof LayoutLayer, value: number | null) {
    updateSelectedLayer(field, value === null ? null : toXmlUnits(value));
  }

  function updatePaperSize(field: "widthMm" | "heightMm", value: number | null) {
    if (value === null || !Number.isFinite(value) || value <= 0) return;
    setPaperSize((current) => ({ ...current, [field]: value }));
  }

  function swapPaperOrientation() {
    setPaperSize((current) => ({ widthMm: current.heightMm, heightMm: current.widthMm }));
  }

  function applyPaperPreset(value: PaperPresetValue) {
    const preset = PAPER_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setPaperSize({ widthMm: preset.widthMm, heightMm: preset.heightMm });
  }

  function addPhotoLayer() {
    if (!layout) return;
    const width = toXmlUnits(30);
    const height = Math.round((width * 4) / 3);
    const photoCount = layout.layers.filter((layer) => layer.type === "photo").length;
    const offset = (photoCount % 5) * 8;
    const newLayer: LayoutLayer = {
      type: "photo",
      color: "",
      startX: clamp(Math.round((canvasWidth - width) / 2) + offset, 0, Math.max(0, canvasWidth - width)),
      startY: clamp(Math.round((canvasHeight - height) / 2) + offset, 0, Math.max(0, canvasHeight - height)),
      width,
      height: null,
      rate: "",
      text: "nf",
    };

    const newIndex = layout.layers.length;
    setLayout({ ...layout, layers: [...layout.layers, newLayer] });
    setSelectedIndex(newIndex);
  }

  function addImageLayer() {
    if (!layout) return;
    const size = toXmlUnits(30);
    const imageCount = layout.layers.filter((layer) => layer.type === "img").length;
    const offset = (imageCount % 5) * 8;
    const newLayer: LayoutLayer = {
      type: "img",
      color: "",
      startX: clamp(Math.round((canvasWidth - size) / 2) + offset, 0, Math.max(0, canvasWidth - size)),
      startY: clamp(Math.round((canvasHeight - size) / 2) + offset, 0, Math.max(0, canvasHeight - size)),
      width: size,
      height: size,
      rate: "",
      text: "",
    };

    const newIndex = layout.layers.length;
    setLayout({ ...layout, layers: [...layout.layers, newLayer] });
    setSelectedIndex(newIndex);
  }

  function fitSelectedImageToPaper() {
    if (!layout || selectedIndex === null) return;
    const layers = [...layout.layers];
    const layer = { ...layers[selectedIndex] };
    if (layer.type !== "img") return;
    layer.startX = 0;
    layer.startY = 0;
    layer.width = canvasWidth;
    layer.height = canvasHeight;
    layers[selectedIndex] = layer;
    setLayout({ ...layout, layers });
  }

  function centerSelectedImage() {
    if (!layout || selectedIndex === null) return;
    const layers = [...layout.layers];
    const layer = { ...layers[selectedIndex] };
    if (layer.type !== "img") return;
    const size = previewSize(layer);
    layer.startX = Math.max(0, Math.round((canvasWidth - size.width) / 2));
    layer.startY = Math.max(0, Math.round((canvasHeight - size.height) / 2));
    layers[selectedIndex] = layer;
    setLayout({ ...layout, layers });
  }

  function applyPhotoRatio(value: PhotoRatioValue) {
    if (!layout || selectedIndex === null) return;
    const preset = PHOTO_RATIOS.find((item) => item.value === value);
    if (!preset) return;

    const layers = [...layout.layers];
    const layer = { ...layers[selectedIndex] };
    if (layer.type !== "photo") return;
    const currentSize = previewSize(layer);
    const width = layer.width && layer.width > 0 ? layer.width : currentSize.width;
    layer.width = width;
    layer.height = Math.round(width * preset.height / preset.width);
    layers[selectedIndex] = layer;
    setLayout({ ...layout, layers });
  }

  function deleteSelectedLayer() {
    if (!layout || selectedIndex === null) return;
    const targetName = layerName(layout.layers, selectedIndex);
    if (!window.confirm(`${targetName}を削除しますか？`)) return;

    const layers = layout.layers.filter((_, index) => index !== selectedIndex);
    setLayout({ ...layout, layers });
    setSelectedIndex(layers.length === 0 ? null : Math.min(selectedIndex, layers.length - 1));
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
  const selectedPhotoRatio = selectedLayer?.type === "photo" && selectedSize
    ? detectPhotoRatio(selectedSize.width, selectedSize.height)
    : null;
  const selectedPaperPreset = detectPaperPreset(paperSize.widthMm, paperSize.heightMm);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">SPIXD PRINT</p>
          <h1>Layout Editor</h1>
        </div>
        <span className="version-chip">Preview 0.7</span>
      </header>

      <section className="intro">
        <div>
          <p className="step-label">STEP 02</p>
          <h2>印刷面を見ながら配置する</h2>
          <p>枠をドラッグして移動し、右下のハンドルでサイズを変更できます。</p>
        </div>
        <div className="coordinate-note">
          <span>用紙サイズ</span>
          <strong>{paperSize.widthMm} × {paperSize.heightMm} mm</strong>
          <small>{canvasWidth} × {canvasHeight} @100dpi</small>
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
              style={{
                backgroundColor: layout?.backgroundColor ?? "#ffffff",
                width: canvasWidth,
                height: canvasHeight,
              }}
              aria-label="印刷レイアウトのプレビュー"
            >
              {layout?.layers.map((layer, index) => {
                const size = previewSize(layer);
                const label = layerName(layout.layers, index);
                return (
                  <div
                    className={`layout-layer layer-${layer.type} ${layer.type === "img" && /^https:\/\//i.test(layer.text) ? "has-image" : ""} ${selectedIndex === index ? "is-selected" : ""}`}
                    key={`${layer.type}-${index}`}
                    style={{
                      left: layer.startX ?? 0,
                      top: layer.startY ?? 0,
                      width: size.width,
                      height: size.height,
                      zIndex: index + 1,
                      ...previewImageStyle(layer),
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

          <div className="paper-section">
            <div className="section-title">
              <div>
                <span className="panel-kicker">PAPER</span>
                <h4>用紙サイズ</h4>
              </div>
              <button className="swap-button" type="button" onClick={swapPaperOrientation}>縦横を入れ替え</button>
            </div>
            <label className="paper-preset-field">
              <span>用紙プリセット</span>
              <select
                value={selectedPaperPreset}
                onChange={(event) => {
                  if (event.target.value !== "custom") applyPaperPreset(event.target.value as PaperPresetValue);
                }}
              >
                {PAPER_PRESETS.map((preset) => (
                  <option value={preset.value} key={preset.value}>{preset.label}</option>
                ))}
                <option value="custom">カスタム</option>
              </select>
            </label>
            <div className="paper-fields">
              <label className="number-field">
                <span>幅（mm）</span>
                <DecimalInput
                  min={10}
                  value={paperSize.widthMm}
                  allowEmpty={false}
                  onValueChange={(value) => updatePaperSize("widthMm", value)}
                />
              </label>
              <label className="number-field">
                <span>高さ（mm）</span>
                <DecimalInput
                  min={10}
                  value={paperSize.heightMm}
                  allowEmpty={false}
                  onValueChange={(value) => updatePaperSize("heightMm", value)}
                />
              </label>
            </div>
            <p className="paper-note">この値は編集画面の設定です。用紙指定そのものはspixdprint.xml側にあります。</p>
          </div>

          <div className="editor-section">
            <div className="section-title">
              <div>
                <span className="panel-kicker">EDIT</span>
                <h4>{selectedLayer && selectedIndex !== null && layout ? layerName(layout.layers, selectedIndex) : "要素を選択"}</h4>
              </div>
              {selectedLayer ? (
                <div className="section-actions">
                  <span className={`layer-badge badge-${selectedLayer.type}`}>{selectedLayer.type}</span>
                  <button className="delete-button" type="button" onClick={deleteSelectedLayer}>削除</button>
                </div>
              ) : null}
            </div>

            {selectedLayer && selectedSize ? (
              <div className="field-grid">
                {selectedLayer.type === "img" ? (
                  <div className="image-source-field">
                    <label>
                      <span>画像URL</span>
                      <input
                        type="url"
                        value={selectedLayer.text}
                        placeholder="https://example.com/logo.png"
                        onChange={(event) => updateSelectedLayerText(event.target.value)}
                      />
                    </label>
                    <div className="image-layer-actions">
                      <button type="button" onClick={centerSelectedImage}>中央に配置</button>
                      <button type="button" onClick={fitSelectedImageToPaper}>用紙全面に合わせる</button>
                    </div>
                    <small>HTTPS画像はプレビューに表示されます。URLはXMLの&lt;txt&gt;へ保存します。</small>
                  </div>
                ) : null}
                {selectedLayer.type === "photo" && selectedPhotoRatio ? (
                  <label className="ratio-field">
                    <span>写真の比率</span>
                    <select
                      value={selectedPhotoRatio}
                      onChange={(event) => {
                        if (event.target.value !== "custom") applyPhotoRatio(event.target.value as PhotoRatioValue);
                      }}
                    >
                      {PHOTO_RATIOS.map((ratio) => (
                        <option value={ratio.value} key={ratio.value}>{ratio.label}</option>
                      ))}
                      <option value="custom">カスタム</option>
                    </select>
                  </label>
                ) : null}
                {([
                  ["startX", "X位置（mm）", selectedLayer.startX],
                  ["startY", "Y位置（mm）", selectedLayer.startY],
                  ["width", "幅（mm）", selectedLayer.width],
                  ["height", "高さ（mm）", selectedLayer.height],
                ] as const).map(([field, label, value]) => (
                  <label className="number-field" key={field}>
                    <span>{label}</span>
                    <DecimalInput
                      min={0}
                      value={value === null ? null : toMillimeterNumber(value)}
                      placeholder="auto"
                      onValueChange={(nextValue) => updateSelectedLayerInMillimeters(field, nextValue)}
                    />
                  </label>
                ))}
                <div className="physical-size">
                  <span>現在の表示寸法</span>
                  <strong>{toMillimeters(selectedSize.width)} × {toMillimeters(selectedSize.height)} mm</strong>
                  <small>XML出力値：{selectedSize.width} × {selectedSize.height}（100dpi座標）</small>
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
              <span>要素合計（背景除く）</span>
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
            <div className="layer-list-heading">
              <p>配置要素</p>
              <div className="add-layer-actions">
                <button type="button" onClick={addPhotoLayer} disabled={!layout}>＋ 写真枠</button>
                <button type="button" onClick={addImageLayer} disabled={!layout}>＋ 画像</button>
              </div>
            </div>
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
                  <strong>{layerName(layout.layers, index)}</strong>
                  <small>
                    X {toMillimeters(layer.startX ?? 0)}mm / Y {toMillimeters(layer.startY ?? 0)}mm<br />
                    W {layer.width === null ? "auto" : `${toMillimeters(layer.width)}mm`} / H {layer.height === null ? "auto" : `${toMillimeters(layer.height)}mm`}
                    {(layer.width === null || layer.height === null) && `（表示 ${toMillimeters(size.width)}×${toMillimeters(size.height)}mm）`}
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
        <span>画面はmm表示、XMLは100dpi座標で書き出します</span>
      </footer>
    </main>
  );
}
