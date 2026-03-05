# API Handoff: DocGen Engine

## Business Context

DocGen Engine adalah layanan backend untuk generate dokumen bisnis (invoice, kwitansi, dll.) secara otomatis dari template + data JSON, mengekspor hasilnya sebagai file PDF siap pakai. Frontend bertanggung jawab menyediakan form input data, menampilkan preview/download PDF, dan opsional mengirim PDF yang sudah ada untuk di-scan balik menjadi data terstruktur. Seluruh API bersifat **public** (tidak ada autentikasi saat ini).

Base URL: `http://localhost:3000`  
API prefix: `/api/v1`

---

## Endpoints

### GET /health
- **Purpose**: Cek status server
- **Auth**: Public
- **Response** (200):
  ```json
  {
    "status": "ok",
    "service": "DocGen Engine",
    "version": "1.0.0",
    "timestamp": "2026-03-05T08:00:00.000Z"
  }
  ```

---

### GET /api/v1/templates
- **Purpose**: List semua template dokumen yang tersedia
- **Auth**: Public
- **Response** (200):
  ```json
  {
    "success": true,
    "templates": ["invoice", "receipt"]
  }
  ```
- **Notes**: Gunakan nilai ini untuk mengisi dropdown pemilih template di UI.

---

### GET /api/v1/fields/:templateId
- **Purpose**: Ambil definisi field (schema) untuk template tertentu
- **Auth**: Public
- **Params**: `templateId` — salah satu dari hasil `/templates`
- **Response** (200):
  ```json
  {
    "success": true,
    "templateId": "invoice",
    "version": "1.0",
    "fields": [
      { "name": "invoice_number", "required": true, "type": "string" },
      { "name": "issue_date",     "required": true, "type": "string", "format": "date" },
      { "name": "items",          "required": true, "type": "array",
        "items": { "description": "string", "qty": "number", "unit_price": "number" }
      }
    ],
    "scannedPlaceholders": ["invoice_number", "issue_date", "items", "..."]
  }
  ```
- **Response** (404): `{ "success": false, "error": "Template '...' tidak ditemukan" }`
- **Notes**: Gunakan `fields[].required` untuk menentukan field mana yang wajib divalidasi di frontend sebelum submit.

---

### POST /api/v1/generate
- **Purpose**: Generate PDF dari template + data JSON. Mengembalikan file PDF langsung (binary).
- **Auth**: Public
- **Content-Type**: `application/json`
- **Request**:
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
      "company_address": "Jl. Gatot Subroto No. 2, Jakarta",
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
        "enabled": true,
        "text": "DRAFT",
        "opacity": 0.12,
        "fontSize": 80,
        "color": "#cc0000",
        "angle": -45
      }
    }
  }
  ```
- **Response** (200): Binary PDF  
  Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="invoice-<timestamp>.pdf"`
- **Response** (400): Validation error
  ```json
  {
    "success": false,
    "error": "Validation error",
    "details": { "templateId": ["templateId wajib diisi"] }
  }
  ```
- **Response** (404): `{ "success": false, "error": "Template 'xyz' tidak ditemukan" }`
- **Response** (422):
  ```json
  {
    "success": false,
    "error": "Missing required fields",
    "missingFields": ["invoice_number", "due_date"]
  }
  ```
- **Notes**:
  - Response adalah raw binary — gunakan `response.blob()` di browser, bukan JSON parse.
  - `options` seluruhnya opsional. Jika dihilangkan, tidak ada watermark dan tidak pakai LLM.
  - `useLLM: true` mengaktifkan AI field remapping (misalnya `customer` → `client_name`) — cocok jika data dari sumber eksternal dengan nama field berbeda. Menambah latency ~1-3 detik.
  - Field numerik (`subtotal`, `tax`, `total`, `qty`, `unit_price`) harus dikirim sebagai `number`, bukan string.
  - `issue_date` dan `due_date` format bebas (string) — template akan merender apa adanya.

---

