import { SchemaField, TemplateLoader } from './TemplateLoader';

/**
 * FieldScanner: Mendeteksi semua placeholder {{field}} dari template Handlebars,
 * lalu menggabungkannya dengan schema.json untuk menghasilkan field list yang lengkap.
 */
export class FieldScanner {
  /**
   * Scan raw template string untuk menemukan semua placeholder Handlebars.
   * Mengabaikan helper built-in (#each, #if, /each, /if, else, this, dll.)
   */
  static scanTemplate(templateContent: string): string[] {
    // Match {{field}}, {{field.nested}}, tapi abaikan block helpers (#each, #if, etc.)
    const regex = /\{\{\s*(?!#|\/|else|this|@|\.)([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
    const fields = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = regex.exec(templateContent)) !== null) {
      const fieldName = match[1].trim();
      // Abaikan helper Handlebars custom seperti "multiply"
      if (!isHandlebarsBuiltin(fieldName)) {
        fields.add(fieldName.split('.')[0]); // Ambil root key saja
      }
    }

    return Array.from(fields);
  }

  /**
   * Scan berdasarkan templateId — load template dari disk lalu scan.
   */
  static scanById(templateId: string): string[] {
    const template = TemplateLoader.load(templateId);
    return this.scanTemplate(template);
  }

  /**
   * Return field list lengkap dari schema.json (dengan metadata required, type, dll.)
   */
  static getFieldsFromSchema(templateId: string): SchemaField[] {
    const schema = TemplateLoader.loadSchema(templateId);
    return schema.fields;
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

const HANDLEBARS_BUILTINS = new Set([
  'each', 'if', 'unless', 'with', 'lookup', 'log',
  // Custom helpers yang umum dipakai
  'multiply', 'formatCurrency', 'formatDate', 'add', 'subtract',
]);

function isHandlebarsBuiltin(name: string): boolean {
  return HANDLEBARS_BUILTINS.has(name);
}
