import os
import base64
import re
import json
import traceback
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


def pdf_page_to_base64(pdf_bytes: bytes, page_num: int = 0, dpi: int = 150) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


async def call_google_vision(img_b64: str) -> str:
    if not GOOGLE_VISION_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_VISION_API_KEY 未設定")

    payload = {
        "requests": [{
            "image": {"content": img_b64},
            "features": [{"type": "DOCUMENT_TEXT_DETECTION"}]
        }]
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{GOOGLE_VISION_URL}?key={GOOGLE_VISION_API_KEY}",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()

    responses = result.get("responses", [])
    if not responses:
        return ""
    annotation = responses[0].get("fullTextAnnotation", {})
    return annotation.get("text", "")


def parse_electricity_bill(text: str) -> dict:
    parsed = {
        "地址": None,
        "電號": None,
        "使用度數": None,
        "電費金額": None,
        "應繳稅額": None,
        "應繳總金額": None,
        "計費期間": None,
    }

    # 電號 / 用戶編號 (8-12 digits)
    m = re.search(r'電號[：:\s]*([0-9\-]{6,15})', text)
    if not m:
        m = re.search(r'用戶編號[：:\s]*([0-9\-]{6,15})', text)
    if m:
        parsed["電號"] = m.group(1).strip()

    # 計費期間 (ROC date e.g. 113年04月)
    m = re.search(r'(\d{2,3}年\d{1,2}月(?:\d{1,2}日)?(?:\s*[至~到]\s*\d{2,3}年\d{1,2}月\d{1,2}日)?)', text)
    if m:
        parsed["計費期間"] = m.group(1).strip()

    # 地址
    m = re.search(r'(?:用電地址|裝設地址|地址)[：:\s]*([^\n]{5,50})', text)
    if m:
        parsed["地址"] = m.group(1).strip()

    # 使用度數
    m = re.search(r'(?:本期用電|使用度數|用電度數)[：:\s]*([0-9,]+)\s*度?', text)
    if not m:
        m = re.search(r'([0-9,]+)\s*度\b', text)
    if m:
        parsed["使用度數"] = m.group(1).replace(",", "").strip()

    # 應繳總金額 (search for total first)
    m = re.search(r'(?:本期應繳|應繳電費|應繳總金額|合計)[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["應繳總金額"] = m.group(1).replace(",", "").strip()

    # 電費金額 / 流動電費
    m = re.search(r'(?:流動電費|電費金額|本期電費)[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["電費金額"] = m.group(1).replace(",", "").strip()

    # 營業稅 / 應繳稅額
    m = re.search(r'(?:營業稅|稅額|應繳稅額)[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["應繳稅額"] = m.group(1).replace(",", "").strip()

    return parsed


def parse_water_bill(text: str) -> dict:
    parsed = {
        "用水地址": None,
        "水號": None,
        "用水量": None,
        "基本費": None,
        "水費": None,
        "營業稅": None,
        "其他費用": None,
        "總金額": None,
        "計費期間": None,
    }

    m = re.search(r'(?:水號|用戶編號)[：:\s]*([0-9\-]{6,15})', text)
    if m:
        parsed["水號"] = m.group(1).strip()

    m = re.search(r'(\d{2,3}年\d{1,2}月(?:\d{1,2}日)?)', text)
    if m:
        parsed["計費期間"] = m.group(1).strip()

    m = re.search(r'(?:用水地址|地址)[：:\s]*([^\n]{5,50})', text)
    if m:
        parsed["用水地址"] = m.group(1).strip()

    m = re.search(r'(?:用水量|本期用水)[：:\s]*([0-9,]+)', text)
    if m:
        parsed["用水量"] = m.group(1).replace(",", "").strip()

    m = re.search(r'基本費[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["基本費"] = m.group(1).replace(",", "").strip()

    m = re.search(r'(?:^|\s)水費[：:\s]*\$?\s*([0-9,]+)', text, re.MULTILINE)
    if m:
        parsed["水費"] = m.group(1).replace(",", "").strip()

    m = re.search(r'營業稅[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["營業稅"] = m.group(1).replace(",", "").strip()

    m = re.search(r'(?:本期應繳|總金額|合計)[：:\s]*\$?\s*([0-9,]+)', text)
    if m:
        parsed["總金額"] = m.group(1).replace(",", "").strip()

    return parsed


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    bill_type: str = Query(default="電費"),
    page: int = Query(default=0),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        num_pages = len(doc)
        doc.close()
        target_page = min(page, num_pages - 1)
        img_b64 = pdf_page_to_base64(pdf_bytes, target_page)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF conversion failed: {str(e)}")

    try:
        raw_text = await call_google_vision(img_b64)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Google Vision API 呼叫失敗: {str(e)}")

    if bill_type == "水費":
        parsed = parse_water_bill(raw_text)
    else:
        parsed = parse_electricity_bill(raw_text)

    return {
        "raw": raw_text,
        "parsed": parsed,
        "num_pages": num_pages,
        "page_used": target_page + 1,
    }
