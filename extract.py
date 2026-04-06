#!/usr/bin/env python3
"""Extract 568 Bible commentary PDFs (scanned images) into markdown via OCR.

Uses pymupdf to render pages to images, then tesseract for OCR.
Parallelized across PDFs using multiprocessing.
"""

import io
import os
import sys
import time
from multiprocessing import Pool, cpu_count

import fitz  # pymupdf
import pytesseract
from PIL import Image

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
VAULT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault")
DPI = 200


def ocr_page(page) -> str:
    """Render a PDF page to image and OCR it."""
    pix = page.get_pixmap(dpi=DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return pytesseract.image_to_string(img)


def pdf_to_markdown(pdf_path: str) -> str:
    """Extract text from a scanned PDF using OCR."""
    doc = fitz.open(pdf_path)
    parts = []

    # First try direct text extraction
    has_text = False
    for page in doc:
        if page.get_text("text").strip():
            has_text = True
            break

    for page_num, page in enumerate(doc, 1):
        if has_text:
            text = page.get_text("text")
        else:
            text = ocr_page(page)

        if text.strip():
            parts.append(f"<!-- Page {page_num} -->\n\n{text}")

    doc.close()
    return "\n\n---\n\n".join(parts)


def get_vault_path(pdf_path: str) -> str:
    """Map a raw PDF path to its vault markdown path."""
    rel = os.path.relpath(pdf_path, RAW_DIR)
    parts = rel.split(os.sep)
    if parts[0] == "Commentaries":
        parts = parts[1:]
    parts[-1] = os.path.splitext(parts[-1])[0] + ".md"
    return os.path.join(VAULT_DIR, *parts)


def process_one(pdf_path: str) -> tuple[str, bool, str]:
    """Process a single PDF. Returns (relative_path, success, error_or_empty)."""
    rel = os.path.relpath(pdf_path, RAW_DIR)
    vault_path = get_vault_path(pdf_path)
    try:
        md_text = pdf_to_markdown(pdf_path)
        os.makedirs(os.path.dirname(vault_path), exist_ok=True)
        with open(vault_path, "w", encoding="utf-8") as f:
            f.write(md_text)
        return (rel, True, "")
    except Exception as e:
        return (rel, False, str(e))


def main():
    start = time.time()

    # Collect all PDFs
    pdfs = []
    for root, _, files in os.walk(RAW_DIR):
        for f in sorted(files):
            if f.lower().endswith(".pdf"):
                pdfs.append(os.path.join(root, f))
    pdfs.sort()

    total = len(pdfs)
    print(f"Found {total} PDFs to extract with OCR (DPI={DPI}).")
    print(f"Using {cpu_count()} workers.\n")

    successes = 0
    failures = []

    # Process in parallel
    with Pool(processes=cpu_count()) as pool:
        for i, (rel, ok, err) in enumerate(pool.imap_unordered(process_one, pdfs), 1):
            if ok:
                successes += 1
                if i % 10 == 0 or i == total:
                    elapsed = time.time() - start
                    rate = i / elapsed * 60
                    remaining = (total - i) / (i / elapsed)
                    print(f"  [{i}/{total}] {rate:.0f} files/min, ~{remaining/60:.0f}h remaining — {rel}")
            else:
                failures.append((rel, err))
                print(f"  [{i}/{total}] FAILED: {rel} — {err}", file=sys.stderr)

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"Done in {elapsed/3600:.1f}h ({elapsed:.0f}s)")
    print(f"  Extracted: {successes}/{total}")
    print(f"  Failed:    {len(failures)}/{total}")
    if failures:
        print("\nFailed files:")
        for path, err in failures:
            print(f"  - {path}: {err}")


if __name__ == "__main__":
    main()
