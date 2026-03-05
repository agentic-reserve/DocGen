# 📄 DocGen Engine — MVP Backend
### Mini Project: Smart Document Generator (Invoice Use Case)

---

## 🎯 Problem Statement

Banyak bisnis masih generate dokumen (invoice, receipt, PKS) secara manual — copy-paste, rawan error, lambat, tidak konsisten. DocGen Engine hadir sebagai **template-driven document generation service** yang:

- Baca template → scan field yang perlu diisi → inject data → generate PDF + watermark
- Punya **engine pattern yang sama** untuk berbagai jenis dokumen (invoice, receipt, PKS, dsb.)
- Opsional: pakai **LLM sebagai AI layer** untuk smart field mapping & validasi

---

## 🏗️ Core Architecture

```
Client (JSON payload)
        │
        ▼
  [Express REST API]
        │
        ├──► Template Engine
        │         ├── Template Reader (baca file .html/.docx)
        │         ├── Field Scanner (detect {{field_name}})
        │         ├── Field Mapper (inject data dari JSON)
        │         └── PDF Generator (puppeteer/wkhtmltopdf)
        │
        ├──► Watermark Layer
        │         └── Add WM ke PDF (teks/gambar)
        │
        └──► [Opsional] LLM Analyzer Layer
                  └── Smart field detection, validasi, suggestion
```

---

## 🔑 Core Engine Pattern

Inilah **inti dari engine-nya** — pattern yang sama dipakai untuk semua jenis dokumen:

```
1. LOAD TEMPLATE     → baca file template (HTML/Handlebars)
2. SCAN FIELDS       → detect semua placeholder: {{invoice_number}}, {{client_name}}, dst.
3. VALIDATE INPUT    → pastikan semua required field tersedia di JSON payload
4. MAP & INJECT      → replace placeholder dengan nilai dari JSON
5. RENDER PDF        → compile HTML → PDF via Puppeteer
6. APPLY WATERMARK   → inject teks/image WM ke PDF
7. EXPORT            → return file atau upload ke storage
```

Kalau template-nya beda (misal dari invoice ke PKS), engine **tidak berubah** — hanya template file dan field schema-nya yang ganti.

---

## 📁 Project Structure

```
docgen-engine/
├── src/
│   ├── app.js                    # Express entry point
│   ├── routes/
│   │   └── document.routes.js    # POST /generate, GET /fields/:templateId
│   ├── controllers/
│   │   └── document.controller.js
│   ├── engine/
│   │   ├── TemplateLoader.js     # Load template dari disk/DB
│   │   ├── FieldScanner.js       # Detect {{fields}} dari template
│   │   ├── FieldMapper.js        # Inject JSON data ke template
│   │   ├── PDFRenderer.js        # HTML → PDF via Puppeteer
│   │   └── Watermarker.js        # Tambahkan watermark ke PDF
│   ├── llm/                      # Opsional — LLM layer
│   │   ├── LLMFieldAnalyzer.js   # Kirim ke Claude/GPT untuk analisis
│   │   └── LLMValidator.js       # Validasi kelengkapan & konsistensi
│   ├── templates/
│   │   ├── invoice/
│   │   │   ├── template.hbs      # Handlebars template
│   │   │   └── schema.json       # Field schema + validation rules
│   │   └── receipt/
│   │       ├── template.hbs
│   │       └── schema.json
│   └── utils/
│       └── pdf.utils.js
├── public/
│   └── watermarks/logo.png
├── .env
└── package.json
```

---

## 🔌 API Endpoints

### 1. Generate Document
```
POST /api/v1/generate
```
**Request Body:**
```json
{
  "templateId": "invoice",
  "data": {
    "invoice_number": "INV-2025-001",
    "issue_date": "2025-03-05",
    "due_date": "2025-04-05",
    "client_name": "PT Maju Jaya",
    "client_address": "Jl. Sudirman No. 1, Jakarta",
    "items": [
      { "description": "Web Development", "qty": 1, "unit_price": 15000000 },
      { "description": "UI/UX Design", "qty": 3, "unit_price": 2000000 }
    ],
    "subtotal": 21000000,
    "tax": 2100000,
    "total": 23100000,
    "notes": "Pembayaran via transfer ke BCA 123-456-789"
  },
  "options": {
    "watermark": true,
    "watermarkText": "CONFIDENTIAL",
    "outputFormat": "pdf"
  }
}
```
**Response:** PDF file (binary) atau signed URL ke storage.

---

### 2. Scan Fields dari Template
```
GET /api/v1/fields/:templateId
```
**Response:**
```json
{
  "templateId": "invoice",
  "fields": [
    { "name": "invoice_number", "required": true, "type": "string" },
    { "name": "client_name", "required": true, "type": "string" },
    { "name": "items", "required": true, "type": "array" },
    { "name": "total", "required": true, "type": "number" }
  ]
}
```

---

### 3. [Opsional] LLM Analyze
```
POST /api/v1/analyze
```
Kirim raw JSON data → LLM deteksi field mana yang mungkin salah/missing, suggest koreksi.

---

## ⚙️ Tech Stack

| Layer | Pilihan |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Template Engine | Handlebars (hbs) |
| PDF Generator | Puppeteer |
| Watermark | pdf-lib |
| Validation | Zod / Joi |
| LLM (opsional) | Anthropic Claude API / OpenAI |
| Storage (opsional) | Local disk → bisa extend ke S3/GCS |

---

## 💡 LLM Layer — Opsional tapi Powerful

LLM **bukan jalur utama** — ia hadir sebagai value-add layer. Ada 2 use case utama:

