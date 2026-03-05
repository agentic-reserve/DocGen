import { fromBuffer } from 'pdf2pic';
import Tesseract from 'tesseract.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * OCREngine: Convert PDF pages ke PNG via pdf2pic (GraphicsMagick + Ghostscript),
 * kemudian jalankan Tesseract OCR pada setiap halaman.
 *
 * Digunakan sebagai fallback ketika pdf-parse tidak bisa extract teks
 * (image-based / scanned PDF).
 */
export class OCREngine {
  /**
   * Extract teks dari PDF buffer menggunakan OCR.
   * Returns teks gabungan dari semua halaman (max 5 halaman).
   */
  static async extractText(pdfBuffer: Buffer): Promise<string> {
    const tmpDir = os.tmpdir();
    const outputPrefix = `ocr-${Date.now()}`;
    const outputDir = path.join(tmpDir, outputPrefix);

    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // Convert PDF halaman 1–5 ke PNG (200 DPI = cukup untuk OCR)
      const converter = fromBuffer(pdfBuffer, {
        density: 200,
        saveFilename: 'page',
        savePath: outputDir,
        format: 'png',
        width: 1700,
        height: 2200,
      });

      const MAX_PAGES = 5;
      const pageTexts: string[] = [];

      for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
        let result;
        try {
          result = await converter(pageNum);
        } catch {
          // Halaman tidak ada → berhenti
          break;
        }

        const imgPath = result?.path;
        if (!imgPath || !fs.existsSync(imgPath)) break;

        try {
          const ocrResult = await Tesseract.recognize(imgPath, 'eng', {
            logger: () => {}, // suppress progress logs
          });
          const pageText = ocrResult.data.text?.trim() ?? '';
          if (pageText) pageTexts.push(pageText);
        } finally {
          try { fs.unlinkSync(imgPath); } catch { /* ignore */ }
        }
      }

      return pageTexts.join('\n\n');
    } finally {
      // Cleanup output dir
      try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
