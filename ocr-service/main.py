import io
import re
import json
import traceback
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
from pdf2image import convert_from_bytes
from PIL import Image
import pytesseract
import cv2

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TESSERACT_LANG = "chi_tra+eng"
TESSERACT_CONFIG = "--psm 6 --oem 3"

# ─────────────────────────────────────────────────────────────
# Step 2: Detect PDF type
# ─────────────────────────────────────────────────────────────
def has_selectable_text(page) -> bool:
    text = page.extract_text() or ""
    return len(text.strip()) > 20


# ─────────────────────────────────────────────────────────────
# Step 3: Image Preprocessing (for scanned pages)
# ─────────────────────────────────────────────────────────────
def preprocess_image(pil_image: Image.Image) -> Image.Image:
    img = np.array(pil_image.convert("RGB"))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return Image.fromarray(thresh)


def ocr_image(pil_image: Image.Image) -> str:
    processed = preprocess_image(pil_image)
    return pytesseract.image_to_string(processed, lang=TESSERACT_LANG, config=TESSERACT_CONFIG)


# ─────────────────────────────────────────────────────────────
# Step 2+3: Get text from page (auto-detect text vs scanned)
# ─────────────────────────────────────────────────────────────
def get_page_text(page, pdf_bytes: bytes, page_idx: int) -> str:
    if has_selectable_text(page):
        return page.extract_text() or ""
    # Scanned: convert to image → preprocess → OCR
    images = convert_from_bytes(pdf_bytes, dpi=200, first_page=page_idx + 1, last_page=page_idx + 1)
    if images:
        return ocr_image(images[0])
    return ""


# ─────────────────────────────────────────────────────────────
# Step 4+5: Parse individual Taiwan Power bill page
# ─────────────────────────────────────────────────────────────
def parse_electricity_bill_page(text: str, page_num: int, billing_period: str = None) -> dict:
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

    # Step 6: Edge case — "本期沒有" → zero amounts
    if "本期沒有" in text or "本期無用電" in text:
        result.update({
            "使用度數": "0",
            "電費金額": "0",
            "應繳稅額": "0",
            "應繳總金額": "0",
        })

    # 計費期間 (e.g. 113年04月)
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

    # 使用度數 / 計費度數
    m = re.search(r'計費度數.*?(\d[\d,]+)', text, re.DOTALL)
    if not m:
        m = re.search(r'(?:使用度數|用電度數|本期用電)[：:\s]*(\d[\d,]+)', text)
    if m and not result.get("使用度數"):
        result["使用度數"] = m.group(1).replace(",", "").strip()

    # 電費金額 (稅前應繳總金額)
    m = re.search(r'稅前應繳總金額\s+([\d,]+)', text)
    if not m:
        m = re.search(r'(?:流動電費|電費金額|本期電費)[：:\s]*([\d,]+)', text)
    if m and not result.get("電費金額"):
        result["電費金額"] = m.group(1).replace(",", "").strip()

    # 應繳稅額 (營業稅)
    m = re.search(r'營業稅\s+([\d,]+)', text)
    if not m:
        m = re.search(r'(?:應繳稅額|稅額)[：:\s]*([\d,]+)', text)
    if m and not result.get("應繳稅額"):
        result["應繳稅額"] = m.group(1).replace(",", "").strip()

    # 應繳總金額
    m = re.search(r'應繳總金額\s+([\d,]+)', text)
    if not m:
        m = re.search(r'(?:本期應繳|應繳電費|合計)[：:\s]*([\d,]+)', text)
    if m and not result.get("應繳總金額"):
        result["應繳總金額"] = m.group(1).replace(",", "").strip()

    # Fallback: fill remaining None fields with "未辨識"
    for key in ["計費期間", "地址", "電號", "使用度數", "電費金額", "應繳稅額", "應繳總金額"]:
        if result[key] is None:
            result[key] = "未辨識"

    return result