### POST /api/v1/analyze
- **Purpose**: Kirim data mentah ke LLM untuk smart field remapping + validasi semantik, tanpa generate PDF
- **Auth**: Public
- **Content-Type**: `application/json`
- **Request**:
  ```json
  {
    "templateId": "invoice",
    "data": {
      "customer": "PT Klien",
      "date": "2026-03-05",
      "amount": 5000000
    }
  }
  ```
- **Response** (200):
  ```json
  {
    "success": true,
    "templateId": "invoice",
    "original": { "customer": "PT Klien", "date": "2026-03-05", "amount": 5000000 },
    "mapped": {
      "client_name": "PT Klien",
      "issue_date": "2026-03-05",
      "subtotal": 5000000
    },
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": ["due_date tidak ditemukan"]
    }
  }
  ```
- **Response** (400/404): Sama seperti `/generate`
- **Notes**:
  - Endpoint ini untuk **preview mapping** sebelum generate — cocok untuk wizard multi-step.
  - `validation.errors` berisi logical errors (e.g. `due_date` lebih awal dari `issue_date`).
  - `validation.warnings` berisi field penting yang hilang tapi tidak block.
  - Latency bergantung pada LLM (~1-5 detik).

---

### POST /api/v1/scan
- **Purpose**: Upload file PDF → extract field data terstruktur via pattern matching regex
- **Auth**: Public
- **Content-Type**: `multipart/form-data`
- **Request**:
  - Form field: `file` — file PDF (required)
  - Query param: `templateId` — `invoice` | `receipt` | `_generic` (opsional, default: `_generic`)
- **Response** (200):
  ```json
  {
    "success": true,
    "templateId": "invoice",
    "numPages": 1,
    "avgConfidence": 0.85,
    "extracted": {
      "invoice_number": "INV-2026-001",
      "issue_date": "2026-02-27",
      "due_date": "2026-03-03",
      "client_name": "PT Contoh Klien",
      "subtotal": 5000000,
      "tax": 550000,
      "total": 5550000
    },
    "confidence": {
      "invoice_number": 0.9,
      "issue_date": 0.85,
      "client_name": 0.8,
      "total": 0.9
    },
    "rawText": "INVOICE\nNo. Invoice: INV-2026-001\n..."
  }
  ```
- **Response** (400 — no file):
  ```json
  { "success": false, "error": "File PDF wajib di-upload (field name: file)" }
  ```
- **Response** (400 — wrong type):
  ```json
  { "success": false, "error": "Hanya file PDF yang diperbolehkan" }
  ```
- **Response** (400 — too large):
  ```json
  { "success": false, "error": "Upload error: File too large" }
  ```
- **Notes**:
  - Maksimum ukuran file: **10 MB**.
  - Field name di form-data harus tepat `file`.
  - `templateId` sebagai **query param** (`?templateId=invoice`), bukan form field.
  - `extracted` hanya berisi field yang berhasil dideteksi — field yang tidak ditemukan tidak muncul (bukan `null`).
  - `confidence` per field: `0.0–1.0`. Nilai di bawah `0.7` sebaiknya ditandai sebagai "perlu verifikasi" di UI.
  - `avgConfidence` adalah rata-rata semua field yang terdeteksi.
  - Scan bekerja terbaik pada PDF teks (bukan scanned image/foto). PDF hasil scan kamera tidak didukung (perlu OCR terpisah).
  - Use case utama: **prefill form** dari PDF yang sudah ada, lalu user koreksi manual.

---

## Data Models / DTOs

