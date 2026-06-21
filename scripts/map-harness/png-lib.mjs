// Tiny dependency-free PNG drawing toolkit for the Junar map/catalog renderers.
//
// A Canvas wraps an RGB framebuffer with primitive drawing ops + a 5x7 bitmap
// font, and encodes to PNG via the built-in zlib (color type 2, RGB). No
// node-canvas / sharp / any package — Tauri-safe. Shared by render-maps.mjs and
// render-room-catalog.mjs.

import zlib from 'node:zlib';

// ── 5x7 bitmap font (uppercase + digits + a few symbols) ─────────────────────
const FONT = {
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  ',': ['     ', '     ', '     ', '     ', ' ##  ', ' ##  ', '#    '],
  ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
  '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
  '(': ['   # ', '  #  ', ' #   ', ' #   ', ' #   ', '  #  ', '   # '],
  ')': [' #   ', '  #  ', '   # ', '   # ', '   # ', '  #  ', ' #   '],
  '#': [' # # ', ' # # ', '#####', ' # # ', '#####', ' # # ', ' # # '],
  '·': ['     ', '     ', '  #  ', ' ### ', '  #  ', '     ', '     '],
  '×': ['     ', '     ', '#   #', ' # # ', '  #  ', ' # # ', '#   #'],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ### '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  J: ['#####', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '# # #', '#  ##', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  0: [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  2: [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  3: ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  4: ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  5: ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  6: [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  7: ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  8: [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  9: [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
};
const GLYPH_ADV = (scale) => 5 * scale + scale; // 5 cols + 1 col spacing

// ── CRC32 / PNG encode ───────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

export function blend(a, b, t) {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

export class Canvas {
  constructor(W, H, bg) {
    this.W = W;
    this.H = H;
    this.buf = Buffer.alloc(W * H * 3);
    if (bg) this.clear(bg);
  }
  clear(c) {
    for (let i = 0; i < this.W * this.H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }
  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x, y, w, h, c) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  frame(x, y, w, h, t, c) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  disc(cx, cy, r, c) {
    const r2 = r * r;
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++)
        if (xx * xx + yy * yy <= r2) this.px(cx + xx, cy + yy, c);
  }
  ring(cx, cy, r, c) {
    const ro = r * r;
    const ri = (r - 1) * (r - 1);
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++) {
        const d = xx * xx + yy * yy;
        if (d <= ro && d >= ri) this.px(cx + xx, cy + yy, c);
      }
  }
  thickLine(x0, y0, x1, y1, c, th) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const r = (th / 2) | 0;
    while (true) {
      this.disc(x0, y0, r, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  textWidth(str, scale) {
    return str.length * GLYPH_ADV(scale);
  }
  drawText(x, y, str, scale, c, outline) {
    if (outline) {
      let cx = x;
      for (const ch of str.toUpperCase()) {
        const g = FONT[ch] ?? FONT[' '];
        for (let r = 0; r < 7; r++)
          for (let col = 0; col < 5; col++)
            if (g[r][col] === '#') {
              const bx = cx + col * scale, by = y + r * scale;
              this.rect(bx - scale, by, scale, scale, outline);
              this.rect(bx + scale, by, scale, scale, outline);
              this.rect(bx, by - scale, scale, scale, outline);
              this.rect(bx, by + scale, scale, scale, outline);
            }
        cx += GLYPH_ADV(scale);
      }
    }
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let r = 0; r < 7; r++)
        for (let col = 0; col < 5; col++)
          if (g[r][col] === '#') this.rect(cx + col * scale, y + r * scale, scale, scale, c);
      cx += GLYPH_ADV(scale);
    }
    return cx - x;
  }
  textCentered(cx, y, str, scale, c, outline) {
    const tw = this.textWidth(str, scale) - scale; // trim trailing advance
    this.drawText(Math.round(cx - tw / 2), y, str, scale, c, outline);
  }
  toPNG() {
    const { W, H, buf } = this;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type RGB
    const stride = W * 3;
    const raw = Buffer.alloc((stride + 1) * H);
    for (let y = 0; y < H; y++) {
      raw[y * (stride + 1)] = 0; // filter: none
      buf.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    const idat = zlib.deflateSync(raw, { level: 6 });
    return Buffer.concat([
      sig,
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', idat),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  }
}
