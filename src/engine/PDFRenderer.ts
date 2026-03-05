import puppeteer, { Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

/**
 * PDFRenderer: Convert HTML string → PDF Buffer menggunakan Puppeteer.
 * Menggunakan singleton browser instance untuk efisiensi.
 */
export class PDFRenderer {
  /**
   * Render HTML string menjadi PDF Buffer.
   */
  static async render(html: string, options: PDFRenderOptions = {}): Promise<Buffer> {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: options.format ?? 'A4',
        printBackground: options.printBackground ?? true,
        margin: options.margin ?? {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  /**
   * Tutup browser instance (untuk graceful shutdown).
   */
  static async close(): Promise<void> {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface PDFRenderOptions {
  format?: 'A4' | 'A3' | 'Letter' | 'Legal';
  printBackground?: boolean;
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}
