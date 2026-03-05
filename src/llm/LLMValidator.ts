import OpenAI from 'openai';
import { TemplateSchema } from '../engine/TemplateLoader';

/**
 * LLMValidator: Menggunakan LLM untuk validasi semantik data dokumen.
 * Mendeteksi anomali seperti:
 * - Due date lebih awal dari issue date
 * - Total tidak cocok dengan sum of items
 * - Format yang tidak sesuai
 */
export class LLMValidator {
  private static getClient(): OpenAI {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY tidak di-set di environment variables');
    }

    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_SITE_URL ?? 'http://localhost:3000',
        'X-Title': process.env.APP_SITE_NAME ?? 'DocGen Engine',
      },
    });
  }

  /**
   * Validasi data secara semantik menggunakan LLM.
   * Returns object berisi issues yang ditemukan dan saran perbaikan.
   */
  static async validate(
    templateId: string,
    data: Record<string, unknown>,
    schema: TemplateSchema,
  ): Promise<ValidationResult> {
    const client = this.getClient();
    const model = process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';

    const prompt = buildValidationPrompt(templateId, data, schema);

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 4000,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) {
        return { issues: [], suggestions: [], status: 'skipped' };
      }
      const result = extractJSON<Partial<ValidationResult>>(raw, {});
      return {
        status: result.status ?? 'ok',
        issues: result.issues ?? [],
        suggestions: result.suggestions ?? [],
      };
    } catch (err) {
      console.warn('[LLMValidator] LLM gagal:', err);
      return { issues: [], suggestions: [], status: 'skipped' };
    }
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

/**
 * Ekstrak JSON dari response LLM yang mungkin membungkusnya dalam markdown code block.
 */
function extractJSON<T>(raw: string, defaultVal: T): T {
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {
        // lanjut
      }
    }
    const objMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch?.[1]) {
      try {
        return JSON.parse(objMatch[1]) as T;
      } catch {
        // lanjut
      }
    }
    return defaultVal;
  }
}

function buildValidationPrompt(
  templateId: string,
  data: Record<string, unknown>,
  schema: TemplateSchema,
): string {
  const requiredFields = schema.fields
    .filter((f) => f.required)
    .map((f) => f.name);

  return `You are a document validator. Check this document data for errors and return JSON only, no explanation.
Template: "${templateId}"
Required fields: ${JSON.stringify(requiredFields)}
Data: ${JSON.stringify(data)}

Check: 1) due_date must be after issue_date 2) total should equal subtotal + tax 3) missing required fields

Return: {"status":"ok","issues":[{"field":"name","severity":"error","message":"Indonesian desc"}],"suggestions":[{"field":"name","message":"Indonesian tip"}]}`.trim();
}

// ──── Types ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationSuggestion {
  field: string;
  message: string;
}

export interface ValidationResult {
  status: 'ok' | 'warning' | 'error' | 'skipped';
  issues: ValidationIssue[];
  suggestions: ValidationSuggestion[];
}
