import Handlebars from 'handlebars';
import { SchemaField } from './TemplateLoader';

/**
 * FieldMapper: Menginjeksi data JSON ke dalam template Handlebars.
 * Juga handles validasi field required sebelum render.
 */
export class FieldMapper {
  static {
    // Register custom Handlebars helpers
    registerHelpers();
  }

  /**
   * Validasi bahwa semua required fields ada dalam data yang diberikan.
   * Returns array of missing required field names.
   */
  static validate(data: Record<string, unknown>, schemaFields: SchemaField[]): string[] {
    const missing: string[] = [];

    for (const field of schemaFields) {
      if (field.required) {
        const value = data[field.name];
        if (value === undefined || value === null || value === '') {
          missing.push(field.name);
        }
      }
    }

    return missing;
  }

  /**
   * Compile template Handlebars dengan data yang diberikan.
   * Returns HTML string yang sudah diisi.
   */
  static inject(templateContent: string, data: Record<string, unknown>): string {
    const compiled = Handlebars.compile(templateContent, { noEscape: false });
    return compiled(data);
  }
}

// ──── Handlebars Helpers ───────────────────────────────────────────────────

function registerHelpers(): void {
  // Helper: multiply dua angka (untuk line item total)
  Handlebars.registerHelper('multiply', (a: unknown, b: unknown) => {
    const numA = Number(a);
    const numB = Number(b);
    if (isNaN(numA) || isNaN(numB)) return 0;
    return formatCurrency(numA * numB);
  });

  // Helper: formatCurrency — format angka ke Rupiah
  Handlebars.registerHelper('formatCurrency', (value: unknown) => {
    return formatCurrency(Number(value));
  });

  // Helper: formatDate — format ISO date ke DD/MM/YYYY
  Handlebars.registerHelper('formatDate', (dateStr: unknown) => {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  });

  // Helper: add
  Handlebars.registerHelper('add', (a: unknown, b: unknown) => Number(a) + Number(b));

  // Helper: addOne (untuk nomor baris 1-indexed)
  Handlebars.registerHelper('addOne', (index: unknown) => Number(index) + 1);

  // Helper: ifEqual
  Handlebars.registerHelper('ifEqual', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions,
  ) {
    return a === b ? options.fn(this) : options.inverse(this);
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}