```typescript
// Request: POST /api/v1/generate
interface GenerateRequest {
  templateId: string;                  // required
  data: Record<string, unknown>;       // required — lihat per-template di bawah
  options?: {
    useLLM?: boolean;                  // default: false
    outputFormat?: 'pdf';              // default: 'pdf'
    watermark?: WatermarkOptions;
  };
}

interface WatermarkOptions {
  enabled: boolean;
  text?: string;           // default: 'DRAFT'
  opacity?: number;        // 0.0–1.0, default: 0.12
  fontSize?: number;       // default: 80
  color?: string;          // hex #rrggbb, default: '#cc0000'
  angle?: number;          // degrees, default: -45
}

// Data shape: template "invoice"
interface InvoiceData {
  invoice_number: string;    // required
  issue_date: string;        // required — format bebas, e.g. "2026-03-05"
  due_date: string;          // required
  client_name: string;       // required
  client_address?: string;
  company_name?: string;
  company_address?: string;
  company_email?: string;
  items: LineItem[];         // required, min 1
  subtotal: number;          // required
  tax?: number;
  tax_rate?: number;         // persentase, e.g. 11 untuk 11%
  discount?: number;
  total: number;             // required
  notes?: string;
}

// Data shape: template "receipt"
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

interface LineItem {
  description: string;   // required, min 1 char
  qty: number;           // required, > 0
  unit_price: number;    // required, >= 0
}

// Response: GET /api/v1/fields/:templateId
interface FieldDefinition {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'array';
  format?: 'date';
  items?: Record<string, string>;  // untuk type: 'array'
}

// Response: POST /api/v1/scan
interface ScanResponse {
  success: true;
  templateId: string;
  numPages: number;
  avgConfidence: number;
  extracted: Partial<InvoiceData | ReceiptData>;
  confidence: Record<string, number>;
  rawText: string;
}
```

---

## Enums & Constants

| Value | Meaning | Notes |
|-------|---------|-------|
| `invoice` | Template invoice profesional | Warna tema: biru |
| `receipt` | Template kwitansi/receipt | Warna tema: hijau |
| `_generic` | Fallback scan rules | Hanya untuk endpoint scan |
| `outputFormat: 'pdf'` | Satu-satunya format output | Format lain belum didukung |

---

## Validation Rules

Frontend sebaiknya memvalidasi sebelum submit ke `/generate`:

| Field | Rule |
|-------|------|
| `templateId` | Wajib, non-empty string |
| `invoice_number` / `receipt_number` | Wajib, non-empty |
| `issue_date` / `due_date` / `receipt_date` | Wajib, sebaiknya `due_date >= issue_date` |
| `client_name` / `payer_name` | Wajib, non-empty |
| `items` | Wajib, array minimal 1 elemen |
| `items[].description` | Wajib, min 1 karakter |
| `items[].qty` | Wajib, angka > 0 |
| `items[].unit_price` | Wajib, angka >= 0 |
| `subtotal` | Wajib, angka >= 0 |
| `total` | Wajib, angka >= 0 |
| `watermark.color` | Format hex `#rrggbb` jika disertakan |
| `watermark.opacity` | 0.0–1.0 jika disertakan |
| PDF upload (scan) | Hanya `.pdf`, maks 10 MB, form field name: `file` |

Backend mengembalikan `400` untuk Zod validation error dan `422` untuk missing required fields setelah LLM mapping.

---

## Business Logic & Edge Cases

- **`subtotal` tidak otomatis dihitung** — frontend wajib menghitung `subtotal = sum(items[i].qty * items[i].unit_price)` dan `total = subtotal + tax - discount` sebelum kirim.
- **`tax_rate` vs `tax`** — keduanya opsional dan independen di schema; template merender keduanya jika ada. Jika ingin tampil "PPN 11%", kirim `tax_rate: 11` dan `tax: <nilai>`.
- **LLM field remapping** (`useLLM: true`) — tidak menjamin semua field dipetakan dengan benar. Selalu tampilkan hasil `/analyze` ke user untuk konfirmasi sebelum generate.
- **Scan PDF (`/scan`)** — field yang tidak terdeteksi tidak ada di `extracted` (bukan `null`). Frontend harus mengisi field yang hilang dengan form kosong. Jangan treat `avgConfidence` rendah sebagai error — itu sinyal untuk meminta konfirmasi user.
- **PDF scan vs image scan** — endpoint scan hanya mengekstrak teks digital dari PDF. PDF hasil foto/scan kamera (pure image PDF) akan menghasilkan `extracted: {}` dengan `rawText: ""`.
- **Response `/generate` adalah binary** — jangan JSON.parse. Gunakan `URL.createObjectURL(blob)` untuk download atau preview di browser.
- **Watermark dirender di tengah setiap halaman** — teks dirotasi sesuai `angle`. Tidak ada opsi per-halaman.
- **Browser instance Puppeteer** — server menjaga satu instance browser singleton. Cold start pertama kali bisa memakan ~2-3 detik lebih lama.

