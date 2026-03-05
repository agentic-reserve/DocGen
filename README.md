# DocGen Engine

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/express-5.x-lightgrey)](https://expressjs.com/)
[![License: ISC](https://img.shields.io/badge/license-ISC-yellow)](LICENSE)
[![Railway](https://img.shields.io/badge/deploy-Railway-blueviolet)](https://railway.app/)

A REST API that generates professional PDF business documents (invoices and receipts) from structured JSON data. Built with Express, Handlebars templates, Puppeteer for PDF rendering, and an optional LLM layer for intelligent field mapping.

## Features

- Generate invoice and receipt PDFs from JSON data
- Handlebars-based templates — easily extendable
- Optional DRAFT watermark overlay
- LLM-powered field remapping (handles mismatched or informal field names)
- PDF scanning: upload an existing PDF to extract structured field data
- Zod schema validation on all inputs
- Graceful shutdown with Puppeteer browser cleanup

## Live API

```
https://docgen-production-503d.up.railway.app
```

Health check: `GET https://docgen-production-503d.up.railway.app/health`

## Prerequisites

- Node.js >= 20
- npm >= 10
- An [OpenRouter](https://openrouter.ai/) API key (only required for LLM features)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/your-username/DocGen.git
cd DocGen

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY

# Start development server
npm run dev
```

The server starts at `http://localhost:3000`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `OPENROUTER_API_KEY` | For LLM features | — | OpenRouter API key |
| `MODEL` | No | `stepfun/step-3.5-flash:free` | OpenRouter model ID |

## API Reference

### Health Check

```
GET /health
```

```json
{ "status": "ok", "service": "DocGen Engine", "version": "1.0.0", "timestamp": "..." }
```

---

### List Templates

```
GET /api/v1/templates
```

```json
{ "success": true, "templates": ["invoice", "receipt"] }
```

---

### Get Template Fields

```
GET /api/v1/fields/:templateId
```

Returns the field schema for a given template, including required/optional status and types.

---

### Generate PDF

```
POST /api/v1/generate
Content-Type: application/json
```

**Request body:**

```json
{
  "templateId": "invoice",
  "data": {
    "invoice_number": "INV-2026-001",
    "issue_date": "2026-03-05",
    "due_date": "2026-04-05",
    "client_name": "PT Contoh Klien",
    "items": [
      { "description": "Jasa Konsultasi", "qty": 10, "unit_price": 500000 }
    ],
    "subtotal": 5000000,
    "tax": 550000,
    "total": 5550000
  },
  "options": {
    "useLLM": false,
    "outputFormat": "pdf",
    "watermark": { "enabled": false }
  }
}
```

**Response:** Raw binary PDF (`Content-Type: application/pdf`).

> **Note:** Totals are not auto-calculated. Supply `subtotal` and `total` yourself.

---

### Analyze with LLM

```
POST /api/v1/analyze
Content-Type: application/json
```

Remaps fields using LLM and validates data without generating a PDF. Useful when field names from the user don't match the template schema.

```json
{ "templateId": "invoice", "data": { "customer": "PT Klien", "amount": 5000000 } }
```

---

### Scan PDF

```
POST /api/v1/scan
Content-Type: multipart/form-data
```

Upload an existing PDF to extract structured field data. Query param `?templateId=invoice` is optional.

- Field name: `file`
- Max size: 10 MB
- File type: PDF only

---

## Data Shapes

### Invoice

| Field | Type | Required |
|---|---|---|
| `invoice_number` | string | Yes |
| `issue_date` | string (date) | Yes |
| `due_date` | string (date) | Yes |
| `client_name` | string | Yes |
| `items` | LineItem[] | Yes |
| `subtotal` | number | Yes |
| `total` | number | Yes |
| `client_address` | string | No |
| `company_name` | string | No |
| `company_address` | string | No |
| `company_email` | string | No |
| `tax` | number | No |
| `tax_rate` | number | No |
| `discount` | number | No |
| `notes` | string | No |

### Receipt

| Field | Type | Required |
|---|---|---|
| `receipt_number` | string | Yes |
| `receipt_date` | string (date) | Yes |
| `payer_name` | string | Yes |
| `items` | LineItem[] | Yes |
| `subtotal` | number | Yes |
| `total` | number | Yes |
| `payer_address` | string | No |
| `payment_method` | string | No |
| `company_name` | string | No |
| `notes` | string | No |

### LineItem

```json
{ "description": "string", "qty": 1, "unit_price": 500000 }
```

## Error Responses

| Status | Meaning |
|---|---|
| 400 | Validation error — check `details` in response body |
| 404 | Template not found |
| 422 | Missing required fields — listed in `missingFields` |
| 500 | Internal server error |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (`node dist/app.js`) |

## Project Structure

```
src/
├── app.ts                  # Express entry point
├── controllers/            # Request handlers
├── engine/
│   ├── TemplateLoader.ts   # Loads .hbs templates and schema.json
│   ├── FieldScanner.ts     # Reads field definitions from schema
│   ├── FieldMapper.ts      # Maps incoming data to template fields
│   ├── PDFRenderer.ts      # Puppeteer-based HTML-to-PDF rendering
│   ├── Watermarker.ts      # pdf-lib watermark overlay
│   ├── PDFScanner.ts       # pdf-parse text extraction
│   └── DataExtractor.ts    # Regex-based field extraction from PDF text
├── llm/
│   ├── LLMFieldAnalyzer.ts # OpenRouter field remapping
│   └── LLMValidator.ts     # Semantic validation
├── middleware/
│   └── upload.ts           # Multer memory storage for PDF uploads
├── routes/
│   └── document.routes.ts  # Route definitions
├── templates/
│   ├── invoice/            # template.hbs + schema.json
│   └── receipt/            # template.hbs + schema.json
└── utils/
    └── validation.ts       # Zod schemas
```

## Deployment

This project is configured for deployment on [Railway](https://railway.app/). See [Dockerfile](Dockerfile) for container setup.

Puppeteer requires Chromium system dependencies — these are installed in the Dockerfile. The `--no-sandbox` flag is set in `PDFRenderer.ts` for container compatibility.

## Agent Skill

A skill for AI agents is available in the `skill/` directory. It enables agents to call this API to generate documents on behalf of users via natural language.

See [`skill/README.md`](skill/README.md) for installation instructions.

## License

ISC
