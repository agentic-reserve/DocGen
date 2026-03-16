import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import documentRoutes from './routes/document.routes';
import path from 'path';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENV ?? 'development',
  enabled: !!process.env.SENTRY_DSN,
  
  // Performance Monitoring
  tracesSampleRate: process.env.SENTRY_ENV === 'production' ? 0.1 : 1.0,
  
  // Error sampling
  sampleRate: 1.0,
});

// Sentry Express integration (must be after app initialization)
Sentry.setupExpressErrorHandler(app);

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for API documentation
import fs from 'fs';
let publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  publicPath = path.join(__dirname, '../public');
}
console.log('[Static] Public path:', publicPath);

app.use(express.static(publicPath));
app.use('/api-spec', express.static(publicPath));

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
  const docsPath = path.join(publicPath, 'docs.html');
  res.sendFile(docsPath);
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
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
});

export default app;
