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

---

### POST /api/v1/docx/scan
Upload DOCX file → extract required variables.

**Request:** `multipart/form-data`
- Field: `file` (DOCX, max 10MB)

**Response 200:**
```json
{
  "success": true,
  "fields": ["invoice_no", "client_name", "date", "total"]
}
```

---

### POST /api/v1/docx/generate
Generate a PDF document by filling a DOCX template.

**Request:** `multipart/form-data`
- Field: `file` (DOCX template file)
- Field: `payload` (JSON String containing data to inject)
- Field: `options` (Optional JSON String for watermark/settings)

**Example payload string:**
```json
"{\"invoice_no\": \"INV-2026-001\", \"client_name\": \"PT Contoh Klien\", \"total\": \"Rp 5.550.000\"}"
```

**Example options string:**
```json
"{\"filename\": \"Invoice_INV-2026-001_PT_Contoh_Klien\", \"smartReplace\": false, \"watermark\": {\"enabled\": true, \"text\": \"DRAFT\", \"color\": \"#FF0000\"}}"
```

**Response 200:** Raw binary PDF  
Headers: `Content-Type: application/pdf`

**Response 400:**
```json
{ "success": false, "error": "Payload JSON tidak valid" }
```

**Response 500:**
```json
{ "success": false, "error": "Gagal generate PDF dari DOCX" }
```

## Important Note
The `/api/v1/generate`, `/api/v1/templates`, and `/api/v1/fields` endpoints for HTML templates have been completely deprecated and removed from the system. Always use `/api/v1/docx/generate`.
