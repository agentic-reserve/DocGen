import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

/**
 * Watermarker: Menambahkan watermark teks ke setiap halaman PDF.
 * Menggunakan pdf-lib untuk manipulasi PDF langsung.
 */
export class Watermarker {
  /**
   * Tambahkan watermark ke PDF buffer.
   * Returns PDF buffer baru yang sudah ada watermark-nya.
   */
  static async apply(pdfBuffer: Buffer, options: WatermarkOptions = {}): Promise<Buffer> {
    if (!options.enabled) {
      return pdfBuffer;
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    const text = options.text ?? 'DRAFT';
    const opacity = options.opacity ?? 0.12;
    const fontSize = options.fontSize ?? 80;

    // Parse color dari hex string atau pakai default merah
    const color = parseColor(options.color ?? '#cc0000');

    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      // Posisi tengah halaman
      const x = (width - textWidth) / 2;
      const y = (height - textHeight) / 2;

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(options.angle ?? -45),
      });
    }

    const modifiedPdf = await pdfDoc.save();
    return Buffer.from(modifiedPdf);
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

function parseColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  return {
    r: isNaN(r) ? 0.8 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
  };
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface WatermarkOptions {
  enabled?: boolean;
  text?: string;
  opacity?: number;
  fontSize?: number;
  color?: string;  // hex color, e.g. "#cc0000"
  angle?: number;  // rotation in degrees, default -45
}
