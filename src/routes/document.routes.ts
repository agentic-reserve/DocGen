import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  analyzeWithLLM,
  scanDocument,
} from '../controllers/document.controller';
import { scanDocxTemplate, generateDocxTemplate } from '../controllers/docx.controller';
import { uploadPDF, uploadDocx } from '../middleware/upload';

const router = Router();

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

/**
 * POST /api/v1/docx/scan
 * Upload DOCX → extract variables
 */
router.post('/docx/scan', (req: Request, res: Response, next: NextFunction) => {
  uploadDocx(req, res, (err) => {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next();
  });
}, scanDocxTemplate);

/**
 * POST /api/v1/docx/generate
 * Upload DOCX + JSON Payload → generate PDF
 */
router.post('/docx/generate', (req: Request, res: Response, next: NextFunction) => {
  uploadDocx(req, res, (err) => {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next();
  });
}, generateDocxTemplate);

export default router;
