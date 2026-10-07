// Minimal MessagePack encoder for WebContainer binary snapshots: maps, strings, small ints and byte arrays are all we need.
// (@webcontainer/snapshot builds the same format but only runs in Node; the packages are installed inside the browser here.)
const utf8 = new TextEncoder();

function header(len: number, fixBase: number, fixMax: number, wide: [number, number, number][]) {
  if (len <= fixMax) {
    return Uint8Array.of(fixBase | len);
  }

  for (const [max, code, size] of wide) {
    if (len <= max) {
      const b = new Uint8Array(1 + size);
      b[0] = code;

      for (let i = 0; i < size; i++) {
        b[1 + i] = (len >>> (8 * (size - 1 - i))) & 255;
      }

      return b;
    }
  }

  throw new Error('value too large');
}

export function encodeMsgpack(root: unknown): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const push = (u: Uint8Array) => {
    chunks.push(u);
    total += u.length;
  };

  const enc = (v: unknown): void => {
    if (v instanceof Uint8Array) {
      push(header(v.length, 0, -1, [[255, 0xc4, 1], [65535, 0xc5, 2], [4294967295, 0xc6, 4]]));
      push(v);
    } else if (typeof v === 'string') {
      const b = utf8.encode(v);
      push(header(b.length, 0xa0, 31, [[255, 0xd9, 1], [65535, 0xda, 2], [4294967295, 0xdb, 4]]));
      push(b);
    } else if (typeof v === 'number') {
      if (v < 128) {
        push(Uint8Array.of(v));
      } else if (v < 256) {
        push(Uint8Array.of(0xcc, v));
      } else if (v < 65536) {
        push(Uint8Array.of(0xcd, v >> 8, v & 255));
      } else {
        push(Uint8Array.of(0xce, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255));
      }
    } else {
      const keys = Object.keys(v as object);
      push(header(keys.length, 0x80, 15, [[65535, 0xde, 2], [4294967295, 0xdf, 4]]));

      for (const k of keys) {
        enc(k);
        enc((v as Record<string, unknown>)[k]);
      }
    }
  };

  enc(root);

  const out = new Uint8Array(total);
  let offset = 0;

  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }

  return out;
}
