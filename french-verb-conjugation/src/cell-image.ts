import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { crc32, deflateSync } from "zlib";
import font from "./font.json";

type Glyph = { w: number; h: number; a: string };

const glyphs = font.glyphs as Record<string, Glyph>;
const cache = new Map<string, { w: number; h: number; px: Uint8Array }>();

function glyph(ch: string) {
  if (ch === " ") return { w: 16, h: 4, px: new Uint8Array(64) };
  const found = cache.get(ch);
  if (found) return found;
  const raw = glyphs[ch];
  if (!raw) return null;
  const decoded = { w: raw.w, h: raw.h, px: new Uint8Array(Buffer.from(raw.a, "base64")) };
  cache.set(ch, decoded);
  return decoded;
}

export type CellStyle = "plain" | "selected" | "bad" | "ok" | "header" | "headerOn" | "na";

const BG: Record<CellStyle, [number, number, number]> = {
  plain: [226, 232, 238],
  selected: [31, 75, 69],
  bad: [248, 228, 224],
  ok: [226, 238, 231],
  header: [232, 239, 237],
  headerOn: [31, 75, 69],
  na: [236, 232, 226],
};

const FG: Record<CellStyle, [number, number, number]> = {
  plain: [28, 25, 21],
  selected: [247, 244, 237],
  bad: [122, 42, 36],
  ok: [31, 75, 69],
  header: [31, 75, 69],
  headerOn: [247, 244, 237],
  na: [150, 146, 138],
};

type Rgb = [number, number, number];

export type BoardSlot = { main: string; label: string; correct?: string; style: CellStyle };

const BOARD_W = 1280;
const BOARD_H = 720;
let clipW = BOARD_W;
let clipH = BOARD_H;

export function cellImage(main: string, label: string, style: CellStyle, correct?: string) {
  const key = `cell5\n${style}\n${main}\n${label}\n${correct ?? ""}`;
  const dir = join(tmpdir(), "french-verbs-cells-v5");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${createHash("sha1").update(key).digest("hex")}.png`);
  if (!existsSync(file)) {
    clipW = 480;
    clipH = 270;
    const pixels = new Uint8Array(clipW * clipH * 3);
    fillRect(pixels, clipW, 0, 0, clipW, clipH, BG[style]);
    paintCell(pixels, { main, label, correct, style }, 0, 0, clipW, clipH, false);
    writeFileSync(file, png(clipW, clipH, pixels));
  }
  return file;
}

export function boardImage(rows: (BoardSlot | null)[][]) {
  const key = `board\n${JSON.stringify(rows)}`;
  const dir = join(tmpdir(), "french-verbs-cells-v5");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${createHash("sha1").update(key).digest("hex")}.png`);
  if (!existsSync(file)) writeFileSync(file, renderBoard(rows));
  return file;
}

function renderBoard(rows: (BoardSlot | null)[][]) {
  clipW = BOARD_W;
  clipH = BOARD_H;
  const pixels = new Uint8Array(BOARD_W * BOARD_H * 3);
  fillRect(pixels, BOARD_W, 0, 0, BOARD_W, BOARD_H, [206, 216, 220]);
  const margin = 10;
  const gap = 6;
  const cols = 6;
  const rowCount = Math.max(1, rows.length);
  const colW = Math.floor((BOARD_W - margin * 2 - gap * (cols - 1)) / cols);
  const rowH = Math.floor((BOARD_H - margin * 2 - gap * (rowCount - 1)) / rowCount);
  rows.forEach((row, rowIndex) => {
    row.forEach((slot, colIndex) => {
      if (!slot) return;
      const x = margin + colIndex * (colW + gap);
      const y = margin + rowIndex * (rowH + gap);
      paintCell(pixels, slot, x, y, colW, rowH, true);
    });
  });
  return png(BOARD_W, BOARD_H, pixels);
}

function paintCell(pixels: Uint8Array, slot: BoardSlot, x: number, y: number, w: number, h: number, rounded: boolean) {
  if (rounded) fillRound(pixels, x, y, w, h, 14, BG[slot.style]);
  const gap = Math.max(3, Math.round(h * 0.03));
  const labelH = slot.label ? Math.round(h * 0.13) : 0;
  const answerH = Math.round(h * 0.26);
  const correctH = slot.correct ? Math.round(h * 0.26) : 0;
  const block = labelH + (labelH ? gap : 0) + answerH + (correctH ? gap + correctH : 0);
  let top = y + Math.max(gap, Math.round((h - block) / 2));
  const labelColor: Rgb = slot.style === "selected" ? [214, 226, 220] : [118, 126, 122];
  const mainColor: Rgb = slot.style === "selected" ? FG.selected : [24, 24, 24];
  if (slot.label) {
    drawFitted(pixels, slot.label, x, w, top, labelH, labelColor);
    top += labelH + gap;
  }
  drawFitted(pixels, slot.main, x, w, top, answerH, mainColor);
  if (slot.correct) drawFitted(pixels, slot.correct, x, w, top + answerH + gap, correctH, [186, 28, 36]);
}

