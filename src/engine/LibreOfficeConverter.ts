import * as libre from 'libreoffice-convert';

export class LibreOfficeConverter {
  /**
   * Convert DOCX Buffer to PDF Buffer directly using LibreOffice
   * preserving 100% of the original Word layout.
   */
  static async convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Ext name '.pdf', Filter undefined (auto detect)
      libre.convert(docxBuffer, '.pdf', undefined, (err, done) => {
        if (err) {
          console.error('[LibreOfficeConverter] Conversion failed:', err);
          return reject(err);
        }
        resolve(done);
      });
    });
  }
}
