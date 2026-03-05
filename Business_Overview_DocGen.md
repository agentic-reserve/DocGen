# 📄 DocGen Engine — Business Overview

---

## 🧩 What Is DocGen Engine?

**DocGen Engine** adalah layanan backend untuk generate dokumen bisnis (invoice, receipt, surat perjanjian, dll.) secara otomatis dari template + data JSON — dan mengekspornya sebagai PDF siap pakai dengan watermark.

> *"Dari template dan data, jadi dokumen profesional — otomatis, konsisten, dan scalable."*

---

## ❗ Problem

Proses pembuatan dokumen bisnis di banyak perusahaan masih:

- **Manual & repetitif** — copy-paste dari template Word/Excel setiap kali
- **Rawan human error** — salah angka, nama, tanggal tertukar
- **Tidak konsisten** — tampilan dokumen beda-beda tiap orang yang buat
- **Tidak scalable** — kalau volume naik (ratusan invoice/bulan), tim kewalahan
- **Tidak terintegrasi** — tidak bisa dipanggil dari sistem lain secara otomatis

---

## ✅ Solution

DocGen Engine menyediakan **REST API** yang bisa dipanggil dari sistem apapun. Cukup kirim JSON berisi data dokumen → engine akan:

1. Baca template yang sesuai
2. Deteksi & isi semua field otomatis
3. Generate PDF berkualitas tinggi
4. Tambahkan watermark
5. Return file siap download/kirim

---

## 🎯 Target User

| Segment | Contoh |
|---|---|
| **Startup & UMKM** | Yang butuh generate invoice/receipt tapi tidak punya tim dev besar |
| **Platform B2B SaaS** | Yang ingin embed fitur document generation ke produknya |
| **Tim Finance & Legal** | Yang sering buat dokumen berulang (PO, PKS, kwitansi) |
| **Developer / Integrator** | Yang butuh document engine siap pakai via API |

---

## 💡 Key Value Proposition

### 1. 🔁 Template-Driven, Engine-Agnostic
Satu engine untuk semua jenis dokumen. Ganti template = ganti dokumen. Engine tidak perlu diubah.

### 2. ⚡ API-First
Bisa diintegrasikan ke sistem manapun — ERP, CRM, e-commerce, mobile app — cukup lewat HTTP request.

### 3. 🤖 AI-Powered (Opsional)
LLM layer opsional untuk smart field mapping dan validasi data sebelum generate — cocok untuk input data yang tidak selalu terstruktur sempurna.

### 4. 📐 Konsisten & Profesional
Semua dokumen yang di-generate dijamin tampil seragam sesuai template yang sudah didesain.

### 5. 🔒 Watermark Built-in
Setiap dokumen bisa otomatis diberi watermark (teks atau logo) — cocok untuk dokumen draft, confidential, atau branded.

---

## 🔄 How It Works (Simple Flow)

```
Sistem Klien
    │
    │  POST /generate
    │  { templateId: "invoice", data: { ... } }
    ▼
DocGen Engine
    ├── Load Template
    ├── Scan & Map Fields
    ├── Validate Data
    ├── [AI Layer — opsional]
    ├── Render PDF
    └── Apply Watermark
    │
    ▼
PDF Siap Pakai ✅
```

---

## 📦 MVP Use Case — Invoice Generator

Untuk MVP, fokus pada **invoice** sebagai dokumen pertama karena:
- Volume tinggi, kebutuhan universal
- Field-nya terstruktur dan mudah divalidasi
- Representasi sempurna dari engine pattern (header, line items, total, notes)

**Contoh skenario:**
> Platform freelance ingin generate invoice otomatis setelah project selesai. Mereka cukup panggil `POST /generate` dengan data project → sistem langsung return PDF invoice berlogo, berisi detail pekerjaan, total tagihan, dan watermark "INVOICE".

---

## 🗺️ Product Roadmap

### Phase 1 — MVP *(Sekarang)*
- Engine core: scan, map, render, watermark
- Template pertama: Invoice
- REST API: `POST /generate`, `GET /fields/:templateId`
- Export: PDF

### Phase 2 — Expansion
- Tambah template: Payment Receipt, Purchase Order
- LLM layer: smart field mapping + validasi
- Preview endpoint (HTML output)
- Template management via API

### Phase 3 — Platform
- Multi-tenant & API key auth
- Template builder (UI)
- Async job queue untuk volume besar
- Storage integration (S3, Google Drive)
- Analytics: jumlah dokumen di-generate, error rate, dsb.

---

## 📊 Why This Matters

| Metrik | Tanpa DocGen | Dengan DocGen |
|---|---|---|
| Waktu buat 1 invoice | 5–15 menit (manual) | < 1 detik (API) |
| Risiko human error | Tinggi | Minimal (validasi otomatis) |
| Konsistensi tampilan | Tidak terjamin | 100% konsisten |
| Integrasi ke sistem lain | Tidak bisa | Plug & play via REST API |
| Scale ke 1000 dokumen/hari | Perlu tim besar | Otomatis |

---

## 🏁 One-Liner

> **DocGen Engine** — *Template in, PDF out. Otomatis, konsisten, dan siap diintegrasikan ke sistem manapun.*