### Use Case 1: Smart Field Analyzer
Kalau client ngirim data yang field name-nya **tidak eksak sama** dengan placeholder di template, LLM bisa bantu mapping secara semantic.

```
Input JSON:  { "customer": "PT Maju" }
Template:    {{ client_name }}
LLM output:  { "client_name": "PT Maju" }  ← LLM tahu bahwa "customer" ≈ "client_name"
```

### Use Case 2: Data Validator & Suggester
Sebelum generate, LLM bisa review payload dan bilang:
- "Due date lebih awal dari issue date — kemungkinan salah input"
- "Total tidak cocok dengan sum of items × qty"
- "Nomor invoice tidak mengikuti pattern yang biasa dipakai"

### Implementasi (non-blocking):
```javascript
// LLM dipanggil secara opsional, tidak block flow utama
async function generateDocument(templateId, data, options) {
  let mappedData = data;

  if (options.useLLM) {
    mappedData = await LLMFieldAnalyzer.analyze(templateId, data);
  }

  const template = await TemplateLoader.load(templateId);
  const html = FieldMapper.inject(template, mappedData);
  const pdf = await PDFRenderer.render(html);
  return Watermarker.apply(pdf, options);
}
```

---

## 🔄 Engine Flow — Invoice Example

```
1. POST /generate { templateId: "invoice", data: {...} }
        │
2. TemplateLoader → load templates/invoice/template.hbs
        │
3. FieldScanner   → ["invoice_number", "client_name", "items", "total", ...]
        │
4. Validator      → cek semua required field ada di request JSON
        │                   (pakai schema.json sebagai contract)
        │
5. [Opsional] LLMAnalyzer → smart map + validasi semantic
        │
6. FieldMapper    → Handlebars compile template + inject data
        │
7. PDFRenderer    → Puppeteer launch → render HTML → capture PDF
        │
8. Watermarker    → pdf-lib inject teks/logo WM ke setiap halaman
        │
9. Response       → return PDF buffer / simpan ke storage
```

---

## 📋 Template Example (invoice/template.hbs)

```handlebars
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .header { display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; border: 1px solid #ddd; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <div class="header">
    <h2>INVOICE</h2>
    <div>
      <strong>No:</strong> {{invoice_number}}<br>
      <strong>Tanggal:</strong> {{issue_date}}<br>
      <strong>Jatuh Tempo:</strong> {{due_date}}
    </div>
  </div>

  <p><strong>Kepada:</strong><br>
  {{client_name}}<br>
  {{client_address}}</p>

  <table>
    <thead>
      <tr><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th></tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{description}}</td>
        <td>{{qty}}</td>
        <td>{{unit_price}}</td>
        <td>{{multiply qty unit_price}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Subtotal</td><td>{{subtotal}}</td></tr>
      <tr><td colspan="3">PPN 10%</td><td>{{tax}}</td></tr>
      <tr><td colspan="3"><strong>TOTAL</strong></td><td><strong>{{total}}</strong></td></tr>
    </tfoot>
  </table>

  <p>{{notes}}</p>
</body>
</html>
```

---

## 📄 Schema Contract (invoice/schema.json)

```json
{
  "templateId": "invoice",
  "version": "1.0",
  "fields": [
    { "name": "invoice_number", "required": true,  "type": "string" },
    { "name": "issue_date",     "required": true,  "type": "string", "format": "date" },
    { "name": "due_date",       "required": true,  "type": "string", "format": "date" },
    { "name": "client_name",    "required": true,  "type": "string" },
    { "name": "client_address", "required": false, "type": "string" },
    { "name": "items",          "required": true,  "type": "array",
      "items": {
        "description": "string",
        "qty": "number",
        "unit_price": "number"
      }
    },
    { "name": "subtotal",       "required": true,  "type": "number" },
    { "name": "tax",            "required": false, "type": "number" },
    { "name": "total",          "required": true,  "type": "number" },
    { "name": "notes",          "required": false, "type": "string" }
  ]
}
```

---

## 🚀 MVP Scope

### ✅ Yang Masuk MVP
- [ ] POST `/generate` — generate PDF invoice dari JSON
- [ ] GET `/fields/:templateId` — return field list dari template
- [ ] Engine: TemplateLoader + FieldScanner + FieldMapper + PDFRenderer
- [ ] Watermark: teks sederhana (misal "PAID" atau nama perusahaan)
- [ ] 1 template: Invoice
- [ ] Validasi basic (required fields)

### 🔜 Post-MVP / Nice to Have
- [ ] LLM layer: smart field mapping + semantic validation
- [ ] Multi-template support (receipt, PKS)
- [ ] Upload template via API
- [ ] Auth (API key)
- [ ] Async job queue untuk generate volume besar
- [ ] Storage integration (S3/GCS)
- [ ] Preview endpoint (return HTML, bukan PDF)

---

## 🧠 Kenapa Pattern Ini Scalable?

| Aspek | Penjelasan |
|---|---|
| **Template agnostic** | Engine tidak peduli isi template — dia hanya scan, map, render |
| **Schema-driven** | Setiap template punya contract JSON → validasi otomatis |
| **LLM as optional layer** | LLM tidak jadi dependency, mudah di-on/off |
| **Extendable** | Tambah template baru = tambah folder + schema, engine tidak berubah |
| **Testable** | Setiap step engine (scan, map, render) bisa di-unit test sendiri |

---

> **One-liner pitch:** *"DocGen Engine is a template-driven PDF generation service where the engine pattern stays the same — only the template and field schema change."*
