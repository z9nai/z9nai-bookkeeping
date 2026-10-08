// Minimal XLSX reader (no dependency): unzips the package with the browser's
// DecompressionStream and extracts cell values and formulas of every sheet.
// Enough for files exported by Google Sheets / Excel; no styles, no merged cells.

export interface XCell {
  v: string | number | null; // cached value
  f?: string;                // formula without the leading "="
}

export interface XSheet {
  name: string;
  cells: Map<string, XCell>; // "D5" → cell
  maxRow: number;
  maxCol: number;
}

// ── ZIP ─────────────────────────────────────────────────────────────────────
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  // End of central directory record (may be followed by a comment)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine ZIP-Datei (kein End-of-Central-Directory)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error(`ZIP-Eintrag ${name} beschädigt`);
    const dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`ZIP-Kompression ${method} nicht unterstützt (${name})`);
  }
  return out;
}

// ── XML helpers (regex based: the files are machine generated) ──────────────
const unescapeXml = (s: string) => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : undefined;
};

// All <t> text runs inside an element (shared strings may be split into rich-text runs)
const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1])).join('');

export function colIndex(letters: string): number { // "A" → 1, "AB" → 28
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function colLetters(i: number): string { // 1 → "A"
  let s = '';
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function parseRef(ref: string): { col: number; row: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Ungültige Zellreferenz ${ref}`);
  return { col: colIndex(m[1]), row: Number(m[2]) };
}

export const cellRef = (col: number, row: number) => `${colLetters(col)}${row}`;

function parseSheet(name: string, xml: string, shared: string[]): XSheet {
  const cells = new Map<string, XCell>();
  let maxRow = 0, maxCol = 0;
  // <c r="A1" t="s"><f>…</f><v>…</v></c>  or self-closing <c r="A1" s="3"/>
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const open = ' ' + m[1];
    const ref = attr(open, 'r');
    if (!ref) continue;
    const body = m[2] ?? '';
    const type = attr(open, 't') ?? 'n';
    const fm = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
    const vm = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
    let v: string | number | null = null;
    if (type === 'inlineStr') v = textOf(body);
    else if (vm) {
      const raw = unescapeXml(vm[1]);
      if (type === 's') v = shared[Number(raw)] ?? '';
      else if (type === 'str' || type === 'e') v = raw;
      else if (type === 'b') v = raw === '1' ? 1 : 0;
      else v = raw.trim() === '' ? null : Number(raw);
    }
    const f = fm ? unescapeXml(fm[1]) : undefined;
    if (v == null && !f) continue;
    const cell: XCell = f ? { v, f } : { v };
    cells.set(ref, cell);
    const { col, row } = parseRef(ref);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  return { name, cells, maxRow, maxCol };
}

export async function readXlsx(buf: ArrayBuffer): Promise<XSheet[]> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const text = (n: string) => { const f = files.get(n); return f ? dec.decode(f) : null; };
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('Keine Excel-Datei (xl/workbook.xml fehlt)');
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\s[^>]*\/?>/g)) {
    const id = attr(m[0], 'Id'), t = attr(m[0], 'Target');
    if (id && t) targets.set(id, t.startsWith('/') ? t.slice(1) : `xl/${t}`);
  }
  const shared: string[] = [];
  const ss = text('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const sheets: XSheet[] = [];
  for (const m of wb.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const name = attr(m[0], 'name') ?? '';
    const rid = attr(m[0], 'r:id') ?? attr(m[0], 'id');
    const path = rid ? targets.get(rid) : undefined;
    const xml = path ? text(path) : null;
    if (xml == null) continue;
    sheets.push(parseSheet(name, xml, shared));
  }
  return sheets;
}
