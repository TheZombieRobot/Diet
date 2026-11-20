// Tiny pixel-art helpers used to generate the pack's textures.
import { encodePng } from "./png.mjs";

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hex(value) {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(colour, factor) {
  return colour.map((c) => Math.max(0, Math.min(255, Math.round(c * factor))));
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }
  set(x, y, colour, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = colour[0];
    this.data[i + 1] = colour[1];
    this.data[i + 2] = colour[2];
    this.data[i + 3] = alpha;
  }
  clear(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, [0, 0, 0], 0);
  }
  rect(x, y, w, h, colour) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, colour);
  }
  // Fill with small random brightness changes so surfaces look like Minecraft pixel art.
  noise(x, y, w, h, colour, amount, rand) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.set(i, j, shade(colour, 1 + (rand() - 0.5) * 2 * amount));
    }
  }
  // Sprinkle a second colour over part of an area (moss, stains, rips).
  speckle(x, y, w, h, colour, density, rand) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (rand() < density) this.set(i, j, shade(colour, 0.9 + rand() * 0.2));
    }
  }
  png() {
    return encodePng(this.width, this.height, this.data);
  }
}

// Draw a 16x16 (or any size) icon from rows of characters and a palette.
export function iconFromRows(rows, palette) {
  const canvas = new Canvas(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== rows[0].length) throw new Error(`icon row ${y} has the wrong length: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      if (!palette[ch]) throw new Error(`icon uses unknown colour "${ch}"`);
      canvas.set(x, y, hex(palette[ch]));
    });
  });
  return canvas;
}
