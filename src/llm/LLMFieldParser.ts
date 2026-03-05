import OpenAI from 'openai';
import { SchemaField } from '../engine/TemplateLoader';

/**
 * LLMFieldParser: Kirim teks OCR ke LLM untuk extract field values.
 *
 * Berbeda dari LLMFieldAnalyzer (yang remap JSON keys),
 * LLMFieldParser mengekstrak nilai dari teks mentah (OCR output)
 * dan langsung menghasilkan JSON dengan field names yang benar.
 */
export class LLMFieldParser {
  private static getClient(): OpenAI {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY tidak di-set');

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
   * Parse OCR text → structured field values menggunakan LLM.
   *
   * @param ocrText  - Teks hasil OCR dari PDF
   * @param templateId - ID template ('invoice' | 'receipt')
   * @param fields   - Field definitions dari schema.json
   */
  static async parse(
    ocrText: string,
    templateId: string,
    fields: SchemaField[],
  ): Promise<{ extracted: Record<string, unknown>; confidence: Record<string, number> }> {
    const client = this.getClient();
    const model = process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';

    const fieldList = fields.map((f) => ({
      name: f.name,
      type: f.type,
      required: f.required,
      ...(f.format ? { format: f.format } : {}),
      ...(f.items ? { items: f.items } : {}),
    }));

    const prompt = `You are a document data extraction assistant. Extract field values from the OCR text of a business document.

Template: "${templateId}"
Fields to extract:
${JSON.stringify(fieldList, null, 2)}

OCR Text:
---
${ocrText}
---

Rules:
- Extract only fields that are clearly present in the text
- For dates: normalize to YYYY-MM-DD format
- For numbers (subtotal, tax, total): return as plain number (e.g. 3367.20), no currency symbols
- For items array: extract each line item as { "description": string, "qty": number, "unit_price": number }
- If a field is not found or unclear, omit it entirely (do not return null)
- Return a JSON object with two keys:
  1. "extracted": object with field name → value
  2. "confidence": object with field name → confidence score (0.0 to 1.0)

Return valid JSON only, no markdown, no explanation.`;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 2000,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) return { extracted: {}, confidence: {} };

      const parsed = extractJSON<{
        extracted: Record<string, unknown>;
        confidence: Record<string, number>;
      }>(raw, { extracted: {}, confidence: {} });

      return {
        extracted: parsed.extracted ?? {},
        confidence: parsed.confidence ?? {},
      };
    } catch (err) {
      console.error('[LLMFieldParser] LLM parse gagal:', err);
      return { extracted: {}, confidence: {} };
    }
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

function extractJSON<T>(raw: string, defaultVal: T): T {
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try { return JSON.parse(match[1].trim()) as T; } catch { /* continue */ }
    }
    const objMatch = raw.match(/(\{[\s\S]*\})/);
    if (objMatch?.[1]) {
      try { return JSON.parse(objMatch[1]) as T; } catch { /* continue */ }
    }
    return defaultVal;
  }
}