---

## Integration Notes

- **Recommended flow (generate)**:
  1. `GET /api/v1/templates` → populate template selector
  2. `GET /api/v1/fields/:templateId` → render form fields dinamis
  3. User isi form → frontend hitung `subtotal` & `total`
  4. (Opsional) `POST /api/v1/analyze` untuk preview LLM mapping
  5. `POST /api/v1/generate` → download/preview PDF via blob

- **Recommended flow (scan & prefill)**:
  1. User upload PDF
  2. `POST /api/v1/scan?templateId=invoice` → prefill form dengan `extracted`
  3. Highlight field dengan `confidence < 0.7` sebagai "perlu verifikasi"
  4. User koreksi → lanjut ke flow generate

- **Optimistic UI**: Tidak disarankan untuk `/generate` — response adalah PDF binary, harus tunggu selesai.
- **Caching**: Tidak ada cache header dari server. `/templates` dan `/fields/:templateId` aman di-cache di client (data statis selama template tidak berubah).
- **Real-time**: Tidak ada WebSocket/SSE. Semua operasi request-response biasa.
- **Timeout rekomendasi**: Set client timeout minimal 30 detik untuk `/generate` (Puppeteer rendering) dan `/analyze` (LLM call).

---

## Test Scenarios

1. **Happy path — generate invoice**: POST `/generate` dengan `templateId: "invoice"` + semua required fields → response `200` binary PDF.
2. **Happy path — generate dengan watermark**: Tambahkan `options.watermark.enabled: true` → PDF ter-download dengan teks watermark.
3. **Happy path — scan PDF**: POST `/scan?templateId=invoice` dengan file PDF valid → `extracted` berisi field yang terdeteksi, `success: true`.
4. **Template tidak ditemukan**: POST `/generate` dengan `templateId: "proforma"` → `404`.
5. **Missing required fields**: POST `/generate` tanpa `invoice_number` → `422` dengan `missingFields: ["invoice_number"]`.
6. **Validation error — bad body**: POST `/generate` tanpa `templateId` → `400` dengan `details`.
7. **Scan — no file**: POST `/scan` tanpa form file → `400` "File PDF wajib di-upload".
8. **Scan — wrong file type**: Upload `.docx` ke `/scan` → `400` "Hanya file PDF yang diperbolehkan".
9. **Scan — file terlalu besar**: Upload PDF > 10MB → `400` "Upload error: File too large".
10. **LLM analyze — field remapping**: POST `/analyze` dengan `{ customer: "Budi" }` untuk template `invoice` → `mapped` berisi `{ client_name: "Budi" }`.

---

## Open Questions / TODOs

- **Autentikasi**: Belum ada. Jika akan di-deploy ke production, perlu API key atau JWT middleware.
- **Post-MVP scan**: LLM-assisted scan untuk PDF dengan struktur tidak standar (saat ini hanya pattern matching regex).
- **Image PDF / OCR**: Scan PDF hasil foto kamera belum didukung — perlu integrasi OCR (Tesseract, Google Vision, dll.) di masa mendatang.
- **Pagination pada `/templates`**: Saat ini return flat array — tidak relevan sampai template > ~20.
- **Output format**: `outputFormat` hanya mendukung `'pdf'` saat ini. `docx` / `html` adalah kandidat next iteration.
