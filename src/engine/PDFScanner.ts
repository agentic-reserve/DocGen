import { PDFParse } from 'pdf-parse';

/**
 * PDFScanner: Extract raw text dari PDF buffer menggunakan pdf-parse v2.
 * Tidak butuh LLM — pure text extraction via PDF.js internals.
 */
export class PDFScanner {
  /**
   * Extract teks dari PDF buffer.
   * Returns structured scan result dengan teks per halaman.
   */
  static async scan(pdfBuffer: Buffer): Promise<PDFScanResult> {
    // pdf-parse v2 membutuhkan Uint8Array
    const uint8 = new Uint8Array(pdfBuffer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (PDFParse as any)(uint8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (parser.load(uint8) as Promise<any>);

    const numPages: number = doc.numPages as number;
    const pages: PageText[] = [];
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = await doc.getPage(i) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await page.getTextContent() as any;

      // Extract dan susun teks dari items — pertahankan urutan & spasi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageText = buildPageText(content.items as any[]);

      pages.push({ pageNumber: i, text: pageText });
      fullText += (fullText ? '\n\n' : '') + pageText;
    }

    // Extract metadata PDF jika ada
    let info: PDFScanResult['info'] = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata = await (doc.getMetadata() as Promise<any>);
      const inf = metadata?.info ?? {};
      info = {
        title: inf.Title ?? undefined,
        author: inf.Author ?? undefined,
        creator: inf.Creator ?? undefined,
        producer: inf.Producer ?? undefined,
      };
    } catch {
      // metadata opsional, abaikan error
    }

    return {
      text: fullText,
      lines: splitLines(fullText),
      pages,
      numPages,
      info,
    };
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

/**
 * Susun items dari getTextContent menjadi string teks yang bisa dibaca.
 * Pertimbangkan posisi Y untuk deteksi line break.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPageText(items: any[]): string {
  if (!items || items.length === 0) return '';

  // Kelompokkan berdasarkan posisi Y (sama = satu baris)
  const lineMap = new Map<number, string[]>();

  for (const item of items) {
    const str: string = item.str ?? '';
    if (!str.trim()) continue;

    // Bulatkan posisi Y ke kelipatan 2 untuk toleransi perbedaan minor
    const transform: number[] = item.transform ?? [1, 0, 0, 1, 0, 0];
    const y = Math.round(transform[5] / 2) * 2;

    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y)!.push(str);
  }

  // Sort by Y descending (PDF y=0 di bawah, jadi Y besar = baris atas)
  const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

  return sortedYs
    .map((y) => lineMap.get(y)!.join(' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface PDFScanResult {
  text: string;
  lines: string[];
  pages: PageText[];
  numPages: number;
  info: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
  };
}
