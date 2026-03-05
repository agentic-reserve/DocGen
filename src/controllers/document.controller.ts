import { Request, Response } from 'express';
import { TemplateLoader } from '../engine/TemplateLoader';
import { FieldScanner } from '../engine/FieldScanner';
import { FieldMapper } from '../engine/FieldMapper';
import { PDFRenderer } from '../engine/PDFRenderer';
import { Watermarker } from '../engine/Watermarker';
import { LLMFieldAnalyzer } from '../llm/LLMFieldAnalyzer';
import { LLMValidator } from '../llm/LLMValidator';
import { PDFScanner } from '../engine/PDFScanner';
import { DataExtractor } from '../engine/DataExtractor';
import { GenerateRequestSchema, AnalyzeRequestSchema } from '../utils/validation';
import { ZodError } from 'zod';

// ── POST /api/v1/generate ──────────────────────────────────────────────────

export async function generateDocument(req: Request, res: Response): Promise<void> {
  // 1. Parse & validasi request body
  const parseResult = GenerateRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: formatZodError(parseResult.error),
    });
    return;
  }

  const { templateId, data, options } = parseResult.data;

  try {
    // 2. Load template & schema
    const templateContent = TemplateLoader.load(templateId);
    const schema = TemplateLoader.loadSchema(templateId);

    // 3. LLM Smart Field Mapping (opsional)
    let mappedData = data as Record<string, unknown>;
    if (options?.useLLM) {
      mappedData = await LLMFieldAnalyzer.analyze(templateId, data as Record<string, unknown>);
    }

    // 4. Validasi required fields berdasarkan schema
    const missingFields = FieldMapper.validate(mappedData, schema.fields);
    if (missingFields.length > 0) {
      res.status(422).json({
        success: false,
        error: 'Missing required fields',
        missingFields,
      });
      return;
    }

    // 5. Inject data ke template → HTML
    const html = FieldMapper.inject(templateContent, mappedData);

    // 6. Render HTML → PDF
    const pdfBuffer = await PDFRenderer.render(html);

    // 7. Apply watermark (opsional)
    const watermarkOpts = options?.watermark;
    const finalPdf = watermarkOpts?.enabled
      ? await Watermarker.apply(pdfBuffer, watermarkOpts)
      : pdfBuffer;

    // 8. Return PDF
    const filename = `${templateId}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', finalPdf.length);
    res.status(200).send(finalPdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';

    if (message.includes('tidak ditemukan')) {
      res.status(404).json({ success: false, error: message });
      return;
    }

    console.error('[generateDocument] Error:', err);
    res.status(500).json({ success: false, error: 'Gagal generate dokumen', detail: message });
  }
}

// ── GET /api/v1/fields/:templateId ────────────────────────────────────────

export async function getFields(req: Request, res: Response): Promise<void> {
  const templateId = req.params['templateId'] as string;

  try {
    const schema = TemplateLoader.loadSchema(templateId);
    const scannedFields = FieldScanner.scanById(templateId);

    res.status(200).json({
      success: true,
      templateId,
      version: schema.version,
      fields: schema.fields,
      scannedPlaceholders: scannedFields,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('tidak ditemukan')) {
      res.status(404).json({ success: false, error: message });
      return;
    }

    console.error('[getFields] Error:', err);
    res.status(500).json({ success: false, error: message });
  }
}

// ── GET /api/v1/templates ─────────────────────────────────────────────────

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  try {
    const templates = TemplateLoader.listTemplates();
    res.status(200).json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal list templates' });
  }
}

// ── POST /api/v1/analyze ──────────────────────────────────────────────────

export async function analyzeWithLLM(req: Request, res: Response): Promise<void> {
  const parseResult = AnalyzeRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: formatZodError(parseResult.error),
    });
    return;
  }

  const { templateId, data } = parseResult.data;

  try {
    // Load schema untuk konteks
    const schema = TemplateLoader.loadSchema(templateId);

    // Jalankan LLM field mapping + validasi
    const [mappedData, validationResult] = await Promise.all([
      LLMFieldAnalyzer.analyze(templateId, data as Record<string, unknown>),
      LLMValidator.validate(templateId, data as Record<string, unknown>, schema),
    ]);

    res.status(200).json({
      success: true,
      templateId,
      original: data,
      mapped: mappedData,
      validation: validationResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('tidak ditemukan')) {
      res.status(404).json({ success: false, error: message });
      return;
    }

    console.error('[analyzeWithLLM] Error:', err);
    res.status(500).json({ success: false, error: 'LLM analysis gagal', detail: message });
  }
}

// ── POST /api/v1/scan ─────────────────────────────────────────────────────

export async function scanDocument(req: Request, res: Response): Promise<void> {
  // File sudah di-attach oleh multer middleware sebagai req.file
  if (!req.file) {
    res.status(400).json({ success: false, error: 'File PDF wajib di-upload (field name: file)' });
    return;
  }

  // templateId opsional — dari query string, default ke _generic
  const templateId = (req.query['templateId'] as string | undefined) ?? '_generic';

  try {
    // 1. Extract teks dari PDF
    const scanResult = await PDFScanner.scan(req.file.buffer);

    // 2. Pattern matching → field values
    const extraction = DataExtractor.extract(scanResult, templateId);

    res.status(200).json({
      success: true,
      templateId: extraction.templateId,
      numPages: extraction.numPages,
      avgConfidence: extraction.avgConfidence,
      extracted: extraction.extracted,
      confidence: extraction.confidence,
      rawText: extraction.rawText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scanDocument] Error:', err);
    res.status(500).json({ success: false, error: 'Gagal scan PDF', detail: message });
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────

function formatZodError(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!result[path]) result[path] = [];
    result[path].push(issue.message);
  }

  return result;
}
