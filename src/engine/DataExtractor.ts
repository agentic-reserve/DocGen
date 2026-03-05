import { PDFScanResult } from './PDFScanner';

/**
 * DataExtractor: Pattern matching teks PDF → field values.
 *
 * Strategi:
 * 1. Jalankan semua extractor rules secara berurutan terhadap teks PDF
 * 2. Setiap rule mencoba deteksi satu field menggunakan regex / heuristic
 * 3. Konfidence score dihitung per field
 * 4. Field yang tidak terdeteksi → null (bukan error)
 */
export class DataExtractor {
  /**
   * Extract field data dari hasil scan PDF.
   * templateId dipakai untuk pilih set rules yang sesuai.
   */
  static extract(scan: PDFScanResult, templateId: string): ExtractionResult {
    const text = scan.text;
    const lines = scan.lines;

    // Pilih extractor rules berdasarkan template
    const rules = RULES[templateId] ?? RULES['_generic'];
    const extracted: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};

    for (const rule of rules) {
      const result = rule.extract(text, lines);
      if (result.value !== null && result.value !== undefined) {
        extracted[rule.field] = result.value;
        confidence[rule.field] = result.confidence;
      }
    }

    // Hitung overall confidence
    const scores = Object.values(confidence);
    const avgConfidence =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      templateId,
      extracted,
      confidence,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      rawText: text,
      numPages: scan.numPages,
    };
  }
}

// ──── Rule Definitions ─────────────────────────────────────────────────────

interface ExtractRule {
  field: string;
  extract: (text: string, lines: string[]) => { value: unknown; confidence: number };
}

/**
 * Rules untuk template invoice.
 * Setiap rule mencoba berbagai pattern — ambil match pertama yang ditemukan.
 */
