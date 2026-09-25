export type LayerType = "bkcolor" | "photo" | "img" | string;

export type LayoutLayer = {
  type: LayerType;
  color: string;
  startX: number | null;
  startY: number | null;
  width: number | null;
  height: number | null;
  rate: string;
  text: string;
};

export type PrintLayout = {
  backgroundColor: string;
  layers: LayoutLayer[];
};

function textOf(element: Element, tagName: string): string {
  return element.querySelector(tagName)?.textContent?.trim() ?? "";
}

function optionalNumber(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeHexColor(value: string): string {
  const clean = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  if (/^[0-9a-fA-F]{3}$/.test(clean)) return `#${clean}`;
  return "#ffffff";
}

export function parseLayoutXml(xml: string): PrintLayout {
  const documentNode = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  const parserError = documentNode.querySelector("parsererror");

  if (parserError) {
    throw new Error("XMLの形式を確認してください。読み込みに失敗しました。");
  }

  if (documentNode.documentElement.tagName !== "print") {
    throw new Error("レイアウトXMLではありません。<print> から始まるファイルを選んでください。");
  }

  const layers = Array.from(documentNode.querySelectorAll("print > data")).map((data) => ({
    type: textOf(data, "type"),
    color: textOf(data, "color"),
    startX: optionalNumber(textOf(data, "startx")),
    startY: optionalNumber(textOf(data, "starty")),
    width: optionalNumber(textOf(data, "width")),
    height: optionalNumber(textOf(data, "height")),
    rate: textOf(data, "rate"),
    text: textOf(data, "txt"),
  }));

  if (layers.length === 0) {
    throw new Error("<data> 要素が見つかりませんでした。");
  }

  const background = layers.find((layer) => layer.type === "bkcolor");

  return {
    backgroundColor: normalizeHexColor(background?.color ?? "ffffff"),
    layers: layers.filter((layer) => layer.type !== "bkcolor"),
  };
}

export function previewSize(layer: LayoutLayer): { width: number; height: number } {
  const width = layer.width && layer.width > 0 ? layer.width : null;
  const height = layer.height && layer.height > 0 ? layer.height : null;

  if (width && height) return { width, height };
  if (width) return { width, height: Math.round((width * 4) / 3) };
  if (height) return { width: Math.round((height * 3) / 4), height };

  return { width: 120, height: 160 };
}
