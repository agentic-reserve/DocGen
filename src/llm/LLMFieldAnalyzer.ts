import OpenAI from 'openai';
import { TemplateLoader } from '../engine/TemplateLoader';

/**
 * LLMFieldAnalyzer: Menggunakan LLM (via OpenRouter) untuk melakukan
 * semantic field mapping — memetakan key dari JSON input ke placeholder template
 * meskipun namanya tidak eksak sama.
 *
 * Contoh:
 *   Input:    { "customer": "PT Maju" }
 *   Template: {{ client_name }}
 *   Output:   { "client_name": "PT Maju" }
 */
export class LLMFieldAnalyzer {
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
   * Analyze dan remap data JSON ke field names yang dipakai template.
   * Jika LLM gagal atau key sudah cocok, return data original.
   */
  static async analyze(
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';

    // Dapatkan field names dari schema
    const schema = TemplateLoader.loadSchema(templateId);
    const templateFields = schema.fields.map((f) => f.name);
    const inputKeys = Object.keys(data);

    // Kalau semua key sudah ada di template, tidak perlu LLM
    const allMatch = inputKeys.every((k) => templateFields.includes(k));
    if (allMatch) return data;

    const prompt = buildMappingPrompt(templateId, templateFields, data);

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: `You are a data field mapping assistant. Map input JSON keys to template field names based on semantic similarity. Respond with valid JSON only, no markdown, no explanation.\n\n${prompt}`,
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) return data;
      const mapped = extractJSON<Record<string, unknown>>(raw, {});

      // Merge: pakai mapped untuk key yang diremapping, pertahankan key original yang sudah benar
      return { ...data, ...mapped };
    } catch (err) {
      console.warn('[LLMFieldAnalyzer] LLM gagal, fallback ke data original:', err);
      return data;
    }
  }
}

// ──── Helpers ──────────────────────────────────────────────────────────────

/**
 * Ekstrak JSON dari response LLM yang mungkin membungkusnya dalam markdown code block.
 * Fallback ke defaultVal jika parsing gagal.
 */
function extractJSON<T>(raw: string, defaultVal: T): T {
  // Coba parse langsung
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    // Coba ekstrak dari ```json ... ``` atau ``` ... ```
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {
        // lanjut ke fallback
      }
    }
    // Coba temukan object/array JSON di dalam teks
    const objMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch?.[1]) {
      try {
        return JSON.parse(objMatch[1]) as T;
      } catch {
        // lanjut ke fallback
      }
    }
    return defaultVal;
  }
}

function buildMappingPrompt(
  templateId: string,
  templateFields: string[],
  inputData: Record<string, unknown>,
): string {
  // Kirim hanya keys dari input (bukan full values) agar prompt tidak terlalu panjang
  // untuk model yang punya token limit ketat
  const inputKeysAndSampleValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputData)) {
    // Untuk array, kirim contoh item pertama saja
    if (Array.isArray(v)) {
      inputKeysAndSampleValues[k] = v.length > 0 ? [v[0]] : [];
    } else {
      inputKeysAndSampleValues[k] = v;
    }
  }

  return `Map input JSON keys to template field names.
Template: "${templateId}"
Template fields: ${JSON.stringify(templateFields)}
Input: ${JSON.stringify(inputKeysAndSampleValues)}

Rules:
- Remap keys that are semantically similar to template fields (e.g. "customer" -> "client_name", "no_invoice" -> "invoice_number", "tanggal" -> "issue_date")
- Keep exact matches as-is
- Preserve all original values, only rename keys
- Include ALL input keys in output

Return remapped JSON object only, no explanation.`.trim();
}