const invoiceRules: ExtractRule[] = [
  {
    field: 'invoice_number',
    extract: (text) => {
      const patterns = [
        // "Invoice No : CAEGR - INV - 260227 - MCT26" — dengan atau tanpa spasi di sekitar tanda hubung
        /(?:No\.?\s*Invoice|Invoice\s*No\.?|Nomor\s*Invoice|No\s*Inv\.?|Invoice\s*#)[:\s#]*([A-Z0-9][\w\s\-\/\.]{3,60}?)(?:\n|$)/im,
        // Compact: INV-2026-001
        /\b(INV[-\/]?\d{4}[-\/]?\d{2,6})\b/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
          // Collapse spaces around hyphens, then collapse digit-space-digit
          const val = m[1].trim()
            .replace(/\s*-\s*/g, '-')   // "CAEGR - INV" → "CAEGR-INV"
            .replace(/(\d)\s+(\d)/g, '$1$2') // "26 0 22 7" → "260227"
            .replace(/\s+/g, ' ').trim();
          if (val.length > 2) return { value: val, confidence: 0.9 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'issue_date',
    extract: (text) => {
      const patterns = [
        // "Invoice Date : 2 7 February 202 6" — spasi di dalam angka/kata
        /(?:Invoice\s*Date|Tanggal\s*Invoice|Tgl\.?\s*Invoice|Issue\s*Date|Issued?)[:\s]*(\d[\d\s]{0,3}\w[\w\s]{2,12}\d[\d\s]{2,5})/i,
        // Standard: "Date : 27 February 2026"
        /(?:Tanggal|Tgl\.?|Date)[:\s]*(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const cleaned = m[1].trim().replace(/\s+/g, ' ').replace(/(\d)\s+(\d)/g, '$1$2');
          return { value: normalizeDate(cleaned), confidence: 0.85 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'due_date',
    extract: (text) => {
      const patterns = [
        // "Due Date : 3 March 202 6"
        /(?:Jatuh\s*Tempo|Due\s*Date|Batas\s*Bayar|Payment\s*Due)[:\s]*(\d[\d\s]{0,3}\w[\w\s]{2,12}\d[\d\s]{2,5})/i,
        /(?:Jatuh\s*Tempo|Due\s*Date|Batas\s*Bayar|Payment\s*Due)[:\s]*(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const cleaned = m[1].trim().replace(/\s+/g, ' ').replace(/(\d)\s+(\d)/g, '$1$2');
          return { value: normalizeDate(cleaned), confidence: 0.85 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'client_name',
    extract: (text, lines) => {
      // Cari index baris "Bill To" / "Kepada" lalu ambil baris berikutnya
      const labelIdx = lines.findIndex((l) =>
        /^(?:Kepada|Tagihan\s*Kepada|Bill(?:ed)?\s+To|Customer|Client|Pelanggan)\s*:?\s*$/i.test(l.trim()),
      );
      if (labelIdx >= 0 && labelIdx + 1 < lines.length) {
        const next = lines[labelIdx + 1].trim().replace(/\s+/g, ' ');
        if (next.length > 2 && /^[A-Z]/i.test(next)) {
          return { value: next, confidence: 0.85 };
        }
      }
      // Fallback: inline "Kepada: PT Maju" atau label+nilai pada baris sama
      const inlinePatterns = [
        /(?:Kepada|Tagihan\s*Kepada|Bill(?:ed)?\s+To|Client|Customer|Pelanggan)[:\s]+([A-Z][^\n]{2,60})/im,
        /(?:Yth\.?|Kepada\s*Yth\.?)[:\s]*\n?\s*([A-Z][^\n]{2,60})/im,
      ];
      for (const p of inlinePatterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const val = m[1].trim().replace(/\s+/g, ' ');
          if (/^(?:Company|Description|Item|Subtotal|Total|Invoice|Receipt)/i.test(val)) continue;
          if (val.length > 2) return { value: val, confidence: 0.8 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'client_address',
    extract: (_text, lines) => {
      // Cari baris setelah "Kepada" / "Billed To" yang tidak terlihat seperti label
      const labelIdx = lines.findIndex((l) =>
        /^(?:Kepada|Tagihan\s*Kepada|Billed?\s*To|Customer|Client)/i.test(l),
      );
      if (labelIdx >= 0 && labelIdx + 2 < lines.length) {
        // Baris +1 biasanya nama client, +2 dan seterusnya alamat
        const addressLines: string[] = [];
        for (let i = labelIdx + 2; i <= Math.min(labelIdx + 4, lines.length - 1); i++) {
          const l = lines[i];
          // Stop kalau baris mulai terlihat seperti label baru
          if (/^(?:No\.?|Tanggal|Invoice|Total|Subtotal|Item|Deskripsi)/i.test(l)) break;
          if (l.length > 3) addressLines.push(l);
        }
        if (addressLines.length > 0)
          return { value: addressLines.join(', '), confidence: 0.65 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'subtotal',
    extract: (text) => {
      const patterns = [
        /Subtotal[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{0,2})?)/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return { value: parseIDRNumber(m[1]), confidence: 0.85 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'tax',
    extract: (text) => {
      const patterns = [
        /(?:PPN|Tax|Pajak)[\s\d%]*[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*)/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return { value: parseIDRNumber(m[1]), confidence: 0.8 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'total',
    extract: (text) => {
      // "TOTAL" sering dicetak tebal — cari yang paling besar atau paling bawah
      const patterns = [
        /(?:^|\n)\s*TOTAL[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{0,2})?)/im,
        /Total\s+(?:Dibayar|Tagihan|Invoice)?[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*)/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return { value: parseIDRNumber(m[1]), confidence: 0.9 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'notes',
    extract: (text) => {
      const patterns = [
        /(?:Catatan|Notes?|Keterangan)[:\s]*\n?\s*([^\n]{5,200})/i,
        /(?:Pembayaran\s*via[^\n]{5,100})/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1] || m?.[0]) {
          const val = (m[1] ?? m[0]).trim();
          if (val.length > 4) return { value: val, confidence: 0.75 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'items',
    extract: (text, lines) => {
      const items = extractLineItems(lines);
      if (items.length > 0) return { value: items, confidence: 0.75 };
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'company_name',
    extract: (text, lines) => {
      // Coba dari footer: "issued by Caesar Agency" atau "© 2026 Caesar Agency"
      const footerPatterns = [
        /(?:issued\s+by|from|oleh)\s+([A-Z][A-Za-z\s\.]{2,60}?)(?:\.|,|\n|$)/im,
        /©\s*\d{4}\s+([A-Z][A-Za-z\s\.]{2,60}?)(?:\.|,|\n|$)/im,
      ];
      for (const p of footerPatterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const val = m[1].trim();
          if (val.length > 2) return { value: val, confidence: 0.75 };
        }
      }
      // Fallback: baris pertama yang bukan "INVOICE/RECEIPT" dan bukan kode dokumen
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const l = lines[i].trim();
        if (/^(?:INVOICE|RECEIPT|KWITANSI|\d+)$/i.test(l)) continue;
        // Skip baris yang terlihat seperti kode dokumen (banyak dash/angka)
        if ((l.match(/-/g) ?? []).length >= 3) continue;
        if (l.length > 2 && l.length < 80) {
          return { value: l, confidence: 0.6 };
        }
      }
      return { value: null, confidence: 0 };
    },
  },
];

/**
 * Rules untuk template receipt (kwitansi).
 */
const receiptRules: ExtractRule[] = [
  {
    field: 'receipt_number',
    extract: (text) => {
      const patterns = [
        /(?:No\.?\s*Kwitansi|Kwitansi\s*No\.?|Receipt\s*No\.?|No\.?\s*Receipt)[:\s#]*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
        /\b(RCP[-\/]?\d{4}[-\/]?\d{2,6})\b/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return { value: m[1].trim(), confidence: 0.9 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'receipt_date',
    extract: (text) => {
      const m = text.match(
        /(?:Tanggal|Tgl\.?|Date)[:\s]*(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2})/i,
      );
      if (m?.[1]) return { value: normalizeDate(m[1].trim()), confidence: 0.85 };
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'payer_name',
    extract: (text) => {
      const m = text.match(
        /(?:Diterima\s*Dari|Dari|Received\s*From|Payer)[:\s]*\n?\s*([A-Z][^\n]{2,60})/im,
      );
      if (m?.[1]) return { value: m[1].trim(), confidence: 0.85 };
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'total',
    extract: (text) => {
      const patterns = [
        /(?:Total\s*Dibayar|Amount\s*Paid|Jumlah)[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*)/i,
        /TOTAL[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*)/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return { value: parseIDRNumber(m[1]), confidence: 0.9 };
      }
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'subtotal',
    extract: (text) => {
      const m = text.match(/Subtotal[:\s]*(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*)/i);
      if (m?.[1]) return { value: parseIDRNumber(m[1]), confidence: 0.85 };
      return { value: null, confidence: 0 };
    },
  },
  {
    field: 'items',
    extract: (_text, lines) => {
      const items = extractLineItems(lines);
      if (items.length > 0) return { value: items, confidence: 0.75 };
      return { value: null, confidence: 0 };
    },
  },
];

/** Generic rules — dipakai kalau templateId tidak dikenal */
const genericRules: ExtractRule[] = [
  ...invoiceRules.filter((r) => ['subtotal', 'total', 'notes'].includes(r.field)),
];

const RULES: Record<string, ExtractRule[]> = {
  invoice: invoiceRules,
  receipt: receiptRules,
  _generic: genericRules,
};

// ──── Line Item Extractor ──────────────────────────────────────────────────

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
}

/**
 * Coba detect baris item dari tabel dalam PDF.
 * Pattern: [deskripsi] [qty] [harga]
 */
function extractLineItems(lines: string[]): LineItem[] {
  const items: LineItem[] = [];

  // Cari baris yang mengandung angka di akhir (kemungkinan baris item)
  // Pattern: teks ... angka angka (qty + price)
  const itemPattern =
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(?:Rp\.?\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{0,2})?)\s*$/;

  for (const line of lines) {
    const m = line.match(itemPattern);
    if (m) {
      const description = m[1].trim();
      const qty = parseFloat(m[2].replace(',', '.'));
      const unit_price = parseIDRNumber(m[3]);

      // Filter out baris yang bukan item (Subtotal, Total, dll.)
      if (
        /^(?:Subtotal|Total|Tax|PPN|Discount|Diskon|Jumlah)/i.test(description)
      )
        continue;

      if (description.length > 1 && !isNaN(qty) && unit_price > 0) {
        items.push({ description, qty, unit_price });
      }
    }
  }

  return items;
}

// ──── Number & Date Helpers ────────────────────────────────────────────────

/**
 * Parse angka format IDR: "15.000.000" atau "15,000,000" → 15000000
 */
function parseIDRNumber(str: string): number {
  // Hapus semua separator kecuali desimal terakhir
  const cleaned = str
    .replace(/[Rp\s]/g, '')
    .replace(/\./g, '')   // IDR pakai titik sebagai thousands separator
    .replace(',', '.');    // ubah koma desimal ke titik

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalize berbagai format tanggal ke YYYY-MM-DD.
 * Input: "5 Maret 2025", "05/03/2025", "2025-03-05", dll.
 */
function normalizeDate(str: string): string {
  // Sudah format ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const MONTHS_ID: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04',
    mei: '05', juni: '06', juli: '07', agustus: '08',
    september: '09', oktober: '10', november: '11', desember: '12',
    january: '01', february: '02', march: '03', april2: '04', may: '05',
    june: '06', july: '07', august: '08',
    october: '10', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // "5 Maret 2025" atau "05 Maret 2025"
  const longMatch = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const monthKey = longMatch[2].toLowerCase();
    const month = MONTHS_ID[monthKey] ?? MONTHS_ID[monthKey + '2'] ?? '01';
    const year = longMatch[3];
    return `${year}-${month}-${day}`;
  }

  // "05/03/2025" atau "05-03-2025"
  const slashMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return str; // Return as-is kalau tidak bisa parse
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  templateId: string;
  extracted: Record<string, unknown>;
  confidence: Record<string, number>;
  avgConfidence: number;
  rawText: string;
  numPages: number;
}
