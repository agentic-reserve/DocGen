import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  generateDocument,
  getFields,
  listTemplates,
  analyzeWithLLM,
  scanDocument,
} from '../controllers/document.controller';
import { uploadPDF } from '../middleware/upload';

const router = Router();

/**
 * POST /api/v1/generate
 * Generate dokumen PDF dari template + data JSON.
 */
router.post('/generate', generateDocument);

/**
 * GET /api/v1/fields/:templateId
 * Dapatkan field list dari template tertentu.
 */
router.get('/fields/:templateId', getFields);

/**
 * GET /api/v1/templates
 * List semua template yang tersedia.
 */
router.get('/templates', listTemplates);

/**
 * POST /api/v1/analyze
 * [Opsional] Analyze data dengan LLM untuk smart field mapping + validasi semantik.
 */
router.post('/analyze', analyzeWithLLM);

/**
 * POST /api/v1/scan
 * Upload PDF → extract fields via pattern matching.
 * Form field: file (PDF, max 10MB)
 * Query param: templateId (opsional, default: _generic)
 */
router.post('/scan', (req: Request, res: Response, next: NextFunction) => {
  uploadPDF(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // e.g. file too large
      res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      return;
    }
    if (err instanceof Error) {
      // e.g. non-PDF file type
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next();
  });
}, scanDocument);

export default router;
