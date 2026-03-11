import 'dotenv/config';
import express from 'express';
import documentRoutes from './routes/document.routes';
import { PDFRenderer } from './engine/PDFRenderer';
import path from 'path';

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for API documentation
app.use(express.static(path.join(__dirname, '../public')));

// Basic request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────

app.use('/api/v1', documentRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DocGen Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Documentation (ReDoc)
app.get('/docs', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/docs.html'));
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route tidak ditemukan' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[GlobalError]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n  DocGen Engine running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  API base:     http://localhost:${PORT}/api/v1\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await PDFRenderer.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await PDFRenderer.close();
  server.close(() => process.exit(0));
});

export default app;
