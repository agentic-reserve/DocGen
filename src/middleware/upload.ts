import multer from 'multer';
import { Request } from 'express';

/**
 * Multer middleware untuk upload file PDF.
 * - Memory storage (buffer tidak disimpan ke disk)
 * - Hanya menerima application/pdf
 * - Batas ukuran file: 10 MB
 */

const storage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Hanya file PDF yang diperbolehkan'));
  }
}

export const uploadPDF = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
}).single('file');
