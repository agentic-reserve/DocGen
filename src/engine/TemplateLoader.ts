import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

export class TemplateLoader {
  /**
   * Load template Handlebars (.hbs) dari disk berdasarkan templateId.
   * Returns raw template string.
   */
  static load(templateId: string): string {
    const templatePath = path.join(TEMPLATES_DIR, templateId, 'template.hbs');

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template "${templateId}" tidak ditemukan di ${templatePath}`);
    }

    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * Load schema.json dari template tertentu.
   */
  static loadSchema(templateId: string): TemplateSchema {
    const schemaPath = path.join(TEMPLATES_DIR, templateId, 'schema.json');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema untuk template "${templateId}" tidak ditemukan di ${schemaPath}`);
    }

    const raw = fs.readFileSync(schemaPath, 'utf-8');
    return JSON.parse(raw) as TemplateSchema;
  }

  /**
   * List semua template yang tersedia di folder templates/.
   */
  static listTemplates(): string[] {
    if (!fs.existsSync(TEMPLATES_DIR)) return [];

    return fs.readdirSync(TEMPLATES_DIR).filter((entry) => {
      const entryPath = path.join(TEMPLATES_DIR, entry);
      return (
        fs.statSync(entryPath).isDirectory() &&
        fs.existsSync(path.join(entryPath, 'template.hbs'))
      );
    });
  }
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  format?: string;
  items?: Record<string, string>;
}

export interface TemplateSchema {
  templateId: string;
  version: string;
  fields: SchemaField[];
}
