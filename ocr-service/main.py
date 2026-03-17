import os
import io
import re
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
from paddleocr import PaddleOCR

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR once at startup (Traditional Chinese + English)
ocr = PaddleOCR(use_angle_cls=True, lang="chinese_cht", use_gpu=False, show_log=False)


def pdf_to_images(pdf_bytes: bytes, dpi: int = 200):
    """Convert PDF pages to PIL images using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("png")
        images.append({"page": page_num + 1, "data": img_bytes})
    doc.close()
    return images


def run_ocr_on_image(img_bytes: bytes) -> str:
    """Run PaddleOCR on image bytes and return sorted text."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(img_bytes)
        tmp_path = tmp.name

    try:
        result = ocr.ocr(tmp_path, cls=True)
        if not result or not result[0]:
            return ""

        # Sort by Y position (top to bottom), then X (left to right)
        lines = []
        for line in result[0]:
            box, (text, confidence) = line
            # box is [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            y_center = (box[0][1] + box[2][1]) / 2
            x_center = (box[0][0] + box[2][0]) / 2
            lines.append((y_center, x_center, text))

        lines.sort(key=lambda l: (round(l[0] / 15) * 15, l[1]))
        return " ".join(t for _, _, t in lines)
    finally:
        os.unlink(tmp_path)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        images = pdf_to_images(pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF conversion failed: {str(e)}")

    pages = []
    for img in images:
        try:
            text = run_ocr_on_image(img["data"])
            pages.append({"page": img["page"], "text": text})
        except Exception as e:
            pages.append({"page": img["page"], "text": "", "error": str(e)})

    full_text = "\n".join(p["text"] for p in pages)
    return {"pages": pages, "full_text": full_text, "num_pages": len(pages)}
