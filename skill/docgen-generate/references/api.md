# DocGen API Reference

Full endpoint documentation for DocGen Engine.

## Base URL

`https://docgen-production-503d.up.railway.app`

## Endpoints

### GET /health
Check server status.

**Response 200:**
```json
{ "status": "ok", "service": "DocGen Engine", "version": "1.0.0", "timestamp": "..." }
```

---

### GET /api/v1/templates
List available template IDs.

**Response 200:**
```json
{ "success": true, "templates": ["invoice", "receipt"] }
```

---

### GET /api/v1/fields/:templateId
Get field definitions for a template.

**Response 200:**
```json
{
  "success": true,
  "templateId": "invoice",
  "version": "1.0",
  "fields": [
    { "name": "invoice_number", "required": true, "type": "string" },
    { "name": "issue_date", "required": true, "type": "string", "format": "date" },
    { "name": "items", "required": true, "type": "array", "items": { "description": "string", "qty": "number", "unit_price": "number" } }
  ]
}
```

---

### POST /api/v1/generate
Generate a PDF document.

**Request:**
```json
{
  "templateId": "invoice",
  "data": {
    "invoice_number": "INV-2026-001",
    "issue_date": "2026-03-05",
    "due_date": "2026-04-05",
    "client_name": "PT Contoh Klien",
    "client_address": "Jl. Sudirman No. 1, Jakarta",
    "company_name": "PT Penyedia Jasa",
    "company_address": "Jl. Gatot Subroto No. 2",
    "company_email": "info@penyedia.co.id",
    "items": [
      { "description": "Jasa Konsultasi", "qty": 10, "unit_price": 500000 }
    ],
    "subtotal": 5000000,
    "tax": 550000,
    "tax_rate": 11,
    "discount": 0,
    "total": 5550000,
    "notes": "Pembayaran via transfer BCA"
  },
  "options": {
    "useLLM": false,
    "outputFormat": "pdf",
    "watermark": {
      "enabled": false,
      "text": "DRAFT",
      "opacity": 0.12,
      "fontSize": 80,
      "color": "#cc0000",
      "angle": -45
    }
  }
}
```

**Response 200:** Raw binary PDF  
Headers: `Content-Type: application/pdf`

**Response 400:**
```json
{ "success": false, "error": "Validation error", "details": { "templateId": ["required"] } }
```

**Response 422:**
```json
{ "success": false, "error": "Missing required fields", "missingFields": ["invoice_number"] }
```

---

### POST /api/v1/analyze
LLM-powered field remapping + semantic validation (no PDF generated).

**Request:**
```json
{ "templateId": "invoice", "data": { "customer": "PT Klien", "amount": 5000000 } }
```

**Response 200:**
```json
{
  "success": true,
  "original": { "customer": "PT Klien" },
  "mapped": { "client_name": "PT Klien" },
  "validation": { "valid": true, "errors": [], "warnings": [] }
}
```

---

### POST /api/v1/scan
Upload PDF → extract structured field data.

**Request:** `multipart/form-data`
- Field: `file` (PDF, max 10MB)
- Query: `?templateId=invoice` (optional)

**Response 200:**
```json
{
  "success": true,
  "templateId": "invoice",
  "numPages": 1,
  "avgConfidence": 0.85,
  "extracted": { "invoice_number": "INV-001", "client_name": "PT Klien" },
  "confidence": { "invoice_number": 0.9, "client_name": 0.8 },
  "rawText": "..."
}
```

## Invoice Data Shape

```typescript
interface InvoiceData {
  invoice_number: string;    // required
  issue_date: string;        // required
  due_date: string;          // required
  client_name: string;       // required
  client_address?: string;
  company_name?: string;
  company_address?: string;
  company_email?: string;
  items: LineItem[];         // required, min 1
  subtotal: number;          // required — calculate yourself
  tax?: number;
  tax_rate?: number;         // percentage, e.g. 11
  discount?: number;
  total: number;             // required — calculate yourself
  notes?: string;
}
```

## Receipt Data Shape

```typescript
interface ReceiptData {
  receipt_number: string;    // required
  receipt_date: string;      // required
  payer_name: string;        // required
  payer_address?: string;
  payment_method?: string;
  company_name?: string;
  company_address?: string;
  items: LineItem[];         // required
  subtotal: number;          // required
  tax?: number;
  total: number;             // required
  notes?: string;
}
```

## LineItem Shape

```typescript
interface LineItem {
  description: string;   // required
  qty: number;           // required, > 0
  unit_price: number;    // required, >= 0
}
```
