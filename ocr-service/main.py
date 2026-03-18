import os
import re
import base64
import traceback
import httpx
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


# ─────────────────────────────────────────────────────────────
# PDF page → base64 PNG via PyMuPDF
# ─────────────────────────────────────────────────────────────
def pdf_page_to_base64(pdf_bytes: bytes, page_num: int, dpi: int = 200) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


# ─────────────────────────────────────────────────────────────
# Call Google Vision API → return full text
# ─────────────────────────────────────────────────────────────
async def google_vision_ocr(img_b64: str) -> str:
    if not GOOGLE_VISION_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_VISION_API_KEY 未設定，請在環境變數中加入")

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

    responses = resp.json().get("responses", [])
    if not responses:
        return ""
    return responses[0].get("fullTextAnnotation", {}).get("text", "")


# ─────────────────────────────────────────────────────────────
# Field parsers
# ─────────────────────────────────────────────────────────────
def parse_electricity_page(text: str, page_num: int, billing_period: str = None) -> dict:
    result = {
        "館別": "麗軒",
        "類型": "電費",
        "計費期間": billing_period,
        "地址": None,
        "電號": None,
        "使用度數": None,
        "電費金額": None,
        "應繳稅額": None,
        "應繳總金額": None,
        "_page": page_num,
    }

    # Edge case: no usage this period
    if "本期沒有" in text or "本期無用電" in text:
        result.update({"使用度數": "0", "電費金額": "0", "應繳稅額": "0", "應繳總金額": "0"})

    # 計費期間
    if not result["計費期間"]:
        m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
        result["計費期間"] = m.group(1).strip() if m else "未辨識"

    # 地址
    m = re.search(r'用電地址[：:]\s*(.+?)(?=\n|電號|$)', text, re.DOTALL)
    if not m:
        m = re.search(r'(?:裝設地址|地址)[：:]\s*(.+?)(?=\n|$)', text)
    result["地址"] = m.group(1).strip().replace("\n", " ") if m else "未辨識"

    # 電號 (format: DD-DD-DDDD-DD-D)
    m = re.search(r'(\d{2}-\d{2}-\d{4}-\d{2}-\d)', text)
    if not m:
        m = re.search(r'電號[：:\s]*([0-9\-]{8,20})', text)
    result["電號"] = m.group(1).strip() if m else "未辨識"

    # 使用度數
    if not result["使用度數"]:
        m = re.search(r'計費度數.*?(\d[\d,]+)', text, re.DOTALL)
        if not m:
            m = re.search(r'(?:使用度數|用電度數|本期用電)[：:\s]*(\d[\d,]+)', text)
        result["使用度數"] = m.group(1).replace(",", "") if m else "未辨識"

    # 電費金額 (稅前應繳總金額)
    if not result["電費金額"]:
        m = re.search(r'稅前應繳總金額\s+([\d,]+)', text)
        if not m:
            m = re.search(r'(?:流動電費|電費金額|本期電費)[：:\s]*([\d,]+)', text)
        result["電費金額"] = m.group(1).replace(",", "") if m else "未辨識"

    # 應繳稅額 (營業稅)
    if not result["應繳稅額"]:
        m = re.search(r'營業稅\s+([\d,]+)', text)
        if not m:
            m = re.search(r'(?:應繳稅額|稅額)[：:\s]*([\d,]+)', text)
        result["應繳稅額"] = m.group(1).replace(",", "") if m else "未辨識"

    # 應繳總金額
    if not result["應繳總金額"]:
        m = re.search(r'應繳總金額\s+([\d,]+)', text)
        if not m:
            m = re.search(r'(?:本期應繳|應繳電費|合計)[：:\s]*([\d,]+)', text)
        result["應繳總金額"] = m.group(1).replace(",", "") if m else "未辨識"

    # Fill remaining None
    for k in ["計費期間", "地址", "電號", "使用度數", "電費金額", "應繳稅額", "應繳總金額"]:
        if result[k] is None:
            result[k] = "未辨識"

    return result


def parse_water_page(text: str, page_num: int, billing_period: str = None) -> dict:
    result = {
        "館別": "麗軒",
        "類型": "水費",
        "計費期間": billing_period,
        "用水地址": None,
        "水號": None,
        "用水量": None,
        "基本費": None,
        "水費": None,
        "營業稅": None,
        "其他費用": None,
        "總金額": None,
        "_page": page_num,
    }

    if not result["計費期間"]:
        m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
        result["計費期間"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:水號|用戶編號)[：:\s]*([0-9\-]{6,15})', text)
    result["水號"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:用水地址|地址)[：:]\s*(.+?)(?=\n|$)', text)
    result["用水地址"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:用水量|本期用水)[：:\s]*(\d[\d,]+)', text)
    result["用水量"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'基本費[：:\s]*([\d,]+)', text)
    result["基本費"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'(?:^|\s)水費[：:\s]*([\d,]+)', text, re.MULTILINE)
    result["水費"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'營業稅[：:\s]*([\d,]+)', text)
    result["營業稅"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'(?:本期應繳|總金額|合計)[：:\s]*([\d,]+)', text)
    result["總金額"] = m.group(1).replace(",", "") if m else "未辨識"

    return result


# ─────────────────────────────────────────────────────────────
# Step 8: Validate electricity bill totals
# ─────────────────────────────────────────────────────────────
EXPECTED_TOTALS = {
    "使用度數": 38390,
    "電費金額": 159555,
    "應繳稅額": 7978,
    "應繳總金額": 167533,
}


def safe_int(v) -> int:
    try:
        return int(str(v).replace(",", "").strip())
    except Exception:
        return 0


def validate_totals(records: list) -> dict:
    computed = {k: sum(safe_int(r.get(k)) for r in records) for k in EXPECTED_TOTALS}
    passed = all(computed[k] == EXPECTED_TOTALS[k] for k in EXPECTED_TOTALS)
    return {"computed": computed, "expected": EXPECTED_TOTALS, "passed": passed}


# ─────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────
# Main OCR endpoint — processes ALL pages
# ─────────────────────────────────────────────────────────────
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF open failed: {str(e)}")

    records = []
    billing_period = None

    try:
        for page_idx in range(num_pages):
            img_b64 = pdf_page_to_base64(pdf_bytes, page_idx)
            text = await google_vision_ocr(img_b64)

            # Detect billing period from first page
            if page_idx == 0 and not billing_period:
                m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
                if m:
                    billing_period = m.group(1).strip()

            if bill_type == "電費":
                rec = parse_electricity_page(text, page_idx + 1, billing_period)
            else:
                rec = parse_water_page(text, page_idx + 1, billing_period)

            records.append(rec)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    # Clean internal fields
    clean_records = [{k: v for k, v in r.items() if not k.startswith("_")} for r in records]

    # Validate totals (electricity only)
    validation = validate_totals(clean_records) if bill_type == "電費" else {}

    # Backward-compat: first record as single parsed object
    first = clean_records[0] if clean_records else {}

    return {
        "records": clean_records,
        "parsed": first,
        "raw": "",
        "num_pages": num_pages,
        "count": len(clean_records),
        "validation": validation,
    }