function drawFitted(pixels: Uint8Array, text: string, boxX: number, boxW: number, top: number, destH: number, color: Rgb) {
  const srcH = textHeight(text);
  if (!text || !srcH) return;
  let scale = destH / srcH;
  let width = textWidth(text) * scale;
  const maxW = boxW - 8;
  if (width > maxW && width > 0) {
    scale *= maxW / width;
    width = maxW;
  }
  let x = boxX + Math.max(4, Math.round((boxW - width) / 2));
  for (const ch of text) {
    const drawn = glyph(ch);
    if (!drawn) {
      x += Math.round(12 * scale);
      continue;
    }
    const dw = Math.max(1, Math.round((drawn.w + 1) * scale));
    const dh = Math.max(1, Math.round(drawn.h * scale));
    blitGlyph(pixels, drawn, x, top + Math.max(0, Math.round((destH - dh) / 2)), dw, dh, color);
    x += dw;
  }
}

function blitGlyph(
  pixels: Uint8Array,
  drawn: { w: number; h: number; px: Uint8Array },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  color: Rgb,
) {
  for (let y = 0; y < dh; y++) {
    const py = dy + y;
    if (py < 0 || py >= clipH) continue;
    const sy0 = (y * drawn.h) / dh;
    const sy1 = ((y + 1) * drawn.h) / dh;
    for (let x = 0; x < dw; x++) {
      const px = dx + x;
      if (px < 0 || px >= clipW) continue;
      const alpha = coverage(drawn, (x * drawn.w) / dw, sy0, ((x + 1) * drawn.w) / dw, sy1);
      if (alpha < 0.02) continue;
      const i = (py * clipW + px) * 3;
      pixels[i] = Math.round(pixels[i] * (1 - alpha) + color[0] * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + color[1] * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + color[2] * alpha);
    }
  }
}

function coverage(drawn: { w: number; h: number; px: Uint8Array }, x0: number, y0: number, x1: number, y1: number) {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(drawn.w, Math.ceil(x1));
  const iy1 = Math.min(drawn.h, Math.ceil(y1));
  let sum = 0;
  let area = 0;
  for (let y = iy0; y < iy1; y++) {
    const hy = Math.min(y + 1, y1) - Math.max(y, y0);
    if (hy <= 0) continue;
    for (let x = ix0; x < ix1; x++) {
      const hx = Math.min(x + 1, x1) - Math.max(x, x0);
      if (hx <= 0) continue;
      sum += drawn.px[y * drawn.w + x] * hx * hy;
      area += hx * hy;
    }
  }
  return area ? sum / (area * 255) : 0;
}

function textHeight(text: string) {
  let height = 0;
  for (const ch of text) height = Math.max(height, glyph(ch)?.h ?? 0);
  return height || 40;
}

function textWidth(text: string) {
  let width = 0;
  for (const ch of text) width += (glyph(ch)?.w ?? 14) + 1;
  return width;
}

function fillRect(pixels: Uint8Array, stride: number, x: number, y: number, w: number, h: number, color: Rgb) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(stride, x + w);
  const y1 = Math.min(clipH, y + h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * stride + px) * 3;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }
}

function fillRound(pixels: Uint8Array, x: number, y: number, w: number, h: number, radius: number, color: Rgb) {
  const r = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));
  for (let py = 0; py < h; py++) {
    const yy = y + py;
    if (yy < 0 || yy >= clipH) continue;
    for (let px = 0; px < w; px++) {
      if (!inRound(px, py, w, h, r)) continue;
      const xx = x + px;
      if (xx < 0 || xx >= clipW) continue;
      const i = (yy * clipW + xx) * 3;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }
}

function inRound(px: number, py: number, w: number, h: number, r: number) {
  let cx = -1;
  let cy = -1;
  if (px < r && py < r) {
    cx = r;
    cy = r;
  } else if (px >= w - r && py < r) {
    cx = w - r - 1;
    cy = r;
  } else if (px < r && py >= h - r) {
    cx = r;
    cy = h - r - 1;
  } else if (px >= w - r && py >= h - r) {
    cx = w - r - 1;
    cy = h - r - 1;
  }
  if (cx < 0) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function png(width: number, height: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, index) => {
      raw[row + 1 + index] = value;
    });
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ihdr(width: number, height: number) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  return data;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([size, name, data, crc]);
}
