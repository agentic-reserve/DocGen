import { z } from 'zod';

// ── Item schema ────────────────────────────────────────────────────────────

export const LineItemSchema = z.object({
  description: z.string().min(1, { message: 'Deskripsi item tidak boleh kosong' }),
  qty: z.number().positive({ message: 'Qty harus lebih dari 0' }),
  unit_price: z.number().nonnegative({ message: 'Harga tidak boleh negatif' }),
});

// ── Watermark options ──────────────────────────────────────────────────────

export const WatermarkOptionsSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().default('DRAFT'),
  opacity: z.number().min(0).max(1).default(0.12),
  fontSize: z.number().positive().default(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Color harus format hex #rrggbb' })
    .default('#cc0000'),
  angle: z.number().default(-45),
});

// ── Generate request ───────────────────────────────────────────────────────

export const GenerateRequestSchema = z.object({
  templateId: z.string().min(1, { message: 'templateId wajib diisi' }),

  data: z.record(z.string(), z.unknown()),

  options: z
    .object({
      watermark: WatermarkOptionsSchema.optional(),
      useLLM: z.boolean().default(false),
      outputFormat: z.enum(['pdf']).default('pdf'),
    })
    .optional()
    .default({ useLLM: false, outputFormat: 'pdf' }),
});

// ── Analyze request (LLM endpoint) ────────────────────────────────────────

export const AnalyzeRequestSchema = z.object({
  templateId: z.string().min(1, { message: 'templateId wajib diisi' }),
  data: z.record(z.string(), z.unknown()),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
