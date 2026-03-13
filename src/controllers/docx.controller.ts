import { Request, Response } from 'express';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { PDFRenderer } from '../engine/PDFRenderer';
import { Watermarker } from '../engine/Watermarker';
import { LLMTemplateScanner } from '../llm/LLMTemplateScanner';

// POST /api/v1/docx/scan
export async function scanDocxTemplate(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File DOCX wajib di-upload (field name: file)' });
      return;
    }

    const content = req.file.buffer;
    const zip = new PizZip(content);
    
    // Read the XML file directly to extract fields
    const docXml = zip.file('word/document.xml')?.asText() || '';
    
    // When text is split across multiple <w:t> tags (very common in docx),
    // simple regex won't work well on raw XML.
    // Instead, we can use docxtemplater's internal inspecting or just remove xml tags
    const cleanText = docXml.replace(/<[^>]+>/g, '');
    
    // Find all occurrences of {{field}} or {field}
    const matches = Array.from(cleanText.matchAll(/\{\{([^}]+)\}\}|\{([^{}]+)\}/g));
    
    const fields = new Set<string>();
    for (const match of matches) {
      const field = ((match[1] ?? match[2]) as string).trim();
      // Skip loop tags like #, /, ^ from docxtemplater syntax
      if (!field.startsWith('#') && !field.startsWith('/') && !field.startsWith('^') && field !== '') {
        fields.add(field);
      }
    }

    // Jika tidak ada pattern yang cocok dari curly brackets, kita gunakan Fallback LLM!
    let finalFields = Array.from(fields);
    if (finalFields.length === 0) {
       console.log('[scanDocxTemplate] Pattern variables not found. Falling back to LLM to parse fields from text...');
       const aiFields = await LLMTemplateScanner.scanFieldsFromText(cleanText);
       finalFields = aiFields;
    }

    res.status(200).json({
      success: true,
      fields: finalFields,
    });
  } catch (err) {
    console.error('[scanDocxTemplate] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Gagal scan DOCX', detail: message });
  }
}

// POST /api/v1/docx/generate
export async function generateDocxTemplate(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File DOCX wajib di-upload (field name: file)' });
      return;
    }

    let payload: Record<string, any> = {};
    if (req.body.payload) {
      try {
        payload = typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body.payload;
      } catch (e) {
        res.status(400).json({ success: false, error: 'Payload JSON tidak valid' });
        return;
      }
    }

    // 1. Load DOCX
    const content = req.file.buffer;
    const zip = new PizZip(content);

    // 2. Inject Payload using Docxtemplater
    // Standard delimiter is { } but we configure it to support both by removing xml tags and normalizing? No.
    // Let's use {{ }} because it's what user asked for.
    let doc: Docxtemplater;
    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }
      });
      doc.render(payload);
    } catch (e) {
      // If it fails with {{ }}, maybe they used standard { }.
      // Re-initialize from scratch
      const zip2 = new PizZip(req.file.buffer);
      doc = new Docxtemplater(zip2, {
        paragraphLoop: true,
        linebreaks: true
      });
      doc.render(payload);
    }

    const generatedZip = doc.getZip();
    const generatedBuffer = generatedZip.generate({ type: 'nodebuffer' });

    // 3. Convert DOCX to HTML
    const mammothResult = await mammoth.convertToHtml({ buffer: generatedBuffer });
    const bodyHtml = mammothResult.value;

    // 4. Wrap with some styling to look like a doc
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              line-height: 1.6;
              color: #333;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin-bottom: 20px;
            }
            table, th, td {
              border: 1px solid #ccc;
            }
            th, td {
              padding: 8px;
              text-align: left;
            }
            p {
              margin: 0 0 10px 0;
            }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `;

    // 5. Render HTML to PDF
    const pdfBuffer = await PDFRenderer.render(html);

    // 6. Apply Watermark (opsional, dari req.body.options)
    let finalPdf = pdfBuffer;
    if (req.body.options) {
      try {
        const options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
        if (options?.watermark?.enabled) {
          finalPdf = await Watermarker.apply(pdfBuffer, options.watermark);
        }
      } catch (e) {
        // Abaikan jika options tidak valid
      }
    }

    // 7. Output PDF
    const filename = `generated-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', finalPdf.length);
    res.status(200).send(finalPdf);
  } catch (err) {
    console.error('[generateDocxTemplate] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Gagal generate PDF dari DOCX', detail: message });
  }
}

