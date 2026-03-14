---
name: docgen-generate
description: Generate professional PDF business documents (invoices, receipts) by calling the DocGen Engine API. Use this skill whenever the user wants to create an invoice, receipt, or any business document as a PDF — even if they say things like "buatkan invoice", "buat kwitansi", "generate faktur", "I need an invoice PDF", "create a receipt for my client", or "tolong bikin invoice buat klien". Also use this when the user provides raw data (a list of items, client name, amounts) and wants a formatted document out of it. If the user uploads a PDF or a DOCX template and wants to generate a document from it, use this skill too.
---


# DocGen Generate Skill

You are interacting with the **DocGen Engine** — a REST API that generates PDF business documents from templates and JSON data.

**Base URL**: `https://docgen-production-503d.up.railway.app`  
**API prefix**: `/api/v1`

## Your Job

Help the user generate a professional PDF document by:
1. Receiving raw data or extracting it from uploaded files
2. Calling the DocGen API to generate the PDF using a DOCX template
3. Saving the PDF to disk and confirming to the user

---

## Step 0: If the user uploads a PDF file

**Do NOT say the model can't read PDFs. Do NOT ask the user to paste data manually.**

Instead, immediately call the scan endpoint — the API will extract the data for you:

```
POST /api/v1/scan
Content-Type: multipart/form-data
```

- Field name: `file` — the uploaded PDF

The response returns `extracted` fields and `rawText`. Use the `extracted` fields to generate a new document in Step 2.

---

## Step 1: Using DOCX Templates

The DocGen Engine now exclusively uses DOCX files as templates and converts them to PDF.

### If the user provides a DOCX template:
1. Scan it first to see what fields it needs:
   ```bash
   curl -X POST -F "file=@template.docx" https://docgen-production-503d.up.railway.app/api/v1/docx/scan
   ```
2. This returns a JSON with a `fields` array containing all detected variables.
3. Ask the user for any missing data based on those fields.

### If the user does NOT provide a template:
Assume they want to use a standard invoice template. You will need to create a simple DOCX file locally with placeholder tags like `{{invoice_no}}`, `{{client_name}}`, `{{date}}`, and `{{total}}` to use as the template, or ask them to provide one.

---

## Step 2: Generate the PDF

To fill the DOCX template with data and get a PDF back, use the generate endpoint.

```bash
curl -X POST   -F "file=@template.docx"   -F "payload={\"client_name\":\"Budi\", \"total\":\"Rp 500.000\"}"   -F "options={\"filename\":\"Invoice_Budi\"}"   https://docgen-production-503d.up.railway.app/api/v1/docx/generate --output result.pdf
```

**Form Fields:**
- `file`: The DOCX template file (Required)
- `payload`: A JSON **string** containing the key-value pairs to inject into the `{{ }}` placeholders (Required)
- `options`: A JSON **string** containing optional settings (Optional)

**Available Options:**
```json
{
  "smartReplace": true, // Uses AI to replace text even if it doesn't have {{ }} tags
  "filename": "Custom_Name", // Sets the output filename
  "watermark": {
    "enabled": true,
    "text": "DRAFT",
    "color": "#FF0000"
  }
}
```

The response is a **raw binary PDF** — save it directly to disk (using `--output` in curl or `responseType: 'arraybuffer'` in axios), don't try to parse it as JSON.

---

## Step 3: Error handling

| HTTP code | Meaning | What to do |
|-----------|---------|------------|
| 400 | Validation error | Check if payload/options are valid JSON strings |
| 500 | Server error | Report error message to user |

If the server is not reachable, tell the user: "DocGen server tidak dapat dihubungi. Cek status deployment di https://railway.app atau coba lagi."

---

## Step 4: Confirm to the user

After saving the PDF, tell the user:
- File name and full path
- Confirmation that the PDF was generated successfully

Keep it short — one concise message is enough.

---

## What NOT to do

- Don't use the old `/api/v1/generate` HTML endpoint (it has been removed)
- Don't tell the user the model can't read PDFs — use `/api/v1/scan` instead
- Don't fail silently — always report errors clearly

---

## Reference

Full API documentation: see `references/api.md`