# ─────────────────────────────────────────────────────────────
# Step 4: Page 1 — summary table extraction
# ─────────────────────────────────────────────────────────────
def parse_summary_table(page, billing_period: str = None) -> list:
    results = []
    tables = page.extract_tables()
    for table in tables:
        for row in table:
            if not row or not any(row):
                continue
            cleaned = [str(c).strip().replace(",", "") if c else "" for c in row]
            row_text = " ".join(cleaned)
            # Skip header rows
            if any(h in row_text for h in ["地址", "電號", "度數", "金額", "稅額", "總計", "合計"]):
                continue
            # Need at least 6 columns with numeric data
            nums = [c for c in cleaned if re.match(r'^\d+$', c)]
            if len(cleaned) >= 6 and len(nums) >= 2:
                results.append({
                    "館別": "麗軒",
                    "類型": "電費",
                    "計費期間": billing_period or "未辨識",
                    "地址": cleaned[0] if cleaned[0] else "未辨識",
                    "電號": cleaned[1] if cleaned[1] else "未辨識",
                    "使用度數": cleaned[2] if cleaned[2] else "0",
                    "電費金額": cleaned[3] if cleaned[3] else "0",
                    "應繳稅額": cleaned[4] if cleaned[4] else "0",
                    "應繳總金額": cleaned[5] if cleaned[5] else "0",
                })
    return results


# ─────────────────────────────────────────────────────────────
# Step 5: Parse water bill page
# ─────────────────────────────────────────────────────────────
def parse_water_bill_page(text: str, page_num: int, billing_period: str = None) -> dict:
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
# Step 8: Validate totals (electricity only)
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
    computed = {
        "使用度數": sum(safe_int(r.get("使用度數")) for r in records),
        "電費金額": sum(safe_int(r.get("電費金額")) for r in records),
        "應繳稅額": sum(safe_int(r.get("應繳稅額")) for r in records),
        "應繳總金額": sum(safe_int(r.get("應繳總金額")) for r in records),
    }
    passed = all(computed[k] == EXPECTED_TOTALS[k] for k in EXPECTED_TOTALS)
    return {
        "computed": computed,
        "expected": EXPECTED_TOTALS,
        "passed": passed,
    }


# ─────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────
# Main OCR endpoint
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
        records = []
        billing_period = None

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            num_pages = len(pdf.pages)

            # Step 4: Page routing
            for page_idx, pg in enumerate(pdf.pages):

                # Step 1+2: Get text (selectable or OCR)
                text = get_page_text(pg, pdf_bytes, page_idx)

                # Detect billing period from first page text
                if page_idx == 0 and not billing_period:
                    m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
                    if m:
                        billing_period = m.group(1).strip()

                if page_idx == 0:
                    # Try summary table first
                    table_records = parse_summary_table(pg, billing_period)
                    if table_records:
                        records.extend(table_records)
                        continue
                    # Fallback: parse as individual bill
                    if bill_type == "電費":
                        records.append(parse_electricity_bill_page(text, page_idx + 1, billing_period))
                    else:
                        records.append(parse_water_bill_page(text, page_idx + 1, billing_period))
                else:
                    # Pages 2+: individual bills
                    if bill_type == "電費":
                        records.append(parse_electricity_bill_page(text, page_idx + 1, billing_period))
                    else:
                        records.append(parse_water_bill_page(text, page_idx + 1, billing_period))

        # Step 9: Clean internal fields
        clean_records = [{k: v for k, v in r.items() if not k.startswith("_")} for r in records]

        # Step 8: Validate totals (electricity only)
        validation = validate_totals(clean_records) if bill_type == "電費" else {}

        # Backward-compat: single parsed object = first record
        first = clean_records[0] if clean_records else {}

        return {
            "records": clean_records,
            "parsed": first,
            "raw": "",
            "num_pages": num_pages,
            "count": len(clean_records),
            "validation": validation,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")
